// The Visit Dubai pack, held as supplied.
//
// The owner set this as the standard for founding partner outreach, and it is
// stored verbatim for that reason: the structure, the register, the length and
// the way the proposition is framed are the thing being referenced, and a
// paraphrase of a register is not a register. Later messages of this type are
// written against it, never assembled from it.
//
// The content belongs to the organisation it was written for. An agent takes
// the shape and leaves the facts, since reusing the facts would be exactly the
// template habit this replaces.

export const VISIT_DUBAI_EMAIL_BODY = `Dear Partnerships and Media Relations,

We watched your current film on a living-room television this week: Go where it feels right. Stay as long as you like.

That line is no longer a campaign. It is how people choose cities. The gap is that the feeling disappears the moment the pre-roll ends. There is no official place that tells a traveller, in the hour they are actually deciding, whether Dubai feels right today.

Glotemp is that place. glo-temp.com is a live city pulse, a public instrument that reads how a city feels before anyone books. Charged. Warm. Level. Restrained. Quiet. A score. The local hour. A single question underneath: should you go.

We are offering Visit Dubai the homepage of that instrument for twelve months.

What you own
Dubai as the opening city on glo-temp.com, the first reading the world sees.
A dedicated Dubai instrument on the city page: live band and number, sky and hour, and your existing thought, set in type: Go where it feels right.
Dubai pinned on the pulse map as the reference city against which other destinations move.
A monthly Dubai Pulse note for your team: how the city's reading shifted, which origin markets lingered, what should you go converted toward (flight, stay, table, where you want those doors to open).
Four cinematic stills a year, shot from the instrument, for your own channels. No extra production committee.

This does not replace Marriott, Emirates, CNN, or Millie Bobby Brown. Those buy attention in bursts. This is the object that stays on when the burst is over, and it is already speaking your language.

The arrangement we will not repeat
We are taking one founding destination on the homepage. One city. Twelve months. After that the rate is the rate.

Founding terms, if confirmed by 12 September 2026:
12 months of homepage priority and the Dubai city instrument.
Founding partner lock-up at 40% below the published annual homepage rate.
Month 13 at no charge if you renew before day 270.
Two additional origin-market overlays in year one (your choice of India, UK, GCC, or China) on the Dubai page.
A mid-year creative refresh at our cost, timed to your summer or winter push.
Exit after 90 days if the instrument is not live as specified.

The published homepage rate is USD 160,000 for twelve months. Visit Dubai's founding term is USD 96,000, invoiced as AED 353,000, with month thirteen included on a renewal before day 270.

We are not asking DET to fund an experiment. We are asking Visit Dubai to put its own line on the only surface built to carry it, every day, in public, next to every other city that wants the same traveller.

I can have a two-minute walkthrough and a still of the Dubai homepage on your desk this week. Reply with a time, or send us to the correct market lead and we will follow their process without noise.

The city already knows how it wants to be chosen. We built the instrument. The homepage is open once.

With respect,

[Full name]
[Title]
Glotemp
glo-temp.com
[direct phone]
[email]
Advertising and partnerships`;

// The subject as supplied carried an em dash, which the house rule forbids in
// any outbound message. Corrected rather than silently sent, and the original is
// kept beside it so the owner can put it back in one tap if he wants it.
export const VISIT_DUBAI_SUBJECT = 'Visit Dubai on the Glotemp homepage, 12 months, founding rate';
export const VISIT_DUBAI_SUBJECT_ORIGINAL = 'Visit Dubai on the Glotemp homepage — 12 months, founding rate';

// The owner asked for this to go first thing in the morning, meaning the morning
// after he handed the pack over: 08:00 Europe/London on 31 August 2026, which is
// 07:00 UTC. Written as a fixed instant rather than a rolling "next morning", so
// it records the morning he actually meant instead of drifting forward to
// whichever morning a deploy happens to land on.
export const VISIT_DUBAI_SEND_AFTER = '2026-08-31T07:00:00.000Z';

// The owner's routing, followed exactly. Leadership is deliberately absent from
// the send list: he said not to open with them, and a rule like that is worth
// more as a thing the code cannot do than as a note somebody remembers.
export const VISIT_DUBAI_TO = 'mediarelations@dubaidet.ae';
export const VISIT_DUBAI_CC = 'info@dubaidet.ae';

// Encoded from the owner's AGENT MUST NOT list. These are checked before the
// message is shown as ready, so a breach is caught here rather than after it has
// gone to a government tourism body.
export const VISIT_DUBAI_GUARDRAILS = [
  { id: 'never_email_leadership_first', detail: 'Do not open with H.E. Issam Kazim or H.E. Helal Saeed Almarri. Route through media relations and partnerships.' },
  { id: 'never_invent_audience', detail: 'No monthly visitors, uniques, rankings or a count of tourism boards. The about page has shown zero counters and inventing one would be a fabricated claim.' },
  { id: 'never_a_media_buy', detail: 'This is not a CPM media buy package and must not be described as one.' },
  { id: 'never_overlay_all_verticals', detail: 'Do not put all thirteen verticals on the hero.' },
  { id: 'never_promise_bookings', detail: 'Do not promise bookings the house cannot fulfil.' },
  { id: 'never_change_pricing', detail: 'Pricing is fixed by the owner: USD 160,000 published, USD 96,000 founding, USD 48,000 for a six month pilot only if procurement stalls. No agent may move these.' },
  { id: 'never_fake_the_score', detail: 'The live band and score shown must be the real reading. Do not dress it up.' },
  { id: 'never_claim_other_boards', detail: 'Glotemp does not represent other tourism boards and must not imply it does.' }
];

export const VISIT_DUBAI_PROSPECT = {
  organisation: 'Visit Dubai (Dubai Corporation for Tourism and Commerce Marketing)',
  venture: 'glotemp',
  campaign_type: 'founding_partner',
  locale: 'AE',
  contacts: [
    { name: 'Partnerships and Media Relations', email: 'mediarelations@dubaidet.ae', role: 'primary route' },
    { name: 'General enquiries', email: 'info@dubaidet.ae', role: 'cc' }
  ],
  research: {
    what_they_do: 'The city tourism and commerce marketing arm of Dubai, under the Department of Economy and Tourism, carrying the D33 mandate to double the emirate economy by 2033. Buys celebrity, broadcast and hotel distribution: Emirates, Marriott, Visa, Emaar, BBC, Bloomberg, CNN.',
    what_is_missing: 'Their films create a feeling that ends when the pre-roll ends. There is no official surface that answers whether Dubai feels right today, in the hour someone is deciding. Their own campaign line is already mood language with nothing behind it.',
    why_now: 'The line Go where it feels right, stay as long as you like is in market as of August 2026, and the founding homepage position is open once, with terms held to 12 September 2026.'
  },
  evidence: [
    { signal: 'live campaign in market', detail: 'YouTube pre-roll seen August 2026 carrying the mood line, labelled Visit Dubai' },
    { signal: 'visible budget and a body whose job is to spend it', detail: 'DCTCM runs 40 plus international offices and standing media partnerships' },
    { signal: 'named route to a human', detail: 'Published partnerships and media relations address, plus a travel trade contact process' },
    { signal: 'timing', detail: 'D33 mandate running, summer and winter pushes both ahead' }
  ]
};
