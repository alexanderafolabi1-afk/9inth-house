// The firm's own partner roster, held here just enough to resolve a name
// captured on a sent message back to a stable id: the id and the name, not
// the bios or system prompts desk.html carries for the same nineteen
// people. Two copies of the same roster already exist in this house
// (worker/src/index.js's persona list and desk.html's CHARS), each shaped
// for what reads it; this is a third, deliberately the smallest one,
// because attribution only ever needs to ask "whose name is this."
export const PARTNERS = [
  { id: 'maren', name: 'Maren Okafor-Vale' },
  { id: 'jonah', name: 'Jonah Whitfield' },
  { id: 'ingrid', name: 'Ingrid Sørensen' },
  { id: 'valentina', name: 'Valentina Ibarra' },
  { id: 'adaeze', name: 'Adaeze Nwosu' },
  { id: 'theo', name: 'Theo Lindqvist' },
  { id: 'priya', name: 'Priya Raman' },
  { id: 'sipho', name: 'Sipho Dlamini' },
  { id: 'rocio', name: 'Rocco Fuentes' },
  { id: 'kenji', name: 'Kenji Hara' },
  { id: 'tobias', name: 'Tobias Renner' },
  { id: 'margaret', name: 'Margaret Osei' },
  { id: 'lena', name: 'Dr. Lena Castellanos' },
  { id: 'amara', name: 'Amara Diallo' },
  { id: 'noor', name: 'Noor Haddad' },
  { id: 'lin', name: 'Lin Chen' },
  { id: 'chidinma', name: 'Chidinma Balogun' },
  { id: 'mei', name: 'Mei-Ling Chow' },
  { id: 'harrison', name: 'Harrison Cole III' },
  { id: 'bea', name: 'Bea Whitmore' }
];

const byId = new Map(PARTNERS.map((p) => [p.id, p]));
const byLowerName = new Map(PARTNERS.map((p) => [p.name.toLowerCase(), p.id]));

export function partnerById(id) {
  return byId.get(String(id || '').trim()) || null;
}

// A message's identity is free text (an owner's name, typed or defaulted
// from outreach_owners), never a partner id, so a deal's attribution has to
// resolve it the same way a person would read it: by the name it says.
// Anything that does not match exactly is not guessed at further.
export function partnerIdForName(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return '';
  return byLowerName.get(key) || '';
}
