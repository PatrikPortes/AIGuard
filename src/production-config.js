import { isIP } from 'node:net';

export function assertRulesProduction(env) {
  const required = {
    NODE_ENV: 'production', AI_MODE: 'rules', GUARD_COOKIE_SECURE: 'true',
    AI_DAILY_REQUEST_LIMIT: '0', AI_DAILY_BUDGET_MICRO_USD: '0', AI_TOTAL_BUDGET_MICRO_USD: '0',
    AI_CRITIC_ENABLED: 'false', AI_MAX_RETRIES: '0', AI_ALLOW_LOCAL: 'false',
    GUARD_REQUIRE_BOT_CHECK: 'false', GUARD_CLIENT_IP_MODE: 'cloudflare',
    HOST: '0.0.0.0', PORT: '3000',
    GUARD_PUBLIC_ORIGIN: 'https://verimtomu.fyi',
  };
  if (Object.entries(required).some(([key, value]) => env[key] !== value)
      || env.GUARD_LLM_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.AI_API_KEY || env.NODE_OPTIONS
      || isIP(env.GUARD_TRUSTED_PROXY_IP || '') !== 4
      || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(env.GUARD_TRUSTED_PROXY_IP)
      || ['GUARD_IP_RATE_LIMIT', 'GUARD_SESSION_RATE_LIMIT'].some(key => !/^[1-9]\d{0,2}$/.test(env[key] || ''))
      || !/^[1-9]\d{0,3}$/.test(env.GUARD_GLOBAL_API_RATE_LIMIT || '')
      || ['GUARD_MAX_ACTIVE_REQUESTS', 'GUARD_MAX_CONCURRENT_ANALYSES'].some(key => !/^[1-9]\d?$/.test(env[key] || ''))) {
    throw new Error('Rules-only production configuration rejected');
  }
}
