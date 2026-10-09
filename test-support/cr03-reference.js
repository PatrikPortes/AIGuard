// Test-only immutable reference: 8681d57b2c164b764504778bff3eebe572a1e1d4
// Original src/analysis.js SHA-256: 14f698e70a953315ff3a6d67cf2052e5965f2e1f63ad973e5ed183d7ead8653c
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const confusables = new Map(Object.entries({ а: 'a', о: 'o', е: 'e', с: 'c', р: 'p', х: 'x', у: 'y', і: 'i', ј: 'j', ѕ: 's', ӏ: 'l', ο: 'o', ρ: 'p', α: 'a' }));
const nonAscii = /[^\x00-\x7f]/u;
const invisibleCharacter = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/u;
const invisibleCharacters = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
const latinCharacters = /\p{Script=Latin}/gu;
const asciiLatinCharacters = /[a-z]/gu;
const outsideAsciiArabic = /[^\x00-\x7f\u0600-\u06ff]/u;
const arabicInvisibleCharacters = /[\u0600-\u0605\u061c\u06dd]/gu;
const tokenCharacter = /[\p{L}\p{M}]/u;
const letterToken = /[\p{L}\p{M}]+/uy;
const confusableCharacters = /[аоесрхуіјѕӏορα]/gu;
const combiningMarks = /\p{M}/gu;
export function matchingRepresentation(original) {
  // ASCII has no NFKC/NFD changes, ignorables or mapped confusables. Avoid
  // thousands of per-token Unicode normalizations/RegExp allocations for it.
  // This changes only the matching copy, never the original user content.
  if (!nonAscii.test(original)) return { content: original.toLowerCase(), hiddenCharacters: false, foldedConfusables: false };
  const hiddenCharacters = invisibleCharacter.test(original);
  let foldedConfusables = false;
  const nfkc = original.normalize('NFKC');
  // Arabic presentation forms can expand input up to 18-fold. In this
  // explicitly checked block there are no Latin characters; its eight
  // ignorable/format characters are enumerated and verified against Unicode
  // properties by regression tests. Use simple bounded character classes
  // instead of scanning the expanded text with complex Unicode properties.
  const asciiArabic = !outsideAsciiArabic.test(nfkc);
  const normalized = nfkc.replace(asciiArabic ? arabicInvisibleCharacters : invisibleCharacters, '').toLowerCase();
  const latin = asciiArabic ? asciiLatinCharacters : latinCharacters;
  // NFKC may expand a small input into thousands of non-Latin words. Find
  // Latin characters first, then fold each containing token exactly once.
  // Every character is scanned at most a constant number of times; no
  // callback/match array is created for each unrelated non-Latin word.
  const parts = [];
  let copiedUntil = 0, match;
  latin.lastIndex = 0;
  while ((match = latin.exec(normalized))) {
    // Some Latin-script symbols are not letters/marks; the original token
    // grammar excludes them, so they must not become token entry points.
    if (!tokenCharacter.test(match[0])) continue;
    let start = match.index;
    while (start > copiedUntil) {
      const last = normalized.charCodeAt(start - 1);
      const previous = last >= 0xdc00 && last <= 0xdfff && start > 1
        && normalized.charCodeAt(start - 2) >= 0xd800 && normalized.charCodeAt(start - 2) <= 0xdbff ? start - 2 : start - 1;
      if (!tokenCharacter.test(normalized.slice(previous, start))) break;
      start = previous;
    }
    letterToken.lastIndex = start;
    const token = letterToken.exec(normalized)[0];
    const end = start + token.length;
    // Genuine Cyrillic/Greek-only tokens are never selected or transliterated.
    const folded = token.replace(confusableCharacters, char => confusables.get(char));
    if (folded !== token) foldedConfusables = true;
    parts.push(normalized.slice(copiedUntil, start), folded.normalize('NFD').replace(combiningMarks, ''));
    copiedUntil = end;
    latin.lastIndex = end;
  }
  if (!parts.length) return { content: normalized, hiddenCharacters, foldedConfusables };
  parts.push(normalized.slice(copiedUntil));
  const content = parts.join('');
  return { content, hiddenCharacters, foldedConfusables };
}

// Equivalent ordered phrases, evaluated once per line instead of restarting a
// greedy scan at each repeated prefix (quadratic time on adversarial inputs).
function orderedPhrase(content, prefix, suffix) {
  return content.split(/[\n\r\u2028\u2029]/u).some(line => {
    const match = prefix.exec(line);
    return match !== null && suffix.test(line.slice(match.index + match[0].length));
  });
}

const rules = [
  { id: 'urgency', weight: 20, pattern: /ihned|okamzit|urgent|posledni (sance|vyzva)|do \d{1,8} (minut|hodin)/u, ordered: content => orderedPhrase(content, /dnes/u, /zapla|posl/u), title: 'Tlak na rychlé rozhodnutí', explanation: 'Spěch může bránit tomu, abyste si požadavek v klidu ověřili.' },
  { id: 'money', weight: 25, pattern: /preved|prevod|zaplat|uhrad|platb|uctu|faktur/u, ordered: content => orderedPhrase(content, /posli/u, /peniz|penez|korun|kc/u), title: 'Požadavek nebo zmínka o platbě', explanation: 'Platby jsou běžné i v pravé komunikaci. Nečekaný požadavek ale ověřte zvlášť.' },
  { id: 'new_number', weight: 35, pattern: /nove cislo|novy telefon|rozbit.{0,80}telefon|ztrati[lva]{1,3}.{0,80}telefon/u, title: 'Změna telefonu nebo čísla', explanation: 'Někdo může předstírat blízkou osobu. Zavolejte jí na číslo, které už znáte.' },
  { id: 'credentials', weight: 65, pattern: /(posl|sdel|zadej|vypln|potvrd).{0,70}(hesl|pin\b|kod|kart)|prihlaste.{0,50}(odkaz|zde)/u, title: 'Žádost o heslo, kód nebo údaje karty', explanation: 'Předání těchto údajů může umožnit přístup k vašemu účtu nebo penězům.' },
  { id: 'secrecy', weight: 25, pattern: /nikomu nerikej|nevolej|nevolat|tajne|utaj/u, title: 'Omezení nezávislého ověření', explanation: 'Požadavek na utajení nebo zákaz volání může být pokus obejít vaše běžné ověřování.' },
  { id: 'investment', weight: 45, pattern: /garantovan.{0,25}(vynos|zisk)|bez rizika|zdvojnasob.{0,25}(peniz|vklad)|\d{1,8}\s{0,8}%.{0,25}(denne|tydne)/u, title: 'Slib mimořádného výnosu', explanation: 'Jistý vysoký zisk je varovný signál. Nabídku ověřte nezávisle, než pošlete peníze.' },
  { id: 'authority', weight: 15, pattern: /bank[ay]|polici[ei]|kuryr|zasilk|financni urad/u, title: 'Odkaz na instituci nebo doručení', explanation: 'Jméno známé organizace samo o sobě nepotvrzuje totožnost odesílatele.' },
];

export function intakeAgent(input) {
  if (!input || typeof input !== 'object' || !['text', 'url'].includes(input.type)) throw new Error('Vyberte text nebo URL.');
  if (typeof input.content !== 'string' || !input.content.trim()) throw new Error('Vložte obsah, který chcete ověřit.');
  if (input.content.length > 10000) throw new Error('Vstup může mít nejvýše 10 000 znaků.');
  const content = input.content;
  if (input.type === 'url') {
    let url;
    try { url = new URL(content.trim()); } catch { throw new Error('Vložte úplnou URL začínající https:// nebo http://.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Podporujeme jen HTTP(S) URL bez přihlašovacích údajů.');
  }
  return { type: input.type, content, matching: matchingRepresentation(content) };
}

export function fraudAgent({ content, type, matching = matchingRepresentation(content) }) {
  const signals = type === 'text' ? rules.filter(rule => rule.pattern.test(matching.content) || rule.ordered?.(matching.content)).map(({ pattern, ordered, ...rule }) => rule) : [];
  if (matching.hiddenCharacters || matching.foldedConfusables) signals.push({ id: 'unusual_characters', weight: 5, title: 'Neobvyklý zápis znaků', explanation: 'Text obsahuje neviditelné nebo podobně vypadající znaky. Mohou mít běžný jazykový důvod, ale také skrývat rizikové výrazy.' });
  const links = type === 'url' ? [content] : (content.match(/https?:\/\/[^\s<>"']+/giu) || []);
  if (links.length) signals.push({ id: 'link', weight: 10, title: 'Obsahuje internetový odkaz', explanation: 'Cíl odkazu nebyl otevřen ani ověřen. Odkaz sám o sobě není důkaz podvodu.' });
  if (links.some(link => { try { const url = new URL(link); return url.protocol === 'http:' || url.username || url.password || isIP(url.hostname.replace(/^\[|\]$/g, '')) || url.hostname.includes('xn--'); } catch { return false; } })) signals.push({ id: 'unusual_url', weight: 25, title: 'Odkaz potřebuje zvláštní opatrnost', explanation: 'Odkaz používá nešifrovaný přenos, číselnou adresu, vložené přihlašovací údaje nebo zvláštní zápis domény. To samo podvod nedokazuje.' });
  return signals;
}

export function verificationAgent() {
  return [
    'Osobě zavolejte na číslo, které už znáte z dřívějška.',
    'Banku nebo obchodníka kontaktujte přes svou známou oficiální aplikaci nebo dříve ověřený kontakt.',
    'Použijte jiný komunikační kanál. Nepřebírejte telefon ani odkaz z posuzované zprávy.',
  ];
}

export function safetyCritic(result) {
  if (!Number.isInteger(result.risk_score) || result.risk_score < 0 || result.risk_score > 100) throw new Error('Neplatný výstup analýzy.');
  // Recommendations come exclusively from fixed, reviewed templates, never from input.
  return { ...result, uncertainties: [...result.uncertainties, 'Jde o odhad rizika, nikoli důkaz, že jde o podvod. Nízké skóre nepotvrzuje bezpečnost.'] };
}

export function resultLevel(score, type, signalCount) {
  return type === 'url' || signalCount === 0 || score < 30 ? 'unassessed' : score < 60 ? 'caution' : score < 80 ? 'high' : 'very_high';
}
export function resultSummary(score, type, signalCount) {
  return type === 'url' ? 'Cíl odkazu nebyl ověřen. Stránku jsme nenavštívili; z tohoto výsledku nelze určit její bezpečnost.'
    : score >= 60 ? 'Obsah obsahuje více výrazných rizikových signálů. Požadavek si nezávisle ověřte.'
    : signalCount ? 'Našli jsme signály, které je vhodné ověřit. Mohou se objevit i v legitimní komunikaci.'
    : 'Pravidla nenašla známé signály. Z toho nelze poznat, zda je obsah důvěryhodný.';
}

export function analyze(input) {
  const intake = intakeAgent(input);
  const signals = fraudAgent(intake);
  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  const level = resultLevel(score, intake.type, signals.length);
  return safetyCritic({
    id: randomUUID(), input_type: intake.type, engine: 'rules-v1', risk_score: score, risk_level: level,
    summary: resultSummary(score, intake.type, signals.length),
    signals: signals.map(({ weight, ...signal }) => signal),
    recommended_actions: ['Před platbou nebo sdílením údajů si požadavek nezávisle ověřte.', 'Nesdělujte hesla, PIN ani jednorázové kódy.', 'Podezřelé odkazy a přílohy neotevírejte.'],
    verification_steps: verificationAgent(),
    uncertainties: [
      'Tento prototyp používá česká textová pravidla, nikoli AI model. Nerozpozná všechny podvody a může označit i pravou zprávu.',
      'Neověřili jsme totožnost odesílatele, pravdivost tvrzení ani obsah odkazovaných stránek.',
      ...(intake.type === 'url' ? ['URL jsme pouze rozebrali. Stránku jsme nenavštívili a její bezpečnost nelze tímto skóre určit.'] : []),
    ],
  });
}
