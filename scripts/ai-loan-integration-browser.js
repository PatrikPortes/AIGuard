// Actual backend + raw loopback provider HTTP; no frontend or API stubs.
// The unconfigured-fallback incompatibility intentionally fails the final gate.
import assert from 'node:assert/strict';
import http from 'node:http';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { ObservationAIWorker } from '../src/ai/observation-worker.js';
import { OpenAICompatibleProvider } from '../src/ai/provider.js';
import { SqliteBudgetStore } from '../src/ai/budget.js';
import { BoundedQueue } from '../src/ai/queue.js';
import { createServer } from '../src/server.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const listen = async server => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
let failure = false, captures = [];
const provider = http.createServer(async (req, res) => {
  const chunks = []; for await (const part of req) chunks.push(part);
  captures.push(Buffer.concat(chunks).toString('utf8'));
  if (failure) { res.writeHead(503); res.end(); return; }
  res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ schema_version: 'observations-v1',
    observations: [{ kind: 'payment_request', evidence: 'Pošli peníze' }], uncertainty: 'high', insufficient_information: false }) } }] }));
});
const endpoint = `${await listen(provider)}/v1/chat/completions`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  for (const width of [320, 360, 390]) {
    for (const mode of ['rules', 'ai', 'fallback']) {
      failure = mode === 'fallback'; captures = [];
      const worker = mode === 'rules' ? undefined : new ObservationAIWorker({
        provider: new OpenAICompatibleProvider({ endpoint, apiKey: 'synthetic-test-key', allowLocal: true }),
        budget: new SqliteBudgetStore({ path: ':memory:', dailyRequests: 4, dailyBudgetMicroUsd: 1000000, totalBudgetMicroUsd: 1000000 }),
        config: { simpleModel: 'simple-model', complexModel: 'complex-model', inputPrice: 1, outputPrice: 2,
          maxInputTokens: 24000, maxOutputTokens: 800, retries: 0, criticEnabled: false },
      });
      const pipeline = new AnalysisPipeline({ mode: mode === 'rules' ? 'rules' : 'ai', worker,
        queue: mode === 'rules' ? undefined : new BoundedQueue({ concurrency: 1, capacity: 2 }), timeoutMs: 10000, fallbackToRules: mode !== 'rules' });
      const server = createServer({ pipeline }), base = await listen(server);
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage(), requests = [], errors = [];
      page.on('request', req => requests.push(req.url())); page.on('pageerror', error => errors.push(error.name));
      try {
        await page.goto(base); await page.waitForFunction(() => !document.querySelector('#submit').disabled);
        await page.locator('#loan-entry').click();
        await page.locator('input[name="advance_payment"][value="yes"]').check();
        await page.locator('input[name="requests"][value="sms_code"]').check();
        await page.locator('#content').fill('Nabízíme půjčku. Pošli peníze.');
        if (mode !== 'rules') await page.locator('#consent').check();
        const responsePromise = page.waitForResponse(res => res.url() === `${base}/api/analyze` && res.request().method() === 'POST');
        await page.locator('#submit').focus(); await page.keyboard.press('Enter');
        const response = await responsePromise; assert.equal(response.status(), 200);
        const result = await response.json(); assert.equal(result.topic, 'loan');
        assert.equal(result.engine, mode === 'ai' ? 'rules+ai-v1' : 'rules-v1');
        await page.locator('#result').waitFor({ state: 'visible' });
        assert.match(await page.locator('#signals').textContent(), /Platba předem/);
        assert.match(await page.locator('#signals').textContent(), /kód z SMS/);
        assert.match(await page.locator('#primary-action').textContent(), /^Nic předem neplaťte/);
        assert.match(await page.locator('#technical').textContent(), /Registr ČNB jsme neprohledávali/);
        if (mode === 'ai') {
          assert.ok(await page.locator('#ai-card').isVisible());
          assert.match(await page.locator('#ai-signals').textContent(), /Žádost o platbu/);
          assert.equal(captures.length, 1);
        } else {
          assert.ok(await page.locator('#ai-card').isHidden());
          if (mode === 'fallback') {
            assert.equal(result.ai_status, 'not_performed');
            assert.equal(result.ai_fallback_reason, 'provider_unavailable');
            assert.ok(result.uncertainties.includes('AI kontrola nebyla dokončena. Tento výsledek používá pouze pravidla; nejde o potvrzení bezpečnosti.'));
            assert.ok(await page.locator('#engine-note').isVisible());
            assert.equal(await page.locator('#engine-note').textContent(), 'Tentokrát výsledek vychází jen z pevných pravidel. Kontrola s AI teď nebyla dostupná.');
            assert.equal(captures.length, 1);
          } else assert.equal(captures.length, 0);
        }
        for (const raw of captures) assert.deepEqual(JSON.parse(JSON.parse(raw).messages[1].content), { untrusted_content: 'Nabízíme půjčku. Pošli peníze.' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.locator('#next-check').click();
        assert.equal(await page.locator('#loan-questions input:checked').count(), 0);
        assert.deepEqual(errors, []); assert.ok(requests.every(url => new URL(url).origin === base));
        console.log(`AI/Loan real browser: PASS ${width}px ${mode}; local warnings/action/limits, engine label, keyboard, no overflow/external requests, answer reset`);
      } finally { await context.close(); await close(server); pipeline.close(); }
    }
  }
  const pipeline = new AnalysisPipeline({ mode: 'ai', unavailableCode: 'AI_INVALID_CONFIG', fallbackToRules: true });
  const server = createServer({ pipeline }), base = await listen(server);
  const page = await browser.newPage({ viewport: { width: 360, height: 844 } });
  try {
    const responsePromise = page.waitForResponse(res => res.url() === `${base}/api/session`);
    await page.goto(base);
    const state = await (await responsePromise).json();
    assert.equal(state.rules_fallback, true); assert.equal(state.ai_configured, false);
    await page.waitForFunction(() => document.querySelector('#engine-notice').textContent.includes('AI ověření zatím není dostupné'));
    // Preserve the integration requirement; failure is evidence for the frontend handoff.
    assert.equal(await page.locator('#submit').isDisabled(), false, 'permitted rules fallback must remain usable');
    assert.ok(await page.locator('#ai-consent').isVisible(), 'existing consent requirement remains accessible');
  } finally { await page.close(); await close(server); pipeline.close(); }
} finally { await browser.close(); await close(provider); }
