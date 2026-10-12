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
  if (env.AI_MODE === 'ai') {
    Object.assign(required, {
      AI_MODE:'ai', AI_BETA_ENABLED:'true', AI_DAILY_REQUEST_LIMIT:'1000',
      AI_DAILY_BUDGET_MICRO_USD:'5000000', AI_TOTAL_BUDGET_MICRO_USD:'1000000000000',
      AI_ENDPOINT:'http://172.30.41.3:8080/v1/chat/completions', AI_INTERNAL_PROXY:'true',
      AI_MODEL_SIMPLE:'gpt-4.1-mini-2025-04-14', AI_MODEL_COMPLEX:'gpt-4.1-mini-2025-04-14',
      AI_INPUT_USD_PER_MILLION:'0.4', AI_OUTPUT_USD_PER_MILLION:'1.6',
      AI_BUDGET_DB:'/app/data/ai-budget.sqlite', AI_VISITOR_DB:'/app/data/visitor.sqlite',
      GUARD_SESSION_SECRET_FILE:'/app/data/session-secret', AI_WORKER_CONCURRENCY:'1',
      AI_QUEUE_CAPACITY:'4', GUARD_MAX_ANALYSES_PER_CLIENT:'1',
      GUARD_MAX_CONCURRENT_ANALYSES:'1', AI_MAX_OUTPUT_TOKENS:'800', AI_TIMEOUT_MS:'10000',
    });
  }
  if (Object.entries(required).some(([key, value]) => env[key] !== value)
      || (env.AI_MODE !== 'ai' && (env.GUARD_LLM_API_KEY || env.OPENAI_API_KEY)) || (env.AI_MODE === 'ai' && !/^sk-[A-Za-z0-9_-]{20,}$/.test(env.OPENAI_API_KEY || '')) || env.ANTHROPIC_API_KEY || env.AI_API_KEY || env.NODE_OPTIONS
      || isIP(env.GUARD_TRUSTED_PROXY_IP || '') !== 4
      || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(env.GUARD_TRUSTED_PROXY_IP)
      || ['GUARD_IP_RATE_LIMIT', 'GUARD_SESSION_RATE_LIMIT', 'GUARD_SESSION_ISSUE_RATE_LIMIT', 'GUARD_STATIC_RATE_LIMIT'].some(key => !/^[1-9]\d{0,2}$/.test(env[key] || ''))
      || !/^[1-9]\d{0,3}$/.test(env.GUARD_GLOBAL_API_RATE_LIMIT || '')
      || !/^[1-9]\d{0,6}$/.test(env.GUARD_STATIC_BYTES_PER_MINUTE || '')
      || ['GUARD_MAX_BODY_REQUESTS_PER_CLIENT', 'GUARD_MAX_ANALYSES_PER_CLIENT'].some(key => !/^[12]$/.test(env[key] || ''))
      || ['GUARD_MAX_ACTIVE_REQUESTS', 'GUARD_MAX_CONCURRENT_ANALYSES'].some(key => !/^[1-9]\d?$/.test(env[key] || ''))) {
    throw new Error('Rules-only production configuration rejected');
  }
}

