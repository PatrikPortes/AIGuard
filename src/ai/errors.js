const codes = new Set(['AI_VISITOR_LIMIT','CLIENT_COOLDOWN','AI_UNAVAILABLE','AI_PROVIDER_UNAVAILABLE','AI_INVALID_CONFIG','AI_BUDGET_UNAVAILABLE','AI_CAPACITY_EXHAUSTED','AI_OVERLOADED','AI_TIMEOUT','AI_INPUT_LIMIT','AI_INVALID_OUTPUT','AI_UNSUPPORTED_EVIDENCE','AI_UNSAFE_OUTPUT','AI_CONSENT_REQUIRED','INVALID_INPUT','RATE_LIMITED','BOT_CHECK_REQUIRED','INGRESS_REQUIRED','ORIGIN_REQUIRED','SESSION_REQUIRED','INVALID_REQUEST','INVALID_JSON','BODY_TOO_LARGE','UNSUPPORTED_ENCODING','REQUEST_TIMEOUT']);
export class ServiceError extends Error {
  constructor(code, status = 503) {
    const safeCode = codes.has(code) ? code : 'AI_UNAVAILABLE';
    super(safeCode);
    this.code = safeCode;
    this.status = status;
  }
}
export class ProviderError extends ServiceError {
  constructor({ retryable = false } = {}) {
    super('AI_PROVIDER_UNAVAILABLE');
    this.retryable = retryable;
  }
}

