// Optional browser regression for the AI P0 frontend (result presentation,
// AI error copy, static safety guidance, loading feedback, accessibility).
// Needs Playwright installed OUTSIDE this project:
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> [AI_BROWSER_OUTPUT=<dir>] node scripts/ai-p0-browser.js
// Runs the real rules-only server on 127.0.0.1. AI states replace only the
// existing /api/session and /api/analyze responses, using fields and error codes
// present in src/ai/* today. No provider is contacted; nothing new is assumed.
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.AI_BROWSER_OUTPUT || '/tmp';
const server = createServer({ pipeline: new AnalysisPipeline(), rateLimit: 1000, sessionRateLimit: 1000, sessionIssueRateLimit: 1000, staticRateLimit: 10000, staticBytesPerMinute: 1e9 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const AI_SESSION = { mode: 'ai', ai_configured: true, engine: 'rules+ai-v1', timeout_ms: 20000, provider_label: 'OpenAI' };
const SCAM = 'Mami, mám nové číslo a rozbitý telefon. Pošli mi ihned 12 000 Kč na nový účet. Nevolej mi.';
const CODE = /\b(?:AI|INVALID|RATE|SESSION|BODY)_[A-Z_]+\b/;
// An AI result exactly in the shape TextAIWorker.run returns today.
const aiResult = (rules, extra = {}) => ({ ...rules, engine: 'rules+ai-v1', uncertainty: 'medium', critic_used: false,
  signals: [...rules.signals.map(signal => ({ ...signal, source: 'rules' })), { id: 'ai_1', title: 'Neobvyklý způsob platby', explanation: 'Zpráva chce peníze na nový účet.', source: 'ai' }],
  uncertainties: ['Neznáme skutečného odesílatele.', ...rules.uncertainties], ...extra });

async function open(width, { session, analyze, clock } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 640 } });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  const csp = []; page.on('console', message => { if (/Content Security Policy/u.test(message.text())) csp.push(message.text()); });
  if (clock) await page.clock.install();
  if (session) await page.route('**/api/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }));
  if (analyze) await page.route('**/api/analyze', analyze);
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#engine-notice').textContent !== 'Zjišťujeme dostupnost analýzy. Screenshoty a PDF připravujeme.');
  return { page, errors, csp };
}
async function check(page, text = SCAM) {
  await page.locator('#content').fill(text);
  if (await page.locator('#consent').isVisible()) await page.locator('#consent').check();
  await page.locator('#submit').click();
  await page.waitForFunction(() => document.querySelector('#analysis-form').getAttribute('aria-busy') === 'false');
}
const withAi = extra => async route => { const response = await route.fetch(); await route.fulfill({ response, json: aiResult(await response.json(), extra) }); };
const fail = (code, status = 503) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code, error: 'internal detail' }) });
// Readability and target size for everything visible inside a region.
const layout = (page, selector) => page.evaluate(selector => {
  const root = document.querySelector(selector);
  const visible = el => el.checkVisibility();
  const texts = [...root.querySelectorAll('*')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  return {
    overflow: document.documentElement.scrollWidth > innerWidth,
    smallText: texts.filter(el => parseFloat(getComputedStyle(el).fontSize) < 18).map(el => el.textContent.slice(0, 30)),
    smallButtons: [...root.querySelectorAll('button')].filter(visible).filter(el => el.getBoundingClientRect().height < 48).length,
  };
}, selector);

try {
  // AI available: action first (LUX-05), rules vs AI signals, AI contribution and limits.
  for (const width of [320, 360, 390]) {
    const { page, errors, csp } = await open(width, { session: AI_SESSION, analyze: withAi() });
    assert.match(await page.locator('#engine-notice').textContent(), /pomůže s ním AI od poskytovatele OpenAI/);
    await check(page);
    await page.locator('#result').waitFor({ state: 'visible' });
    const order = await page.evaluate(() => ['#primary-action', '#summary', '#signals', '#ai-signals', '#ai-card', '#uncertainties', '#verification']
      .map(selector => document.querySelector(selector).getBoundingClientRect().top));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${width}: action → takeaway → rules → AI → AI card → unknowns → verification`);
    assert.equal(await page.locator('#rules-signals-label').textContent(), 'Našla naše pravidla');
    assert.ok(await page.locator('#rules-signals-label').isVisible());
    assert.doesNotMatch(await page.locator('#signals').textContent(), /Neobvyklý způsob platby/);
    assert.match(await page.locator('#ai-signals-group').textContent(), /^Doplnila AINeobvyklý způsob platby\./);
    assert.equal(await page.locator('#ai-signals-group h4').count(), 1, 'group label is a heading');
    assert.equal(await page.locator('#ai-uncertainty').textContent(), 'AI zná jen text zprávy, ne celou situaci. Ověřte si ji nezávisle.');
    const notes = await page.locator('#ai-notes li').allTextContents();
    assert.match(notes[0], /s vaším souhlasem odeslali externímu AI poskytovateli\..*Nerozhoduje za vás\./);
    assert.ok(notes.includes('Neověřovali jsme, kdo zprávu poslal. Odkazy jsme neotevírali.'));
    assert.ok(!notes.some(note => /půjčk/.test(note)), 'no loan note without loan answers');
    const resultText = await page.locator('#result').textContent();
    assert.doesNotMatch(resultText, /OpenAI|Nejistota AI|skór|score|\d+\s*%|gpt|deepfake|je bezpečn[áé]|ověřen[ýá] odesílatel/iu);
    assert.doesNotMatch(resultText, CODE);
    const m = await layout(page, '#result');
    assert.equal(m.overflow, false); assert.deepEqual(m.smallText, []); assert.equal(m.smallButtons, 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'result', 'focus on the result');
    assert.deepEqual(errors, []); assert.deepEqual(csp, []);
    await page.locator('#result').screenshot({ path: `${out}/ai-result-${width}.png` });
    await page.close();
    console.log(`AI P0 browser: PASS (${width}px AI result: action first, rules/AI groups, AI card, no codes/scores, text >= 18 px, no overflow)`);
  }

  // High / low uncertainty, second AI check, loan answers kept local.
  {
    const { page } = await open(360, { session: AI_SESSION, analyze: withAi({ uncertainty: 'high', critic_used: true }) });
    await check(page);
    assert.equal(await page.locator('#ai-uncertainty').textContent(), 'U této zprávy si AI není jistá. Řiďte se hlavně kroky v části Co udělat teď.');
    assert.ok(await page.locator('#ai-uncertainty').isVisible(), 'high uncertainty is visible, not hidden in details');
    assert.ok(await page.locator('#ai-card').evaluate(card => card.classList.contains('is-uncertain')));
    assert.ok((await page.locator('#ai-notes li').allTextContents()).includes('Výsledek prošel druhou kontrolou AI.'));
    await page.locator('#ai-card').screenshot({ path: `${out}/ai-high-uncertainty-360.png` });
    await page.close();
  }
  {
    const { page } = await open(360, { session: AI_SESSION, analyze: withAi({ uncertainty: 'low', topic: 'loan' }) });
    await page.locator('#loan-entry').click(); await page.locator('#loan-questions').waitFor({ state: 'visible' });
    await page.getByRole('radio', { name: 'Ano', exact: true }).check();
    await check(page, 'Nabídka půjčky 30 000 Kč.');
    assert.equal(await page.locator('#ai-uncertainty').textContent(), 'Ani jistější posouzení AI neznamená, že je zpráva bezpečná nebo že jde o podvod.');
    assert.ok((await page.locator('#ai-notes li').allTextContents()).includes('Odpovědi na otázky k půjčce zůstaly jen u nás a AI je nedostala.'));
    await page.close();
  }
  console.log('AI P0 browser: PASS (high/low uncertainty, second AI check, loan answers stated as local)');

  // Rules-only mode: no AI card, no group labels, unchanged single list.
  {
    const { page } = await open(360);
    await check(page);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#ai-card').isHidden());
    assert.ok(await page.locator('#rules-signals-label').isHidden());
    assert.ok(await page.locator('#ai-signals-group').isHidden());
    assert.match(await page.locator('#signals').textContent(), /Změna telefonu nebo čísla/);
    assert.doesNotMatch(await page.locator('#result').innerText(), /Doplnila AI|Co k tomu přidala AI/, 'visible text');
    await page.close();
    console.log('AI P0 browser: PASS (rules-only result has no AI presentation)');
  }

  // AI unavailable before any check.
  {
    const { page } = await open(360, { session: { ...AI_SESSION, ai_configured: false } });
    assert.ok(await page.locator('#submit').isDisabled());
    assert.ok(await page.locator('#ai-consent').isHidden());
    await page.close();
  }

  // Every AI failure of the existing contract: plain Czech, no code, static
  // guidance that says it is not a result, keyboard-reachable recovery.
  const cases = [
    ['AI_TIMEOUT', 'Prověření trvalo příliš dlouho.', true],
    ['AI_UNAVAILABLE', 'Prověřování je dočasně nedostupné.', false],
    ['AI_INVALID_CONFIG', 'Prověřování je dočasně nedostupné.', false],
    ['AI_BUDGET_UNAVAILABLE', 'Prověřování je dočasně nedostupné.', false],
    ['AI_CAPACITY_EXHAUSTED', 'Prověřování je dočasně nedostupné.', false],
    ['AI_OVERLOADED', 'Právě prověřujeme mnoho zpráv.', false],
    ['AI_PROVIDER_UNAVAILABLE', 'Kontrola s AI se teď nepodařila.', true],
    ['AI_INVALID_OUTPUT', 'Výsledek kontroly nebyl dost spolehlivý, proto ho nezobrazujeme.', true],
    ['AI_UNSUPPORTED_EVIDENCE', 'Výsledek kontroly nebyl dost spolehlivý, proto ho nezobrazujeme.', true],
    ['AI_UNSAFE_OUTPUT', 'Výsledek kontroly nebyl dost spolehlivý, proto ho nezobrazujeme.', true],
  ];
  for (const [code, title, retryable] of cases) {
    const { page, errors } = await open(360, { session: AI_SESSION, analyze: fail(code) });
    await check(page);
    await page.locator('#error-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#error-title').textContent(), title, code);
    assert.equal(await page.locator('#error-safety').textContent(), 'Výsledek teď nemáme. Neznamená to, že je zpráva bezpečná.');
    assert.ok(await page.locator('#result').isHidden(), `${code}: no result is shown`);
    const guidance = page.locator('#error-guidance');
    assert.ok(await guidance.isVisible(), `${code}: static guidance`);
    assert.match(await guidance.textContent(), /nikoli výsledek kontroly vaší zprávy/);
    assert.equal(await guidance.locator('a[href="/uz-se-to-stalo"]').count(), 1);
    assert.equal(await page.locator('#error').evaluate(alert => alert.contains(document.querySelector('#error-guidance'))), false, 'guidance is not re-announced by the alert');
    assert.doesNotMatch(await page.locator('#error-panel').textContent(), /internal detail|[A-Z]+_[A-Z_]+/);
    assert.equal(await page.locator('#retry').isVisible(), retryable, `${code}: retry offered`);
    const m = await layout(page, '#error-panel');
    assert.equal(m.overflow, false); assert.deepEqual(m.smallText, []); assert.equal(m.smallButtons, 0);
    assert.deepEqual(errors, []);
    if (code === 'AI_TIMEOUT') await page.locator('#error-panel').screenshot({ path: `${out}/ai-error-guidance-360.png` });
    await page.close();
  }
  console.log(`AI P0 browser: PASS (${cases.length} AI failure codes: plain Czech, no codes, static guidance, correct recovery)`);

  // A rejected AI answer gets one manual retry; the second rejection ends it.
  {
    const { page } = await open(360, { session: AI_SESSION, analyze: fail('AI_UNSAFE_OUTPUT') });
    await check(page);
    assert.ok(await page.locator('#retry').isVisible());
    await page.locator('#retry').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#error-message').textContent.startsWith('Ani druhý pokus'));
    assert.ok(await page.locator('#retry').isHidden(), 'no endless retries after a second rejection');
    assert.ok(await page.locator('#error-guidance').isVisible());
    // New content starts a fresh allowance.
    await check(page, 'Jiná zpráva: zaplaťte fakturu.');
    assert.ok(await page.locator('#retry').isVisible());
    await page.close();
    console.log('AI P0 browser: PASS (rejected AI answer: one keyboard retry, then guidance only; resets for new content)');
  }

  // Rules mode network failure also leaves the user with safe steps.
  {
    const { page } = await open(360, { analyze: route => route.abort() });
    await check(page);
    assert.ok(await page.locator('#error-guidance').isVisible());
    await page.close();
  }

  // Loading: polite staged updates at 8 s and 20 s, cleared when the check ends.
  {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const { page } = await open(360, { session: AI_SESSION, clock: true, analyze: async route => { await held; await withAi()(route); } });
    await page.locator('#content').fill(SCAM); await page.locator('#consent').check();
    await page.locator('#submit').click();
    await page.locator('#processing').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#status').getAttribute('role'), 'status');
    assert.equal(await page.locator('#processing-detail').textContent(), 'Chvíli prosím počkejte.');
    await page.clock.fastForward(8000);
    assert.equal(await page.locator('#status').textContent(), 'Kontrola s AI chvíli trvá. Prosím počkejte.');
    assert.equal(await page.locator('#processing-detail').textContent(), 'Kontrola s AI chvíli trvá. Prosím počkejte.');
    await page.clock.fastForward(12000);
    assert.equal(await page.locator('#status').textContent(), 'Ještě chvíli. Pokud to nepůjde, dáme vám vědět, co dál.');
    await page.screenshot({ path: `${out}/ai-loading-20s-360.png` });
    release();
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#status').textContent(), 'Kontrola je dokončena.');
    await page.clock.fastForward(30000);
    assert.equal(await page.locator('#status').textContent(), 'Kontrola je dokončena.', 'no stale loading message after completion');
    await page.close();
    console.log('AI P0 browser: PASS (loading: polite status at 8 s and 20 s, cleared on completion)');
  }

  // Reduced motion: the progress bar does not animate.
  {
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.route('**/api/analyze', async route => { await new Promise(resolve => setTimeout(resolve, 400)); await route.continue(); });
    await page.goto(base); await page.waitForFunction(() => !document.querySelector('#submit').disabled);
    await page.locator('#content').fill(SCAM); await page.locator('#submit').click();
    await page.locator('#processing').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && Number(a.effect.getTiming().duration) > 10).length), 0);
    await context.close();
    console.log('AI P0 browser: PASS (reduced motion: no running animation while loading)');
  }
  console.log('AI P0 browser: PASS');
} finally {
  await browser.close();
  server.close();
}
