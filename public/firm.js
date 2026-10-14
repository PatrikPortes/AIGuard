import {renderVerdict} from './verdict-view.js';
const form=document.querySelector('#firm-form'),input=document.querySelector('#firm-ico'),error=document.querySelector('#firm-error'),progress=document.querySelector('#firm-progress'),button=document.querySelector('#firm-submit'),entry=document.querySelector('#firm-entry'),result=document.querySelector('#firm-result'),followup=document.querySelector('#firm-followup');
const valid=ico=>/^\d{8}$/.test(ico)&&((11-[8,7,6,5,4,3,2].reduce((v,w,i)=>v+Number(ico[i])*w,0)%11)%10)===Number(ico[7]);
form.addEventListener('submit',async event=>{
 event.preventDefault();error.hidden=true;input.removeAttribute('aria-invalid');
 const ico=input.value;if(!valid(ico)){error.textContent='Toto IČO nemá platný tvar. Zkontrolujte ho.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
 button.disabled=true;progress.textContent='Prověřujeme údaje v registrech…';
 try{
  const options={credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(8000)};
  const session=await fetch('/api/session',options);if(!session.ok)throw Error('Kontrolu nelze spustit. Zkuste to prosím později.');
  const response=await fetch('/api/firm',{...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ico})});
  if(!response.ok)throw Error(response.status===429?'Mnoho dotazů, zkuste to za minutu.':'Kontrolu se nepodařilo dokončit. Zkuste to prosím později.');
  const data=await response.json();entry.hidden=true;result.hidden=false;followup.hidden=false;renderVerdict(result,data);result.scrollIntoView({block:'start'});
 }catch(e){entry.hidden=false;result.hidden=true;followup.hidden=true;error.textContent=e.name==='TimeoutError'?'Kontrola trvala příliš dlouho. Zkuste to později.':e.message;error.hidden=false;}
 finally{button.disabled=false;progress.textContent='';}
});
document.querySelector('#firm-again').addEventListener('click',()=>{entry.hidden=false;result.hidden=true;followup.hidden=true;input.focus();});
