import {renderVerdict} from './verdict-view.js';
const $=id=>document.getElementById(id);
const form=$('firm-form'),input=$('firm-ico'),name=$('firm-name'),error=$('firm-error'),progress=$('firm-progress'),button=$('firm-submit'),entry=$('firm-entry'),result=$('firm-result'),followup=$('firm-followup'),candidates=$('firm-candidates'),list=$('firm-candidates-list');
const valid=ico=>/^\d{8}$/.test(ico)&&((11-[8,7,6,5,4,3,2].reduce((v,w,i)=>v+Number(ico[i])*w,0)%11)%10)===Number(ico[7]);
let busy=false,searchName='',start=0,total=0;
function showError(message,field){error.textContent=message;error.hidden=false;if(field){field.setAttribute('aria-invalid','true');field.focus();}}
async function request(path,body){
 const options={credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(8000)};
 const session=await fetch('/api/session',options);if(!session.ok)throw Error('Kontrolu nelze spustit. Zkuste to prosím později.');
 const response=await fetch(path,{...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!response.ok)throw Error(response.status===429?'Mnoho dotazů, zkuste to za minutu.':path==='/api/firm-search'?'Vyhledávání je teď nedostupné nebo je název příliš obecný. Upřesněte název nebo zadejte IČO.':'Kontrolu se nepodařilo dokončit. Zkuste to prosím později.');
 return response.json();
}
async function run(operation,label){
 if(busy)return;busy=true;error.hidden=true;button.disabled=true;progress.textContent=label;
 for(const b of candidates.querySelectorAll('button'))b.disabled=true;
 try{await operation();}catch(e){entry.hidden=false;result.hidden=true;followup.hidden=true;showError(e.name==='TimeoutError'?'Kontrola trvala příliš dlouho. Zkuste to později.':e.message);}
 finally{busy=false;button.disabled=false;progress.textContent='';for(const b of candidates.querySelectorAll('button'))b.disabled=false;}
}
async function profile(ico){
 const data=await request('/api/firm',{ico});entry.hidden=true;result.hidden=false;followup.hidden=false;renderVerdict(result,data);result.scrollIntoView({block:'start'});
}
async function search(offset){
 candidates.hidden=true;list.replaceChildren();
 const data=await request('/api/firm-search',{name:searchName,start:offset});start=offset;total=data.total;
 $('firm-candidates-count').textContent=total===0?'Pod tímto názvem jsme v ARES nic nenašli. Zkontrolujte překlep nebo zadejte IČO.':`Nalezeno ${total} subjektů. Zobrazeny výsledky ${start+1}–${start+data.candidates.length}. Vyberte firmu, kterou hledáte.`;
 for(const candidate of data.candidates){
  const li=document.createElement('li'),b=document.createElement('button'),title=document.createElement('strong'),details=document.createElement('span');b.type='button';b.className='firm-candidate';title.textContent=candidate.name;details.textContent=`IČO ${candidate.ico}${candidate.seat?' · '+candidate.seat:''}`;b.append(title,details);b.addEventListener('click',()=>run(()=>profile(candidate.ico),'Prověřujeme vybranou firmu v registrech…'));li.append(b);list.append(li);
 }
 $('firm-search-previous').hidden=start===0;$('firm-search-next').hidden=start+data.candidates.length>=total||data.candidates.length===0;
 candidates.hidden=false;$('firm-candidates-title').focus();
}
form.addEventListener('submit',event=>{
 event.preventDefault();if(busy)return;error.hidden=true;input.removeAttribute('aria-invalid');name.removeAttribute('aria-invalid');
 const ico=input.value.trim(),query=name.value.trim();
 if(ico&&query){showError('Vyplňte buď IČO, nebo název firmy. Druhé pole ponechte prázdné.',name);return;}
 if(ico){if(!valid(ico)){showError('Toto IČO nemá platný tvar. Zkontrolujte ho.',input);return;}run(()=>profile(ico),'Prověřujeme údaje v registrech…');return;}
 if(query.length<3||query.length>100||/[\p{Cc}\p{Cf}<>\/\\?#]/u.test(query)||!/[\p{L}]/u.test(query)){showError('Zadejte název firmy o délce 3 až 100 znaků, nebo platné IČO.',name);return;}
 searchName=query;run(()=>search(0),'Hledáme firmy podle názvu v ARES…');
});
$('firm-search-previous').addEventListener('click',()=>run(()=>search(Math.max(0,start-10)),'Načítáme předchozí výsledky…'));
$('firm-search-next').addEventListener('click',()=>run(()=>search(start+10),'Načítáme další výsledky…'));
$('firm-again').addEventListener('click',()=>{entry.hidden=false;result.hidden=true;followup.hidden=true;input.focus();});
