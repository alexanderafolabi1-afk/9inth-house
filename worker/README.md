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
busiest realistic shift (a Dawn shift that is also an incident and also a
Monday or Thursday, so every desk fires, plus the iwriteyouread job's own
directory listing, sample reads, one call, and its post, index and sitemap
writes) comes to roughly 37, still comfortably under the limit.

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

Nothing else in this repository change requires action from you; the
GitHub Actions workflow is disabled (its schedule is commented out, its
manual "Run workflow" button still works as a fallback) and needs no
further changes unless you want it removed entirely later.
