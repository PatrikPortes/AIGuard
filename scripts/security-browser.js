// Optional browser regression. Use an isolated development workspace with
// Playwright installed outside production. No external AI/provider is contacted.
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { characterAssets } from '../public/character-assets.js';
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
    for (const [selector, asset, alt] of [
      ['.hero-verka', 'verka-welcome', 'Věrka, vaše průvodkyně, mává na pozdrav'],
      ['.hero-robo', 'robo-default', 'Robo, pomocník, který zpracovává kontrolu, mává na pozdrav'],
    ]) {
      const hero = page.locator(selector);
      assert.equal(await hero.count(), 1);
      assert.equal(await hero.evaluate(img => img.tagName), 'IMG');
      assert.equal(await hero.getAttribute('src'), characterAssets[asset]);
      assert.ok(await hero.isVisible());
      assert.ok(await hero.evaluate(img => {
        const rect=img.getBoundingClientRect();
        return img.complete && img.naturalWidth>0 && getComputedStyle(img).objectFit==='contain'
          && Math.abs(rect.height-rect.width*img.naturalHeight/img.naturalWidth)<1
          && rect.x>=0 && rect.right<=innerWidth;
      }));
      assert.equal(await hero.getAttribute('alt'), alt);
    }
    assert.equal(await page.locator('main').count(),1);
    assert.equal(await page.getByLabel('Obsah k ověření').count(),1);
    assert.equal(await page.getByLabel('Typ obsahu').count(),1);
    await page.screenshot({path:`${process.env.VERIM_BROWSER_OUTPUT || '/tmp'}/verim-remediation-${width}.png`,fullPage:true});
  }
  await page.locator('#content').fill('<img src=x onerror=alert(1)>');
  await page.locator('#submit').click(); await page.locator('#result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#summary img').count(), 0);
  assert.equal(await page.locator('#risk-level').textContent(), 'Bezpečnost nelze určit');
  assert.equal(await page.locator('#risk-character').getAttribute('src'), characterAssets['verka-thinking']);
  assert.equal(await page.locator('#signals-character').getAttribute('src'), characterAssets['robo-default']);
  await page.locator('#input-type').selectOption('url');
  await page.locator('#content').fill('https://banka-prihlaseni.invalid');
  await page.locator('#submit').click();
  await page.waitForFunction(() => document.querySelector('#summary').textContent.includes('Stránku jsme nenavštívili'));
  assert.equal(await page.locator('#risk-level').textContent(), 'Bezpečnost nelze určit');
  assert.ok(await page.locator('#risk-scale').isHidden());
  await page.locator('#input-type').selectOption('text');
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
  // No-JS and a failed module both leave the native form unable to send content.
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled });
    const nojs = await context.newPage();
    if (javaScriptEnabled) await nojs.route('**/app.js', route => route.abort());
    const requests = []; nojs.on('request', req => requests.push({ url: req.url(), data: req.postData() || '' }));
    await nojs.goto(base);
    await nojs.locator('#content').fill('SYNTHETIC_PRIVATE_MARKER');
    assert.ok(await nojs.locator('#submit').isDisabled());
    await nojs.locator('#content').press('Control+Enter');
    assert.equal(nojs.url(), base + '/');
    assert.ok(requests.every(req => !req.url.includes('SYNTHETIC_PRIVATE_MARKER') && !req.data.includes('SYNTHETIC_PRIVATE_MARKER')));
    // Even native programmatic submission after module failure has no named data.
    if (javaScriptEnabled) {
      await Promise.all([nojs.waitForURL('**/api/analyze'), nojs.evaluate(() => HTMLFormElement.prototype.submit.call(document.querySelector('#analysis-form')))]);
      const native = requests.find(req => req.url.endsWith('/api/analyze'));
      assert.ok(native); assert.equal(native.data, '');
    }
    await context.close();
  }
  console.log('Security browser: PASS (text rendering/XSS, rules workflow, 1440/390/320, no overflow, canonical hero, neutral URL/no-signal visuals, no-JS/module-failure privacy)');
} finally {
  await browser.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
