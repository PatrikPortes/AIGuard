// Loan flow: two optional questions shown in the existing form. Loaded only when
// the user opens the flow, so the homepage's first view stays unchanged.
// The DOM is built from the fixed copy below; no HTML strings, no user content.
// Answers are fixed choices about WHAT the other party asked for. The sensitive
// value itself (document, password, code, card number) is never asked for.
const ADVANCE = {
  legend: 'Chtějí po vás, abyste něco zaplatili ještě před vyplacením půjčky?',
  hint: 'Například poplatek, zálohu, pojištění nebo „aktivaci“.',
  options: [['yes', 'Ano'], ['no', 'Ne'], ['unsure', 'Nejsem si jistý/á']],
};
const REQUESTS = {
  legend: 'Co dalšího po vás chtějí?',
  hint: 'Označte vše, co platí. Samotné údaje, kódy ani doklady sem nevpisujte.',
  options: [
    ['id_document', 'Fotku nebo kopii občanského průkazu či jiného dokladu'],
    ['bank_login', 'Přihlašovací údaje do internetového bankovnictví'],
    ['sms_code', 'Kód z SMS nebo jiný ověřovací kód'],
    ['card_details', 'Číslo nebo jiné údaje z platební karty'],
    ['remote_access', 'Nainstalovat aplikaci nebo umožnit přístup do telefonu či počítače'],
    ['none', 'Nic z toho'],
    ['unsure', 'Nejsem si jistý/á'],
  ],
};
const EXCLUSIVE = ['none', 'unsure'];

function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'text') node.textContent = value; else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}
function question(id, { legend, hint, options }, type, className) {
  const inputs = options.map(([value, label]) => el('label', { class: className },
    el('input', { type, name: id, value }), el('span', { text: label })));
  return el('fieldset', { class: 'question', 'aria-describedby': `${id}-help` },
    el('legend', { text: legend }), el('p', { class: 'hint', id: `${id}-help`, text: hint }),
    ...(type === 'radio' ? [el('div', { class: 'choice-row' }, ...inputs)] : inputs));
}

let block;
let stylesheet;
export function ready() {
  stylesheet ||= new Promise((resolve, reject) => {
    const link = el('link', { rel: 'stylesheet', href: '/loan.css' });
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', reject, { once: true });
    document.head.append(link);
  });
  return stylesheet;
}
export function mount({ before, onExit }) {
  if (block) return;
  const exit = el('button', { type: 'button', class: 'secondary-action', text: 'Prověřit jinou zprávu' });
  exit.addEventListener('click', onExit);
  block = el('div', { id: 'loan-questions', class: 'loan-questions', hidden: '' },
    el('div', { class: 'loan-mode' }, el('p', { id: 'loan-mode-title', class: 'loan-mode-title', tabindex: '-1', text: 'Prověřujete nabídku půjčky' }), exit),
    el('p', { class: 'loan-intro' }, el('strong', { text: 'Dvě krátké otázky.' }), ' Nemusíte odpovídat. Pomohou nám lépe vysvětlit, čeho si všimnout.'),
    question('advance_payment', ADVANCE, 'radio', 'choice'),
    question('requests', REQUESTS, 'checkbox', 'check'));
  // "Nic z toho" and "Nejsem si jistý/á" cannot be combined with a specific request.
  const requests = [...block.querySelectorAll('input[name="requests"]')];
  for (const input of requests) input.addEventListener('change', () => {
    if (!input.checked) return;
    const exclusive = EXCLUSIVE.includes(input.value);
    for (const other of requests) if (other !== input && (exclusive || EXCLUSIVE.includes(other.value))) other.checked = false;
  });
  before.before(block);
}
export function show(visible) { if (block) block.hidden = !visible; }
export function title() { return block.querySelector('#loan-mode-title'); }
export function context() {
  const advance = block.querySelector('input[name="advance_payment"]:checked')?.value;
  const requests = [...block.querySelectorAll('input[name="requests"]:checked')].map(input => input.value);
  return { ...(advance && { advance_payment: advance }), ...(requests.length && { requests }) };
}
