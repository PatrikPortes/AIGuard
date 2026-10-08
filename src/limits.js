import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ServiceError } from './ai/errors.js';

export class WindowLimiter {
  constructor({ limit, windowMs, maxKeys = 10000 }) {
    if (!Number.isInteger(limit) || limit < 0 || !Number.isInteger(windowMs) || windowMs <= 0) throw new Error('Invalid limiter settings');
    this.limit = limit; this.windowMs = windowMs; this.maxKeys = maxKeys; this.entries = new Map();
  }
  check(key, now = Date.now()) {
    for (const [entryKey, entry] of this.entries) {
      if (entry.until > now) break;
      this.entries.delete(entryKey);
    }
    if (!this.entries.has(key) && this.entries.size >= this.maxKeys) throw new ServiceError('AI_OVERLOADED');
    const entry = this.entries.get(key) || { count: 0, until: now + this.windowMs };
    this.entries.set(key, entry);
    if (++entry.count > this.limit) throw new ServiceError('RATE_LIMITED', 429);
  }
}

export class AnonymousSessions {
  constructor({ secret = randomBytes(32), secure = false } = {}) {
    this.secret = secret; this.secure = secure;
  }
  sign(id) { return createHmac('sha256', this.secret).update(id).digest('base64url'); }
  validId(req) {
    const value = req.headers.cookie?.match(/(?:^|;\s*)guard_session=([^;]+)/)?.[1];
    if (value && /^[a-f0-9-]{36}\.\d{13}\.[A-Za-z0-9_-]{43}$/.test(value)) {
      const [id, expires, signature] = value.split('.');
      if (Number(expires) > Date.now() && timingSafeEqual(Buffer.from(signature), Buffer.from(this.sign(`${id}.${expires}`)))) return id;
    }
    return null;
  }
  get(req, res) {
    const valid = this.validId(req);
    if (valid) return valid;
    const id = randomUUID();
    const payload = `${id}.${Date.now() + 3600000}`;
    res.setHeader('Set-Cookie', `guard_session=${payload}.${this.sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${this.secure ? '; Secure' : ''}`);
    return id;
  }
  hashIp(ip) { return createHmac('sha256', this.secret).update(`ip:${ip}`).digest('hex'); }
}
