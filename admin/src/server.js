import http from 'node:http';
import{usageSummary}from'./usage.js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';import {accessVerifier} from './access.js';import {Store} from './store.js';import {CloudflareAnalytics} from './cloudflare.js';
import {seoReport,PERIODS} from './gsc-report.js';import {loadGoogleCredentials,GscClient,GscError} from './gsc.js';import {syncGsc,createGscScheduler} from './gsc-sync.js';
const headers={'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
// seo: {configured, setupError} — Stage 10 Search Console state; absent means not configured.
export function createDashboard({settings,verify,store,analytics,seo={configured:false,setupError:'not_configured'}}){
 let busy=false,issue=(!settings.token||!settings.zone)?'not_configured':null;const started=Date.now();
 async function refresh(){if(busy||!settings.token||!settings.zone)return;busy=true;try{store.put('traffic',await analytics.totals());issue=null;}catch(e){issue=['permissions','rate_limited','dataset_unavailable'].includes(e.message)?e.message:'upstream';}finally{busy=false;}}
 const server=http.createServer({maxHeaderSize:24576},async(req,res)=>{
  const send=(code,data,type='text/plain; charset=utf-8')=>{res.writeHead(code,{...headers,'Content-Type':type});res.end(data);};
  try{await verify(req.headers['cf-access-jwt-assertion']);}catch{return send(403,'Přístup byl odmítnut.');}
  if(req.headers.host!==settings.host && req.headers.host!==settings.host+':'+settings.port)return send(400,'Neplatný hostitel.');
  if(req.method!=='GET')return send(405,'Metoda není povolena.');
  const [path,search='']=req.url.split('?');
  if(path==='/api/seo'){
   // Stage 10: SEO report from local SQLite only; exactly one parameter, days=7|28|90.
   const params=new URLSearchParams(search),days=Number(params.get('days'));
   if([...params.keys()].some(k=>k!=='days')||params.getAll('days').length!==1||!PERIODS.includes(days)||String(days)!==params.get('days'))return send(400,'Neplatné období.');
   try{return send(200,JSON.stringify(seoReport(store.db,{days,configured:seo.configured,setupError:seo.setupError})),'application/json; charset=utf-8');}
   catch{return send(503,'Data zatím nejsou dostupná.');}
  }
  if(search)return send(404,'Stránka nenalezena.');
  if(path==='/api/dashboard'){
   try{const cached=store.get('traffic');const traffic=cached?{status:issue?'stale':'available',updated:cached.updated,...cached.value,issue}:{status:'unavailable',issue};
    return send(200,JSON.stringify({traffic,usage:await usageSummary(settings.usageSnapshot),ai:{status:'unavailable'},operations:{status:'available',service:'Dashboard',uptimeSeconds:Math.floor((Date.now()-started)/1000),publicApplication:{status:'unavailable'},tunnel:{status:'unavailable'}}}),'application/json; charset=utf-8');
   }catch{return send(503,'Data zatím nejsou dostupná.');}
  }
  const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
  if(!files[path])return send(404,'Stránka nenalezena.');
  try{const [name,type]=files[path];return send(200,await readFile(new URL('../public/'+name,import.meta.url)),type);}catch{return send(503,'Služba není dostupná.');}
 });server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxConnections=32;
 return {server,refresh};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const settings=config();const store=new Store(settings.db);
 // Stage 10: optional Search Console. Failures disable only the SEO section; nothing secret is logged.
 const seo={configured:false,setupError:'not_configured'};let scheduler=null;
 if(settings.gsc.credentialsFile){
  try{const account=await loadGoogleCredentials(settings.gsc.credentialsFile);const client=new GscClient({siteUrl:settings.gsc.siteUrl,account});
   seo.configured=true;seo.setupError=null;scheduler=createGscScheduler({run:async()=>{const r=await syncGsc({client,db:store.db});if(r.status!=='ok')console.log('Search Console sync failed: '+r.error+'.');return r;}});}
  catch(e){seo.setupError=e instanceof GscError?e.code:'invalid_credentials';console.log('Search Console disabled: '+seo.setupError+'.');}
 }
 const app=createDashboard({settings,store,seo,verify:accessVerifier(settings),analytics:new CloudflareAnalytics(settings)});
 app.server.listen(settings.port,settings.bind,()=>{console.log('Admin dashboard started.');scheduler?.start();});
 app.refresh();const timer=setInterval(()=>app.refresh(),300000);timer.unref();
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);scheduler?.stop();app.server.close(()=>{store.close();process.exit(0);});});
}
