import { ProviderError, ServiceError } from './errors.js';

// Server-only provider contract: complete({messages,schema,model,maxOutputTokens,signal}).
// A different protocol implements this method; business logic never imports its SDK.
export class OpenAICompatibleProvider {
  constructor({ endpoint, apiKey, allowLocal = false, fetchImpl = fetch }) {
    const url = new URL(endpoint);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.hash || url.search || !(url.protocol === 'https:' || (allowLocal && local && url.protocol === 'http:'))) throw new ServiceError('AI_INVALID_CONFIG');
    if (!local && !apiKey) throw new ServiceError('AI_INVALID_CONFIG');
    this.endpoint = url.href;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }
  async complete({ messages, schema, model, maxOutputTokens, signal }) {
    try {
      const response = await this.fetch(this.endpoint, {
        method: 'POST', redirect: 'error', signal,
        headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({ model, messages, max_completion_tokens: maxOutputTokens, stream: false,
          response_format: { type: 'json_schema', json_schema: { name: 'risk_analysis', strict: true, schema } } }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderError({ retryable: [429, 503].includes(response.status) });
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) throw new ServiceError('AI_INVALID_OUTPUT');
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel(); }
      const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const choice = envelope.choices?.[0];
      if (!choice || choice.finish_reason !== 'stop' || choice.message?.refusal || typeof choice.message?.content !== 'string') throw new ServiceError('AI_INVALID_OUTPUT');
      return JSON.parse(choice.message.content);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      // Never propagate provider error bodies, request contents, or credentials.
      throw new ProviderError();
    }
  }
}
