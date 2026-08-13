# NAGORI Media Package Mandate

Filed for the record, house style, effective this week.

---

## The mandate

Every desk working the NAGORI account delivers one media package per week.
That means Jonah (Brand & Creative), Sipho (Partnerships & PR), Kenji (CRM &
Retention), and Mei-Ling (Visual Design & Image) whenever her work touches
NAGORI that week.

A package is:

- 1 short vertical video, 15–30 seconds
- 3 still images
- 1 caption
- 3 hashtags

## Format

- 9:16 vertical
- Text on screen — every package must read with sound off
- Every package ends on the same closing frame:

  > nagori.xyz — write yours before the sky fills.

## Delivery

To the shared drive, by Friday 4pm, in a folder named:

```
NAGORI / [your name] / [date]
```

## Notes for the autopilot

Nothing in `worker/src/social/config.js` currently models a bundled
video-plus-stills-plus-caption unit — `CATEGORIES` produces one caption per
row, and `PLATFORMS.tiktok` only carries a `SHOT:` line describing a video
to be made by hand. If this mandate is to be driven through the autopilot
rather than tracked by hand, it needs a new category (e.g. `media_package`)
that requires all four assets together and enforces the closing frame line,
not a rewrite of the existing per-platform categories. Not built here —
flagging it so it isn't lost.
