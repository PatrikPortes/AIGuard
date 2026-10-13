import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPdfAssetFactory,rejectEncryptedPdf,extractContractPdf} from '../public/contract-pdf.js';

test('PDF auxiliary resources cannot request document URLs or paths',async()=>{
 let requests=[];const Factory=createPdfAssetFactory(async(...args)=>{requests.push(args);throw Error('test');});const factory=new Factory();
 for(const request of [{kind:'wasmUrl',filename:'decoder.wasm'},{kind:'cMapUrl',filename:'../../api/session'},{kind:'standardFontDataUrl',filename:'https://example.invalid/font'},{kind:'cMapUrl',filename:'unknown.bcmap'}])await assert.rejects(factory.fetch(request));
 assert.equal(requests.length,0);
 await assert.rejects(factory.fetch({kind:'standardFontDataUrl',filename:'LiberationSans-Regular.ttf'}));
 assert.equal(requests.length,1);assert.equal(requests[0][0],'/vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf');assert.equal(requests[0][1].credentials,'omit');assert.equal(requests[0][1].redirect,'error');
});
test('encryption is rejected even if no password prompt appeared',()=>{
 assert.throws(()=>rejectEncryptedPdf({EncryptFilterName:'Standard'}));assert.throws(()=>rejectEncryptedPdf({}));assert.doesNotThrow(()=>rejectEncryptedPdf({EncryptFilterName:null}));
});
test('extractor has no active PDF, attachment, form, navigation, persistence or upload API',()=>{
 const source=readFileSync(new URL('../public/contract-pdf.js',import.meta.url),'utf8');
 for(const forbidden of ['.render(','.getAttachments(','.getJSActions(','.getJavaScript(','.getAnnotations(','.getFieldObjects(','.saveDocument(','.getData(', 'localStorage','sessionStorage','indexedDB','URL.createObjectURL','FormData','XMLHttpRequest','console.log'])assert(!source.includes(forbidden),forbidden);
 assert(source.includes('useWorkerFetch:false'));assert(source.includes('disableAutoFetch:true'));assert(source.includes('BinaryDataFactory:createPdfAssetFactory'));assert(source.includes('rejectCancellation'));assert(source.includes('instanceof Worker'));
});

test('PDF cancellation rejects immediately even while the file read is pending',async()=>{
 const controller=new AbortController();const pending=extractContractPdf({name:'test.pdf',size:10,arrayBuffer:()=>new Promise(()=>{})},{signal:controller.signal});controller.abort();await assert.rejects(pending,/Zpracování bylo zrušeno/);
});
test('PDF deadline includes a stalled file read before parser initialization',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const pending=extractContractPdf({name:'test.pdf',size:10,arrayBuffer:()=>new Promise(()=>{})});t.mock.timers.tick(20000);await assert.rejects(pending,/Čtení PDF trvá příliš dlouho/);
});
