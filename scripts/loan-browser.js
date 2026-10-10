// Optional browser regression for the loan flow (L1+L2). Like the other browser
// scripts it needs Playwright installed OUTSIDE this project:
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> [LOAN_BROWSER_OUTPUT=<dir>] node scripts/loan-browser.js
// Runs the real server in rules-only mode on 127.0.0.1. No external AI or network.
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.LOAN_BROWSER_OUTPUT || '/tmp';
const server = createServer({ pipeline: new AnalysisPipeline(), rateLimit: 1000, sessionRateLimit: 1000, sessionIssueRateLimit: 1000, staticRateLimit: 10000, staticBytesPerMinute: 1e9 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const SCAM = 'Půjčka 50 000 Kč pro každého, i bez registru. Schválení garantováno. Před vyplacením uhraďte vratný poplatek 1 900 Kč.';
const BENIGN = 'Dobrý den, děkujeme za zájem o spotřebitelský úvěr. Smlouvu vám zašleme e-mailem.';

async function open(width, height, options = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...options });
  const page = await context.newPage();
  const state = { requests: [], errors: [], csp: [], bodies: [] };
  page.on('request', request => {
    state.requests.push(request.url());
    if (request.url().endsWith('/api/analyze')) state.bodies.push(request.postData());
  });
  page.on('pageerror', error => state.errors.push(String(error)));
  page.on('console', message => { if (/Content Security Policy|violates/iu.test(message.text())) state.csp.push(message.text()); });
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { window.cspViolations = [...(window.cspViolations || []), event.violatedDirective]; }));
  return { context, page, state };
}
// Layout and accessibility measurements for the visible loan block.
const measure = page => page.evaluate(() => {
  const block = document.querySelector('#loan-questions');
  const visible = el => el.checkVisibility();
  const texts = [...block.querySelectorAll('*')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  const targets = [...block.querySelectorAll('input, button')].filter(visible).map(el => el.getBoundingClientRect());
  return {
    overflow: document.documentElement.scrollWidth > innerWidth,
    outside: [...block.querySelectorAll('*')].filter(el => visible(el) && el.getBoundingClientRect().right > innerWidth + 0.5).length,
    smallText: texts.filter(el => parseFloat(getComputedStyle(el).fontSize) < 18).map(el => el.textContent.slice(0, 30)),
    smallTargets: targets.filter(rect => rect.width < 48 || rect.height < 48).length,
    targets: targets.length,
  };
});
async function assertActionFirst(page) {
  assert.ok(await page.evaluate(() => {
    const action = document.querySelector('#primary-action'), summary = document.querySelector('#summary');
    return Boolean(action.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      action.getBoundingClientRect().top < summary.getBoundingClientRect().top;
  }), 'loan safe action precedes assessment in visual and reading order');
}

try {
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [1440, 900]]) {
    const { context, page, state } = await open(width, height);
    await page.goto(base);
    await page.waitForFunction(() => !document.querySelector('#submit').disabled);
    const entry = page.locator('#loan-entry');
    assert.ok(await entry.isVisible());
    assert.equal(await page.locator('#loan-questions').count(), 0, 'questions load only on request');
    assert.ok(!state.requests.some(url => /\/loan\.(js|css)$/.test(url)), 'no loan assets in the first view');
    // Primary button position is unchanged: the entry sits below it.
    const [cta, entryBox] = [await page.locator('#submit').boundingBox(), await entry.boundingBox()];
    assert.ok(entryBox.y > cta.y + cta.height);
    await entry.click();
    await page.locator('#loan-questions').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'content');
    assert.equal(await page.locator('#submit-label').textContent(), 'Prověřit nabídku');
    assert.ok(await entry.isHidden());
    const m = await measure(page);
    assert.equal(m.overflow, false, `${width}: horizontal overflow`);
    assert.equal(m.outside, 0, `${width}: element outside viewport`);
    assert.deepEqual(m.smallText, [], `${width}: text below 18 px`);
    assert.equal(m.smallTargets, 0, `${width}: ${m.smallTargets}/${m.targets} targets below 48 px`);
    await page.locator('#loan-questions').screenshot({ path: `${out}/loan-questions-${width}.png` });

    // Exclusive answers: "Nic z toho" clears specific requests and vice versa.
    const option = label => page.locator('#loan-questions label', { hasText: label }).locator('input');
    await option('Kód z SMS').check();
    await option('Číslo nebo jiné údaje z platební karty').check();
    await option('Nic z toho').check();
    assert.deepEqual(await page.locator('#loan-questions input[name="requests"]:checked').evaluateAll(list => list.map(i => i.value)), ['none']);
    await option('Kód z SMS').check();
    assert.deepEqual(await page.locator('#loan-questions input[name="requests"]:checked').evaluateAll(list => list.map(i => i.value)), ['sms_code']);
    // Keyboard: the radio group is reachable and operable without a mouse.
    await option('Ano').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('input[name="advance_payment"]:checked').getAttribute('value'), 'yes');
    assert.equal(await page.evaluate(() => document.activeElement.closest('label').querySelector('span').textContent), 'Ano');
    const focusOutline = await page.evaluate(() => getComputedStyle(document.activeElement.nextElementSibling).outlineStyle);
    assert.notEqual(focusOutline, 'none', 'visible keyboard focus');

    await page.locator('#content').fill(SCAM);
    await page.locator('#submit').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    const body = JSON.parse(state.bodies.at(-1));
    assert.deepEqual(Object.keys(body).sort(), ['ai_consent', 'content', 'loan_context', 'topic', 'type']);
    assert.deepEqual(body.loan_context, { advance_payment: 'yes', requests: ['sms_code'] });
    assert.equal(body.topic, 'loan');
    const resultText = await page.locator('#result').textContent();
    assert.match(resultText, /Platba předem před získáním půjčky/);
    assert.match(resultText, /Žádost o kód z SMS/);
    assert.match(await page.locator('#primary-action').textContent(), /^Nic předem neplaťte\./);
    await assertActionFirst(page);
    assert.match(await page.locator('#verification').textContent(), /Poskytovatele si ověřte nezávisle\./);
    assert.match(await page.locator('#technical').textContent(), /Registr ČNB jsme neprohledávali\./);
    assert.ok(await page.locator('#loan-followup').isHidden(), 'no follow-up after answers were given');
    assert.doesNotMatch(resultText, /skór|score|\/\s*100|je to bezpečné|určitě podvod/iu);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#result').screenshot({ path: `${out}/loan-result-${width}.png` });

    // Back to an ordinary message: no loan fields are sent.
    await page.locator('#next-check').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'content');
    assert.equal(await page.evaluate(() => { const field = document.querySelector('#content'); return field.selectionEnd - field.selectionStart; }), SCAM.length);
    assert.equal(await page.locator('#loan-questions input:checked').count(), 0, 'next check clears every answer');
    assert.ok(await page.locator('#loan-questions').isHidden());
    await page.locator('#content').fill('Ahoj, zítra se uvidíme.');
    await page.locator('#submit').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.deepEqual(Object.keys(JSON.parse(state.bodies.at(-1))).sort(), ['ai_consent', 'content', 'type']);
    assert.doesNotMatch(await page.locator('#signals').textContent(), /Platba předem|kód z SMS/);
    // Leaving and reopening never restores checked answers, including keys
    // used to navigate the native controls. The original content stays intact.
    await entry.click();
    assert.equal(await page.locator('#loan-questions input:checked').count(), 0);
    await option('Ano').check(); await option('Kód z SMS').check();
    await page.locator('#content').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Prověřit jinou zprávu' }).click();
    assert.ok(await page.locator('#loan-questions').isHidden());
    assert.ok(await entry.isVisible());
    assert.equal(await page.locator('#submit-label').textContent(), 'Prověřit zprávu');
    await entry.click();
    assert.equal(await page.locator('#loan-questions input:checked').count(), 0, 'exit/reopen clears answers');
    assert.equal(await page.locator('#content').inputValue(), 'Ahoj, zítra se uvidíme.');
    await page.getByRole('button', { name: 'Prověřit jinou zprávu' }).click();
    await page.locator('#content').fill('Ahoj, zítra se uvidíme.');
    await page.locator('#submit').click();
    await page.waitForFunction(count => document.querySelector('#status').textContent === 'Kontrola je dokončena.' && count, state.bodies.length);
    await page.waitForTimeout(50);
    assert.deepEqual(Object.keys(JSON.parse(state.bodies.at(-1))).sort(), ['ai_consent', 'content', 'type']);

    assert.deepEqual(state.errors, []); assert.deepEqual(state.csp, []);
    assert.deepEqual(await page.evaluate(() => window.cspViolations || []), []);
    assert.ok(state.requests.every(url => url.startsWith(base)), 'no external requests');
    await context.close();
    console.log(`Loan browser: PASS (${width}x${height}: lazy load, no overflow, text >= 18 px, ${m.targets} targets >= 48 px, keyboard, exclusive answers, enum-only request, result, exit)`);
  }

  // A loan text in the ordinary flow offers the questions afterwards.
  {
    const { context, page, state } = await open(360, 640);
    await page.goto(base);
    await page.waitForFunction(() => !document.querySelector('#submit').disabled);
    await page.locator('#content').fill(BENIGN);
    await page.locator('#submit').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.match(await page.locator('#summary').textContent(), /nelze poznat, zda je nabídka v pořádku/);
    assert.ok(await page.locator('#loan-followup').isVisible());
    await page.locator('#loan-followup-open').click();
    await page.locator('#loan-questions').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'loan-mode-title');
    assert.equal(await page.locator('#content').inputValue(), BENIGN, 'pasted text is kept');
    await page.screenshot({ path: `${out}/loan-followup-360.png` });
    assert.deepEqual(state.errors, []);
    await context.close();
    console.log('Loan browser: PASS (follow-up offered for a loan result without answers; focus moves to the questions; text kept)');
  }

  // N-3: the real UTF-8 limit rejects this input. Correcting that same loan
  // keeps answers; success, explicit new examples and leaving still reset them.
  for (const width of [320, 360, 390]) {
    const { context, page, state } = await open(width, 640);
    await page.goto(base);
    await page.waitForFunction(() => !document.querySelector('#submit').disabled);
    const tooLong = 'Půjčka: ' + 'é'.repeat(8000);
    const answers = { advance_payment: 'yes', requests: ['sms_code'] };
    async function rejectLoan() {
      await page.locator('#loan-entry').click();
      await page.locator('#loan-questions').waitFor({ state: 'visible' });
      await page.locator('input[name="advance_payment"][value="yes"]').check();
      await page.locator('input[name="requests"][value="sms_code"]').check();
      await page.locator('#content').fill(tooLong);
      const rejected = page.waitForResponse(response => response.url().endsWith('/api/analyze'));
      await page.locator('#submit').click();
      const response = await rejected;
      assert.equal(response.status(), 400); assert.equal((await response.json()).code, 'AI_INPUT_LIMIT');
      await page.waitForFunction(() => document.querySelector('#analysis-form').getAttribute('aria-busy') === 'false');
      assert.match(await page.locator('#error-message').textContent(), /Odpovědi k této nabídce zůstávají vybrané/);
    }
    await rejectLoan();
    await page.locator('#edit-content').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'content');
    // Blank content passes native "required" but is still rejected by the
    // backend; another validation error remains part of this correction.
    await page.locator('#content').fill(' ');
    const invalid = page.waitForResponse(response => response.url().endsWith('/api/analyze'));
    await page.locator('#submit').click();
    assert.equal((await (await invalid).json()).code, 'INVALID_INPUT');
    await page.waitForFunction(() => document.querySelector('#analysis-form').getAttribute('aria-busy') === 'false');
    const corrected = 'Půjčka: ' + 'é'.repeat(100);
    if (width === 360) await page.evaluate(value => { document.querySelector('#content').value = value; }, corrected);
    else await page.locator('#content').fill(corrected);
    assert.ok(await page.locator('#loan-questions').isVisible());
    assert.equal(await page.locator('#loan-questions input:checked').count(), 2);
    assert.equal(await page.locator('#submit-label').textContent(), 'Prověřit nabídku');
    const response = page.waitForResponse(response => response.url().endsWith('/api/analyze'));
    await page.locator('#submit').click();
    assert.equal((await response).status(), 200);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.deepEqual(JSON.parse(state.bodies.at(-1)).loan_context, answers);
    assert.equal(JSON.parse(state.bodies.at(-1)).content, corrected);
    assert.match(await page.locator('#signals').textContent(), /Platba předem/);
    assert.match(await page.locator('#signals').textContent(), /kód z SMS/);
    await assertActionFirst(page);
    // Completion ends correction intent: changed content is a new ordinary check.
    await page.locator('#content').fill('Ahoj, zítra se uvidíme.');
    assert.ok(await page.locator('#loan-questions').isHidden());
    assert.equal(await page.locator('#loan-questions input:checked').count(), 0);
    await page.locator('#submit').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.deepEqual(Object.keys(JSON.parse(state.bodies.at(-1))).sort(), ['ai_consent', 'content', 'type']);
    assert.doesNotMatch(await page.locator('#signals').textContent(), /Platba předem|kód z SMS/);
    // An example is explicit new-analysis intent even while a rejected loan is being corrected.
    await rejectLoan();
    await page.locator('[data-example="normal"]').click();
    assert.ok(await page.locator('#loan-questions').isHidden());
    assert.equal(await page.locator('#loan-questions input:checked').count(), 0);
    await page.locator('#submit').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.deepEqual(Object.keys(JSON.parse(state.bodies.at(-1))).sort(), ['ai_consent', 'content', 'type']);
    // Explicit leave/reopen also clears rejected-input correction and old answers.
    await rejectLoan();
    await page.getByRole('button', { name: 'Prověřit jinou zprávu' }).click();
    assert.ok(await page.locator('#error-panel').isHidden());
    await page.locator('#loan-entry').click();
    assert.equal(await page.locator('#loan-questions input:checked').count(), 0);
    assert.deepEqual(state.errors, []); assert.deepEqual(state.csp, []);
    assert.ok(state.requests.every(url => url.startsWith(base)));
    await context.close();
    console.log(`Loan N-3 browser: PASS (${width}px: real AI_INPUT_LIMIT, same-analysis correction, validation retry, fresh analysis/example, exit/reopen)`);
  }

  // Direct link opens the loan flow; without JavaScript there is no entry at all.
  {
    const { context, page } = await open(390, 844);
    await page.goto(base + '/#pujcka');
    await page.locator('#loan-questions').waitFor({ state: 'visible' });
    await context.close();
    const nojs = await open(390, 844, { javaScriptEnabled: false });
    await nojs.page.goto(base);
    assert.ok(await nojs.page.locator('#loan-entry').isHidden());
    assert.equal(await nojs.page.locator('#loan-questions').count(), 0);
    await nojs.context.close();
    console.log('Loan browser: PASS (#pujcka opens the flow; no-JS shows no loan entry and sends nothing)');
  }
  // Failed module load: an honest error, no half-built form.
  {
    const { context, page } = await open(390, 844);
    await page.route('**/loan.js', route => route.abort());
    await page.goto(base);
    await page.waitForFunction(() => !document.querySelector('#submit').disabled);
    await page.locator('#loan-entry').click();
    await page.locator('#error-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#loan-questions').count(), 0);
    assert.match(await page.locator('#error-safety').textContent(), /Neznamená to, že je zpráva bezpečná\./);
    await context.close();
    console.log('Loan browser: PASS (module load failure shows the existing network error; no questions, no request)');
  }
  console.log('Loan browser: PASS');
} finally {
  await browser.close();
  server.close();
}
