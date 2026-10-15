// Stage 11: static structure of the tabbed dashboard (no browser): tab order, ARIA wiring, default tab,
// every existing section and its container kept, no inline code or styles (CSP stays 'self' only).
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');

test('four tabs in the agreed order, wired to their panels; "Dokončená ověření" is the default', () => {
 const tabs=[...html.matchAll(/<button type="button" role="tab" id="tab-(\w+)" aria-controls="panel-(\w+)" aria-selected="(true|false)" tabindex="(-1|0)" data-tab="(\w+)">([^<]+)<\/button>/g)];
 assert.deepEqual(tabs.map(t=>t[6]),['Cloudflare','Google','Dokončená ověření','AI']);
 for(const t of tabs){assert.equal(t[1],t[2]);assert.equal(t[1],t[5]);assert.match(html,new RegExp(`<section class="panel[^"]*" role="tabpanel" id="panel-${t[1]}" aria-labelledby="tab-${t[1]}" tabindex="0"`));}
 assert.deepEqual(tabs.filter(t=>t[3]==='true').map(t=>t[1]),['overeni']);assert.deepEqual(tabs.filter(t=>t[4]==='0').map(t=>t[1]),['overeni']);
 assert.match(html,/id="panel-overeni"[^>]*tabindex="0">/);assert.doesNotMatch(html,/id="panel-overeni"[^>]*hidden/);
 for(const p of ['cloudflare','google','ai'])assert.match(html,new RegExp(`id="panel-${p}"[^>]*hidden>`));
 assert.match(html,/role="tablist" aria-label="Sekce přehledu"/);assert.match(app,/DEFAULT_TAB='overeni'/);
});

test('all existing sections, containers and notes are kept; status line replaces the operations card', () => {
 for(const s of ['id="traffic"','id="seo"','id="usage"','id="ai-usage"','id="operations"','id="notice"','class="seo-periods"','Přehled návštěvnosti','SEO &amp; Návštěvnost','Používání aplikace','AI statistiky',
  'Údaje z Cloudflare mohou být vzorkované. HTTP požadavky nejsou počet lidí ani dokončených ověření.','Skutečné náklady ani rezervovaný AI rozpočet zatím nepřebíráme.','Nabídky půjček a kalkulačka se do těchto počtů nezahrnují.','Veřejná aplikace a tunel: data zatím nejsou dostupná'])
  assert(html.includes(s),s);
 assert.match(html,/class="statusbar" role="status" aria-live="polite"/);
 assert.doesNotMatch(html,/<script>|<script(?![^>]*src="\/app\.js")|\sstyle="|\son[a-z]+="/i,'no inline script, style or handlers');
 assert.doesNotMatch(app,/innerHTML|insertAdjacentHTML|eval\(|new Function/,'DOM built with textContent only');
});
