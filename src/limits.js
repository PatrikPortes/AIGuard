import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ServiceError } from './ai/errors.js';

export class WindowLimiter {
  constructor({ limit, windowMs, maxKeys = 10000, clock = Date.now }) {
    if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isInteger(windowMs) || windowMs <= 0 || !Number.isInteger(maxKeys) || maxKeys < 1) throw new Error('Invalid limiter settings');
    this.limit = limit; this.windowMs = windowMs; this.maxKeys = maxKeys; this.entries = new Map(); this.clock = clock;
  }
  // Bounded LRU token buckets. Full state evicts the least recently used key;
  // it never denies *every new user*. Eviction can reset a quota, so IPv6 /64,
  // signed sessions and independent global admission remain necessary.
  check(key, now = this.clock(), amount = 1) {
    if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isFinite(now)) throw new Error('Invalid limiter charge');
    let entry = this.entries.get(key);
    if (entry) {
      entry.tokens = Math.min(this.limit, entry.tokens + Math.max(0, now - entry.updated) * this.limit / this.windowMs);
      entry.updated = Math.max(entry.updated, now);
      this.entries.delete(key);
    } else {
      if (this.entries.size >= this.maxKeys) this.entries.delete(this.entries.keys().next().value);
      entry = { tokens: this.limit, updated: now };
    }
    this.entries.set(key, entry);
    if (entry.tokens < amount) throw new ServiceError('RATE_LIMITED', 429);
    entry.tokens -= amount;
  }
}

export class ClientAdmission {
  constructor(limit = 2) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 64) throw new Error('Invalid client admission limit');
    this.limit = limit; this.entries = new Map();
  }
  enter(key) {
    const count = this.entries.get(key) || 0;
    if (count >= this.limit) throw new ServiceError('AI_OVERLOADED');
    this.entries.set(key, count + 1);
    let released = false;
    return () => {
      if (released) return; released = true;
      const remaining = this.entries.get(key) - 1;
      if (remaining) this.entries.set(key, remaining); else this.entries.delete(key);
    };
  }
}

export class AnonymousSessions {
  constructor({ secret = randomBytes(32), secure = false, lifetimeMs=3600000 } = {}) {
    this.lifetimeMs=lifetimeMs; this.secret = secret; this.secure = secure; this.name = secure ? '__Host-guard_session' : 'guard_session';
  }
  sign(id) { return createHmac('sha256', this.secret).update(id).digest('base64url'); }
  validId(req) {
    const valid = new Set();
    for (const part of (req.headers.cookie || '').split(';')) {
      const cookie = part.trim();
      if (!cookie.startsWith(`${this.name}=`)) continue;
      const value = cookie.slice(this.name.length + 1);
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.\d{13}\.[A-Za-z0-9_-]{43}$/.test(value)) continue;
      const [id, expires, signature] = value.split('.');
      if (Number(expires) > Date.now() && timingSafeEqual(Buffer.from(signature), Buffer.from(this.sign(`${id}.${expires}`)))) valid.add(id);
    }
    // Invalid shadow cookies do not suppress a valid token; ambiguous distinct
    // signed sessions are rejected rather than selecting an attacker's quota.
    return valid.size === 1 ? valid.values().next().value : null;
  }
  get(req, res) {
    const valid = this.validId(req);
    if (valid) return valid;
    const id = randomUUID();
    const payload = `${id}.${Date.now() + this.lifetimeMs}`;
    res.setHeader('Set-Cookie', `${this.name}=${payload}.${this.sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(this.lifetimeMs/1000)}${this.secure ? '; Secure' : ''}`);
    return id;
  }
  hashIp(ip) { return createHmac('sha256', this.secret).update(`ip:${ip}`).digest('hex'); }
}

