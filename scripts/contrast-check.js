// F0 frontend baseline: dependency-free WCAG 2.x contrast checker.
// Reads colour tokens from public/style.css (:root custom properties) and
// evaluates a fixed list of foreground/background pairs. Measurement only:
// it never edits product files and never chooses tokens.
//
// Usage:
//   node scripts/contrast-check.js                 # baseline report (exit 0 unless the tool fails)
//   node scripts/contrast-check.js --json          # machine-readable report
//   node scripts/contrast-check.js --strict        # exit 1 if any pair misses its target
//   node scripts/contrast-check.js --pair '#0f1b3d' '#fffce5' [--target 7]
//                                                  # ad-hoc check, e.g. F1 candidate tokens
//
// Formula (WCAG 2.1/2.2, success criteria 1.4.3 / 1.4.6 / 1.4.11):
//   channel c in sRGB 0..1:  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4
//   relative luminance L = 0.2126 R + 0.7152 G + 0.0722 B
//   contrast ratio = (L_lighter + 0.05) / (L_darker + 0.05)
// Targets used here:
//   7.0  essential text (FRONTEND_DESIGN_DIRECTION.md §16 target, WCAG AAA normal text)
//   4.5  WCAG AA normal text
//   3.0  large text (>= 24 px, or >= 18.66 px bold) and non-text UI / graphical objects
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseHex(value) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
  if (!match) throw new Error(`Unsupported colour value: ${value}`);
  const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
  return [0, 2, 4].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
}
export function luminance(rgb) {
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(foreground, background) {
  const [a, b] = [luminance(parseHex(foreground)), luminance(parseHex(background))].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// Extract `--token: #hex` declarations from the first :root block. var()
// references to other tokens are resolved; anything else is reported as unresolved.
export function readTokens(css) {
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) throw new Error('No :root block found in stylesheet');
  const raw = new Map();
  for (const [, name, value] of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) raw.set(name, value.trim());
  const resolve = (name, seen = new Set()) => {
    const value = raw.get(name);
    if (value === undefined || seen.has(name)) return null;
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (ref) return resolve(ref[1], new Set([...seen, name]));
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value.toLowerCase() : null;
  };
  return new Map([...raw.keys()].map(name => [name, resolve(name)]));
}

// Pairs that exist in the CURRENT stylesheet usage, plus reference values named
// in FRONTEND_DESIGN_DIRECTION.md §5.3. The "proposed" rows are recorded for F1
// validation only; F0 does not select final tokens.
const PAIRS = [
  { id: 'body-ink-on-cream', fg: '--ink', bg: '--cream', target: 7, role: 'essential body text on page background' },
  { id: 'body-ink-on-surface', fg: '--ink', bg: '--surface', target: 7, role: 'essential text on cards' },
  { id: 'muted-on-cream', fg: '--muted', bg: '--cream', target: 7, role: 'secondary text on page background (essential where it carries hints)' },
  { id: 'muted-on-surface', fg: '--muted', bg: '--surface', target: 7, role: 'secondary text on cards' },
  { id: 'muted-reference-on-surface', fg: '--muted-reference', bg: '--surface', target: 4.5, role: 'reference grey (documented as not for final UI)' },
  { id: 'white-on-brand-action', fg: '#ffffff', bg: '--brand-action', target: 7, role: 'primary button label' },
  { id: 'white-on-brand', fg: '#ffffff', bg: '--brand', target: 4.5, role: 'white text on brand purple' },
  { id: 'brand-on-cream', fg: '--brand', bg: '--cream', target: 4.5, role: 'brand purple used as text/accent on cream' },
  { id: 'brand-action-on-surface', fg: '--brand-action', bg: '--surface', target: 4.5, role: 'links / focus colour on cards' },
  { id: 'accent-on-cream', fg: '--accent', bg: '--cream', target: 3, role: 'blue accent as graphical object' },
  { id: 'attention-on-cream', fg: '--attention', bg: '--cream', target: 3, role: 'amber attention as graphical object' },
  { id: 'risk-on-cream', fg: '--risk', bg: '--cream', target: 3, role: 'red risk as graphical object' },
  { id: 'success-on-cream', fg: '--success', bg: '--cream', target: 3, role: 'green as graphical object' },
  { id: 'ink-on-amber-soft', fg: '--ink', bg: '--amber-soft', target: 7, role: 'text on caution panel' },
  { id: 'ink-on-risk-soft', fg: '--ink', bg: '--risk-soft', target: 7, role: 'text on risk / error panel' },
  { id: 'ink-on-mint-soft', fg: '--ink', bg: '--mint-soft', target: 7, role: 'text on verification panel' },
  { id: 'ink-on-blue-soft', fg: '--ink', bg: '--blue-soft', target: 7, role: 'text on system panel' },
  { id: 'ink-on-brand-soft', fg: '--ink', bg: '--brand-soft', target: 7, role: 'text on brand-soft panel' },
  { id: 'muted-on-brand-soft', fg: '--muted', bg: '--brand-soft', target: 7, role: 'secondary text on brand-soft panel' },
  // Reference values from FRONTEND_DESIGN_DIRECTION.md §5.3 (not current tokens).
  { id: 'fdd-ink-on-fdd-cream', fg: '#0f1b3d', bg: '#fffce5', target: 7, role: 'FDD §5.3 ink on FDD cream #FFFCE5 (reference)' },
  { id: 'fdd-proposed-amber-on-fdd-cream', fg: '#b45309', bg: '#fffce5', target: 7, role: 'FDD §5.3 proposed amber #B45309 as TEXT on FDD cream (reference, undecided)' },
  { id: 'fdd-proposed-amber-graphic-on-fdd-cream', fg: '#b45309', bg: '#fffce5', target: 3, role: 'FDD §5.3 proposed amber #B45309 as ICON/GRAPHIC on FDD cream (reference, undecided)' },
  { id: 'fdd-purple-on-fdd-cream', fg: '#6c63ff', bg: '#fffce5', target: 4.5, role: 'FDD §5.3 purple as text on FDD cream (reference)' },
  { id: 'fdd-blue-on-fdd-cream', fg: '#38bdf8', bg: '#fffce5', target: 3, role: 'FDD §5.3 blue as graphic on FDD cream (reference)' },
];

export function evaluate(tokens, pairs = PAIRS) {
  const value = ref => ref.startsWith('--') ? tokens.get(ref) ?? null : ref.toLowerCase();
  return pairs.map(pair => {
    const fg = value(pair.fg), bg = value(pair.bg);
    if (!fg || !bg) return { ...pair, fgValue: fg, bgValue: bg, ratio: null, status: 'UNRESOLVED' };
    const ratio = contrastRatio(fg, bg);
    return { ...pair, fgValue: fg, bgValue: bg, ratio: Math.round(ratio * 100) / 100,
      status: ratio >= pair.target ? 'TARGET MET' : 'SHORTFALL',
      levels: { aaNormal: ratio >= 4.5, aaaNormal: ratio >= 7, largeOrUi: ratio >= 3 } };
  });
}

function main(argv) {
  const json = argv.includes('--json'), strict = argv.includes('--strict');
  const pairIndex = argv.indexOf('--pair');
  if (pairIndex !== -1) {
    const [fg, bg] = argv.slice(pairIndex + 1, pairIndex + 3);
    const targetIndex = argv.indexOf('--target');
    const target = targetIndex === -1 ? 7 : Number(argv[targetIndex + 1]);
    if (!fg || !bg || !Number.isFinite(target)) throw new Error('Usage: --pair <fg-hex> <bg-hex> [--target <ratio>]');
    const [result] = evaluate(new Map(), [{ id: 'ad-hoc', fg, bg, target, role: 'ad-hoc' }]);
    console.log(json ? JSON.stringify(result, null, 2) : `${fg} on ${bg}: ${result.ratio.toFixed(2)}:1 (target ${target}:1) ${result.status}`);
    return strict && result.status !== 'TARGET MET' ? 1 : 0;
  }
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const tokens = readTokens(css);
  const results = evaluate(tokens);
  if (json) console.log(JSON.stringify({ source: 'public/style.css', tokens: Object.fromEntries(tokens), results }, null, 2));
  else {
    console.log('WCAG contrast baseline (public/style.css :root tokens + FDD §5.3 reference values)');
    for (const r of results) console.log(`${r.status.padEnd(10)} ${String(r.ratio?.toFixed(2) ?? '—').padStart(6)}:1  target ${String(r.target).padEnd(3)} ${r.id}  (${r.fgValue} on ${r.bgValue}) — ${r.role}`);
    const shortfalls = results.filter(r => r.status !== 'TARGET MET');
    console.log(`\n${results.length} pairs: ${results.length - shortfalls.length} target met, ${shortfalls.length} shortfall/unresolved.`);
    console.log('Shortfalls are baseline findings for F1, not tool failures. Use --strict to make them fail.');
  }
  return strict && results.some(r => r.status !== 'TARGET MET') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`TOOL FAILURE: ${error.message}`); process.exitCode = 2; }
}
