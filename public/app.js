import { characterAssets } from './character-assets.js';
const form = document.querySelector('#analysis-form');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const submit = document.querySelector('#submit');
let analysis;
let mode;
const errorPanel = document.querySelector('#error-panel');
const retry = document.querySelector('#retry');
const operationStatus = document.querySelector('.operation-status');
const NO_RESULT = 'Výsledek teď nemáme. Neznamená to, že je zpráva bezpečná.';
// Maps the backend's existing error codes (src/server.js) and client-side failures
// to plain Czech. "kind" picks the character and the recovery offered:
// input = fix the content, wait = retrying now will not help, retry = may retry now,
// session = renew the anonymous session first, then retry.
const failures = {
  INVALID_INPUT: { kind: 'input', title: 'Tento obsah teď neumíme prověřit.', message: 'Vložte text zprávy do 10 000 znaků nebo samotný odkaz začínající https:// či http://.' },
  AI_INPUT_LIMIT: { kind: 'input', title: 'Obsah je příliš dlouhý.', message: 'Zkraťte ho prosím a zkuste to znovu.' },
  BODY_TOO_LARGE: { kind: 'input', title: 'Obsah je příliš dlouhý.', message: 'Zkraťte ho prosím a zkuste to znovu.' },
  AI_CONSENT_REQUIRED: { kind: 'input', title: 'Chybí váš souhlas.', message: 'Před AI analýzou potvrďte odeslání textu poskytovateli.' },
  RATE_LIMITED: { kind: 'wait', title: 'Teď přijímáme příliš mnoho požadavků.', message: 'Zkuste to prosím později, nejdříve asi za minutu. Vložený obsah zůstává v poli.' },
  AI_OVERLOADED: { kind: 'wait', title: 'Právě prověřujeme mnoho zpráv.', message: 'Zkuste to prosím za chvíli. Vložený obsah zůstává v poli.' },
  AI_CAPACITY_EXHAUSTED: { kind: 'wait', title: 'Prověřování je dočasně nedostupné.', message: 'Zkuste to prosím později. Vložený obsah zůstává v poli.' },
  BOT_CHECK_REQUIRED: { kind: 'wait', title: 'Ochrana služby teď prověření neumožňuje.', message: 'Zkuste to prosím později.' },
  AI_TIMEOUT: { kind: 'retry', title: 'Prověření trvalo příliš dlouho.', message: 'Zkuste to prosím znovu.' },
  REQUEST_TIMEOUT: { kind: 'retry', title: 'Odeslání trvalo příliš dlouho.', message: 'Zkuste to prosím znovu.' },
  SESSION_REQUIRED: { kind: 'session', title: 'Platnost stránky vypršela.', message: 'Zkuste to prosím znovu. Pokud se to bude opakovat, načtěte stránku znovu.' },
  NETWORK: { kind: 'retry', title: 'Nepodařilo se spojit se službou.', message: 'Zkontrolujte připojení k internetu a zkuste to znovu.' },
  CLIENT_TIMEOUT: { kind: 'retry', title: 'Prověření trvalo příliš dlouho.', message: 'Zkuste to prosím znovu.' },
  UNEXPECTED: { kind: 'retry', title: 'Nepodařilo se obsah prověřit.', message: 'Odpověď služby nebyla úplná. Zkuste to prosím znovu.' },
  SERVER: { kind: 'retry', title: 'Nepodařilo se obsah prověřit.', message: 'Služba má teď potíže. Zkuste to prosím znovu, případně později.' },
  SESSION_START: { kind: 'session', title: 'Prověřování se nepodařilo připravit.', message: 'Zkuste to prosím znovu. Pokud se to bude opakovat, načtěte stránku později.' },
};
let lastFailure;
function failureFor(code, httpStatus) {
  if (failures[code]) return code;
  if (httpStatus === 429) return 'RATE_LIMITED';
  return 'SERVER';
}
function showError(code) {
  const failure = failures[code] || failures.SERVER;
  lastFailure = failure;
  const character = document.querySelector('#error-character');
  character.src = failure.kind === 'input' ? characterAssets['verka-warning']
    : failure.kind === 'wait' ? characterAssets['robo-capacity'] : characterAssets['robo-error'];
  document.querySelector('#error-speaker').textContent = failure.kind === 'input' ? 'Věrka · malé upozornění' : 'Robo · systémová informace';
  const parts = ['#error-title', '#error-message', '#error-safety'].map(id => document.querySelector(id));
  parts.forEach(part => { part.textContent = ''; });
  retry.hidden = !['retry', 'session'].includes(failure.kind);
  errorPanel.hidden = false;
  // Fill the alert after it is visible so screen readers announce the new text.
  [failure.title, failure.message, NO_RESULT].forEach((text, index) => { parts[index].textContent = text; });
  // Bring the message into view on small screens without moving keyboard focus.
  errorPanel.scrollIntoView({ block: 'nearest' });
}
function hideError() { errorPanel.hidden = true; lastFailure = undefined; }
submit.disabled = true;
async function initialize() {
  try {
    const response = await fetch('/api/session');
    if (!response.ok) throw new Error('session');
    const runtime = await response.json();
    mode = runtime.mode;
    document.querySelector('#engine-notice').textContent = mode === 'ai'
      ? runtime.ai_configured ? 'Text vyhodnotí pravidla a AI. Výsledek je orientační; odkazy neotevíráme.' : 'AI ověření zatím není dostupné. Zkuste to později.'
      : 'Textový prototyp: používá pouze pravidla, bez AI modelu. Screenshoty a PDF připravujeme.';
    document.querySelector('#consent-label').textContent = `Souhlasím s odesláním vloženého textu poskytovateli ${runtime.provider_label || 'AI'}. Před odesláním odstraním nepotřebné osobní údaje.`;
    document.querySelector('#ai-consent').hidden = mode !== 'ai';
    submit.disabled = mode === 'ai' && !runtime.ai_configured;
    return true;
  } catch {
    mode = undefined; submit.disabled = true; showError('SESSION_START');
    return false;
  }
}
initialize();
const examples = {
  family: 'Mami, mám nové číslo a rozbitý telefon. Pošli mi ihned 12 000 Kč na nový účet. Nevolej mi, nemůžu mluvit.',
  bank: 'Vaše banka: ihned zadejte heslo a potvrzovací kód na https://banka-priklad.invalid, jinak bude účet zablokován.',
  normal: 'Ahoj, zítra se potkáme v deset u knihovny. Těším se na procházku.',
};
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#content').value = examples[button.dataset.example];
  document.querySelector('#content').focus();
}));
// Routing only: chooses the existing API input type, "text" or "url". It is not
// analysis and says nothing about safety; the backend validates every input.
// Temporary until the frontend can read the backend capability report (C1).
// When in doubt the answer is "text": only one standalone http(s) address,
// without login details, counts as "url".
function classifyInput(value) {
  const candidate = value.trim();
  if (!/^https?:\/\/\S+$/i.test(candidate)) return 'text';
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? 'url' : 'text';
  } catch { return 'text'; }
}
function analysisRequest(content) {
  return { type: classifyInput(content), content, ai_consent: mode === 'ai' && document.querySelector('#consent').checked };
}
function list(id, items) {
  const target = document.querySelector(id);
  target.replaceChildren(...items.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
}
// Presentation compatibility for the existing backend templates. Preserve their
// limitations without referring to a score that this UI does not display.
const uncertaintyCopy = new Map([
  ['Jde o odhad rizika, nikoli důkaz, že jde o podvod. Nízké skóre nepotvrzuje bezpečnost.',
    'To, že jsme nenašli jasné varovné znaky, neznamená, že je zpráva bezpečná.'],
  ['URL jsme pouze rozebrali. Stránku jsme nenavštívili a její bezpečnost nelze tímto skóre určit.',
    'Prohlédli jsme pouze znění odkazu. Stránku jsme nenavštívili a nevíme, zda je bezpečná.'],
  ['Skóre je vyšší z odhadu AI a pravidel. Nejde o kalibrovanou pravděpodobnost.',
    'AI i pravidla se mohou mýlit. Výsledek není důkazem bezpečnosti ani podvodu.'],
]);
const missingUncertainty = 'Nemáme dost informací, abychom vyloučili riziko. To, že jsme nenašli jasné varovné znaky, neznamená, že je zpráva bezpečná.';
const missingVerification = 'Žádost si ověřte jinou cestou. Použijte kontakt, který už znáte, nebo oficiální aplikaci. Nepoužívejte telefon ani odkaz z posuzované zprávy.';
// F5a interim result: neutral heading, no score, no outcome derived in the browser.
// The first recommended action comes from the backend in its own order; nothing
// here is inferred from risk_score, risk_level or the number of signals.
function render() {
  if (!analysis) return;
  const [primary, ...rest] = analysis.recommended_actions;
  document.querySelector('#primary-action').textContent = primary;
  list('#actions', rest);
  document.querySelector('#actions').hidden = rest.length === 0;
  document.querySelector('#summary').textContent = analysis.summary;
  list('#signals', analysis.signals.length ? analysis.signals.map(signal => `${signal.title}. ${signal.explanation}`) : ['Známé signály jsme nenašli. Podvod tím není vyloučen.']);
  list('#uncertainties', analysis.uncertainties?.length
    ? analysis.uncertainties.map(text => uncertaintyCopy.get(text) || text) : [missingUncertainty]);
  list('#verification', analysis.verification_steps?.length ? analysis.verification_steps : [missingVerification]);
  list('#technical', [
    analysis.engine === 'rules-v1' ? 'Použita pouze pravidla, bez AI.' : 'Použita pravidla a AI.',
    ...(analysis.engine !== 'rules-v1' && analysis.uncertainty ? [`Nejistota AI: ${{ low: 'menší', medium: 'střední', high: 'vysoká' }[analysis.uncertainty] || 'neuvedena'}.`, `Druhá AI kontrola: ${analysis.critic_used ? 'ano' : 'ne'}.`] : []),
    analysis.input_type === 'url' ? 'Vložen samotný odkaz. Stránku jsme neotevřeli.' : 'Vložen text.',
  ]);
}
document.querySelector('#to-verification').addEventListener('click', () => {
  const target = document.querySelector('#verification-title');
  target.closest('section').scrollIntoView({ block: 'start' });
  target.focus({ preventScroll: true });
});
// Minimal shape check so an incomplete response is reported, never shown as a result.
const isText = value => typeof value === 'string' && value.trim().length > 0;
// Missing/empty guidance gets generic process advice, never invented findings.
// Wrong types or malformed entries remain rendering failures.
const isSafetyList = value => value === undefined || (Array.isArray(value) && value.every(isText));
function isAnalysis(data) {
  return Boolean(data) && isText(data.summary)
    && Array.isArray(data.recommended_actions) && data.recommended_actions.length > 0 && data.recommended_actions.every(isText)
    && Array.isArray(data.signals) && data.signals.every(signal => isText(signal?.title) && isText(signal?.explanation))
    && ['verification_steps', 'uncertainties'].every(key => isSafetyList(data[key]));
}
let busy = false;
function setBusy(value) {
  busy = value;
  form.setAttribute('aria-busy', String(value));
  submit.setAttribute('aria-disabled', String(value));
  document.querySelector('#submit-label').textContent = value ? 'Prověřuji…' : 'Prověřit zprávu';
  operationStatus.classList.toggle('is-busy', value);
  document.querySelector('#processing').hidden = !value;
  if (value) document.querySelector('#processing').scrollIntoView({ block: 'nearest' });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || recovering || submit.disabled) return;
  if (!mode) { showError('SESSION_START'); return; }
  if (mode === 'ai' && !document.querySelector('#consent').checked) { showError('AI_CONSENT_REQUIRED'); return; }
  // Keep keyboard focus in place when the control that started this disappears.
  if (errorPanel.contains(document.activeElement)) submit.focus();
  hideError();
  document.querySelector('#status-character').hidden = true; result.hidden = true; analysis = undefined;
  const request = analysisRequest(document.querySelector('#content').value);
  setBusy(true);
  status.textContent = 'Prověřuji zadaný obsah… Chvíli prosím počkejte.';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  let failure;
  let response;
  let data;
  try {
    response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
    data = await response.json().catch(() => undefined);
  } catch (caught) {
    failure = caught.name === 'AbortError' ? 'CLIENT_TIMEOUT' : 'NETWORK';
  } finally { clearTimeout(timer); }
  if (!failure && !response.ok) failure = failureFor(data?.code, response.status);
  else if (!failure && !isAnalysis(data)) failure = 'UNEXPECTED';
  setBusy(false);
  if (!failure) {
    try {
      analysis = data; render(); result.hidden = false;
      // Start reading at the result heading, not wherever focus scrolling lands.
      result.scrollIntoView({ block: 'start' });
      result.focus({ preventScroll: true });
      status.textContent = 'Kontrola je dokončena.';
      document.querySelector('#status-character').hidden = false;
    } catch {
      analysis = undefined; result.hidden = true; failure = 'UNEXPECTED';
    }
  }
  if (failure) { status.textContent = ''; showError(failure); }
});
// Recovery is always started by the user; nothing retries on its own. One click
// renews the session at most once and then submits at most once.
let recovering = false;
retry.addEventListener('click', async () => {
  if (busy || recovering) return;
  const failure = lastFailure;
  if (failure?.kind === 'session') {
    submit.focus();
    recovering = true;
    const renewed = await initialize();
    recovering = false;
    if (!renewed) return;
    hideError();
    if (failure === failures.SESSION_START) return;
  }
  form.requestSubmit();
});
document.querySelector('#edit-content').addEventListener('click', () => document.querySelector('#content').focus());
