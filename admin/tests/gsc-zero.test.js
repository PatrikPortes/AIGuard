// Stage 10: rows without impressions. Google records a position only for impressions and returns
// position 0 for rows with 0 impressions (seen on staging: 4 daily rows 0/0/0 → invalid_response).
// Such a position means "no position" (stored as null); with impressions the rank must be >= 1.
import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {syncGsc} from '../src/gsc-sync.js';import {seoReport} from '../src/gsc-report.js';

const NOW=Date.parse('2026-10-15T06:00:00Z');
const meta={metadata:{firstIncompleteDate:'2026-10-13'},responseAggregationType:'byProperty'};
const fake=byDims=>({searchAnalytics:async b=>byDims[b.dimensions.join('+')]??{rows:[]}});
const zero=day=>({keys:[day],clicks:0,impressions:0,ctr:0,position:0});
const run=async(byDims,db=new DatabaseSync(':memory:'))=>({db,r:await syncGsc({client:fake(byDims),db,now:NOW,sleep:async()=>{}})});

test('staging case: four daily rows with 0 clicks, 0 impressions, position 0 sync as reported zeros without a position', async () => {
 const days=['2026-10-09','2026-10-10','2026-10-11','2026-10-12'];
 const {db,r}=await run({date:{rows:days.map(zero),...meta}});
 assert.equal(r.status,'ok',JSON.stringify(r));assert.equal(r.lastDay,'2026-10-12');
 const rows=db.prepare('SELECT day,clicks,impressions,position FROM gsc_daily ORDER BY day').all().map(x=>({...x}));
 assert.deepEqual(rows,days.map(day=>({day,clicks:0,impressions:0,position:null})),'position stored as null, never 0');
 const rep=seoReport(db,{days:7,configured:true});
 assert.equal(rep.status,'available');
 assert.deepEqual([rep.period.clicks,rep.period.impressions,rep.period.ctr,rep.period.position,rep.period.reportedDays],[0,0,null,null,4],'no CTR or position invented');
 assert.deepEqual(rep.daily.filter(d=>!d.missing).map(d=>[d.day,d.clicks,d.impressions]),days.map(d=>[d,0,0]),'reported zeros, not gaps');
});

test('position 0 is accepted only together with 0 impressions; with impressions the rank must be >= 1', async () => {
 for(const [row,ok] of [
  [{clicks:0,impressions:0,position:0},true],
  [{clicks:0,impressions:0},true],
  [{clicks:0,impressions:0,position:null},true],
  [{clicks:0,impressions:1,position:0},false],
  [{clicks:1,impressions:5,position:0},false],
  [{clicks:0,impressions:5,position:0.5},false],
  [{clicks:0,impressions:0,position:0.5},false],
  [{clicks:0,impressions:0,position:-1},false],
  [{clicks:0,impressions:0,position:'0'},false],
  [{clicks:0,impressions:5,position:1},true],
  [{clicks:0,impressions:5,position:1000},true],
  [{clicks:0,impressions:5,position:1001},false],
 ]){
  const {r}=await run({date:{rows:[{keys:['2026-10-10'],ctr:0,...row}],...meta}});
  assert.equal(r.status,ok?'ok':'error',JSON.stringify(row));
  if(!ok)assert.deepEqual([r.error,r.request,r.detail],['invalid_response','date','check.position'],JSON.stringify(row));
 }
});

test('zero rows mixed with real data: averages use only rows with impressions; page, device and query rows follow the same rule', async () => {
 const {db,r}=await run({
  date:{rows:[zero('2026-10-10'),{keys:['2026-10-11'],clicks:2,impressions:20,ctr:0.1,position:4},{keys:['2026-10-12'],clicks:0,impressions:10,ctr:0,position:10}],...meta},
  'date+page':{rows:[{keys:['2026-10-10','https://verimtomu.fyi/overit-zpravu'],clicks:0,impressions:0,position:0},{keys:['2026-10-11','https://verimtomu.fyi/overit-zpravu'],clicks:2,impressions:20,position:4}]},
  'date+device':{rows:[{keys:['2026-10-10','MOBILE'],clicks:0,impressions:0,position:0},{keys:['2026-10-11','MOBILE'],clicks:2,impressions:20,position:4}]},
  query:{rows:[{keys:['podvodna sms'],clicks:0,impressions:0,position:0}]}});
 assert.equal(r.status,'ok',JSON.stringify(r));
 const rep=seoReport(db,{days:7,configured:true});
 assert.equal(rep.period.position,(4*20+10*10)/30,'impression-weighted, zero row ignored');
 assert.deepEqual([rep.period.clicks,rep.period.impressions,rep.period.reportedDays],[2,30,3]);
 const msg=rep.checkers.find(c=>c.label==='Zpráva');assert.deepEqual([msg.clicks,msg.impressions,msg.position],[2,20,4]);
 assert.deepEqual(rep.devices.map(d=>[d.device,d.impressions,d.position]),[['MOBILE',20,4]]);
 const q=rep.queries.find(x=>x.query==='podvodna sms');assert.deepEqual([q.impressions,q.ctr,q.position],[0,null,null]);
 assert.equal(db.prepare("SELECT position FROM gsc_daily_page WHERE day='2026-10-10'").get().position,null);
 // A page with only zero rows has no position at all.
 const {db:db2}=await run({date:{rows:[zero('2026-10-10')],...meta},'date+page':{rows:[{keys:['2026-10-10','https://verimtomu.fyi/proverit-web'],clicks:0,impressions:0,position:0}]}});
 const web=seoReport(db2,{days:7,configured:true}).checkers.find(c=>c.label==='Web');assert.deepEqual([web.impressions,web.ctr,web.position],[0,null,null]);
});
