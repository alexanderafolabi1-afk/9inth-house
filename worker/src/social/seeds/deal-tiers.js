// What a closed deal is worth, read from what the house has already
// published rather than typed in fresh at the moment of recording. Every
// figure below already exists somewhere the public can see it: City Pin and
// SetPostGo's own campaign boards (seeds/city-pin.js, seeds/setpostgo.js),
// NAGORI's tiers as stated on the desk and in the house's own briefing
// context (worker/src/index.js, desk.html's BIZ.nagori), and Ninth House's
// own partner packs and standalone products as sold on index.html (the
// PACKS and PAY objects there). Nothing here is invented; a deal at a
// non-standard value is still recorded, the owner just types that amount
// instead of picking a tier.
//
// RenviaIT carries no tier list on purpose: every RenviaIT deal (a
// collection contract, a resale lot) is its own negotiation, so there is
// nothing published to pick from.

import { CITY_PIN_SKUS } from './city-pin.js';
import { SETPOSTGO_PLANS } from './setpostgo.js';

export const DEAL_TIERS = {
  glotemp: Object.entries(CITY_PIN_SKUS).map(([key, s]) => ({
    key, label: s.label, amount: s.priceUsd, currency: 'USD'
  })),
  setpostgo: Object.entries(SETPOSTGO_PLANS)
    .filter(([, p]) => p.gbp > 0)
    .map(([key, p]) => ({ key, label: p.label, amount: p.gbp, currency: 'GBP' })),
  nagori: [
    { key: 'nagori', label: 'Nagori', amount: 1.99, currency: 'GBP' },
    { key: 'kotodama', label: 'Kotodama', amount: 19.99, currency: 'GBP' },
    { key: 'tamashii', label: 'Tamashii', amount: 74.99, currency: 'GBP' },
    { key: 'eien', label: 'Eien', amount: 149.99, currency: 'GBP' }
  ],
  renviait: [],
  ninthhouse: [
    { key: 'audit', label: 'The Audit', amount: 99, currency: 'GBP' },
    { key: 'floor_walk', label: 'Floor Walk', amount: 150, currency: 'GBP' },
    { key: 'brochure', label: 'The Brochure', amount: 29, currency: 'GBP' },
    { key: 'sprint_48', label: 'The 48-Hour Campaign Audit', amount: 297, currency: 'GBP' },
    { key: 'sprint_content', label: 'The Sealed Content Pack', amount: 497, currency: 'GBP' },
    { key: 'sprint_war_room', label: "The Founder War Room Brief", amount: 597, currency: 'GBP' },
    { key: 'pack_maren', label: 'The Boardroom Session (Maren)', amount: 149, currency: 'GBP' },
    { key: 'pack_jonah', label: 'Brand Platform Sprint (Jonah)', amount: 220, currency: 'GBP' },
    { key: 'pack_ingrid', label: 'Positioning Sprint (Ingrid)', amount: 220, currency: 'GBP' },
    { key: 'pack_valentina', label: '30 Day Social Series (Valentina)', amount: 160, currency: 'GBP' },
    { key: 'pack_adaeze', label: 'Africa Market Entry Map (Adaeze)', amount: 180, currency: 'GBP' },
    { key: 'pack_theo', label: 'Paid Media Test Plan (Theo)', amount: 150, currency: 'GBP' },
    { key: 'pack_priya', label: 'SEO Sprint (Priya)', amount: 250, currency: 'GBP' },
    { key: 'pack_sipho', label: 'Press Pitch Pack (Sipho)', amount: 140, currency: 'GBP' },
    { key: 'pack_kenji', label: 'Lifecycle Flow Pack (Kenji)', amount: 180, currency: 'GBP' },
    { key: 'pack_noor', label: 'Brand Voice Bible (Noor)', amount: 160, currency: 'GBP' },
    { key: 'pack_lin', label: 'The Film Pack (Lin)', amount: 180, currency: 'GBP' },
    { key: 'pack_mei', label: 'Brand Image Pack (Mei)', amount: 120, currency: 'GBP' },
    { key: 'pack_rocio', label: 'Funnel Diagnosis (Rocio)', amount: 140, currency: 'GBP' },
    { key: 'pack_lena', label: 'Competitor Teardown (Lena)', amount: 160, currency: 'GBP' },
    { key: 'pack_amara', label: 'Impact Report (Amara)', amount: 180, currency: 'GBP' },
    { key: 'pack_tobias', label: 'Site Health Audit (Tobias)', amount: 120, currency: 'GBP' },
    { key: 'pack_margaret', label: 'Finance Health Check (Margaret)', amount: 160, currency: 'GBP' },
    { key: 'pack_chidinma', label: 'Grant Scan (Chidinma)', amount: 140, currency: 'GBP' },
    { key: 'pack_harrison', label: 'Funding Readiness Pack (Harrison)', amount: 220, currency: 'GBP' }
  ]
};

// Approximate, static, and disclosed as such: the firm-wide Backpack sums
// deals recorded in different currencies into one figure, and a private
// admin tracking its own pace against a monthly target needs a stable
// number more than it needs a live rate feed. Reviewed by hand rather than
// fetched, so a conversion never changes mid-month under the owner's feet
// while he is watching the bag fill. GBP is the pivot only because it was
// the first currency this table held; every conversion below goes through
// it as an intermediate step regardless of which two currencies are asked
// for, so it is never treated as more authoritative than USD or EUR.
export const FX_TO_GBP = {
  GBP: 1,
  USD: 0.79,
  EUR: 0.86
};

export const REPORTING_CURRENCIES = Object.keys(FX_TO_GBP);
export const DEFAULT_REPORTING_CURRENCY = 'USD';

// A deal is never re-priced: it keeps the currency it actually sold in.
// This is only ever used to fold a mixed-currency ledger into one number
// for the Backpack and the Board, computed fresh on every read against
// whichever currency is currently set as the firm's reporting currency, so
// changing that setting never requires rewriting history.
export function convertCurrency(amount, fromCurrency, toCurrency) {
  const from = FX_TO_GBP[String(fromCurrency || 'GBP').toUpperCase()];
  const to = FX_TO_GBP[String(toCurrency || 'GBP').toUpperCase()];
  const n = Number(amount) || 0;
  if (!from || !to) return Math.round(n * 100) / 100; // an unlisted currency passes through rather than being zeroed
  return Math.round((n * from / to) * 100) / 100;
}

export const DEAL_VENTURES = Object.keys(DEAL_TIERS);
