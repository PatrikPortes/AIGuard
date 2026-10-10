import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { analyze, fraudAgent, intakeAgent } from '../src/analysis.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { createServer } from '../src/server.js';
import { BoundedQueue } from '../src/ai/queue.js';
import { ServiceError } from '../src/ai/errors.js';

const family = [
  'Mami, potřebuju ihned peníze v hotovosti. Nikomu to neříkej. Přijde pro ně kamarád.',
  'Babi, připrav rychle 50 000 Kč. Nikomu o tom neříkejte. Kolega je vyzvedne.',
  'Jsem vaše vnučka. Vyberte hned peníze v hotovosti. Nikomu nic nesdělujte. Předáte je kurýrovi.',
  'Tati, mám nové číslo. Potřebuju ihned peníze. Nevolej mi. Kamarád si je vyzvedne.',
  'Tady tvůj syn. Potřebuji dnes peníze v hotovosti. Nikomu to neříkej. Známému je předáš.',
  'Mami, potřebuji naléhavě peníze. Nikomu nesdělujte tuto informaci. Kurýr je vyzvedne.',
];
const bank = [
  'Tady banka. Převeďte peníze na bezpečný účet.',
  'Jsem pracovník banky. Na bezpečný účet převeďte svůj zůstatek.',
  'Banka: přesuňte peníze na zabezpečený bankovní účet.',
  'Bankovní poradce: odešlete peníze na ochranný účet.',
  'Volám z banky. Převeďte peníze na „bezpečný účet“.',
];
const concealment = [
  'nikomu to neříkej', 'nikomu nesdělujte', 'nikomu nic nesdělujte',
  'nikomu o tom neříkejte', 'neříkejte to nikomu', 'nikomu nic neprozrazujte',
  'nikomu o platbě neříkej', 'nikomu to nezmiňujte',
];
const ordinary = [
  'Ahoj, zítra se potkáme u knihovny.',
  'Nikomu to neříkej, chystáme narozeninové překvapení.',
  'Nikomu nic nesdělujte o překvapení pro babičku.',
  'Babi, připrav hned peníze na nákup. Přijde pro ně kamarád.',
  'Banka vám doporučuje silné heslo a dvoufázové ověření.',
  'Banka: převeďte peníze na svůj běžný spořicí účet.',
  'Převod na bezpečný účet je známý trik podvodníků vydávajících se za banku.',
  'Banka nikdy nežádá převod peněz na bezpečný účet.',
  'Banka: nepřevádějte peníze na bezpečný účet.',
  'Posílám informace o tom, co je bezpečný účet.',
  'Převeďte peníze v bankovní aplikaci. Nikomu nesdělujte heslo.',
  'Banka: převeďte peníze mezi svými účty. Nikomu nesdělujte žádné údaje ani kódy.',
  'Vyberte peníze v bankomatu. Nikomu nesdělujte svůj PIN.',
];
const ids = result => result.signals.map(signal => signal.id);
const input = content => ({ type: 'text', content });

test('Rules safety: claimed family, urgent cash, secrecy and third-party pickup produce a combined warning', () => {
  for (const content of family) {
    const result = analyze(input(content));
    assert.ok(ids(result).includes('family_cash_pickup'), content);
    assert.ok(ids(result).includes('secrecy'), content);
    assert.equal(result.risk_level, 'very_high');
    assert.match(result.recommended_actions[0], /^Hotovost nepředávejte/);
    assert.match(result.recommended_actions[0], /číslo, které už znáte/);
    assert.ok(result.uncertainties.some(text => text.includes('nikoli důkaz')));
  }
  assert.ok(ids(analyze(input(family[3]))).includes('new_number'), 'original signal preserved');
  for (const content of [
    'Mami, potřebuju peníze. Nikomu to neříkej. Zastavím se osobně.',
    'Mami, potřebuju peníze. Nikomu to neříkej. Kamarád je vyzvedne příští měsíc.',
    'Kamarád vyzvedne peníze. Nikomu to neříkej, spěchá to.',
  ]) assert.ok(!ids(analyze(input(content))).includes('family_cash_pickup'), 'missing mandatory combination indicator');
});
test('Rules safety: bank claim plus transfer instruction to a safe account produces a combined warning', () => {
  for (const content of bank) {
    const result = analyze(input(content));
    assert.ok(ids(result).includes('safe_account_transfer'), content);
    assert.ok(['high', 'very_high'].includes(result.risk_level));
    assert.match(result.recommended_actions[0], /^Peníze nepřevádějte/);
    assert.match(result.recommended_actions[0], /ne přes kontakt ze zprávy/);
    assert.doesNotMatch(result.summary, /ověřený podvod|potvrdili jsme podvod|je bezpečn/iu);
  }
});
test('Rules safety: Czech secrecy variants warn in a cash-request context and never duplicate the existing signal', () => {
  for (const phrase of concealment) {
    const result = analyze(input(`Pošli mi peníze. ${phrase}.`));
    assert.equal(ids(result).filter(id => id === 'secrecy').length, 1, phrase);
    assert.ok(ids(result).includes('money'));
  }
  assert.equal(ids(analyze(input('Pošli mi peníze. Nikomu neříkej a nikomu to neříkej.'))).filter(id => id === 'secrecy').length, 1);
  assert.ok(ids(analyze(input('Pošli mi peníze. Nikomu nesdělujte heslo. Nikomu to neříkej.'))).includes('secrecy'), 'protecting a password cannot hide a separate secrecy request');
});
test('Rules safety: ordinary messages, password protection, missing indicators and distant clauses do not gain the new warnings', () => {
  for (const content of ordinary) {
    const result = analyze(input(content));
    assert.ok(!ids(result).includes('family_cash_pickup'), content);
    assert.ok(!ids(result).includes('safe_account_transfer'), content);
    assert.ok(!ids(result).includes('secrecy'), content);
    assert.notEqual(result.risk_level, 'low');
  }
  for (const content of ['Nikomu to neříkej.', 'Nikomu nesdělujte.']) assert.equal(analyze(input(content)).risk_level, 'unassessed');
  const distant = 'Mami, potřebuji hned peníze. ' + 'x '.repeat(600) + 'Nikomu to neříkej. Kamarád je vyzvedne.';
  assert.ok(!ids(analyze(input(distant))).includes('family_cash_pickup'));
  // Clipped window edges must not invent a standalone family-address token.
  const clipped = ' '.repeat(399) + 'nemami, potřebuju ihned peníze. Nikomu to neříkej. Kamarád je vyzvedne.';
  assert.ok(!ids(analyze(input(clipped))).includes('family_cash_pickup'));
});
test('Rules safety: Unicode folding, overlapping window boundaries, original bytes and request-local state remain intact', () => {
  for (const content of [family[0], family[0].normalize('NFD'), family[0].toUpperCase(), family[0].replaceAll('a', 'а'), family[0].replaceAll(' ', '\u200b ')]) {
    assert.equal(intakeAgent(input(content)).content, content);
    assert.ok(ids(analyze(input(content))).includes('family_cash_pickup'));
  }
  for (const offset of [0, 350, 399, 400, 750, 799, 800, 9300]) {
    const content = 'x '.repeat(Math.floor(offset / 2)) + bank[0];
    assert.ok(ids(analyze(input(content))).includes('safe_account_transfer'), `offset ${offset}`);
  }
  analyze(input(family[0]));
  assert.equal(analyze(input(ordinary[0])).signals.length, 0);
  assert.equal(analyze({ type: 'url', content: 'https://banka-bezpecny-ucet.invalid' }).risk_level, 'unassessed');
});

async function request(base, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + path, { method: body ? 'POST' : 'GET', headers: { Host: 'safety.test', Origin: 'https://safety.test', 'Content-Type': 'application/json', ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}
test('Rules safety HTTP: rules-only and consent-free unconfigured labelled fallback retain the warnings and safe actions', async t => {
  for (const mode of ['rules', 'ai']) {
    let jobs = 0;
    const pipeline = new AnalysisPipeline({ mode, ...(mode === 'ai' && { fallbackToRules: true, unavailableCode: 'AI_INVALID_CONFIG', queue: { submit() { jobs++; throw Error('must not invoke AI'); }, close() {} } }) });
    const server = createServer({ pipeline, publicOrigin: 'https://safety.test' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const session = await request(base, '/api/session');
    const Cookie = session.headers['set-cookie'][0].split(';')[0];
    for (const [content, signal] of [[family[0], 'family_cash_pickup'], [bank[0], 'safe_account_transfer'], ['Pošli mi peníze. Nikomu to neříkej.', 'secrecy'], [ordinary[0], null]]) {
      const result = await request(base, '/api/analyze', { ...input(content), ai_consent: false }, { Cookie });
      assert.equal(result.status, 200); assert.equal(result.body.engine, 'rules-v1');
      if (signal) assert.ok(ids(result.body).includes(signal));
      else assert.equal(result.body.risk_level, 'unassessed');
      assert.deepEqual(result.body.recommended_actions, analyze(input(content)).recommended_actions);
      if (mode === 'ai') {
        assert.equal(result.body.ai_status, 'not_performed'); assert.equal(result.body.ai_fallback_reason, 'not_configured');
      } else assert.equal(Object.hasOwn(result.body, 'ai_status'), false);
    }
    assert.equal(jobs, 0); t.diagnostic(`${mode}: 4 real secured HTTP responses; AI queue invocations=0`);
  }
});
test('Rules safety: configured AI timeout preserves the warning floor and action-first fallback, without bypassing consent', async t => {
  let calls = 0;
  const pipeline = new AnalysisPipeline({ mode: 'ai', fallbackToRules: true, queue: new BoundedQueue({}),
    worker: { async run() { calls++; throw new ServiceError('AI_TIMEOUT'); } } });
  t.after(() => pipeline.close());
  for (const content of [family[0], bank[0]]) {
    const before = calls;
    await assert.rejects(pipeline.analyze({ ...input(content), ai_consent: false }), { code: 'AI_CONSENT_REQUIRED' });
    assert.equal(calls, before);
    const result = await pipeline.analyze({ ...input(content), ai_consent: true });
    assert.deepEqual(result.signals, analyze(input(content)).signals);
    assert.deepEqual(result.recommended_actions, analyze(input(content)).recommended_actions);
    assert.equal(result.engine, 'rules-v1'); assert.equal(result.ai_status, 'not_performed');
    assert.equal(result.ai_fallback_reason, 'timeout');
  }
  assert.equal(calls, 2);
});
test('Rules safety: repeated prefixes, near-misses and maximum Unicode expansion keep the unchanged 20ms CPU budget', async t => {
  const corpus = [
    'nikomu to nerikej '.repeat(580).slice(0, 10000),
    'banka prevedte '.repeat(660).slice(0, 10000),
    'bezpecny ucet '.repeat(760).slice(0, 10000),
    ('mami hned penize nikomu to nerikej kamarad '.repeat(250)).slice(0, 10000),
    ('prevedte '.repeat(1100)).slice(0, 10000),
    family[0] + ' x'.repeat(4900), '\uFDFA'.repeat(3000),
    '\uFDFA'.repeat(2900) + bank[0],
  ];
  for (let i = 0; i < 24; i++) analyze(input(corpus[i % corpus.length]));
  const measurements = [];
  const pipeline = new AnalysisPipeline(); t.after(() => pipeline.close());
  for (let run = 1; run <= 10; run++) for (let i = 0; i < corpus.length; i++) {
    const content = corpus[i], before = process.cpuUsage(), started = performance.now();
    // Measure rule evaluation, normalization + full result, and rules pipeline
    // separately. No assertion is based on an average or wall time alone.
    const matching = intakeAgent(input(content));
    fraudAgent(matching);
    const ruleCpu = process.cpuUsage(before);
    const fullBefore = process.cpuUsage(); analyze(input(content));
    const fullCpu = process.cpuUsage(fullBefore);
    const pipelineBefore = process.cpuUsage(); await pipeline.analyze(input(content));
    const pipelineCpu = process.cpuUsage(pipelineBefore);
    measurements.push({ case: i, run, ruleCpuMs: (ruleCpu.user + ruleCpu.system) / 1000, fullCpuMs: (fullCpu.user + fullCpu.system) / 1000, pipelineCpuMs: (pipelineCpu.user + pipelineCpu.system) / 1000, wallMs: performance.now() - started });
  }
  t.diagnostic(JSON.stringify(measurements));
  const maximum = Math.max(...measurements.flatMap(row => [row.ruleCpuMs, row.fullCpuMs, row.pipelineCpuMs]));
  assert.ok(maximum < 20, `Maximum CPU ${maximum} ms; unchanged threshold 20 ms`);
});
