import test from 'node:test';
import assert from 'node:assert/strict';
import {checkWebUrl} from '../public/web-checker.js';
test('normalizes bare domains and never claims safety',()=>{let r=checkWebUrl('example.com');assert.equal(r.normalized,'https://example.com/');assert.equal(r.status,'unverified');assert.equal(r.signals.length,0);});
test('rejects unsafe and malformed input',()=>{for(const v of ['','javascript:alert(1)','file:///etc/passwd','https://user:pass@example.com','https://-bad.com','https://exa mple.com','https://example.com/%zz','https://example.com\\foo','a'.repeat(2049)])assert.throws(()=>checkWebUrl(v));});
test('flags misleading brand subdomain and phishing combination',()=>{let ids=checkWebUrl('https://facebook.com.evil.example/login').signals.map(s=>s.id);assert(ids.includes('brand-facebook'));assert(ids.includes('phishing'));});
test('known domain is unverified without brand accusation',()=>{let r=checkWebUrl('https://www.facebook.com/');assert.equal(r.status,'unverified');assert(!r.signals.some(s=>s.id.startsWith('brand-')));});
test('flags punycode, numeric hosts, redirects and insecure transfer',()=>{for(const [url,id]of [['http://example.com','http'],['https://xn--pple-43d.com','idn'],['http://127.0.0.1','numeric'],['https://example.com/?next=https%3A%2F%2Fevil.example','redirect']])assert(checkWebUrl(url).signals.some(s=>s.id===id));});
test('analysis does not call network or storage',()=>{const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('network forbidden');};try{assert.equal(checkWebUrl('https://localhost:3000').status,'unverified');}finally{globalThis.fetch=original;}});
