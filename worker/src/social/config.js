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
  instagram: {
    label: 'Instagram',
    limit: 2200,
    target: 900,
    imageRequired: true,
    hashtags: { max: 8, style: 'grouped at the end, specific over popular' },
    guidance: 'The image carries the point and the caption earns the read. First line must work as the only line, because it is the only one shown unexpanded.'
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
