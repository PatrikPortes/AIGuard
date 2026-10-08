import { characterAssets } from './character-assets.js';
const form = document.querySelector('#analysis-form');
const result = document.querySelector('#result');
const error = document.querySelector('#error');
const status = document.querySelector('#status');
const submit = document.querySelector('#submit');
const simple = document.querySelector('#simple');
let analysis;
let mode;
function showError(message, code, validation = false) {
  const validationError = validation || ['INVALID_INPUT', 'AI_INPUT_LIMIT', 'AI_CONSENT_REQUIRED'].includes(code);
  const capacity = ['AI_CAPACITY_EXHAUSTED', 'AI_OVERLOADED', 'RATE_LIMITED'].includes(code);
  const character = document.querySelector('#error-character');
  character.src = validationError ? characterAssets['verka-warning']
    : capacity ? characterAssets['robo-capacity'] : characterAssets['robo-error'];
  document.querySelector('#error-speaker').textContent = validationError ? 'Věrka · malé upozornění' : 'Robo · systémová informace';
  error.textContent = message;
  error.hidden = false;
  document.querySelector('#error-panel').hidden = false;
}
submit.disabled = true;
async function initialize() {
  try {
    const response = await fetch('/api/session');
    if (!response.ok) throw new Error('Analýza je dočasně nedostupná. Zkuste stránku načíst později.');
    const runtime = await response.json();
    mode = runtime.mode;
    document.querySelector('#engine-notice').textContent = mode === 'ai'
      ? runtime.ai_configured ? 'Text vyhodnotí pravidla a AI. Výsledek je orientační; odkazy neotevíráme.' : 'AI ověření zatím není dostupné. Zkuste to později.'
      : 'Textový prototyp: používá pouze pravidla, bez AI modelu. Screenshoty a PDF připravujeme.';
    document.querySelector('#consent-label').textContent = `Souhlasím s odesláním vloženého textu poskytovateli ${runtime.provider_label || 'AI'}. Před odesláním odstraním nepotřebné osobní údaje.`;
    document.querySelector('#ai-consent').hidden = mode !== 'ai';
    submit.disabled = mode === 'ai' && !runtime.ai_configured;
  } catch (failure) { showError(failure.message); }
}
initialize();
const levels = { unassessed: 'Bezpečnost nelze určit', low: 'Bezpečnost nelze určit', caution: 'Zvýšená opatrnost', high: 'Vysoké riziko', very_high: 'Velmi vysoké riziko' };
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
function render() {
  if (!analysis) return;
  const risk = document.querySelector('#risk');
  document.querySelector('#risk-level').textContent = levels[analysis.risk_level];
  const unassessed = ['unassessed', 'low'].includes(analysis.risk_level);
  document.querySelector('#risk-number').textContent = unassessed ? '—' : analysis.risk_score;
  document.querySelector('#risk-scale').hidden = unassessed;
  document.querySelector('#risk-description').textContent = analysis.input_type === 'url' ? 'Cíl odkazu nebyl navštíven ani ověřen.' : unassessed ? 'Absence známých signálů nepotvrzuje důvěryhodnost.' : 'Odhad rizikových signálů';
  risk.dataset.level = analysis.risk_level;
  const riskState = ['high', 'very_high'].includes(analysis.risk_level) ? 'warning' : 'thinking';
  document.querySelector('#risk-character').src = characterAssets[`verka-${riskState}`];
  document.querySelector('#signals-character').src = characterAssets[`robo-${analysis.signals.length ? 'warning' : 'default'}`];
  document.querySelector('#summary').textContent = simple.checked && analysis.input_type !== 'url'
    ? analysis.risk_score >= 60 ? 'Zastavte se. Zpráva má varovné znaky. Než něco uděláte, ověřte si ji.' : 'Nevíme, zda zprávě můžete věřit. Ověřte si ji u člověka nebo firmy, které znáte.'
    : analysis.summary;
  list('#signals', analysis.signals.length ? analysis.signals.map(signal => simple.checked ? signal.title : `${signal.title}. ${signal.explanation}`) : ['Známé signály jsme nenašli. Podvod tím není vyloučen.']);
  list('#actions', simple.checked ? ['Než pošlete peníze, ověřte si žádost.', 'Nikomu neposílejte hesla ani kódy.', 'Podezřelý odkaz neotvírejte.'] : analysis.recommended_actions);
  list('#verification', analysis.verification_steps);
  list('#uncertainties', [...analysis.uncertainties, analysis.engine === 'rules-v1' ? 'Použita pouze pravidla, bez AI.' : `Použita pravidla a AI. Nejistota: ${{low:'menší',medium:'střední',high:'vysoká'}[analysis.uncertainty]}. Druhá AI kontrola: ${analysis.critic_used ? 'ano' : 'ne'}.`]);
}
simple.addEventListener('change', render);
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!mode || (mode === 'ai' && !document.querySelector('#consent').checked)) {
    showError('Před AI analýzou potvrďte odeslání textu poskytovateli.', 'AI_CONSENT_REQUIRED', true); return;
  }
  error.hidden = true; document.querySelector('#error-panel').hidden = true;
  document.querySelector('#status-character').hidden = true; result.hidden = true; analysis = undefined;
  const request = analysisRequest(document.querySelector('#content').value);
  status.textContent = request.type === 'url' ? 'Robo rozebírá zápis odkazu…' : 'Robo kontroluje rizikové signály…';
  document.querySelector('#processing').hidden = false; submit.disabled = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      const failure = new Error(data.error || 'Analýzu se nepodařilo dokončit.');
      failure.code = data.code; throw failure;
    }
    analysis = data; render(); result.hidden = false; result.focus();
    status.textContent = 'Kontrola je dokončena.';
    document.querySelector('#status-character').hidden = false;
  } catch (failure) {
    showError(failure.name === 'AbortError' ? 'Kontrola trvala příliš dlouho. Zkuste to znovu.' : failure.message, failure.code);
    status.textContent = '';
  } finally { clearTimeout(timer); document.querySelector('#processing').hidden = true; submit.disabled = false; }
});
