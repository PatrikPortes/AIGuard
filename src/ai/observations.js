import { ServiceError } from './errors.js';
import { resultLevel, resultSummary, safetyCritic } from '../analysis.js';

// Trusted catalogue: model output can select a category, never supply UI copy,
// a verification contact, a verdict, a numeric score or instructions to follow.
const catalogue = {
  payment_request: [20, 'Žádost o platbu', 'Obsah žádá o peníze. Před platbou nezávisle ověřte, komu a za co platíte.'],
  credential_request: [40, 'Žádost o citlivé údaje', 'Obsah žádá o přístupové nebo platební údaje či kód. Tyto údaje nesdělujte prostřednictvím zprávy.'],
  install_software: [30, 'Požadavek na instalaci', 'Obsah žádá o instalaci aplikace. Původ a účel si ověřte mimo tuto zprávu.'],
  remote_access: [40, 'Vzdálený přístup', 'Obsah žádá o přístup k zařízení. Neumožňujte jej na základě neověřené zprávy.'],
  link_following: [10, 'Požadavek na otevření odkazu', 'Obsah žádá o návštěvu odkazu. Jeho cíl nebyl otevřen ani ověřen.'],
  contact_switch: [20, 'Změna kontaktu nebo kanálu', 'Obsah mění způsob komunikace. Ověřte změnu přes kontakt, který znáte z dřívějška.'],
  urgency: [20, 'Tlak na rychlé rozhodnutí', 'Obsah vytváří časový tlak. Zastavte se a požadavek ověřte jinou cestou.'],
  secrecy: [25, 'Požadavek na utajení', 'Obsah omezuje možnost poradit se nebo ověřit situaci. To může bránit nezávislé kontrole.'],
  claimed_authority: [10, 'Odvolání na autoritu', 'Obsah se odvolává na organizaci nebo autoritu. Totožnost odesílatele tím není ověřena.'],
  unrealistic_return: [30, 'Slib výnosu nebo odměny', 'Obsah slibuje výraznou odměnu či jistý výnos. Podmínky a důvěryhodnost nebyly nezávisle ověřeny.'],
  advance_fee: [30, 'Platba předem', 'Obsah žádá o poplatek před získáním peněz nebo služby. Před platbou ověřte celý požadavek.'],
  emotional_pressure: [20, 'Emocionální tlak', 'Obsah používá vztah, obavy nebo pocit povinnosti k ovlivnění rozhodnutí. Dopřejte si čas na ověření.'],
};

export const observationSchema = {
  type: 'object', additionalProperties: false,
  required: ['schema_version', 'observations', 'uncertainty', 'insufficient_information'],
  properties: {
    schema_version: { type: 'string', enum: ['observations-v1'] },
    observations: { type: 'array', maxItems: 8, items: {
      type: 'object', additionalProperties: false, required: ['kind', 'evidence'],
      properties: {
        kind: { type: 'string', enum: Object.keys(catalogue) },
        evidence: { type: 'string', minLength: 1, maxLength: 240 },
      },
    } },
    uncertainty: { type: 'string', enum: ['low', 'medium', 'high'] },
    insufficient_information: { type: 'boolean' },
  },
};

function matches(value, schema) {
  if (schema.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === schema.required.length
    && schema.required.every(key => Object.hasOwn(value, key) && matches(value[key], schema.properties[key]));
  if (schema.type === 'array') return Array.isArray(value) && value.length <= schema.maxItems && value.every(item => matches(item, schema.items));
  if (schema.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string' && value.trim().length > 0 && value.length <= (schema.maxLength ?? 120)
    && (!schema.enum || schema.enum.includes(value));
}

export function validateObservations(value, content) {
  if (!matches(value, observationSchema)) throw new ServiceError('AI_INVALID_OUTPUT');
  const seen = new Set();
  for (const observation of value.observations) {
    if (seen.has(observation.kind)) throw new ServiceError('AI_INVALID_OUTPUT');
    seen.add(observation.kind);
    // Literal evidence is a necessary, not sufficient, semantic check. It is
    // never copied into public instructions and cannot become a trusted URL.
    if (!content.includes(observation.evidence)) throw new ServiceError('AI_UNSUPPORTED_EVIDENCE');
  }
  return value;
}

// The rules-only notice ("…nikoli AI model") must never accompany a performed
// AI result. Keep the historical wording so older rule texts are still mapped.
const RULES_ONLY_NOTICES = new Set([
  'Tato veřejná zkušební verze používá česká textová pravidla, nikoli AI model. Nerozpozná všechny podvody a může označit i pravou zprávu.',
  'Tento prototyp používá česká textová pravidla, nikoli AI model. Nerozpozná všechny podvody a může označit i pravou zprávu.',
]);
export function reconcileObservations(input, rules, assessment) {
  const signals = [
    ...rules.signals.map(item => ({ ...item, source: 'rules' })),
    ...assessment.observations.map(({ kind }) => ({
      id: `ai_${kind}`, title: catalogue[kind][1], explanation: catalogue[kind][2], source: 'ai',
    })),
  ];
  // No model-supplied score. Server-owned weights are a conservative internal
  // heuristic, not a probability. Deterministic warnings can never be removed.
  const contextualScore = assessment.observations.reduce((sum, { kind }) => sum + catalogue[kind][0], 0);
  const score = Math.min(100, Math.max(rules.risk_score, contextualScore));
  return safetyCritic({
    id: rules.id, input_type: input.type, engine: 'rules+ai-v1', ai_status: 'performed',
    ...(rules.topic && { topic: rules.topic }),
    risk_score: score, risk_level: resultLevel(score, input.type, signals.length),
    // Loan guidance already accounts for private local answers. Keep its
    // server-generated conclusion; AI may add observations, never replace it.
    summary: rules.topic === 'loan' ? rules.summary : signals.length ? resultSummary(score, input.type, signals.length)
      : 'Pravidla ani AI nenašla jasné varovné znaky. Z toho nelze určit, zda je zpráva důvěryhodná.',
    signals, recommended_actions: rules.recommended_actions, verification_steps: rules.verification_steps,
    uncertainty: assessment.insufficient_information || !assessment.observations.length ? 'high'
      : assessment.uncertainty === 'low' ? 'medium' : assessment.uncertainty,
    critic_used: false,
    uncertainties: [
      // Preserve local limits, especially every Loan-specific uncertainty.
      // The rules-only processing notice must name the rules part when an AI
      // call actually ran; retaining "nikoli AI model" would be misleading.
      ...rules.uncertainties.map(note => RULES_ONLY_NOTICES.has(note)
        ? 'Pravidlová část používá česká textová pravidla. Nerozpozná všechny podvody a může označit i pravou zprávu.' : note),
      'AI doplnila kontextová pozorování. AI i pravidla mohou přehlédnout podvod nebo označit pravou zprávu.',
      'Neověřili jsme totožnost odesílatele, pravdivost tvrzení ani obsah odkazovaných stránek.',
      'Pravidlové nálezy jsou zachovány. Pozorování nejsou pravděpodobnost ani potvrzení bezpečnosti.',
      ...(assessment.insufficient_information ? ['AI neměla dost informací pro spolehlivé posouzení kontextu.'] : []),
    ],
  });
}
