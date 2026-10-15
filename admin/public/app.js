const notice=document.querySelector('#notice');
function text(parent,tag,value){const e=document.createElement(tag);e.textContent=value;parent.append(e);}
async function load(){try{const response=await fetch('/api/dashboard',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();const traffic=document.querySelector('#traffic');traffic.replaceChildren();if(['available','stale'].includes(data.traffic.status)){for(const [label,key]of [['HTTP požadavky za 24 hodin','requests24h'],['HTTP požadavky za 7 dní','requests7d'],['Blokované HTTP požadavky za 24 hodin','blocked24h'],['Blokované HTTP požadavky za 7 dní','blocked7d']]){text(traffic,'p',label);text(traffic,'strong',data.traffic[key]==null?'Data zatím nejsou dostupná':new Intl.NumberFormat('cs-CZ').format(data.traffic[key]));}text(traffic,'p','Pouze verimtomu.fyi. Blokované požadavky odpovídají akci block; nejde o počet všech bezpečnostních událostí. Počet návštěvníků neměříme.');text(traffic,'p','Samostatné bezpečnostní události: data zatím nejsou dostupná.');text(traffic,'p','Aktualizováno '+new Date(data.traffic.updated).toLocaleString('cs-CZ'));if(data.traffic.status==='stale')text(traffic,'p','Poslední obnovení se nepodařilo. Zobrazujeme dříve získaná data.');}else{text(traffic,'p','Data zatím nejsou dostupná');text(traffic,'p',data.traffic.issue==='not_configured'?'Cloudflare API ještě není připojeno.':'Cloudflare data se nepodařilo načíst.');}renderUsage(data.usage);const op=document.querySelector('#operations');op.replaceChildren();text(op,'p','Dashboard odpovídá');text(op,'p','Běží '+Math.floor(data.operations.uptimeSeconds/60)+' minut');notice.textContent='Přehled je načtený.';}catch{notice.textContent='Přehled se nepodařilo načíst. Obnovte stránku nebo se znovu přihlaste přes Cloudflare Access.';}}
load();setInterval(load,60000);

function renderUsage(data){const ai=document.querySelector('#ai-usage');ai.replaceChildren();text(ai,'p','Data zatím nejsou dostupná');const target=document.querySelector('#usage');target.replaceChildren();if(!['available','stale'].includes(data.status)){text(target,'p','Data zatím nejsou dostupná');return;}ai.replaceChildren();text(ai,'p','Dokončené AI kontroly dnes: '+data.today.ai);text(ai,'p','Náhradní vyhodnocení dnes: '+data.today.fallback);text(ai,'p','Dokončené AI kontroly za 7 dní: '+data.week.ai);if(data.status==='stale')text(ai,'p','Zobrazujeme poslední dostupné počty.');if(data.status==='stale')text(target,'p','Statistiky se nyní neobnovují. Zobrazujeme poslední dostupné počty.');const table=document.createElement('table');const head=document.createElement('tr');for(const label of ['Období','Pravidla','AI','Náhradní','Celkem'])text(head,'th',label);table.append(head);for(const [label,key]of [['Dnes','today'],['7 dní','week'],['30 dní','month']]){const tr=document.createElement('tr');text(tr,'th',label+(data[key].partial?' *':''));for(const metric of ['rules','ai','fallback','total'])text(tr,'td',new Intl.NumberFormat('cs-CZ').format(data[key][metric]));table.append(tr);}target.append(table);text(target,'p','Měření od '+data.startedDay+'. * Období pokrývá jen dobu od začátku měření.');text(target,'p','Náhradní = AI se neprovedla a odpověď vytvořila pravidla. Kontrola bez souhlasu s AI se počítá mezi pravidla.');const chart=document.createElement('div');chart.className='usage-chart';chart.setAttribute('role','img');chart.setAttribute('aria-label','Denní počty dokončených kontrol za 30 dní');const max=Math.max(1,...data.series.map(r=>r.total||0));for(const r of data.series){const column=document.createElement('div');column.className='usage-day';const bar=document.createElement('meter');bar.min=0;bar.max=max;bar.value=r.total||0;bar.title=r.day+': '+(r.total===null?'před začátkem měření':r.total);bar.setAttribute('aria-label',bar.title);if(r.total===null)column.classList.add('unmeasured');column.append(bar);text(column,'small',r.day.slice(8));chart.append(column);}target.append(chart);text(target,'p','Denní součty podle času Europe/Prague. Šedé dny jsou před začátkem měření.');}

// Stage 10: SEO & Návštěvnost (Google Search Console). Text only via textContent; SVG built with the DOM.
const SEO_REASON={permissions:'Účet služby nemá v Google Search Console přístup k verimtomu.fyi.',auth:'Přihlášení ke Googlu se nezdařilo.',rate_limited:'Google dočasně omezil počet dotazů.',upstream:'Google Search Console teď neodpovídá.',invalid_response:'Google vrátil neplatná data; nepoužili jsme je.',budget:'Synchronizace překročila povolený počet dotazů.',invalid_credentials:'Klíč služby chybí, je neplatný nebo nečitelný.',invalid_site:'Nastavená property není verimtomu.fyi.',not_configured:'Google Search Console zatím není připojeno.'};
const nf=new Intl.NumberFormat('cs-CZ'),pf=new Intl.NumberFormat('cs-CZ',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}),df=new Intl.NumberFormat('cs-CZ',{minimumFractionDigits:1,maximumFractionDigits:1});
const czDay=d=>new Date(d+'T12:00:00Z').toLocaleDateString('cs-CZ',{timeZone:'UTC'});
let seoDays=28;
function seoTable(parent,caption,headers,rows){const wrap=document.createElement('div');wrap.className='seo-table-wrap';const t=document.createElement('table');const c=document.createElement('caption');c.textContent=caption;t.append(c);const head=document.createElement('tr');for(const h of headers){const th=document.createElement('th');th.scope='col';th.textContent=h;head.append(th);}const thead=document.createElement('thead');thead.append(head);const tbody=document.createElement('tbody');for(const r of rows){const tr=document.createElement('tr');r.forEach((v,i)=>{const cell=document.createElement(i===0?'th':'td');if(i===0)cell.scope='row';cell.textContent=v;tr.append(cell);});tbody.append(tr);}t.append(thead,tbody);wrap.append(t);parent.append(wrap);}
const metricRow=r=>r.missing?['—','—','—','—']:[nf.format(r.clicks),nf.format(r.impressions),r.ctr==null?'—':pf.format(r.ctr),r.position==null?'—':df.format(r.position)];
function seoKpis(parent,p,prev,days){
 const box=document.createElement('div');box.className='seo-kpis';
 const sign=v=>(v>0?'▲ +':v<0?'▼ −':'')+'';
 const items=[
  {label:'Kliknutí z Google',value:p.clicks,before:prev?.clicks,fmt:v=>nf.format(v),delta:(a,b)=>sign(a-b)+nf.format(Math.abs(a-b))+(b?' ('+(a-b>=0?'+':'−')+pf.format(Math.abs(a-b)/b)+')':'')},
  {label:'Zobrazení ve vyhledávání',value:p.impressions,before:prev?.impressions,fmt:v=>nf.format(v),delta:(a,b)=>sign(a-b)+nf.format(Math.abs(a-b))+(b?' ('+(a-b>=0?'+':'−')+pf.format(Math.abs(a-b)/b)+')':'')},
  {label:'Průměrné CTR',value:p.ctr,before:prev?.ctr,fmt:v=>pf.format(v),delta:(a,b)=>sign(a-b)+df.format(Math.abs(a-b)*100)+' p. b.'},
  {label:'Průměrná pozice',value:p.position,before:prev?.position,fmt:v=>df.format(v),delta:(a,b)=>(a<b?'lepší o ':a>b?'horší o ':'')+df.format(Math.abs(a-b)),note:' Nižší číslo znamená lepší pozici.'}];
 for(const it of items){
  const k=document.createElement('div');k.className='seo-kpi';text(k,'p',it.label);
  const v=document.createElement('p');v.className='value';v.textContent=it.value==null?'—':it.fmt(it.value);k.append(v);
  const d=document.createElement('p');d.className='delta';
  if(!prev)d.textContent='Srovnání s předchozími '+days+' dny zatím není k dispozici.';
  else if(it.value==null||it.before==null)d.textContent='Předchozích '+days+' dní: '+(it.before==null?'—':it.fmt(it.before))+'.';
  else{const same=it.fmt(it.value)===it.fmt(it.before);d.textContent='Předchozích '+days+' dní: '+it.fmt(it.before)+'. Změna: '+(same?'beze změny':it.delta(it.value,it.before)).replace(/\.$/,'')+'.'+(it.note||'');}
  k.append(d);box.append(k);
 }
 parent.append(box);
}
function seoChart(parent,series){
 const ns='http://www.w3.org/2000/svg',W=600,H=160,P=8,wrap=document.createElement('div');wrap.className='seo-chart';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('role','img');
 const reported=series.filter(r=>!r.missing);svg.setAttribute('aria-label','Denní kliknutí a zobrazení za '+series.length+' dní. Údaje jsou také v tabulce níže.');
 const step=(W-2*P)/Math.max(1,series.length-1),x=i=>P+i*step;
 const axis=document.createElementNS(ns,'line');axis.setAttribute('class','axis');axis.setAttribute('x1',P);axis.setAttribute('x2',W-P);axis.setAttribute('y1',H-P);axis.setAttribute('y2',H-P);svg.append(axis);
 series.forEach((r,i)=>{if(!r.missing)return;const g=document.createElementNS(ns,'rect');g.setAttribute('class','gap');g.setAttribute('x',Math.max(0,x(i)-step/2));g.setAttribute('y',P);g.setAttribute('width',Math.max(2,step));g.setAttribute('height',H-2*P);svg.append(g);});
 for(const [key,cls] of [['impressions','line-impressions'],['clicks','line-clicks']]){
  const max=Math.max(1,...reported.map(r=>r[key]));let d='',open=false;
  series.forEach((r,i)=>{if(r.missing){open=false;return;}const y=H-P-(r[key]/max)*(H-2*P);d+=(open?'L':'M')+x(i).toFixed(1)+' '+y.toFixed(1)+' ';open=true;});
  if(d){const path=document.createElementNS(ns,'path');path.setAttribute('class',cls);path.setAttribute('d',d.trim());svg.append(path);}
  // A point for every reported day, so isolated days (no neighbours) stay visible.
  series.forEach((r,i)=>{if(r.missing)return;const c=document.createElementNS(ns,'circle');c.setAttribute('class','dot-'+cls);c.setAttribute('cx',x(i).toFixed(1));c.setAttribute('cy',(H-P-(r[key]/max)*(H-2*P)).toFixed(1));c.setAttribute('r','3.5');svg.append(c);});
 }
 wrap.append(svg);const legend=document.createElement('p');legend.className='seo-legend';for(const [cls,label] of [['clicks','Kliknutí'],['impressions','Zobrazení (vlastní měřítko)'],['missing','Google pro den nevrátil data']]){const s=document.createElement('span');s.className=cls;s.textContent=label;legend.append(s);}wrap.append(legend);
 const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Zobrazit denní data v tabulce';details.append(summary);
 seoTable(details,'Denní kliknutí a zobrazení',['Den','Kliknutí','Zobrazení'],series.map(r=>[czDay(r.day),...(r.missing?['bez dat','bez dat']:[nf.format(r.clicks),nf.format(r.impressions)])]));
 wrap.append(details);parent.append(wrap);
}
function renderSeo(data){
 const target=document.querySelector('#seo');target.replaceChildren();
 for(const b of document.querySelectorAll('.seo-periods button'))b.setAttribute('aria-pressed',String(Number(b.dataset.days)===data.days));
 if(data.status==='not_configured'){text(target,'p',SEO_REASON.not_configured);if(data.setupError&&data.setupError!=='not_configured')text(target,'p',SEO_REASON[data.setupError]||'');return;}
 if(data.status==='pending'){text(target,'p','Probíhá první synchronizace s Googlem. Data se zobrazí po jejím dokončení.');return;}
 if(data.status==='unavailable'){text(target,'p','Data zatím nejsou dostupná.');text(target,'p',SEO_REASON[data.sync?.error]||SEO_REASON.upstream);return;}
 if(data.status==='no_data'){text(target,'p','Google zatím neposkytuje dostatek dat.');if(data.lastSuccess)text(target,'p','Poslední synchronizace: '+new Date(data.lastSuccess).toLocaleString('cs-CZ')+'.');return;}
 const p=data.period;
 text(target,'p','Období '+czDay(p.from)+' – '+czDay(p.to)+' · Google vrátil data za '+p.reportedDays+' z '+data.days+' dní.');
 if(data.lastSuccess)text(target,'p','Aktualizováno '+new Date(data.lastSuccess).toLocaleString('cs-CZ')+'.');
 if(!data.final)text(target,'p','Obsahuje předběžná data za poslední dny; Google je může ještě upravit.');
 if(data.sync?.status==='error')text(target,'p','Poslední synchronizace se nepodařila. '+(SEO_REASON[data.sync.error]||'')+' Zobrazujeme dříve získaná data.');
 seoKpis(target,p,data.previous,data.days);
 seoChart(target,data.daily);
 text(target,'h3','Výkon jednotlivých kontrol');
 seoTable(target,'Kontroly ve vyhledávání Google',['Kontrola','Kliknutí','Zobrazení','CTR','Pozice'],data.checkers.map(c=>[c.label,...metricRow(c)]));
 text(target,'h3','Nejvýkonnější stránky');
 if(data.pages.length)seoTable(target,'Stránky podle kliknutí',['Stránka','Kliknutí','Zobrazení','CTR','Pozice'],data.pages.map(r=>[r.path,...metricRow(r)]));else text(target,'p','Google zatím neposkytuje dostatek dat.');
 text(target,'h3','Nejčastější vyhledávací dotazy');
 if(data.queries.length){seoTable(target,'Dotazy podle kliknutí',['Dotaz','Kliknutí','Zobrazení','CTR','Pozice'],data.queries.map(q=>[q.query,...metricRow(q)]));text(target,'p','Google neuvádí všechny dotazy (vzácné dotazy anonymizuje), proto se součet neshoduje s celkem. Dotazy jsou za '+data.days+' dní do '+czDay(data.queries[0].endDay)+'.');}
 else text(target,'p','Google zatím neposkytuje dostatek dat o dotazech.');
 if(data.devices.length){text(target,'h3','Zařízení');const name={MOBILE:'Mobil',DESKTOP:'Počítač',TABLET:'Tablet'};seoTable(target,'Výkon podle zařízení',['Zařízení','Kliknutí','Zobrazení','CTR','Pozice'],data.devices.map(r=>[name[r.device]||r.device,...metricRow(r)]));}
}
async function loadSeo(days=seoDays){
 seoDays=days;
 try{const r=await fetch('/api/seo?days='+days,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();renderSeo(await r.json());}
 catch{const t=document.querySelector('#seo');t.replaceChildren();text(t,'p','Data zatím nejsou dostupná.');}
}
for(const b of document.querySelectorAll('.seo-periods button'))b.addEventListener('click',()=>loadSeo(Number(b.dataset.days)));
loadSeo();setInterval(()=>loadSeo(),300000);
