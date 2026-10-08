// F0 frontend baseline: browser layout / accessibility evidence.
// ADDITIONAL evidence only. scripts/security-browser.js stays authoritative for
// security invariants and is not replaced by this script.
//
// Requires Playwright + Chromium in an isolated development/test environment.
// Playwright is NOT a project dependency and must not be added to package.json.
//   PLAYWRIGHT_MODULE=<absolute path to playwright/index.mjs>   (default: 'playwright')
//   CHROMIUM_PATH=<chromium executable>                          (optional)
//   FRONTEND_OUTPUT_DIR=<directory for report.json + screenshots> (default: new temp dir)
//   node scripts/frontend-browser.js [--strict]
//
// Runs the real application server in-process in rules-only mode on 127.0.0.1
// (no AI, no external network). Product files are never modified.
//
// Every finding is classified as one of:
//   TARGET MET        requirement satisfied in this environment
//   SHORTFALL         current design does not meet a FRONTEND_DESIGN_DIRECTION.md target (expected baseline)
//   REGRESSION        breaks an existing behaviour/invariant (console/page errors, failed or external
//                     requests, horizontal overflow at widths already asserted by security-browser.js)
//   NOT EXECUTED      could not be measured here
// Exit codes: 0 = no regression/tool failure, 1 = regression (or shortfall with --strict),
//             2 = NOT EXECUTED (Playwright unavailable), 3 = TOOL FAILURE.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const strict = process.argv.includes('--strict');
let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch {
  console.log('NOT EXECUTED: Playwright is not available. Set PLAYWRIGHT_MODULE to a Playwright installation outside this project. No result is reported as PASS.');
  process.exit(2);
}
const { createServer } = await import('../src/server.js');
const { AnalysisPipeline } = await import('../src/ai/pipeline.js');

const outDir = process.env.FRONTEND_OUTPUT_DIR || mkdtempSync(join(tmpdir(), 'verim-frontend-browser-'));
mkdirSync(outDir, { recursive: true });
const SAMPLE = 'Ahoj, zítra se sejdeme u knihovny.';
// Widths assert "no horizontal overflow" in scripts/security-browser.js already.
const SECURITY_BROWSER_WIDTHS = new Set([1440, 390, 320]);
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1024', width: 1024, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-360', width: 360, height: 640 },
  { name: 'mobile-320', width: 320, height: 568 },
];
// SIMULATED zoom: a 1280×720 browser window at 200% zoom exposes a 640×360 CSS-pixel
// viewport. This approximates layout reflow only; it is NOT equivalent to real browser
// zoom, OS text scaling or assistive-technology magnification.
const ZOOM = { name: 'simulated-200pct-zoom-1280x720', width: 640, height: 360 };

const findings = [];
const record = (area, check, status, detail = {}) => findings.push({ area, check, status, ...detail });

// Test-only server options: raise per-client limits so that this tool's own repeated
// cold page loads from 127.0.0.1 are not throttled (production defaults would 429 the
// hero after ~2 loads/minute). Product code and production limits are unchanged.
const TEST_LIMITS = { rateLimit: 1000, sessionRateLimit: 1000, sessionIssueRateLimit: 1000, globalApiRateLimit: 9999, staticRateLimit: 100000, staticBytesPerMinute: 1e9 };
const server = createServer({ pipeline: new AnalysisPipeline(), ...TEST_LIMITS });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });

function watch(page, label) {
  const log = { consoleErrors: [], pageErrors: [], failedRequests: [], externalRequests: [], httpErrors: [] };
  const consoleErrors = [], requestedUrls = new Set();
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: message.location() });
  });
  page.on('pageerror', error => log.pageErrors.push(String(error.name)));
  page.on('requestfailed', request => {
    requestedUrls.add(request.url());
    log.failedRequests.push(`${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText || ''}`);
  });
  page.on('request', request => {
    requestedUrls.add(request.url());
    const url = new URL(request.url());
    if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== base) log.externalRequests.push(url.origin);
  });
  page.on('response', response => { if (response.status() >= 400) log.httpErrors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  return async () => {
    const hasDeclaredIcon = await page.locator('link[rel~="icon" i]').count() > 0;
    const ignoredAutomaticFavicon404 = [];
    for (const error of consoleErrors) {
      // ASSETS.md records the favicon as pending; no icon is declared/shipped.
      // Chromium probes /favicon.ico itself and reports the absent asset's
      // 404 only as a console event, outside Playwright's page request events.
      // Exempt ONLY that implicit probe; explicit page requests/icon declarations,
      // query strings, other statuses/origins and every other error still fail.
      if (!hasDeclaredIcon && !requestedUrls.has(error.location.url)
        && error.location.url === `${base}/favicon.ico`
        && error.location.lineNumber === 0 && error.location.columnNumber === 0
        && error.text === 'Failed to load resource: the server responded with a status of 404 (Not Found)') {
        ignoredAutomaticFavicon404.push(error);
      } else log.consoleErrors.push(error.text.slice(0, 200));
    }
    for (const [key, list] of Object.entries(log)) {
      record(label, key, list.length ? 'REGRESSION' : 'TARGET MET', { count: list.length, samples: list.slice(0, 5),
        ...(key === 'consoleErrors' ? { ignoredAutomaticFavicon404 } : {}) });
    }
  };
}

// Runs inside the page. Pure measurement; no DOM mutation.
function measurePage() {
  const visible = el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const describe = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''}`;
  const inViewport = r => r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), fullyInFirstViewport: inViewport(r) }; };
  const offenders = [...document.querySelectorAll('body *')].filter(visible).filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(describe);
  const characters = [...document.querySelectorAll('img')].filter(img => /\/assets\/characters\//.test(img.getAttribute('src') || '')).map(img => {
    const r = img.getBoundingClientRect();
    return { src: (img.getAttribute('src') || '').split('/').pop().split('.')[0], visible: visible(img), inFirstViewport: visible(img) && r.top < innerHeight && r.bottom > 0, cssWidth: Math.round(r.width), cssHeight: Math.round(r.height) };
  });
  const textElements = [...document.querySelectorAll('body *')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  const small = textElements.filter(el => parseFloat(getComputedStyle(el).fontSize) < 18);
  const interactive = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(visible);
  const smallTargets = interactive.map(el => { const r = el.getBoundingClientRect(); return { el: describe(el), w: Math.round(r.width), h: Math.round(r.height), inlineLink: el.tagName === 'A' && getComputedStyle(el).display === 'inline' }; }).filter(t => t.w < 48 || t.h < 48);
  // Approximate contrast: text colour vs first opaque ancestor background colour.
  // Elements whose background comes from an image/gradient are reported as unresolved.
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const lum = rgb => { const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const contrast = { measured: 0, unresolved: 0, below45: [], below7: [] };
  for (const el of textElements) {
    const fg = parse(getComputedStyle(el).color);
    let node = el, bg = null, unresolved = false;
    while (node && node.nodeType === 1) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') { unresolved = true; break; }
      const c = parse(s.backgroundColor);
      if (c && c.a >= 0.99) { bg = c.rgb; break; }
      node = node.parentElement;
    }
    if (!bg && !unresolved) bg = [255, 255, 255];
    if (unresolved || !fg || fg.a < 0.99) { contrast.unresolved++; continue; }
    contrast.measured++;
    const value = Math.round(ratio(fg.rgb, bg) * 100) / 100;
    const sample = { el: describe(el), ratio: value, fontSize: getComputedStyle(el).fontSize, text: el.textContent.trim().slice(0, 40) };
    if (value < 4.5) contrast.below45.push(sample); else if (value < 7) contrast.below7.push(sample);
  }
  const bodyStyle = getComputedStyle(document.body);
  return {
    innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth, overflowOffenders: offenders,
    input: rect(document.querySelector('#content')), primaryCta: rect(document.querySelector('#submit')),
    characters, bodyFontSize: bodyStyle.fontSize, bodyLineHeight: bodyStyle.lineHeight,
    textElements: textElements.length, textBelow18px: small.length, textBelow18pxSamples: small.slice(0, 6).map(el => `${describe(el)} ${getComputedStyle(el).fontSize}`),
    interactiveCount: interactive.length, targetsBelow48: smallTargets,
    contrast: { measured: contrast.measured, unresolved: contrast.unresolved, below45: contrast.below45.length, below7: contrast.below7.length,
      worst: [...contrast.below45, ...contrast.below7].sort((a, b) => a.ratio - b.ratio).slice(0, 8) },
  };
}

async function openPage(viewport, options = {}) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, ...options });
  const page = await context.newPage();
  return { context, page };
}
async function ready(page) {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('#submit').disabled, null, { timeout: 10000 });
}

const report = { tool: 'scripts/frontend-browser.js', baseUrl: 'in-process rules-only server on 127.0.0.1', outputDir: outDir, startedAt: new Date().toISOString(), viewports: {}, zoom: null, reducedMotion: null, keyboard: null };
let toolFailure = null;
try {
  for (const viewport of [...VIEWPORTS, ZOOM]) {
    const { context, page } = await openPage(viewport);
    const done = watch(page, viewport.name);
    await ready(page);
    const home = await page.evaluate(measurePage);
    await page.screenshot({ path: join(outDir, `${viewport.name}-home.png`), fullPage: true });
    // Result state with the real rules engine (synthetic, non-sensitive text).
    await page.locator('#content').fill(SAMPLE);
    await page.locator('#submit').click();
    await page.locator('#result').waitFor({ state: 'visible', timeout: 10000 });
    const result = await page.evaluate(measurePage);
    await page.screenshot({ path: join(outDir, `${viewport.name}-result.png`), fullPage: true });
    await done();
    await context.close();
    const isZoom = viewport === ZOOM;
    report[isZoom ? 'zoom' : 'viewports'] = isZoom ? { home, result } : { ...report.viewports, [viewport.name]: { home, result } };
    for (const [state, m] of [['home', home], ['result', result]]) {
      const overflowStatus = !m.horizontalOverflow ? 'TARGET MET' : SECURITY_BROWSER_WIDTHS.has(viewport.width) && !isZoom ? 'REGRESSION' : 'SHORTFALL';
      record(viewport.name, `${state}: no horizontal overflow`, overflowStatus, { scrollWidth: m.scrollWidth, innerWidth: m.innerWidth, offenders: m.overflowOffenders });
      record(viewport.name, `${state}: text >= 18px`, m.textBelow18px ? 'SHORTFALL' : 'TARGET MET', { count: m.textBelow18px, of: m.textElements, samples: m.textBelow18pxSamples });
      record(viewport.name, `${state}: targets >= 48px`, m.targetsBelow48.length ? 'SHORTFALL' : 'TARGET MET', { count: m.targetsBelow48.length, of: m.interactiveCount, samples: m.targetsBelow48.slice(0, 8) });
      record(viewport.name, `${state}: approx. text contrast >= 7:1`, m.contrast.below45 + m.contrast.below7 ? 'SHORTFALL' : 'TARGET MET', { measured: m.contrast.measured, unresolved: m.contrast.unresolved, below45: m.contrast.below45, below7: m.contrast.below7, worst: m.contrast.worst });
    }
    const line = parseFloat(home.bodyLineHeight) / parseFloat(home.bodyFontSize);
    record(viewport.name, 'body line-height >= 1.5', line >= 1.5 ? 'TARGET MET' : 'SHORTFALL', { bodyFontSize: home.bodyFontSize, lineHeightRatio: Math.round(line * 100) / 100 });
    const firstView = home.input?.fullyInFirstViewport && home.primaryCta?.fullyInFirstViewport;
    record(viewport.name, 'input + primary CTA fully visible in first viewport', firstView ? 'TARGET MET' : 'SHORTFALL', { input: home.input, primaryCta: home.primaryCta, requirement: viewport.width === 360 && viewport.height === 640 ? 'FDD §7.3/§15 target at 360×640' : 'informational' });
    const chars = home.characters.filter(c => c.inFirstViewport).map(c => c.src);
    record(viewport.name, 'character(s) visible in first viewport (home)', chars.length ? 'TARGET MET' : 'SHORTFALL', { inFirstViewport: chars, all: home.characters.map(c => `${c.src}${c.visible ? '' : ' (hidden)'}`), note: 'Both Věrka and Robo appear only in the combined verkarob hero today.' });
  }

  // Reduced motion: compare running animations while the analysis is in progress.
  report.reducedMotion = {};
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { context, page } = await openPage({ width: 390, height: 844 }, { reducedMotion });
    const done = watch(page, `reduced-motion:${reducedMotion}`);
    await page.route('**/api/analyze', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
    await ready(page);
    const mediaRules = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules]; } catch { return []; } })
      .filter(rule => rule.media && /prefers-reduced-motion/.test(rule.media.mediaText)).map(rule => rule.media.mediaText));
    await page.locator('#content').fill(SAMPLE);
    await page.locator('#submit').click();
    await page.locator('#processing').waitFor({ state: 'visible', timeout: 5000 });
    const animations = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').map(a => {
      const t = a.effect?.getTiming?.() || {}; const target = a.effect?.target;
      return { name: a.animationName || a.transitionProperty || a.constructor.name, durationMs: Number(t.duration) || 0, iterations: t.iterations, target: target ? `${target.tagName.toLowerCase()}${target.className ? '.' + String(target.className).split(' ')[0] : ''}` : null };
    }));
    await page.locator('#result').waitFor({ state: 'visible', timeout: 10000 });
    await done(); await context.close();
    report.reducedMotion[reducedMotion] = { prefersReducedMotionRules: mediaRules, runningAnimationsDuringAnalysis: animations };
  }
  const reduced = report.reducedMotion.reduce;
  const moving = reduced.runningAnimationsDuringAnalysis.filter(a => a.durationMs > 10);
  record('reduced-motion', 'stylesheet has prefers-reduced-motion handling', reduced.prefersReducedMotionRules.length ? 'TARGET MET' : 'SHORTFALL', { rules: reduced.prefersReducedMotionRules });
  record('reduced-motion', 'no running animation > 10 ms under prefers-reduced-motion: reduce', moving.length ? 'SHORTFALL' : 'TARGET MET', { running: moving });

  // Keyboard baseline: tab order, focus visibility, keyboard-only submission.
  {
    const { context, page } = await openPage({ width: 1440, height: 900 });
    const done = watch(page, 'keyboard');
    await ready(page);
    const order = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const indicator = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none');
        return { el: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + el.classList[0] : ''}`, label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40), visibleIndicator: indicator };
      });
      if (!info || (order.length && info.el === order[0].el && info.label === order[0].label)) break;
      order.push(info);
    }
    const reach = selector => order.some(item => item.el.startsWith(selector));
    record('keyboard', 'first Tab stop is the skip link', order[0]?.el.includes('skip-link') ? 'TARGET MET' : 'SHORTFALL', { first: order[0] });
    record('keyboard', 'content input reachable by Tab', reach('textarea#content') ? 'TARGET MET' : 'REGRESSION');
    record('keyboard', 'primary CTA reachable by Tab', reach('button#submit') ? 'TARGET MET' : 'REGRESSION');
    const noIndicator = order.filter(item => !item.visibleIndicator);
    record('keyboard', 'visible focus indicator on every Tab stop', noIndicator.length ? 'SHORTFALL' : 'TARGET MET', { tabStops: order.length, withoutIndicator: noIndicator.slice(0, 8) });
    await page.locator('#content').focus();
    await page.keyboard.type(SAMPLE);
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await page.locator('#result').waitFor({ state: 'visible', timeout: 10000 });
    const focusAfter = await page.evaluate(() => { const r = document.querySelector('#result'); return r === document.activeElement || r.contains(document.activeElement); });
    record('keyboard', 'keyboard-only submission shows result and moves focus to it', focusAfter ? 'TARGET MET' : 'SHORTFALL');
    report.keyboard = { tabOrder: order };
    await done(); await context.close();
  }
} catch (error) {
  toolFailure = `${error.name}: ${error.message}`.slice(0, 500);
} finally {
  await browser.close();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}

report.finishedAt = new Date().toISOString();
report.findings = findings;
report.toolFailure = toolFailure;
const count = status => findings.filter(f => f.status === status).length;
report.summary = { targetMet: count('TARGET MET'), shortfall: count('SHORTFALL'), regression: count('REGRESSION'), toolFailure: Boolean(toolFailure) };
writeFileSync(join(outDir, 'frontend-browser-report.json'), JSON.stringify(report, null, 2));

console.log(`Frontend browser baseline — report: ${join(outDir, 'frontend-browser-report.json')}`);
for (const f of findings.filter(f => f.status !== 'TARGET MET')) console.log(`${f.status.padEnd(10)} ${f.area} — ${f.check}${f.count !== undefined ? ` (${f.count})` : ''}`);
console.log(`Summary: ${report.summary.targetMet} target met, ${report.summary.shortfall} shortfall, ${report.summary.regression} regression${toolFailure ? `, TOOL FAILURE: ${toolFailure}` : ''}.`);
console.log('SHORTFALL = expected current-design baseline finding (not a test failure). Simulated zoom is not real browser/AT zoom.');
process.exitCode = toolFailure ? 3 : report.summary.regression || (strict && report.summary.shortfall) ? 1 : 0;
