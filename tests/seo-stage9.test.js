// Stage 9 (SEO-1, SEO-2): metadata, headings, internal links and safe, rule-backed copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {isSafeCopy} from '../public/verdict-model.js';

const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const PAGES={'index.html':'/','message.html':'/overit-zpravu','loan.html':'/proverit-pujcku','web.html':'/proverit-web','firm.html':'/proverit-firmu','smlouva.html':'/proverit-smlouvu','investment.html':'/proverit-investici','uz-se-to-stalo.html':'/uz-se-to-stalo','privacy.html':'/privacy','o-projektu.html':'/o-projektu','kontakt.html':'/kontakt'};
const CHECKERS={'message.html':'/overit-zpravu','web.html':'/proverit-web','firm.html':'/proverit-firmu','loan.html':'/proverit-pujcku','investment.html':'/proverit-investici','smlouva.html':'/proverit-smlouvu'};
const unescape=s=>s.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const meta=(html,attr,key)=>{const m=html.match(new RegExp('<meta '+attr+'="'+key.replace(/[.:]/g,'\\$&')+'" content="([^"]*)">'));return m?unescape(m[1]):null;};
const text=html=>unescape(html.replace(/<[^>]+>/g,'\n')).split('\n').map(t=>t.trim()).filter(Boolean);
const FORBIDDEN=/garantovaně|ověříme, že|nejde o podvod|bezpečný web|je bezpečn|100 ?%|zaručujeme/iu;

test('SEO-1: titles, descriptions and social metadata of all indexable pages', () => {
 const titles=new Set(),descs=new Set();
 for(const [file,path] of Object.entries(PAGES)){
  const html=read('public/'+file),title=unescape(html.match(/<title>([^<]*)<\/title>/)[1]),desc=meta(html,'name','description');
  assert(title.length<=60,file+' title length '+title.length);assert(desc&&desc.length>=90&&desc.length<=160,file+' description length');
  assert(!titles.has(title)&&!descs.has(desc),file+' duplicate title/description');titles.add(title);descs.add(desc);
  for(const s of [title,desc]){assert(isSafeCopy(s),s);assert.doesNotMatch(s,FORBIDDEN,s);}
  const canonical='https://verimtomu.fyi'+path;
  assert.equal(html.match(/<link rel="canonical" href="([^"]+)">/)[1],canonical,file+' canonical unchanged');
  assert.equal(meta(html,'property','og:url'),canonical);assert.equal(meta(html,'property','og:title'),title);assert.equal(meta(html,'property','og:description'),desc);
  assert.equal(meta(html,'property','og:site_name'),'Věřím tomu?');assert.equal(meta(html,'property','og:image'),'https://verimtomu.fyi/assets/brand/share-v2.jpg');
  assert(meta(html,'name','twitter:card'));assert.doesNotMatch(html,/<meta[^>]+name="robots"/,'no robots meta on indexable pages');
 }
 // Checker titles name the user's problem, not only the tool.
 for(const [file,word] of [['message.html','SMS'],['web.html','e-shop'],['firm.html','IČO'],['loan.html','půjčka'],['investment.html','podvod'],['smlouva.html','smlouvy'],['index.html','podvod'],['uz-se-to-stalo.html','podvodník']])
  assert.match(read('public/'+file).match(/<title>([^<]*)/)[1],new RegExp(word,'iu'),file);
 // Firm page now has the full metadata set (it had none).
 const firm=read('public/firm.html');for(const k of ['og:type','og:image:alt'])assert(meta(firm,'property',k));assert.equal(meta(firm,'name','twitter:image'),'https://verimtomu.fyi/assets/brand/share-v2.jpg');
 // Sitemap = canonical set (unchanged).
 const locs=[...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).sort();
 assert.deepEqual(locs,Object.values(PAGES).map(p=>'https://verimtomu.fyi'+p).sort());
 assert.equal(read('public/robots.txt'),'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://verimtomu.fyi/sitemap.xml\n');
});

test('SEO-1: homepage H1 names the topic; the slogan stays in the header tagline', () => {
 const html=read('public/index.html');
 assert.deepEqual([...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m=>m[1].replace(/<br>/g,'').replace(/\s+/g,' ').trim()),['Jak poznat podvod dřív, než zaplatíte']);
 assert.match(html,/<span class="tagline">Radši ověřit než litovat\.<\/span>/);
 for(const file of Object.keys(PAGES))if(file!=='web.html')assert.equal((read('public/'+file).match(/<h1\b/g)||[]).length,1,file+' one H1');
});

test('SEO-2: "Na co si dát pozor" on every checker: static, short, rule-backed, with related checks', () => {
 for(const [file,self] of Object.entries(CHECKERS)){
  const html=read('public/'+file),sections=html.match(/<section class="panel watch-out" aria-labelledby="watch-out-title">[\s\S]*?<\/section>/g)||[];
  assert.equal(sections.length,1,file);const s=sections[0];
  assert.match(s,/<h2 id="watch-out-title">[^<]+<\/h2>/);
  const items=(s.match(/<ul>([\s\S]*?)<\/ul>/)[1].match(/<li>/g)||[]).length;assert(items>=4&&items<=6,file+' items '+items);
  const words=text(s).join(' ').split(/\s+/).length;assert(words>=40&&words<=160,file+' words '+words);
  for(const t of text(s)){assert(isSafeCopy(t),t);assert.doesNotMatch(t,FORBIDDEN,t);}
  assert.match(s,/<p class="watch-out-note">[^<]*(?:neznamená|není důkaz|není záruka|neověřujeme|nenahrazujeme)[^<]*<\/p>/u,file+' states the limitation');
  const links=[...s.matchAll(/<a href="([^"]+)">/g)].map(m=>m[1]);assert(links.length>=2&&links.length<=3);
  for(const l of links){assert.notEqual(l,self);assert(Object.values(PAGES).includes(l),l);}
  assert(!/<script|<form|<img|https?:/i.test(s),'no scripts, forms, images or external links');
  // Below the tool: after the main form/entry and the result area.
  assert(html.indexOf('watch-out-title')>html.lastIndexOf('</form>'),file+' below the form');
 }
 // The claims match existing rules (spot checks against the rule sources).
 const firmRules=read('src/firm-rules.js'),inv=read('public/investment-rules.js'),contract=read('public/contract-core.js'),analysis=read('src/analysis.js');
 for(const r of ['Subjekt zanikl','v likvidaci','Insolvenční','Nespolehlivý plátce DPH','Nespolehlivá osoba','Nově vzniklá firma','Změna vlastníka i vedení','Chybí záznam ve veřejném rejstříku'])assert(firmRules.includes(r),r);
 for(const r of ['garantovaného výnosu','bez rizika','znásobení vkladu','kryptoměnách','osobní účet','vzdálený přístup','utajení','ČNB nebo stát','vrácení ztracených peněz','získávání dalších lidí'])assert(inv.includes(r),r);
 for(const r of ['Smluvní pokuty','Automatické prodlužování','Výpovědní lhůty','Jednostranné změny','Poplatky a chybějící ceník','Rozhodčí doložky','Omezení odpovědnosti'])assert(contract.includes(r),r);
 for(const r of ['Platba předem před získáním půjčky','Slib jistého schválení','bez registru','Tlak na rychlé rozhodnutí','kód z SMS','Převod na údajný bezpečný účet','vzdálený přístup','Změna telefonu nebo čísla'])assert(analysis.includes(r),r);
});

test('SEO-2: footer lists all checks on every page; homepage situations link to matching checkers', () => {
 const footerChecks='<nav class="trust-footer-checks" aria-label="Kontroly"><a href="/overit-zpravu">Prověřit zprávu</a><a href="/proverit-web">Prověřit web</a><a href="/proverit-firmu">Prověřit firmu</a><a href="/proverit-pujcku">Prověřit půjčku</a><a href="/proverit-investici">Prověřit investici</a><a href="/proverit-smlouvu">Prověřit smlouvu</a><a href="/uz-se-to-stalo">Už se to stalo?</a></nav>';
 for(const f of readdirSync(new URL('../public/',import.meta.url)).filter(f=>f.endsWith('.html')))assert.equal(read('public/'+f).split(footerChecks).length-1,1,f);
 const home=read('public/index.html'),items=[...home.match(/<ul class="situation-list">([\s\S]*?)<\/ul>/)[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m=>m[1]);
 assert.equal(items.length,7);
 const target=Object.fromEntries(items.map(i=>[i.match(/<strong>([^<]+)<\/strong>/)[1],i.match(/<a class="situation-link" href="([^"]+)">/)[1]]));
 assert.deepEqual(target,{'„Mami, mám nové číslo“':'/overit-zpravu','Píše vám banka':'/overit-zpravu','Balík nelze doručit':'/overit-zpravu','Nedoplatek nebo faktura':'/proverit-firmu','Investice s jistým výnosem':'/proverit-investici','Půjčka „pro každého“':'/proverit-pujcku','Nová známost chce peníze':'/overit-zpravu'});
});

test('internal links resolve to served routes; no new scripts or external hosts', () => {
 const server=read('src/server.js'),routes=new Set(['/',...[...server.matchAll(/\['(\/[^']*)',\s*\[/g)].map(m=>m[1])]);
 for(const f of readdirSync(new URL('../public/',import.meta.url)).filter(f=>f.endsWith('.html'))){
  const html=read('public/'+f);
  for(const [,href] of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)){
   if(/^(?:#|mailto:|tel:)/.test(href))continue;
   if(/^https?:/.test(href)){assert(/^https:\/\/(?:verimtomu\.fyi|growmate\.cz|[a-z0-9.-]+\.(?:gov\.cz|cz|eu))\//.test(href)||/^https:\/\/growmate\.cz/.test(href),f+' '+href);continue;}
   const path=href.split(/[?#]/)[0]||'/';assert(routes.has(path),f+' broken internal link '+href);
  }
  for(const tag of html.match(/<script\b[^>]*>/g)||[])assert.match(tag,/src="\/[^"]+"/,f+' only same-origin script files');
 }
});
