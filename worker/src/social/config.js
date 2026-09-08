// The only file in the engine that knows anything specific about a platform or
// a content category. Nothing downstream may branch on a platform name: the
// distribution rail routes on the platform field, so adding a platform here and
// a matching branch inside Make is the whole job. No Worker logic changes.
//
// If you are adding a platform, add one entry to PLATFORMS below, redeploy, then
// add the venture to that platform's cadence from the admin. See worker/README.md.

export const PLATFORMS = {
  linkedin: {
    label: 'LinkedIn',
    // Posted directly by the Worker rather than through the Make rail. The rail
    // is metered per call on a free allowance small enough that a normal week of
    // posting exhausts it, which made it the binding constraint on how often the
    // house could speak. Talking to LinkedIn from the Worker costs nothing per
    // post and removes a moving part. See worker/src/social/senders/linkedin.js
    // for what it needs, and worker/README.md for the one time setup.
    delivery: 'linkedin',
    // Hard ceiling the platform itself enforces. Copy is generated to aim well
    // under this; the admin shows the count so nothing is discovered at send time.
    limit: 3000,
    // What the copy should actually aim for, which is never the ceiling.
    target: 1300,
    imageRequired: false,
    hashtags: { max: 3, style: 'end of post, sentence case, never mid sentence' },
    guidance: 'Professional register. Lead with the claim, not the wind up. Line breaks between short paragraphs. No engagement bait, no "thoughts?" sign off.'
  },
  x: {
    label: 'X',
    limit: 280,
    target: 240,
    imageRequired: false,
    hashtags: { max: 1, style: 'only where it is a real community tag' },
    guidance: 'One idea, said flat and fast. No thread unless the idea genuinely needs a second post. Never open with a hook cliche.',
    // No branch for this on the rail, by design: X is posted by hand from the
    // queue, never through Make. See the automated check in distribute.js,
    // which refuses to send anything on a platform marked automated: false
    // before it ever reaches the webhook.
    automated: false
  },
  // Instagram is four platforms wearing one name.
  //
  // A Reel caption, a carousel, a still and a Story are four different jobs with
  // four different lifespans and four different audiences, and the Graph API
  // itself agrees: the media container takes a media_type of REELS, CAROUSEL or
  // STORIES, or nothing at all for a plain image, and the four take different
  // fields. Writing one piece of copy and pushing it to all four is the single
  // most reliable way to make an account look automated.
  //
  // They are therefore four entries here rather than one entry with a mode flag,
  // because this file's whole contract is that the platform key is the routing
  // key: the rail branches on it, the cadence is set per key from the admin, and
  // no logic downstream has to learn what a Reel is. mediaKind is the value Make
  // passes straight to media_type, so a branch there is a field mapping and not
  // a decision.
  instagram: {
    label: 'Instagram feed',
    surface: 'feed',
    parent: 'instagram',
    mediaKind: 'IMAGE',
    reach: 'followers',
    limit: 2200,
    target: 900,
    imageRequired: true,
    hashtags: { max: 8, style: 'grouped at the end, specific over popular' },
    guidance: 'One still. The image carries the point and the caption earns the read. First line must work as the only line, because it is the only one shown unexpanded.'
  },
  instagram_reel: {
    label: 'Instagram Reel',
    surface: 'reel',
    parent: 'instagram',
    mediaKind: 'REELS',
    // The only Instagram surface still shown to people who do not follow the
    // account, which makes it the one that grows a register rather than
    // servicing it. That is why it leads the rota rather than closing it.
    reach: 'people who do not follow the account',
    limit: 2200,
    target: 220,
    imageRequired: true,
    hashtags: { max: 5, style: 'at the end, specific over popular' },
    guidance: 'A caption for a video, not a post. The first line has to work with the sound off, because most of the audience will never turn it on. Name the shot the video needs in one line prefixed "SHOT:", then write the caption. Nine to fifteen seconds of footage, one idea, no wind up.'
  },
  instagram_carousel: {
    label: 'Instagram carousel',
    surface: 'carousel',
    parent: 'instagram',
    mediaKind: 'CAROUSEL',
    // Instagram gives a carousel a second showing to anyone who did not reach
    // the last slide, so the format buys a second impression for free.
    reach: 'followers, with a second showing to anyone who did not finish the swipe',
    limit: 2200,
    target: 400,
    imageRequired: true,
    slides: { min: 3, max: 10 },
    hashtags: { max: 8, style: 'grouped at the end, specific over popular' },
    guidance: 'Between three and ten slides. Slide one has to stand alone, because most people see only that one. Describe each slide on its own line prefixed "SLIDE 1:", "SLIDE 2:" and so on, then write the caption underneath them.'
  },
  instagram_story: {
    label: 'Instagram Story',
    surface: 'story',
    parent: 'instagram',
    mediaKind: 'STORIES',
    reach: 'followers, for twenty four hours',
    // Stories carry no caption field on the API at all: what is written here is
    // the text set on the image itself, which is why the ceiling is a design
    // constraint rather than a platform one. Kept short because it has to be
    // readable at a glance on a phone held one handed.
    limit: 300,
    target: 90,
    imageRequired: true,
    ephemeral: true,
    hashtags: { max: 1, style: 'one tag at most, set on the image' },
    guidance: 'Twenty four hours and then gone, and there is no caption box: what you write is set on the image. Short enough to read without stopping. Name one free interactive sticker in a line prefixed "STICKER:", chosen from poll, question, quiz, slider or countdown, and make the sticker the point of the frame rather than decoration on it.'
  },
  facebook: {
    label: 'Facebook',
    limit: 63206,
    target: 700,
    imageRequired: false,
    hashtags: { max: 2, style: 'sparingly, at the end' },
    guidance: 'Plainer and warmer than LinkedIn. Written for someone who is not in the industry and does not want jargon.'
  },
  threads: {
    label: 'Threads',
    limit: 500,
    target: 420,
    imageRequired: false,
    hashtags: { max: 1, style: 'one topic tag at most' },
    guidance: 'Conversational, present tense, no corporate cadence. Reads like a person, not a brand account.'
  },
  tiktok: {
    label: 'TikTok',
    limit: 2200,
    target: 200,
    imageRequired: true,
    hashtags: { max: 5, style: 'discovery tags at the end' },
    guidance: 'This is a caption for a video, not a post. Write the caption, then name the shot the video needs in one line prefixed "SHOT:".'
  },
  pinterest: {
    label: 'Pinterest',
    limit: 500,
    target: 300,
    imageRequired: true,
    hashtags: { max: 3, style: 'at the end, descriptive' },
    guidance: 'Written to be found by search rather than read by a follower. Say what the thing is and who it is for, in plain words.'
  }
};

// Every generated row carries one of these. The mix per venture is configurable
// on the venture row, so no venture drifts into producing only one of them.
export const CATEGORIES = {
  article: {
    label: 'Article',
    // Long form goes to the venture's own site first. The engine does not
    // publish these to social directly; it queues the syndication instead.
    requiresArticle: false,
    social: false,
    guidance: 'Long form for the venture site. Syndicated afterwards, never instead.'
  },
  article_derived: {
    label: 'From an article',
    requiresArticle: true,
    social: true,
    guidance: 'Cut from a published article. Take one argument from it, not a summary of all of them, and let the link carry the rest.'
  },
  short_form: {
    label: 'Short form',
    requiresArticle: false,
    social: true,
    guidance: 'Native post with nothing behind it. One observation the audience has not been told this way before.'
  },
  visual: {
    label: 'Visual',
    requiresArticle: false,
    social: true,
    needsImage: true,
    guidance: 'Carousel, quote card or product shot. Describe the image in one line prefixed "IMAGE:" so it can be made, then write the caption.'
  },
  proof: {
    label: 'Proof',
    requiresArticle: false,
    social: true,
    guidance: 'A shipped feature, a milestone, a real customer outcome. Only facts supplied in the brief. Never invent a number, a client or a result.'
  },
  educational: {
    label: 'Educational',
    requiresArticle: false,
    social: true,
    guidance: 'How to, or an explainer inside the venture domain. Useful on its own, with nothing held back for a paid tier.'
  },
  campaign: {
    label: 'Campaign',
    requiresArticle: false,
    social: true,
    guidance: 'Time boxed and tied to a launch or a date. Says plainly what is happening and by when.'
  }
};

export const STATUSES = ['draft', 'queued', 'approved', 'scheduled', 'posted', 'failed', 'skipped'];

// Statuses a row may be in and still be legitimately sent. Anything else is
// either already gone or was deliberately withheld.
export const SENDABLE = ['queued', 'approved', 'scheduled', 'failed'];

export function platformKeys() {
  return Object.keys(PLATFORMS);
}

export function isPlatform(key) {
  return Object.prototype.hasOwnProperty.call(PLATFORMS, key);
}

// Every platform key belonging to one family, in the order they are declared
// above. Derived rather than listed, so a fifth Instagram surface is one entry
// in PLATFORMS and nothing else anywhere.
export function platformFamily(parent) {
  return Object.keys(PLATFORMS).filter((k) => PLATFORMS[k].parent === parent);
}

export function isCategory(key) {
  return Object.prototype.hasOwnProperty.call(CATEGORIES, key);
}

// Categories that actually produce a social row, which is every category except
// the long form one. Derived from the config so a new category needs no edit here.
export function socialCategories() {
  return Object.keys(CATEGORIES).filter((k) => CATEGORIES[k].social);
}

// True when this pairing cannot be sent without an image, whether the demand
// comes from the platform or from the category.
export function imageRequired(platform, category) {
  const p = PLATFORMS[platform];
  const c = CATEGORIES[category];
  return Boolean((p && p.imageRequired) || (c && c.needsImage));
}
