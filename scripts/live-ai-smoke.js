import { createRuntime } from '../src/ai/runtime.js';
const pipeline = createRuntime(process.env);
try {
  if (pipeline.status().mode !== 'ai' || !pipeline.status().ai_configured) throw new Error('AI_NOT_CONFIGURED');
  const result = await pipeline.analyze({ type: 'text', ai_consent: true, content: 'Mami, mám nové číslo. Pošli mi ihned peníze. Nevolej mi.' });
  if (result.engine !== 'rules+ai-v1' || result.risk_score < 60 || !result.signals.some(item => item.source === 'ai') || !result.verification_steps.length) throw new Error('LIVE_CHECK_FAILED');
  // Only non-sensitive metadata. This is an explicitly invoked, budgeted real call.
  console.log(JSON.stringify({ status: 'passed', engine: result.engine, risk_level: result.risk_level, uncertainty: result.uncertainty, critic_used: result.critic_used }));
} catch (error) {
  const code = typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'LIVE_CHECK_UNAVAILABLE';
  console.error(JSON.stringify({ status: 'not_verified', code }));
  process.exitCode = 1;
} finally { pipeline.close(); }
