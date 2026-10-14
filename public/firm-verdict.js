import {createCheckResult,isSafeCopy} from './verdict-model.js';
// The server supplies only minimized registry data and deterministic findings.
export function fromFirm(p,findings=[]){
 const facts=[],sources=[],required=['ares','res','isir'],i=p.identity,r=p.register||{},v=p.vat||{},at=p.checkedAt;
 const url='https://ares.gov.cz/ekonomicke-subjekty?ico='+p.query.ico;
 const fact=(id,label,value,source='ARES',observedAt=at)=>{if(value!=null&&isSafeCopy(String(value)))facts.push({id,label,value:String(value),kind:'registry',source,observedAt,sourceUrl:source==='ARES'?url:'https://adisspr.mfcr.cz/pmd/dokumentace/webove-sluzby-spolehlivost-platcu'});};
 sources.push({id:'ares',label:'ARES – základní údaje',status:i?'checked':p.notFound?'not_found':'unavailable',checkedAt:at});
 if(!i){if(p.notFound)fact('ares_presence','Výsledek vyhledání v ARES','Subjekt s tímto IČO nebyl nalezen.');}
 else{
  fact('name','Obchodní název',i.name);fact('ico','IČO',i.ico);fact('legal_form','Právní forma',i.legalForm||i.legalFormCode);fact('seat',i.soleTrader?'Obec sídla podnikání':'Sídlo',i.seat);fact('founded','Datum vzniku',i.founded);fact('dic','DIČ',!i.soleTrader&&/^CZ\d{8}$/.test(i.dic||'')?i.dic:null);
  if(i.sourceUpdated)fact('source_updated','Datum aktualizace ARES',i.sourceUpdated);
  for(const [n,x]of(i.nace||[]).entries())fact('nace_'+n,'CZ-NACE',x.text||x.code);
  if(p.employees)fact('employees','Kategorie zaměstnanců (RES)',p.employees.label);
  fact('dissolved','Zánik / výmaz',i.dissolved||r.deletedOn||(r.state==='VYMAZAN'?'Veřejný rejstřík uvádí výmaz.':null));
  if(r.state){fact('vr_presence','Veřejný rejstřík',r.state==='AKTIVNI'?'Záznam bez uvedeného výmazu.':'Vymazán z rejstříku.');fact('file_no','Spisová značka',r.fileNo);fact('capital','Základní kapitál',r.capital?r.capital.amount+' Kč':null);fact('liquidation','Likvidace',r.liquidation?.active?'Aktuální zápis o likvidaci.':null);
   fact('leadership_changes','Změny vedení za 12 měsíců',String(r.statutoryChanges12m));fact('ownership_changes','Změna vlastníka i vedení',r.ownerAndLeadershipChanged90d?'Nedávná souběžná změna.':null);
   for(const [n,x]of(r.statutory||[]).slice(0,15).entries())fact('statutory_'+n,'Aktuální vedení',x.name+' – '+(x.role||'funkce neuvedena')+(x.since?', od '+x.since:''));
   for(const [n,x]of(r.owners||[]).slice(0,15).entries())fact('owner_'+n,'Aktuální společník',x.name+(x.since?', od '+x.since:''));
   const entries=[...(r.insolvency?.entries||[]),...(r.insolvency?.bankruptcy||[])];
   fact('insolvency_active','Zápisy bez výmazu',String(entries.filter(e=>!e.deletedOn).length));fact('insolvency_historic','Zápisy s uvedeným výmazem',String(entries.filter(e=>e.deletedOn).length));
  }else if(r.status==='NENÍ_V_REJSTŘÍKU')fact('vr_presence','Veřejný rejstřík','ARES uvádí, že subjekt není ve veřejném rejstříku.');
  fact('isir_flag','Stav zdroje ISIR v ARES',p.isirFlag==='AKTIVNI'?'ARES uvádí záznam; může být i historický.':p.isirFlag==='NEEXISTUJICI'?'ARES neuvádí záznam v tomto zdroji.':p.isirFlag);
  if(!['NOT_APPLICABLE','NEOVĚŘENO'].includes(v.status)){fact('vat_status','Status v Registru DPH',({PLATCE_DPH:'Plátce DPH',IDENTIFIKOVANA_OSOBA:'Identifikovaná osoba',NESPOLEHLIVA_OSOBA:'Nespolehlivá osoba',SKUPINA_DPH:'Skupina DPH',NENALEZEN:'Záznam nebyl nalezen'})[v.status],'DPH',at);fact('vat_unreliable','Údaj Registru DPH',v.status==='NESPOLEHLIVA_OSOBA'?'Veden jako nespolehlivá osoba.':v.unreliable==='ANO'?'Veden jako nespolehlivý plátce DPH.':v.unreliable==='NE'?'Není veden jako nespolehlivý plátce DPH.':'Záznam nebyl nalezen.','DPH',at);fact('vat_generated','Datum odpovědi Registru DPH',v.generatedOn,'DPH',at);
   if(v.unreliableSince)fact('vat_since','Zveřejnění nespolehlivosti',v.unreliableSince,'DPH',at);
   for(const [n,x]of(v.publishedAccounts||[]).slice(0,15).entries())fact('vat_account_'+n,'Zveřejněný účet',x.display+' (zveřejněno '+x.publishedOn+')','DPH',at);
  }
 }
 const vrApplicable=Boolean(i&&!i.soleTrader&&i.registrations?.stavZdrojeVr!=='NEEXISTUJICI');if(vrApplicable)required.push('vr');
 sources.push({id:'vr',label:'Veřejný rejstřík přes ARES',status:!i?'skipped':!vrApplicable?'not_applicable':r.state?'checked':'unavailable',checkedAt:at,note:r.status==='NEOVĚŘENO'?'Veřejný rejstřík neověřen. Zdroj je nedostupný.':!vrApplicable?'Kontrola se na tento subjekt nevztahuje.':'Kontrola proběhla; nejde o potvrzení vhodnosti obchodu.'});
 sources.push({id:'isir',label:'Stav zdroje ISIR v ARES (ne přímá lustrace)',status:i&&['AKTIVNI','ZANIKLY','NEEXISTUJICI','HISTORICKY','BUDOUCI','POZASTAVENY','LOGICKY_SMAZANY'].includes(p.isirFlag)?'checked':'unavailable',checkedAt:at,note:'Aktuální stav řízení ověřte přímo v insolvenčním rejstříku.'});
 sources.push({id:'res',label:'RES přes ARES',status:p.resVerified?'checked':'unavailable',checkedAt:at});
 const dphApplicable=Boolean(i&&!i.soleTrader&&/^CZ\d{8}$/.test(i.dic||''));if(dphApplicable)required.push('dph');
 sources.push({id:'dph',label:'Registr DPH',status:!i?'skipped':!dphApplicable?'not_applicable':v.status==='NEOVĚŘENO'?'unavailable':'checked',checkedAt:at,note:v.maintenance?'Registr DPH má plánovanou odstávku.':v.status==='NEOVĚŘENO'?'Registr DPH je teď nedostupný. Údaje jsme neověřili.':!dphApplicable?'Bez firemního DIČ nebo u fyzických osob kontrolu DPH neprovádíme.':'Kontrola proběhla; nejde o hodnocení obchodní spolehlivosti.'});
 const missingEvidence=findings.some(f=>f.evidence.some(id=>!facts.some(x=>x.id===id)));
 if(missingEvidence){sources[0].status='unavailable';findings=[];facts.length=0;}
 const actions=findings.filter(f=>f.severity!=='info').map(f=>f.action);
 return createCheckResult({checker:'firm',facts,findings,sources,policy:{primary:'ares',required,canConfirmAbsence:true},actions:{primary:actions[0]||(!i?'Zkontrolujte IČO u protistrany a zkuste kontrolu znovu.':'Před platbou si potvrďte platební údaje firmy jinou cestou.'),secondary:actions.slice(1,4)},checkedAt:at,ai:{status:'not_performed'},unknowns:['Údaje ARES mají informativní charakter a nejsou úřední listinou. Pro úřední účely použijte výpis z příslušného rejstříku.','Neověřujeme vztah firmy ke konkrétnímu webu, recenze ani soudní spory. Insolvenční údaje z ARES mohou být opožděné.',...(i?.soleTrader?['Sídlo podnikání může být bydliště; zobrazujeme jen obec.']:[])],verifyLinks:[{label:'ARES – detail subjektu',url},{label:'Veřejný rejstřík a Sbírka listin',url:'https://or.justice.cz/ias/ui/rejstrik-$firma?ico='+p.query.ico},{label:'Ověřit přímo v insolvenčním rejstříku',url:'https://isir.justice.cz/isir/ueu/vysledek_lustrace.do?ic='+p.query.ico},{label:'Registr DPH – ruční ověření',url:'https://adisspr.mfcr.cz/pmd/'}]});
}
