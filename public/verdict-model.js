// Pure schema-1 verdict foundation. No DOM, I/O, AI decision making or numeric risk output.
export const LEVELS=Object.freeze(['serious','attention','none_found','incomplete','not_assessable']);
export const CHECKERS=Object.freeze(['message','loan','web','contract','firm']);
export const RULE_CATALOG=Object.freeze({
 message:Object.freeze(['risk_high','risk_caution','urgency','link_request','account_threat','money','new_number','credentials','secrecy','investment','authority','family_cash_pickup','safe_account_transfer','unusual_characters','link','unusual_url','sender_format','sender_mismatch','sender_impersonation',...['payment_request','credential_request','install_software','remote_access','link_following','contact_switch','urgency','secrecy','claimed_authority','unrealistic_return','advance_fee','emotional_pressure'].map(x=>'ai_'+x)]),
 loan:Object.freeze(['risk_high','risk_caution','urgency','link_request','account_threat','money','new_number','credentials','secrecy','investment','authority','family_cash_pickup','safe_account_transfer','unusual_characters','link','unusual_url','sender_format','sender_mismatch','sender_impersonation',...['advance_fee','bank_login','sms_code','card_details','remote_access','id_document','guaranteed','no_registry','pressure'].map(x=>'loan_'+x),...['payment_request','credential_request','install_software','remote_access','link_following','contact_switch','urgency','secrecy','claimed_authority','unrealistic_return','advance_fee','emotional_pressure'].map(x=>'ai_'+x)]),
 web:Object.freeze(['http','idn','numeric','trailing-dot','subdomains','port','brand','encoded','redirect','phishing','coi_warning']),
 contract:Object.freeze(['penalty','auto_renewal','notice_period','unilateral_change','fees','obligation','liability_limit','arbitration','unclear']),
 firm:Object.freeze(['F-NF',...Array.from({length:16},(_,i)=>'F'+String(i+1).padStart(2,'0')).filter(x=>x!=='F13')])
});
const sourceStatuses=['checked','unavailable','not_found','not_applicable','skipped'];
export const HEADLINES=Object.freeze({serious:'Našli jsme závažné varovné signály',attention:'Stojí za pozornost',none_found:'Nenašli jsme výrazné varovné signály',incomplete:'Kontrolu se nepodařilo dokončit',not_assessable:'Z dostupných údajů nelze posoudit'});
export function isSafeCopy(s){return typeof s==='string'&&!/(?:\d\s*%|\/\s*100|risk_score|\b(?:OpenAI|Anthropic|Claude|GPT|Gemini|Llama)\b|(?:je|jsou)\s+(?:to\s+)?podvod|(?:je|jsou)\s+(?:zcela\s+)?(?:bezpečn|důvěryhodn)|(?:bezpečná|důvěryhodná)\s+(?:firma|nabídka|smlouva|zpráva)|(?<![\p{L}])spolehlivý plátce|doporučujeme obchodovat|právně v pořádku)/iu.test(s);}
const str=(s,max=1000)=>{if(typeof s!=='string'||!s.trim()||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(s)||!isSafeCopy(s))throw Error('Invalid verdict text');return s;};
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(s)&&Number.isFinite(Date.parse(s));
export function deriveLevel(findings,sources,policy){
 if(!Array.isArray(findings)||!Array.isArray(sources)||!policy||typeof policy.primary!=='string'||!Array.isArray(policy.required)||typeof policy.canConfirmAbsence!=='boolean')throw Error('Invalid verdict inputs');
 for(const f of findings)if(!f||!['rules','registry','ai'].includes(f.origin)||!['serious','attention','info'].includes(f.severity))throw Error('Invalid finding');
 for(const s of sources)if(!s||typeof s.id!=='string'||!sourceStatuses.includes(s.status))throw Error('Invalid source');
 if(new Set(sources.map(s=>s.id)).size!==sources.length)throw Error('Duplicate source');
 const status=id=>sources.find(s=>s.id===id)?.status||'unavailable';
 const decide=(level,ruleId,text)=>({level,reasons:[{ruleId,text}]});
 // L1 wins even if all sources later fail. AI serious is never a trusted red trigger.
 if(findings.some(f=>f.severity==='serious'&&f.origin!=='ai'))return decide('serious','L1','Pravidla nebo ověřený zdroj ukazují závažný varovný signál.');
 if(status(policy.primary)==='unavailable')return decide('incomplete','L2','Primární kontrolu se nepodařilo dokončit.');
 if(policy.required.some(id=>['unavailable','skipped','not_applicable'].includes(status(id)))||['skipped','not_applicable'].includes(status(policy.primary)))return decide('attention','L3','Část povinných kontrol se nepodařilo dokončit.');
 if(findings.some(f=>f.severity==='attention'||(f.origin==='ai'&&f.severity==='serious')))return decide('attention','L4','Našli jsme podněty k dalšímu ověření.');
 return policy.canConfirmAbsence?decide('none_found','L5','V prověřených zdrojích jsme nenašli výrazné varovné signály.'):decide('not_assessable','L5','Rozsah této kontroly neumožňuje potvrdit nepřítomnost rizika.');
}
const defaultActions={message:'Požadavek ověřte přes kontakt, který už znáte.',loan:'Před podpisem nebo platbou ověřte poskytovatele a všechny náklady.',web:'Před nákupem ověřte provozovatele a zkušenosti zákazníků.',contract:'Před podpisem si vyjasněte cenu, ukončení a další závazky.',firm:'Před platbou si potvrďte aktuální stav a platební údaje firmy.'};
export function createCheckResult({checker,findings=[],facts=[],sources=[],policy,actions,unknowns=[],ai=null,verifyLinks=[],checkedAt=new Date().toISOString()}){
 if(!CHECKERS.includes(checker))throw Error('Unknown checker');
 const cleanFindings=findings.map(f=>({id:f.id,ruleId:f.ruleId,origin:f.origin,severity:f.origin==='ai'&&f.severity==='serious'?'attention':f.severity,title:f.title,explanation:f.explanation,evidence:[...(f.evidence||[])]}));
 const d=deriveLevel(cleanFindings,sources,policy);
 const secondary=[...new Set(actions?.secondary||[])].filter(s=>s!==actions?.primary).slice(0,3);
 const result={schema:1,checker,level:d.level,headline:HEADLINES[d.level],reasons:d.reasons,actions:{primary:actions?.primary||defaultActions[checker],secondary},facts:facts.map(f=>Object.fromEntries(['id','label','value','kind','source','sourceDetail','observedAt','sourceUrl'].filter(k=>f[k]!==undefined).map(k=>[k,f[k]]))),findings:cleanFindings,ai:ai?{status:ai.status,...(ai.status==='performed'?{summary:'AI hodnocení je odhad; nejde o ověřené skutečnosti.'}:{})}:null,unknowns:[...unknowns],sources:sources.map(s=>Object.fromEntries(['id','label','status','checkedAt','note'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]))),verifyLinks:structuredClone(verifyLinks),checkedAt};
 return validateCheckResult(result);
}
export function validateCheckResult(r){
 if(!r||r.schema!==1||!CHECKERS.includes(r.checker)||!LEVELS.includes(r.level)||r.headline!==HEADLINES[r.level]||!iso(r.checkedAt))throw Error('Invalid CheckResult');
 const keys=['schema','checker','level','headline','reasons','actions','facts','findings','ai','unknowns','sources','verifyLinks','checkedAt'];if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('Unknown result field');
 for(const key of ['reasons','facts','findings','unknowns','sources','verifyLinks'])if(!Array.isArray(r[key])||r[key].length>100)throw Error('Invalid result list');
 str(r.actions?.primary);if(!Array.isArray(r.actions?.secondary)||r.actions.secondary.length>3)throw Error('Invalid actions');r.actions.secondary.forEach(s=>str(s));r.unknowns.forEach(s=>str(s));
 for(const reason of r.reasons){if(!/^L[1-5]$/.test(reason.ruleId))throw Error('Reason');str(reason.text);}
 const ids=new Set();for(const f of r.facts){str(f.id,100);if(ids.has(f.id))throw Error('Duplicate fact');ids.add(f.id);str(f.label);str(f.value,2000);if(!['registry','user_input','calculated'].includes(f.kind))throw Error('Fact kind');if(f.kind==='registry'&&(!['ARES','DPH','COI'].includes(f.source)||!iso(f.observedAt)))throw Error('Unverified registry fact');if(f.kind==='user_input'&&f.source!=='user'||f.kind==='calculated'&&f.source!=='calc')throw Error('Fact origin');if(f.sourceDetail)str(f.sourceDetail);if(f.sourceUrl&&!approvedLink(f.sourceUrl))throw Error('Unsafe fact link');}
 const findingIds=new Set();for(const f of r.findings){str(f.id,100);if(findingIds.has(f.id))throw Error('Duplicate finding');findingIds.add(f.id);if(!RULE_CATALOG[r.checker].includes(f.ruleId)||!['rules','registry','ai'].includes(f.origin)||!['serious','attention','info'].includes(f.severity)||f.origin==='ai'&&f.severity==='serious')throw Error('Finding invariant');str(f.title);str(f.explanation);if(!Array.isArray(f.evidence)||f.evidence.some(id=>!ids.has(id)))throw Error('Missing evidence');if(f.origin==='registry'&&(!f.evidence.length||f.evidence.some(id=>r.facts.find(x=>x.id===id)?.kind!=='registry')))throw Error('Registry finding requires verified evidence');}
 for(const s of r.sources){str(s.id,100);str(s.label);if(!sourceStatuses.includes(s.status)||['checked','not_found'].includes(s.status)&&!iso(s.checkedAt))throw Error('Source provenance');if(s.note)str(s.note);}
 if(r.ai){if(!['performed','not_performed','unavailable'].includes(r.ai.status))throw Error('AI status');if(r.ai.summary){if(r.ai.status!=='performed')throw Error('AI not performed');str(r.ai.summary);}}
 for(const link of r.verifyLinks){str(link.label);if(!approvedLink(link.url))throw Error('Unsafe verification link');}
 if(r.level==='serious'&&!r.findings.some(f=>f.severity==='serious'&&f.origin!=='ai'))throw Error('Unsupported red');
 if(r.findings.some(f=>f.severity==='serious'&&f.origin!=='ai')&&r.level!=='serious')throw Error('Lowered trusted risk');
 return r;
}
export function approvedLink(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['ares.gov.cz','coi.gov.cz','or.justice.cz','isir.justice.cz','adisspr.mfcr.cz','financnisprava.gov.cz','www.cnb.cz'].includes(u.hostname);}catch{return false;}}
export function limitationFor(checker){return checker==='contract'?'Kontrola nenahrazuje právní posouzení a nepotvrzuje platnost smlouvy.':`To neznamená, že je ${checker==='firm'?'firma':checker==='web'?'web':checker==='loan'?'nabídka':'zpráva'} bezpečná. Ověřili jsme jen zdroje uvedené níže.`;}
