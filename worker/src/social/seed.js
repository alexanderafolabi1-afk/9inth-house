// The registry seed, and the only place in the engine where a venture or a
// platform is named in the source.
//
// This is data, not logic. Nothing here is read at decision time: a row is
// written into the ventures table the first time seedVentures sees a slug it does
// not already hold, and everything afterwards reads the table. Editing an existing
// venture, changing a cadence or turning one off all happen in the admin, and none
// of them need a deploy or a change here. seedVentures skips any slug already on
// the table, so adding a new block here is safe to deploy at any time: it can only
// ever create a venture that does not yet exist, never overwrite one that does.
//
// 9thpoint, SetPostGo and GloTemp are seeded here. Every other venture in the
// portfolio is added from the admin, which is the whole reason the registry is a
// table rather than a constant.

export const SEED_VENTURES = [
  {
    slug: '9thpoint',
    name: 'Ninth House Growth Partners',
    site_url: 'https://9thpoint.com',
    active: 1,
    positioning: 'The world’s first openly AI operated growth studio. A firm of AI partners running marketing, outreach, brand growth and systems as a weekly discipline rather than a campaign, under the oversight and final authority of one human Chief Executive. The proof is that the house runs its own portfolio on the same protocol it sells, and publishes the results including the ones it is not proud of.',
    audience: 'Founders and owner operators of small and mid sized businesses who are doing their own marketing and losing to it, plus corporate, institutional and government buyers arriving through the published catalogue.',
    tone: 'Assured, dry, specific. Short sentences. Present tense. Says the number or says nothing. Warm without being familiar, never salesy, never breathless. Professional throughout: the name refers to the ninth house of ambition and reputation, and the house is never framed as astrological or mystical.',
    banned_language: 'game changer, revolutionary, unlock, unleash, supercharge, in today’s fast paced world, thoughts?, drop a comment, DM me, secret sauce, hustle, grind, guru, ninja, rockstar, astrology, horoscope, chart reading, cosmic, destiny, manifest',
    // LinkedIn only to begin with, because LinkedIn is the one live branch on the
    // Make rail as at 12 Aug 2026. Queueing posts for a platform the rail cannot
    // route yet would just fill the morning with things that cannot be sent.
    // Adding X or Instagram is a Make branch plus one cadence edit in the admin.
    platforms: ['linkedin'],
    cadence: { linkedin: 3 },
    category_mix: {
      article_derived: 0.3,
      short_form: 0.25,
      educational: 0.2,
      proof: 0.15,
      visual: 0.1
    }
  },
  {
    slug: 'setpostgo',
    name: 'SetPostGo',
    site_url: 'https://setpostgo.xyz',
    active: 1,
    positioning: 'A social media content generation SaaS built under Lyrion Ltd. Serves eighty nine professions across twelve categories and six platforms, thirty ready to post pieces a month per profession, priced by country across twenty two markets with a deliberately low entry tier for African small businesses. Ninth House itself is the proof: the firm schedules its own output through SetPostGo’s own client.',
    audience: 'Small business owners and solo professionals across eighty nine professions who know they should post consistently and do not have the time, the template or the confidence to do it well themselves, from first time founders to established local trades, across all twenty two priced markets.',
    tone: 'Confident, practical, SME empowering. Speaks to the owner doing their own marketing late at night, not to a marketing department. States the number of posts, the profession count or the price plainly. Never breathless, never salesy.',
    banned_language: 'game changer, revolutionary, unlock, unleash, supercharge, in today’s fast paced world, thoughts?, drop a comment, DM me, secret sauce, hustle, grind, guru, ninja, rockstar',
    // LinkedIn and Instagram both route through the existing Make webhook: LinkedIn
    // is the confirmed live branch, and Instagram is confirmed connected through a
    // Facebook Page on SetPostGo’s own account. X is included so the engine still
    // writes the copy, but config.js marks X as automated: false, so distribute.js
    // refuses to send it and the desk shows Copy instead of Approve for it: delivery
    // there stays a human copying the text across, never the webhook.
    platforms: ['linkedin', 'instagram', 'x'],
    cadence: { linkedin: 3, instagram: 3, x: 3 },
    category_mix: {
      short_form: 0.3,
      educational: 0.25,
      proof: 0.2,
      visual: 0.15,
      article_derived: 0.1
    }
  },
  {
    slug: 'glotemp',
    name: 'Glotemp',
    site_url: 'https://glo-temp.com',
    active: 1,
    positioning: 'A live index of three hundred cities, ranked in real time across twelve verticals: food, transport, entertainment, health, education, sport, finance, fashion, property, tech, work and pulse. Built under RenviaIT. It reads the world’s cities the way a market is read: continuously, and without holidays.',
    audience: 'People deciding where to live, move, invest or expand a business, and anyone who wants a straight, current answer about how a city is actually performing rather than a tourist board’s version of it.',
    tone: 'Assured and factual, like a standing publication, not a product. Speaks about cities and rankings, never about itself, its history or its build. Never says or implies new, launch, launching, beta, early access, early stage, seed stage, just started, coming soon or building. Never explains how the index is scored, updated or put together: states the ranking as settled fact and moves on. Asked what it is, it answers with what it shows, not with an account of itself.',
    banned_language: 'new, just launched, launching soon, beta, early access, early stage, seed stage, just started, coming soon, we just built, our first, check back soon, how it works, under the hood, our algorithm, our methodology, game changer, revolutionary, unlock, unleash, supercharge, thoughts?, drop a comment, DM me, hustle, grind, guru, ninja, rockstar',
    // LinkedIn only. Instagram and Facebook automation stay off for GloTemp on
    // purpose: that automation is separately known to be broken and is being fixed
    // on its own timeline, so it is not switched on here until that fix lands and
    // is confirmed. X is included for the same reason as SetPostGo above: config.js
    // marks it automated: false, so the engine writes the copy but it can only ever
    // leave the queue by a human copying it out, never through the webhook.
    platforms: ['linkedin', 'x'],
    cadence: { linkedin: 3, x: 3 },
    category_mix: {
      short_form: 0.35,
      educational: 0.25,
      proof: 0.2,
      article_derived: 0.2
    }
  }
];
