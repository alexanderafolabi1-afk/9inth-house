# Ninth House Autopilot, on Cloudflare Workers

This directory replaces `scripts/daily.mjs` and its GitHub Actions workflow
(`.github/workflows/ninthhouse-daily.yml`) with a Cloudflare Worker on Cron
Triggers. Same four shifts a day, same characters, same rota, same prompts,
same sanitisation. The only real change is plumbing: a GitHub Actions runner
has a git checkout and a filesystem; a Worker has neither, so file reads and
writes now go through the GitHub Contents API instead of `fs`, and there is
no `git` CLI, no `child_process`, anywhere in this code.

## What is here

- `wrangler.toml`: the Worker's name, entry point, and its four Cron Triggers
  (05:30, 11:30, 17:30, 23:30 UTC, matching the retired workflow exactly).
- `src/index.js`: the full autopilot cycle, ported from `scripts/daily.mjs`.

## One-time setup

### 1. Install wrangler

From inside this `worker` directory:

```
npm install -g wrangler
```

or, without a global install, prefix every command below with `npx`, for
example `npx wrangler login`.

### 2. Log in to Cloudflare

```
wrangler login
```

This opens a browser window to authorise the CLI against your Cloudflare
account. This step needs an interactive browser session, so it cannot be
run for you unattended. You (the CEO) need to run this yourself, once, on a
machine with a browser.

### 3. Set the secrets

`ANTHROPIC_API_KEY` and `GITHUB_TOKEN` are required. The Worker checks for
both at the start of every run and logs a plain error (never the secret
value itself) and stops if either is missing. `IWRITEYOUREAD_GITHUB_TOKEN`
is required only for the iwriteyouread job (see below); if it is absent,
that one job logs a message and skips itself, the rest of the cycle runs
exactly as before.

```
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GITHUB_TOKEN
wrangler secret put IWRITEYOUREAD_GITHUB_TOKEN
```

Each command will prompt you to paste the value; it is sent straight to
Cloudflare's secret store and is never written to disk, to `wrangler.toml`,
or to any log here.

**Where to get `ANTHROPIC_API_KEY`:** the Anthropic Console
(console.anthropic.com), under API Keys. Use the same key already stored as
a GitHub Actions secret for this repo, or generate a fresh one and, if you
generate a fresh one, revoke the old one afterwards.

**Where to get `GITHUB_TOKEN`:** GitHub, under Settings > Developer settings
> Fine-grained tokens > Generate new token. Scope it to:
- Repository access: only `alexanderafolabi1-afk/9inth-house`, not all repos.
- Permissions: Contents, Read and write. Nothing else is needed; do not grant
  broader scopes than this.
Set an expiry and calendar a reminder to rotate it before it lapses, since an
expired token will silently stop the cycle from writing anything (the Worker
will log a GitHub API 401 and stop that run, it will not crash loudly
anywhere you'd see unless you are watching `wrangler tail` or the Cloudflare
dashboard).

**Where to get `IWRITEYOUREAD_GITHUB_TOKEN`:** the same GitHub screen
(Settings > Developer settings > Fine-grained tokens > Generate new token),
but a second, separate token, scoped to:
- Repository access: only `Lyrion1/iwriteyouread`, not `9inth-house` and not
  all repos.
- Permissions: Contents, Read and write. Nothing else.
This must be a different token from `GITHUB_TOKEN` above. Keeping them
separate means a compromise of one token can never reach the other repo;
`GITHUB_TOKEN` is never used against `Lyrion1/iwriteyouread` anywhere in
this code, and `IWRITEYOUREAD_GITHUB_TOKEN` is never used against this repo.

**`AUTHOR_DESK_TRIGGER_TOKEN` is optional.** It only gates the manual
media pack trigger described under "The Author Desk" below. If you never
set it, that one HTTP endpoint simply refuses every request with a 401;
nothing else is affected. If you do want to be able to trigger a press
kit rebuild on demand, pick any long random string yourself (this is a
shared secret you invent, not something to fetch from a provider) and:

```
wrangler secret put AUTHOR_DESK_TRIGGER_TOKEN
```

### 4. Deploy

```
wrangler deploy
```

This uploads the Worker and registers its four Cron Triggers with Cloudflare.
From this point on, the four shifts fire on Cloudflare's own schedule,
independent of GitHub Actions entirely.

### 5. Watch it run

```
wrangler tail
```

streams live logs from the Worker. Nothing in this codebase ever logs
`ANTHROPIC_API_KEY` or `GITHUB_TOKEN`; errors are truncated and only ever
carry the GitHub or Anthropic API's own response text, which does not
include your credentials.

You do not need to wait for the next scheduled time to see it work locally:
`wrangler dev --test-scheduled` runs a local dev server, and hitting
`http://localhost:8787/cdn-cgi/mf/scheduled` (wrangler prints the exact URL
on startup) fires the `scheduled` handler immediately against your real
secrets, so you can watch one full cycle end to end before trusting the
cron.

## What changed in behaviour, and what did not

Unchanged: the four shifts, the character roster and their prompts, the
weekday rota, the dawn-only Morning Tray desks, the Sunday Order, the Wire
Brief, the Night Press (one article a night, dawn shift only, same
CEO_ACTIONS delimiter split, same dash and markdown stripping before
anything public is published), the 30-day autopilot ledger trim, the unique
run ID per shift so two shifts on the same day never collide.

Changed, by necessity of the platform:
- **One commit per file, not one commit per cycle.** The old workflow made
  one git commit at the end covering every changed file. The GitHub Contents
  API commits per file, so a Dawn shift with a Night Press publish now
  produces several small commits (autopilot.json, wire.json,
  press/index.json, press/index.html, the new article, and sitemap.xml, each
  on its own) instead of one. Nothing in the content itself differs, only
  the commit granularity.
- **Commit author.** Commits from this Worker are attributed to "Ninth House
  Autopilot <autopilot@users.noreply.github.com>", the same identity the old
  workflow's `git config` used.

## The iwriteyouread job (Dawn shift only)

On the Dawn shift, and only the Dawn shift, the Worker also writes one
literary blog post to a completely separate repository,
`Lyrion1/iwriteyouread`, under its own token (see above). This is entirely
self-contained: it never reads or writes anything in this repo, and its own
`try`/`catch` means a failure here can never stop the standup, the packs,
the Wire Brief or the Night Press. Skipping this job entirely (because the
secret is not set yet, or because the API call fails) costs the main engine
nothing.

Each run:
1. Lists `public/blog` in that repo and reads up to three existing posts, to
   learn the established voice.
2. Makes one Anthropic call, without the web search tool (this is literary
   reflection, not reportage, so there is nothing to search for and one
   plain call keeps the cost down), asking for a new post: literary
   reflection, a note on the craft of writing, or commentary on poetry. The
   model is instructed never to invent biographical claims, quotes, or
   events; it writes about craft and reflection in general terms.
3. Publishes the new post into `public/blog`.
4. Updates a blog index, only if one of a short list of common filenames
   (`index.json`, `posts.json`, `blog.json`) is found there as a JSON array.
5. Updates `sitemap.xml` at the repo root, the same way the Night Press
   updates this repo's own sitemap.

**I could not inspect `Lyrion1/iwriteyouread` while writing this** (this
session only has access to `9inth-house`), so nothing here is hardcoded to
an assumed file layout: the blog directory is listed at runtime rather than
guessed, and the index update step only fires if it finds a recognisable
JSON array, otherwise it logs that it skipped and moves on rather than
risking a bad guess against a real site. Worth a look after the first Dawn
run: check `wrangler tail` for `iwriteyouread:` log lines, and confirm the
new post, and the index and sitemap updates if applicable, look right in
that repo. If the real blog index uses a different shape (not a plain JSON
array, or a different filename entirely), that one step will need a small
follow-up change once the actual format is known; nothing else in this job
depends on it.

## The Author Desk

Four jobs in support of the CEO's own book, *The Spirit of America: Views
from the Other Side* (paperback, https://www.amazon.co.uk/dp/B0G58J7DF5).
Each is wrapped in its own `try`/`catch`, so a failure in any one of them
can never touch the standup, the packs, the Wire Brief, the Night Press,
or the iwriteyouread job. All four write only into this repo's own
`/press` directory using the existing `GITHUB_TOKEN`; none of them touch
`Lyrion1/iwriteyouread` or its token.

Each job is assigned to the existing partner from `firm.html`'s roster
whose stated role fits it best. No new partners were created.

1. **Media pack, assigned to Sipho Dlamini (Head of Partnerships & PR).**
   Runs once, the first time the Worker fires after this code is deployed,
   then never again on a plain cron cycle; it checks whether
   `press/media-kit/fact-sheet.md` already exists and skips itself if so.
   Assembles `press/media-kit/author-bio.md` (50, 100 and 250 word bios),
   `press/media-kit/interview-questions.md` (five questions with the
   angle behind each), `press/media-kit/book-synopsis.md`,
   `press/media-kit/fact-sheet.md`, and `press/media-kit/boilerplate.md`.
   One Anthropic call, without the web search tool, covers the bios and
   the questions; the fact sheet and boilerplate are written directly from
   confirmed facts, no model call needed for those.

   To redo it on demand:
   ```
   curl -X POST https://<your-worker-subdomain>.workers.dev/author-desk/media-pack \
     -H "Authorization: Bearer <your AUTHOR_DESK_TRIGGER_TOKEN>"
   ```
   Declines with 401 if the secret is not set or the header does not match.

2. **Social week, assigned to Noor Haddad (Head of Communications & Brand
   Uniformity).** Runs on the Dawn cron every Monday. One Anthropic call,
   without the web search tool, writes seven paste-ready posts for the
   coming week, mixed across LinkedIn, Instagram and X, one angle per day:
   a craft insight, a line from the book with context, the writing
   process, a reader question, the bridge between the professional life
   and the writing life, a soft buy prompt, and a reflection. Only the
   soft buy prompt day includes the buy link; the model is instructed to
   place a plain placeholder for the "line from the book" rather than an
   invented quote, since the book's actual text was never supplied. Writes
   `press/social-week.json` for the Desk PWA to read.

3. **Author growth research, assigned to Chidinma Balogun (Head of
   Advancement & Grants), the partner whose desk already does exactly
   this pattern for the venture portfolio's own grants and competitions.**
   Runs on the 17:30 cron every Wednesday. One Anthropic call with the web
   search tool on, looking for currently open review and feature
   submission windows, live literary awards and prizes, podcasts and
   newsletters taking author guests, and reader community routes.
   Instructed to name a category empty rather than fill it with generic
   or closed material. Prepends a dated entry to `press/growth-log.md`,
   newest at the top.

4. **Biographer assignment, assigned to Dr. Lena Castellanos (Head of
   Research & Market Intelligence), the partner on the roster closest to
   research and editorial discipline.** Creates `press/next-project.md`
   the first time the Worker runs, with her name and role, a stated remit,
   and three opening questions for the author to answer in his own words
   whenever he is ready. On the 23:30 cron every Friday, one Anthropic
   call (no web search) reads the current file and appends exactly one new
   question, drawn from what is not yet asked or answered. She drafts no
   biographical prose anywhere in this code; the only thing this job ever
   writes is a question.

**An honest limit on the media pack and the social week's "line from the
book" day:** no synopsis, plot detail, or actual line from the book was
ever supplied to write this. The synopsis file is filled with `[TO
CONFIRM]` placeholders rather than an invented description, and the
social week's book-line day carries a placeholder token instead of a
quote. Both need the author's own input before they read as finished;
neither should be published as-is.

## Known limits worth watching

**CPU time on the Workers Free plan is 10 milliseconds of actual JavaScript
execution per invocation** (this does not include time spent waiting on
`fetch()`, which is most of what this Worker does, but it does include every
`JSON.parse`, `JSON.stringify`, and regex pass over the article and pack
text this cycle generates). A full shift, especially a Dawn shift with the
Morning Tray desks and the Night Press, does a fair amount of that kind of
work, and it is genuinely possible a full cycle exceeds the free plan's
10ms budget and gets cut off mid-run with an "Exceeded CPU Limit" error.
This is not something that can be fixed in `wrangler.toml` on the free
plan; the CPU time cap can only be raised by moving to Workers Paid
(five US dollars a month, minimum), which raises the default budget to 30
seconds. I cannot verify which side of that 10ms line this workload falls
on without running it against your real secrets, so: deploy, watch
`wrangler tail` or the Cloudflare dashboard's Worker metrics for CPU limit
errors over the first few days, and if you see them, Workers Paid is the
fix, still a small fraction of what GitHub Actions billing could run to.

**Cron Triggers have a 15 minute wall-clock limit per invocation**, free or
paid. A full cycle's chain of Anthropic calls (several of them use the web
search tool, which adds real latency) plus the GitHub API round trips should
comfortably fit inside that, but if Anthropic is having a slow day this is
the ceiling.

**Subrequests**: the free plan allows 50 fetch calls per invocation. The
busiest realistic ongoing shift (a Dawn shift that is also an incident and
also a Monday, so every desk fires, plus iwriteyouread, plus the Author
Desk's social week and its two "already done" marker checks) comes to
roughly 42, still under the limit but with less room to spare than before.
The single narrow edge case that comes close to the ceiling is the very
first deploy, if that first cron firing happens to land on an incident
Monday Dawn: the media pack and the biographer's first-run file creation
both do more work than on every run after, which could bring that one
specific invocation up to roughly 49. This is a one-time risk on the very
first run only; every run after settles back to roughly 42 or fewer.

## What remains for the CEO to do

Everything in "One-time setup" above requires you directly: I cannot run
`wrangler login` (it needs an interactive browser), and I cannot paste your
API key or GitHub tokens anywhere (that is exactly what "never print secrets"
means in practice). Concretely, the steps only you can do are:

1. Confirm the Cloudflare account exists (it does, from the domain work
   already done).
2. Run `wrangler login` from a machine with a browser.
3. Run `wrangler secret put ANTHROPIC_API_KEY`,
   `wrangler secret put GITHUB_TOKEN`, and
   `wrangler secret put IWRITEYOUREAD_GITHUB_TOKEN`, pasting each value when
   prompted. The third is a separate fine-grained token scoped only to
   `Lyrion1/iwriteyouread`, not this repo; see "Where to get
   IWRITEYOUREAD_GITHUB_TOKEN" above.
4. Run `wrangler deploy` from inside this `worker` directory.
5. Once deployed, watch `wrangler tail` (or the Cloudflare dashboard) around
   the next scheduled shift time to confirm a cycle runs clean, and keep an
   eye out for CPU limit errors in the first few days per the note above.
6. After the first Dawn run, check `Lyrion1/iwriteyouread` directly: confirm
   the new post reads well and that the index and sitemap updates, if any,
   look right. See "The iwriteyouread job" above for what to do if the real
   blog index turns out to use a different shape than a plain JSON array.
7. After the first run of any kind, check this repo's own `/press/media-kit/`
   and `/press/next-project.md`: fill in the book's actual synopsis and the
   fact sheet's price where they say `[TO CONFIRM]`, and answer whichever of
   the biographer's opening questions you are ready to answer, directly in
   `next-project.md`, in your own words.
8. If you want the on-demand media pack rebuild, set `AUTHOR_DESK_TRIGGER_TOKEN`
   (step 3 above) and keep that string somewhere safe; it is the only thing
   that authorises `POST /author-desk/media-pack`.
9. Set up the desk admin's login: run `node scripts/hash-password.mjs`, set
   `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`, connect the `LOGIN_ATTEMPTS` KV
   namespace, and connect the `9thpoint.com/api/*` Route. See "Authentication"
   under "The distribution engine" below; none of it can be done for you, since
   it means choosing a password and confirming your own Cloudflare zone.

Nothing else in this repository change requires action from you; the
GitHub Actions workflow is disabled (its schedule is commented out, its
manual "Run workflow" button still works as a fallback) and needs no
further changes unless you want it removed entirely later.

---

# The distribution engine

This is the part that writes the social posts, holds them in a queue, waits for
you to approve them, and publishes the ones you approve. It sits on the same
Worker as everything above and it cannot break any of it: if its storage is not
connected, or one of its jobs fails, the autopilot, the Night Press and the
journal all carry on untouched.

How it runs, in order:

1. **05:30, generate.** For each active venture it works out what is owed today
   from that venture's own weekly cadence, writes the copy, and puts it in the
   queue. It publishes nothing.
2. **You are told.** A notification goes to your phone saying how many posts are
   waiting across how many ventures. Tapping it opens the queue.
3. **You approve.** Open the desk, read each card, then approve, edit, schedule
   or skip. Approving sends it immediately.
4. **Every shift, the sweep.** Anything you scheduled goes out at the first shift
   after its time.
5. **17:30, the readings.** If a metrics source is connected, the numbers are
   stored. What performs is generated more often. What you skip is generated less.

Everything publishes through the single Make.com webhook. The Worker never holds
a LinkedIn, X or Instagram credential, and never talks to those platforms itself.

## Which secrets are required

Set each with `npx wrangler secret put NAME` from inside the `worker` directory,
pasting the value when it asks. They are never written into the repo.

**Required for the engine to do anything:**

| Secret | What it is |
|---|---|
| `MAKE_WEBHOOK_URL` | The Make.com webhook address that actually posts. Never write this into a file. |
| `ADMIN_PASSWORD_HASH` | The owner's login password, hashed. Never the password itself. Generate it with `node scripts/hash-password.mjs` from the repo root (see "Authentication" below) and paste its output here. |
| `SESSION_SECRET` | Any long random string, used to sign the session cookie. Generate one with `openssl rand -base64 32`, or anything else that is long and unguessable. Rotating it instantly signs every device out. |
| `ANTHROPIC_API_KEY` | Already set. The engine writes the copy with it, and the desk admin's AI features (standup, board, commissioning a partner) now also go through this same key on the Worker, never in the browser. |

**Required for the morning notification:**

| Secret | What it is |
|---|---|
| `VAPID_PUBLIC_KEY` | Notification key, public half. |
| `VAPID_PRIVATE_KEY` | Notification key, private half. |
| `VAPID_SUBJECT` | `mailto:` and your email address, for example `mailto:hello@9thpoint.com`. |

You do not have to invent the two VAPID keys. Once you are signed in (see
"Authentication" below), ask the engine to make a pair for you, keeping a
cookie jar across the two calls since `/social/push/keys` needs the session:

```
curl -c cookies.txt -X POST https://9thpoint.com/api/auth/login \
  -H "Content-Type: application/json" -d '{"password":"YOUR-PASSWORD"}'
curl -b cookies.txt -X POST https://9thpoint.com/api/social/push/keys
```

It answers with both keys. Paste them straight into
`npx wrangler secret put VAPID_PUBLIC_KEY` and
`npx wrangler secret put VAPID_PRIVATE_KEY`. The private one is never stored by
the Worker and is not shown twice, so if you lose it, just make another pair.

**Optional:**

| Secret | What it is |
|---|---|
| `NOTIFY_EMAIL_WEBHOOK` | Somewhere to post the morning note if the phone notification cannot be delivered. Email is the fallback, never the main route. |
| `METRICS_WEBHOOK_URL` | Somewhere the engine can ask for impression and engagement numbers. Without it the engine never invents a number, it just has none. |
| `DESK_ORIGIN` | Which web addresses may use the admin, comma separated. Defaults to `https://9thpoint.com,https://www.9thpoint.com`. Kept as defense in depth; the admin itself now calls the Worker same-origin (see "Authentication"), so this mostly matters if something else ever needs to call `/social` cross-origin. |

## Authentication

The whole admin, and every route behind it, requires signing in with a single
owner password. There is no username, and no way to reach `/social`, `/desk`,
or the queue without a valid session.

**Required, in order, before the admin will work at all:**

1. **Choose the password.** From the repo root: `node scripts/hash-password.mjs`.
   It asks for the password twice (hidden input), and prints a hash, not the
   password itself. Set it: `cd worker && npx wrangler secret put ADMIN_PASSWORD_HASH`,
   pasting the printed value.
2. **Set `SESSION_SECRET`** (see the table above): `npx wrangler secret put SESSION_SECRET`.
3. **Connect the login rate limiter.** This is not optional the way the D1
   database below is: with no `LOGIN_ATTEMPTS` KV binding, `POST /api/auth/login`
   refuses every request rather than allow unlimited guesses, so nobody,
   including the owner, can sign in until this is connected.
   ```
   cd worker && npx wrangler kv namespace create LOGIN_ATTEMPTS
   ```
   Paste the id it prints into the `LOGIN_ATTEMPTS` block near the top of
   `worker/wrangler.toml`, delete the `#` from those three lines, commit and push.
4. **Connect the same-site Route**, so the session cookie actually works. The
   admin lives on `9thpoint.com`; a `SameSite=Strict` cookie set by a Worker on
   only the `.workers.dev` domain would never be sent back by the browser, so
   the Worker needs to answer on `9thpoint.com/api/*` too. This needs
   `9thpoint.com`'s DNS to be on the same Cloudflare account used for
   `wrangler login`. Paste the zone into the `routes` block near the top of
   `worker/wrangler.toml`, delete the `#` from those three lines, commit and push.

Once all four are done, `9thpoint.com/desk.html` shows a login screen instead
of the app, and stays that way until the right password is entered. Five wrong
attempts from one IP lock it out for fifteen minutes. Signing in sets a cookie
that lasts 30 days; "Sign out" in Settings clears it early.

The `/author-desk/media-pack` trigger and everything under `/social` and
`/desk` on the `.workers.dev` domain (bearer-token routes, or curl with a
cookie jar as above) are unaffected by any of this and keep working exactly
as documented; the login only gates the browser admin.

## First time setup, in order

1. **Make the database.** `cd worker && npx wrangler d1 create ninth-house-social`
2. **Connect it.** Open `worker/wrangler.toml`, find the block at the bottom
   marked STORAGE, paste the id it just printed, and delete the `#` from those
   four lines. Commit and push.
3. **Set up authentication.** See "Authentication" above; the admin will not
   load at all until this is done.
4. **Set the remaining secrets** in the table above.
5. **Open the desk** at `9thpoint.com/desk.html` and sign in with the password
   you chose in step 3.
6. **Tap "Prepare storage"** once. That creates the tables and puts the first
   venture on the books.
7. **Tap "Turn on notifications"**, then "Send a test".
8. **Tap "Generate now"** to see the queue fill without waiting for the morning.

## How to add a venture

In the desk, Queue tab, "Add a venture". No code, no deploy, no help needed.

Fill in the slug, the name, the site, and then the four boxes that matter most:

- **Positioning.** What it is, who it serves, why it wins. This is what the copy
  is actually written from, so a vague paragraph gives vague posts.
- **Audience.** Who is really reading.
- **Tone.** How it speaks, and how it never speaks.
- **Words it never uses.** A comma separated list. Anything here is banned from
  its copy.

Then set the posts a week per platform, and the mix. Save, and it starts
generating on the next dawn shift.

Two ventures never sound alike as long as those four boxes differ. If two
ventures start reading the same, the positioning is doing too little work.

## How to change a cadence

Queue tab, "Edit ventures", pick the venture, change the number of posts a week
for that platform, save.

Zero switches a platform off for that venture without deleting anything. The
engine spreads what is owed across the days left in the week rather than posting
it all at once, and a venture that has met its target for the week is given
nothing to pad with.

To stop a venture entirely for a while, use Pause in "Edit ventures". Nothing more
is generated for it, and nothing already in the queue is lost.

## How to add a platform

Two steps, in this order.

1. **In Make**, add a branch for it on the existing webhook, routing on the
   `platform` field the way the LinkedIn branch already does. The rail receives
   `venture`, `platform`, `text`, `image_url` and `link` on every post.
2. **In the code**, add one entry to `worker/src/social/config.js` under
   `PLATFORMS`, giving its label, its character limit, whether it needs an image,
   and how many hashtags it takes. Deploy.

It then appears by itself in the venture form, ready to be given a cadence. No
other file changes, because nothing else in the engine knows what a platform is:
there is a check in `scripts/check-social.mjs` that fails the build if any module
other than the config starts naming platforms.

Only LinkedIn is live on the rail as at 12 August 2026, which is why the first
venture is seeded with LinkedIn alone. Queueing posts for a platform the rail
cannot route yet would only fill your morning with things that cannot be sent.

## Checking it yourself

A note for anyone reading this after a login secret was set via the dashboard
and the Worker still answered "Login is not configured": pushing any change
to this file forces a fresh deploy, which has been observed to be the fix
when a dashboard-added secret does not appear to be picked up by the
already-running Worker.

```
curl https://YOUR-WORKER-ADDRESS/social/selfcheck \
  -H "Authorization: Bearer YOUR-DESK-ADMIN-TOKEN"
```

It answers with which secrets are set, whether storage is connected, which
platforms are configured, and whether the no em dash rule is holding. It never
prints a secret, only whether one is present.

`node scripts/check-social.mjs` from the repo root runs the engine's own checks:
the cadence arithmetic, the category mix, the send guards, and the notification
encryption, which is verified by decrypting its own output rather than trusted.

## Things worth knowing

- **Nothing publishes twice.** Approving claims the row in the database before
  anything is sent, so a double tap, a retried request or two phones at once all
  collapse into one post. A post that has already gone can never be sent again.
- **Approve all** sends up to twenty five at a time and tells you how many are
  left, because a Worker has a limit on how many outbound calls one request may
  make.
- **The engine does not make images.** A post that needs one is queued with a
  description of the image to make, and refuses to send until you paste in the
  address of an image you have hosted. That is deliberate: it will not invent a
  picture and it will not fabricate a link to one.
- **Skipping matters.** A skip is kept, not deleted, and counts against that kind
  of post when the next batch is written. It is the strongest signal you give it.
- **No number is ever invented.** If no metrics source is connected, the engine
  has no readings, says so, and generates unbiased. It will not estimate.
