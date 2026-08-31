// The City Pin campaign, as the owner set it.
//
// This is the deliberate opposite of the Visit Dubai approach. That one sells a
// homepage to a government body that needs six signatures. This sells a named
// lock on one city and one vertical to an operator who needs covers on Thursday
// and can decide alone. Everything here follows from that: the price is small
// enough to be an operating decision, the research is about one street rather
// than one country, and the whole point is that it closes this week.
//
// The four master emails are held here as supplied, with one class of change
// made and disclosed: em dashes are resolved, because the house rule forbids
// them in anything outbound. The originals are kept beside them so the
// correction is visible rather than silent, the same way the Visit Dubai
// subject line was handled.
//
// They are templates, not letters. Every one of them carries braces that must
// be filled from real research before it can be approved, which is enforced in
// outreach.js rather than trusted to whoever is sending at seven in the morning.

/* ---------- what is being sold ---------- */

// Named so nobody has to remember it. The product is a pin on one city and one
// vertical, and the single most common way this campaign could go wrong is an
// agent quietly selling something bigger to sound impressive.
export const CITY_PIN_PRODUCT = 'CITY PIN. A named lock on one city and one vertical. Not the homepage, and not a partnership of record.';

export const CITY_PIN_SKUS = {
  pin_90: {
    label: '90 day city pin',
    priceUsd: 490,
    term: '90 days',
    exclusive: false,
    includes: [
      'Named lock on one city and one vertical for 90 days',
      'Their name on A table, A room or Tonight for that city',
      'One still of their pin they can post',
      'One mid pin refresh if the city band changes',
      'Invoiced today, live within 5 working days of cleared payment'
    ]
  },
  exclusive_90: {
    label: '90 day pin with rival lock',
    priceUsd: 790,
    term: '90 days',
    exclusive: true,
    includes: [
      'Everything in the 90 day pin',
      'Category exclusive in that city for 90 days',
      'One exclusive per vertical per city, and no more'
    ]
  },
  anchor_12: {
    label: '12 month anchor',
    priceUsd: 1900,
    term: '12 months',
    exclusive: true,
    // Held back on purpose. Leading with the biggest number is how a decision an
    // operator could make alone turns into one they have to think about.
    leadWith: false,
    includes: [
      'The same exclusive for a year',
      'Quarterly stills',
      'Month 13 at half price on a renewal by day 270'
    ]
  }
};

// Below this an agent is not discounting, they are inventing a product. Checked
// on every offer rather than written on a wall.
export const CITY_PIN_FLOOR_USD = 390;

export const CITY_PIN_TERMS = {
  pin_90: '100% upfront',
  exclusive_90: '100% upfront',
  anchor_12: '50/50'
};

/* ---------- who is being sold to ---------- */

export const CITY_PIN_VERTICALS = {
  food: {
    label: 'Food',
    target: 'Independent restaurant, 30 to 120 seats, chef owner or GM with a public email.',
    offer: 'Pin on that city Food vertical plus A table on the city instrument.',
    pitch: 'When the city reads warm or charged, their table is the one tap.'
  },
  night: {
    label: 'Entertainment and night',
    target: 'Club, cocktail room or live house. Not a stadium.',
    offer: 'Entertainment pin plus the night reading.',
    pitch: 'The city is charged. The door should be named.'
  },
  rooms: {
    label: 'Rooms',
    target: 'Motel, casa, riad, pension, or a host with three or more listings in one city. 5 to 40 keys, or a host who is the face of the listing.',
    offer: 'Property pin, A room, on that city.',
    pitch: 'Booking.com already takes 15%. This is a public tonight plate for 90 days.'
  },
  tours: {
    label: 'Tours and desks',
    target: 'Aurora, boat, walking or food tour. Owner operated.',
    offer: 'Pulse or Transport card plus a should you go secondary tap.',
    pitch: 'The city reads live. The desk does not.'
  },
  fashion_food: {
    label: 'Fashion and food hybrid',
    target: 'Concept store with a cafe, and only with a booking or shop URL.',
    offer: 'Pin on the hybrid vertical.',
    pitch: 'The same tonight logic, applied to a room people walk into.'
  }
};

// Not this week. Kept as data rather than as a note, so a lead in one of them
// is refused rather than argued about.
export const CITY_PIN_VERTICALS_CLOSED = {
  tech: 'Too slow to close this week.',
  finance: 'Too slow to close this week.',
  education: 'Too slow to close this week.'
};

/* ---------- where ---------- */

// The owner's Tier A list, deduplicated. Porto appeared five times in the brief
// and Tbilisi twice, which reads as a transcription slip rather than emphasis,
// so each city appears once here and the order is otherwise his.
export const TIER_A_CITIES = [
  'Medellin', 'Lisbon', 'Cape Town', 'Bangkok', 'Reykjavik', 'Helsinki',
  'Porto', 'Valencia', 'Krakow', 'Porto Alegre', 'Oaxaca', 'Cartagena',
  'Tbilisi', 'Tulum town', 'Chiang Mai', 'Hoi An', 'Essaouira', 'Split',
  'Kotor', 'Yerevan', 'Lviv', 'Accra', 'Kigali', 'Stellenbosch', 'Bariloche',
  'Queenstown', 'Banff', 'Bergen', 'Tallinn', 'Lyon', 'Bologna', 'Ghent'
];

// Do not lead with these. Not a ban on the city, a ban on opening the week with
// its tourism board, which is the habit this whole brief exists to break.
export const CITY_PIN_CITIES_NOT_LED = ['New York', 'London', 'Paris', 'Dubai', 'Tokyo'];

// A Tier B city has to earn its place on at least two of these, which is what
// stops the list turning into wherever the agent happens to have heard of.
export const TIER_B_SIGNALS = [
  'A seasonal spike in the next 45 days: festival, harvest, ski opening, carnival, a support act to something larger, pilgrimage, graduation, yacht week, film festival',
  'Strong local rivalry: two clubs on one street, two tasting rooms, two best view restaurants',
  'High Instagram and a weak owned website',
  'English, or the operator own language, available on their public email',
  'The owner still answers the inbox: a name on the contact page, not a hotel group form'
];

export const CITY_PIN_SKIP = [
  'Airport chains',
  'Marriott and Hilton flags',
  'Mega clubs with an in house media team',
  'Anyone whose only email is a Booking.com form'
];

/* ---------- what has to be known before anything is written ---------- */

// Nine fields. Four of them are the message itself and can never be missing;
// the brief says two missing means do not send, which is applied to the other
// five. A lead that cannot clear this is researched again rather than written
// to on assumption.
export const CITY_PIN_RESEARCH_HARD = [
  { key: 'city', label: 'City slug on Glotemp' },
  { key: 'vertical', label: 'Vertical' },
  { key: 'business_name', label: 'Legal business name and trading name' },
  { key: 'public_email', label: 'Public business email' }
];

export const CITY_PIN_RESEARCH_SOFT = [
  { key: 'proof', label: 'One specific proof they are the right room' },
  { key: 'rival_type', label: 'One local rival type, never a name' },
  { key: 'seasonal_hook', label: 'A spike inside 45 days' },
  { key: 'owner_first_name', label: 'Owner or GM first name, if public' },
  { key: 'booking_url', label: 'Their booking URL' }
];

// Where the address was published. The brief bans scraped personal Gmail and
// bought lists, and the thing that actually separates a public business inbox
// from a scraped one is not the domain, it is whether the operator published
// it. A small kitchen that lists its own gmail on its own site has published a
// business inbox. So provenance is what is recorded and checked, not the domain.
export const CITY_PIN_EMAIL_SOURCES = {
  own_site: 'Listed on their own website',
  google_business: 'Listed on their Google Business profile',
  instagram_bio: 'Listed in their Instagram bio',
  tripadvisor: 'Listed on their TripAdvisor entry',
  night_guide: 'Listed in a municipal night guide or festival programme'
};

// Refused outright. Every one of these is an address nobody chose to publish.
export const CITY_PIN_EMAIL_SOURCES_REFUSED = ['guessed', 'inferred', 'pattern', 'scraped', 'bought_list', 'enrichment_tool'];

export const CITY_PIN_QUOTA = {
  researched: 30,
  sent: 20,
  followUps: 5,
  callsOnlyOnReply: 2,
  stackedBy: 'vertical, so the agent stays in one head: 8 food, 6 rooms, 6 night'
};

/* ---------- the four master emails, as supplied ---------- */

export const CITY_PIN_FOOD_SUBJECT = '{City} Food, one table on the instrument';
export const CITY_PIN_FOOD_SUBJECT_ORIGINAL = '{City} Food — one table on the instrument';

export const CITY_PIN_FOOD_EMAIL = `{First name},

{City} already has a public pulse. People open it to see whether tonight is the night. The Food vertical is still open. One table gets the pin.

Glotemp is the live reading of a city, warm, charged, quiet, before anyone books. When the city is up, the next tap is A table. That tap should be {Trading name}, not the room across the plaza.

90 days. Named pin on {City} / Food. USD 490.
Category exclusive on that vertical: USD 790. Only one restaurant.

If the exclusive is not taken this week, it will be offered to another kitchen in {Neighbourhood}.

Reply LIVE and we invoice today.

Glotemp
glo-temp.com
{Agent name}, partnerships`;

export const CITY_PIN_NIGHT_SUBJECT = '{City} is charged. The door is not named.';

export const CITY_PIN_NIGHT_EMAIL = `{First name},

{City} is already on Glotemp as a live reading. Entertainment is still unpinned. That means a visitor can see the city is charged and still not know which door.

For 90 days we will put {Trading name} on that city Entertainment plate and on Tonight. USD 490, or USD 790 to keep the vertical exclusive so the room down the street cannot buy the same pin.

This is not a flyer. It is the name on the instrument.

Reply LIVE.

Glotemp
glo-temp.com
{Agent name}, partnerships`;

export const CITY_PIN_ROOM_SUBJECT = '{City}, A room, 90 days';
export const CITY_PIN_ROOM_SUBJECT_ORIGINAL = '{City} — A room, 90 days';

export const CITY_PIN_ROOM_EMAIL = `{First name},

People who open Glotemp are not browsing 40 tabs. They are asking whether to go, then where to sleep.

{City} has a live pulse. The A room tap is empty. {Trading name} should sit on it for the next 90 days, USD 490. Exclusive for rooms in this city: USD 790.

Booking.com will still take its cut. This is the public plate before they arrive at that cut.

Reply LIVE and the listing or site URL.

Glotemp
glo-temp.com
{Agent name}, partnerships`;

export const CITY_PIN_TOUR_SUBJECT = '{City} reads live. The desk does not.';

export const CITY_PIN_TOUR_EMAIL = `{First name},

{Seasonal hook} is inside 45 days. Glotemp already shows whether {City} feels right. Pulse and Transport is open for one desk.

90 days USD 490. Exclusive USD 790.

Reply LIVE.

Glotemp
glo-temp.com
{Agent name}, partnerships`;

/* ---------- the follow ups ---------- */

// Three touches and then the file is let go. Written short on purpose: the
// brief sets 110 to 160 words for the first, 60 for day three, 40 for day
// seven, and a follow up that grows is a follow up that begs.
export const CITY_PIN_FOLLOW_UP_DAY_3 = `{First name}, the {Vertical} exclusive on {City} is still open. If we do not hear by Friday we will offer it to another house on {Street or barrio}. Same terms. USD 790 exclusive, USD 490 named pin.

Glotemp
glo-temp.com`;

export const CITY_PIN_FOLLOW_UP_DAY_7 = `We are pinning {City} / {Vertical} this week. Last note from us. Reply LIVE or we will let the file go.

Glotemp
glo-temp.com`;

export const CITY_PIN_CADENCE = [
  { day: 0, name: 'First email', words: '110 to 160', note: 'One city. One ask. One price. One reply instruction.' },
  { day: 3, name: 'Day three', words: '60', note: 'The exclusive is still open.' },
  { day: 7, name: 'Day seven', words: '40', note: 'We will offer the pin to another house on this street. Then the file is let go.' }
];

/* ---------- what happens after they reply ---------- */

export const CITY_PIN_ON_REPLY = [
  'One line invoice: SKU, city, vertical, 490 or 790, 90 days',
  'Payment link',
  'What is needed from them: logo or wordmark, booking URL, one sentence they approve',
  'Go live window: 5 working days after cleared funds'
];

/* ---------- the rules, as the owner wrote them ---------- */

export const CITY_PIN_GUARDRAILS = [
  { id: 'not_dubai_pricing', detail: 'No Visit Dubai pricing. This campaign is 490, 790 and 1900, and the floor is 390.' },
  { id: 'no_invented_traffic', detail: 'No claim of visitor numbers unless analytics prove it. Do not invent traffic.' },
  { id: 'published_inboxes_only', detail: 'Only public business inboxes the operator published themselves. No scraped personal addresses, no bought lists.' },
  { id: 'rival_never_named', detail: 'Rival language is that they will take the pin if you do not. Never name or shame a competitor in the body.' },
  { id: 'no_fake_letterhead', detail: 'No fake government letterhead.' },
  { id: 'one_of_everything', detail: 'One offer, one city, one vertical, one price. No freelancing below the floor.' },
  { id: 'one_exclusive', detail: 'One exclusive per vertical per city, and it is honoured.' },
  { id: 'det_is_unclosed', detail: 'Never imply DET or Visit Dubai has bought. That conversation is separate and open.' },
  { id: 'city_must_be_live', detail: 'The email says the city already has a public pulse. Do not send that to a city that is not live on glo-temp.com.' },
  { id: 'no_money_without_a_page', detail: 'A human confirms the city page can actually take a pin before an invoice goes out.' }
];

// The line the whole campaign sells under, kept in one place so it stays the
// same sentence in every message.
export const CITY_PIN_LINES = [
  'Know how a city feels before you go.',
  'Should you go. A room. A flight. A table.'
];

export const CITY_PIN_VOICE = 'Legacy house. Short sentences. No slang, no emoji, and never hope this finds you well. A firm that keeps an instrument, not a growth hacker. You may say your neighbour will. You may not say your neighbour is dying.';
