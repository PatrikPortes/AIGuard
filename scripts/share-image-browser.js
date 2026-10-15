// Local image rendering and file-sharing QA; no registry or AI calls.
import assert from'node:assert/strict';import{writeFileSync,mkdirSync}from'node:fs';import{createServer}from'../src/server.js';const{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHARE_IMAGE_OUTPUT_DIR||'/tmp/verim-share-images';mkdirSync(out,{recursive:true});
const server=createServer({staticRateLimit:100000,staticBytesPerMinute:1e9});await new Promise(r=>server.listen(0,'0.0.0.0',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});try{const page=await browser.newPage();await page.goto(base+'/proverit-firmu');
const outgoing=[];page.on('request',r=>{if(r.method()==='POST')outgoing.push(r.postData());});
const outputs=await page.evaluate(async()=>{const {renderShareCard,createShareControl}=await import('/share-result.js');const cases=[['message','serious'],['contract','incomplete'],['investment','attention'],['firm','none_found'],['loan','neutral']];const result=[];for(const [type,category]of cases){const file=await renderShareCard(type,category,{doc:document});const bmp=await createImageBitmap(file);if(bmp.width!==1200||bmp.height!==1200)throw Error('DIMENSIONS');bmp.close();result.push({type,category,name:file.name,mime:file.type,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))});}
window.calls=[];const nav={canShare:({files})=>files.length===1,share:async d=>{window.calls.push({title:d.title,text:d.text,url:d.url,name:d.files?.[0]?.name});}};document.querySelector('main').replaceChildren(createShareControl(document,'firm','none_found',{nav}));return result;});
for(const item of outputs){assert.equal(item.mime,'image/png');assert(item.bytes.length>10000);writeFileSync(out+'/'+item.name,Buffer.from(item.bytes));}
await page.locator('.share-result summary').click();
await page.locator('.share-result input[type=text]').fill('Ukázková firma s.r.o.');
await page.locator('.share-button').waitFor();await page.waitForFunction(()=>!document.querySelector('.share-button').disabled);
const before=await page.locator('.share-preview').evaluate(c=>c.toDataURL());
await page.locator('.share-caption-consent input').check();await page.waitForFunction(()=>!document.querySelector('.share-button').disabled);
const after=await page.locator('.share-preview').evaluate(c=>c.toDataURL());assert.notEqual(before,after);writeFileSync(out+'/confirmed-caption-preview.png',Buffer.from(after.split(',')[1],'base64'));
assert.equal(outgoing.length,0,'caption must not reach server');
await page.locator('.share-button').click();assert.equal((await page.evaluate(()=>window.calls))[0].name,'verimtomu-firm-none_found.png');
for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
const download=page.waitForEvent('download');await page.locator('.share-save').click();assert.equal((await download).suggestedFilename(),'verimtomu-firm-none_found.png');console.log('PASS 5 PNG renders, dimensions, real file-share payload, explicit image download, mobile/desktop layouts');
}finally{await browser.close();await new Promise(r=>server.close(r));}
