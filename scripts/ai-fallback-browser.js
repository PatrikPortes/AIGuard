// Optional browser regression for the explicitly labelled AI rules fallback.
// Needs Playwright installed OUTSIDE this project:
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> [AI_BROWSER_OUTPUT=<dir>] node scripts/ai-fallback-browser.js
// Uses real AnalysisPipeline instances wherever the backend already implements
// the behaviour (src/ai/pipeline.js). Only the state that still needs the
// backend handoff (unconfigured AI answering without AI consent) is mocked, with
// exactly the documented fields: ai_status, ai_fallback_reason and the fixed
// uncertainty line. No provider is contacted.
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { BoundedQueue } from '../src/ai/queue.js';
import { ServiceError } from '../src/ai/errors.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.AI_BROWSER_OUTPUT || '/tmp';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const SCAM = 'Mami, mám nové číslo a rozbitý telefon. Pošli mi ihned 12 000 Kč na nový účet. Nevolej mi.';
const LIMIT = 'AI kontrola nebyla dokončena. Tento výsledek používá pouze pravidla; nejde o potvrzení bezpečnosti.';
const NOT_SENT = 'Text jsme poskytovateli AI neposílali.';
const MAYBE_SENT = 'Text zprávy mohl být s vaším souhlasem odeslán poskytovateli AI.';
const limits = { rateLimit: 1000, sessionRateLimit: 1000, sessionIssueRateLimit: 1000, staticRateLimit: 10000, staticBytesPerMinute: 1e9 };

async function serve(pipeline) {
  const server = createServer({ pipeline, ...limits });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); pipeline.close(); }) };
}
async function open(base, width = 360, { session, analyze } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 640 } });
  const state = { bodies: [], errors: [], external: [] };
  page.on('pageerror', error => state.errors.push(String(error)));
  page.on('request', request => {
    if (!request.url().startsWith(base)) state.external.push(request.url());
    if (request.url().endsWith('/api/analyze')) state.bodies.push(request.postDataJSON());
  });
  if (session) await page.route('**/api/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }));
  if (analyze) await page.route('**/api/analyze', analyze);
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#engine-notice').textContent !== 'Zjišťujeme dostupnost analýzy. Screenshoty a PDF připravujeme.');
  return { page, state };
}
async function submit(page, text = SCAM) {
  await page.locator('#content').fill(text);
  await page.locator('#submit').click();
  await page.waitForFunction(() => document.querySelector('#analysis-form').getAttribute('aria-busy') === 'false');
}
const layout = page => page.evaluate(() => {
  const texts = [...document.querySelectorAll('#result *')].filter(el => el.checkVisibility() && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  return { overflow: document.documentElement.scrollWidth > innerWidth, small: texts.filter(el => parseFloat(getComputedStyle(el).fontSize) < 18).length };
});
const actionFirst = page => page.evaluate(() => ['#primary-action', '#summary', '#engine-note', '#signals']
  .map(selector => document.querySelector(selector).getBoundingClientRect().top));

const rules = await serve(new AnalysisPipeline());
// Unconfigured AI with fallback, exactly as runtime.js builds it today.
const unconfigured = await serve(new AnalysisPipeline({ mode: 'ai', unavailableCode: 'AI_INVALID_CONFIG', fallbackToRules: true }));
// Configured AI whose worker fails at runtime: a real backend fallback response.
const failing = await serve(new AnalysisPipeline({ mode: 'ai', fallbackToRules: true, queue: new BoundedQueue({}),
  worker: { run: async () => { throw new ServiceError('AI_TIMEOUT'); } } }));
try {
  // 1. Unconfigured AI + fallback, after the backend handoff: usable, no consent,
  //    explicit note saying the text was not sent (no consent was given).
  const handoffSession = { mode: 'ai', ai_configured: false, engine: 'rules+ai-v1', timeout_ms: 10000, provider_label: 'OpenAI', rules_fallback: true };
  const handoffAnalyze = async route => {
    assert.equal(route.request().postDataJSON().ai_consent, false);
    const response = await route.fetch();            // the real rules result (rules server)
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, ai_status: 'not_performed', ai_fallback_reason: 'not_configured', uncertainties: [...data.uncertainties, LIMIT] } });
  };
  for (const width of [320, 360, 390]) {
    const { page, state } = await open(rules.base, width, { session: handoffSession, analyze: handoffAnalyze });
    assert.equal(await page.locator('#submit').isDisabled(), false);
    assert.ok(await page.locator('#ai-consent').isHidden(), 'no AI consent without a configured provider');
    assert.equal(await page.locator('#engine-notice').textContent(), 'Kontrola s AI teď není k dispozici. Zprávu prověříme jen podle našich pravidel a text poskytovateli AI neposíláme. Výsledek je orientační. Odkazy neotevíráme.');
    assert.doesNotMatch(await page.locator('#engine-notice').textContent(), /OpenAI/);
    await submit(page);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.equal(state.bodies.at(-1).ai_consent, false, 'consent is never claimed');
    assert.equal(await page.locator('#engine-note').textContent(), `Kontrola s AI teď není k dispozici. Tento výsledek vychází jen z našich pevných pravidel. ${NOT_SENT}`);
    const top = await actionFirst(page);
    assert.deepEqual(top, [...top].sort((a, b) => a - b), 'action → takeaway → fallback note → signals');
    assert.ok(await page.locator('#ai-card').isHidden());
    assert.ok((await page.locator('#uncertainties').textContent()).includes(LIMIT));
    assert.match(await page.locator('#technical').textContent(), /Použita pouze pravidla, bez AI\./);
    assert.doesNotMatch(await page.locator('#result').innerText(), /OpenAI|not_configured|ai_status|AI_[A-Z]/);
    const m = await layout(page);
    assert.equal(m.overflow, false); assert.equal(m.small, 0);
    assert.deepEqual(state.errors, []); assert.deepEqual(state.external, []);
    if (width === 360) await page.locator('#result').screenshot({ path: `${out}/fallback-unconfigured-360.png` });
    await page.close();
  }
  console.log('AI fallback browser: PASS (unconfigured + fallback after handoff: usable, no consent, ai_consent=false, labelled "not sent", action first, 320/360/390)');

  // 2. The same state against the REAL current backend: it still demands AI
  //    consent. The frontend fakes nothing and shows no consent dead end.
  {
    const { page, state } = await open(unconfigured.base);
    const session = await page.evaluate(() => fetch('/api/session').then(r => r.json()));
    assert.equal(session.rules_fallback, true); assert.equal(session.ai_configured, false);
    assert.equal(await page.locator('#submit').isDisabled(), false);
    assert.ok(await page.locator('#ai-consent').isHidden());
    await submit(page);
    await page.locator('#error-panel').waitFor({ state: 'visible' });
    assert.equal(state.bodies.at(-1).ai_consent, false);
    assert.equal(await page.locator('#error-title').textContent(), 'Prověřování je dočasně nedostupné.');
    assert.doesNotMatch(await page.locator('#error-panel').innerText(), /souhlas|AI_CONSENT/iu);
    assert.ok(await page.locator('#error-guidance').isVisible());
    assert.ok(await page.locator('#result').isHidden());
    await page.close();
    console.log('AI fallback browser: PASS (real current backend still requires consent: no fake consent, no dead end, guidance shown — backend handoff needed)');
  }

  // 3. Unconfigured AI WITHOUT fallback support (older backend): stays disabled.
  for (const rules_fallback of [undefined, 'true', 1]) {
    const session = { mode: 'ai', ai_configured: false, engine: 'rules+ai-v1', timeout_ms: 20000, provider_label: 'OpenAI', ...(rules_fallback !== undefined && { rules_fallback }) };
    const { page, state } = await open(rules.base, 360, { session });
    assert.ok(await page.locator('#submit').isDisabled(), `disabled for rules_fallback=${JSON.stringify(rules_fallback)}`);
    assert.ok(await page.locator('#ai-consent').isHidden());
    assert.equal(await page.locator('#engine-notice').textContent(), 'AI ověření zatím není dostupné. Zkuste to později.');
    await page.locator('#content').fill(SCAM); await page.keyboard.press('Control+Enter');
    assert.equal(state.bodies.length, 0);
    await page.close();
  }
  console.log('AI fallback browser: PASS (no or non-boolean rules_fallback: submission stays disabled, nothing sent)');

  // 4. Runtime AI failure on the REAL backend: consent was required and given,
  //    so the note must not claim the text was not sent.
  {
    const { page, state } = await open(failing.base);
    assert.ok(await page.locator('#ai-consent').isVisible());
    await page.locator('#content').fill(SCAM);
    await page.locator('#submit').click();                                   // 5. consent is required
    await page.locator('#error-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#error-title').textContent(), 'Chybí váš souhlas.');
    assert.equal(state.bodies.length, 0, 'nothing sent without consent');
    await page.locator('#consent').check();
    await submit(page);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.equal(state.bodies.at(-1).ai_consent, true);
    const note = await page.locator('#engine-note').textContent();
    assert.equal(note, `Kontrola s AI nestihla doběhnout včas. Tento výsledek vychází jen z našich pevných pravidel. ${MAYBE_SENT}`);
    assert.ok(!note.includes(NOT_SENT), 'never claims non-transmission after consent');
    assert.ok(await page.locator('#error-panel').isHidden(), 'a labelled fallback is a result, not an error');
    assert.ok((await page.locator('#uncertainties').textContent()).includes(LIMIT));
    const top = await actionFirst(page);
    assert.deepEqual(top, [...top].sort((a, b) => a - b));
    await page.locator('#result').screenshot({ path: `${out}/fallback-runtime-360.png` });
    await page.close();
    console.log('AI fallback browser: PASS (real runtime failure: consent required first, labelled fallback, cautious "mohl být odeslán")');
  }

  // 6. Explicit marker only; every documented reason has plain Czech copy.
  const reasons = {
    timeout: 'Kontrola s AI nestihla doběhnout včas.', overloaded: 'Kontrola s AI byla právě přetížená.',
    budget_exhausted: 'Kapacita kontroly s AI je teď vyčerpaná.', budget_unavailable: 'Kontrola s AI teď není k dispozici.',
    not_configured: 'Kontrola s AI teď není k dispozici.', invalid_response: 'Odpověď AI nebyla dost spolehlivá, proto ji nepoužíváme.',
    input_limit: 'Zpráva je pro kontrolu s AI příliš dlouhá.', text_only: 'U samotného odkazu kontrolu s AI neděláme.',
    provider_unavailable: 'Kontrola s AI se tentokrát nepodařila.', some_future_reason: 'Kontrola s AI se tentokrát nepodařila.',
  };
  const aiSession = { mode: 'ai', ai_configured: true, engine: 'rules+ai-v1', timeout_ms: 10000, provider_label: 'OpenAI', rules_fallback: true };
  for (const [reason, copy] of Object.entries(reasons)) {
    const { page } = await open(rules.base, 360, { session: aiSession, analyze: async route => {
      const response = await route.fetch(); const data = await response.json();
      await route.fulfill({ response, json: { ...data, ai_status: 'not_performed', ai_fallback_reason: reason } });
    } });
    await page.locator('#consent').check(); await submit(page);
    assert.equal(await page.locator('#engine-note').textContent(), `${copy} Tento výsledek vychází jen z našich pevných pravidel. ${MAYBE_SENT}`, reason);
    await page.close();
  }
  for (const marker of [{}, { ai_status: 'performed' }, { ai_status: 'NOT_PERFORMED' }]) {
    const { page } = await open(rules.base, 360, { session: aiSession, analyze: async route => {
      const response = await route.fetch(); await route.fulfill({ response, json: { ...(await response.json()), ...marker } });
    } });
    await page.locator('#consent').check(); await submit(page);
    assert.ok(await page.locator('#engine-note').isHidden(), `no note for ${JSON.stringify(marker)}`);
    await page.close();
  }
  console.log(`AI fallback browser: PASS (explicit ai_status marker only; ${Object.keys(reasons).length} reasons in plain Czech, no codes)`);

  // 7. Privacy page describes the labelled fallback and the consent rule.
  {
    const { page } = await open(rules.base);
    await page.goto(rules.base + '/privacy');
    const text = await page.locator('main').innerText();
    assert.match(text, /výsledek jen podle našich pravidel a jasně ho tak označíme; bez vašeho souhlasu text poskytovateli AI neposíláme\./);
    assert.match(text, /Když nelze zprávu prověřit vůbec, ukážeme jen obecné bezpečné kroky\./);
    await page.close();
    console.log('AI fallback browser: PASS (privacy wording)');
  }

  // 8. Rules-only mode: unchanged — no consent, no note, ai_consent false.
  {
    const { page, state } = await open(rules.base);
    assert.ok(await page.locator('#ai-consent').isHidden());
    assert.equal(await page.locator('#submit').isDisabled(), false);
    await submit(page);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.equal(state.bodies.at(-1).ai_consent, false);
    assert.ok(await page.locator('#engine-note').isHidden());
    assert.ok(await page.locator('#ai-card').isHidden());
    await page.close();
    console.log('AI fallback browser: PASS (rules-only mode unchanged)');
  }
  console.log('AI fallback browser: PASS');
} finally {
  await Promise.all([rules.close(), unconfigured.close(), failing.close()]);
  await browser.close();
}
