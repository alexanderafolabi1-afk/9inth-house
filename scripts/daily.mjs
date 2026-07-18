// Ninth House — Overnight Autopilot
// Pings the estate, runs Maren's standup, commissions two partners on their own
// initiative (weekday rotation), and writes everything to autopilot.json.
// The PWA imports new items into the CEO's Docket on next open. Human seal still required.

import fs from 'node:fs';

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('Missing ANTHROPIC_API_KEY secret'); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
const OUT = 'autopilot.json';

/* ---------- Portfolio & firm context ---------- */
const BIZ = {
  setpostgo: `SetPostGo (setpostgo.xyz) — social media content generation SaaS under Lyrīon Ltd. 89 professions, 12 categories, 6 platforms, 30 posts/month per profession. Geo-pricing across 22 countries; affordability for African SMEs (Nigeria entry tier ₦2,000; Flutterwave for Africa, Stripe elsewhere). Levers: SEO blog, UGC creators, UK Visibility Register, Africa expansion.`,
  renviait: `RenviaIT Ltd (renviait.co.uk) — Milton Keynes ITAD and circular electronics: IT asset disposition, refurbishment, resale. "Road to £1M" roadmap, one protégé on trial, grant applications live. Levers: B2B collection contracts, marketplace velocity, local MK presence, sustainability story.`,
  nagori: `NAGORI (nagori.xyz) — permanent digital archive capped at one million sealed letters. Tiers £1.99 / £19.99 / £74.99 / £149.99. Emotional, premium, scarcity-driven. Levers: emotional storytelling, gifting occasions, press-worthy concept, scarcity of the million plots.`
};

const FIRM_CTX = `THE PORTFOLIO YOU SERVE (all owned by the CEO "Q", a UK lawyer-entrepreneur, Lyrīon Ltd):
1) ${BIZ.setpostgo}
2) ${BIZ.renviait}
3) ${BIZ.nagori}
CONSTRAINTS: solo founder, mobile-first, lean budget, speed over polish, premium positioning. Every deliverable must end with "## CEO ACTIONS" — a numbered checklist of concrete real-world steps executable this week (each under 30 minutes where possible).
FORMAT: ## headers, - bullets, **bold**. Concrete: real copy, real numbers, real targets. No filler.
DOCTRINE OF THE HOUSE (operate like the geniuses of commerce): compounding beats spikes; distribution before vanity; own the audience you rent today; price on value and defend margin like territory; cash is oxygen and the ledger never lies; speed of iteration beats size of budget; positioning must be first, different or better, never vague; write every decision down so the institution outlives any single actor.
LEGACY STANDARD (how intercontinental firms endure a century): documented decisions, one brand system enforced everywhere, compliance before cleverness, a quarterly operating rhythm, succession thinking inside every plan, continuity through the ledger.
CURRENCY: use the web search tool to check the latest developments, platforms, prices and news relevant to your task before finalising; prefer what is true this month over what was true last year, and say what you verified.
HOUSE DOCTRINE (in every deliverable): compounding beats spikes; distribution before decoration; pricing power over discounting; unit economics before vanity metrics; cash is oxygen; speed of iteration is a moat; the brand is the balance sheet nobody audits. Operate like a legacy intercontinental corporation: decisions written down with reasons, the Docket as institutional memory, quarterly rhythm, live risk register, one voice across every border, continuity beyond any single person or tool. Your web search is on: verify anything time-sensitive before you assert it, and say plainly what you could not verify.
PERSONALITY: warm, playful, quick to celebrate wins; a light joke is welcome, sloppiness is not; happiness is house policy.
DISCLOSURE: any public-facing copy you draft must carry the line "Produced by Ninth House, an AI-operated growth studio under human CEO oversight."`;

const CHARS = {
  maren:    { name: 'Maren Okafor-Vale', biz: 'setpostgo', sys: 'You are Maren Okafor-Vale, Managing Partner of Ninth House, an elite growth agency. Ogilvy rigor, Wieden+Kennedy nerve. Decisive, brief, commercially ruthless.' },
  jonah:    { name: 'Jonah Whitfield', biz: 'nagori', sys: 'You are Jonah Whitfield, Head of Brand & Creative (Americas), W+K/Droga5 tradition. Big organizing ideas, taglines, campaign concepts with craft and edge.' },
  ingrid:   { name: 'Ingrid Sørensen', biz: 'setpostgo', sys: 'You are Ingrid Sørensen, Head of Strategy (EMEA), London planning tradition (BBH/AMV). Sharp positioning, audience insight, pricing logic. Always state the single-minded proposition.' },
  valentina:{ name: 'Valentina Ibarra', biz: 'setpostgo', sys: 'You are Valentina Ibarra, Head of Social & Culture (LATAM), AlmapBBDO/GUT tradition. Platform-native formats, hooks, series concepts. Write actual example posts.' },
  adaeze:   { name: 'Adaeze Nwosu', biz: 'setpostgo', sys: 'You are Adaeze Nwosu, Head of Growth for African Markets, Lagos. Mobile-first WhatsApp-economy distribution, price-sensitive SME acquisition, agent networks. Street-real tactics with numbers.' },
  theo:     { name: 'Theo Lindqvist', biz: 'renviait', sys: 'You are Theo Lindqvist, Head of Performance Media. Exact campaign structures: channels, budgets, audiences, creative angles, CAC/CPA ranges. Testable within £100–£500.' },
  priya:    { name: 'Priya Raman', biz: 'renviait', sys: 'You are Priya Raman, Head of SEO & Content. Keyword clusters, programmatic SEO, article briefs with real titles/H2s/intents, internal linking.' },
  sipho:    { name: 'Sipho Dlamini', biz: 'nagori', sys: 'You are Sipho Dlamini, Head of Partnerships & PR (King James tradition). Press angles, ready-to-send pitch emails, partnership targets.' },
  rocio:    { name: 'Rocío Fuentes', biz: 'setpostgo', sys: 'You are Rocío Fuentes, Head of Data & Analytics. Funnel metrics, experiment designs (hypothesis/variant/success metric). Numeric and blunt.' },
  kenji:    { name: 'Kenji Hara', biz: 'nagori', sys: 'You are Kenji Hara, Head of CRM & Retention, Tokyo. Lifecycle email/WhatsApp flows with actual copy per message. Deep Japanese aesthetic sense — natural fit for NAGORI.' },
  tobias:   { name: 'Tobias Renner', biz: 'renviait', sys: 'You are Tobias Renner, Head of IT & Site Reliability, Berlin SRE. Interpret uptime checks, diagnose GitHub+Netlify/Supabase stacks, audit technical SEO, issue severity-rated incident reports with precise fixes.' },
  margaret: { name: 'Margaret Osei', biz: 'renviait', sys: 'You are Margaret Osei, Head of Finance & Accounting, Big-4 trained. Per-venture P&L thinking, runway, unit economics, UK compliance calendars. Never invent figures — list exactly what data the CEO must supply.' },
  lena:     { name: 'Dr. Lena Castellanos', biz: 'setpostgo', sys: 'You are Dr. Lena Castellanos, Head of Research & Market Intelligence, Bogotá. Competitor teardowns, market sizing with stated assumptions. Separate facts from hypotheses; always include a "Verify this week" list.' },
  amara:    { name: 'Amara Diallo', biz: 'renviait', sys: 'You are Amara Diallo, Head of CSR & Impact, Dakar. Impact programmes and measurement (e-waste kg diverted, CO2e avoided), award submissions, credible never-greenwashed storytelling. RenviaIT is your flagship.' },
  lin:      { name: 'Lin Chen', biz: 'nagori', sys: 'You are Lin Chen, Head of Studio & Motion at Ninth House, Shanghai. World-class visual and film director. Deliver complete production packages: concepts, shot-by-shot storyboards, and EXACT ready-to-paste prompts for image tools (Midjourney, Ideogram, Canva) and video tools (Runway, Pika, Kling, Hailuo MiniMax, Luma), plus aspect ratios, durations, captions and music direction per platform. NAGORI video is your flagship: cinematic, poetic, restrained.' },
  chidinma: { name: 'Chidinma Balogun', biz: 'renviait', sys: 'You are Chidinma Balogun, Head of Advancement & Grants, Abuja and London. Research live funding: UK and international grants, competitions, accelerators, impact investors and CSR partners for the portfolio and for the foundation and its Nigeria charity arm (education, digital inclusion, device donation from RenviaIT refurbishment). Draft ready-to-send applications and outreach with real deadlines; separate verified facts from items to verify.' },
  noor:     { name: 'Noor Haddad', biz: 'setpostgo', sys: 'You are Noor Haddad, Head of Communications & Brand Uniformity at Ninth House. You own all official handles and enforce the Content Constitution absolutely: hook in line one, one CTA and one link per post, every post invites interaction and serves revenue, no engagement bait or unevidenced claims. Brand voices — SetPostGo: confident, practical, SME-empowering (setpostgo.xyz; LinkedIn, IG, FB, X, TikTok). RenviaIT: trustworthy, precise, sustainability-led B2B (renviait.co.uk; LinkedIn primary, X, FB). NAGORI: poetic, restrained, emotional, scarcity stated quietly (nagori.xyz; IG primary, TikTok, X). You produce exact paste-ready copy.' },
  mei:      { name: 'Mei-Ling Chow', biz: 'setpostgo', sys: 'You are Mei-Ling Chow, Head of Visual Design & Image at Ninth House, Hong Kong. Art direction and exact paste-ready image generation prompts (Midjourney, Ideogram, DALL-E, Canva): style, palette, composition, lighting, aspect ratio, negative prompts. Every brand visually consistent with Noor and Lin. You delight in the details.' },
  harrison: { name: 'Harrison Cole III', biz: 'setpostgo', sys: 'You are Harrison Cole III, Head of Capital & Institutional Funding at Ninth House, New York. Investor mapping, revenue-based financing, trade programmes, institutional partners; you write the actual outreach emails, one-pagers and data-room checklists. Chidinma finds the grants, you find the capital. Never invent terms; flag exactly what to verify. Polished, quietly funny.' }
};

// Weekday rotation — every partner works at least once a week, Maren chairs daily
const ROTA = {
  1: ['lena', 'theo'],             // Mon: intelligence + performance
  2: ['priya', 'margaret'],        // Tue: SEO + finance
  3: ['valentina', 'adaeze', 'lin'], // Wed: social + Africa growth + Studio film
  4: ['sipho', 'chidinma', 'mei'], // Thu: PR + grants + Studio image
  5: ['rocio', 'amara'],           // Fri: data + impact
  6: ['jonah', 'lin'],             // Sat: creative + studio & motion
  0: ['ingrid', 'kenji', 'harrison'] // Sun: strategy + retention + capital
};

/* ---------- Helpers ---------- */
async function claude(system, user, max = 1000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: max, system, messages: [{ role: 'user', content: user }], tools: [{ type: 'web_search_20250305', name: 'web_search' }] })
  });
  if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

async function ping(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    return { url, up: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { url, up: false, status: 0, ms: null, err: String(e).slice(0, 80) };
  }
}

/* ---------- Run the cycle ---------- */
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { items: [] };
const history = (prev.items || []).slice(-10).map(i => `- [${i.date}] ${i.title}`).join('\n') || '- First cycle.';

const sites = await Promise.all([
  ping('https://setpostgo.xyz'),
  ping('https://nagori.xyz'),
  ping('https://renviait.co.uk')
]);
const siteReport = sites.map(s => `${s.url}: ${s.up ? `UP, HTTP ${s.status}, ${s.ms}ms` : `DOWN or unreachable (${s.err || 'HTTP ' + s.status})`}`).join('\n');
console.log('Estate:\n' + siteReport);

const items = [];
const dow = new Date().getDay();
const duty = ROTA[dow] || ['ingrid', 'theo'];

// 1) If anything is down, Tobias files an incident FIRST
if (sites.some(s => !s.up)) {
  const out = await claude(CHARS.tobias.sys + '\n\n' + FIRM_CTX,
    `URGENT overnight check, ${today}. Server-side estate results (real HTTP checks):\n${siteReport}\n\nFile an incident report: ## Severity, ## Likely cause per affected site (Netlify/DNS/Supabase/cert), ## Immediate fixes in order, ## CEO ACTIONS.`, 800);
  items.push({ id: `ap-${today}-incident`, date: today, type: 'work', charId: 'tobias', biz: 'renviait', title: `⚠ INCIDENT — site(s) unreachable overnight`, output: out });
}

// 2) Maren's standup
const standup = await claude(CHARS.maren.sys + '\n\n' + FIRM_CTX,
  `Overnight cycle, ${today}. Estate check (real HTTP):\n${siteReport}\n\nRecent overnight work:\n${history}\n\nOn duty today: ${duty.map(d => CHARS[d].name).join(' and ')}.\nRun the standup: ## Situation (3 lines), ## Today's Focus (what the on-duty partners will deliver and why it matters now), ## One Risk I'm Watching. Tight.`, 700);
items.push({ id: `ap-${today}-standup`, date: today, type: 'standup', charId: 'maren', title: 'Overnight standup', output: standup });

// 3) On-duty partners work on their own initiative
for (const id of duty) {
  const c = CHARS[id];
  const out = await claude(c.sys + '\n\n' + FIRM_CTX,
    `Overnight cycle, ${today}. No brief from the CEO — you act on your own initiative.\nEstate check:\n${siteReport}\nRecent firm output (do NOT repeat these):\n${history}\n\nChoose the single highest-value task in your domain today. Open with ## Self-Directed Brief (2 lines: what you chose and why), then deliver the complete work product.`, 1000);
  items.push({ id: `ap-${today}-${id}`, date: today, type: 'work', charId: id, biz: c.biz, title: `Own initiative — ${c.name.split(' ')[0]}'s overnight delivery`, output: out });
}

// 4) Noor's daily content pack — every day, all brands
const pack = await claude(CHARS.noor.sys + '\n\n' + FIRM_CTX,
  `Overnight cycle, ${today}. Recent packs (do NOT repeat angles):\n${history}\n\nDraft today's content pack: 2 posts per brand (SetPostGo, RenviaIT, NAGORI) on their primary platforms. For each post: ## [Brand — Platform], exact paste-ready copy, hashtags, link, best UK posting time. Fresh angles today. End with ## CEO ACTIONS (schedule the pack through SetPostGo; note any platform SetPostGo does not yet cover).`, 1400);
items.push({ id: `ap-${today}-noor`, date: today, type: 'work', charId: 'noor', biz: 'setpostgo', title: 'Daily content pack — all brands', output: pack });

// 5) Friday: Margaret's finance & compliance review
if (dow === 5) {
  const fin = await claude(CHARS.margaret.sys + '\n\n' + FIRM_CTX,
    `Friday finance review, ${today}. You do not have live bank data — the CEO logs outgoings in the app's register. Deliver: ## This week's finance discipline (what to reconcile across the RenviaIT and Lyrīon accounts), ## UK compliance radar (Companies House, VAT threshold, self-assessment timing for a UK Ltd portfolio — generic calendar, flag what to verify on gov.uk), ## Questions for the CEO (exact figures to log in the register), ## CEO ACTIONS.`, 900);
  items.push({ id: `ap-${today}-margaret-fin`, date: today, type: 'work', charId: 'margaret', biz: 'renviait', title: 'Friday finance & compliance review', output: fin });
}


/* ============ THE NIGHT PRESS ============ */
/* Every night: one full SEO article, published as a live page, sitemap updated. Compounds forever. */
const REPO = process.env.GITHUB_REPOSITORY || '';
const BASE = REPO ? `https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/` : 'https://YOUR-USERNAME.github.io/ninth-house/';

const PRESS_BEATS = [
  { target:'setpostgo', url:'https://setpostgo.xyz', cta:'Generate a month of posts for your profession with SetPostGo',
    topics:['social media content ideas for [profession]','how often should a [profession] post on LinkedIn','content calendar for small business','social media marketing without an agency','what to post when you have nothing to say','LinkedIn strategy for consultants','Instagram for local businesses','social media for lawyers accountants dentists tradespeople'] },
  { target:'nagori', url:'https://nagori.xyz', cta:'Seal a letter that outlasts you at NAGORI',
    topics:['digital time capsule ideas','letters to write before you die','how to preserve family memories digitally','last letter to a loved one','digital legacy planning','memorial letter ideas','what to write to your future child'] },
  { target:'renviait', url:'https://renviait.co.uk', cta:'Give your retired IT a second life with RenviaIT',
    topics:['what to do with old business laptops UK','IT asset disposal small business','secure data destruction before selling laptop','refurbished laptops vs new for business','e-waste statistics UK businesses','ITAD explained'] },
  { target:'ninthhouse', url: BASE, cta:'Commission the Ninth House Audit from \u00a399',
    topics:['AI marketing agency explained','can AI run a marketing department','marketing on a solo founder budget','productized marketing services','AI transparency in advertising','one person business marketing systems'] }
];

const PRESS_TPL = (a) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${a.title} | The Ninth Times</title>
<meta name="description" content="${a.meta}">
<link rel="canonical" href="${BASE}press/${a.slug}.html">
<meta name="theme-color" content="#FBF7EE">
<link href="https://fonts.googleapis.com/css2?family=Marcellus&family=Albert+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Article','headline':a.title,'description':a.meta,'datePublished':a.date,'author':{'@type':'Organization','name':'Ninth House Growth Partners'},'publisher':{'@type':'Organization','name':'Ninth House Growth Partners'}})}</script>
<style>
body{font-family:'Albert Sans',sans-serif;background:#FBF7EE;color:#3A4048;line-height:1.75;margin:0}
.wrap{max-width:700px;margin:0 auto;padding:30px 22px 60px}
a{color:#A97F2F}
nav{border-bottom:1px solid #E4DCC6;padding:14px 22px;font-family:'Marcellus',serif;letter-spacing:.14em;text-transform:uppercase;font-size:14px}
nav a{text-decoration:none;color:#1C2128}
h1{font-family:'Marcellus',serif;font-weight:400;font-size:32px;line-height:1.2;color:#1C2128}
h2{font-family:'Marcellus',serif;font-weight:400;font-size:22px;color:#1C2128;margin-top:34px}
.date{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#A97F2F;margin:8px 0 26px}
.cta{background:#F4EDDC;border:1px solid #C9A557;border-radius:14px;padding:20px;margin-top:40px}
.cta a{display:inline-block;background:#A97F2F;color:#FFFDF8;text-decoration:none;font-weight:700;border-radius:10px;padding:11px 20px;margin-top:8px}
footer{border-top:1px solid #E4DCC6;padding:22px;text-align:center;font-size:12px;color:#98917E}
</style>
</head>
<body>
<nav><a href="../index.html">\u2643 Ninth House</a> &nbsp;\u00b7&nbsp; <a href="index.html" style="font-size:11px;color:#A97F2F">The Ninth Times</a></nav>
<div class="wrap">
<h1>${a.title}</h1>
<div class="date">${a.date} \u00b7 The Ninth Times</div>
${a.body}
<div class="cta"><strong>${a.ctaLead}</strong><br><a href="${a.ctaUrl}" rel="noopener">${a.cta} \u2192</a></div>
</div>
<footer>Published by Ninth House, an AI-operated growth studio under human CEO oversight. \u00b7 <a href="../charter.html">The Charter</a></footer>
</body>
</html>`;

async function nightPress() {
  const beat = PRESS_BEATS[Math.floor(Date.now() / 864e5) % PRESS_BEATS.length];
  const topic = beat.topics[Math.floor(Math.random() * beat.topics.length)];
  const raw = await claude(CHARS.priya.sys + '\n\n' + FIRM_CTX,
`Night Press, ${today}. Write one complete, genuinely useful SEO article on: "${topic}".
Audience: real people searching this. 900-1200 words. UK English. No fluff, no dashes, warm and expert.
Output EXACTLY this format:
TITLE: [compelling, keyword-bearing, under 62 chars]
META: [meta description under 155 chars]
SLUG: [lowercase-hyphenated-slug]
LEAD: [one sentence bridging the article to this call to action: ${beat.cta}]
BODY:
[the article in HTML using only <p>, <h2>, <ul>, <li>, <strong> tags]`, 2400, true);

  const grab = (k) => { const mm = raw.match(new RegExp('^' + k + ':\\s*(.+)$', 'm')); return mm ? mm[1].trim() : ''; };
  const title = grab('TITLE'), meta = grab('META'), lead = grab('LEAD');
  let slug = (grab('SLUG') || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const bodyIdx = raw.indexOf('BODY:');
  const body = bodyIdx > -1 ? raw.slice(bodyIdx + 5).trim() : raw;
  if (!title || !slug || body.length < 400) { console.log('Night Press: output malformed, skipping tonight.'); return; }
  slug = today + '-' + slug;

  fs.mkdirSync('press', { recursive: true });
  const art = { title, meta, slug, date: today, body, cta: beat.cta, ctaUrl: beat.url, ctaLead: lead || 'The next step is simple.' };
  fs.writeFileSync(`press/${slug}.html`, PRESS_TPL(art));

  // archive index
  const idxPath = 'press/index.json';
  const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : [];
  idx.unshift({ slug, title, meta, date: today });
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));
  const list = idx.map(x => `<div style="margin-bottom:22px"><a href="${x.slug}.html" style="font-family:'Marcellus',serif;font-size:19px;color:#1C2128;text-decoration:none">${x.title}</a><div style="font-size:11px;letter-spacing:.16em;color:#A97F2F;text-transform:uppercase;margin:3px 0">${x.date}</div><div style="color:#6E6858;font-size:14px">${x.meta}</div></div>`).join('\n');
  fs.writeFileSync('press/index.html', PRESS_TPL({ title: 'The Ninth Times', meta: 'The nightly journal of Ninth House: growth, marketing and the businesses we build.', slug: 'index', date: today, body: '<p>Written by the house, one article a night, while the city sleeps.</p>' + list, cta: 'Meet the firm behind the journal', ctaUrl: '../firm.html', ctaLead: 'Every article here was drafted overnight and sealed by a human.' }).replace(`<link rel="canonical" href="${BASE}press/index.html">`, `<link rel="canonical" href="${BASE}press/">`));

  // sitemap
  if (fs.existsSync('sitemap.xml')) {
    let sm = fs.readFileSync('sitemap.xml', 'utf8');
    const loc = `${BASE}press/${slug}.html`;
    if (!sm.includes(loc)) sm = sm.replace('</urlset>', `  <url><loc>${loc}</loc></url>\n</urlset>`);
    if (!sm.includes(`${BASE}press/index.html`)) sm = sm.replace('</urlset>', `  <url><loc>${BASE}press/index.html</loc></url>\n</urlset>`);
    fs.writeFileSync('sitemap.xml', sm);
  }
  console.log('Night Press published: ' + slug);
  items.push({ id: `ap-${today}-press`, date: today, type: 'work', charId: 'priya', biz: beat.target === 'ninthhouse' ? 'setpostgo' : beat.target, title: 'Night Press published: ' + title, output: '## Published overnight\n**' + title + '**\n' + meta + '\n\nLive at: ' + BASE + 'press/' + slug + '.html\n\n## CEO ACTIONS\n- Read it over coffee; if anything displeases you, edit or delete the file in the repo\n- Share it once on the matching brand channel' });
}
try { await nightPress(); } catch (e) { console.log('Night Press failed tonight, the presses rest: ' + String(e).slice(0, 160)); }

/* ---------- Write (keep last 30 days of items) ---------- */
const merged = [...(prev.items || []), ...items];
const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const kept = merged.filter(i => i.date >= cutoff);
fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), estate: sites, items: kept }, null, 2));
console.log(`Cycle complete: ${items.length} new deliverables, ${kept.length} in ledger.`);
