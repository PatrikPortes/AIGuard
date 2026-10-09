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
async function assertScoreFreeResult(page, name) {
  assert.equal(await page.locator('#result-title').textContent(), 'Co jsme zjistili', name);
  assert.equal(await page.locator('#risk, #risk-level, #risk-number, #risk-scale, .risk-circle, #result[data-level], #result [data-level]').count(), 0, name);
  // Include collapsed details: they are still reachable user-facing copy.
  assert.doesNotMatch(await page.locator('#result').textContent(), /skór|score|\b0\s*[–-]\s*100\b|\/\s*100/iu, name);
}
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
      ['.hero-verka', 'verka-welcome', 'Věrka, vaše průvodkyně, vás s úsměvem vítá'],
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
    assert.equal(await page.getByLabel('Typ obsahu').count(),0);
    assert.equal(await page.locator('#input-type, #analysis-form select').count(),0);
    assert.equal(await page.locator('#content').getAttribute('name'),null);
    assert.equal(await page.locator('#content').getAttribute('spellcheck'),'false');
    assert.equal(await page.locator('#content').getAttribute('autocomplete'),'off');
    await page.screenshot({path:`${process.env.VERIM_BROWSER_OUTPUT || '/tmp'}/verim-remediation-${width}.png`,fullPage:true});
  }
  await page.locator('#content').fill('<img src=x onerror=alert(1)>');
  await page.locator('#submit').click(); await page.locator('#result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#summary img').count(), 0);
  assert.equal(await page.locator('#result-title').textContent(), 'Co jsme zjistili');
  assert.ok(await page.locator('#uncertainties').isVisible());
  assert.ok((await page.locator('#uncertainties li').count()) > 0);
  assert.equal(await page.locator('#signals').textContent(), 'Známé signály jsme nenašli. Podvod tím není vyloučen.');
  assert.equal(await page.locator('.result-heading img').getAttribute('src'), characterAssets['verka-explaining']);
  assert.equal(await page.locator('#signals-character').getAttribute('src'), characterAssets['robo-default']);
  await assertScoreFreeResult(page, 'no-signal result');
  assert.ok((await page.locator('#uncertainties').textContent()).includes('To, že jsme nenašli jasné varovné znaky, neznamená, že je zpráva bezpečná.'));
  await page.locator('#content').fill('https://banka-prihlaseni.invalid');
  const urlResponsePromise = page.waitForResponse(response => response.url() === base + '/api/analyze' && response.request().method() === 'POST');
  await page.locator('#submit').click();
  const urlResponse = await urlResponsePromise;
  assert.equal(urlResponse.status(),200);
  assert.deepEqual(urlResponse.request().postDataJSON(), { type: 'url', content: 'https://banka-prihlaseni.invalid', ai_consent: false });
  await page.waitForFunction(() => document.querySelector('#summary').textContent.includes('Stránku jsme nenavštívili'));
  assert.equal(await page.locator('#result-title').textContent(), 'Co jsme zjistili');
  assert.ok(await page.locator('#uncertainties').isVisible());
  assert.ok((await page.locator('#verification li').count()) > 0);
  assert.equal(await page.locator('#risk-level, #risk-number, #risk-scale, .risk-circle').count(), 0);
  assert.equal(await page.locator('#result a[href]').count(),0);
  await assertScoreFreeResult(page, 'URL result');
  // Exercise the actual form, fetch and backend, not a copy of classifyInput().
  // Each case gets an isolated server with unchanged default security limits.
  const routingCases = [
    ['Czech prose', 'Ahoj, zítra se potkáme u knihovny.', 'text'],
    ['HTTPS', 'https://banka-prihlaseni.invalid', 'url'],
    ['HTTP', 'http://priklad.invalid/cesta', 'url'],
    ['surrounding whitespace', '  \thttps://priklad.invalid/cesta  ', 'url'],
    ['prose with URL', 'Podívejte se na https://priklad.invalid/cesta prosím.', 'text'],
    ['multiple URLs', 'https://priklad.invalid https://druhy.invalid', 'text'],
    ['javascript scheme', 'javascript:window.xssExecuted=true', 'text'],
    ['data scheme', 'data:text/html,<script>window.xssExecuted=true</script>', 'text'],
    ['file scheme', 'file:///etc/passwd', 'text'],
    ['FTP scheme', 'ftp://priklad.invalid/soubor', 'text'],
    ['synthetic URL credentials', 'https://synthetic-user:synthetic-password@priklad.invalid', 'text'],
    ['encoded synthetic credentials', 'https://synthetic%2Duser:synthetic%2Dpassword@priklad.invalid', 'text'],
    ['uppercase scheme', 'HTTPS://PRIKLAD.INVALID/cesta', 'url'],
    ['IPv6 literal', 'https://[2001:db8::1]/', 'url'],
    ['malformed URL', 'https://[not-an-ip]/', 'text'],
    ['bare domain', 'priklad.invalid', 'text'],
    ['encoded path', 'https://priklad.invalid/a%20b?test=synthetic#fragment', 'url'],
    ['URL parser backslash', 'https://priklad.invalid\\cesta', 'url'],
    ['incomplete HTTPS', 'https://', 'text'],
  ];
  for (const [name, content, type] of routingCases) {
    const caseServer = createServer({ pipeline: new AnalysisPipeline() });
    await new Promise(resolve => caseServer.listen(0,'127.0.0.1',resolve));
    const context = await browser.newContext();
    try {
      const routed = await context.newPage();
      const origin = `http://127.0.0.1:${caseServer.address().port}`;
      const requests = [], navigations = [], caseErrors = [];
      routed.on('request', request => requests.push({ url: request.url(), referrer: request.headers().referer || '' }));
      routed.on('framenavigated', frame => { if (frame === routed.mainFrame()) navigations.push(frame.url()); });
      routed.on('pageerror', failure => caseErrors.push(failure.name));
      await routed.goto(origin);
      await routed.waitForFunction(() => !document.querySelector('#submit').disabled);
      const before = await routed.evaluate(() => ({ history: history.length, local: { ...localStorage }, session: { ...sessionStorage } }));
      await routed.getByLabel('Obsah k ověření').fill(content);
      const responsePromise = routed.waitForResponse(response => response.url() === origin + '/api/analyze' && response.request().method() === 'POST');
      // Keyboard submission also proves the remaining labelled input is usable.
      await routed.locator('#submit').focus();
      await routed.keyboard.press('Enter');
      const response = await responsePromise;
      assert.equal(response.status(),200,name);
      assert.equal(response.request().headers()['content-type'],'application/json',name);
      assert.deepEqual(response.request().postDataJSON(),{ type, content, ai_consent: false },name);
      const data = await response.json();
      assert.equal(data.input_type,type,name);
      assert.equal(data.engine,'rules-v1',name);
      await routed.locator('#result').waitFor({ state: 'visible' });
      assert.equal(await routed.locator('#content').inputValue(),content,name);
      assert.equal(await routed.locator('#result a[href], #result script, #result iframe').count(),0,name);
      assert.equal(await routed.evaluate(() => window.xssExecuted),undefined,name);
      assert.equal(await routed.locator('#result').evaluate(element => element === document.activeElement),true,name);
      assert.equal(routed.url(),origin + '/',name);
      assert.deepEqual(navigations,[origin + '/'],name);
      assert.ok(requests.every(request => new URL(request.url).origin === origin && !request.url.includes(content) && !request.referrer.includes(content)),name);
      assert.deepEqual(await routed.evaluate(() => ({ history: history.length, local: { ...localStorage }, session: { ...sessionStorage } })),before,name);
      assert.deepEqual(caseErrors,[],name);
      await assertScoreFreeResult(routed, name);
      if (type === 'url') {
        assert.equal(await routed.locator('#result-title').textContent(),'Co jsme zjistili',name);
        assert.ok(await routed.locator('#uncertainties').isVisible(),name);
        assert.ok((await routed.locator('#uncertainties').textContent()).includes('Stránku jsme nenavštívili'),name);
        assert.ok((await routed.locator('#verification li').count()) > 0,name);
        assert.equal(await routed.locator('#risk-level, #risk-number, #risk-scale, .risk-circle').count(),0,name);
      }
      // Bypassing frontend routing must not bypass backend validation.
      if (name === 'incomplete HTTPS') {
        for (const invalid of [
          { type: 'url', content: 'javascript:alert(1)' },
          { type: 'url', content: 'https://synthetic-user:synthetic-password@priklad.invalid' },
          { type: 'url', content: 'https://[not-an-ip]/' },
          { type: 'image', content: 'synthetic' },
          { type: 'text', content: '' },
          { type: 'text', content: 'a'.repeat(10001) },
          { type: 'text', content: 'é'.repeat(8001) },
        ]) {
          const rejected = await context.request.post(origin + '/api/analyze', { data: invalid, headers: { Origin: origin } });
          assert.equal(rejected.status(),400);
          assert.ok(['INVALID_INPUT','AI_INPUT_LIMIT'].includes((await rejected.json()).code));
        }
      }
      console.log(`Routing: PASS (${name} -> ${type}; real API, no navigation/external requests/persistence/clickable result links)`);
    } finally {
      await context.close();
      await new Promise(resolve => { caseServer.close(resolve); caseServer.closeAllConnections(); });
    }
  }
  // Result-only remediation: keep the real rules backend and default limits.
  // Intercept responses to exercise omissions without enabling AI or changing
  // the API contract. Invalid types must fail, not fabricate safety guidance.
  const safetyCases = [
    ['empty uncertainties', data => { data.uncertainties = []; }, 'uncertainty'],
    ['missing uncertainties', data => { delete data.uncertainties; }, 'uncertainty'],
    ['empty verification', data => { data.verification_steps = []; }, 'verification'],
    ['missing verification', data => { delete data.verification_steps; }, 'verification'],
    ['both empty', data => { data.uncertainties = []; data.verification_steps = []; }, 'both'],
    ['both missing', data => { delete data.uncertainties; delete data.verification_steps; }, 'both'],
    ['malformed uncertainties', data => { data.uncertainties = 'invalid'; }, 'error'],
    ['malformed verification', data => { data.verification_steps = null; }, 'error'],
    ['legacy uncertainty templates', data => { data.uncertainties = [
      'Jde o odhad rizika, nikoli důkaz, že jde o podvod. Nízké skóre nepotvrzuje bezpečnost.',
      'URL jsme pouze rozebrali. Stránku jsme nenavštívili a její bezpečnost nelze tímto skóre určit.',
      'Skóre je vyšší z odhadu AI a pravidel. Nejde o kalibrovanou pravděpodobnost.',
    ]; }, 'copy'],
    ['score zero', data => { data.risk_score = 0; data.risk_level = 'unassessed'; }, 'score'],
    ['score hundred', data => { data.risk_score = 100; data.risk_level = 'very_high'; }, 'score'],
  ];
  const scorePresentations = [];
  for (const [name, mutate, expected] of safetyCases) {
    const caseServer = createServer({ pipeline: new AnalysisPipeline() });
    await new Promise(resolve => caseServer.listen(0, '127.0.0.1', resolve));
    const context = await browser.newContext();
    try {
      const checked = await context.newPage();
      const origin = `http://127.0.0.1:${caseServer.address().port}`;
      const requests = [], caseErrors = [];
      checked.on('request', request => requests.push(request.url()));
      checked.on('pageerror', error => caseErrors.push(error.name));
      await checked.route('**/api/analyze', async route => {
        const response = await route.fetch(); const data = await response.json();
        assert.equal(data.engine, 'rules-v1');
        mutate(data); await route.fulfill({ response, json: data });
      });
      await checked.goto(origin);
      await checked.waitForFunction(() => !document.querySelector('#submit').disabled);
      await checked.locator('#content').fill('Ahoj, zítra se potkáme u knihovny.');
      await checked.locator('#submit').click();
      if (expected === 'error') {
        await checked.locator('#error-panel').waitFor({ state: 'visible' });
        assert.ok(await checked.locator('#result').isHidden(), name);
        assert.equal(await checked.locator('#error-safety').textContent(), 'Výsledek teď nemáme. Neznamená to, že je zpráva bezpečná.', name);
      } else {
        await checked.locator('#result').waitFor({ state: 'visible' });
        await assertScoreFreeResult(checked, name);
        assert.ok(await checked.locator('#uncertainties').isVisible(), name);
        assert.ok((await checked.locator('#uncertainties li').count()) > 0, name);
        assert.ok((await checked.locator('#verification li').count()) > 0, name);
        if (['uncertainty', 'both'].includes(expected)) {
          assert.equal(await checked.locator('#uncertainties').textContent(), 'Nemáme dost informací, abychom vyloučili riziko. To, že jsme nenašli jasné varovné znaky, neznamená, že je zpráva bezpečná.', name);
        }
        if (['verification', 'both'].includes(expected)) {
          assert.equal(await checked.locator('#verification').textContent(), 'Žádost si ověřte jinou cestou. Použijte kontakt, který už znáte, nebo oficiální aplikaci. Nepoužívejte telefon ani odkaz z posuzované zprávy.', name);
        }
        if (expected === 'copy') {
          assert.deepEqual(await checked.locator('#uncertainties li').allTextContents(), [
            'To, že jsme nenašli jasné varovné znaky, neznamená, že je zpráva bezpečná.',
            'Prohlédli jsme pouze znění odkazu. Stránku jsme nenavštívili a nevíme, zda je bezpečná.',
            'AI i pravidla se mohou mýlit. Výsledek není důkazem bezpečnosti ani podvodu.',
          ]);
        }
        if (expected === 'score') scorePresentations.push(await checked.locator('#result').innerHTML());
        assert.equal(await checked.locator('#result a[href], #result script, #result iframe').count(), 0, name);
      }
      assert.ok(requests.every(url => new URL(url).origin === origin), name);
      assert.deepEqual(caseErrors, [], name);
      console.log(`F5a safety: PASS (${name})`);
    } finally {
      await context.close();
      await new Promise(resolve => { caseServer.close(resolve); caseServer.closeAllConnections(); });
    }
  }
  assert.equal(scorePresentations.length, 2);
  assert.equal(scorePresentations[0], scorePresentations[1], 'risk_score/risk_level must not change result text, styling, attributes or characters');
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
  // M9 must be usable without application JavaScript or session/API requests.
  // Never activate the tel link: checking a real emergency call is not a test.
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled });
    try {
      for (const width of [1440, 390, 360, 320]) {
        const guide = await context.newPage();
        await guide.setViewportSize({ width, height: 900 });
        const requests = [], pageErrors = [], cspErrors = [];
        guide.on('request', req => requests.push(req.url()));
        guide.on('pageerror', error => pageErrors.push(error.name));
        guide.on('console', message => {
          if (/Content Security Policy|violates.*directive/iu.test(message.text())) cspErrors.push(message.text());
        });
        await guide.addInitScript(() => {
          window.m9CspViolations = [];
          document.addEventListener('securitypolicyviolation', event => window.m9CspViolations.push(event.violatedDirective));
        });
        const response = await guide.goto(base + '/uz-se-to-stalo');
        assert.equal(response.status(), 200);
        assert.equal(response.headers()['content-type'], 'text/html; charset=utf-8');
        await guide.waitForLoadState('networkidle');
        assert.equal(await guide.locator('h1').textContent(), 'Už se to stalo? Co udělat teď');
        assert.equal(await guide.locator('script, form, input, textarea, select, iframe, img, picture').count(), 0);
        const call = guide.locator('a[href="tel:158"]');
        assert.equal(await call.count(), 1);
        assert.equal(await call.getAttribute('aria-label'), '158 – zavolat Policii ČR');
        assert.ok(await guide.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const summaries = guide.locator('details > summary');
        assert.equal(await summaries.count(), 6);
        for (let i = 0; i < 6; i++) {
          const summary = summaries.nth(i);
          await summary.focus(); await summary.press('Space');
          assert.ok(await summary.evaluate(node => node.parentElement.open));
          assert.ok(await summary.locator('..').locator('ul').isVisible());
          await summary.press('Enter');
          assert.equal(await summary.evaluate(node => node.parentElement.open), false);
        }
        assert.ok(requests.every(url => new URL(url).origin === base));
        assert.ok(requests.every(url => ['/uz-se-to-stalo', '/style.css'].includes(new URL(url).pathname)));
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(cspErrors, []);
        if (javaScriptEnabled) assert.deepEqual(await guide.evaluate(() => window.m9CspViolations), []);
        console.log(`M9 browser: PASS (${width}px, JS ${javaScriptEnabled ? 'on' : 'off'}, native keyboard details, no API/egress/CSP violations; tel not activated)`);
        await guide.close();
      }
    } finally { await context.close(); }
  }
  console.log('Security browser: PASS (text rendering/XSS, rules workflow, 1440/390/320, no overflow, canonical hero, neutral URL/no-signal visuals, no-JS/module-failure privacy, M9 static/no-JS safety)');
} finally {
  await browser.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
