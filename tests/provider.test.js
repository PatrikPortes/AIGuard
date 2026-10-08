import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { OpenAICompatibleProvider } from '../src/ai/provider.js';
import { analysisSchema } from '../src/ai/schema.js';
import { validOutput } from '../test-support/ai.js';

const request = () => ({ messages: [{ role: 'system', content: 'system' }, { role: 'user', content: '{"untrusted_content":"synthetic"}' }], schema: analysisSchema, model: 'test-model', maxOutputTokens: 500, signal: AbortSignal.timeout(2000) });
async function endpoint(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
}
test('Skutečný HTTP adaptér posílá oddělené role a strict JSON schema', async t => {
  let received;
  const url = await endpoint(t, async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    received = JSON.parse(Buffer.concat(parts));
    assert.equal(req.headers.authorization, 'Bearer synthetic-secret');
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(validOutput()) } }] }));
  });
  const provider = new OpenAICompatibleProvider({ endpoint: url, apiKey: 'synthetic-secret', allowLocal: true });
  assert.deepEqual(await provider.complete(request()), validOutput());
  assert.equal(received.response_format.json_schema.strict, true);
  assert.equal(received.messages[0].role, 'system');
  assert.equal(received.max_completion_tokens, 500);
  assert.equal(received.stream, false);
});
test('Redirect, truncation, refusal, malformed a příliš velká odpověď se odmítnou', async t => {
  for (const kind of ['redirect', 'truncated', 'refusal', 'malformed', 'huge']) {
    const url = await endpoint(t, (_, res) => {
      if (kind === 'redirect') { res.writeHead(302, { Location: 'http://127.0.0.1:1' }); return res.end(); }
      if (kind === 'malformed') return res.end('{');
      if (kind === 'huge') return res.end('x'.repeat(66000));
      res.end(JSON.stringify({ choices: [{ finish_reason: kind === 'truncated' ? 'length' : 'stop', message: { content: '{}', refusal: kind === 'refusal' ? 'refused' : null } }] }));
    });
    const provider = new OpenAICompatibleProvider({ endpoint: url, allowLocal: true });
    await assert.rejects(provider.complete(request()), error => !error.message.includes(url) && !error.retryable);
  }
});
test('Pouze explicitní 429/503 jsou označené pro řízený retry; provider body neunikne', async t => {
  for (const status of [401, 429, 500, 503]) {
    const url = await endpoint(t, (_, res) => { res.writeHead(status); res.end('SECRET_CREDENTIAL_AND_CONTENT'); });
    const provider = new OpenAICompatibleProvider({ endpoint: url, allowLocal: true });
    await assert.rejects(provider.complete(request()), error => error.retryable === [429, 503].includes(status) && !error.message.includes('SECRET'));
  }
});
test('Endpointy s credentials, nešifrovaný cloud a neznámé protokoly nelze použít', () => {
  for (const endpoint of ['http://api.example.com/v1', 'https://user:secret@example.com/v1', 'file:///etc/passwd', 'https://example.com/?key=secret']) assert.throws(() => new OpenAICompatibleProvider({ endpoint, apiKey: 'synthetic', allowLocal: true }));
  assert.throws(() => new OpenAICompatibleProvider({ endpoint: 'https://api.openai.com/v1/chat/completions' }));
});
