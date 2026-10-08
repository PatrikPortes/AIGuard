import { randomUUID } from 'node:crypto';

// Equivalent ordered phrases, evaluated once per line instead of restarting a
// greedy scan at each repeated prefix (quadratic time on adversarial inputs).
function orderedPhrase(content, prefix, suffix) {
  return content.split(/[\n\r\u2028\u2029]/u).some(line => {
    const match = prefix.exec(line);
    return match !== null && suffix.test(line.slice(match.index + match[0].length));
  });
}

const rules = [
  { id: 'urgency', weight: 20, pattern: /ihned|okamžit|urgent|poslední (šance|výzva)|do \d+ (minut|hodin)/iu, ordered: content => orderedPhrase(content, /dnes/iu, /zapla|pošl/iu), title: 'Tlak na rychlé rozhodnutí', explanation: 'Spěch může bránit tomu, abyste si požadavek v klidu ověřili.' },
  { id: 'money', weight: 25, pattern: /převe[ďd]|převod|zapla[ťt]|uhra[ďd]|platb|účtu|faktur/iu, ordered: content => orderedPhrase(content, /pošli/iu, /peníz|peněz|korun|kč/iu), title: 'Požadavek nebo zmínka o platbě', explanation: 'Platby jsou běžné i v pravé komunikaci. Nečekaný požadavek ale ověřte zvlášť.' },
  { id: 'new_number', weight: 35, pattern: /nové (číslo|cislo)|nový telefon|rozbit.*telefon|ztrati[lva]+.*telefon/iu, title: 'Změna telefonu nebo čísla', explanation: 'Někdo může předstírat blízkou osobu. Zavolejte jí na číslo, které už znáte.' },
  { id: 'credentials', weight: 65, pattern: /(pošl|sděl|zadej|zadejte|vyplň|potvrď).{0,70}(hesl|pin\b|kód|kod|kart)|přihlaste.{0,50}(odkaz|zde)/iu, title: 'Žádost o heslo, kód nebo údaje karty', explanation: 'Předání těchto údajů může umožnit přístup k vašemu účtu nebo penězům.' },
  { id: 'secrecy', weight: 25, pattern: /nikomu (neříkej|neříkejte)|nevolej|nevolat|tajně|utaj/iu, title: 'Omezení nezávislého ověření', explanation: 'Požadavek na utajení nebo zákaz volání může být pokus obejít vaše běžné ověřování.' },
  { id: 'investment', weight: 45, pattern: /garantovan.{0,25}(výnos|zisk)|bez rizika|zdvojnásob.{0,25}(peníz|vklad)|\d+\s*%.{0,25}(denně|týdně)/iu, title: 'Slib mimořádného výnosu', explanation: 'Jistý vysoký zisk je varovný signál. Nabídku ověřte nezávisle, než pošlete peníze.' },
  { id: 'authority', weight: 15, pattern: /bank[ay]|polici[ei]|kurýr|zásilk|finanční úřad/iu, title: 'Odkaz na instituci nebo doručení', explanation: 'Jméno známé organizace samo o sobě nepotvrzuje totožnost odesílatele.' },
];

export function intakeAgent(input) {
  if (!input || typeof input !== 'object' || !['text', 'url'].includes(input.type)) throw new Error('Vyberte text nebo URL.');
  if (typeof input.content !== 'string' || !input.content.trim()) throw new Error('Vložte obsah, který chcete ověřit.');
  if (input.content.length > 10000) throw new Error('Vstup může mít nejvýše 10 000 znaků.');
  const content = input.content.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (input.type === 'url') {
    let url;
    try { url = new URL(content); } catch { throw new Error('Vložte úplnou URL začínající https:// nebo http://.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Podporujeme jen HTTP(S) URL bez přihlašovacích údajů.');
  }
  return { type: input.type, content };
}

export function fraudAgent({ content, type }) {
  const signals = type === 'text' ? rules.filter(rule => rule.pattern.test(content) || rule.ordered?.(content)).map(({ pattern, ordered, ...rule }) => rule) : [];
  const links = type === 'url' ? [content] : (content.match(/https?:\/\/[^\s<>"']+/giu) || []);
  if (links.length) signals.push({ id: 'link', weight: 10, title: 'Obsahuje internetový odkaz', explanation: 'Cíl odkazu nebyl otevřen ani ověřen. Odkaz sám o sobě není důkaz podvodu.' });
  if (links.some(link => { try { const url = new URL(link); return url.protocol === 'http:' || url.username || url.password || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes('xn--'); } catch { return false; } })) signals.push({ id: 'unusual_url', weight: 25, title: 'Odkaz potřebuje zvláštní opatrnost', explanation: 'Odkaz používá nešifrovaný přenos, číselnou adresu, vložené přihlašovací údaje nebo zvláštní zápis domény. To samo podvod nedokazuje.' });
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

export function analyze(input) {
  const intake = intakeAgent(input);
  const signals = fraudAgent(intake);
  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  const level = score < 30 ? 'low' : score < 60 ? 'caution' : score < 80 ? 'high' : 'very_high';
  return safetyCritic({
    id: randomUUID(), input_type: intake.type, engine: 'rules-v1', risk_score: score, risk_level: level,
    summary: score >= 60 ? 'Obsah obsahuje více výrazných rizikových signálů. Požadavek si nezávisle ověřte.' : signals.length ? 'Našli jsme signály, které je vhodné ověřit. Mohou se objevit i v legitimní komunikaci.' : 'Pravidla nenašla známé signály. Z toho nelze poznat, zda je obsah důvěryhodný.',
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
