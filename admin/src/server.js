import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';import {accessVerifier} from './access.js';import {Store} from './store.js';import {CloudflareAnalytics} from './cloudflare.js';
const headers={'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
export function createDashboard({settings,verify,store,analytics}){
 let busy=false,issue=(!settings.token||!settings.zone)?'not_configured':null;const started=Date.now();
 async function refresh(){if(busy||!settings.token||!settings.zone)return;busy=true;try{store.put('traffic',await analytics.totals());issue=null;}catch(e){issue=['permissions','rate_limited','dataset_unavailable'].includes(e.message)?e.message:'upstream';}finally{busy=false;}}
 const server=http.createServer({maxHeaderSize:24576},async(req,res)=>{
  const send=(code,data,type='text/plain; charset=utf-8')=>{res.writeHead(code,{...headers,'Content-Type':type});res.end(data);};
  try{await verify(req.headers['cf-access-jwt-assertion']);}catch{return send(403,'Přístup byl odmítnut.');}
  if(req.headers.host!==settings.host && req.headers.host!==settings.host+':'+settings.port)return send(400,'Neplatný hostitel.');
  if(req.method!=='GET')return send(405,'Metoda není povolena.');
  const path=req.url;if(path==='/api/dashboard'){
   try{const cached=store.get('traffic');const traffic=cached?{status:issue?'stale':'available',updated:cached.updated,...cached.value,issue}:{status:'unavailable',issue};
    return send(200,JSON.stringify({traffic,usage:{status:'unavailable'},ai:{status:'unavailable'},operations:{status:'available',service:'Dashboard',uptimeSeconds:Math.floor((Date.now()-started)/1000),publicApplication:{status:'unavailable'},tunnel:{status:'unavailable'}}}),'application/json; charset=utf-8');
   }catch{return send(503,'Data zatím nejsou dostupná.');}
  }
  const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
  if(!files[path])return send(404,'Stránka nenalezena.');
  try{const [name,type]=files[path];return send(200,await readFile(new URL('../public/'+name,import.meta.url)),type);}catch{return send(503,'Služba není dostupná.');}
 });server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxConnections=32;
 return {server,refresh};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const settings=config();const store=new Store(settings.db);const app=createDashboard({settings,store,verify:accessVerifier(settings),analytics:new CloudflareAnalytics(settings)});
 app.server.listen(settings.port,settings.bind,()=>console.log('Admin dashboard started.'));
 app.refresh();const timer=setInterval(()=>app.refresh(),300000);timer.unref();
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);app.server.close(()=>{store.close();process.exit(0);});});
}
