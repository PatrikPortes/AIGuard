// Optional browser regression for the ARES IČO lookup failure state.
// Needs Playwright installed OUTSIDE this project:
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/ares-browser.js
// The server runs in production relay mode; the private relay address is not
// reachable here, which is exactly an ARES/relay outage. Nothing leaves this host.
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer({ rateLimit: 1000, sessionRateLimit: 1000, registryRelay: Object.freeze({ authorization: 'Bearer sk-' + 'b'.repeat(32) }) });
const bodies = [];
server.on('request', req => { const parts = []; req.on('data', part => parts.push(part)); req.on('end', () => { if (req.method === 'POST') bodies.push(`${req.url} ${Buffer.concat(parts)}`); }); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const external = []; page.on('request', request => { if (!request.url().startsWith(base)) external.push(request.url()); });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base + '/proverit-web', { waitUntil: 'networkidle' });
  await page.locator('#web-url').fill('https://www.priklad-obchod.invalid/kosik?id=1');
  await page.locator('#web-form button[type=submit]').click();
  await page.locator('#web-result').waitFor({ state: 'visible' });
  assert.ok(await page.locator('#operator-form').isVisible(), 'IČO lookup is offered');
  await page.locator('#operator-ico').fill('00006947');
  await page.locator('#operator-form button[type=submit]').click();
  await page.waitForFunction(() => /NEOVĚŘENO/.test(document.querySelector('#operator-result').innerText) && !/Ověřujeme/.test(document.querySelector('#operator-result').innerText), null, { timeout: 12000 });
  const text = await page.locator('#operator-result').innerText();
  assert.match(text, /NEOVĚŘENO/); assert.match(text, /ARES je nedostupný/);
  assert.doesNotMatch(text, /Název:|Sídlo:/);
  assert.deepEqual(bodies, ['/api/eshop-operator {"ico":"00006947"}'], 'only the IČO reaches the server; never the web address');
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  console.log('ARES browser: PASS (relay outage → NEOVĚŘENO, only IČO sent, no external requests)');
} finally {
  await browser.close(); server.close();
}
