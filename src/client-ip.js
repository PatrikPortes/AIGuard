import { isIP } from 'node:net';
import { ServiceError } from './ai/errors.js';

// Normalize equivalent IPv6 spellings before using an address as a limiter key.
export function normalizeIp(value) {
  if (typeof value !== 'string' || value.includes('%') || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  if (canonical.startsWith('::ffff:')) {
    const words = canonical.slice(7).split(':').map(word => Number.parseInt(word, 16));
    return [words[0] >> 8, words[0] & 255, words[1] >> 8, words[1] & 255].join('.');
  }
  return canonical;
}

// A routable IPv6 /64 is one rate identity, not 2^64 independently free clients.
// Keep the actual address for ingress verification; only quota keys aggregate.
export function clientIdentity(value) {
  const ip = normalizeIp(value);
  if (!ip) throw new ServiceError('INGRESS_REQUIRED', 403);
  if (isIP(ip) === 4) return `ipv4:${ip}`;
  const [left, right = ''] = ip.split('::');
  const first = left ? left.split(':') : [];
  const last = right ? right.split(':') : [];
  const words = ip.includes('::') ? [...first, ...Array(8 - first.length - last.length).fill('0'), ...last] : first;
  return `ipv6:${words.slice(0, 4).map(word => word.padStart(4, '0')).join(':')}/64`;
}

export function clientIpResolver({ mode = 'socket', trustedProxyIp } = {}) {
  if (!['socket', 'cloudflare'].includes(mode)) throw new Error('Invalid client IP configuration');
  const trusted = normalizeIp(trustedProxyIp);
  if (mode === 'cloudflare' && !trusted) throw new Error('Invalid trusted ingress configuration');
  return req => {
    const peer = normalizeIp(req.socket.remoteAddress);
    if (mode === 'socket') {
      if (!peer) throw new ServiceError('INGRESS_REQUIRED', 403);
      return peer;
    }
    // No CIDR, forwarded chain, loopback exception or public-header fallback.
    if (peer !== trusted) throw new ServiceError('INGRESS_REQUIRED', 403);
    const headers = req.rawHeaders || [];
    let occurrences = 0;
    for (let i = 0; i < headers.length; i += 2) {
      if (headers[i].toLowerCase() === 'cf-connecting-ip') occurrences++;
    }
    const ip = normalizeIp(req.headers['cf-connecting-ip']);
    if (occurrences !== 1 || !ip) throw new ServiceError('INGRESS_REQUIRED', 403);
    return ip;
  };
}
