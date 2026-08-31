// The SetPostGo campaign, as the owner set it.
//
// Third campaign in the house and the first that goes to consumers' countries
// at volume: 8 United States, 4 Canada, 4 Australia and 4 elsewhere, every day.
// That geography is the single most consequential thing about this brief and it
// is why this file carries a compliance block the other two do not.
//
// The four master emails are held as supplied, with em dashes resolved because
// nothing outbound carries one, and with the statutory footer appended because
// none of them could lawfully be sent to Canada or Australia without it. Both
// changes are recorded rather than made quietly: the originals are kept beside
// them and shown on the desk.

/* ---------- what is being sold ---------- */

export const SETPOSTGO_PRODUCT = 'Social media for professionals who have better things to do. Every other tool asks you to write. We already wrote it.';

export const SETPOSTGO_FACTS = [
  '89 professions across 12 categories',
  'Seven platforms: WhatsApp, LinkedIn, Instagram, Facebook, X, Threads, TikTok',
  'We write it. They copy and paste it. We never take passwords.'
];

// Sterling is the price. The rest are indicative and have to read that way,
// because a US operator who sees "US$20" and is billed £15 at a moved rate has
// been quoted a number the house did not honour.
export const SETPOSTGO_CURRENCY = 'GBP';

export const SETPOSTGO_PLANS = {
  free: { label: 'Free', gbp: 0, posts: 21, note: '21 posts a month, no card' },
  solo: { label: 'Solo', gbp: 15, posts: 63, indicative: { USD: 20, CAD: 27, AUD: 30 } },
  pro: { label: 'Pro', gbp: 30, posts: 63, indicative: { USD: 40 }, note: 'Adds tone, hashtags and client win posts' },
  write_and_you_post: { label: 'Write and You Post', gbp: 249, from: true, note: 'Only for someone who says they will never paste' },
  full_management: { label: 'Full Management', gbp: 599, from: true, leadWith: false, note: 'Not sold first this week, and never opened with' }
};

// The free plan is the discount. There is nothing under Solo.
export const SETPOSTGO_FLOOR_GBP = 15;

export const SETPOSTGO_ASK = 'One action. Start free at setpostgo.xyz and pick the profession, or reply TRADE and we send the exact profession link.';

/* ---------- the statutory footer ---------- */

// This is not house style. It is the minimum that makes a commercial email
// lawful in the three countries carrying sixteen of every twenty sends.
//
// United States, CAN-SPAM: a valid physical postal address and a working
// opt-out in every commercial message.
// Canada, CASL: consent based rather than opt-out based, with sender
// identification and an unsubscribe mechanism required in any message sent.
// Australia, Spam Act 2003: consent, accurate sender identification, and a
// functional unsubscribe.
//
// The opt-out and the address are mechanical and are enforced here. Consent is
// not mechanical, which is the part that needs the owner's decision and is
// written up in SETPOSTGO_COMPLIANCE below.
export const SETPOSTGO_FOOTER = `SetPostGo
setpostgo.xyz
{Postal address}

If you would rather not hear from us, reply STOP and we will not write again.`;

export const SETPOSTGO_COMPLIANCE = [
  {
    id: 'optout_and_address',
    jurisdictions: ['US', 'CA', 'AU', 'UK', 'IE', 'NZ'],
    detail: 'Every message carries a working opt-out and a real postal address. Enforced before a draft exists, so it cannot be forgotten at twenty a day.'
  },
  {
    id: 'canada_consent',
    jurisdictions: ['CA'],
    detail: 'CASL is consent based rather than opt-out based. A published business address for a business purpose is the exemption normally relied on, and it is narrower than it sounds. Four Canadian sends a day is not a corner to cut, and this needs a decision rather than a default.'
  },
  {
    id: 'australia_consent',
    jurisdictions: ['AU'],
    detail: 'The Spam Act 2003 requires consent, which for a conspicuously published business address without a no-unsolicited notice is normally inferred. If the address carries such a notice, it is not.'
  },
  {
    id: 'stop_is_honoured',
    jurisdictions: ['*'],
    detail: 'A reply of STOP goes on the suppression list, which is keyed on the address alone and honoured by every venture in the house, forever.'
  },
  {
    id: 'day_seven_is_final',
    jurisdictions: ['*'],
    detail: 'The day seven email says we will not write again. Sending it closes the file, so the promise is kept by the system rather than by whoever is at the desk.'
  }
];

/* ---------- who ---------- */

export const SETPOSTGO_TIERS = {
  silent_operator: {
    label: 'Silent operator',
    note: 'Highest reply rate. Does fine work, has a Google listing with photographs from three years ago, has not posted in sixty days or has no account at all, and still answers a public email.',
    trades: [
      'HVAC', 'plumber', 'electrician', 'roofer', 'garage door', 'pest control',
      'dentist', 'chiropractor', 'vet', 'physio', 'optometrist',
      'realtor or broker with a still personal page',
      'accountant', 'bookkeeper', 'insurance broker',
      'family restaurant', 'bakery', 'butcher', 'cafe',
      'salon', 'barber', 'nail bar', 'med spa owner operator',
      'wedding DJ', 'photographer', 'celebrant',
      'landscaper', 'cleaner', 'mobile detailer',
      'small law office', 'independent gym, pilates or personal trainer'
    ]
  },
  quiet_agency: {
    label: 'Quiet agency',
    note: 'Two to twelve people who sell presence and have let their own accounts go still. Sold seats, never the free plan, and never opened with Full Management.',
    trades: ['marketing shop', 'branding shop', 'web shop', 'recruiting boutique', 'boutique PR']
  },
  present_but_empty: {
    label: 'Present but empty',
    note: 'A Facebook page whose last post is two years old, a Google listing with reviews and no updates, a WhatsApp Business with no Status. The date is the whole email, so the date has to be real.',
    trades: []
  }
};

export const SETPOSTGO_SKIP = [
  'Enterprise IT',
  'Franchise head offices',
  'Anyone with a social manager on staff',
  'Anyone whose only route in is a contact form with a CAPTCHA and no address'
];

// Towns and suburbs answer. Downtown agencies do not.
export const SETPOSTGO_GEOGRAPHY = {
  daily: [
    { region: 'United States', count: 8, note: 'Sun Belt and Midwest towns beat Manhattan agencies' },
    { region: 'Canada', count: 4 },
    { region: 'Australia', count: 4 },
    { region: 'Rest', count: 4, note: 'UK high street, Ireland, New Zealand, UAE independents, Caribbean operators, and owner managed firms in Lagos, Accra and Nairobi' }
  ],
  townsThatAnswer: [
    'Springfield', 'Boise', 'Tulsa', 'Halifax', 'Winnipeg', 'Geelong',
    'Townsville', 'Toowoomba', 'Saskatoon', 'Hobart', 'Fresno', 'Chattanooga'
  ]
};

export const SETPOSTGO_DAILY_MIX = [
  { group: 'Trades', count: 8 },
  { group: 'Food and hospitality independents', count: 6 },
  { group: 'Professional services', count: 4 },
  { group: 'Tiny agencies whose own grid is dead', count: 2 }
];

/* ---------- the psychology, kept as the reason rather than as copy ---------- */

// Written down so it is used and not recited. Every one of these is a thing the
// email should make the reader feel without the email ever naming it.
export const SETPOSTGO_PSYCHOLOGY = [
  { id: 'invisibility_tax', detail: 'The work is good. The street does not know the door is still open.' },
  { id: 'rival_pulse', detail: 'The other van, the other chair, posts. Search shows them first.' },
  { id: 'quiet_reads_closed', detail: 'Customers treat silence as retirement.' },
  { id: 'time_shame', detail: 'They opened a design tool at eleven at night and posted nothing. We remove that hour.' },
  { id: 'control', detail: 'No passwords. They keep every account. That is the dignity.' },
  { id: 'proof_before_money', detail: '21 real posts, no card. The email invites them to see their own voice, not to sign anything.' }
];

export const SETPOSTGO_NEVER = 'Never that their marketing is bad. Always that the work is already good and the record of it is not.';

/* ---------- research required before anything is written ---------- */

export const SETPOSTGO_RESEARCH_HARD = [
  { key: 'business_name', label: 'Business name' },
  { key: 'town', label: 'Town' },
  { key: 'trade', label: 'Trade, mapped to a SetPostGo profession' },
  { key: 'public_email', label: 'Public email' },
  { key: 'silence_proof', label: 'Proof of silence: a last post date, or that no account was found' }
];

export const SETPOSTGO_RESEARCH_SOFT = [
  { key: 'rival_type', label: 'One rival type in the same town, never a name' },
  { key: 'owner_first_name', label: 'Owner first name, if public' },
  { key: 'street_type', label: 'The street or parade they sit on' }
];

/* ---------- the four master emails ---------- */

export const SETPOSTGO_TRADE_SUBJECT = '{Town} still searches. Your page does not answer.';

export const SETPOSTGO_TRADE_EMAIL = `{First name},

{Business} is the kind of firm people recommend in person. Online it has gone quiet. That silence reads as closed.

{Rival line}

SetPostGo writes the month for your profession, for WhatsApp, LinkedIn, Instagram, Facebook, X, Threads and TikTok, and you paste it. No passwords. No design tool at midnight.

21 real posts are free. No card.
setpostgo.xyz

If 21 is not enough, Solo is GBP 15 a month for 63.

Reply TRADE if you want the {Profession} pack opened for {Business}.`;

export const SETPOSTGO_TRADE_EMAIL_ORIGINAL = `SetPostGo writes the month for your profession — WhatsApp, LinkedIn, Instagram, Facebook, X, Threads, TikTok — and you paste it.`;

export const SETPOSTGO_HOSPITALITY_SUBJECT = '{Town} thinks you might be closed';

export const SETPOSTGO_HOSPITALITY_EMAIL = `{First name},

A full book in the room and an empty grid is how good places disappear from the next street.

We have already written {Profession} posts for all seven platforms. You copy them. You keep every account.

Start free. 21 posts. No card.
setpostgo.xyz

{Rival line}`;

export const SETPOSTGO_PROFESSIONAL_SUBJECT = 'Your work is visible. Your name is not.';

export const SETPOSTGO_PROFESSIONAL_EMAIL = `{First name},

Listings and returns speak. A still profile does not. Clients choose the person who appeared this week.

SetPostGo has your profession written. Paste it to LinkedIn and the rest. No login sharing.

21 free. Then GBP 15 if you want the full month.

Reply TRADE.`;

export const SETPOSTGO_AGENCY_SUBJECT = 'Your clients can see your grid';

export const SETPOSTGO_AGENCY_EMAIL = `{First name},

You sell presence. Your own page has gone still. That is the quiet tax on a good shop.

SetPostGo writes 63 posts a month per seat, in the trade voice, with no passwords. For a four person house that is cheaper than one junior afternoon.

Start one seat free at setpostgo.xyz. If the voice is right, we invoice Pro per person.

Reply SEATS and the headcount.`;

/* ---------- the rival line, which is a claim and is treated as one ---------- */

// The supplied copy asserts that the rival posts. The brief's own note says
// that is true in almost every category, and almost is not a basis for telling
// a stranger something about the shop across the road. So there are two lines:
// the strong one, which requires evidence, and the honest one, which does not
// and is the default.
export const SETPOSTGO_RIVAL_LINE_EVIDENCED = 'The other {Trade} in {Town} posts. You do the work. They collect the call.';
export const SETPOSTGO_RIVAL_LINE_SAFE = 'Somewhere in {Town} another {Trade} is posting this week. You do the work. They collect the call.';
export const SETPOSTGO_RIVAL_LINE_HOSPITALITY = 'The other door on {Street type} will keep posting either way.';

/* ---------- follow ups ---------- */

export const SETPOSTGO_FOLLOW_UP_DAY_3 = `{First name}, the free 21 for {Profession} are still sitting there. The other {Trade} in {Town} does not need an invitation. Reply TRADE or we will leave the file.`;

export const SETPOSTGO_FOLLOW_UP_DAY_7 = `Last note. setpostgo.xyz, pick {Profession}. No card. After this we will not write again.`;

export const SETPOSTGO_CADENCE = [
  { day: 0, name: 'First email', note: 'One action. Start free and pick the profession, or reply TRADE.' },
  { day: 3, name: 'Day three', note: 'The free 21 are still there.' },
  { day: 7, name: 'Day seven', note: 'Final. Sending it closes the file and suppresses the address, because it promises we will not write again.' }
];

export const SETPOSTGO_ON_REPLY = [
  'Send the exact get started link',
  'Tell them which profession to tap',
  'Check in at 48 hours: have the 21 landed, and Solo is one click if they want the month',
  'Only then offer Write and You Post, and only if they say they will not paste'
];

export const SETPOSTGO_QUOTA = {
  sent: 20,
  weekly: 120,
  expect: '8 to 15 replies, 5 to 10 free activations, 2 to 5 conversions to Solo or Pro',
  stackedBy: '8 trades, 6 food and hospitality, 4 professional services, 2 tiny agencies'
};

export const SETPOSTGO_GUARDRAILS = [
  { id: 'never_full_management_first', detail: 'Full Management is not sold first this week and is never opened with. Nor is Write and You Post, until they say they will not paste.' },
  { id: 'free_is_the_discount', detail: 'Nothing is sold under Solo. The free plan is the discount.' },
  { id: 'no_faked_date', detail: 'If the last post date is unknown, the page has gone quiet. A date is never invented, because it is checkable in one click and wrong is worse than vague.' },
  { id: 'rival_claim_needs_evidence', detail: 'That the rival posts is a claim about a real shop. Evidenced, it can be stated. Unevidenced, it is softened, never dropped and never faked.' },
  { id: 'no_invented_scarcity', detail: 'No licences left in Dallas. The rival and the ageing page are true; invented scarcity is not.' },
  { id: 'no_pdf_no_call', detail: 'No attachments. No call asked for on the first email.' },
  { id: 'published_inboxes_only', detail: 'Google Business, the Facebook page, Instagram, or their own contact page. No bought lists, and nothing scraped out of a comment thread.' },
  { id: 'dignity', detail: 'Never that their marketing is bad. Always that the work is already good and the record of it is not.' },
  { id: 'lawful_footer', detail: 'Every message carries a working opt-out and a real postal address. Sixteen of every twenty sends go to countries that require it.' }
];

export const SETPOSTGO_VOICE = 'The work is already good. The record of it is not. Never shame, never a lecture, and never an exclamation mark. We do not sell software, we hand them the words their town was already waiting to read.';
