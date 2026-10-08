import { SqliteBudgetStore } from '../src/ai/budget.js';
import { BoundedQueue } from '../src/ai/queue.js';
import { AnalysisPipeline, TextAIWorker } from '../src/ai/pipeline.js';
export const input = { type: 'text', content: 'Mami, mám nové číslo. Pošli ihned peníze.', ai_consent: true };
export const validOutput = () => ({
  risk_score: 85, summary: 'Zpráva kombinuje změnu kontaktu s naléhavou žádostí o peníze.',
  signals: [{ title: 'Změna kontaktu', explanation: 'Odesílatel může napodobovat blízkou osobu.', evidence: 'nové číslo' }],
  uncertainty: 'medium', uncertainties: ['Neznáme skutečného odesílatele ani okolnosti.'],
});
export function aiFixture(t, { provider, budget, config = {}, queue = {}, timeoutMs = 1000 } = {}) {
  const calls = [];
  const actualProvider = provider || { complete: async request => { calls.push(request); return validOutput(); } };
  const actualBudget = budget || new SqliteBudgetStore({ path: ':memory:', dailyRequests: 20, dailyBudgetMicroUsd: 1000000, totalBudgetMicroUsd: 1000000 });
  const worker = new TextAIWorker({ provider: actualProvider, budget: actualBudget, config: {
    simpleModel: 'simple-model', complexModel: 'complex-model', inputPrice: 1, outputPrice: 2,
    maxInputTokens: 24000, maxOutputTokens: 1400, retries: 0, criticEnabled: false, ...config,
  } });
  const pipeline = new AnalysisPipeline({ mode: 'ai', worker, queue: new BoundedQueue(queue), timeoutMs });
  t.after(() => pipeline.close());
  return { pipeline, calls, budget: actualBudget };
}
