// Backend integration regression against the existing, unmodified public UI.
// Synthetic observations only; this script never contacts an external provider.
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { ObservationAIWorker } from '../src/ai/observation-worker.js';
import { BoundedQueue } from '../src/ai/queue.js';
import { SqliteBudgetStore } from '../src/ai/budget.js';
import { ProviderError } from '../src/ai/errors.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let calls = 0;
const worker = new ObservationAIWorker({
  provider: { complete: async () => {
    calls++;
    if (calls === 2) throw new ProviderError();
    return { schema_version: 'observations-v1', observations: [], uncertainty: 'high', insufficient_information: true };
  } },
  budget: new SqliteBudgetStore({ path: ':memory:', dailyRequests: 3, dailyBudgetMicroUsd: 1000000, totalBudgetMicroUsd: 1000000 }),
  config: { simpleModel: 'mock-model', complexModel: 'mock-model', inputPrice: 1, outputPrice: 2, maxInputTokens: 24000, maxOutputTokens: 800, retries: 0 },
});
const pipeline = new AnalysisPipeline({ mode: 'ai', worker, queue: new BoundedQueue({ concurrency: 1, capacity: 2 }), timeoutMs: 1000, fallbackToRules: true });
const server = createServer({ pipeline });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const requests = [], errors = [];
  page.on('request', req => requests.push(req.url()));
  page.on('pageerror', error => errors.push(error.name));
  await page.goto(base);
  await page.waitForFunction(() => !document.querySelector('#submit').disabled);
  await page.locator('#content').fill('Ahoj, zítra se uvidíme.');
  await page.locator('#submit').click();
  await page.locator('#error').waitFor({ state: 'visible' });
  assert.equal(calls, 0, 'no consent means no provider call');
  await page.locator('#consent').check();
  for (const [engine, expected] of [['rules+ai-v1', 'Pravidla ani AI nenašla'], ['rules-v1', 'AI kontrola nebyla dokončena']]) {
    const responsePromise = page.waitForResponse(res => res.url() === `${base}/api/analyze` && res.request().method() === 'POST');
    await page.locator('#submit').click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).engine, engine);
    await page.waitForFunction(text => document.querySelector('#result').textContent.includes(text), expected);
    const text = await page.locator('#result').textContent();
    assert.doesNotMatch(text, /skór|score|\b0\s*[–-]\s*100\b|\/\s*100/iu);
    assert.equal(await page.locator('#risk, #risk-level, #risk-number, .risk-circle, #result a[href]').count(), 0);
    assert.ok(await page.locator('#uncertainties').isVisible());
    assert.ok(await page.locator('#verification li').count() > 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (engine === 'rules-v1') assert.match(await page.locator('#technical').textContent(), /Použita pouze pravidla, bez AI/);
  }
  assert.equal(calls, 2);
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => new URL(url).origin === base));
  console.log('AI beta browser: PASS; explicit consent, cautious result, truthful rules fallback, no scores/links/external requests.');
} finally {
  await browser?.close();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
