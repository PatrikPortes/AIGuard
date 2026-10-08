// F0 frontend baseline: first-view transfer and LCP measurement.
// Measurement only; reports the ACTUAL current state against the approved targets
// (first view ~< 300 KB where practical, LCP < 2.5 s; FRONTEND_DESIGN_DIRECTION.md §17).
//
// Requires Playwright + Chromium (not a project dependency):
//   PLAYWRIGHT_MODULE=<absolute path to playwright/index.mjs>   (default: 'playwright')
//   CHROMIUM_PATH=<chromium executable>                          (optional)
//   FRONTEND_OUTPUT_DIR=<directory for budget report>           (default: new temp dir)
//   FRONTEND_BUDGET_RUNS=<cold runs per profile>                 (default: 5)
//   node scripts/frontend-budget.js
//
// Method (documented in docs/design/FRONTEND_TEST_PLAN.md):
// - Real app server in-process (rules-only, 127.0.0.1). Test-only raised per-client
//   limits so repeated cold loads are not throttled; product limits unchanged.
// - Every run is a fresh browser context (cold cache, no cookies). No scrolling or input.
// - "First view" = every request completed by load + network idle (500 ms quiet),
//   i.e. what the browser fetches to render the initial viewport without interaction.
// - Transfer size = Chrome DevTools Protocol Network.loadingFinished.encodedDataLength
//   (headers + body as received). This local server sends NO content compression;
//   behind Cloudflare, text resources may be compressed and transfer would be smaller.
//   WebP images are not further compressed by HTTP compression.
// - LCP = last buffered 'largest-contentful-paint' entry; FCP from paint timing.
// - Profiles: emulated mobile with throttling approximating Lighthouse "Slow 4G"
//   (150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up, 4× CPU slowdown) and an unthrottled
//   desktop/mobile reference. Emulation is NOT a real device or real network.
// Exit codes: 0 measured, 2 NOT EXECUTED (Playwright unavailable), 3 TOOL FAILURE.
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch {
  console.log('NOT EXECUTED: Playwright is not available. Set PLAYWRIGHT_MODULE to a Playwright installation outside this project. No measurement is reported.');
  process.exit(2);
}
const { createServer } = await import('../src/server.js');
const { AnalysisPipeline } = await import('../src/ai/pipeline.js');
const { characterAssetFiles } = await import('../public/character-assets.js');

const outDir = process.env.FRONTEND_OUTPUT_DIR || mkdtempSync(join(tmpdir(), 'verim-frontend-budget-'));
mkdirSync(outDir, { recursive: true });
const RUNS = Math.max(1, Number(process.env.FRONTEND_BUDGET_RUNS || 5));
const TARGET_BYTES = 300 * 1024, TARGET_LCP_MS = 2500;
const SLOW_4G = { latency: 150, downloadThroughput: Math.round(1.6 * 1024 * 1024 / 8), uploadThroughput: Math.round(750 * 1024 / 8), cpu: 4 };
const PROFILES = [
  { name: 'mobile-360x640-slow4g-cpu4x', viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, network: SLOW_4G },
  { name: 'mobile-390x844-slow4g-cpu4x', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, network: SLOW_4G },
  { name: 'mobile-360x640-unthrottled', viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, network: null },
  { name: 'desktop-1440x900-unthrottled', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, network: null },
];

const TEST_LIMITS = { rateLimit: 1000, sessionRateLimit: 1000, sessionIssueRateLimit: 1000, globalApiRateLimit: 9999, staticRateLimit: 100000, staticBytesPerMinute: 1e9 };
const server = createServer({ pipeline: new AnalysisPipeline(), ...TEST_LIMITS });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
const median = values => { const s = [...values].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const category = (path, type) => path.includes('/verkarob.') ? 'hero image (verkarob)' : type === 'Image' ? 'other images' : type === 'Document' ? 'document (HTML)' : type === 'Stylesheet' ? 'stylesheet' : type === 'Script' ? 'scripts' : path.startsWith('/api/') ? 'API (fetch)' : 'other';

async function run(profile) {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, hasTouch: profile.hasTouch });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (profile.network) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.network.latency, downloadThroughput: profile.network.downloadThroughput, uploadThroughput: profile.network.uploadThroughput });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.network.cpu });
  }
  const requests = new Map();
  cdp.on('Network.requestWillBeSent', e => requests.set(e.requestId, { path: new URL(e.request.url).pathname, origin: new URL(e.request.url).origin, type: e.type }));
  cdp.on('Network.responseReceived', e => { const r = requests.get(e.requestId); if (r) { r.status = e.response.status; r.mime = e.response.mimeType; r.contentEncoding = e.response.headers['content-encoding'] || e.response.headers['Content-Encoding'] || null; } });
  cdp.on('Network.loadingFinished', e => { const r = requests.get(e.requestId); if (r) r.transferBytes = e.encodedDataLength; });
  cdp.on('Network.loadingFailed', e => { const r = requests.get(e.requestId); if (r) r.failed = e.errorText; });
  await page.goto(base, { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 120000 });
  const timing = await page.evaluate(() => new Promise(resolve => {
    let lcp = null;
    new PerformanceObserver(list => { const entries = list.getEntries(); lcp = entries[entries.length - 1]; }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const nav = performance.getEntriesByType('navigation')[0];
      const el = lcp?.element;
      resolve({ lcpMs: lcp ? Math.round(lcp.startTime) : null, lcpElement: el ? `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}` : null,
        lcpUrl: lcp?.url ? new URL(lcp.url).pathname.split('/').pop() : null, fcpMs: fcp ? Math.round(fcp.startTime) : null, loadMs: nav ? Math.round(nav.loadEventEnd) : null });
    }, 1000);
  }));
  await context.close();
  const list = [...requests.values()].filter(r => r.transferBytes !== undefined || r.failed);
  const byCategory = {};
  for (const r of list) { const c = category(r.path, r.type); byCategory[c] = (byCategory[c] || 0) + (r.transferBytes || 0); }
  return { ...timing, totalTransferBytes: list.reduce((s, r) => s + (r.transferBytes || 0), 0), byCategory,
    requests: list.map(r => ({ path: r.path, type: r.type, status: r.status, transferBytes: r.transferBytes, contentEncoding: r.contentEncoding, failed: r.failed || null, external: r.origin !== base })) };
}

const report = { tool: 'scripts/frontend-budget.js', runsPerProfile: RUNS, targets: { firstViewBytes: TARGET_BYTES, lcpMs: TARGET_LCP_MS }, startedAt: new Date().toISOString(), profiles: {} };
let toolFailure = null;
try {
  // Verify the hero asset bytes on disk, in the integrity map and as served.
  const hero = characterAssetFiles.find(asset => asset.url.includes('/verkarob.'));
  const disk = readFileSync(new URL(`../public${hero.url}`, import.meta.url));
  const served = Buffer.from(await (await fetch(base + hero.url)).arrayBuffer());
  const sha = buffer => createHash('sha256').update(buffer).digest('hex');
  report.heroAsset = { url: hero.url, declaredBytes: hero.bytes, diskBytes: disk.length, servedBodyBytes: served.length, declaredSha256: hero.sha256,
    diskSha256: sha(disk), servedSha256: sha(served), consistent: disk.length === hero.bytes && served.length === hero.bytes && sha(disk) === hero.sha256 && sha(served) === hero.sha256 };
  for (const profile of PROFILES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await run(profile));
    const categories = [...new Set(runs.flatMap(r => Object.keys(r.byCategory)))];
    report.profiles[profile.name] = {
      assumptions: { viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, network: profile.network || 'unthrottled (local loopback)' },
      median: { totalTransferBytes: median(runs.map(r => r.totalTransferBytes)), lcpMs: median(runs.map(r => r.lcpMs ?? NaN)), fcpMs: median(runs.map(r => r.fcpMs ?? NaN)),
        byCategory: Object.fromEntries(categories.map(c => [c, median(runs.map(r => r.byCategory[c] || 0))])) },
      lcpElements: [...new Set(runs.map(r => `${r.lcpElement} ${r.lcpUrl || ''}`.trim()))],
      externalRequests: runs.flatMap(r => r.requests.filter(q => q.external).map(q => q.path)),
      failedRequests: runs.flatMap(r => r.requests.filter(q => q.failed).map(q => `${q.path} ${q.failed}`)),
      runs,
    };
  }
} catch (error) {
  toolFailure = `${error.name}: ${error.message}`.slice(0, 500);
} finally {
  await browser.close();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
report.finishedAt = new Date().toISOString();
report.toolFailure = toolFailure;
writeFileSync(join(outDir, 'frontend-budget-report.json'), JSON.stringify(report, null, 2));

const kb = bytes => `${(bytes / 1024).toFixed(1)} KiB`;
console.log(`Frontend budget baseline — report: ${join(outDir, 'frontend-budget-report.json')}`);
if (report.heroAsset) console.log(`Hero verkarob.webp: declared ${report.heroAsset.declaredBytes} B, disk ${report.heroAsset.diskBytes} B, served body ${report.heroAsset.servedBodyBytes} B, sha/size consistent: ${report.heroAsset.consistent}`);
for (const [name, p] of Object.entries(report.profiles)) {
  const bytesStatus = p.median.totalTransferBytes <= TARGET_BYTES ? 'TARGET MET' : 'SHORTFALL';
  const lcpStatus = Number.isFinite(p.median.lcpMs) ? (p.median.lcpMs <= TARGET_LCP_MS ? 'TARGET MET' : 'SHORTFALL') : 'NOT EXECUTED';
  console.log(`\n${name} (median of ${RUNS} cold runs)`);
  console.log(`  first-view transfer: ${kb(p.median.totalTransferBytes)} [${bytesStatus} vs ~300 KiB]`);
  for (const [c, bytes] of Object.entries(p.median.byCategory)) console.log(`    ${c.padEnd(24)} ${kb(bytes)}`);
  console.log(`  LCP: ${p.median.lcpMs} ms [${lcpStatus} vs 2500 ms]  FCP: ${p.median.fcpMs} ms  LCP element: ${p.lcpElements.join(' | ')}`);
  console.log(`  external requests: ${p.externalRequests.length}  failed requests: ${p.failedRequests.length}`);
}
if (toolFailure) console.log(`TOOL FAILURE: ${toolFailure}`);
console.log('\nSHORTFALL = actual current baseline above target (expected for F0). Emulated throttling is not a real device/network.');
process.exitCode = toolFailure ? 3 : 0;
