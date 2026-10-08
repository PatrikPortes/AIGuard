import { mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { AnalysisPipeline, TextAIWorker } from './pipeline.js';
import { OpenAICompatibleProvider } from './provider.js';
import { SqliteBudgetStore } from './budget.js';
import { BoundedQueue } from './queue.js';
import { ServiceError } from './errors.js';
import { assertRulesProduction } from '../production-config.js';

function number(env, key, fallback, min, max, integer = true) {
  const value = Number(env[key] ?? fallback);
  if (!Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || value < min || value > max || env[key] === '') throw new ServiceError('AI_INVALID_CONFIG');
  return value;
}
function flag(env, key) {
  if (env[key] !== undefined && !['true', 'false'].includes(env[key])) throw new ServiceError('AI_INVALID_CONFIG');
  return env[key] === 'true';
}
export function createRuntime(env = process.env) {
  // Also protect direct server/npm startup, not only the Docker --import guard.
  if (env.NODE_ENV === 'production') assertRulesProduction(env);
  const mode = env.AI_MODE ?? 'rules';
  if (mode === 'rules') return new AnalysisPipeline();
  let budget;
  try {
    if (mode !== 'ai' || (env.AI_DEPLOYMENT_MODE ?? 'single-host') !== 'single-host') throw new ServiceError('AI_INVALID_CONFIG');
    const simpleModel = env.AI_MODEL_SIMPLE;
    const complexModel = env.AI_MODEL_COMPLEX || simpleModel;
    if (!simpleModel || !/^[a-zA-Z0-9_.:/-]{1,120}$/.test(simpleModel) || !/^[a-zA-Z0-9_.:/-]{1,120}$/.test(complexModel)) throw new ServiceError('AI_INVALID_CONFIG');
    const config = {
      simpleModel, complexModel,
      inputPrice: number(env, 'AI_INPUT_USD_PER_MILLION', NaN, 0.000001, 10000, false),
      outputPrice: number(env, 'AI_OUTPUT_USD_PER_MILLION', NaN, 0.000001, 10000, false),
      maxInputTokens: number(env, 'AI_MAX_INPUT_TOKENS', 24000, 8192, 64000),
      maxOutputTokens: number(env, 'AI_MAX_OUTPUT_TOKENS', 1400, 256, 4096),
      retries: number(env, 'AI_MAX_RETRIES', 0, 0, 1),
      criticEnabled: flag(env, 'AI_CRITIC_ENABLED'),
    };
    // Admin endpoint only; no redirects or client-selected URLs.
    const provider = new OpenAICompatibleProvider({
      endpoint: env.AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions',
      apiKey: env.GUARD_LLM_API_KEY, allowLocal: flag(env, 'AI_ALLOW_LOCAL'),
    });
    const limits = {
      dailyRequests: number(env, 'AI_DAILY_REQUEST_LIMIT', 0, 0, 1000000),
      dailyBudgetMicroUsd: number(env, 'AI_DAILY_BUDGET_MICRO_USD', 0, 0, 1000000000000),
      totalBudgetMicroUsd: number(env, 'AI_TOTAL_BUDGET_MICRO_USD', 0, 0, 1000000000000),
    };
    const queue = new BoundedQueue({ concurrency: number(env, 'AI_WORKER_CONCURRENCY', 2, 1, 32), capacity: number(env, 'AI_QUEUE_CAPACITY', 20, 0, 1000) });
    const timeoutMs = number(env, 'AI_TIMEOUT_MS', 20000, 1000, 30000);
    const path = resolve(env.AI_BUDGET_DB || 'data/ai-budget.sqlite');
    mkdirSync(resolve(path, '..'), { recursive: true, mode: 0o700 });
    budget = new SqliteBudgetStore({ path, ...limits });
    chmodSync(path, 0o600);
    return new AnalysisPipeline({ mode, queue, timeoutMs, providerLabel: new URL(provider.endpoint).hostname === 'api.openai.com' ? 'OpenAI' : new URL(provider.endpoint).hostname, worker: new TextAIWorker({ provider, budget, config }) });
  } catch (error) {
    budget?.close();
    return new AnalysisPipeline({ mode: 'ai', unavailableCode: error instanceof ServiceError ? error.code : 'AI_INVALID_CONFIG' });
  }
}
