import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, intakeAgent, matchingRepresentation } from '../src/analysis.js';
import { analyze as referenceAnalyze, intakeAgent as referenceIntake, matchingRepresentation as referenceMatching } from '../test-support/cr03-reference.js';
import { validateInput } from '../src/ai/pipeline.js';

const deterministic = ({ id, ...result }) => result;
const phrases = [
  'Ahoj, zítra se uvidíme.', 'Mami, mám nové číslo. Pošli ihned peníze. Nevolej mi.',
  'Banka: zadej PIN a potvrď kód karty.', 'Posli dnes penize na novy telefon.',
  'Garantovaný výnos 20 % denně bez rizika.', 'Kurýr: zaplaťte fakturu do 2 hodin.',
  'https://example.com/ http://127.0.0.1/x https://xn--pple-43d.com',
  'привет κόσμος', 'أaإ aآb', '𐐀a a𐐀', '\u0301аa\u0327', 'ↀаa ↆ',
  'Ａｂｃ ℀ 𝕒𝐚 č Ř İ', 'Ahoj ❤️ rodina 👨‍👩‍👧',
];
const corpus = new Set(phrases.flatMap(s => [s, s.normalize('NFC'), s.normalize('NFD'), s.toUpperCase()]));
for (const s of phrases) {
  for (const c of ['\u200b', '\u00ad', '\u2060', '\u200d', '\u034f', '\ufe0f', '\u2800', '\ud800', '\udc00']) corpus.add([...s].join(c));
  corpus.add(s.replaceAll('a', 'а').replaceAll('o', 'о').replaceAll('e', 'е'));
}
// Fixed seed, same corpus on every run. Includes surrogate boundaries and
// non-Latin tokens adjacent to Latin; every complete deterministic result is compared.
let seed = 0x3c0304;
const alphabet = [...'abCZéčáŘİ漢العربيةаоесрхуіјѕӏοραНТМВКνικ .\n\r', '\uFDFA', '\u200b', '\u0301', '\u0327', '𐐀', '𝕒', 'ↀ', '\ud800', '\udc00'];
for (let i = 0; i < 5000; i++) {
  let s = '';
  for (let j = 0; j < 1 + i % 64; j++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    s += alphabet[seed % alphabet.length];
  }
  corpus.add(s + ' a');
}
const boundaries = [
  '\uFDFA'.repeat(3000), '\uFDFA'.repeat(5333),
  '\uFDFAé'.repeat(3200), '\uFDFAa'.repeat(3999), '\uFDFAá'.repeat(3199),
  'ztrati' + 'l'.repeat(9994), 'ztrati'.repeat(1666), 'prihlaste'.repeat(1111),
  '9'.repeat(10000), 'posli '.repeat(1666), 'dnes '.repeat(2000), 'garantovan'.repeat(1000),
  'é'.repeat(8000), 'a'.repeat(10000), '\u0301'.repeat(7999) + 'a',
  ('aаč ' + 'إa\u0301 ').repeat(900),
];
for (const s of boundaries) corpus.add(s);

test('CR03: matching and complete detection results equal the immutable M9 reference', () => {
  for (const content of corpus) {
    assert.deepEqual(matchingRepresentation(content), referenceMatching(content), `matching ${JSON.stringify(content.slice(0, 60))}`);
    const input = { type: 'text', content };
    assert.equal(intakeAgent(input).content, content);
    assert.deepEqual(deterministic(analyze(input)), deterministic(referenceAnalyze(input)));
  }
});

test('CR03: Arabic fast-path is equivalent for every Arabic-script scalar and Latin token entry point', () => {
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    const char = String.fromCodePoint(cp);
    if (/\p{Script=Arabic}/u.test(char)) {
      for (const s of [char, `${char}${char}!`, `${char}a${char}`]) assert.deepEqual(matchingRepresentation(s), referenceMatching(s), `Arabic U+${cp.toString(16)}`);
    }
    // Latin-script non-letters and supplementary letters must retain exactly
    // the original token grammar, including marks before/after surrogate pairs.
    if (cp > 127 && /\p{Script=Latin}/u.test(char)) {
      for (const s of [`а${char}ο`, `\u0301${char}а\u0327`]) assert.deepEqual(matchingRepresentation(s), referenceMatching(s), `Latin U+${cp.toString(16)}`);
    }
  }
});

test('CR03: boundary, URL and invalid rejection semantics stay unchanged', () => {
  for (const input of [null, {}, { type: 'image', content: 'x' }, { type: 'text', content: '' }, { type: 'text', content: ' ' }, { type: 'text', content: 12 }, { type: 'text', content: 'a'.repeat(10001) }, { type: 'url', content: 'relative' }, { type: 'url', content: 'ftp://example.com' }, { type: 'url', content: 'https://a:b@example.com' }]) {
    let expected;
    try { referenceIntake(input); } catch (error) { expected = error.message; }
    assert.ok(expected);
    assert.throws(() => intakeAgent(input), { message: expected });
    assert.throws(() => validateInput(input), { code: 'INVALID_INPUT' });
  }
  for (const content of boundaries) {
    const input = { type: 'text', content };
    if (Buffer.byteLength(content, 'utf8') <= 16000) assert.equal(validateInput(input).content, content);
    else assert.throws(() => validateInput(input), { code: 'AI_INPUT_LIMIT' });
  }
  for (const content of [' https://example.com/ ', 'http://127.0.0.1/x', 'https://[::1]/', 'https://xn--pple-43d.com/']) {
    assert.deepEqual(deterministic(analyze({ type: 'url', content })), deterministic(referenceAnalyze({ type: 'url', content })));
  }
  assert.equal(validateInput({ type: 'text', content: 'é'.repeat(8000) }).content.length, 8000);
  assert.throws(() => validateInput({ type: 'text', content: 'é'.repeat(8001) }), { code: 'AI_INPUT_LIMIT' });
});

test('CR03: the public rules-only notice is mapped away whenever AI observations were actually performed', async () => {
  const { analyze } = await import('../src/analysis.js');
  const { reconcileObservations, validateObservations } = await import('../src/ai/observations.js');
  const input = { type: 'text', content: 'Mami, pošli mi ihned 12 000 Kč, nevolej mi.' };
  const rules = analyze(input);
  assert.ok(rules.uncertainties.some(note => note.includes('nikoli AI model')), 'rules-only result keeps the notice');
  const result = reconcileObservations(input, rules, validateObservations({ schema_version: 'observations-v1', observations: [], uncertainty: 'high', insufficient_information: true }, input.content));
  assert.equal(result.ai_status, 'performed');
  assert.ok(!result.uncertainties.some(note => note.includes('nikoli AI model')), JSON.stringify(result.uncertainties));
  assert.ok(result.uncertainties.includes('Pravidlová část používá česká textová pravidla. Nerozpozná všechny podvody a může označit i pravou zprávu.'));
});
