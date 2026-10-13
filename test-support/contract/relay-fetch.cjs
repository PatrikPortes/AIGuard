// Isolated fake upstream only. Never used by production.
// Every URL the relay requests is recorded so tests can prove it never
// contacts anything except the fixed upstream endpoints.
globalThis.__relayRequests = [];
const ARES = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/';
const json = (value, status = 200, type = 'application/json') => new Response(typeof value === 'string' ? value : JSON.stringify(value), { status, headers: { 'Content-Type': type } });
globalThis.fetch = async (url, options = {}) => {
 globalThis.__relayRequests.push(String(url));
 if (process.send) process.send({ upstream: String(url), redirect: options.redirect });
 if (url === 'https://api.openai.com/v1/chat/completions') return new Response(JSON.stringify({ received: JSON.parse(options.body) }), { status: 200 });
 if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return new Response(JSON.stringify({ success: true, hostname: 'verimtomu.fyi', action: 'contract-check', unexpected: 'must-not-forward' }), { status: 200 });
 if (typeof url === 'string' && url.startsWith(ARES)) {
  const ico = url.slice(ARES.length);
  if (options.redirect !== 'error') throw Error('ARES must be requested with redirect:error');
  switch (ico) {
   case '00006947': return json({ ico, obchodniJmeno: 'Ministerstvo financí', sidlo: { textovaAdresa: 'Letenská 525/15, 11800 Praha 1' }, pravniForma: '325', seznamRegistraci: { stavZdrojeRes: 'AKTIVNI' }, secretInternal: 'must-not-forward' });
   case '00020869': return json({}, 404);
   case '00023221': throw new TypeError('fetch failed: redirect mode is set to error'); // what undici does on a 3xx with redirect:'error'
   case '00023264': return json('{"ico":"00023264","obchodniJmeno":"' + 'x'.repeat(130000) + '"}');
   case '00023272': return json('<html>maintenance</html>', 200, 'text/html');
   case '00023281': return json({ ico: '00006947', obchodniJmeno: 'Mismatch' });
   case '00023299': return new Promise((resolve, reject) => { const t = setTimeout(() => resolve(json({ ico, obchodniJmeno: 'Too late' })), 6000); options.signal?.addEventListener('abort', () => { clearTimeout(t); reject(options.signal.reason); }, { once: true }); });
   default: return json({ ico, obchodniJmeno: 'Synthetic ' + ico });
  }
 }
 throw Error('Unexpected upstream ' + url);
};
