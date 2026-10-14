import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { createServer } from '../src/server.js';

const route = '/uz-se-to-stalo';
const source = new URL('../public/uz-se-to-stalo.html', import.meta.url);

async function fixture(t) {
  const calls = [];
  const pipeline = {
    status() { calls.push('status'); return { mode: 'rules' }; },
    analyze() { calls.push('analyze'); throw new Error('Static M9 must not invoke analysis'); },
    close() {},
  };
  const server = createServer({ pipeline });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, base: `http://127.0.0.1:${server.address().port}`, calls };
}

function raw(server, target) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(server.address().port, '127.0.0.1');
    let response = '';
    socket.setTimeout(2000, () => socket.destroy(new Error('M9 raw request timed out')));
    socket.on('connect', () => socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`));
    socket.on('data', bytes => { response += bytes; });
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });
}

test('M9: exact GET serves the physical HTML with unchanged static security headers and no session', async t => {
  const { base, calls } = await fixture(t);
  const response = await fetch(base + route);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await response.text(), await readFile(source, 'utf8'));
  const privacy = await fetch(base + '/privacy');
  assert.equal(privacy.status, 200);
  await privacy.text();
  for (const header of ['x-content-type-options', 'referrer-policy', 'x-frame-options', 'cache-control', 'permissions-policy']) {
    assert.ok(response.headers.get(header), header);
    assert.equal(response.headers.get(header), privacy.headers.get(header), header);
  }
  // M9 keeps the strict base static policy: identical to a plain static asset,
  // without the informational-page analytics exception (owner decision 2026-10-13).
  const baseline = await fetch(base + '/style.css'); await baseline.arrayBuffer();
  assert.equal(response.headers.get('content-security-policy'), baseline.headers.get('content-security-policy'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(calls, []);
});

test('M9: content needs no scripts, forms, input, external resources or character assets', async t => {
  const { base } = await fixture(t);
  const html = await (await fetch(base + route)).text();
  // Maintenance 2026-10-13: the page gained the shared site header and SEO head
  // metadata. The invariant is unchanged: nothing on this page can run code,
  // collect or submit input, embed content or load a third-party resource.
  const [head, body] = html.split(/<\/head>/iu);
  assert.ok(body, 'document has a head and a body');
  assert.doesNotMatch(html, /<\s*(?:script|form|input|textarea|select|iframe|object|embed|picture|svg|audio|video|base)\b/iu);
  // Exactly one image: the decorative same-origin brand logo, hidden from assistive tech.
  const images = [...html.matchAll(/<\s*img\b[^>]*>/giu)].map(match => match[0]);
  assert.deepEqual(images, ['<img class="brand-logo" src="/assets/brand/logo.png" width="64" height="64" alt="" aria-hidden="true">']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/iu);
  assert.doesNotMatch(html, /\b(?:javascript:|data:|srcdoc\s*=|srcset\s*=|url\s*\(|@import|http-equiv\s*=)/iu);
  // Stage 7 permits exactly one non-loading brand anchor in the shared footer.
  // Keep the ban on every external resource, active element and other body URL.
  const brandLinks=body.match(/<a href="https:\/\/growmate\.cz\/index-cz" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">GrowMate<\/a>/gu)||[];
  assert.equal(brandLinks.length,1);
  assert.doesNotMatch(body.replace(brandLinks[0],''), /\bhttps?:/iu);
  for (const [url] of head.matchAll(/\bhttps?:[^"'\s>]*/giu)) assert.match(url, /^https:\/\/verimtomu\.fyi\//u, url);
  for (const tag of head.match(/<[^>]*\bhttps?:[^>]*>/giu) || []) assert.match(tag, /^<(?:meta\s+(?:property|name)="(?:og:image|og:url|twitter:image)"|link rel="canonical")/u, tag);
  assert.doesNotMatch(html, /assets\/characters|character-assets/iu);
  const targets = [...html.matchAll(/\b(?:href|src|action|poster|background)\s*=\s*(["'])(.*?)\1/giu)].map(match => match[2]);
  assert.ok(targets.length > 0);
  const approvedTargets = ['/', '/style.css', 'tel:158', '/privacy', '/uz-se-to-stalo',
    '/favicon.ico', '/assets/brand/favicon.png', '/assets/brand/apple-touch-icon.png', '/assets/brand/logo.png',
    'https://verimtomu.fyi/uz-se-to-stalo', '/o-projektu', '/kontakt', '/#how-it-works', 'https://growmate.cz/index-cz'];
  assert.ok(targets.every(target => approvedTargets.includes(target)), JSON.stringify(targets));
  assert.equal([...html.matchAll(/href=["']tel:158["']/gu)].length, 1);
  assert.match(html, /href="tel:158" aria-label="158 – zavolat Policii ČR">158<\/a>/u);
});

test('M9: CSP permits no third-party JavaScript, resource, frame or connection; script-src is only self', async t => {
  const { base } = await fixture(t);
  const response = await fetch(base + route); await response.text();
  const csp = response.headers.get('content-security-policy');
  const directives = new Map(csp.split(';').map(part => part.trim().split(/\s+/u)).filter(([name]) => name).map(([name, ...sources]) => [name, sources]));
  assert.deepEqual(directives.get('script-src'), ["'self'"]);
  for (const [name, sources] of directives) {
    for (const source of sources) {
      assert.doesNotMatch(source, /^(?:https?:|wss?:|\*|data:|blob:|'unsafe-|'strict-dynamic'|'nonce-|'sha(?:256|384|512)-)/iu, `${name} ${source}`);
    }
  }
  for (const name of ['default-src', 'script-src', 'connect-src', 'img-src', 'style-src']) assert.ok(directives.has(name), name);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
  assert.equal(directives.has('frame-src'), false);
});

test('M9: safety copy scopes 158, reduces remote recovery and keeps the two identity scenarios distinct', async t => {
  const { base } = await fixture(t);
  const html = await (await fetch(base + route)).text();
  assert.match(html, /Hrozí bezprostřední nebezpečí\?/u);
  assert.match(html, /Pokud právě dochází k ohrožení života, zdraví nebo majetku a potřebujete okamžitou pomoc policie, volejte /u);
  const remote = html.match(/<details class="guide-item">\s*<summary>Někdo se připojil[\s\S]*?<\/details>/u)?.[0];
  assert.ok(remote);
  assert.match(remote, /Přestaňte se řídit pokyny osoby/u);
  assert.match(remote, /Pokud mohlo být dotčeno vaše bankovnictví, kontaktujte hned banku/u);
  assert.match(remote, /Kontakt najděte nezávisle, ne v podezřelé zprávě/u);
  assert.match(remote, /Na tomto zařízení zatím nepoužívejte bankovnictví/u);
  assert.doesNotMatch(remote, /Odpojte|Wi-Fi|mobilní data|Z jiného telefonu|čistit|obnovovat|odinstal|reset/iu);
  assert.match(html, /Pokud jste doklad ztratili nebo vám ho ukradli/u);
  assert.match(html, /Pokud jste poslali jen jeho fotku nebo údaje/u);
  assert.doesNotMatch(html, /automatick.{0,30}(?:platn|neplatn)|doklad (?:zůstává|je) (?:platný|neplatný)|chargeback|úvěrov.{0,12}registr|finanční arbitr|tel:112/iu);
  assert.match(html, /Vrácení peněz nelze zaručit/u);
  assert.match(html, /Tato stránka nerozhoduje, zda šlo o podvod/u);
});

test('M9: nearby names and the physical file path remain outside the exact allowlist', async t => {
  const { base, calls } = await fixture(t);
  for (const path of [route + '/', route + '.html', '/Uz-se-to-stalo', '/UZ-SE-TO-STALO', '/public/uz-se-to-stalo.html', route + '/privacy']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('set-cookie'), null, path);
    assert.doesNotMatch(await response.text(), /<main|guide-page/u, path);
  }
  assert.deepEqual(calls, []);
});

test('M9: query strings preserve existing routing but cannot alter or reflect into HTML', async t => {
  const { base, calls } = await fixture(t);
  const normal = await (await fetch(base + route)).text();
  const marker = 'M9_QUERY_REFLECTION_PROBE_6ed732';
  const response = await fetch(`${base}${route}?m9_probe=${marker}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html, normal);
  assert.ok(!html.includes(marker));
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(calls, []);
});

test('M9: malformed and traversal targets reject before file lookup without client normalization', async t => {
  const { server, calls } = await fixture(t);
  for (const target of [route + '/../privacy', '/%2e%2e/uz-se-to-stalo', '/%252e%252e/uz-se-to-stalo', route + '%2f', '//uz-se-to-stalo', '/uz-se-to-stalo\\x', 'http://evil.invalid' + route]) {
    const response = await raw(server, target);
    assert.match(response, /^HTTP\/1\.1 400/u, target);
    assert.doesNotMatch(response, /<main|guide-page/u, target);
  }
  assert.deepEqual(calls, []);
});

test('M9: existing GET-only method and body handling does not introduce an API', async t => {
  const { base, server, calls } = await fixture(t);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
    const response = await fetch(base + route, { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('allow'), 'GET', method);
    assert.equal(response.headers.get('set-cookie'), null, method);
    await response.text();
  }
  const response = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: route, method: 'GET', headers: { 'Content-Length': '1' } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end('x');
  });
  assert.equal(response, 400);
  assert.deepEqual(calls, []);
});
