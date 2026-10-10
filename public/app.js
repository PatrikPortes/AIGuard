import { characterAssets } from './character-assets.js';
const form = document.querySelector('#analysis-form');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const submit = document.querySelector('#submit');
let analysis;
let mode;
let providerLabel = 'AI';
// External AI may be used only when configured; an explicit rules_fallback lets
// an unconfigured AI deployment still answer with rules, without AI consent.
let aiAvailable = false;
let rulesFallback = false;
let busy = false;
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
  AI_UNAVAILABLE: { kind: 'wait', title: 'Prověřování je dočasně nedostupné.', message: 'Zkuste to prosím později. Vložený obsah zůstává v poli.' },
  AI_INVALID_CONFIG: { kind: 'wait', title: 'Prověřování je dočasně nedostupné.', message: 'Zkuste to prosím později. Vložený obsah zůstává v poli.' },
  AI_BUDGET_UNAVAILABLE: { kind: 'wait', title: 'Prověřování je dočasně nedostupné.', message: 'Zkuste to prosím později. Vložený obsah zůstává v poli.' },
  AI_PROVIDER_UNAVAILABLE: { kind: 'retry', title: 'Kontrola s AI se teď nepodařila.', message: 'Zkuste to prosím znovu, případně později. Vložený obsah zůstává v poli.' },
  // The server rejected the AI answer as unreliable (schema, evidence or safety).
  AI_INVALID_OUTPUT: { kind: 'retry', title: 'Výsledek kontroly nebyl dost spolehlivý, proto ho nezobrazujeme.', message: 'Zkuste to prosím znovu.' },
  REJECTED_AGAIN: { kind: 'wait', title: 'Výsledek kontroly nebyl dost spolehlivý, proto ho nezobrazujeme.', message: 'Ani druhý pokus nebyl spolehlivý. Zkuste to prosím později.' },
  SESSION_START: { kind: 'session', title: 'Prověřování se nepodařilo připravit.', message: 'Zkuste to prosím znovu. Pokud se to bude opakovat, načtěte stránku později.' },
};
let lastFailure;
const REJECTED = ['AI_INVALID_OUTPUT', 'AI_UNSUPPORTED_EVIDENCE', 'AI_UNSAFE_OUTPUT'];
let rejections = 0;
let rejectedFor;
function failureFor(code, httpStatus) {
  // Without AI the user was never asked for AI consent. A backend that still
  // demands it cannot answer now; never show a consent request with no checkbox.
  if (code === 'AI_CONSENT_REQUIRED' && !aiAvailable) return 'AI_UNAVAILABLE';
  // One manual retry after a rejected AI answer; a second rejection ends it.
  if (REJECTED.includes(code)) return ++rejections > 1 ? 'REJECTED_AGAIN' : 'AI_INVALID_OUTPUT';
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
  document.querySelector('#error-guidance').hidden = !['retry', 'wait'].includes(failure.kind);
  errorPanel.hidden = false;
  // Fill the alert after it is visible so screen readers announce the new text.
  const message = correctingLoanInput ? `${failure.message} Odpovědi k této nabídce zůstávají vybrané. Pro jinou zprávu zvolte „Prověřit jinou zprávu“.` : failure.message;
  [failure.title, message, NO_RESULT].forEach((text, index) => { parts[index].textContent = text; });
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
    providerLabel = runtime.provider_label || 'AI';
    aiAvailable = mode === 'ai' && runtime.ai_configured === true;
    rulesFallback = mode === 'ai' && !aiAvailable && runtime.rules_fallback === true;
    document.querySelector('#engine-notice').textContent = mode === 'ai'
      ? aiAvailable ? `Text vyhodnotí naše pravidla a pomůže s ním AI od poskytovatele ${providerLabel}. Výsledek je orientační. Odkazy neotevíráme.`
        : rulesFallback ? 'Kontrola s AI teď není k dispozici. Zprávu prověříme jen podle našich pravidel a text poskytovateli AI neposíláme. Výsledek je orientační. Odkazy neotevíráme.'
        : 'AI ověření zatím není dostupné. Zkuste to později.'
      : 'Zatím kontrolujeme jen text a odkazy podle pevných pravidel, bez umělé inteligence. Snímky obrazovky a PDF připravujeme.';
    document.querySelector('#consent-label').textContent = `Souhlasím s odesláním vloženého textu poskytovateli ${runtime.provider_label || 'AI'}. Před odesláním odstraním nepotřebné osobní údaje.`;
    // Consent is asked only for a provider that can actually be contacted.
    document.querySelector('#ai-consent').hidden = !aiAvailable;
    // An older backend without rules_fallback keeps the safe disabled state.
    submit.disabled = mode === 'ai' && !aiAvailable && !rulesFallback;
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
// Loan flow: same form and result plus two optional questions from /loan.js,
// loaded on demand. Answers are fixed choices, never sensitive values.
const loanEntry = document.querySelector('#loan-entry');
const content = document.querySelector('#content');
let loanMode = false;
let loanUi;
let submittedContent;
let correctingLoanInput = false;
const isLoan = () => loanMode;
function setLoanMode(value) {
  if (!value) {
    loanUi?.reset();
    if (correctingLoanInput) hideError();
    correctingLoanInput = false;
  }
  loanMode = value;
  loanUi?.show(value);
  loanEntry.hidden = value;
  if (!busy) document.querySelector('#submit-label').textContent = submitLabel();
}
async function openLoan(focus) {
  try {
    loanUi ||= await import('/loan.js');
    await loanUi.ready();
  } catch { showError('NETWORK'); return; }
  loanUi.mount({ before: document.querySelector('#ai-consent'), onExit: () => { setLoanMode(false); content.focus(); } });
  if (!loanMode) loanUi.reset();
  submittedContent = undefined;
  correctingLoanInput = false;
  setLoanMode(true);
  focus();
}
loanEntry.addEventListener('click', () => openLoan(() => content.focus()));
document.querySelector('#loan-followup-open').addEventListener('click', () => openLoan(() => {
  const title = loanUi.title();
  title.scrollIntoView({ block: 'start' });
  title.focus({ preventScroll: true });
}));
// Shown only when this module runs; without it nothing can be sent.
loanEntry.hidden = false;
if (location.hash === '#pujcka') openLoan(() => {});
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  // Choosing another example is explicit new-analysis intent, even while
  // correcting a rejected loan input. Its answers must not follow the example.
  setLoanMode(false); submittedContent = undefined;
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
  // Consent is never claimed for a provider the user was not asked about.
  const request = { type: classifyInput(content), content, ai_consent: aiAvailable && document.querySelector('#consent').checked };
  return isLoan() ? { ...request, topic: 'loan', loan_context: loanUi.context() } : request;
}
function list(id, items) {
  const target = document.querySelector(id);
  target.replaceChildren(...items.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
}
// Presentation compatibility for the existing backend templates. Preserve their
// limitations without referring to a score that this UI does not display.
const DISCLAIMER = 'Jde o odhad rizika, nikoli důkaz, že jde o podvod. Nízké skóre nepotvrzuje bezpečnost.';
const uncertaintyCopy = new Map([
  [DISCLAIMER, 'To, že jsme nenašli jasné varovné znaky, neznamená, že je zpráva bezpečná.'],
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
function render(loanFlow, loanAnswers, aiConsent) {
  if (!analysis) return;
  const [primary, ...rest] = analysis.recommended_actions;
  document.querySelector('#primary-action').textContent = primary;
  list('#actions', rest);
  document.querySelector('#actions').hidden = rest.length === 0;
  document.querySelector('#summary').textContent = analysis.summary;
  // AI results label who found what (existing signals[].source). Model text is
  // only ever textContent; rules-mode results keep their single list.
  const withAi = analysis.engine === 'rules+ai-v1';
  const text = signal => `${signal.title}. ${signal.explanation}`;
  const aiSignals = withAi ? analysis.signals.filter(signal => signal.source === 'ai') : [];
  const ruleSignals = analysis.signals.filter(signal => !aiSignals.includes(signal));
  document.querySelector('#rules-signals-label').hidden = !withAi;
  list('#signals', ruleSignals.length ? ruleSignals.map(text)
    : [withAi ? 'Naše pravidla nenašla známé signály.' : 'Známé signály jsme nenašli. Podvod tím není vyloučen.']);
  document.querySelector('#ai-signals-group').hidden = !aiSignals.length;
  list('#ai-signals', aiSignals.map(text));
  document.querySelector('#ai-card').hidden = !withAi;
  if (withAi) {
    document.querySelector('#ai-uncertainty').textContent = {
      high: 'U této zprávy si AI není jistá. Řiďte se hlavně kroky v části Co udělat teď.',
      medium: 'AI zná jen text zprávy, ne celou situaci. Ověřte si ji nezávisle.',
      low: 'Ani jistější posouzení AI neznamená, že je zpráva bezpečná nebo že jde o podvod.',
    }[analysis.uncertainty] || 'Nevíme, jak jistá si AI byla. Ověřte si zprávu nezávisle.';
    document.querySelector('#ai-card').classList.toggle('is-uncertain', analysis.uncertainty === 'high');
    list('#ai-notes', [
      // The provider is named in the consent before sending; the result itself
      // names no provider or model.
      'Text zprávy jsme s vaším souhlasem odeslali externímu AI poskytovateli. AI pomohla popsat varovné signály. Nerozhoduje za vás.',
      ...(analysis.critic_used ? ['Výsledek prošel druhou kontrolou AI.'] : []),
      ...(loanAnswers ? ['Odpovědi na otázky k půjčce zůstaly jen u nás a AI je nedostala.'] : []),
      'Neověřovali jsme, kdo zprávu poslal. Odkazy jsme neotevírali.',
    ]);
  }
  list('#uncertainties', analysis.uncertainties?.length
    ? analysis.uncertainties.map(text => text === DISCLAIMER && analysis.signals.length
      ? 'Varovné signály nejsou důkaz podvodu. Než cokoli uděláte, ověřte si to nezávisle.' : uncertaintyCopy.get(text) || text) : [missingUncertainty]);
  // Explicitly labelled rules fallback (ai_status), never inferred from engine.
  // "Not sent" is stated only when no AI consent was given: the backend sends
  // nothing to a provider without it. Otherwise the wording stays cautious.
  const fallback = analysis.ai_status === 'not_performed';
  document.querySelector('#engine-note').hidden = !fallback;
  if (fallback) document.querySelector('#engine-note').textContent = `${{
    not_configured: 'Kontrola s AI teď není k dispozici.', budget_unavailable: 'Kontrola s AI teď není k dispozici.',
    timeout: 'Kontrola s AI nestihla doběhnout včas.', overloaded: 'Kontrola s AI byla právě přetížená.',
    budget_exhausted: 'Kapacita kontroly s AI je teď vyčerpaná.', input_limit: 'Zpráva je pro kontrolu s AI příliš dlouhá.',
    invalid_response: 'Odpověď AI nebyla dost spolehlivá, proto ji nepoužíváme.', text_only: 'U samotného odkazu kontrolu s AI neděláme.',
  }[analysis.ai_fallback_reason] || 'Kontrola s AI se tentokrát nepodařila.'} Tento výsledek vychází jen z našich pevných pravidel. ${aiConsent
    ? 'Text zprávy mohl být s vaším souhlasem odeslán poskytovateli AI.' : 'Text jsme poskytovateli AI neposílali.'}`;
  list('#verification', analysis.verification_steps?.length ? analysis.verification_steps : [missingVerification]);
  document.querySelector('#loan-followup').hidden = !(analysis.topic === 'loan' && !loanFlow);
  list('#technical', [
    analysis.engine === 'rules-v1' ? 'Použita pouze pravidla, bez AI.' : 'Použita pravidla a AI.',
    ...(analysis.engine !== 'rules-v1' ? [analysis.critic_used ? 'Výsledek prošel druhou kontrolou AI.' : 'Druhá kontrola AI neproběhla.'] : []),
    analysis.input_type === 'url' ? 'Vložen samotný odkaz. Stránku jsme neotevřeli.' : 'Vložen text.',
    ...(analysis.topic === 'loan' ? ['Posouzeno jako nabídka půjčky. Registr ČNB jsme neprohledávali.'] : []),
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
function submitLabel() { return isLoan() ? 'Prověřit nabídku' : 'Prověřit zprávu'; }
// Long checks (AI can take up to ~30 s) get two calm, polite updates. No
// countdown and no repeated announcements; timers end with the check.
let stageTimers = [];
function stage(text) {
  status.textContent = text;
  document.querySelector('#processing-detail').textContent = text;
}
function setBusy(value) {
  busy = value;
  stageTimers.forEach(clearTimeout);
  stageTimers = value ? [
    setTimeout(() => stage(aiAvailable ? 'Kontrola s AI chvíli trvá. Prosím počkejte.' : 'Kontrola chvíli trvá. Prosím počkejte.'), 8000),
    setTimeout(() => stage('Ještě chvíli. Pokud to nepůjde, dáme vám vědět, co dál.'), 20000),
  ] : [];
  document.querySelector('#processing-detail').textContent = 'Chvíli prosím počkejte.';
  form.setAttribute('aria-busy', String(value));
  submit.setAttribute('aria-disabled', String(value));
  document.querySelector('#submit-label').textContent = value ? 'Prověřuji…' : submitLabel();
  operationStatus.classList.toggle('is-busy', value);
  document.querySelector('#processing').hidden = !value;
  if (value) document.querySelector('#processing').scrollIntoView({ block: 'nearest' });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || recovering || submit.disabled) return;
  if (!mode) { showError('SESSION_START'); return; }
  if (aiAvailable && !document.querySelector('#consent').checked) { showError('AI_CONSENT_REQUIRED'); return; }
  // Keep keyboard focus in place when the control that started this disappears.
  if (errorPanel.contains(document.activeElement)) submit.focus();
  // Also cover programmatic replacement (examples/clipboard), which need not
  // dispatch an input event. A different message cannot inherit loan answers.
  if (!correctingLoanInput && submittedContent !== undefined && content.value !== submittedContent) {
    setLoanMode(false); submittedContent = undefined;
  }
  hideError();
  correctingLoanInput = false;
  document.querySelector('#status-character').hidden = true; result.hidden = true; analysis = undefined;
  const request = analysisRequest(document.querySelector('#content').value);
  submittedContent = request.content;
  if (request.content !== rejectedFor) rejections = 0;
  rejectedFor = request.content;
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
      rejections = 0;
      analysis = data; render(request.topic === 'loan', Boolean(request.loan_context && Object.keys(request.loan_context).length), request.ai_consent === true); result.hidden = false;
      // Start reading at the result heading, not wherever focus scrolling lands.
      status.textContent = 'Kontrola je dokončena.';
      document.querySelector('#status-character').hidden = false;
      result.scrollIntoView({ block: 'start' });
      result.focus({ preventScroll: true });
    } catch {
      analysis = undefined; result.hidden = true; failure = 'UNEXPECTED';
    }
  }
  if (failure) {
    // Rejected content can be edited as the same loan analysis. Completion,
    // explicit new-check/example and leaving the flow end this correction.
    correctingLoanInput = isLoan() && ['AI_INPUT_LIMIT', 'BODY_TOO_LARGE', 'INVALID_INPUT'].includes(failure);
    status.textContent = ''; showError(failure);
  }
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
content.addEventListener('input', () => {
  // A rejected input can be corrected in the same loan flow. Otherwise a
  // changed submitted message starts a new check; unchanged retry stays local.
  if (!correctingLoanInput && submittedContent !== undefined && content.value !== submittedContent) {
    setLoanMode(false);
    submittedContent = undefined;
  }
});
document.querySelector('#next-check').addEventListener('click', () => {
  setLoanMode(false); submittedContent = undefined;
  content.scrollIntoView({ block: 'center' }); content.select();
});
