import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
import {AnalysisPipeline} from '../src/ai/pipeline.js';

test('SEO resources are public and only informational pages permit the RUM script', async t => {
  const server = createServer({pipeline:new AnalysisPipeline()});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => {server.close(resolve);server.closeAllConnections();}));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/privacy', '/uz-se-to-stalo', '/overit-zpravu', '/proverit-pujcku', '/robots.txt', '/sitemap.xml', '/api/health']) {
    const response = await fetch(base+path);
    assert.equal(response.status,200,path);
    const csp = response.headers.get('content-security-policy');
    assert.equal(csp.includes('https://static.cloudflareinsights.com/beacon.min.js'),['/','/privacy','/uz-se-to-stalo'].includes(path),path);
    assert.ok(csp.includes("connect-src 'self';"));
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    if(path==='/sitemap.xml') {
      assert.ok(response.headers.get('content-type').startsWith('application/xml'));
      const body=await response.text();
      assert.equal((body.match(/<loc>/g)||[]).length,5);
      assert.ok(!body.includes('staging.') && !body.includes('/api/') && !/<loc>[^<]*\?/.test(body));
    }
    if(path==='/robots.txt') assert.match(await response.text(),/Sitemap: https:\/\/verimtomu\.fyi\/sitemap\.xml/);
  }
});
