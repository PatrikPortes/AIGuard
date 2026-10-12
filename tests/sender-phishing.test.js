import test from 'node:test';import assert from 'node:assert/strict';
import {analyze,intakeAgent,reusePreparedInput}from'../src/analysis.js';
import {validateInput,AnalysisPipeline}from'../src/ai/pipeline.js';
import {ObservationAIWorker}from'../src/ai/observation-worker.js';
import {BoundedQueue}from'../src/ai/queue.js';
import {PHISHING_ACTION}from'../src/sender.js';
const message='Facebook: Váš reklamní účet bude zablokován kvůli porušení reklamních zásad. Ihned klikněte na odkaz https://account-review.example a potvrďte své údaje.';
const input=(content=message,sender)=>({type:'text',content,...(sender!==undefined?{sender}:{})});
const ids=r=>r.signals.map(s=>s.id);
test('sender accepts email, phone, name and empty; rejects invalid/oversized types and controls',()=>{
 for(const value of ['info@firma.cz','+420777123456','Česká pošta','',undefined])assert.doesNotThrow(()=>validateInput(input('Běžná zpráva.',value)));
 for(const value of [null,42,{},'x'.repeat(257),'info@firma.cz\r\nInjected: yes'])assert.throws(()=>validateInput(input('Běžná zpráva.',value)),e=>e.code==='INVALID_INPUT');
});
test('advertising and user accounts do not imply payment; financial requests remain detected',()=>{
 for(const content of [message,'Porušili jste zásady reklamy. Obnovte přístup ke svému účtu.','Vítejte ve svém uživatelském účtu.','Převeďte soubor do jiného formátu.'])assert.ok(!ids(analyze(input(content))).includes('money'),content);
 for(const content of ['Zaplaťte fakturu 500 Kč.','Uhraďte nedoplatek.','Převeďte peníze na účet.','Pošli mi peníze.'])assert.ok(ids(analyze(input(content))).includes('money'),content);
});
test('combined phishing with mismatched and lookalike sender gets immediate non-categorical guidance',()=>{
 for(const sender of ['Facebook <support@facebook-account.example>','support@facebookmail.com.evil.example','security@faceb00k.com','security@fаcebook.com']){
  const r=analyze(input(message,sender));assert.ok(ids(r).some(id=>['sender_mismatch','sender_impersonation'].includes(id)),sender);assert.equal(r.recommended_actions[0],PHISHING_ACTION);assert.ok(!r.summary.includes('je to podvod'));
 }
 assert.equal(analyze(input('Facebook: váš účet bude zablokován. Ihned klikněte na odkaz a přihlaste se zde.','security@other.example')).recommended_actions[0],PHISHING_ACTION);
});
test('known domains/names do not prove authenticity, lower content risk or create bogus sender findings',()=>{
 const plain=analyze(input(message));for(const sender of ['security@facebookmail.com','security@support.facebook.com','Facebook','+420777123456']){
  const r=analyze(input(message,sender));assert.ok(!ids(r).includes('sender_mismatch'));assert.ok(r.risk_score>=plain.risk_score);assert.equal(r.recommended_actions[0],PHISHING_ACTION);assert.ok(r.uncertainties.some(s=>s.includes('neověřujeme')));
 }
 const r=analyze(input('Ahoj, zítra se potkáme u knihovny.','info@firma.cz'));assert.ok(!ids(r).some(id=>id.startsWith('sender_')));
});
test('trusted prepared input cannot reuse previous sender findings after sender replacement',()=>{
 const original=input(message,'security@other.example'),prepared=intakeAgent(original);
 assert.equal(reusePreparedInput({...original,sender:'security@facebookmail.com'},prepared).sender,'security@facebookmail.com');
 assert.ok(!ids(analyze(reusePreparedInput({...original,sender:'security@facebookmail.com'},prepared))).includes('sender_mismatch'));
});
test('sender is absent from provider messages, signal hints, model selection and questionnaire metadata',async()=>{
 let seen=[],models=[],calls=0;
 const worker=new ObservationAIWorker({provider:{complete:async request=>{seen.push(JSON.stringify(request.messages));models.push(request.model);calls++;return{schema_version:'observations-v1',observations:[],uncertainty:'high',insufficient_information:true};}},budget:{reserve:()=>{}},config:{simpleModel:'simple',complexModel:'complex',inputPrice:0.4,outputPrice:1.6,maxInputTokens:24000,maxOutputTokens:800,retries:0,criticEnabled:false}});
 const pipeline=new AnalysisPipeline({mode:'ai',fallbackToRules:true,worker,queue:new BoundedQueue({concurrency:1})});
 for(const sender of [undefined,'Facebook <private-person@unknown.example>'])await pipeline.analyze({...input('Ihned klikněte na odkaz https://example.invalid',sender),ai_consent:true});
 assert.equal(calls,2);assert.equal(seen[0],seen[1]);assert.equal(models[0],models[1]);assert.ok(!seen.join('').includes('private-person'));assert.ok(!seen.join('').includes('sender_mismatch'));
 const noConsent=await pipeline.analyze({...input(message,'private-person@unknown.example'),ai_consent:false});assert.equal(noConsent.ai_fallback_reason,'declined');assert.equal(calls,2);pipeline.close();
});
