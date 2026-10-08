try {
  const response = await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(4000) });
  const state = await response.json();
  if (!response.ok || state.status !== 'ok' || state.mode !== 'rules'
      || state.engine !== 'rules-v1' || state.ai_configured !== false) process.exitCode = 1;
} catch {
  // No response bodies, credentials or request content in health logs.
  process.exitCode = 1;
}
