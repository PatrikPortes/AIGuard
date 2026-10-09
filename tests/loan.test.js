import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, intakeAgent, reusePreparedInput } from '../src/analysis.js';
import { AnalysisPipeline, validateInput } from '../src/ai/pipeline.js';
import { createServer } from '../src/server.js';
import { aiFixture, validOutput } from '../test-support/ai.js';

const ids = result => result.signals.map(signal => signal.id);
const loanIds = result => ids(result).filter(id => id.startsWith('loan_'));
const text = (content, extra = {}) => analyze({ type: 'text', content, ...extra });
const guided = (loan_context, content = 'Nabídka půjčky 30 000 Kč na cokoli.') => text(content, { topic: 'loan', loan_context });
// Everything the user reads: summary, signals, actions, steps and limitations.
const visible = result => [result.summary, ...result.signals.flatMap(signal => [signal.title, signal.explanation]),
  ...result.recommended_actions, ...result.verification_steps, ...result.uncertainties].join('\n');

test('L1: advance payment before receiving the loan is a warning signal in many wordings', () => {
  for (const content of [
    'Před vyplacením půjčky je nutné uhradit poplatek 1 500 Kč.',
    'Váš úvěr je schválen. Než vám peníze pošleme, zaplaťte pojištění 990 Kč.',
    'Půjčka bez starostí: vratná záloha 2 000 Kč, potom peníze ihned vyplatíme.',
    'Pro uvolnění půjčky zašlete aktivační poplatek.',
    'Půjčka 80 000 Kč. Poplatek za vyřízení 1 200 Kč pošlete předem na účet.',
  ]) {
    const result = text(content);
    assert.equal(result.topic, 'loan', content);
    assert.ok(loanIds(result).includes('loan_advance_fee'), content);
    assert.equal(result.recommended_actions[0], 'Nic předem neplaťte. Platba předem před získáním půjčky si zaslouží zvýšenou opatrnost.');
    assert.match(visible(result), /Platba předem před získáním půjčky si zaslouží zvýšenou opatrnost\./);
    // The specific loan signal replaces the generic "payment mention".
    assert.ok(!ids(result).includes('money'), content);
  }
});

test('L1: guaranteed approval, "bez registru / pro každého" and pressure are recognised', () => {
  assert.deepEqual(loanIds(text('Půjčka pro každého, i bez registru. Schválení garantováno.')).sort(), ['loan_guaranteed', 'loan_no_registry']);
  assert.ok(loanIds(text('Nebankovní půjčka: 100% schválení i pro dlužníky a s exekucí.')).includes('loan_guaranteed'));
  assert.ok(loanIds(text('Úvěr schválíme každému bez výjimky.')).includes('loan_guaranteed'));
  assert.deepEqual(loanIds(text('Akční nabídka půjčky platí jen dnes do půlnoci! Rozhodněte se hned.')), ['loan_pressure']);
  // Generic urgency already explains the pressure; no duplicate signal.
  const urgent = text('Půjčku vyplatíme ihned, nabídka platí jen do zítra.');
  assert.ok(ids(urgent).includes('urgency') && !ids(urgent).includes('loan_pressure'));
});

test('L1: requests for documents, banking login, SMS codes, card details and remote access', () => {
  const cases = [
    ['Půjčka ihned. Pošlete fotku občanky z obou stran.', 'loan_id_document'],
    ['K úvěru potřebujeme kopii občanského průkazu.', 'loan_id_document'],
    ['K vyřízení půjčky potřebujeme přihlašovací údaje do internetového bankovnictví.', 'loan_bank_login'],
    ['Půjčka: sdělte nám kód z SMS, který vám přijde.', 'loan_sms_code'],
    ['Pro schválení úvěru pošlete ověřovací kód.', 'loan_sms_code'],
    ['K půjčce napište číslo platební karty a CVV.', 'loan_card_details'],
    ['Pro rychlé vyřízení půjčky si nainstalujte AnyDesk.', 'loan_remote_access'],
    ['Půjčku vyřídíme přes vzdálený přístup k vašemu počítači.', 'loan_remote_access'],
  ];
  for (const [content, id] of cases) {
    const result = text(content);
    assert.ok(loanIds(result).includes(id), `${id}: ${content} → ${ids(result)}`);
    assert.match(result.summary, /našli varovné signály/);
  }
  // Card and SMS signals replace the broader generic credentials signal.
  assert.ok(!ids(text('K půjčce pošlete kód z SMS a číslo karty.')).includes('credentials'));
});

test('L1: ordinary loan communication and ordinary words are not condemned', () => {
  for (const content of [
    'Dobrý den, děkujeme za zájem o spotřebitelský úvěr. Před podpisem smlouvy vám zašleme formulář se standardními informacemi. Poplatek za vedení úvěrového účtu je uveden v sazebníku.',
    'Půjčku vám schválíme po posouzení vaší žádosti. Nic předem neplatíte. Doklad totožnosti předložíte na pobočce.',
    'Splátka úvěru ve výši 3 200 Kč bude stržena 15. 5.',
    'Před vyplacením půjčky s vámi podepíšeme smlouvu. Bez poplatků předem.',
    'Schválení úvěru není garantováno, záleží na posouzení vaší situace.',
    'Smlouvu o úvěru podepíšete v naší aplikaci kódem, který vám přijde v SMS. Kód nikomu nesdělujte.',
    'Přihlaste se přes Bankovní identitu a dokončete žádost o hypotéku.',
    'Pošlete prosím kopii dokladu o příjmu k žádosti o úvěr.',
  ]) {
    const result = text(content);
    assert.equal(result.topic, 'loan', content);
    assert.deepEqual(loanIds(result), [], content);
    assert.ok(['unassessed', 'caution'].includes(result.risk_level), content);
    assert.doesNotMatch(result.summary, /našli varovné signály/, content);
  }
  // Without a loan context, the words alone change nothing and add no loan guidance.
  for (const content of ['Poplatek za parkování je 50 Kč.', 'Nezapomeňte si vzít doklad totožnosti.', 'Půjčíš mi knihu? Vrátím ji zítra.', 'Můžete mi věřit, uvěřte mi.']) {
    const result = text(content);
    assert.equal(result.topic, undefined, content);
    assert.equal(Object.hasOwn(result, 'topic'), false);
    assert.deepEqual(loanIds(result), []);
  }
});

test('L2: guided answers add signals for what was requested, never the values', () => {
  const result = guided({ advance_payment: 'yes', requests: ['sms_code', 'id_document', 'card_details'] });
  assert.deepEqual(loanIds(result), ['loan_advance_fee', 'loan_sms_code', 'loan_card_details', 'loan_id_document']);
  assert.equal(result.topic, 'loan');
  assert.match(result.summary, /našli varovné signály/);
  assert.ok(result.uncertainties.includes('Vaše odpovědi na doplňující otázky jsme vzali v úvahu. Neověřovali jsme je.'));
  for (const [answer, id] of [['bank_login', 'loan_bank_login'], ['remote_access', 'loan_remote_access']]) {
    assert.deepEqual(loanIds(guided({ requests: [answer] })), [id]);
  }
  // Same signal from text and answer appears once.
  assert.equal(ids(guided({ advance_payment: 'yes' }, 'Před vyplacením půjčky uhraďte poplatek.')).filter(id => id === 'loan_advance_fee').length, 1);
});

test('L2: "no", "none" and "not sure" answers never turn into reassurance', () => {
  const none = guided({ advance_payment: 'no', requests: ['none'] });
  assert.deepEqual(none.signals, []);
  assert.match(none.summary, /nelze poznat, zda je nabídka v pořádku/);
  assert.ok(none.uncertainties.includes('To, že po vás platbu předem nechtějí, ještě neznamená, že je nabídka v pořádku.'));
  assert.ok(none.uncertainties.includes('To, že po vás zatím nic z uvedeného nechtějí, ještě neznamená, že je nabídka v pořádku.'));
  const unsure = guided({ advance_payment: 'unsure', requests: ['unsure'] });
  assert.deepEqual(unsure.signals, []);
  assert.ok(unsure.uncertainties.some(item => item.startsWith('Pokud po vás budou chtít cokoli zaplatit')));
  assert.ok(unsure.uncertainties.some(item => item.startsWith('Pokud po vás budou chtít doklad')));
  // Answers cannot hide what the text itself says.
  assert.ok(loanIds(guided({ advance_payment: 'no', requests: ['none'] }, 'Půjčka: před vyplacením zaplaťte pojištění 900 Kč.')).includes('loan_advance_fee'));
  // The topic alone (no answers) is valid and adds loan guidance.
  const plain = text('Nabídka na 20 000 Kč.', { topic: 'loan' });
  assert.equal(plain.topic, 'loan');
  assert.ok(!plain.uncertainties.some(item => item.includes('odpovědi')));
});

test('Loan results stay truthful: no safety, scam or authorisation verdicts and no visible score', () => {
  const samples = [
    text('Půjčka pro každého, bez registru. Před vyplacením uhraďte poplatek.'),
    text('Děkujeme za zájem o spotřebitelský úvěr. Smlouvu vám zašleme e-mailem.'),
    guided({ advance_payment: 'no', requests: ['none'] }),
    guided({ advance_payment: 'yes', requests: ['bank_login'] }),
    analyze({ type: 'url', content: 'https://pujcka-priklad.invalid/', topic: 'loan', loan_context: {} }),
  ];
  for (const result of samples) {
    const copy = visible(result);
    assert.doesNotMatch(copy, /(?<!\p{L})(?:je (?:to )?bezpečn|určitě (?:jde o )?podvod|je důvěryhodn|poskytovatel je (?:ověřen|registrován|důvěryhodn)|poskytovatel má oprávnění)/iu);
    // "v pořádku" only ever appears in a negated or limiting sentence.
    for (const sentence of copy.split(/(?<=\.)\s+/u).filter(item => item.includes('v pořádku'))) assert.match(sentence, /neznamená|nelze/u, sentence);
    assert.doesNotMatch([result.summary, ...result.recommended_actions, ...result.signals.map(signal => signal.title)].join('\n'), /\d+\s*%|skóre|\/\s*100/u);
    // No registry check is made or implied; the user is sent to the official source.
    assert.ok(result.uncertainties.includes('Neověřovali jsme, zda má poskytovatel oprávnění od České národní banky. Tento výsledek to nepotvrzuje ani nevyvrací.'));
    assert.ok(result.verification_steps[0].startsWith('Poskytovatele si ověřte nezávisle.'));
    assert.match(result.verification_steps[0], /který si otevřete sami.*Nepoužívejte odkaz ani telefon ze zprávy/u);
    assert.ok(result.uncertainties.some(item => item.includes('nikoli důkaz')));
  }
});

test('Loan input text is never echoed: guidance comes only from fixed templates', () => {
  const marker = 'MARKER-42 https://utocnik.invalid 777123456';
  const result = text(`Půjčka pro každého ${marker}. Před vyplacením uhraďte poplatek.`, { topic: 'loan', loan_context: { advance_payment: 'yes', requests: ['sms_code'] } });
  assert.doesNotMatch(JSON.stringify({ ...result, id: undefined }), /MARKER-42|utocnik|777123456/);
});

test('Guided-question context is validated strictly; tampered values are rejected', async () => {
  const base = { type: 'text', content: 'Nabídka půjčky.' };
  const invalid = [
    { topic: 'LOAN' }, { topic: 'credit' }, { topic: 1 }, { topic: null }, { topic: ['loan'] },
    { loan_context: {} }, { loan_context: { advance_payment: 'yes' } },
    { topic: 'loan', loan_context: null }, { topic: 'loan', loan_context: [] }, { topic: 'loan', loan_context: 'yes' },
    { topic: 'loan', loan_context: { advance_payment: null } }, { topic: 'loan', loan_context: { requests: null } },
    { topic: 'loan', loan_context: { advance_payment: 'maybe' } }, { topic: 'loan', loan_context: { advance_payment: ' yes' } },
    { topic: 'loan', loan_context: { advance_payment: true } }, { topic: 'loan', loan_context: { requests: 'sms_code' } },
    { topic: 'loan', loan_context: { requests: ['password'] } }, { topic: 'loan', loan_context: { requests: ['sms_code', 'sms_code'] } },
    { topic: 'loan', loan_context: { requests: ['none', 'sms_code'] } }, { topic: 'loan', loan_context: { requests: ['unsure', 'none'] } },
    { topic: 'loan', loan_context: { requests: [{ value: 'sms_code' }] } }, { topic: 'loan', loan_context: { requests: Array(8).fill('none') } },
    // Values themselves are never accepted, in any field.
    { topic: 'loan', loan_context: { sms_code: '123456' } }, { topic: 'loan', loan_context: { card_number: '4111111111111111' } },
    { topic: 'loan', loan_context: { advance_payment: 'yes', note: 'heslo' } },
    { topic: 'loan', loan_context: JSON.parse('{"__proto__":{"advance_payment":"yes"}}') },
    { topic: 'loan', loan_context: Object.create({ advance_payment: 'yes' }) },
  ];
  for (const extra of invalid) {
    assert.throws(() => intakeAgent({ ...base, ...extra }), undefined, JSON.stringify(extra));
    assert.throws(() => validateInput({ ...base, ...extra }), { code: 'INVALID_INPUT' }, JSON.stringify(extra));
    await assert.rejects(new AnalysisPipeline().analyze({ ...base, ...extra }), { code: 'INVALID_INPUT' });
  }
  // Valid shapes, and an absent topic keeps the existing behaviour.
  for (const loan_context of [undefined, {}, { advance_payment: 'unsure' }, { requests: [] }, { requests: ['card_details', 'bank_login', 'id_document', 'sms_code', 'remote_access'] }]) {
    assert.equal(intakeAgent({ ...base, topic: 'loan', ...(loan_context && { loan_context }) }).topic, 'loan');
  }
  assert.equal(intakeAgent(base).topic, undefined);
  assert.ok(Object.isFrozen(intakeAgent({ ...base, topic: 'loan', loan_context: { requests: ['none'] } }).loan.requests));
});

test('Prepared input is reused only for the same validated loan context', async () => {
  const pipeline = new AnalysisPipeline();
  const input = { type: 'text', content: 'Nabídka půjčky.', topic: 'loan', loan_context: { advance_payment: 'no' } };
  const prepared = pipeline.validate(input);
  assert.equal(reusePreparedInput(input, prepared), prepared);
  for (const changed of [{ ...input, loan_context: { advance_payment: 'yes' } }, { type: 'text', content: input.content }, { ...input, topic: 'other' }]) {
    assert.notEqual(reusePreparedInput(changed, prepared), prepared);
  }
  const swapped = await pipeline.analyze({ ...input, loan_context: { advance_payment: 'yes' } }, { preparedInput: prepared });
  assert.ok(ids(swapped).includes('loan_advance_fee'));
  await assert.rejects(pipeline.analyze({ ...input, loan_context: { advance_payment: 'nope' } }, { preparedInput: prepared }), { code: 'INVALID_INPUT' });
});

test('HTTP: guided answers are validated before analysis; loan UI files are exact allowlisted routes', async t => {
  const server = createServer({ pipeline: new AnalysisPipeline() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = body => fetch(base + '/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const ok = await post({ type: 'text', content: 'Půjčka pro každého.', topic: 'loan', loan_context: { advance_payment: 'yes', requests: ['sms_code'] } });
  assert.equal(ok.status, 200);
  const result = await ok.json();
  assert.equal(result.topic, 'loan');
  assert.deepEqual(loanIds(result).sort(), ['loan_advance_fee', 'loan_no_registry', 'loan_sms_code']);
  assert.equal(result.loan_context, undefined); assert.equal(result.loan, undefined); assert.equal(result.content, undefined);
  for (const body of [{ type: 'text', content: 'x', topic: 'loan', loan_context: { requests: ['card_number:4111'] } },
    '{"type":"text","content":"x","topic":"loan","loan_context":{"__proto__":{"advance_payment":"yes"}}}']) {
    const rejected = await post(body);
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).code, 'INVALID_INPUT');
  }
  for (const [path, type] of [['/loan.js', 'text/javascript; charset=utf-8'], ['/loan.css', 'text/css; charset=utf-8']]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  }
  for (const path of ['/LOAN.JS', '/loan.js/', '/loan.js.', '/public/loan.js', '/loan.mjs', '/loan', '/loan.css.map']) {
    assert.ok([400, 404].includes((await fetch(base + path)).status), path);
  }
});

test('AI mode keeps the reviewed loan conclusion, guidance and limitations', async t => {
  const { pipeline, calls } = aiFixture(t);
  pipeline.worker.provider.complete = async request => { calls.push(request); return { ...validOutput(), risk_score: 10, signals: [], uncertainty: 'low' }; };
  const result = await pipeline.analyze({ type: 'text', content: 'Půjčka pro každého bez registru.', topic: 'loan', loan_context: { advance_payment: 'no' }, ai_consent: true });
  assert.equal(result.engine, 'rules+ai-v1');
  assert.equal(result.topic, 'loan');
  assert.match(result.summary, /našli varovné signály/);
  assert.ok(result.verification_steps[0].startsWith('Poskytovatele si ověřte nezávisle.'));
  assert.ok(result.uncertainties.includes('To, že po vás platbu předem nechtějí, ještě neznamená, že je nabídka v pořádku.'));
  // The model receives the content and rule ids, never the guided-answer structure.
  assert.doesNotMatch(calls[0].messages[1].content, /loan_context|advance_payment/);
});

test('Loan rules stay bounded on long adversarial input', () => {
  const inputs = ['pred '.repeat(1999), 'poplatek predem '.repeat(600), 'pujcka '.repeat(1428), 'fotka '.repeat(1666) + 'obcanky',
    'schvaleni '.repeat(999), 'bank heslo '.repeat(900), ('půjčka před vyplacením ' + 'x'.repeat(40)).repeat(150)];
  for (const content of inputs) {
    const start = performance.now();
    text(content.slice(0, 10000), { topic: 'loan', loan_context: { requests: ['unsure'] } });
    // Generous bound: a DoS guard against super-linear patterns, not a benchmark.
    assert.ok(performance.now() - start < 1000, content.slice(0, 20));
  }
});
