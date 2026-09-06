// Service worker for the Ninth House desk.
//
// desk.html was once cached stale-while-revalidate: served instantly from
// whatever was in the cache, refetched in the background only afterward. On
// a device that stayed on an old copy, that old copy kept calling endpoints
// a later deploy had already removed, and login broke, silently, with
// nothing on screen to say why. That is fixed here structurally, not by
// raising a version number: desk.html and the admin API are never read from
// the cache while the network can be asked at all. The network is tried
// first, every time; the cache only ever answers when that attempt fails
// outright, as a genuine offline fallback, never as a way to skip asking.
//
// Static assets, the manifest and the icons, are cached too, but keyed by a
// hash of their own bytes rather than by their path. A changed file is a
// different cache entry on its own, so it does not depend on anyone
// remembering to bump VERSION when an icon changes.
//
// This file also takes over as fast as it can: skipWaiting on install,
// clients.claim on activate, so a new deploy does not wait for every open
// tab to close first. desk.html is the other half of that: it checks for a
// newer version of this file on every launch and every time it regains
// focus, and reloads itself once a new one has taken over.

const VERSION = 'nh-desk-v19';
const RUNTIME = `${VERSION}-runtime`;

// Cached by content hash below, not cached-first by path. Never desk.html,
// never anything under /api or /social: see the fetch handler.
//
// The icon paths carry a -v2 suffix because content hashing alone was not
// enough to get a corrected icon onto a phone: the file that actually
// controls what iOS shows on the home screen is fetched by Safari's own
// touch icon loader, outside this service worker and its own cache
// entirely, and that loader kept the old bytes for the old path regardless
// of anything done here or in Safari's site data. A path nothing has ever
// fetched before has nothing cached anywhere to be stale.
const STATIC_ASSET_PATHS = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192-v2.png',
  '/icons/icon-512-v2.png',
  '/icons/icon-180-v2.png',
  '/icons/icon-192-v2-maskable.png'
];

self.addEventListener('install', (event) => {
  // Nothing to pre-warm: desk.html is never written to the cache ahead of
  // time, only ever as a byproduct of a real network fetch succeeding (see
  // networkFirst below), and static assets are fetched and hashed lazily,
  // on first request. Skipping straight to activating is what lets a tab
  // that is already open pick up this version without waiting to be closed.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Every cache that is not this exact version's, including a SHELL or
    // RUNTIME cache any earlier build of this file left behind, is a
    // previous deploy's leftovers. Deleting all of them, unconditionally,
    // on every activation, is what lets a device already stuck on a stale
    // desk.html recover the moment this version takes over, with no
    // reinstall and nothing for the owner to clear by hand.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// The page asks for this after it has told the owner an update is waiting.
// Kept even though install already calls skipWaiting on its own, since a
// future version of this file may reintroduce a waiting step and this is
// the one line that would need to still be here for it to work.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isApiRequest(url) {
  // desk.html calls the Worker directly on its own workers.dev address (see
  // ENGINE_BASE there), so that is excluded by name here, explicitly. The
  // /api/* path is excluded too, on the chance anything still reaches this
  // Worker through the 9thpoint.com Route directly (curl, a bookmark),
  // rather than relying on it simply not matching a same origin path below.
  if (url.hostname.endsWith('.workers.dev')) return true;
  if (url.pathname === '/social' || url.pathname.startsWith('/social/')) return true;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return true;
  return false;
}

function isStaticAsset(url) {
  return url.origin === self.location.origin && STATIC_ASSET_PATHS.includes(url.pathname);
}

function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The network is asked every single time, with no HTTP cache in between
// either (cache: 'no-store'); the Cache Storage entry is only ever read in
// the catch block, when fetch itself failed, which on a phone means
// offline. A successful fetch is never served from what is stored, and the
// stored copy is refreshed every time a real fetch succeeds, so the offline
// fallback stays as current as this device's own last real visit, never
// older than that.
async function networkFirst(request, cacheKey) {
  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    if (fresh && fresh.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(cacheKey, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (e) {
    const cached = await caches.match(cacheKey);
    if (cached) return cached;
    throw e;
  }
}

// Static assets, keyed by a hash of their own bytes rather than by path, so
// a file changing is a cache miss on its own and needs no version bump to
// be noticed. Still asks the network first, every time; the hash only ever
// decides where the answer is stored and read back from, never whether the
// network gets asked.
async function contentHashed(request, url) {
  const cache = await caches.open(RUNTIME);
  // Origin plus path, not path alone: fonts.googleapis.com and
  // fonts.gstatic.com are both handled here, and a bare path would let two
  // different hosts collide in one shared cache.
  const identity = url.origin + url.pathname;
  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    if (!fresh.ok) throw new Error('bad response: ' + fresh.status);
    const buffer = await fresh.clone().arrayBuffer();
    const hash = await sha256Hex(buffer);
    const key = new Request('https://sw-cache-key.invalid/?id=' + encodeURIComponent(identity) + '&h=' + hash);
    if (!(await cache.match(key))) cache.put(key, fresh.clone()).catch(() => {});
    return fresh;
  } catch (e) {
    // Offline, or the fetch failed outright: the most recent hash this
    // device actually has for this exact origin and path is the only
    // fallback there is, found by that identity since the hash of what
    // would have come back now is exactly what is not known here.
    const keys = await cache.keys();
    const prefix = 'https://sw-cache-key.invalid/?id=' + encodeURIComponent(identity) + '&h=';
    const match = keys.find((k) => k.url.startsWith(prefix));
    if (match) return cache.match(match);
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }

  // The admin API, including auth. Never cached, never intercepted, in
  // either direction: an approval must reach the engine or fail loudly, a
  // stale queue would show posts that already went, and a cached session
  // check could tell the app it is still signed in when the token expired.
  if (isApiRequest(url)) return;

  // desk.html itself, on a navigation or a direct fetch (the installed
  // PWA's start_url is /desk.html?source=pwa; the query string does not
  // change url.pathname). This is the file that broke: served from the
  // cache first once, it kept calling endpoints a later deploy had already
  // removed. Network first, every time; the cached copy is a fallback for
  // offline only, and only ever holds what was really served the last time
  // the network actually answered. Matched by path, not by navigate mode
  // alone, so a navigation to some other same-origin page (the public site)
  // is left alone rather than handed desk.html.
  if (url.origin === self.location.origin && url.pathname === '/desk.html') {
    event.respondWith(networkFirst(new Request('/desk.html', { cache: 'no-store' }), '/desk.html'));
    return;
  }

  if (isStaticAsset(url) || isFont(url)) {
    event.respondWith(contentHashed(request, url));
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
    icon: '/icons/icon-192-v2.png',
    badge: '/icons/icon-192-v2-maskable.png',
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
