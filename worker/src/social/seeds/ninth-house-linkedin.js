// The 9thpoint LinkedIn seed batch.
//
// Twelve posts, which is four weeks at the venture's own cadence of three a
// week, written against the three pillars the owner set: real growth insight,
// real portfolio outcomes, and a standing line that the firm is open for new
// client partnerships.
//
// Every fact in here is published on 9thpoint.com and checkable by anyone who
// reads the post and then reads the site. The prices are the ones on the Seal
// Sprints section, the four situations are the ones on the manifesto, the
// regions are the ones in the site's own structured data, and the portfolio
// facts are the ones on the Clientele page. Nothing is estimated and nothing
// is rounded up.
//
// What is deliberately absent matters as much as what is here. There is no
// mention of how any of this is produced or run: no internal vocabulary, no
// cadence of internal meetings, no account of who or what does the work, no
// approval step, and no partner count. The owner's rule for the Glotemp side,
// that the workings stay private and only the output is public, applies here
// unchanged. The site's own headline positioning is more forthcoming than this
// batch is, which is a deliberate difference and is flagged in the report
// rather than resolved quietly here.
//
// NAGORI is absent by instruction, though it is a founding client on the site.

export const NINTH_HOUSE_VENTURE = '9thpoint';
export const NINTH_HOUSE_PLATFORM = 'linkedin';

// The facts these posts stand on, each with the page it came from, so any
// figure in the batch can be traced back to something published rather than to
// whoever last remembered it.
export const NINTH_HOUSE_SOURCE_FACTS = [
  { key: 'audit_price', value: '£297', source: '9thpoint.com, Seal Sprints' },
  { key: 'audit_turnaround', value: 'two working days', source: '9thpoint.com, Seal Sprints' },
  { key: 'content_pack_price', value: '£497', source: '9thpoint.com, Seal Sprints' },
  { key: 'content_pack_scope', value: 'three to five ready to use assets with distribution notes', source: '9thpoint.com, Seal Sprints' },
  { key: 'strategy_session_price', value: '£597', source: '9thpoint.com, Seal Sprints' },
  { key: 'strategy_session_scope', value: 'ninety minute strategy session with written notes', source: '9thpoint.com, Seal Sprints' },
  { key: 'regions', value: 'North America, Europe, Asia, Middle East, Africa, Latin America', source: '9thpoint.com, structured data on firm.html' },
  { key: 'base', value: 'Built in London', source: '9thpoint.com, homepage' },
  { key: 'contact', value: 'hello@9thpoint.com', source: '9thpoint.com, structured data and Engage section' },
  { key: 'setpostgo_scope', value: '89 professions across 12 categories', source: '9thpoint.com, Clientele' },
  { key: 'glotemp_verticals', value: 'food, transport, entertainment, health, education, sport, finance, fashion, property, tech, work, pulse', source: '9thpoint.com, homepage and glo-temp.com' },
  { key: 'renviait_scope', value: 'Milton Keynes, secure IT asset disposition and refurbished technology', source: '9thpoint.com, Clientele' }
];

// The four situations, taken word for word from the manifesto rather than
// paraphrased, because a paraphrase of a positioning statement is a different
// positioning statement.
export const NINTH_HOUSE_SITUATIONS = [
  'Founders past initial traction who cannot yet justify agency payroll',
  'SMEs that need marketing infrastructure, not just campaigns',
  'Diaspora and international founders building across two markets at once',
  'Institutions that want marketing at scale without losing governance'
];

export const NINTH_HOUSE_POSTS = [
  {
    id: 'nh-li-seed-01',
    pillar: 'insight',
    category: 'short_form',
    text: `Most small companies do not have a marketing problem. They have a frequency problem.

The work is good. The proposal that won last quarter was good. The job finished on Friday was good. None of it is written down anywhere a buyer will find it.

So the market forms its view from silence, and silence is never read as modesty. It is read as capacity, or worse, as closure.

The firms that pull ahead in a flat market are rarely the ones with the best campaign. They are the ones that showed up on a Tuesday in March when nobody was buying, so that in June, when somebody was, there was a record to read.

Frequency is not volume. It is being findable on the day the decision is made, which is a day you do not get to choose.

Ninth House works with founders and owner operators on exactly this. Built in London, working across six regions.

hello@9thpoint.com

#Marketing #B2B #SmallBusiness`
  },
  {
    id: 'nh-li-seed-02',
    pillar: 'portfolio',
    category: 'proof',
    text: `Ninth House was built inside a working portfolio rather than a pitch deck. Three of those ventures are in market now.

SetPostGo is a social content platform serving 89 professions across 12 categories. Not a template library with a job title filter on top: the copy is written for the profession, and the professional publishes it themselves.

Glotemp is a live register of cities, read across twelve verticals: food, transport, entertainment, health, education, sport, finance, fashion, property, tech, work and pulse. It runs continuously and takes no holidays.

RenviaIT is a Milton Keynes business in secure IT asset disposition and refurbished technology, where the sustainability claim is a weight rather than an adjective.

Different sectors, different buyers, different problems. The reason to say so is not the range. It is that every discipline this firm sells was sharpened on something with real stakes attached before it was ever sold to anyone else.

hello@9thpoint.com

#Portfolio #Growth`
  },
  {
    id: 'nh-li-seed-03',
    pillar: 'insight',
    category: 'educational',
    text: `A note on the gap that catches founders just past traction.

There is a stage where the founder is no longer the best person to do the marketing and the company is still a long way from justifying a marketing hire. Call it the middle. It is where most good companies lose two years.

What happens in the middle is predictable. Marketing becomes the thing that gets done after everything else, which means it gets done at eleven at night, which means it gets done badly or not at all. Then a quarter goes quiet, panic sets in, and the response is a campaign. The campaign runs, produces a spike, and the spike decays. Nothing compounds, because nothing was continuous.

The way out is not a bigger campaign. It is infrastructure: a position that does not get rewritten every month, a cadence that survives a busy week, and a record of the work that a buyer can find on their own timing rather than yours.

That is unglamorous, and it is the whole difference between marketing that costs money and marketing that returns it.

Ninth House exists for that stage specifically.

#Founders #Growth #Marketing`
  },
  {
    id: 'nh-li-seed-04',
    pillar: 'open',
    category: 'short_form',
    text: `Ninth House is open for new client partnerships.

The firm works with four situations in particular.

Founders past initial traction who cannot yet justify agency payroll.

SMEs that need marketing infrastructure, not just campaigns.

Diaspora and international founders building across two markets at once.

Institutions that want marketing at scale without losing governance.

If that is the shape of what you are building, the floor is open. Tell us what you are working on and what it needs to do this year.

hello@9thpoint.com

#Partnerships #Growth`
  },
  {
    id: 'nh-li-seed-05',
    pillar: 'insight',
    category: 'educational',
    text: `Premium brands lose more often to their own volume than to a competitor's budget.

The instinct when a quarter softens is to say more, more often, more loudly. For a premium proposition that is close to the worst available move. Volume is the register of a discounter. Say enough of it and the market quietly reprices you, and repricing is far harder to reverse than a slow quarter.

Restraint is not passivity. It is a specific discipline: fewer claims, each one carrying more weight, each one checkable. One number said plainly beats four adjectives. A named client beats a category. A price on the page beats a call to enquire.

The brands that hold a premium position through a downturn tend to be the ones that said less and meant more of it, and that were still visible on the day the buyer came back.

Ninth House works with premium consumer brands and professional practices that need visibility without noise.

hello@9thpoint.com

#Branding #Positioning #B2B`
  },
  {
    id: 'nh-li-seed-06',
    pillar: 'open',
    category: 'proof',
    text: `Three ways to start with Ninth House, priced and published.

A written campaign audit. What is working, what is not, and what to do about it, delivered within two working days. £297.

A content pack. Three to five ready to use assets with distribution notes, so the work arrives ready to go out rather than ready to be briefed again. £497.

A strategy session. Ninety minutes on the actual problem, with written notes afterwards, for founders who need the room rather than the advice. £597.

No retainer to start, no discovery call before you can see a price, and no proposal process that takes longer than the work.

hello@9thpoint.com

#Marketing #Founders`
  },
  {
    id: 'nh-li-seed-07',
    pillar: 'insight',
    category: 'short_form',
    text: `Two markets is not twice the work. It is a different job.

Founders building across two countries at once tend to run one position in both and wonder why the second one is slow. The proposition is fine. The proof is not portable.

A reference that closes deals in London means very little in Lagos, and a price that reads as premium in one market reads as inaccessible in the other. Even the shape of the buying process changes: the market that wants a case study and the market that wants an introduction are not the same market, and neither is wrong.

What travels is the position. What has to be rebuilt is the evidence for it, locally, in terms the second market already trusts.

Founders who accept that early get a second market. Founders who assume the first market's proof will carry get a second market that stays a pilot.

Ninth House works with diaspora and international founders on both sides of that.

#InternationalBusiness #Founders #Growth`
  },
  {
    id: 'nh-li-seed-08',
    pillar: 'portfolio',
    category: 'proof',
    text: `On building the thing you sell.

SetPostGo began as an answer to a problem this firm kept meeting: professionals who know exactly what they do, cannot spare the hour to write about it, and will not accept generic copy with their name on it.

The build is 89 professions across 12 categories. A plumber and a family solicitor are not the same writer with different nouns swapped in, and treating them as one is why most tools in that category are abandoned in the second month.

It is in market, it serves real professionals, and it is used by this firm for its own scheduling. That last part is not a boast. It is the only honest test of a product: whether the people who made it would rather use it than not.

hello@9thpoint.com

#SaaS #SmallBusiness #Marketing`
  },
  {
    id: 'nh-li-seed-09',
    pillar: 'insight',
    category: 'educational',
    text: `Why most marketing audits are worth nothing, and what to ask for instead.

The standard audit is a document that describes your current state back to you, adds a maturity score, and recommends a strategy engagement. You already knew the current state. You commissioned the audit to find out what to do.

A useful audit answers three questions and stops.

What is the one position this company should hold, stated in a sentence a customer would repeat.

Which of the things currently being done should stop this month, named specifically, including the ones somebody is fond of.

What are the next three pieces of work, in order, with the first one small enough to start on Monday.

If a document does not contain those, it is a diagnosis without a prescription, and diagnoses are cheap.

Ninth House writes that audit for £297, delivered within two working days.

hello@9thpoint.com

#Marketing #Strategy #Founders`
  },
  {
    id: 'nh-li-seed-10',
    pillar: 'portfolio',
    category: 'short_form',
    text: `Glotemp reads cities the way a market is read: continuously, and without holidays.

Twelve verticals, live: food, transport, entertainment, health, education, sport, finance, fashion, property, tech, work and pulse. The register is open and still opening.

The reason a growth firm builds something like that is not diversification. It is that reading a market properly and reading a city properly are the same discipline. Both punish anyone who takes a reading once and treats it as permanent. Both reward whoever is still looking when the picture changes.

Most companies research their market once, at the point of writing a deck, and then operate for years on a snapshot that stopped being true in the first quarter.

glo-temp.com

#Cities #Data #Growth`
  },
  {
    id: 'nh-li-seed-11',
    pillar: 'insight',
    category: 'educational',
    text: `Institutions do not have a marketing problem either. They have a governance problem wearing a marketing costume.

The pattern is familiar. The organisation needs to move at the speed of the market. It also needs every public statement to survive scrutiny, legal review, and a records request. So the work either moves fast and creates exposure, or it is governed properly and arrives too late to matter.

The usual response is to pick one. The better response is to separate them. Decide once, in writing, what the organisation is allowed to say, who owns each claim, and what evidence sits behind it. Then most output stops needing a decision at all, because the decision was already made at the level above it.

Speed and governance are only in tension when nobody has written the constraints down. Written down, they stop competing.

Ninth House works with institutions on exactly this.

hello@9thpoint.com

#Governance #Institutions #Marketing`
  },
  {
    id: 'nh-li-seed-12',
    pillar: 'open',
    category: 'short_form',
    text: `A standing note, for anyone reading this page for the first time.

Ninth House Growth Partners is a growth and marketing firm. Built in London, working across North America, Europe, Asia, the Middle East, Africa and Latin America.

It takes on founders, owner operators, SMEs and institutions. It is open for new client partnerships now.

There is no form to fill in before a human reads it. Write a paragraph about what you are building and what it needs to do this year, and you will get a straight answer about whether this is the right firm for it, including when it is not.

hello@9thpoint.com

#Growth #Marketing #Partnerships`
  }
];

// Idempotent, like every other seed in this engine: it can only create what
// does not already exist, so it is safe on every shift and every deploy. The
// ids are fixed rather than generated for exactly that reason.
export async function seedNinthHousePosts(db, { insertPost, scheduledFor } = {}) {
  let created = 0;
  for (const post of NINTH_HOUSE_POSTS) {
    const existing = await db.prepare('SELECT id FROM posts WHERE id = ?').bind(post.id).first();
    if (existing) continue;
    await insertPost(db, {
      id: post.id,
      venture: NINTH_HOUSE_VENTURE,
      platform: NINTH_HOUSE_PLATFORM,
      category: post.category,
      text: post.text,
      status: 'queued',
      scheduled_for: scheduledFor ? scheduledFor(post) : null,
      notes: `Seed batch, ${post.pillar} pillar. Every fact in it is published on 9thpoint.com.`
    });
    created += 1;
  }
  return { created };
}
