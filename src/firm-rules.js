// Pure deterministic registry interpretation. No AI, scraping, or company/domain inference.
export function evaluateFirm(p,{now=Date.now()}={}){
 const findings=[],i=p.identity,r=p.register||{},v=p.vat||{};
 const add=(ruleId,severity,title,explanation,action,source,evidence)=>findings.push({id:ruleId,ruleId,origin:'registry',severity,title,explanation,action,source,evidence});
 if(p.notFound)add('F-NF','attention','Subjekt nebyl nalezen','Subjekt s tímto IČO jsme v ARES nenašli.','Ověřte IČO u protistrany.','ARES',['ares_presence']);
 if(!i)return findings;
 const a=(id,sev,title,explanation,action,evidence)=>add(id,sev,title,explanation,action,'ARES',evidence);
 if(i.dissolved||r.deletedOn||r.state==='VYMAZAN')a('F01','serious','Subjekt zanikl nebo byl vymazán','Podle prověřených údajů ARES subjekt zanikl nebo byl vymazán.','Před platbou nebo podpisem ověřte, s kým skutečně jednáte.',['dissolved']);
 if(r.liquidation?.active)a('F02','serious','Firma je v likvidaci','Ve veřejném rejstříku je aktuální likvidátor nebo zápis o likvidaci.','Neposílejte zálohy, dokud si neověříte účel obchodu a stav v rejstříku.',['liquidation']);
 const entries=[...(r.insolvency?.entries||[]),...(r.insolvency?.bankruptcy||[])],active=entries.filter(e=>!e.deletedOn),historic=entries.filter(e=>e.deletedOn);
 if(active.length)a('F03','serious','Insolvenční nebo konkurzní zápis','V prověřených údajích veřejného rejstříku je zápis bez uvedeného výmazu. Nehodnotíme důvod ani výsledek řízení.','Před platbou ověřte aktuální stav přímo v insolvenčním rejstříku.',['insolvency_active']);
 else if(historic.length)a('F04','attention','Historický insolvenční zápis','V prověřených údajích má insolvenční zápis uvedený výmaz.','Ověřte historii a výsledek řízení přímo v ISIR.',['insolvency_historic']);
 if(p.isirFlag==='AKTIVNI'&&!entries.length)a('F05','attention','Záznam v insolvenčním rejstříku','ARES uvádí záznam v ISIR. Nemusí jít o probíhající řízení.','Podrobnosti ověřte přímo v ISIR.',['isir_flag']);
 if(v.status==='NESPOLEHLIVA_OSOBA')add('F07','serious','Nespolehlivá osoba','Finanční správa vede subjekt jako nespolehlivou osobu.','Před platbou ověřte aktuální stav v Registru DPH.','DPH',['vat_status']);
 else if(v.unreliable==='ANO')add('F06','serious','Nespolehlivý plátce DPH','Finanční správa vede subjekt jako nespolehlivého plátce DPH.','Před platbou proberte případné ručení za DPH s daňovým poradcem.','DPH',['vat_unreliable']);
 const six=new Date(now);six.setUTCMonth(six.getUTCMonth()-6);
 if(i.founded&&Date.parse(i.founded)>six.getTime()&&Date.parse(i.founded)<=now)a('F09','attention','Nově vzniklá firma','Firma vznikla před méně než šesti měsíci. Nová firma nemusí být problém.','Při velké záloze ověřte zkušenosti a podmínky jejího vrácení.',['founded']);
 const threshold=i.legalFormCode==='121'&&r.statutory?.length>=5?4:2;
 if(r.statutoryChanges12m>=threshold||r.statutoryChanged90d)a('F10','attention','Nedávné změny vedení','Ve vedení firmy proběhly nedávné změny. Změna vedení může být běžná.','Ověřte, kdo dnes může za firmu jednat.',['leadership_changes']);
 if(r.ownerAndLeadershipChanged90d)a('F11','attention','Změna vlastníka i vedení','Podle prověřených zápisů se nedávno změnil vlastník i vedení.','Ověřte aktuální oprávnění k jednání a podmínky obchodu.',['ownership_changes']);
 if(i.registrations?.stavZdrojeVr==='NEEXISTUJICI'&&['112','121'].includes(i.legalFormCode))a('F12','attention','Chybí záznam ve veřejném rejstříku','Podle právní formy by společnost měla být ve veřejném rejstříku. ARES může mít zpoždění.','Ověřte zápis přímo na Justice.cz.',['vr_presence']);
 if(v.status==='NENALEZEN')add('F14','info','Subjekt nebyl nalezen v Registru DPH','Neplátcovství samo o sobě nic špatného neznamená.','Pokud potřebujete daňový doklad, ověřte daňový status s firmou.','DPH',['vat_status']);
 if(r.capital?.currency==='CZK'&&r.capital.amount<1000)a('F15','info','Nízký základní kapitál','Nízký základní kapitál je pouze kontext, nikoli varovný signál.','Posuzujte podmínky obchodu, nikoli samotnou výši kapitálu.',['capital']);
 return findings.sort((a,b)=>({serious:0,attention:1,info:2}[a.severity]-{serious:0,attention:1,info:2}[b.severity]));
}
