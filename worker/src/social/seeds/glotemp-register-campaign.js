// The wave-based Glotemp register campaign: the copy supplied by the owner
// for the city target register, held here exactly as given. Section 4 of
// the brief that commissioned this is explicit that the copy is not
// rewritten, lengthened or given flourishes, so every string below is the
// owner's own words, translated where the brief calls for translation and
// otherwise untouched.
//
// Three verticals, one structure: an opening line naming the register, the
// link the recipient is already on, the fourteen day offer, the partner
// link, and Reply yes. The subject and the "On the table" phrase change per
// vertical; nothing else does.

// English is the source text and the fallback for any language and vertical
// this campaign has not been given a native version of. {PHRASE} is the
// vertical's own key phrase (On the table / Staying here / the city pack)
// substituted into a shared shape, matching the brief's own description of
// the hotel variant as "identical text" with one phrase swapped.
const EN = {
  restaurant: {
    subject: 'On the table, 14 days',
    phrase: 'On the table',
    urlVar: '{food_url}',
    offer: 'We can put your room on a quiet 14-day line: {PHRASE}. No banner. After 14 days it comes off unless you continue as a partner.'
  },
  hotel: {
    subject: 'Staying here, 14 days',
    phrase: 'Staying here',
    urlVar: '{pulse_url}',
    offer: 'We can put your room on a quiet 14-day line: {PHRASE}. No banner. After 14 days it comes off unless you continue as a partner.'
  },
  board: {
    subject: 'The city pack, 14 days',
    phrase: 'the city pack',
    urlVar: '{pulse_url}',
    offer: 'We can put {CITY}\'s pack on a quiet 14-day line: badge, pulse line, one voucher. No banner. After 14 days it comes off unless you continue as a partner.'
  }
};

// Native text for the languages the brief names. Each entry mirrors the
// English shape exactly: opening line, offer line, partner link, close.
// Confidence varies by language and is reported honestly rather than
// silently, in REGISTER_CAMPAIGN_LANGUAGE_NOTES below; nothing here has been
// sent, and every one of these should be read by a native speaker of the
// language before the first message in it goes out.
const TRANSLATIONS = {
  es: {
    opening: 'Más de 300 ciudades están en Glotemp. La suya ya figura en el registro:',
    restaurantOffer: 'Podemos poner su local en una línea discreta de 14 días: {PHRASE}. Sin banner. Pasados los 14 días se retira, salvo que continúe como partner.',
    boardOffer: 'Podemos poner el paquete de {CITY} en una línea discreta de 14 días: distintivo, línea de pulso, un vale. Sin banner. Pasados los 14 días se retira, salvo que continúe como partner.',
    subjects: { restaurant: 'En la carta, 14 días', hotel: 'Alojamiento aquí, 14 días', board: 'El paquete de la ciudad, 14 días' },
    phrases: { restaurant: 'En la carta', hotel: 'Alojamiento aquí', board: 'el paquete de la ciudad' },
    close: 'Responda sí.'
  },
  el: {
    opening: 'Πάνω από 300 πόλεις βρίσκονται ήδη στο Glotemp. Η δική σας είναι ήδη στο μητρώο:',
    restaurantOffer: 'Μπορούμε να βάλουμε τον χώρο σας σε μια διακριτική γραμμή 14 ημερών: {PHRASE}. Χωρίς banner. Μετά τις 14 ημέρες αφαιρείται, εκτός αν συνεχίσετε ως συνεργάτης.',
    boardOffer: 'Μπορούμε να βάλουμε το πακέτο της {CITY} σε μια διακριτική γραμμή 14 ημερών: σήμα, γραμμή παλμού, ένα κουπόνι. Χωρίς banner. Μετά τις 14 ημέρες αφαιρείται, εκτός αν συνεχίσετε ως συνεργάτης.',
    subjects: { restaurant: 'Στο τραπέζι, 14 ημέρες', hotel: 'Διαμονή εδώ, 14 ημέρες', board: 'Το πακέτο της πόλης, 14 ημέρες' },
    phrases: { restaurant: 'Στο τραπέζι', hotel: 'Διαμονή εδώ', board: 'το πακέτο της πόλης' },
    close: 'Απαντήστε ναι.'
  },
  hr: {
    opening: 'Više od 300 gradova već je na Glotempu. Vaš grad već je u registru:',
    restaurantOffer: 'Vaš prostor možemo staviti na diskretnu liniju od 14 dana: {PHRASE}. Bez banera. Nakon 14 dana uklanja se, osim ako nastavite kao partner.',
    boardOffer: 'Paket grada {CITY} možemo staviti na diskretnu liniju od 14 dana: značka, linija pulsa, jedan vaučer. Bez banera. Nakon 14 dana uklanja se, osim ako nastavite kao partner.',
    subjects: { restaurant: 'Za stolom, 14 dana', hotel: 'Boravak ovdje, 14 dana', board: 'Gradski paket, 14 dana' },
    phrases: { restaurant: 'Za stolom', hotel: 'Boravak ovdje', board: 'gradski paket' },
    close: 'Odgovorite sa da.'
  },
  nl: {
    opening: 'Meer dan 300 steden staan al op Glotemp. De uwe staat al in het register:',
    restaurantOffer: 'We kunnen uw zaak op een rustige lijn van 14 dagen zetten: {PHRASE}. Geen banner. Na 14 dagen verdwijnt het, tenzij u doorgaat als partner.',
    boardOffer: 'We kunnen het pakket van {CITY} op een rustige lijn van 14 dagen zetten: badge, pulslijn, een voucher. Geen banner. Na 14 dagen verdwijnt het, tenzij u doorgaat als partner.',
    subjects: { restaurant: 'Aan tafel, 14 dagen', hotel: 'Hier verblijven, 14 dagen', board: 'Het stadspakket, 14 dagen' },
    phrases: { restaurant: 'Aan tafel', hotel: 'Hier verblijven', board: 'het stadspakket' },
    close: 'Antwoord ja.'
  },
  is: {
    opening: 'Yfir 300 borgir eru þegar á Glotemp. Þín borg er þegar á skránni:',
    restaurantOffer: 'Við getum sett staðinn þinn á rólega 14 daga línu: {PHRASE}. Ekkert borði. Eftir 14 daga fer það af nema þú haldir áfram sem samstarfsaðili.',
    boardOffer: 'Við getum sett pakka {CITY} á rólega 14 daga línu: merki, púlslínu, einn afsláttarmiða. Ekkert borði. Eftir 14 daga fer það af nema þú haldir áfram sem samstarfsaðili.',
    subjects: { restaurant: 'Á borðinu, 14 dagar', hotel: 'Gisting hér, 14 dagar', board: 'Borgarpakkinn, 14 dagar' },
    phrases: { restaurant: 'Á borðinu', hotel: 'Gisting hér', board: 'borgarpakkinn' },
    close: 'Svaraðu já.'
  },
  fr: {
    opening: 'Plus de 300 villes sont déjà sur Glotemp. La vôtre y figure déjà :',
    restaurantOffer: 'Nous pouvons placer votre établissement sur une ligne discrète de 14 jours : {PHRASE}. Aucune bannière. Passé ce délai, il est retiré, sauf si vous devenez partenaire.',
    boardOffer: 'Nous pouvons placer le pack de {CITY} sur une ligne discrète de 14 jours : badge, ligne de pouls, un bon. Aucune bannière. Passé ce délai, il est retiré, sauf si vous devenez partenaire.',
    subjects: { restaurant: 'À la carte, 14 jours', hotel: 'Séjour ici, 14 jours', board: 'Le pack de la ville, 14 jours' },
    phrases: { restaurant: 'À la carte', hotel: 'Séjour ici', board: 'le pack de la ville' },
    close: 'Répondez oui.'
  },
  ja: {
    opening: '300以上の都市がすでにGlotempに登録されています。貴店もすでに登録済みです。',
    restaurantOffer: '貴店を静かな14日間の掲載枠に掲載できます。{PHRASE}。バナーなし。14日後、パートナーとして継続されない限り掲載終了となります。',
    boardOffer: '{CITY}のパックを静かな14日間の掲載枠に掲載できます。バッジ、パルスライン、クーポン1枚。バナーなし。14日後、パートナーとして継続されない限り掲載終了となります。',
    subjects: { restaurant: '掲載中、14日間', hotel: '滞在中、14日間', board: '都市パック、14日間' },
    phrases: { restaurant: '掲載中', hotel: '滞在中', board: '都市パック' },
    close: '「はい」とご返信ください。'
  }
};

// Honest, not decorative. Every language above should be read by a fluent
// native speaker before the first send in it, and these two carry the
// least confidence of the seven: they are the languages this house has the
// thinnest coverage of, and a wrong idiom in a fourteen day partner pitch
// is a worse failure than sending a day late.
export const REGISTER_CAMPAIGN_LANGUAGE_NOTES = {
  is: 'Icelandic: lowest confidence of the seven. Review before the first Reykjavik send.',
  ja: 'Japanese: register and politeness level need a native check before the first Tokyo send.',
  el: 'Greek: review before the first Santorini or Mykonos send.',
  hr: 'Croatian: review before the first Dubrovnik send.'
};

const PARTNER_LINK = 'https://glo-temp.com/partners';

function fillPhrase(template, phrase, city) {
  return template.split('{PHRASE}').join(phrase).split('{CITY}').join(city);
}

// Builds the body and subject for one vertical in one language, with the
// register's own food_url or pulse_url substituted in. The word count check
// and the placeholder check both run on the result of this, not on the
// English source, so a bad substitution is caught the same way a bad
// translation would be.
export function registerCampaignCopy({ vertical, language, city, foodUrl, pulseUrl }) {
  const v = EN[vertical];
  if (!v) throw new Error(`"${vertical}" is not a register campaign vertical. It is one of: ${Object.keys(EN).join(', ')}.`);
  const lang = String(language || 'en').trim().toLowerCase();
  const url = vertical === 'restaurant' ? foodUrl : pulseUrl;
  const t = TRANSLATIONS[lang];

  const opening = t
    ? t.opening
    : `Over 300 cities are on Glotemp. Yours is already on the register:`;
  const offerRaw = t
    ? (vertical === 'board' ? t.boardOffer : t.restaurantOffer)
    : v.offer;
  const close = t ? t.close : 'Reply yes.';
  const subject = t ? t.subjects[vertical] : v.subject;
  const phrase = t ? t.phrases[vertical] : v.phrase;

  const offer = fillPhrase(offerRaw, phrase, city);
  const body = [
    opening,
    String(url || '').trim(),
    '',
    offer,
    '',
    PARTNER_LINK,
    '',
    close
  ].join('\n');

  return { subject, body, translated: Boolean(t), languageNote: REGISTER_CAMPAIGN_LANGUAGE_NOTES[lang] || '' };
}

export const REGISTER_CAMPAIGN_VERTICALS = Object.keys(EN);
export const REGISTER_CAMPAIGN_LANGUAGES = Object.keys(TRANSLATIONS);
