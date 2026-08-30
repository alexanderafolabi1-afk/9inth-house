// Service worker for the Ninth House desk.
//
// Two jobs. It caches the admin shell so the app opens instantly from the home
// screen, including with no signal, and it receives the morning push so the owner
// is told the batch is waiting without opening anything.
//
// It deliberately keeps its hands off everything else. The public site at / is not
// this app, and the admin API is never cached: a cached approval or a cached queue
// would be worse than no cache at all.

const VERSION = 'nh-desk-v10';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

// The shell. Everything here is same origin and safe to serve stale, because the
// app fetches its actual data from the engine at runtime.
const SHELL_ASSETS = [
  '/desk.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/icons/icon-192-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Added one at a time rather than with addAll, so one missing file cannot fail
    // the whole install and leave the app with no offline shell at all.
    await Promise.all(SHELL_ASSETS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        // Nothing to do about it here, and it must not stop the install.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// The page asks for this after it has told the owner an update is waiting.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isShellRequest(url) {
  return SHELL_ASSETS.includes(url.pathname) || url.pathname === '/desk.html';
}

function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

// The admin page itself, which is the one thing here that changes often.
//
// Cache first was wrong for it, and cost a deploy that reached the Worker and
// then appeared to have done nothing. The update path in desk.html only fires
// when THIS file's bytes differ, so a change to desk.html alone left the old
// page being served with nothing to notice it: the panel that had just been
// added was in the deployed page and absent from the screen. Remembering to
// bump VERSION on every desk.html change is not a mechanism, it is a thing to
// forget once.
//
// Network first closes it. A deploy is picked up on the next open whether or
// not this file changed, and the cache is still there for a bad connection or
// no connection at all. The wait is bounded so a slow network cannot leave the
// app hanging on a blank screen when a perfectly good copy is already held:
// after the timeout the cached page is served, and the network copy still
// lands in the cache for next time.
async function networkFirst(request, cacheName, timeoutMs = 2500) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const fresh = await Promise.race([network, timeout]);
  if (fresh && fresh.ok) return fresh;

  const cached = await cache.match(request);
  if (cached) return cached;

  // Nothing cached and the race gave up. Wait out the real request rather than
  // failing on a slow connection with nothing to fall back on.
  const eventual = await network;
  if (eventual) return eventual;
  throw new Error('offline and nothing cached');
}

// Serve what is cached at once, then refresh it in the background. The shell opens
// instantly and still updates itself on the next open.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;
  throw new Error('offline and nothing cached');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }

  // The admin API, including auth. Never cached, never intercepted: an approval
  // must reach the engine or fail loudly, a stale queue would show posts that
  // already went, and a cached session check could tell the app it is still
  // signed in when the cookie has expired. desk.html now calls the Worker on
  // its own workers.dev address (see ENGINE_BASE there) rather than this
  // origin's /api/*, so that is excluded by name too, explicitly, rather
  // than relying on it simply not matching a same-origin path below.
  if (url.hostname.endsWith('.workers.dev')) return;
  if (url.pathname === '/social' || url.pathname.startsWith('/social/')) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  // A navigation to the admin. Network first, so a deploy is never a load
  // behind, with the cache underneath it for a bad connection or none.
  if (request.mode === 'navigate' && isShellRequest(url) && url.origin === self.location.origin) {
    event.respondWith(
      networkFirst(new Request('/desk.html', { cache: 'no-store' }), SHELL)
        .catch(() => caches.match('/desk.html'))
    );
    return;
  }

  // The page itself, however it is asked for, gets the same treatment for the
  // same reason. Everything else in the shell is an icon or a manifest that
  // changes about never, so those stay cache first and keep opening instantly.
  if (url.origin === self.location.origin && url.pathname === '/desk.html') {
    event.respondWith(networkFirst(request, SHELL));
    return;
  }

  if (url.origin === self.location.origin && isShellRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, SHELL));
    return;
  }

  if (isFont(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME));
    return;
  }

  // Everything else, including the public site, is left entirely alone.
});

/* ---------- the morning notification ---------- */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Ninth House', body: event.data ? event.data.text() : 'The queue has something waiting.' };
  }

  const title = data.title || 'Ninth House';
  const options = {
    body: data.body || 'The queue has something waiting.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192-maskable.png',
    // One tag, so a second notification replaces the first rather than stacking a
    // pile of them on the lock screen.
    tag: data.tag || 'nh-queue',
    renotify: true,
    data: { url: data.url || '/desk.html#queue' },
    actions: [{ action: 'open-queue', title: 'Open the queue' }]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/desk.html#queue';

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse a window that is already open rather than piling up new ones.
    for (const client of clientList) {
      if (client.url.includes('/desk.html')) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
