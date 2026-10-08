import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, intakeAgent, matchingRepresentation } from '../src/analysis.js';

test('CR03/CR04: all ASCII characters retain their matching semantics and exact original bytes', () => {
  const ascii = Array.from({ length: 128 }, (_, code) => String.fromCharCode(code)).join('');
  for (const original of [ascii, ascii.repeat(78), 'MAMI, MAM NOVE CISLO. POSLI IHNED PENIZE. NEVOLEJ MI.']) {
    assert.deepEqual(matchingRepresentation(original), {
      content: original.toLowerCase(), hiddenCharacters: false, foldedConfusables: false,
    });
    assert.equal(intakeAgent({ type: 'text', content: original }).content, original);
  }
  assert.equal(analyze({ type: 'text', content: 'MAMI, MAM NOVE CISLO. POSLI IHNED PENIZE. NEVOLEJ MI.' }).risk_level, 'very_high');
});

test('CR03/CR04: alternating Unicode inputs retain normalization and evasion detection across calls', () => {
  const cases = [
    ['A\u200bа\u0301', 'aa', true, true],
    ['Καλημέρα добро', 'καλημέρα добро', false, false],
    ['é а', 'e а', false, false],
    ['Аa', 'aa', false, true],
    ['℀', 'a/c', false, false],
    ['ↀаa ↆ', 'ↀaa ↆ', false, true],
    ['𐐀a a𐐀', '𐐨a a𐐨', false, false],
    ['\u0301аa\u0327', 'aa', false, true],
    ['\uFDFA'.repeat(3000), '\uFDFA'.repeat(3000).normalize('NFKC'), false, false],
    ['ordinary ASCII', 'ordinary ascii', false, false],
  ];
  for (let iteration = 0; iteration < 12; iteration++) {
    for (const [original, content, hiddenCharacters, foldedConfusables] of cases) {
      assert.deepEqual(matchingRepresentation(original), { content, hiddenCharacters, foldedConfusables });
      assert.equal(intakeAgent({ type: 'text', content: original }).content, original);
    }
  }
});

test('CR03: accelerated ASCII/Arabic domain exactly matches Unicode properties and preserves mixed tokens', () => {
  for (const code of [...Array(128).keys(), ...Array.from({ length: 256 }, (_, i) => 0x600 + i)]) {
    const char = String.fromCodePoint(code);
    assert.equal(/\p{Script=Latin}/u.test(char), /[A-Za-z]/u.test(char), `Latin property U+${code.toString(16)}`);
    assert.equal(/[\p{Default_Ignorable_Code_Point}\p{Cf}]/u.test(char), /[\u0600-\u0605\u061c\u06dd]/u.test(char), `Invisible property U+${code.toString(16)}`);
  }
  for (const [original, content, hiddenCharacters] of [
    ['aآb', 'aاb', false],
    ['أaإ', 'اaا', false],
    ['\u061Ca\u0600b', 'ab', true],
    ['\uFEFBa', 'لاa', false],
    ['\uFDFA'.repeat(5330) + ' dnes posl', '\uFDFA'.repeat(5330).normalize('NFKC') + ' dnes posl', false],
  ]) {
    assert.deepEqual(matchingRepresentation(original), { content, hiddenCharacters, foldedConfusables: false });
    assert.equal(intakeAgent({ type: 'text', content: original }).content, original);
  }
});
