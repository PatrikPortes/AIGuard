import { ServiceError } from './errors.js';

const text = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
export const analysisSchema = {
  type: 'object', additionalProperties: false,
  required: ['risk_score', 'summary', 'signals', 'uncertainty', 'uncertainties'],
  properties: {
    risk_score: { type: 'integer', minimum: 0, maximum: 100 },
    summary: text(500),
    signals: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'explanation', 'evidence'],
        properties: { title: text(120), explanation: text(500), evidence: text(300) },
      },
    },
    uncertainty: { type: 'string', enum: ['low', 'medium', 'high'] },
    uncertainties: { type: 'array', minItems: 1, maxItems: 5, items: text(300) },
  },
};

function matches(value, schema) {
  if (schema.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === schema.required.length
    && schema.required.every(key => Object.hasOwn(value, key) && matches(value[key], schema.properties[key]));
  if (schema.type === 'array') return Array.isArray(value) && value.length >= (schema.minItems || 0) && value.length <= schema.maxItems && value.every(item => matches(item, schema.items));
  if (schema.type === 'integer') return Number.isInteger(value) && value >= schema.minimum && value <= schema.maximum;
  return typeof value === 'string' && value.trim().length >= (schema.minLength || 1) && value.length <= (schema.maxLength || 1000) && (!schema.enum || schema.enum.includes(value));
}
export function validateOutput(value, content) {
  if (!matches(value, analysisSchema)) throw new ServiceError('AI_INVALID_OUTPUT');
  if (value.signals.some(signal => !content.includes(signal.evidence))) throw new ServiceError('AI_UNSUPPORTED_EVIDENCE');
  if (value.risk_score >= 60 && value.signals.length === 0) throw new ServiceError('AI_UNSUPPORTED_EVIDENCE');
  // Evidence is checked privately, never copied into the public result.
  const visible = [value.summary, ...value.signals.flatMap(signal => [signal.title, signal.explanation]), ...value.uncertainties].join('\n');
  const contact = /https?:|www\.|[\w.+-]+@[\w.-]+|\b(?:\+?\d[\s-]*){6,}\b|\b[a-z0-9-]+\.(?:cz|com|net|org|io|invalid)\b/iu;
  const overconfident = /(?:určitě|jistě|nepochybně|jednoznačně|zaručeně|stoprocentně).{0,35}(?:podvod|bezpečn|prav[áýé]|legitim|AI)|(?:není|nejde o) podvod|(?:je|jde o|jedná se o) (?:podvod|prokázaný podvod|bezpečn[áýé])|100\s*%|definitely|certainly|guaranteed|confirmed scam|(?:vytvořil[ao]?|vygeneroval[ao]?).{0,20}AI|(?:created|generated) by AI/iu;
  const unsafeInstruction = /(?:klikněte|klikni|otevřete|otevři|zavolejte|zavolej|pošlete|pošli|sdělte|sděl|zadejte|zadej|převeďte|převeď|zaplaťte|zaplať)|(?:ignore|disregard).{0,30}(?:instructions|system)|(?:send|enter|share).{0,30}(?:password|pin|code)/iu;
  if (contact.test(visible) || overconfident.test(visible) || unsafeInstruction.test(visible)) throw new ServiceError('AI_UNSAFE_OUTPUT');
  return value;
}
