const http=require('node:http');const {timingSafeEqual}=require('node:crypto');
const token=process.env.OPENAI_API_KEY;if(!/^sk-[A-Za-z0-9_-]{20,}$/.test(token||''))throw Error('Missing API credential');
const expected=Buffer.from('Bearer '+token);let active=0;
const reply=(res,status)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{}');};
const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health'){return reply(res,200);}
 const supplied=Buffer.from(req.headers.authorization||'');
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){req.resume();return reply(res,403);}
 if(active>=1){req.resume();return reply(res,429);}active++;
 const timer=setTimeout(()=>req.destroy(),3000);const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),12000);res.on('close',()=>{if(!res.writableFinished)controller.abort();});
 try{
  const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>65536)throw Error('Body limit');parts.push(part);}clearTimeout(timer);
  const body=JSON.parse(Buffer.concat(parts));
  if(body.model!=='gpt-4.1-mini-2025-04-14'||body.max_completion_tokens!==800||body.store!==false||body.stream!==false||body.tools||body.response_format?.type!=='json_schema'||!Array.isArray(body.messages))return reply(res,400);
  const upstream=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',redirect:'error',signal:controller.signal,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!upstream.ok){await upstream.body?.cancel();return reply(res,[429,503].includes(upstream.status)?upstream.status:502);}
  const reader=upstream.body.getReader();const chunks=[];size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('Response limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(Buffer.concat(chunks));
 }catch{if(!res.destroyed)reply(res,502);}finally{clearTimeout(timer);clearTimeout(deadline);active--;}
});
server.requestTimeout=5000;server.headersTimeout=5000;server.listen(8080,'0.0.0.0');
process.on('SIGTERM',()=>{server.close();setTimeout(()=>process.exit(),1000).unref();});
