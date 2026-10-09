import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRuntime } from './ai/runtime.js';
import { validateInput } from './ai/pipeline.js';
import { createHash } from 'node:crypto';
import { ServiceError } from './ai/errors.js';
import { AnonymousSessions, WindowLimiter, ClientAdmission } from './limits.js';
import { clientIpResolver, clientIdentity, normalizeIp } from './client-ip.js';
import { characterAssetFiles } from '../public/character-assets.js';
import { AdmissionGate, checkBrowserRequest, checkRequestHeaders, readJson, requestPath } from './http-security.js';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/privacy', ['privacy.html', 'text/html; charset=utf-8']],
  ['/uz-se-to-stalo', ['uz-se-to-stalo.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/character-assets.js', ['character-assets.js', 'text/javascript; charset=utf-8']],
  ["/assets/characters/robo/robo-analyzing.png", ["assets/characters/robo/robo-analyzing.png", 'image/png']],
  ["/assets/characters/robo/robo-capacity.png", ["assets/characters/robo/robo-capacity.png", 'image/png']],
  ["/assets/characters/robo/robo-default.png", ["assets/characters/robo/robo-default.png", 'image/png']],
  ["/assets/characters/robo/robo-error.png", ["assets/characters/robo/robo-error.png", 'image/png']],
  ["/assets/characters/robo/robo-searching.png", ["assets/characters/robo/robo-searching.png", 'image/png']],
  ["/assets/characters/robo/robo-success.png", ["assets/characters/robo/robo-success.png", 'image/png']],
  ["/assets/characters/robo/robo-tip.png", ["assets/characters/robo/robo-tip.png", 'image/png']],
  ["/assets/characters/robo/robo-warning.png", ["assets/characters/robo/robo-warning.png", 'image/png']],
  ["/assets/characters/verka/verka-explaining.png", ["assets/characters/verka/verka-explaining.png", 'image/png']],
  ["/assets/characters/verka/verka-success.png", ["assets/characters/verka/verka-success.png", 'image/png']],
  ["/assets/characters/verka/verka-thinking.png", ["assets/characters/verka/verka-thinking.png", 'image/png']],
  ["/assets/characters/verka/verka-warning.png", ["assets/characters/verka/verka-warning.png", 'image/png']],
  ["/assets/characters/verka/verka-welcome.png", ["assets/characters/verka/verka-welcome.png", 'image/png']],
  ["/assets/characters/verkarob.png", ["assets/characters/verkarob.png", 'image/png']],
]);
const characterFiles = new Map(characterAssetFiles.map(asset => [asset.url, asset]));
const characterAliases = new Map(characterAssetFiles.map(asset => [`/${asset.source}`, asset.url]));
for (const asset of characterAssetFiles) assets.set(asset.url, [asset.url.slice(1), 'image/webp']);
const headers = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; worker-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
function send(res, code, body, type = 'application/json; charset=utf-8', responseHeaders = {}) {
  if (res.destroyed) return;
  res.writeHead(code, { ...headers, ...responseHeaders, 'Content-Type': type });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function serviceError(res, error) {
  const known = error instanceof ServiceError;
  const code = known ? error.code : 'AI_UNAVAILABLE';
  const status = known ? error.status : 503;
  const messages = {
    AI_CONSENT_REQUIRED: 'Před AI analýzou potvrďte odeslání textu poskytovateli.',
    INVALID_INPUT: 'Vložte text do 10 000 znaků nebo platnou HTTP(S) URL bez přihlašovacích údajů.',
    AI_INPUT_LIMIT: 'Obsah je příliš dlouhý. Zkraťte jej a zkuste to znovu.',
    RATE_LIMITED: 'Příliš mnoho analýz. Počkejte chvíli a zkuste to znovu.',
    AI_CAPACITY_EXHAUSTED: 'Kapacita AI je dočasně vyčerpaná. Zkuste službu později. Další požadavek neposíláme k AI.',
    AI_OVERLOADED: 'Právě ověřujeme mnoho zpráv. Zkuste to za chvíli.',
    AI_TIMEOUT: 'Ověření se nepodařilo dokončit včas. Zkuste to později.',
    BOT_CHECK_REQUIRED: 'Ochrana služby nyní neumožňuje analýzu. Zkuste to později.',
    INGRESS_REQUIRED: 'Ověření je dostupné pouze přes schválený zabezpečený vstup služby.',
    ORIGIN_REQUIRED: 'Požadavek odešlete z otevřené stránky služby.',
    SESSION_REQUIRED: 'Nejdříve znovu načtěte stránku služby.',
    INVALID_REQUEST: 'Neplatný požadavek.', INVALID_JSON: 'Neplatný JSON.',
    BODY_TOO_LARGE: 'Vstup je příliš velký.', UNSUPPORTED_ENCODING: 'Komprimované požadavky nepřijímáme.',
    REQUEST_TIMEOUT: 'Odeslání zprávy trvalo příliš dlouho. Zkuste to znovu.',
  };
  if (status === 429 || status === 503) res.setHeader('Retry-After', '60');
  send(res, status, { code, error: messages[code] || 'AI ověření je dočasně nedostupné. Zkuste to později. Výsledek nebyl vytvořen.' });
}
export function createServer({
  rateLimit = 20, sessionRateLimit = 10, windowMs = 60000,
  pipeline = createRuntime(), sessions = new AnonymousSessions(),
  requireBotCheck = false, botVerifier,
  clientIpMode = 'socket', trustedProxyIp,
  publicOrigin, globalApiRateLimit = 600, maxActiveRequests = 64,
  maxConcurrentAnalyses = 8, bodyTimeoutMs = 2000, analysisTimeoutMs = 25000,
  sessionIssueRateLimit = 10, maxBodyRequestsPerClient = 2, maxAnalysesPerClient = 2,
  staticRateLimit = 120, staticBytesPerMinute = 2097152, limiterClock = Date.now,
} = {}) {
  if (publicOrigin && (new URL(publicOrigin).origin !== publicOrigin || !publicOrigin.startsWith('https://'))) throw new Error('Invalid public origin');
  const resolveClientIp = clientIpResolver({ mode: clientIpMode, trustedProxyIp });
  const ipLimiter = new WindowLimiter({ limit: rateLimit, windowMs, clock: limiterClock });
  const sessionLimiter = new WindowLimiter({ limit: sessionRateLimit, windowMs, clock: limiterClock });
  const issuanceLimiter = new WindowLimiter({ limit: sessionIssueRateLimit, windowMs, clock: limiterClock });
  const globalLimiter = new WindowLimiter({ limit: globalApiRateLimit, windowMs, clock: limiterClock, maxKeys: 1 });
  const staticLimiter = new WindowLimiter({ limit: staticRateLimit, windowMs: 60000, clock: limiterClock });
  const staticByteLimiter = new WindowLimiter({ limit: staticBytesPerMinute, windowMs: 60000, clock: limiterClock });
  const requests = new AdmissionGate(maxActiveRequests);
  const analyses = new AdmissionGate(maxConcurrentAnalyses);
  const clientBodies = new ClientAdmission(maxBodyRequestsPerClient);
  const sessionBodies = new ClientAdmission(1);
  const clientAnalyses = new ClientAdmission(maxAnalysesPerClient);
  const sessionAnalyses = new ClientAdmission(1);
  // One bounded cache of the exact approved files; avoids repeated 2 MB reads
  // under a static-asset burst. User content is never part of this cache.
  const staticFiles = new Map();
  let draining = false;
  const server = http.createServer({ maxHeaderSize: 8192, insecureHTTPParser: false, connectionsCheckingInterval: 1000 }, async (req, res) => {
    const controller = new AbortController();
    req.once('aborted', () => controller.abort());
    res.once('close', () => controller.abort());
    let releaseRequest, releaseAnalysis, releaseBody, analysisTimer;
    const release = () => {
      releaseRequest?.(); releaseAnalysis?.(); releaseBody?.(); clearTimeout(analysisTimer);
      if (draining) server.closeIdleConnections();
    };
    res.once('finish', release); res.once('close', release);
    const rejectBody = () => {
      res.setHeader('Connection', 'close');
      res.once('finish', () => req.destroy());
    };
    try {
      if (draining) throw new ServiceError('AI_OVERLOADED');
      releaseRequest = requests.enter();
      checkRequestHeaders(req);
      const path = requestPath(req.url);
      const allowedMethod = path === '/api/analyze' ? 'POST' : assets.has(path) || ['/api/health', '/api/session'].includes(path) ? 'GET' : null;
      if (allowedMethod && req.method !== allowedMethod) {
        rejectBody(); res.setHeader('Allow', allowedMethod);
        return send(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Tato metoda není podporována.' });
      }
      if (req.method === 'GET' && (req.headers['transfer-encoding'] || Number(req.headers['content-length']) > 0)) throw new ServiceError('INVALID_REQUEST', 400);
      if (req.method === 'GET' && path === '/api/health') return send(res, 200, { status: 'ok', ...pipeline.status() });
      if (req.method === 'GET' && path === '/api/session') {
        checkBrowserRequest(req, publicOrigin);
        const key = sessions.hashIp(clientIdentity(resolveClientIp(req)));
        ipLimiter.check(key); issuanceLimiter.check(key);
        sessions.get(req, res);
        return send(res, 200, pipeline.status());
      }
      if (req.method === 'POST' && path === '/api/analyze') {
        // Resolve only the explicitly configured ingress; never trust X-Forwarded-For.
        const clientIp = resolveClientIp(req);
        checkBrowserRequest(req, publicOrigin);
        const clientKey = sessions.hashIp(clientIdentity(clientIp));
        ipLimiter.check(clientKey);
        if (publicOrigin && !sessions.validId(req)) throw new ServiceError('SESSION_REQUIRED', 403);
        const sessionId = sessions.get(req, res);
        sessionLimiter.check(sessionId);
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') { rejectBody(); return send(res, 415, { code: 'INVALID_CONTENT_TYPE', error: 'Požadavek musí být JSON.' }); }
        const bodyReleases = [];
        releaseBody = () => bodyReleases.forEach(fn => fn());
        bodyReleases.push(clientBodies.enter(clientKey));
        bodyReleases.push(sessionBodies.enter(sessionId));
        const input = await readJson(req, { timeoutMs: bodyTimeoutMs, signal: controller.signal });
        // Pure bounded validation before scarce CPU/worker slots/global tokens.
        if (pipeline.validate) pipeline.validate(input); else validateInput(input);
        releaseBody(); releaseBody = undefined;
        if (requireBotCheck) {
          if (!botVerifier) throw new ServiceError('BOT_CHECK_REQUIRED');
          // Verifier receives token/IP only, never message content. No unlimited wait.
          const checkSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]);
          const rejected = new Promise((_, reject) => {
            if (checkSignal.aborted) reject(new ServiceError('BOT_CHECK_REQUIRED'));
            else checkSignal.addEventListener('abort', () => reject(new ServiceError('BOT_CHECK_REQUIRED')), { once: true });
          });
          const verified = await Promise.race([botVerifier({ token: typeof input?.bot_token === 'string' ? input.bot_token.slice(0, 4096) : '', ip: clientIp, signal: checkSignal }), rejected]);
          if (!verified) throw new ServiceError('BOT_CHECK_REQUIRED', 403);
        }
        const analysisReleases = [];
        releaseAnalysis = () => analysisReleases.forEach(fn => fn());
        analysisReleases.push(clientAnalyses.enter(clientKey));
        analysisReleases.push(sessionAnalyses.enter(sessionId));
        analysisReleases.push(analyses.enter());
        // Session acquisition, rejected origins/bodies and over-quota clients
        // never spend the shared emergency analysis bucket.
        globalLimiter.check('analysis');
        const deadline = new AbortController();
        analysisTimer = setTimeout(() => deadline.abort(), analysisTimeoutMs);
        const analysisSignal = AbortSignal.any([controller.signal, deadline.signal]);
        const timedOut = new Promise((_, reject) => {
          if (analysisSignal.aborted) return reject(new ServiceError('AI_TIMEOUT'));
          analysisSignal.addEventListener('abort', () => reject(new ServiceError('AI_TIMEOUT')), { once: true });
        });
        const work = Promise.resolve().then(() => pipeline.analyze(input, { signal: analysisSignal }));
        // A worker ignoring cancellation must continue occupying its slot until
        // it actually stops. Timeout must not open unlimited replacement slots.
        const workerRelease = releaseAnalysis; releaseAnalysis = undefined;
        work.finally(workerRelease).catch(() => {});
        const result = await Promise.race([work, timedOut]);
        if (!controller.signal.aborted) return send(res, 200, result);
        return;
      }
      if (req.method === 'GET' && assets.has(path)) {
        const character = characterFiles.get(path);
        const alias = characterAliases.get(path);
        if (character || alias) {
          // Trusted CF headers only from the exact connector. Local diagnostic
          // static reads use the socket identity, never a spoofed forwarded IP.
          let ip = normalizeIp(req.socket.remoteAddress);
          if (clientIpMode === 'cloudflare' && ip === normalizeIp(trustedProxyIp)) ip = resolveClientIp(req);
          const key = sessions.hashIp(clientIdentity(ip));
          staticLimiter.check(key);
          if (alias) return send(res, 301, '', 'text/plain; charset=utf-8', { Location: alias, 'Cache-Control': 'public, max-age=300', 'Cloudflare-CDN-Cache-Control': 'public, max-age=300' });
          const cacheHeaders = { 'Cache-Control': 'public, max-age=31536000, immutable', 'Cloudflare-CDN-Cache-Control': 'public, max-age=31536000, immutable', ETag: `"${character.sha256}"` };
          if (req.headers['if-none-match'] !== cacheHeaders.ETag) staticByteLimiter.check(key, limiterClock(), character.bytes);
        }
        const [file, type] = assets.get(path);
        if (!staticFiles.has(file)) {
          const loaded = readFile(new URL(`../public/${file}`, import.meta.url)).then(bytes => {
            if (character && (bytes.length !== character.bytes || createHash('sha256').update(bytes).digest('hex') !== character.sha256)) throw new Error('Static integrity rejected');
            return bytes;
          }).catch(error => { staticFiles.delete(file); throw error; });
          staticFiles.set(file, loaded);
        }
        const bytes = await staticFiles.get(file);
        // A matching ETag alone is not evidence that a deployment actually
        // contains this file. Verify its physical bytes before returning 304.
        const cacheHeaders = character ? { 'Cache-Control': 'public, max-age=31536000, immutable', 'Cloudflare-CDN-Cache-Control': 'public, max-age=31536000, immutable', ETag: `"${character.sha256}"` } : {};
        const notModified = character && req.headers['if-none-match'] === cacheHeaders.ETag;
        return send(res, notModified ? 304 : 200, notModified ? '' : bytes, type, cacheHeaders);
      }
      rejectBody();
      send(res, 404, { error: 'Stránka nebyla nalezena.' });
    } catch (error) {
      if (!res.headersSent) rejectBody();
      if (!controller.signal.aborted && !res.headersSent) serviceError(res, error);
      else if (!res.destroyed) res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.setTimeout(30000, socket => socket.destroy());
  server.maxConnections = 128;
  server.maxRequestsPerSocket = 100;
  server.maxHeadersCount = 100;
  server.on('clientError', (error, socket) => {
    // Never log rawPacket, URL, body or parser errors containing user bytes.
    if (!socket.writable) return socket.destroy();
    const status = error.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request';
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n`);
  });
  server.shutdown = (timeoutMs = 10000) => {
    draining = true;
    const force = setTimeout(() => server.closeAllConnections(), timeoutMs);
    force.unref();
    return new Promise(resolve => server.close(() => { clearTimeout(force); resolve(); }));
  };
  server.on('close', () => pipeline.close());
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const pipeline = createRuntime();
  const server = createServer({ pipeline,
    rateLimit: Number(process.env.GUARD_IP_RATE_LIMIT ?? 20),
    sessionRateLimit: Number(process.env.GUARD_SESSION_RATE_LIMIT ?? 10),
    sessions: new AnonymousSessions({ secure: process.env.GUARD_COOKIE_SECURE === 'true' }),
    requireBotCheck: process.env.GUARD_REQUIRE_BOT_CHECK !== undefined && process.env.GUARD_REQUIRE_BOT_CHECK !== 'false',
    clientIpMode: process.env.GUARD_CLIENT_IP_MODE ?? 'socket',
    trustedProxyIp: process.env.GUARD_TRUSTED_PROXY_IP,
    publicOrigin: process.env.GUARD_PUBLIC_ORIGIN,
    globalApiRateLimit: Number(process.env.GUARD_GLOBAL_API_RATE_LIMIT ?? 600),
    maxActiveRequests: Number(process.env.GUARD_MAX_ACTIVE_REQUESTS ?? 64),
    maxConcurrentAnalyses: Number(process.env.GUARD_MAX_CONCURRENT_ANALYSES ?? 8),
    sessionIssueRateLimit: Number(process.env.GUARD_SESSION_ISSUE_RATE_LIMIT ?? 10),
    maxBodyRequestsPerClient: Number(process.env.GUARD_MAX_BODY_REQUESTS_PER_CLIENT ?? 2),
    maxAnalysesPerClient: Number(process.env.GUARD_MAX_ANALYSES_PER_CLIENT ?? 2),
    staticRateLimit: Number(process.env.GUARD_STATIC_RATE_LIMIT ?? 120),
    staticBytesPerMinute: Number(process.env.GUARD_STATIC_BYTES_PER_MINUTE ?? 2097152),
  }).listen(port, host, () => console.log(`AI Strážce: server spuštěn na portu ${port}, mode ${pipeline.status().mode}`));
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    // Fixed metadata only; no request content or credentials.
    server.shutdown().then(() => process.exit(0));
    setTimeout(() => process.exit(1), 12000).unref();
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
