export function money(value, {positive=false}={}) {
  const s=String(value).trim().replace(/[\s\u00a0\u202f]/g,'');
  if(!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(s))throw Error('Zadejte částku v Kč, nejvýše se dvěma desetinnými místy.');
  const [whole,fraction='']=s.split(/[.,]/);const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents>10000000000||(positive&&cents===0))throw Error('Částka musí být '+(positive?'větší než nula a ':'')+'nejvýše 100 milionů Kč.');
  return cents;
}
export function calculate(offer){
 const {amount,count,payment,last,fee,insurance,upfront,rpsn}=offer;
 if(!Number.isInteger(count)||count<1||count>600)throw Error('Doba splácení musí být 1 až 600 měsíců.');
 if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Vyplacená částka musí být větší než nula.');
 for(const value of [payment,last,fee,insurance,upfront])if(!Number.isSafeInteger(value)||value<0||value>10000000000)throw Error('Neplatná částka.');
 if(rpsn!==null&&(!Number.isFinite(rpsn)||rpsn<0||rpsn>100000))throw Error('Neplatná RPSN.');
 const installments=(count-1)*payment+last;
 const extras=count*(fee+insurance)+upfront;
 const total=installments+extras;const overpayment=total-amount;
 if(!Number.isSafeInteger(total)||total<=0)throw Error('Celková platba musí být větší než nula.');
 if(overpayment<0)throw Error('Součet plateb je nižší než vyplacená částka. Zkontrolujte splátky a případné chybějící platby; tuto nabídku nelze takto spolehlivě spočítat.');
 return {...offer,installments,extras,total,overpayment,monthly:payment+fee+insurance,finalMonthly:last+fee+insurance};
}
export function compare(a,b){
 if(a.amount!==b.amount)return {comparable:false};
 return {comparable:true,difference:b.total-a.total,months:b.count-a.count,monthly:b.monthly-a.monthly};
}
if(typeof document!=='undefined'){
 const form=document.querySelector('#cost-form');const result=document.querySelector('#cost-result');const error=document.querySelector('#cost-error');const toggle=document.querySelector('#compare-offer');const second=document.querySelector('#offer-b');
 result.classList.add('panel','loan-cost');
 const entry=document.querySelector('.analysis-section');
 entry.before(result);
 const view=show=>document.dispatchEvent(new CustomEvent('loan-cost-view',{detail:{show}}));
 const czk=cents=>new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:2}).format(cents/100);
 const field=(prefix,key)=>document.querySelector('#'+prefix+'-'+key);
 function read(prefix){
  const values={};
  for(const key of ['amount','payment','fee','insurance','upfront']){const input=field(prefix,key);try{values[key]=money(input.value,{positive:key==='amount'});}catch(e){input.focus();throw e;}}
  const months=field(prefix,'count');if(!/^\d{1,3}$/.test(months.value.trim())){months.focus();throw Error('Zadejte dobu splácení v celých měsících.');}values.count=Number(months.value);
  const last=field(prefix,'last');try{values.last=last.value.trim()?money(last.value):values.payment;}catch(e){last.focus();throw e;}
  const rpsn=field(prefix,'rpsn');const rate=rpsn.value.trim().replace(',','.');
  if(rate&&!/^\d{1,6}(?:\.\d{1,3})?$/.test(rate)){rpsn.focus();throw Error('RPSN zadejte jako nezáporné číslo, například 12,5.');}values.rpsn=rate?Number(rate):null;
  if(!field(prefix,'complete').checked){field(prefix,'complete').focus();throw Error('Potvrďte, že jste uvedli všechny plánované povinné platby. Pokud údaje neznáte, přesný součet nelze spočítat.');}
  return calculate(values);
 }
 function add(parent,tag,text){const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;}
 function show(offer,label){const section=document.createElement('section');section.className='cost-summary';add(section,'h3',label);const list=document.createElement('dl');section.append(list);
  for(const [label,value]of [['Dostanete',czk(offer.amount)],['Celkem zaplatíte',czk(offer.total)],['Náklady nad vyplacenou částku',czk(offer.overpayment)],['Běžná měsíční platba',czk(offer.monthly)],['Poslední měsíční platba',czk(offer.finalMonthly)],['Doba splácení',offer.count+' měsíců'],['Splátky celkem',czk(offer.installments)],['Další povinné platby celkem',czk(offer.extras)],['RPSN uvedená v nabídce',offer.rpsn===null?'Nezadána':offer.rpsn.toLocaleString('cs-CZ')+' %']]){add(list,'dt',label);add(list,'dd',value);}
  result.append(section);
 }
 function clear(){result.hidden=true;result.replaceChildren();error.hidden=true;}
 toggle.addEventListener('change',()=>{second.hidden=!toggle.checked;second.disabled=!toggle.checked;clear();});
 form.addEventListener('input',clear);form.addEventListener('change',clear);
 form.addEventListener('submit',event=>{event.preventDefault();clear();try{const a=read('a'),b=toggle.checked?read('b'):null;add(result,'h2','Kolik podle zadaných údajů zaplatíte');show(a,b?'Nabídka A':'Vaše nabídka');if(b){show(b,'Nabídka B');const c=compare(a,b);if(!c.comparable)add(result,'p','Vyplacené částky se liší. Celkové platby proto neporovnáváme jako levnější a dražší nabídku. Pro přímé srovnání zadejte stejnou vyplacenou částku.');else{add(result,'p',c.difference===0?'Obě nabídky mají stejnou celkovou platbu.':`Nabídka ${c.difference>0?'A':'B'} má o ${czk(Math.abs(c.difference))} nižší celkovou platbu při stejné vyplacené částce.`);if(c.months!==0)add(result,'p','Doba splácení se liší. Nižší celková platba může znamenat vyšší měsíční zatížení; porovnejte také splátky a délku závazku.');}}
 add(result,'p','Součet platí pro uvedené pevné měsíční splátky a řádné splácení. Nezahrnuje nezadané platby, sankce, změny sazeb ani předčasné splacení. Nižší náklady nepotvrzují důvěryhodnost poskytovatele ani vhodnost půjčky pro vás. RPSN přebíráme z nabídky; nepočítáme ji ani neověřujeme.');const edit=add(result,'button','Upravit údaje a přepočítat');edit.type='button';edit.className='secondary-action';edit.addEventListener('click',()=>{view(false);clear();field('a','amount').focus();form.scrollIntoView({block:'start'});});result.hidden=false;view(true);result.scrollIntoView({block:'start'});result.focus({preventScroll:true});}catch(e){result.replaceChildren();error.textContent=e.message;error.hidden=false;}});
 document.querySelector('#cost-submit').disabled=false;
}
