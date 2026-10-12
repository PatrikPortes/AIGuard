import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const confusables = new Map(Object.entries({ а: 'a', о: 'o', е: 'e', с: 'c', р: 'p', х: 'x', у: 'y', і: 'i', ј: 'j', ѕ: 's', ӏ: 'l', ο: 'o', ρ: 'p', α: 'a' }));
const nonAscii = /[^\x00-\x7f]/u;
const invisibleCharacter = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/u;
const invisibleCharacters = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
const latinCharacters = /\p{Script=Latin}/gu;
// These bounded classes contain only BMP characters. Code-unit matching has
// identical membership: every surrogate is outside the domain and triggers
// the generic Unicode path. Avoid Unicode-mode scans of Arabic expansions.
const outsideSimpleLatinArabic = /[^\x00-\x7f\u00c0-\u024f\u0600-\u06ff]/;
const simpleLatinCharacters = /[a-z\u00c0-\u024f]/g;
const simpleNormalizationCharacters = /[A-Z\u00c0-\u024f\u0600-\u0605\u061c\u06dd]/g;
const simpleArabicInvisible = /^[\u0600-\u0605\u061c\u06dd]$/u;
const outsideArabicWithoutLatin = /[^\x00-\x40\x5b-\x60\x7b-\x7f\p{Script=Arabic}]/u;
const tokenCharacter = /[\p{L}\p{M}]/u;
// NFKC expansion frequently walks the same Arabic block. Derive its exact
// letter/mark membership from the original predicate once, without retaining
// user content or allocating one substring per character during matching.
const arabicTokenCharacters = Array.from({ length: 256 }, (_, index) =>
  tokenCharacter.test(String.fromCharCode(0x0600 + index)));
const letterToken = /[\p{L}\p{M}]+/uy;
const confusableCharacters = /[аоесрхуіјѕӏορα]/gu;
const combiningMarks = /\p{M}/gu;
// Weak membership is a server-only provenance marker, not a content cache.
// Entries are immutable and live only as long as the caller's request does.
const preparedInputs = new WeakSet();

export function matchingRepresentation(original) {
  // ASCII has no NFKC/NFD changes, ignorables or mapped confusables. Avoid
  // thousands of per-token Unicode normalizations/RegExp allocations for it.
  // This changes only the matching copy, never the original user content.
  if (!nonAscii.test(original)) return { content: original.toLowerCase(), hiddenCharacters: false, foldedConfusables: false };
  const hiddenCharacters = invisibleCharacter.test(original);
  let foldedConfusables = false;
  const nfkc = original.normalize('NFKC');
  // This whole-input domain has no case mapping, Latin tokens, confusables or
  // ignorables to remove. NFKC remains necessary and is kept unchanged. Check
  // the original, not its up-to-18-fold expansion, before avoiding no-op scans
  // and copies. Every Arabic scalar's normalization is checked by differential
  // tests; any mixed script, Latin letter or invisible uses the generic path.
  if (!hiddenCharacters && !outsideArabicWithoutLatin.test(original)) return { content: nfkc, hiddenCharacters, foldedConfusables };
  // Arabic presentation forms can expand input up to 18-fold. In this
  // explicitly checked block there are no Latin characters; its eight
  // ignorable/format characters are enumerated and verified against Unicode
  // properties by regression tests. Use simple bounded character classes
  // instead of scanning the expanded text with complex Unicode properties.
  // Latin accents appended to large Arabic expansions need the same bounded
  // scans as ASCII. This range has no ignorables or non-Latin letters; ×/÷
  // are filtered by the unchanged token predicate. Recheck after lowercase:
  // some Latin case mappings leave this range, and must use the generic path.
  const simpleDomain = !outsideSimpleLatinArabic.test(nfkc);
  let normalized, latin;
  if (simpleDomain) {
    // Arabic has no case mapping. Fuse removal and Latin lowercase so a large
    // Arabic expansion needs no whole-string lowercase copy or second domain
    // scan. Track mappings such as İ/Ⱥ which leave the bounded domain.
    let remainsSimple = true;
    normalized = nfkc.replace(simpleNormalizationCharacters, char => {
      if (simpleArabicInvisible.test(char)) return '';
      const lower = char.toLowerCase();
      if (outsideSimpleLatinArabic.test(lower)) remainsSimple = false;
      return lower;
    });
    latin = remainsSimple ? simpleLatinCharacters : latinCharacters;
  } else {
    normalized = nfkc.replace(invisibleCharacters, '').toLowerCase();
    latin = latinCharacters;
  }
  // NFKC may expand a small input into thousands of non-Latin words. Find
  // Latin characters first, then fold each containing token exactly once.
  // Every character is scanned at most a constant number of times; no
  // callback/match array is created for each unrelated non-Latin word.
  const parts = [];
  let copiedUntil = 0;
  // A single request-local value avoids repeating pure folding on identical
  // neighbouring Latin-containing tokens. No content survives this call.
  let previousToken, previousFold;
  // Loan text can alternate the same accented/confusable tokens thousands of
  // times. Avoid repeating pure NFD/replacement work and its allocations.
  // The bounded cache belongs only to this call; full caches fall back to the
  // original operation, never omit a token or change the matching semantics.
  const tokenFolds = new Map();
  let cachedCharacters = 0;
  latin.lastIndex = 0;
  while (latin.test(normalized)) {
    // Only offsets are needed. Boolean matching avoids allocating two match
    // arrays per token while keeping the same Unicode/sticky predicates.
    let start = latin.lastIndex - 1;
    const last = normalized.charCodeAt(start);
    if (last >= 0xdc00 && last <= 0xdfff && start > 0
        && normalized.charCodeAt(start - 1) >= 0xd800 && normalized.charCodeAt(start - 1) <= 0xdbff) start--;
    // Some Latin-script symbols are not letters/marks; the original token
    // grammar excludes them, so they must not become token entry points.
    if (!tokenCharacter.test(normalized.slice(start, latin.lastIndex))) continue;
    while (start > copiedUntil) {
      const last = normalized.charCodeAt(start - 1);
      const previous = last >= 0xdc00 && last <= 0xdfff && start > 1
        && normalized.charCodeAt(start - 2) >= 0xd800 && normalized.charCodeAt(start - 2) <= 0xdbff ? start - 2 : start - 1;
      const isTokenCharacter = last >= 0x0600 && last <= 0x06ff
        ? arabicTokenCharacters[last - 0x0600]
        : tokenCharacter.test(normalized.slice(previous, start));
      if (!isTokenCharacter) break;
      start = previous;
    }
    letterToken.lastIndex = start;
    // The selected Latin letter/mark and backward walk guarantee this match.
    letterToken.test(normalized);
    const end = letterToken.lastIndex;
    const token = normalized.slice(start, end);
    // Genuine Cyrillic/Greek-only tokens are never selected or transliterated.
    if (token !== previousToken) {
      previousToken = token;
      previousFold = tokenFolds.get(token);
      if (previousFold === undefined) {
        const folded = token.replace(confusableCharacters, char => confusables.get(char));
        if (folded !== token) foldedConfusables = true;
        previousFold = folded.normalize('NFD').replace(combiningMarks, '');
        if (tokenFolds.size < 128 && cachedCharacters + token.length + previousFold.length <= 8192) {
          tokenFolds.set(token, previousFold);
          cachedCharacters += token.length + previousFold.length;
        }
      }
    }
    // A cached confusable was already observed earlier in this same call, so
    // the cumulative foldedConfusables flag remains set when it is reused.
    // Unchanged tokens need no reconstruction. Keep scanning and folding every
    // token; copy the complete intervening text when a real change is found.
    if (previousFold !== token) {
      parts.push(normalized.slice(copiedUntil, start), previousFold);
      copiedUntil = end;
    }
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

// Narrow high-harm combinations, on the existing matching copy. Overlapping
// fixed windows inspect the whole input in O(n); no greedy/unbounded gaps,
// truncation, normalization changes or user content retained between calls.
const cashRequest = /\b(?:posli|poslete|posilej|posilejte|preved|prevedte|prevadej|prevadejte|odesli|odeslete|vyber|vyberte|vybrat|priprav|pripravte|pripravit|predej|predejte|predat|dej|dejte|potrebuji|potrebuju|potrebujeme|potrebuje|potreboval|potrebovala|chce|chtel|chtela|zada|zadal|zadala|pozaduje|pozadoval|pozadovala)\b[\s\S]{0,90}\b(?:hotovost(?:i)?|penize|penez|korun|kc)\b/u;
const familyClaim = /\b(?:mami|mamo|tati|tato|babi|babicko|dedo|dedecku|vnuk(?:a|ovi|em)?|vnuck(?:a|u|y|ou|e)|pribuzn(?:y|a|eho|ou|emu|ym))\b|\b(?:jsem|tady je|tady)\s{1,8}(?:tvuj|tvoje|tva|vas|vase)\s{1,8}(?:syn|dcera|vnuk|vnucka)\b/u;
const cashUrgency = /\b(?:ihned|hned|okamzite|rychle|urgentne|specha|nalehave|dnes)\b|\bco nejdriv(?:e)?\b|\bdo \d{1,8} (?:minut|hodin)\b/u;
const pickupActor = String.raw`\b(?:kamarad[a-z]{0,5}|koleg[a-z]{0,5}|kuryr[a-z]{0,5}|znamy|znamemu|poslicek|taxikar[a-z]{0,4}|advokat[a-z]{0,3}|pravnik[a-z]{0,3})\b`;
const pickupAction = String.raw`\b(?:prijde|prijede|vyzved[a-z]{0,6}|prevezme|prevzit|predej|predejte|predas|predate|poslu|posilam|posila|zastavi\s{1,8}se|se\s{1,8}zastavi)\b`;
const thirdPartyPickup = new RegExp(`${pickupActor}[\\s\\S]{0,70}${pickupAction}|${pickupAction}[\\s\\S]{0,70}${pickupActor}`, 'u');
const secrecyDirective = /\bnikomu\s{1,8}(?:(?:to|nic|o tom|o platbe|o prevodu)\s{1,8})?(?:nerikej(?:te)?|nesdeluj(?:te)?|neprozrazuj(?:te)?|nezminuj(?:te)?)\b|\b(?:nerikej(?:te)?|nesdeluj(?:te)?|neprozrazuj(?:te)?)\s{1,8}(?:(?:to|nic|o tom)\s{1,8})?nikomu\b|\b(?:nerikej(?:te)?|nerikal[a]?|nerikam)\s{1,8}(?:(?:to|nic|o tom)\s{1,8})?(?:mame|rodicum)\b|\b(?:mame|rodicum)\s{1,8}(?:to\s{1,8})?(?:nerikej(?:te)?|nerikal[a]?|nerikam)\b|\b(?:nemam|nesmim|nema|nesmi)\s{1,8}(?:(?:to|o tom)\s{1,8})?(?:rict|rikat)\s{1,8}(?:mame|rodicum)\b/gu;
const protectedSecret = /^[\s,:-]{0,8}(?:(?:sve|svoje|svuj|zadne|zadny)\s{1,8})?(?:hesl[a-z]{0,4}|pin|kod[a-z]{0,4}|udaj[a-z]{0,4}|cislo\s{1,8}karty|prihlasovac[a-z]{0,8}|osobni[a-z]{0,4})\b/u;
const legacySecrecy = rules.find(rule => rule.id === 'secrecy');
const bankClaim = /\b(?:bank[ay]|bankovni (?:poradce|pracovnik)|pracovnik banky)\b/u;
const safeAccount = String.raw`\b(?:bezpecn(?:y|eho|emu|em)|zabezpecen(?:y|eho|emu|em)|ochrann(?:y|eho|emu|em)|chranen(?:y|eho|emu|em))\s{1,8}(?:bankovni\s{1,8})?(?:ucet|uctu|uctem)\b`;
const transferInstruction = String.raw`\b(?:preved(?:te)?|prevest|prevadej(?:te)?|presun(?:te)?|presunout|posli|poslete|odesli|odeslete)\b`;
const safeAccountTransfer = new RegExp(`${transferInstruction}[\\s\\S]{0,100}${safeAccount}|${safeAccount}[\\s\\S]{0,100}${transferInstruction}`, 'gu');
const accountEducationBefore = /\b(?:nikdy\s{1,8}(?:nezada|nezadame|nepozaduje|nepozadujeme|nerekne|nerikame)|(?:varuje|varujeme|upozornuje|upozornujeme)\s{1,8}(?:na|pred)\s{1,8}podvod[a-z]{0,4}|priklad\s{1,8}podvod[a-z]{0,4})[^.!?;\n]{0,60}$/u;
const accountEducationAfter = /^[\s,;:-]{0,16}(?:jde o podvod|je podvodna vyzva|je priklad podvodu)(?:[.!]|$)/u;
function hasAccountTransfer(window) {
  for (const match of window.matchAll(safeAccountTransfer)) {
    const before = window.slice(Math.max(0, match.index - 160), match.index);
    const after = window.slice(match.index + match[0].length, match.index + match[0].length + 80);
    // Exempt only an explicitly quoted educational example. An unrelated
    // warning elsewhere cannot hide an actual instruction in the same input.
    const opening = /[„"]\s{0,8}$/u.exec(before);
    const closing = /^[\s.!]{0,8}[“"]/u.exec(after);
    if (opening && closing && (accountEducationBefore.test(before.slice(0, opening.index))
        || accountEducationAfter.test(after.slice(closing[0].length)))) continue;
    return true;
  }
  return false;
}
const highHarmRules = [
  { id: 'family_cash_pickup', weight: 65, title: 'Hotovost pro údajného příbuzného přes další osobu', explanation: 'Naléhavá žádost o peníze, utajení a vyzvednutí jiným člověkem mohou znamenat vydávání se za příbuzného. Totožnost jsme neověřili.' },
  { id: 'safe_account_transfer', weight: 70, title: 'Převod na údajný bezpečný účet', explanation: 'Pokyn od údajné banky k převodu na „bezpečný účet“ je výrazný varovný signál. Totožnost odesílatele ani účet jsme neověřili.' },
];
function secrecyPressure(window, content, offset) {
  for (const match of window.matchAll(secrecyDirective)) {
    // Ordinary advice to protect passwords/codes is not pressure to conceal a
    // payment. Only the explicit object immediately after this directive is
    // exempt; another concealment directive in the same input is still checked.
    const end = offset + match.index + match[0].length;
    if (!protectedSecret.test(content.slice(end, end + 64))) return true;
  }
  return false;
}
function highHarmWarnings(content, existing) {
  // Every combination below needs a cash object or an account noun. Check
  // this necessary condition once; guarded windows cannot invent word edges.
  if (!/\b(?:hotovost(?:i)?|penize|penez|korun|kc|ucet|uctu|uctem)\b/u.test(content)) return [];
  if (!/nikomu|nerikej|nerikal|nerikam|nema|nesmi|bezpecn|zabezpecen|ochrann|chranen|nevolej|nevolat|tajne|utaj/u.test(content)) return [];
  let secrecy = false, family = false, bank = false;
  // A cluster up to 400 code units is wholly inside an 800-unit window;
  // longer/distant clauses are intentionally not inferred to be one request.
  for (let start = 0; start < content.length; start += 400) {
    const begin = Math.max(0, start - 1), end = Math.min(content.length, start + 801);
    // Guard clipped word edges: a window must not invent word boundaries.
    const window = (begin ? 'x' : ' ') + content.slice(begin, end) + (end < content.length ? 'x' : ' ');
    const concealment = secrecyPressure(window, content, begin - 1);
    const cash = cashRequest.test(window);
    secrecy ||= cash && concealment;
    family ||= cash && (concealment || legacySecrecy.pattern.test(window))
      && familyClaim.test(window) && cashUrgency.test(window) && thirdPartyPickup.test(window);
    bank ||= bankClaim.test(window) && hasAccountTransfer(window);
  }
  const signals = highHarmRules.filter(rule => rule.id === 'family_cash_pickup' ? family : bank);
  if (secrecy && !existing.some(signal => signal.id === 'secrecy')) {
    const { pattern, ...signal } = legacySecrecy;
    signals.push(signal);
  }
  return signals;
}

// Loan / credit offers. These rules run only in a loan situation: the user chose
// the loan flow, or the text itself talks about a loan. Ordinary words such as
// "poplatek" or "doklad" are never a signal on their own. Patterns read the same
// folded matching copy as the rules above. ASCII suffixes may be arbitrarily
// long; evaluate their reach once, rather than backtracking from every prefix.
function loanScan(content) {
  const matches = new Map();
  const presence = new Map();
  let asciiEnds;
  const gapEnds = new Map();
  return {
    has(pattern) {
      if (!presence.has(pattern)) presence.set(pattern, pattern.test(content));
      return presence.get(pattern);
    },
    matches(pattern) {
      if (!matches.has(pattern)) {
        // Restart after the start, not the end, to retain overlaps. A consuming
        // expression lets V8 skip unrelated characters efficiently, including
        // long Unicode expansions; a surrounding lookahead prevents that.
        // Each fragment has only fixed/bounded repetition.
        const scanner = new RegExp(pattern.source, 'gu');
        const found = [];
        let match;
        while ((match = scanner.exec(content))) {
          found.push({ start: match.index, end: match.index + match[0].length });
          const code = content.codePointAt(match.index);
          scanner.lastIndex = match.index + (code > 0xffff ? 2 : 1);
        }
        matches.set(pattern, found);
      }
      return matches.get(pattern);
    },
    reach(end, ascii, gap) {
      if (ascii) {
        if (!asciiEnds) {
          asciiEnds = new Uint32Array(content.length + 1);
          asciiEnds[content.length] = content.length;
          for (let i = content.length - 1; i >= 0; i--) {
            const code = content.charCodeAt(i);
            asciiEnds[i] = code >= 97 && code <= 122 ? asciiEnds[i + 1] : i;
          }
        }
        end = asciiEnds[end];
      }
      const key = end * 64 + gap;
      if (!gapEnds.has(key)) {
        let limit = end;
        for (let count = 0; count < gap && limit < content.length; count++) {
          const code = content.codePointAt(limit);
          // Exactly the original Unicode dot semantics, including astral
          // characters and all four excluded line terminators.
          if (code === 10 || code === 13 || code === 0x2028 || code === 0x2029) break;
          limit += code > 0xffff ? 2 : 1;
        }
        gapEnds.set(key, limit);
      }
      return gapEnds.get(key);
    },
  };
}
const part = (pattern, ascii = false, gap = 0) => ({ pattern, ascii, gap });
function loanPattern(...alternatives) {
  return { test(content, scan = loanScan(content)) {
    return alternatives.some(parts => {
      // Every fragment is mandatory. Check existence before enumerating its
      // overlapping occurrences: an absent fragment makes the whole branch
      // impossible. This avoids allocating thousands of dead-end matches on
      // repeated loan roots, without changing gaps, suffixes or detection.
      if (!parts.every(part => scan.has(part.pattern))) return false;
      // Work backwards: a fragment is viable iff a viable next fragment
      // starts in [end, ASCII-run-end + bounded gap]. A reverse lookup avoids
      // rescanning the same word for each repeated root. O(n) for the fixed
      // rule set; no suffix or content is truncated.
      let viable = scan.matches(parts.at(-1).pattern);
      for (let i = parts.length - 2; i >= 0 && viable.length; i--) {
        const current = parts[i];
        const matches = scan.matches(current.pattern);
        if (!matches.length) return false;
        const nextStart = new Uint32Array(content.length + 1);
        let cursor = viable.length - 1, next = content.length + 1;
        for (let offset = content.length; offset >= 0; offset--) {
          while (cursor >= 0 && viable[cursor].start === offset) { next = offset; cursor--; }
          nextStart[offset] = next;
        }
        viable = matches.filter(match => nextStart[match.end] <= scan.reach(match.end, current.ascii, current.gap));
      }
      return viable.length > 0;
    });
  } };
}
const loanWords = /\b(?:za)?pujc(?:k|c|ek)|\bpujcovn|\bnebankovni|\bhypotek|\buver(?:u|em|y|ech|um|ov[a-z]*)?\b/u;
const documents = [
  [part(/obcansk|obcank|osobni(?:ho|m)? doklad|cestovni(?:ho)? pas|\bpasu\b|ridicak/u)],
  [part(/doklad/u, true), part(/ totoznost/u)],
  [part(/ridicsk/u, true), part(/ prukaz/u)],
];
const photograph = /\bfot|kopi|sken|snim|vyfot|nafot/u;
const approval = /schvaleni|schvalen[aeiy]|schvalime|schvalujeme/u;
const guarantee = /(?<!ne)(?<!neni )(?:garant|zarucen)|\bjist[aeiyo]|100 ?%/u;
const sms = /\bsms|overovac|potvrzovac|autorizacn|jednorazov/u;
const send = /posl|zasl|sdel|nadikt|preposl|napis|rekn|precte|predej/u;
const beforePayout = /\b(?:pred|nez)\b.{0,40}(?:vyplac|vyplat|poskytnut|uvolnen|odeslan|pripsan|prevedeni|cerpan|schvalen|posleme|zasleme|dostanete|obdrzite|pripiseme)/u;
const advancePayment = /(?<!ne)(?:zaplat|uhrad|poukaz)|poplat|zaloh|pojisten|kauc|\bplatb/u;
const noAdvancePayment = /\b(?:nic|zadn[a-z]*)\b.{0,20}(?:plat|hrad|poplat)|nemusite.{0,20}(?:platit|hradit)|\bbez (?:poplatk|zaloh)/u;
const loanRules = [
  { id: 'loan_advance_fee', weight: 60,
    pattern: loanPattern(
      [part(/aktivacni poplat|predem (?:zaplat|uhrad|posl|poukaz|zasl)/u)],
      [part(/poplat/u, true), part(/ za (?:vyrizeni|vyplac|uvoln|aktivac|schval|zprostredk|sepsani|odeslani)/u)],
      [part(/vratn/u, true), part(/ (?:zaloh|poplat|kauc|pojist)/u)],
      [part(/(?<!(?:bez|zadn[a-z]{1,3}|nic) )pojisteni/u), part(/ predem/u)],
      [part(/(?<!(?:bez|zadn[a-z]{1,3}|nic) )(?:poplat|zaloh|kauc|castk)/u, true), part(/ predem/u)],
      [part(/(?<!ne)(?:zaplat|uhrad|posl|poukaz)/u, true, 30), part(/\bpredem/u)]),
    // "Before payout" and a payment must appear in the same sentence.
    ordered: content => content.split(/[.!?;\n\r\u2028\u2029]/u).some(sentence => beforePayout.test(sentence) && advancePayment.test(sentence) && !noAdvancePayment.test(sentence)),
    title: 'Platba předem před získáním půjčky', explanation: 'Tohle je varovný signál. Po zaplacení „poplatku“, „zálohy“ nebo „pojištění“ často peníze zmizí a půjčka nepřijde.' },
  { id: 'loan_bank_login', weight: 65,
    pattern: loanPattern(
      [part(/prihlasovac|\blogin|\bhesl/u, false, 40), part(/bankovnictv|\bbank/u)],
      [part(/uzivatelsk/u, true), part(/ jmen/u, false, 40), part(/bankovnictv|\bbank/u)],
      [part(/bankovnictv/u, false, 40), part(/prihlasovac|\blogin|\bhesl/u)],
      [part(/\bbank/u, true, 40), part(/prihlasovac|\blogin|\bhesl/u)],
      [part(/prihlaste se/u, false, 40), part(/bankovnictv|\bbank(?!ovni identit)/u)]),
    title: 'Žádost o přihlašovací údaje do bankovnictví', explanation: 'Tohle je varovný signál. S přihlašovacími údaji může cizí člověk ovládat váš účet. Nesdělujte je nikomu, ani poskytovateli půjčky.' },
  { id: 'loan_sms_code', weight: 65,
    pattern: loanPattern(
      [part(/posl|zasl|sdel|nadikt|preposl|napis|rekn|precte|predej|vyfot/u, true, 40), part(/\bsms|overovac|potvrzovac|autorizacn|jednorazov|aktivacn/u, true), part(/ ?kod/u)],
      [part(/posl|zasl|sdel|nadikt|preposl|napis|rekn|precte|predej|vyfot/u, true, 40), part(/\bkod/u, true), part(/ (?:z|ze|v) sms/u)],
      [part(sms, true), part(/ ?kod/u, false, 40), part(send)],
      [part(/\bkod/u, true), part(/ (?:z|ze|v) sms/u, false, 40), part(send)]),
    title: 'Žádost o kód z SMS', explanation: 'Tohle je varovný signál. Kódem z SMS se obvykle potvrzuje platba nebo přihlášení. Kdo ho získá, může jednat vaším jménem.' },
  { id: 'loan_card_details', weight: 65,
    pattern: loanPattern(
      [part(/\bcvv\b|\bcvc\b/u)],
      [part(/\bcisl|\budaj|platnost|\bkod/u, true, 30), part(/platebni karty|\bkart(?:y|u|e)\b/u)],
      [part(/platebni karty|\bkart(?:y|u|e)\b/u, false, 30), part(/\bcisl|\budaj|platnost/u)]),
    title: 'Žádost o údaje z platební karty', explanation: 'Tohle je varovný signál. Údaje z karty umožňují platit vaším jménem. K získání půjčky by neměly být potřeba.' },
  { id: 'loan_remote_access', weight: 65,
    pattern: loanPattern(
      [part(/anydesk|teamviewer|rustdesk|quick ?support|airdroid/u)],
      [part(/vzdalen/u, true), part(/ (?:pristup|ploch|sprav|pripojen|ovladan)/u)],
      [part(/sdilen/u, true), part(/ obrazovk/u)],
      ...[/abychom|aby (?:nas|vam)/u, /aby nase/u].map(reason =>
        [part(/nainstal|stahn/u, true, 60), part(reason, false, 40), part(/pripoj|videl|ovlad|pomohl/u)])),
    title: 'Žádost o instalaci aplikace nebo vzdálený přístup', explanation: 'Tohle je varovný signál. Přes aplikaci pro vzdálený přístup může cizí člověk vidět a ovládat váš telefon nebo počítač, včetně bankovnictví.' },
  { id: 'loan_id_document', weight: 30,
    pattern: loanPattern(
      ...documents.map(document => [part(photograph, true, 40), ...document]),
      ...documents.map(document => [...document.slice(0, -1), part(document.at(-1).pattern, true, 40), part(/\bfot|kopi|sken|snim|z obou stran|obe strany/u)])),
    title: 'Žádost o fotku nebo kopii dokladu', explanation: 'Fotka nebo kopie dokladu se dá zneužít, například ke sjednání půjčky na vaše jméno. Pošlete ji jen poskytovateli, kterého jste si sami nezávisle ověřili.' },
  { id: 'loan_guaranteed', weight: 35,
    pattern: loanPattern(
      [part(approval, true, 30), part(/(?<!ne)(?<!neni )(?:garant|zarucen)|\bjist[aeiyo]|100 ?%|\bvzdy\b|\bkazd|\bvsem\b|bez vyjimky/u)],
      [part(guarantee, true, 30), part(/schval/u)],
      [part(/schvalime (?:kazd|vsech)/u)]),
    title: 'Slib jistého schválení', explanation: 'Tohle je varovný signál. Poctivý poskytovatel musí nejdřív posoudit, zda budete půjčku schopni splácet. Schválení proto nemůže slíbit předem.' },
  { id: 'loan_no_registry', weight: 30,
    pattern: loanPattern(
      [part(/\bbez (?:registr|nahlizeni do registr|kontroly registr|prover)|\bpro kazdeho\b|\bi (?:pro |s |se )?(?:dluznik|exekuc)|bez ohledu na (?:registr|exekuc|dluh|prijem)|\bbez dolozeni prijm/u)],
      [part(/\bi (?:pro |s |se )?(?:zaznam|zapis)/u, true), part(/ v registr/u)]),
    title: 'Půjčka „bez registru“ nebo „pro každého“', explanation: 'Tohle je varovný signál. Poctivý poskytovatel musí posoudit, zda budete půjčku schopni splácet. Nabídka „pro každého“ tuto kontrolu obchází nebo ji jen slibuje.' },
  { id: 'loan_pressure', weight: 20,
    pattern: loanPattern(
      [part(/nabidk|akce|sazb|urok/u, true, 30), part(/plati|konci|vyprsi|\bjen\b|pouze/u, false, 20), part(/dnes|zitra|do pulnoci|\d{1,2} ?(?:hod|min)/u)],
      [part(/omezen/u, true), part(/ (?:pocet|nabidk)/u)],
      [part(/rozhodnete se (?:hned|ihned|rychle|dnes)|\bjen pro (?:prvnich|nekolik|par)\b|\bposledni (?:volne|misto|den)\b|neprodlen/u)]),
    title: 'Tlak na rychlé rozhodnutí o půjčce', explanation: 'Tohle je varovný signál. Půjčka je závazek na dlouhou dobu. Kdo vás nutí rozhodnout se hned, nedává vám čas si nabídku ověřit.' },
];
const loanSensitive = ['loan_bank_login', 'loan_sms_code', 'loan_card_details', 'loan_remote_access', 'loan_id_document'];

// Guided loan questions: fixed choices about WHAT the other party asked for. The
// sensitive value itself (document, password, code, card number) is never accepted.
const advanceAnswers = new Set(['yes', 'no', 'unsure']);
const requestAnswers = new Map([
  ['id_document', 'loan_id_document'], ['bank_login', 'loan_bank_login'], ['sms_code', 'loan_sms_code'],
  ['card_details', 'loan_card_details'], ['remote_access', 'loan_remote_access'], ['none', null], ['unsure', null],
]);
function loanContext(input) {
  if (input.topic === undefined && input.loan_context === undefined) return undefined;
  if (input.topic !== 'loan') throw new Error('Neplatné téma.');
  // Only an absent field means "not answered"; null or any other type is rejected.
  const answers = input.loan_context === undefined ? {} : input.loan_context;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.getPrototypeOf(answers) !== Object.prototype
    || Object.keys(answers).some(key => key !== 'advance_payment' && key !== 'requests')) throw new Error('Neplatné odpovědi.');
  const advance = answers.advance_payment === undefined ? null : answers.advance_payment;
  const requests = answers.requests === undefined ? [] : answers.requests;
  if (answers.advance_payment !== undefined && !advanceAnswers.has(advance)) throw new Error('Neplatné odpovědi.');
  if (!Array.isArray(requests) || requests.length > requestAnswers.size || new Set(requests).size !== requests.length
    || !requests.every(value => typeof value === 'string' && requestAnswers.has(value))
    || (requests.length > 1 && requests.some(value => value === 'none' || value === 'unsure'))) throw new Error('Neplatné odpovědi.');
  return Object.freeze({ advance_payment: advance, requests: Object.freeze([...requests].sort()) });
}

export function intakeAgent(input) {
  if (preparedInputs.has(input)) return input;
  if (!input || typeof input !== 'object' || !['text', 'url'].includes(input.type)) throw new Error('Vyberte text nebo URL.');
  if (typeof input.content !== 'string' || !input.content.trim()) throw new Error('Vložte obsah, který chcete ověřit.');
  if (input.content.length > 10000) throw new Error('Vstup může mít nejvýše 10 000 znaků.');
  const content = input.content;
  if (input.type === 'url') {
    let url;
    try { url = new URL(content.trim()); } catch { throw new Error('Vložte úplnou URL začínající https:// nebo http://.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Podporujeme jen HTTP(S) URL bez přihlašovacích údajů.');
  }
  const loan = loanContext(input);
  const intake = Object.freeze({ type: input.type, content, matching: Object.freeze(matchingRepresentation(content)), ...(loan && { topic: 'loan', loan }) });
  preparedInputs.add(intake);
  return intake;
}

// Only a privately branded intake for these exact raw fields can be reused.
// JSON fields, copied objects and client-provided matching data are untrusted.
export function reusePreparedInput(input, prepared) {
  if (!preparedInputs.has(prepared) || input?.type !== prepared.type || input?.content !== prepared.content) return input;
  let loan;
  try { loan = loanContext(input); } catch { return input; }
  return JSON.stringify(loan) === JSON.stringify(prepared.loan) ? prepared : input;
}

export function hasLoanWarning(signals) {
  return signals.some(signal => signal.id.startsWith('loan_'));
}

function loanSituation({ type, matching, topic }) {
  return topic === 'loan' || (type === 'text' && loanWords.test(matching.content));
}

export function fraudAgent({ content, type, matching = matchingRepresentation(content), topic, loan }) {
  const signals = type === 'text' ? rules.filter(rule => rule.pattern.test(matching.content) || rule.ordered?.(matching.content)).map(({ pattern, ordered, ...rule }) => rule) : [];
  if (type === 'text') signals.push(...highHarmWarnings(matching.content, signals));
  if (matching.hiddenCharacters || matching.foldedConfusables) signals.push({ id: 'unusual_characters', weight: 5, title: 'Neobvyklý zápis znaků', explanation: 'Text obsahuje neviditelné nebo podobně vypadající znaky. Mohou mít běžný jazykový důvod, ale také skrývat rizikové výrazy.' });
  const links = type === 'url' ? [content] : (content.match(/https?:\/\/[^\s<>"']+/giu) || []);
  if (links.length) signals.push({ id: 'link', weight: 10, title: 'Obsahuje internetový odkaz', explanation: 'Cíl odkazu nebyl otevřen ani ověřen. Odkaz sám o sobě není důkaz podvodu.' });
  if (links.some(link => { try { const url = new URL(link); return url.protocol === 'http:' || url.username || url.password || isIP(url.hostname.replace(/^\[|\]$/g, '')) || url.hostname.includes('xn--'); } catch { return false; } })) signals.push({ id: 'unusual_url', weight: 25, title: 'Odkaz potřebuje zvláštní opatrnost', explanation: 'Odkaz používá nešifrovaný přenos, číselnou adresu, vložené přihlašovací údaje nebo zvláštní zápis domény. To samo podvod nedokazuje.' });
  if (!loanSituation({ type, matching, topic })) return signals;
  // Text rules and the user's own answers produce the same fixed signals once.
  const scan = type === 'text' ? loanScan(matching.content) : undefined;
  const found = new Set(type === 'text' ? loanRules.filter(rule => rule.pattern.test(matching.content, scan) || rule.ordered?.(matching.content)).map(rule => rule.id) : []);
  if (loan?.advance_payment === 'yes') found.add('loan_advance_fee');
  for (const answer of loan?.requests || []) if (requestAnswers.get(answer)) found.add(requestAnswers.get(answer));
  const generic = new Set(signals.map(signal => signal.id));
  if (generic.has('urgency')) found.delete('loan_pressure');
  // A specific loan signal replaces the broader generic one it explains better.
  const replaced = new Set([
    ...(found.has('loan_advance_fee') ? ['money'] : []),
    ...(['loan_bank_login', 'loan_sms_code', 'loan_card_details'].some(id => found.has(id)) ? ['credentials'] : []),
  ]);
  return [
    ...loanRules.filter(rule => found.has(rule.id)).map(({ pattern, ordered, ...rule }) => rule),
    ...signals.filter(signal => !replaced.has(signal.id)),
  ];
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
// loanWarning: at least one loan-specific signal. A mere mention of a payment
// in a loan text is not described as a warning sign.
export function resultSummary(score, type, signalCount, topic, loanWarning = false) {
  return type === 'url' ? 'Cíl odkazu nebyl ověřen. Stránku jsme nenavštívili; z tohoto výsledku nelze určit její bezpečnost.'
    : topic === 'loan' ? (loanWarning || score >= 60
      ? 'U této nabídky půjčky jsme našli varovné signály. Než cokoli zaplatíte, podepíšete nebo pošlete, ověřte si poskytovatele nezávisle.'
      : signalCount ? 'U této nabídky jsme našli věci, které je vhodné ověřit. Mohou se objevit i u poctivé nabídky. Poskytovatele si přesto ověřte nezávisle.'
      : 'U této nabídky půjčky jsme nenašli známé varovné signály. Z toho nelze poznat, zda je nabídka v pořádku. Poskytovatele si přesto ověřte nezávisle.')
    : score >= 60 ? 'Obsah obsahuje více výrazných rizikových signálů. Požadavek si nezávisle ověřte.'
    : signalCount ? 'Našli jsme signály, které je vhodné ověřit. Mohou se objevit i v legitimní komunikaci.'
    : 'Pravidla nenašla známé signály. Z toho nelze poznat, zda je obsah důvěryhodný.';
}

// Fixed, reviewed loan guidance. No registry lookup is made or simulated: the
// user is sent to the official source and told what this result cannot confirm.
function loanActions(signalIds) {
  const primary = signalIds.has('loan_advance_fee')
    ? 'Nic předem neplaťte. Platba předem před získáním půjčky si zaslouží zvýšenou opatrnost.'
    : loanSensitive.some(id => signalIds.has(id))
      ? 'Neposílejte doklady, přihlašovací údaje, kódy ani údaje z karty a nic neinstalujte, dokud si poskytovatele nezávisle neověříte.'
      : 'Než cokoli podepíšete nebo zaplatíte, ověřte si poskytovatele nezávisle.';
  return [primary, 'Nesdělujte hesla, PIN ani jednorázové kódy.', 'Na rozhodnutí o půjčce máte čas. Smlouvu si v klidu přečtěte, než ji podepíšete.', 'Podezřelé odkazy a přílohy neotevírejte.'];
}
const loanVerification = [
  'Poskytovatele si ověřte nezávisle. Na webu České národní banky, který si otevřete sami, zjistěte, zda má oprávnění poskytovat spotřebitelské úvěry. Nepoužívejte odkaz ani telefon ze zprávy.',
  'Porovnejte přesný název firmy z nabídky s názvem v seznamu ČNB. Podobný název ještě neznamená, že jde o stejnou firmu.',
  'Než cokoli podepíšete nebo zaplatíte, poraďte se s někým, komu důvěřujete.',
  'Použijte jiný komunikační kanál. Nepřebírejte telefon ani odkaz z posuzované zprávy.',
];
export function loanUncertainties(intake) {
  const loan = intake.loan;
  return [
    'Neověřovali jsme, zda má poskytovatel oprávnění od České národní banky. Tento výsledek to nepotvrzuje ani nevyvrací.',
    'Ani zápis v seznamu ČNB nezaručuje, že nabídka opravdu přišla od této firmy. Podvodníci se za skutečné firmy někdy vydávají.',
    ...(loan && (loan.advance_payment || loan.requests.length) ? ['Vaše odpovědi na doplňující otázky jsme vzali v úvahu. Neověřovali jsme je.'] : []),
    ...(loan?.advance_payment === 'no' ? ['To, že po vás platbu předem nechtějí, ještě neznamená, že je nabídka v pořádku.'] : []),
    ...(loan?.advance_payment === 'unsure' ? ['Pokud po vás budou chtít cokoli zaplatit ještě před vyplacením půjčky, berte to jako varovný signál.'] : []),
    ...(loan?.requests.includes('none') ? ['To, že po vás zatím nic z uvedeného nechtějí, ještě neznamená, že je nabídka v pořádku.'] : []),
    ...(loan?.requests.includes('unsure') ? ['Pokud po vás budou chtít doklad, přihlašovací údaje, kód, údaje z karty nebo vzdálený přístup, berte to jako varovný signál.'] : []),
  ];
}

export function analyze(input) {
  const intake = intakeAgent(input);
  const signals = fraudAgent(intake);
  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  const level = resultLevel(score, intake.type, signals.length);
  const topic = loanSituation(intake) ? 'loan' : undefined;
  return safetyCritic({
    id: randomUUID(), input_type: intake.type, engine: 'rules-v1', risk_score: score, risk_level: level,
    ...(topic && { topic }),
    summary: resultSummary(score, intake.type, signals.length, topic, hasLoanWarning(signals)),
    signals: signals.map(({ weight, ...signal }) => signal),
    recommended_actions: topic ? loanActions(new Set(signals.map(signal => signal.id)))
      : signals.some(signal => signal.id === 'safe_account_transfer')
        ? ['Peníze nepřevádějte. Banku kontaktujte přes svou známou oficiální aplikaci nebo číslo na své kartě, ne přes kontakt ze zprávy.', 'Nesdělujte hesla, PIN ani jednorázové kódy.', 'Podezřelé odkazy a přílohy neotevírejte.']
      : signals.some(signal => signal.id === 'family_cash_pickup')
        ? ['Hotovost nepředávejte ani peníze neposílejte. Příbuznému zavolejte na číslo, které už znáte z dřívějška.', 'Požadavek proberte s někým, komu důvěřujete. Nespoléhejte na kontakt ze zprávy.', 'Nesdělujte hesla, PIN ani jednorázové kódy.']
      : signals.some(signal => signal.id === 'new_number') && signals.some(signal => signal.id === 'money')
        ? ['Peníze zatím neposílejte. Blízkému zavolejte na jeho původní číslo, které už znáte.', 'Nepřebírejte kontakt z této zprávy.', 'Nesdělujte hesla, PIN ani jednorázové kódy.']
      : signals.some(signal => signal.id === 'credentials')
        ? ['Heslo, PIN ani ověřovací kód nesdělujte. Požadavek ověřte přes známý kontakt nebo oficiální aplikaci.', 'Nepoužívejte kontakt ani odkaz ze zprávy.']
      : ['Před platbou nebo sdílením údajů si požadavek nezávisle ověřte.', 'Nesdělujte hesla, PIN ani jednorázové kódy.', 'Podezřelé odkazy a přílohy neotevírejte.'],
    verification_steps: topic ? [...loanVerification] : verificationAgent(),
    uncertainties: [
      'Tato veřejná zkušební verze používá česká textová pravidla, nikoli AI model. Nerozpozná všechny podvody a může označit i pravou zprávu.',
      'Neověřili jsme totožnost odesílatele, pravdivost tvrzení ani obsah odkazovaných stránek.',
      ...(intake.type === 'url' ? ['URL jsme pouze rozebrali. Stránku jsme nenavštívili a její bezpečnost nelze tímto skóre určit.'] : []),
      ...(topic ? loanUncertainties(intake) : []),
    ],
  });
}

