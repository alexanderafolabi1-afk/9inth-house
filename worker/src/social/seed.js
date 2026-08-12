// The registry seed, and the only place in the engine where a venture or a
// platform is named in the source.
//
// This is data, not logic. Nothing here is read at decision time: it is written
// into the ventures table once, on first run, and everything afterwards reads the
// table. Editing a venture, adding a venture, changing a cadence or turning one
// off all happen in the admin, and none of them need a deploy or a change here.
//
// Only 9thpoint is seeded. Every other venture in the portfolio is added from the
// admin, which is the whole reason the registry is a table rather than a constant.

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
  }
];
