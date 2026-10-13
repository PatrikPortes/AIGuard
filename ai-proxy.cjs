const http=require('node:http');const {timingSafeEqual}=require('node:crypto');
const token=process.env.OPENAI_API_KEY;if(!/^sk-[A-Za-z0-9_-]{20,}$/.test(token||''))throw Error('Missing API credential');
const expected=Buffer.from('Bearer '+token);let active=0,contractActive=0,botActive=0,aresActive=0;const aresCalls=[];
// ARES registry relay: fixed upstream, IČO is the only client-controlled value.
const ARES_BASE='https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/';
const validIco=ico=>typeof ico==='string'&&/^\d{8}$/.test(ico)&&((11-[8,7,6,5,4,3,2].reduce((v,w,i)=>v+Number(ico[i])*w,0)%11)%10)===Number(ico[7]);
async function ares(req,res){
 const now=Date.now();while(aresCalls.length&&aresCalls[0]<=now-60000)aresCalls.shift();
 if(aresActive>=2||aresCalls.length>=20){req.resume();return reply(res,429);}
 aresActive++;const timer=setTimeout(()=>req.destroy(),3000);
 try{
  const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>64)throw Error('Body limit');parts.push(part);}clearTimeout(timer);
  let body;try{body=JSON.parse(Buffer.concat(parts));}catch{return reply(res,400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!validIco(body.ico))return reply(res,400);
  // The 20/minute window counts real upstream lookups only.
  aresCalls.push(Date.now());
  const upstream=await fetch(ARES_BASE+body.ico,{method:'GET',redirect:'error',signal:AbortSignal.timeout(3500),headers:{Accept:'application/json'}});
  if(upstream.status===404){await upstream.body?.cancel();return reply(res,404);}
  if(upstream.status!==200||!/^application\/json\b/i.test(upstream.headers.get('content-type')||'')){await upstream.body?.cancel();return reply(res,502);}
  const reader=upstream.body.getReader();const chunks=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>128000)throw Error('Response limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!raw||raw.ico!==body.ico||typeof raw.obchodniJmeno!=='string')return reply(res,502);
  // Forward only the fields the application displays.
  const out={ico:raw.ico,obchodniJmeno:raw.obchodniJmeno,sidlo:{textovaAdresa:typeof raw.sidlo?.textovaAdresa==='string'?raw.sidlo.textovaAdresa:null},pravniForma:typeof raw.pravniForma==='string'?raw.pravniForma:null,seznamRegistraci:raw.seznamRegistraci&&typeof raw.seznamRegistraci==='object'&&!Array.isArray(raw.seznamRegistraci)?raw.seznamRegistraci:{}};
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(out));
 }catch(error){if(!res.destroyed)reply(res,error?.message==='Body limit'?400:502);}finally{clearTimeout(timer);aresActive--;}
}
const reply=(res,status)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{}');};
const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health'){return reply(res,200);}
 const supplied=Buffer.from(req.headers.authorization||'');
 if(req.method!=='POST'||!['/v1/chat/completions','/v1/contract/chat/completions','/v1/contract/turnstile','/v1/registry/ares'].includes(req.url)||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){req.resume();return reply(res,403);}
 if(req.url==='/v1/registry/ares')return ares(req,res);
 const bot=req.url==='/v1/contract/turnstile',contract=req.url==='/v1/contract/chat/completions';
 if(bot?botActive>=2:contract?contractActive>=2:active>=1){req.resume();return reply(res,429);}
 if(bot)botActive++;else if(contract)contractActive++;else active++;
 const timer=setTimeout(()=>req.destroy(),3000);const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),bot?7000:contract?50000:12000);res.on('close',()=>{if(!res.writableFinished)controller.abort();});
 try{
  const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>(bot?8192:262144))throw Error('Body limit');parts.push(part);}clearTimeout(timer);
  const body=JSON.parse(Buffer.concat(parts));
  if(bot){
   if(Object.keys(body).length!==2||typeof body.secret!=='string'||!body.secret||body.secret.length>4096||typeof body.response!=='string'||!body.response||body.response.length>4096)return reply(res,400);
   const botUpstream=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(4000)]),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});
   if(!botUpstream.ok){await botUpstream.body?.cancel();return reply(res,502);}
   const botReader=botUpstream.body.getReader();let botParts=[],botSize=0;try{while(true){const {done,value}=await botReader.read();if(done)break;botSize+=value.length;if(botSize>8192)throw Error('Response limit');botParts.push(Buffer.from(value));}}finally{await botReader.cancel();}const raw=Buffer.concat(botParts).toString();let result;try{result=JSON.parse(raw);}catch{return reply(res,502);}
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({success:result.success===true,hostname:result.hostname,action:result.action}));
  }
  const contractSchema=Boolean(body.response_format?.json_schema?.schema?.properties?.schema_version?.enum?.length===1&&body.response_format.json_schema.schema.properties.schema_version.enum[0]==='contract-findings-v1');
  if(contract!==contractSchema)return reply(res,400);
  const expectedModel=contract?process.env.AI_CONTRACT_MODEL:'gpt-4.1-mini-2025-04-14';
  if(!expectedModel||body.model!==expectedModel||body.max_completion_tokens!==(contract?4000:800)||body.store!==false||body.stream!==false||body.tools||body.response_format?.type!=='json_schema'||body.response_format?.json_schema?.strict!==true||!Array.isArray(body.messages)||(!contract&&size>65536))return reply(res,400);
  const aiDeadline=setTimeout(()=>controller.abort(),contract?45000:12000);controller.signal.addEventListener('abort',()=>clearTimeout(aiDeadline),{once:true});res.once('finish',()=>clearTimeout(aiDeadline));
  const upstream=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',redirect:'error',signal:controller.signal,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!upstream.ok){await upstream.body?.cancel();return reply(res,[429,503].includes(upstream.status)?upstream.status:502);}
  const reader=upstream.body.getReader();const chunks=[];size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('Response limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(Buffer.concat(chunks));
 }catch{if(!res.destroyed)reply(res,502);}finally{clearTimeout(timer);clearTimeout(deadline);if(bot)botActive--;else if(contract)contractActive--;else active--;}
});
server.maxConnections=64;server.maxRequestsPerSocket=100;server.requestTimeout=5000;server.headersTimeout=5000;server.listen(8080,'0.0.0.0');
process.on('SIGTERM',()=>{server.close();setTimeout(()=>process.exit(),1000).unref();});
