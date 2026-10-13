import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { analyze, intakeAgent, fraudAgent } from '../src/analysis.js';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { BoundedQueue } from '../src/ai/queue.js';
import { ServiceError } from '../src/ai/errors.js';

// Reproducible examples authored from the owner's P2/B3 descriptions, not
// verbatim originals from Claude's unavailable AI_BETA_ACCEPTANCE_PLAN.md.
const P2 = 'Volal mi údajný vnuk, že potřebuje naléhavě hotovost. Peníze má vyzvednout jeho advokát a já o tom nemám říkat rodičům.';
const B3 = 'Údajná banka mi říká: Převeďte ihned peníze na chráněný účet, vaše prostředky jsou ohrožené.';
const family = [P2,
  'Volal mi údajný vnuk, že potřebuje rychle hotovost. Pro peníze se zastaví jeho advokát. Neříkej to mámě.',
  'Volala mi vnučka. Naléhavě chce peníze v hotovosti, posílá pro ně advokáta a rodičům to neříkej.',
  'Jsem váš vnuk. Potřebuju hned hotovost. Posílám pro ně advokáta. Neříkej to mámě.',
  'Babi, potřebuji rychle peníze. Zastaví se můj právník. Rodičům to neříkej.',
  'Prý volal příbuzný. Požadoval naléhavě peníze. Má je vyzvednout advokát a rodičům to neříkej.',
  'Volal mi údajný vnuk. Chtěl ihned hotovost. Advokát se zastaví pro peníze. Řekl, abych to neříkal mámě.',
  'Volala údajná vnučka, že potřebuje rychle peníze. Advokát je vyzvedne. Nesmím to říct rodičům.',
];
const bank = [B3,
  'Údajná banka: Přesuňte hned peníze na bezpečný účet, aby byly chráněné.',
  'Volají z banky. Mám ihned převést peníze na chráněný účet kvůli ohrožení prostředků.',
  'Bankovní poradce: Na chráněný bankovní účet odešlete peníze okamžitě.',
];
const ordinary = [
  'Volal mi vnuk, zítra přijde na návštěvu.',
  'Vnučka potřebuje hotovost na výlet. Zastaví se pro ni rodiče.',
  'Babi, potřebuju hned peníze na nákup. Kamarád je vyzvedne.',
  'Vnuk posílá advokáta vyzvednout smlouvu. Rodičům to neříkej, chystáme překvapení.',
  'Neříkej to mámě, máme pro ni narozeninové překvapení.',
  'Rodičům to neříkej, koupili jsme dárek.',
  'Jsem tvůj vnuk. Peníze mi předej osobně. Rodičům to neříkej.',
  'Vnučka potřebuje peníze příští měsíc. Advokát je vyzvedne. Neříkej to mámě.',
  'Banka: Nepřevádějte peníze na chráněný účet.',
  'Banka nikdy nežádá převod na chráněný nebo bezpečný účet.',
  'Banka doporučuje ověřit požadavek ve své aplikaci a nikomu nesdělovat heslo.',
  'Banka: Převeďte peníze na svůj spořicí účet. Nikomu nesdělujte svůj PIN.',
  'Banka upozorňuje na podvodné zprávy s výzvou „Převeďte peníze na bezpečný účet“.',
  'Banka nikdy nepožaduje: „Převeďte peníze na chráněný účet“.',
  'Banka nikdy nežádá: "Převeďte peníze na bezpečný účet".',
  'Banka: „Převeďte peníze na bezpečný účet“, jde o podvod.',
];
const input = content => ({ type: 'text', content });
const ids = result => result.signals.map(signal => signal.id);

test('P2/B3: own acceptance fixtures and authored/reported variants retain multiple relevant warnings', t => {
  for (const content of family) {
    const result = analyze(input(content));
    assert.ok(ids(result).includes('family_cash_pickup'), content);
    assert.ok(ids(result).includes('secrecy'), content);
    assert.ok(result.signals.length >= 2);
    assert.match(result.recommended_actions[0], /^Hotovost nepředávejte/);
  }
  for (const content of bank) {
    const result = analyze(input(content));
    assert.ok(ids(result).includes('safe_account_transfer'), content);
    assert.match(result.recommended_actions[0], /^Peníze nepřevádějte/);
    assert.doesNotMatch(result.summary, /potvrdili jsme podvod|ověřený podvod|je bezpečn/iu);
  }
  assert.ok(ids(analyze(input(B3))).includes('authority'));
  t.diagnostic(JSON.stringify({ P2: ids(analyze(input(P2))), B3: ids(analyze(input(B3))) }));
});
test('P2/B3: ordinary family conversations and real bank advice gain no compound high-harm warnings', t => {
  for (const content of ordinary) {
    const result = analyze(input(content));
    assert.ok(!ids(result).includes('family_cash_pickup'), content);
    assert.ok(!ids(result).includes('safe_account_transfer'), content);
  }
  t.diagnostic(`${ordinary.length} negative examples: zero compound-warning false positives; inherited descriptive payment/authority signals may remain`);
});
test('P2/B3: educational quotation does not hide another instruction, a reported threat, or a question', () => {
  for (const content of [
    ordinary[12] + ' Převeďte peníze na chráněný účet.',
    'Banka varuje před podvodem. Převeďte peníze na chráněný účet.',
    'Údajná banka mi řekla „Převeďte peníze na chráněný účet“. Je to podvod?',
    'Údajná banka: „Převeďte peníze na bezpečný účet“, jde o podvod?',
  ]) assert.ok(ids(analyze(input(content))).includes('safe_account_transfer'), content);
  assert.ok(!ids(analyze(input('Banka: Nikdy nepožadujeme heslo. Převeďte peníze na svůj účet.'))).includes('safe_account_transfer'));
});
test('P2/B3: Unicode, boundary windows, exact user text and per-request isolation stay intact', () => {
  for (const content of [P2, P2.normalize('NFD'), P2.toUpperCase(), P2.replaceAll('a', 'а')]) {
    assert.equal(intakeAgent(input(content)).content, content);
    assert.ok(ids(analyze(input(content))).includes('family_cash_pickup'));
  }
  for (const offset of [350, 399, 400, 750, 799, 800, 9300]) {
    assert.ok(ids(analyze(input('x '.repeat(Math.floor(offset / 2)) + P2))).includes('family_cash_pickup'));
    assert.ok(ids(analyze(input('x '.repeat(Math.floor(offset / 2)) + B3))).includes('safe_account_transfer'));
  }
  assert.equal(analyze(input(ordinary[0])).signals.length, 0);
});
test('P2/B3: rules mode and labelled unavailable fallback never reassure on zero-signal results', async t => {
  for (const mode of ['rules', 'ai']) {
    const pipeline = new AnalysisPipeline({ mode, fallbackToRules: mode === 'ai', unavailableCode: mode === 'ai' ? 'AI_INVALID_CONFIG' : undefined });
    t.after(() => pipeline.close());
    for (const content of [P2, B3, ordinary[0]]) {
      const result = await pipeline.analyze({ ...input(content), ai_consent: false });
      assert.equal(result.engine, 'rules-v1');
      assert.deepEqual(result.recommended_actions, analyze(input(content)).recommended_actions);
      if (mode === 'ai') {
        assert.equal(result.ai_status, 'not_performed'); assert.equal(result.ai_fallback_reason, 'not_configured');
      }
      if (content === ordinary[0]) {
        assert.equal(result.signals.length, 0); assert.equal(result.risk_level, 'unassessed');
        assert.match(result.summary, /nelze poznat/);
        assert.ok(result.uncertainties.some(note => note.includes('Neověřili jsme totožnost')));
        assert.match(result.recommended_actions[0], /nezávisle ověřte/);
      }
    }
  }
});
test('P2/B3: configured failure never runs AI without consent and retains local warnings without leaking provider errors', async t => {
  let calls = 0, jobs = 0;
  const queue = new BoundedQueue({}), submit = queue.submit.bind(queue);
  queue.submit = (...args) => { jobs++; return submit(...args); };
  const pipeline = new AnalysisPipeline({ mode: 'ai', fallbackToRules: true, queue,
    worker: { async run() { calls++; throw new ServiceError('AI_TIMEOUT'); } } });
  t.after(() => pipeline.close());
  for (const content of [P2, B3]) {
    const before = calls, queued = jobs;
    // Approved: without consent → labelled rules-only result, no queue job, no worker/provider call.
    const declined = await pipeline.analyze(input(content));
    assert.equal(declined.engine, 'rules-v1'); assert.equal(declined.ai_status, 'not_performed'); assert.equal(declined.ai_fallback_reason, 'declined');
    assert.deepEqual(declined.signals, analyze(input(content)).signals);
    assert.equal(calls, before); assert.equal(jobs, queued);
    const result = await pipeline.analyze({ ...input(content), ai_consent: true });
    assert.deepEqual(result.signals, analyze(input(content)).signals);
    assert.equal(result.ai_fallback_reason, 'timeout'); assert.equal(result.ai_status, 'not_performed');
    assert.doesNotMatch(JSON.stringify(result), /API_KEY|Authorization|Bearer/);
  }
});
test('P2/B3 HTTP: secured rules-only and unconfigured fallback preserve warnings and zero AI invocations', async t => {
  for (const mode of ['rules', 'ai']) {
    let jobs = 0;
    const pipeline = new AnalysisPipeline({ mode, ...(mode === 'ai' && { fallbackToRules: true,
      unavailableCode: 'AI_INVALID_CONFIG', queue: { submit() { jobs++; throw Error('AI must not run'); }, close() {} } }) });
    const server = createServer({ pipeline, publicOrigin: 'https://p2.test' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, body, cookie) => new Promise((resolve, reject) => {
      const req = http.request(base + path, { method: body ? 'POST' : 'GET', headers: {
        Host: 'p2.test', Origin: 'https://p2.test', 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }),
      } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) }));
      });
      req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
    const session = await request('/api/session'); assert.equal(session.status, 200);
    const cookie = session.headers['set-cookie'][0].split(';')[0];
    for (const content of [P2, B3, ordinary[0]]) {
      const response = await request('/api/analyze', { ...input(content), ai_consent: false }, cookie);
      assert.equal(response.status, 200); assert.equal(response.body.engine, 'rules-v1');
      assert.deepEqual(response.body.signals, analyze(input(content)).signals);
      assert.deepEqual(response.body.recommended_actions, analyze(input(content)).recommended_actions);
      assert.match(response.headers['cache-control'], /no-store/);
      if (mode === 'ai') {
        assert.equal(response.body.ai_status, 'not_performed');
        assert.equal(response.body.ai_fallback_reason, 'not_configured');
      }
    }
    assert.equal(jobs, 0);
    t.diagnostic(`${mode}: three real secured HTTP responses, zero AI queue invocations`);
  }
});
test('P2/B3: bounded phrase matching and expanded maximum inputs stay below unchanged 20ms process CPU', async t => {
  const corpus = [
    P2 + ' x'.repeat(4800), B3 + ' x'.repeat(4800),
    'vnuk potrebuje hotovost advokat rodicum to nerikej '.repeat(220).slice(0, 10000),
    'banka prevedte chraneny '.repeat(480).slice(0, 10000),
    'banka "prevedte penize na chraneny ucet" '.repeat(270).slice(0, 10000),
    'nemam to rikat rodicum '.repeat(500).slice(0, 10000),
    '\uFDFA'.repeat(3000), '\uFDFA'.repeat(2850) + P2,
  ];
  const pipeline = new AnalysisPipeline(); t.after(() => pipeline.close());
  for (let n = 0; n < 24; n++) analyze(input(corpus[n % corpus.length]));
  const measurements = [];
  for (let run = 1; run <= 10; run++) for (let index = 0; index < corpus.length; index++) {
    const content = corpus[index], start = performance.now(), ruleStart = process.cpuUsage();
    fraudAgent(intakeAgent(input(content)));
    const ruleCPU = process.cpuUsage(ruleStart), fullStart = process.cpuUsage();
    analyze(input(content));
    const fullCPU = process.cpuUsage(fullStart), pipelineStart = process.cpuUsage();
    await pipeline.analyze(input(content));
    const pipelineCPU = process.cpuUsage(pipelineStart);
    measurements.push({ index, run, ruleCpuMs: (ruleCPU.user + ruleCPU.system) / 1000,
      fullCpuMs: (fullCPU.user + fullCPU.system) / 1000, pipelineCpuMs: (pipelineCPU.user + pipelineCPU.system) / 1000,
      combinedWallMs: performance.now() - start });
  }
  t.diagnostic(JSON.stringify(measurements));
  assert.ok(measurements.every(row => Math.max(row.ruleCpuMs, row.fullCpuMs, row.pipelineCpuMs) < 20), 'Every operation must remain below 20ms CPU');
});
