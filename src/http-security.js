import { ServiceError } from './ai/errors.js';

// Routing is deliberately strict: never let URL dot-segment normalization turn a
// forbidden path into a public file. The current allowlist contains ASCII paths.
export function requestPath(target) {
  if (typeof target !== 'string' || !target.startsWith('/') || /[\\#\x00-\x20\x7f]/.test(target)) throw new ServiceError('INVALID_REQUEST', 400);
  const path = target.split('?')[0];
  if (!/^\/[a-zA-Z0-9/_.-]*$/.test(path) || path.includes('//') || path.split('/').some(part => part === '.' || part === '..')) throw new ServiceError('INVALID_REQUEST', 400);
  return path;
}

export function checkRequestHeaders(req) {
  for (const name of ['host', 'origin', 'content-type', 'content-encoding', 'cookie']) {
    let count = 0;
    for (let i = 0; i < req.rawHeaders.length; i += 2) if (req.rawHeaders[i].toLowerCase() === name) count++;
    if (count > 1 || (name === 'host' && count !== 1)) throw new ServiceError('INVALID_REQUEST', 400);
  }
}

export function checkBrowserRequest(req, publicOrigin) {
  // Forwarded Host/Proto never determine the security origin.
  const origin = publicOrigin || `http://${req.headers.host}`;
  let expected;
  try { expected = new URL(origin); } catch { throw new ServiceError('INVALID_REQUEST', 400); }
  if (publicOrigin && req.headers.host !== expected.host) throw new ServiceError('ORIGIN_REQUIRED', 403);
  if (['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) throw new ServiceError('ORIGIN_REQUIRED', 403);
  if (req.method === 'POST' && ((publicOrigin && !req.headers.origin) || (req.headers.origin && req.headers.origin !== expected.origin))) throw new ServiceError('ORIGIN_REQUIRED', 403);
}

// Includes time spent receiving a body. No unbounded waiter list.
export class AdmissionGate {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1024) throw new Error('Invalid admission limit');
    this.limit = limit; this.active = 0;
  }
  enter() {
    if (this.active >= this.limit) throw new ServiceError('AI_OVERLOADED');
    this.active++;
    let released = false;
    return () => { if (!released) { released = true; this.active--; } };
  }
}

export function readJson(req, { maxBytes = 65536, timeoutMs = 5000, signal }) {
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') return Promise.reject(new ServiceError('UNSUPPORTED_ENCODING', 415));
  if (Number(req.headers['content-length']) > maxBytes) return Promise.reject(new ServiceError('BODY_TOO_LARGE', 413));
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('error', abort);
      signal.removeEventListener('abort', abort);
    };
    const fail = error => { cleanup(); reject(error); };
    const abort = () => fail(new ServiceError('REQUEST_TIMEOUT', 408));
    const data = chunk => {
      size += chunk.length;
      if (size > maxBytes) { req.pause(); return fail(new ServiceError('BODY_TOO_LARGE', 413)); }
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { reject(new ServiceError('INVALID_JSON', 400)); }
    };
    const timer = setTimeout(abort, timeoutMs);
    req.on('data', data); req.once('end', end); req.once('error', abort);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
