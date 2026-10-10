// Optional browser regression for the private-beta result and fallback UX.
// Needs Playwright installed OUTSIDE this project:
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/beta-ux-browser.js
// Runs the real rules-only server on 127.0.0.1. AI-mode states are exercised by
// replacing only the existing /api/session and /api/analyze responses; no AI
// provider is contacted and no new API field is assumed.
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer({ pipeline: new AnalysisPipeline(), rateLimit: 1000, sessionRateLimit: 1000, sessionIssueRateLimit: 1000, staticRateLimit: 10000, staticBytesPerMinute: 1e9 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const AI_SESSION = { mode: 'ai', ai_configured: true, engine: 'rules+ai-v1', provider_label: 'OpenAI' };
const SCAM = 'Mami, mám nové číslo a rozbitý telefon. Pošli mi ihned 12 000 Kč na nový účet. Nevolej mi.';
const QUIET = 'Ahoj, zítra se potkáme u knihovny.';
const NOTHING_FOUND = 'To, že jsme nenašli jasné varovné znaky, neznamená, že je zpráva bezpečná.';

async function open(width, { session, analyze } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 640 } });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  if (session) await page.route('**/api/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }));
  if (analyze) await page.route('**/api/analyze', analyze);
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#engine-notice').textContent !== 'Zjišťujeme dostupnost analýzy. Screenshoty a PDF připravujeme.');
  return { page, errors };
}
async function check(page, text) {
  await page.locator('#content').fill(text);
  if (await page.locator('#consent').isVisible()) await page.locator('#consent').check();
  await page.locator('#submit').click();
  await page.waitForFunction(() => document.querySelector('#analysis-form').getAttribute('aria-busy') === 'false');
}
async function actionFirst(page, name) {
  const order = await page.evaluate(() => {
    const action = document.querySelector('#primary-action');
    const summary = document.querySelector('#summary');
    const note = document.querySelector('#engine-note');
    return { action: action.getBoundingClientRect().top, summary: summary.getBoundingClientRect().top,
      signals: document.querySelector('#signals').getBoundingClientRect().top,
      actionBeforeSummary: Boolean(action.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING),
      actionBeforeNote: Boolean(action.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING),
      inLead: Boolean(document.querySelector('.result-lead #primary-action')),
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(order.inLead && order.actionBeforeSummary && order.actionBeforeNote &&
    order.action < order.summary && order.summary < order.signals, `${name}: safe action → assessment → signals, in visual and reading order`);
  assert.ok(order.action >= 0 && order.action < 640, `${name}: safe action in the first screen of the result`);
  assert.equal(order.overflow, false);
}

try {
  for (const width of [320, 360, 390]) {
    const { page, errors } = await open(width);
    await check(page, SCAM);
    await page.locator('#result').waitFor({ state: 'visible' });
    await actionFirst(page, `${width}: suspicious text`);
    // Signals were found: never claim that nothing was found.
    const unknowns = await page.locator('#uncertainties').textContent();
    assert.ok(!unknowns.includes(NOTHING_FOUND), `${width}: contradiction`);
    assert.match(unknowns, /Varovné signály nejsou důkaz podvodu\./);
    assert.ok(await page.locator('#engine-note').isHidden(), 'rules mode needs no fallback note');
    // Way back to a new check: the field is focused and its text selected.
    await page.locator('#next-check').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'content');
    assert.equal(await page.evaluate(() => { const c = document.querySelector('#content'); return c.selectionEnd - c.selectionStart; }), SCAM.length);
    assert.ok(await page.evaluate(() => { const r = document.querySelector('#content').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    // No signal: the reviewed "nothing found ≠ safe" copy stays.
    await check(page, QUIET);
    await actionFirst(page, `${width}: unassessed text`);
    assert.ok((await page.locator('#uncertainties').textContent()).includes(NOTHING_FOUND));
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Beta UX browser: PASS (${width}px: safe action first, no "nothing found" with signals, next check, no overflow)`);
  }

  // AI configured, but this result came from the rules alone: say so, briefly.
  // The note needs the explicit ai_status marker of the backend contract; a
  // rules-v1 engine alone is never treated as a fallback.
  {
    const { page } = await open(360, { session: AI_SESSION, analyze: async route => {
      const response = await route.fetch(); const data = await response.json();
      await route.fulfill({ response, json: { ...data, ai_status: 'not_performed', ai_fallback_reason: 'provider_unavailable' } });
    } });
    await check(page, SCAM);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#engine-note').isVisible());
    await actionFirst(page, 'AI fallback');
    assert.equal(await page.locator('#engine-note').textContent(), 'Kontrola s AI se tentokrát nepodařila. Tento výsledek vychází jen z našich pevných pravidel. Text zprávy mohl být s vaším souhlasem odeslán poskytovateli AI.');
    await page.close();
  }
  {
    const { page } = await open(360, { session: AI_SESSION });
    await check(page, SCAM);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#engine-note').isHidden(), 'no fallback note without the explicit marker');
    await page.close();
  }
  // AI result: no fallback note, and no provider, model or score in the result.
  {
    const { page } = await open(360, { session: AI_SESSION, analyze: async route => {
      const response = await route.fetch(); const data = await response.json();
      await route.fulfill({ response, json: { ...data, engine: 'rules+ai-v1', uncertainty: 'medium', critic_used: false,
        signals: [...data.signals, { id: 'ai_1', title: 'Neobvyklý způsob platby', explanation: 'Zpráva chce platbu na neznámý účet.', source: 'ai' }] } });
    } });
    await check(page, SCAM);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#engine-note').isHidden());
    await actionFirst(page, 'AI result');
    // AI P0: AI-sourced signals are listed in their own labelled group, not with the rules.
    assert.match(await page.locator('#ai-signals').textContent(), /Neobvyklý způsob platby/);
    assert.doesNotMatch(await page.locator('#signals').textContent(), /Neobvyklý způsob platby/);
    assert.doesNotMatch(await page.locator('#result').textContent(), /OpenAI|gpt|skór|score|\d+\s*%/iu);
    await page.close();
  }
  // AI mode but not available: no consent request for something that cannot run.
  {
    const { page } = await open(360, { session: { ...AI_SESSION, ai_configured: false } });
    assert.ok(await page.locator('#ai-consent').isHidden());
    assert.ok(await page.locator('#submit').isDisabled());
    assert.equal(await page.locator('#engine-notice').textContent(), 'AI ověření zatím není dostupné. Zkuste to později.');
    await page.close();
  }
  // AI unavailable during a check: a plain temporary message, no internal error.
  {
    const { page } = await open(360, { session: AI_SESSION, analyze: route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"AI_UNAVAILABLE","error":"internal detail"}' }) });
    await check(page, SCAM);
    await page.locator('#error-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#error-title').textContent(), 'Prověřování je dočasně nedostupné.');
    assert.equal(await page.locator('#error-safety').textContent(), 'Výsledek teď nemáme. Neznamená to, že je zpráva bezpečná.');
    assert.doesNotMatch(await page.locator('#error-panel').textContent(), /internal|AI_UNAVAILABLE/);
    await page.close();
  }
  // Loan flow chosen and questions skipped: no second invitation to answer them.
  {
    const { page } = await open(360);
    await page.locator('#loan-entry').click();
    await page.locator('#loan-questions').waitFor({ state: 'visible' });
    await check(page, 'Nabídka půjčky 20 000 Kč, vyřízení do druhého dne.');
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#loan-followup').isHidden());
    await page.locator('input[name="advance_payment"][value="yes"]').check();
    await page.locator('input[name="requests"][value="sms_code"]').check();
    await page.locator('#submit').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    // Replacing completed content without the next-check button is also a
    // fresh ordinary check. No answer-derived warnings can follow it.
    await page.locator('#content').fill(QUIET);
    assert.ok(await page.locator('#loan-questions').isHidden());
    assert.equal(await page.locator('#loan-questions input:checked').count(), 0);
    const pending = page.waitForRequest(request => request.url().endsWith('/api/analyze'));
    await page.locator('#submit').click();
    const sent = JSON.parse((await pending).postData());
    assert.deepEqual(Object.keys(sent).sort(), ['ai_consent', 'content', 'type']);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.doesNotMatch(await page.locator('#signals').textContent(), /Platba předem|kód z SMS/);
    await page.close();
  }
  // Retry is the same analysis; replacing failed content is a new analysis.
  {
    const bodies = [];
    const { page } = await open(360, { analyze: route => {
      bodies.push(JSON.parse(route.request().postData()));
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"AI_TIMEOUT"}' });
    } });
    await page.locator('#loan-entry').click();
    await page.locator('#loan-questions').waitFor({ state: 'visible' });
    await page.locator('input[name="advance_payment"][value="yes"]').check();
    await page.locator('input[name="requests"][value="sms_code"]').check();
    await check(page, 'Nabídka půjčky.');
    await page.locator('#retry').click();
    await page.waitForFunction(() => document.querySelector('#analysis-form').getAttribute('aria-busy') === 'false');
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[1], bodies[0], 'explicit retry preserves the same current answers');
    await page.locator('#content').fill(QUIET);
    assert.equal(await page.locator('#loan-questions input:checked').count(), 0);
    await page.locator('#retry').click();
    await page.waitForFunction(() => document.querySelector('#analysis-form').getAttribute('aria-busy') === 'false');
    assert.deepEqual(Object.keys(bodies.at(-1)).sort(), ['ai_consent', 'content', 'type']);
    assert.equal(bodies.at(-1).content, QUIET);
    await page.close();
  }
  // N-3 also holds when the frontend advertises AI mode. Only the session
  // metadata is stubbed; the real rules server rejects/validates the bodies.
  {
    const { page, errors } = await open(360, { session: AI_SESSION });
    await page.locator('#loan-entry').click();
    await page.locator('#loan-questions').waitFor({ state: 'visible' });
    await page.locator('input[name="advance_payment"][value="yes"]').check();
    await page.locator('input[name="requests"][value="sms_code"]').check();
    const rejected = page.waitForResponse(response => response.url().endsWith('/api/analyze'));
    await check(page, 'Půjčka: ' + 'é'.repeat(8000));
    assert.equal((await (await rejected).json()).code, 'AI_INPUT_LIMIT');
    const sent = page.waitForRequest(request => request.url().endsWith('/api/analyze'));
    await check(page, 'Půjčka: zde je zkrácený text nabídky.');
    const request = JSON.parse((await sent).postData());
    assert.equal(request.ai_consent, true); assert.equal(request.topic, 'loan');
    assert.deepEqual(request.loan_context, { advance_payment: 'yes', requests: ['sms_code'] });
    await page.locator('#result').waitFor({ state: 'visible' });
    await actionFirst(page, 'AI-mode loan correction');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Beta UX browser: PASS (safe action before assessment, AI fallback note, AI result without provider/score, AI unavailable states, loan follow-up, fresh content after success/error, same-request retry, AI_INPUT_LIMIT loan correction)');
} finally {
  await browser.close();
  server.close();
}
