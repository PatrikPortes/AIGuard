// Optional browser regression. Use an isolated development workspace with
// Playwright installed outside production. No external AI/provider is contacted.
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer({ pipeline: new AnalysisPipeline() });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(base);
    await page.waitForFunction(() => !document.querySelector('#submit').disabled);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('.hero-character img').evaluate(img => img.complete && img.naturalWidth > 0 && getComputedStyle(img).objectFit === 'contain'));
  }
  await page.locator('#content').fill('<img src=x onerror=alert(1)>');
  await page.locator('#submit').click(); await page.locator('#result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#summary img').count(), 0);
  // Verify text rendering even if a future model returns HTML-looking strings.
  const marker = '<img src=x onerror="window.xssExecuted=true">';
  await page.route('**/api/analyze', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.summary = marker; data.signals = [{ title: marker, explanation: marker }];
    await route.fulfill({ response, json: data });
  });
  await page.locator('#content').fill('Syntetický test.'); await page.locator('#submit').click();
  await page.waitForFunction(value => document.querySelector('#summary').textContent === value, marker);
  assert.equal(await page.locator('#summary img, #signals img').count(), 0);
  assert.equal(await page.evaluate(() => window.xssExecuted), undefined);
  assert.deepEqual(errors, []);
  console.log('Security browser: PASS (text rendering/XSS, rules workflow, 1440/390/320, no overflow, canonical hero)');
} finally {
  await browser.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
