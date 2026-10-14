import{rulesForContract,validateContractInput,DEFINITIONS,CLASSIFICATIONS}from'./contract-core.js';
import{anonymizeContract,originalRange,pageAt}from'./contract-privacy.js';
import{mergeContractResults,eligibleCatalog}from'./contract-verify.js';
import{extractContractPdf}from'./contract-pdf.js';
import{characterAssets}from'./character-assets.js';
import{fromContract}from'./verdict-adapters.js';
import{createShareControl,shareCategory}from'./share-result.js';
export function contractPayload({sent,contractType,aiConsent,previewApproved,botToken}){
 if(aiConsent!==true||previewApproved!==true)throw Error('Nejdříve potvrďte souhlas a přesný náhled textu.');
 return validateContractInput({content:sent,contract_type:contractType,ai_consent:true,bot_token:botToken||''});
}
export async function runContractCheck({original,contractType='unknown',aiConsent=false,previewApproved=false,sent,map=[],botToken,transport,catalog=[]}){
 const local=rulesForContract(original,contractType);
 if(aiConsent!==true)return mergeContractResults(local,{findings:[],questions:[]},contractType,catalog);
 if(['loan','other'].includes(contractType))return{...local,mode:'rules_fallback',fallback_reason:'UNSUPPORTED_CONTRACT_TYPE'};
 const input=contractPayload({sent,contractType,aiConsent,previewApproved,botToken});const result=await transport(input);
 if(!result||!Array.isArray(result.findings))throw Error('Odpověď nelze ověřit.');
 const restored=[];for(const f of result.findings){if(result.mode!=='rules+ai'||!['ai','rules+ai'].includes(f.source))continue;if(!Object.hasOwn(DEFINITIONS,f.category)||!Object.hasOwn(CLASSIFICATIONS,f.classification)||!Number.isInteger(f.start)||!Number.isInteger(f.end)||f.end<=f.start||f.start<0||f.end>sent.length||f.quote!==sent.slice(f.start,f.end)||f.quote.length<20||f.quote.length>600)continue;const range=originalRange(f.start,f.end,map),quote=range?original.slice(range.start,range.end):null;
  restored.push({...f,quote:quote&&quote.length<=600?quote:f.quote,start:range?.start??f.start,end:range?.end??f.end,page:range?pageAt(original,range.start):null,anonymous:!range||!quote||quote.length>600,unmapped:!range});
 }
 const merged=mergeContractResults(local,{findings:restored,questions:result.mode==='rules+ai'&&Array.isArray(result.questions_before_signing)?result.questions_before_signing:[]},contractType,catalog);return{...merged,mode:result.mode,fallback_reason:result.fallback_reason,contract_type_guess:result.contract_type_guess,insufficient_text:merged.insufficient_text||result.insufficient_text};
}
if(typeof document!=='undefined'){
 const $=id=>document.getElementById(id),form=$('contract-form'),input=$('contract-text'),entry=$('contract-entry'),resultEl=$('contract-result');
 const types={consumer_services:'Služby a předplatné',energy:'Energie',eshop_terms:'Obchodní podmínky',work_contract:'Dílo a řemeslník',loan:'Úvěr či půjčka',unknown:'Jiná / nevím'};
 let original='',redacted=null,manual=[],active,parseActive,capabilities={configured:false},catalog=[],previewSource='',questions=[];
 for(const [value,label]of Object.entries(types)){const wrap=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='contract_type';radio.value=value;radio.checked=value==='unknown';wrap.append(radio,document.createTextNode(label));$('contract-types').append(wrap);radio.addEventListener('change',invalidate);}
 const type=()=>form.querySelector('input[name=contract_type]:checked').value;
 for(const id of ['contract-verka','contract-result-verka'])$(id).src=characterAssets['verka-explaining'];$('contract-robo').src=characterAssets['robo-analyzing'];
 for(const d of Object.values(DEFINITIONS)){const li=document.createElement('li');li.textContent=d.title;$('contract-categories').append(li);}
 // Without JavaScript the submit button stays disabled, so the text can never be sent as a GET query (CR-08).
 form.querySelector('button[type=submit]').disabled=false;
 // The AI option is offered only when the server reports a fully configured runtime.
 fetch('/api/contract-status',{credentials:'omit'}).then(r=>r.ok?r.json():{}).then(v=>{capabilities=v&&v.configured===true?v:{configured:false};$('contract-ai-option').hidden=!capabilities.configured;if(!capabilities.configured){$('contract-ai').checked=false;$('contract-redaction').hidden=true;invalidate();}}).catch(()=>{});
 fetch('/contract-legal-catalog.json',{credentials:'omit'}).then(r=>r.ok?r.json():[]).then(v=>{catalog=eligibleCatalog(v);}).catch(()=>{});
 function invalidate(){active?.abort();redacted=null;previewSource='';$('contract-preview').replaceChildren();$('contract-preview-approved').checked=false;}
 input.addEventListener('input',()=>{manual=[];invalidate();$('contract-count').textContent=input.value.length+' / 40 000 znaků';});
 $('contract-anonymize').addEventListener('change',invalidate);
 $('contract-ai').addEventListener('change',()=>{$('contract-redaction').hidden=!$('contract-ai').checked;invalidate();});
 $('contract-redact-selected').addEventListener('click',()=>{if(input.selectionEnd<=input.selectionStart){showError('V textu nejdříve označte údaj, který chcete skrýt.');return;}manual.push({start:input.selectionStart,end:input.selectionEnd});invalidate();preparePreview();});
 $('contract-clear-redactions').addEventListener('click',()=>{manual=[];invalidate();preparePreview();});
 function node(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
 function showError(message){$('contract-error').textContent=message;$('contract-error').hidden=false;}
 function preparePreview(){original=input.value.normalize('NFC');if(original!==input.value){input.value=original;manual=[];}redacted=anonymizeContract(original,{automatic:$('contract-anonymize').checked,manual});previewSource=original;const box=$('contract-preview');box.replaceChildren();let cursor=0;for(const r of redacted.map){box.append(document.createTextNode(redacted.sent.slice(cursor,r.sentStart)),node('mark',redacted.sent.slice(r.sentStart,r.sentEnd)));cursor=r.sentEnd;}box.append(document.createTextNode(redacted.sent.slice(cursor)));$('contract-preview-approved').checked=false;}
 $('contract-preview-button').addEventListener('click',preparePreview);
 $('contract-file').addEventListener('change',async()=>{const file=$('contract-file').files[0];$('contract-file').value='';if(!file)return;$('contract-error').hidden=true;input.value='';manual=[];invalidate();parseActive?.abort();parseActive=new AbortController();busy('Čteme PDF pouze ve vašem prohlížeči.');$('contract-cancel-pdf').hidden=false;
  try{const r=await extractContractPdf(file,{signal:parseActive.signal,onProgress:(page,total)=>{$('contract-status-text').textContent='Čteme PDF: strana '+page+' z '+total;}});input.value=r.text;manual=[];invalidate();$('contract-count').textContent=r.pages+' stran, '+r.text.length+' znaků';}catch(e){showError(e.message);$('contract-robo').src=characterAssets['robo-error'];}finally{$('contract-cancel-pdf').hidden=true;doneBusy();}
 });
 $('contract-cancel-pdf').addEventListener('click',()=>parseActive?.abort());
 function busy(message){form.setAttribute('aria-busy','true');$('contract-status').hidden=false;$('contract-status-text').textContent=message;$('contract-robo').src=characterAssets['robo-analyzing'];form.querySelector('button[type=submit]').disabled=true;}
 function doneBusy(){form.removeAttribute('aria-busy');$('contract-status').hidden=true;form.querySelector('button[type=submit]').disabled=false;}
 $('contract-cancel').addEventListener('click',()=>{active?.abort();parseActive?.abort();});
 async function botToken(signal){
  if(!capabilities.site_key)throw Error('Bot kontrola zatím není dostupná.');
  if(signal.aborted)throw Error('Kontrola byla zrušena.');
  if(!window.turnstile)await new Promise((resolve,reject)=>{
   const script=document.createElement('script');let settled=false;
   const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timeout);signal.removeEventListener('abort',abort);script.onload=null;script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
   const abort=()=>finish(Error('Kontrola byla zrušena.'));
   const timeout=setTimeout(()=>finish(Error('Bot kontrolu nelze načíst.')),10000);
   script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=()=>finish();script.onerror=()=>finish(Error('Bot kontrolu nelze načíst.'));signal.addEventListener('abort',abort,{once:true});document.head.append(script);
  });
  if(signal.aborted||!window.turnstile)throw Error('Bot kontrolu nelze načíst.');
  return await new Promise((resolve,reject)=>{
   let widget,settled=false;
   const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timeout);signal.removeEventListener('abort',abort);if(widget!==undefined)window.turnstile.remove(widget);fn(value);};
   const abort=()=>finish(reject,Error('Kontrola byla zrušena.'));
   const timeout=setTimeout(()=>finish(reject,Error('Bot kontrola nebyla dokončena.')),60000);
   signal.addEventListener('abort',abort,{once:true});
   try{widget=window.turnstile.render($('contract-turnstile'),{sitekey:capabilities.site_key,action:'contract-check',size:'compact',callback:token=>finish(resolve,token),'error-callback':()=>finish(reject,Error('Bot kontrola se nezdařila.')),'expired-callback':()=>finish(reject,Error('Bot ověření vypršelo.'))});if(settled)window.turnstile.remove(widget);}catch{finish(reject,Error('Bot kontrola se nezdařila.'));}
  });
 }
 form.addEventListener('submit',async event=>{event.preventDefault();$('contract-error').hidden=true;active?.abort();active=new AbortController();const signal=active.signal;original=input.value.normalize('NFC');let timers=[];
  try{if(!original.trim()||original.length>40000)throw Error('Vložte text nejvýše 40 000 znaků.');const consent=capabilities.configured===true&&$('contract-ai').checked;
   if(consent&&(!redacted||previewSource!==original||!$('contract-preview-approved').checked))throw Error('Nejprve připravte a zkontrolujte přesný náhled textu pro AI.');
   busy(consent?'Připravujeme kontrolu s AI.':'Prověřujeme text pouze ve vašem prohlížeči.');let token='',botFailure=null;if(consent&&capabilities.configured&&!['loan','other'].includes(type())){try{token=await botToken(signal);}catch(e){if(signal.aborted)throw e;botFailure='BOT_CHECK_REQUIRED';}}
   const transport=async payload=>{if(botFailure||!capabilities.configured)return{...rulesForContract(payload.content,payload.contract_type),mode:'rules_fallback',fallback_reason:botFailure||'AI_INVALID_CONFIG'};
    const session=await fetch('/api/session',{signal});if(!session.ok)throw Error('AI kontrolu nelze zahájit.');
    timers=[setTimeout(()=>{$('contract-status-text').textContent='Robo ještě kontroluje citace.';},8000),setTimeout(()=>{$('contract-status-text').textContent='Delší smlouva potřebuje více času. Můžete počkat nebo kontrolu zrušit.';},20000)];
    const response=await fetch('/api/analyze-contract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.any([signal,AbortSignal.timeout(50000)])});if(!response.ok)throw Error('AI kontrola není dostupná.');return response.json();};
   let result;try{result=await runContractCheck({original,contractType:type(),aiConsent:consent,previewApproved:$('contract-preview-approved').checked,sent:redacted?.sent,map:redacted?.map||[],botToken:token,transport,catalog});}catch(e){if(signal.aborted)throw e;result={...rulesForContract(original,type()),mode:'rules_fallback',fallback_reason:'AI_UNAVAILABLE'};}
   if(signal.aborted)throw Error('Kontrola byla zrušena.');render(result);mountShare(result);showParties(original,result);entry.hidden=true;resultEl.hidden=false;resultEl.focus({preventScroll:true});resultEl.scrollIntoView({block:'start'});$('contract-robo').src=characterAssets['robo-success'];
  }catch(e){showError(e.message);$('contract-robo').src=characterAssets['robo-error'];}finally{timers.forEach(clearTimeout);doneBusy();}
 });
 // Stage 8: share the final contract result; category from the existing fromContract adapter (D2).
 // A combined result (after the party choice) brings its own control and replaces this one.
 function mountShare(result){
  document.getElementById('contract-share')?.remove();
  const control=createShareControl(document,'contract',shareCategory(fromContract(result).level));control.id='contract-share';
  $('contract-copy-status').after(control);
 }
 function render(result){
  const findings=result.findings;$('contract-findings').replaceChildren();$('contract-summary').textContent=findings.length?'Našli jsme '+findings.length+' ustanovení, která stojí za pozornost. Nejde o právní posouzení.':'Nenašli jsme ustanovení z oblastí, které sledujeme. Neznamená to, že je smlouva v pořádku.';
  $('contract-action').textContent=findings.length?'Než podepíšete: '+findings[0].what_to_check[0]:'Před podpisem si ověřte cenu, způsob ukončení a všechny související dokumenty.';
  $('contract-mode').textContent=result.mode==='rules+ai'?'Pravidla a AI prověřily odeslaný text. Neověřitelné citace se nezobrazují.':result.mode==='rules_fallback'?'AI nebyla použita nebo kontrolu nedokončila. Zobrazujeme pouze místní pravidla.':'Zvolili jste kontrolu bez AI. Text neopustil váš prohlížeč.';
  const shortText=result.insufficient_text?'Text je velmi krátký nebo neúplný. Zkontrolujte, zda jste vložili celou smlouvu. ':'';const unsupported=['loan','other'].includes(type())||['loan','other'].includes(result.contract_type_guess);$('contract-type-warning').textContent=shortText+(unsupported?'Tento typ smlouvy zatím podrobně neprověřujeme. Doporučujeme konzultaci; u půjčky použijte Prověřit půjčku.':result.contract_type_guess&&result.contract_type_guess!=='unknown'&&type()!=='unknown'&&result.contract_type_guess!==type()?'Text může patřit k jinému typu smlouvy. Odhad může být chybný; obecné nálezy ukazujeme dál.':'');
  for(const f of findings){const card=document.createElement(f.classification==='common'?'details':'section');card.className='contract-finding';const heading=document.createElement(f.classification==='common'?'summary':'h3');heading.textContent=CLASSIFICATIONS[f.classification]+' · '+DEFINITIONS[f.category].title;card.append(heading);const guide=document.createElement('img');guide.src=characterAssets[f.source==='ai'?'robo-success':'verka-explaining'];guide.alt=f.source==='ai'?'Robo':'Věrka';guide.width=96;guide.height=96;card.append(guide);
   card.append(node('p','Jistota rozpoznání: '+({high:'vysoká',medium:'střední',low:'nízká'}[f.confidence]||'nízká')+(f.anonymous?' · anonymizovaná citace':' · strana '+(f.page||pageAt(original,f.start)))));
   const quote=node('blockquote',f.quote);quote.setAttribute('cite','#contract-text');card.append(quote,node('p','Co to znamená: '+f.plain_explanation),node('p','Proč pozor: '+f.why_it_matters));const ul=document.createElement('ul');for(const q of f.what_to_check)ul.append(node('li',q));card.append(node('h4','Ověřte si'),ul,node('p','Zdroj nálezu: '+(f.source==='rules+ai'?'Našla pravidla a potvrdila AI':f.source==='ai'?'Doplnila AI':'Našla naše pravidla')));
   if(f.legal){const legal=node('div',f.legal.title+' — '+f.legal.text+' Ověřeno k '+f.legal.verified_at+'. Právní úprava se může změnit.');legal.className='contract-legal';for(const source of f.legal.sources){const a=node('a',source.label);a.href=source.url;a.rel='noopener noreferrer';legal.append(a);}card.append(legal);} $('contract-findings').append(card);
  }
  questions=result.questions_before_signing.length?result.questions_before_signing:['Znám celkovou cenu, způsob ukončení a všechny přílohy?'];$('contract-questions').replaceChildren();for(const q of questions)$('contract-questions').append(node('li',q));
 }
 $('contract-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(questions.join('\n'));$('contract-copy-status').textContent='Otázky byly zkopírovány.';}catch{$('contract-copy-status').textContent='Otázky můžete označit a zkopírovat ručně.';}});
 $('contract-print').addEventListener('click',()=>window.print());
 // S5.3 Contract → Firm. The user chooses which party (IČO) to check; nothing is assumed and
 // nothing is sent before that choice. Only {"ico"} goes to /api/firm (via check-flow.js); the
 // contract text and the local result are adopted in this browser (no second evaluation).
 let partyFlow,partyContract='',partyResult=null,partyBusy=false;
 const loadParty=()=>Promise.all([import('/check-flow.js'),import('/web-checker.js'),import('/eshop-checker.js')]);
 async function showParties(contract,result){
  partyContract=contract;partyResult=result;const section=$('contract-party'),options=$('contract-party-options');
  $('contract-party-error').hidden=true;$('contract-party-ico').value='';options.replaceChildren();
  try{const [flow]=await loadParty();partyFlow=flow;}catch{section.hidden=true;return;}
  if(partyContract!==contract)return;
  const {candidates,invalid}=partyFlow.contractParties(contract);
  $('contract-party-intro').textContent=candidates.length>1?'Ve smlouvě jsme našli více IČO. Nevíme, které patří které smluvní straně. Vyberte firmu, kterou chcete prověřit.':candidates.length===1?'Ve smlouvě jsme našli jedno IČO. Nevíme, které smluvní straně patří. Můžete ho prověřit nebo zadat jiné IČO.':'Ve smlouvě jsme nenašli platné IČO s označením. Pokud IČO smluvní strany znáte, můžete ho zadat ručně.';
  const bad=$('contract-party-invalid');bad.hidden=!invalid.length;bad.textContent=invalid.length?'Údaj '+invalid.join(', ')+' u označení IČO nemá platný kontrolní součet. Zkontrolujte ho ve smlouvě a případně zadejte správné IČO ručně.':'';
  for(const value of [...candidates,'manual']){
   const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='contract_party';radio.value=value;
   label.append(radio,document.createTextNode(value==='manual'?'Zadat IČO ručně':'IČO '+value));options.append(label);
  }
  section.hidden=false;
 }
 function resetParties(){partyFlow?.resetWebFirmCheck($('check-combined'));$('check-combined').replaceChildren();$('check-combined').hidden=true;$('contract-party').hidden=true;$('contract-party-options').replaceChildren();$('contract-party-ico').value='';partyContract='';partyResult=null;}
 $('contract-party-ico').addEventListener('input',()=>{const manual=$('contract-party-options').querySelector('input[value="manual"]');if(manual&&$('contract-party-ico').value.trim())manual.checked=true;});
 $('contract-party-form').addEventListener('submit',async event=>{
  event.preventDefault();if(partyBusy||!partyFlow||!partyResult)return;
  const error=$('contract-party-error'),chosen=$('contract-party-options').querySelector('input:checked');error.hidden=true;
  const ico=!chosen?'':chosen.value==='manual'?$('contract-party-ico').value.trim():chosen.value;
  if(!chosen||!ico){error.textContent='Vyberte firmu ze smlouvy nebo zadejte IČO ručně. Nic jsme neodeslali.';error.hidden=false;(chosen?$('contract-party-ico'):$('contract-party-options').querySelector('input'))?.focus();return;}
  if(!partyFlow.isValidIco(ico)){error.textContent='IČO musí mít 8 číslic a platný kontrolní součet. Nic jsme neodeslali.';error.hidden=false;$('contract-party-ico').focus();return;}
  partyBusy=true;$('contract-party-submit').disabled=true;
  try{const [,web,eshop]=await loadParty();const shown=await partyFlow.startContractFirmCheck($('check-combined'),{contract:partyContract,ico,contractResult:partyResult,checkWebUrl:web.checkWebUrl,coiResult:eshop.coiResult});if(shown)document.getElementById('contract-share')?.remove();}
  finally{partyBusy=false;$('contract-party-submit').disabled=false;}
 });
 function clearSecrets(){resetParties();active?.abort();parseActive?.abort();original='';redacted=null;manual=[];previewSource='';questions=[];input.value='';$('contract-file').value='';$('contract-preview').replaceChildren();$('contract-findings').replaceChildren();$('contract-preview-approved').checked=false;}
 $('contract-again').addEventListener('click',()=>{clearSecrets();resultEl.hidden=true;entry.hidden=false;input.focus();});window.addEventListener('pagehide',clearSecrets);
}
