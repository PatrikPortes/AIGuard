// Stage 8 (S8.2/S8.3): "Poslat výsledek blízkému".
// The shared text is a pure function of two fixed enums: the checker type (a page constant)
// and the result category. No input, result text, finding, URL, IČO, name or identifier is
// ever passed in, so nothing the user entered can leak. The link is the canonical public
// checker page without query or fragment. No network, storage, cookies or tracking.
const ORIGIN='https://verimtomu.fyi';
export const SHARE_TYPES=Object.freeze({
 message:Object.freeze({title:'kontrola zprávy',path:'/overit-zpravu',note:'Odesílatele ani odkazy jsme neověřovali.'}),
 loan:Object.freeze({title:'kontrola nabídky půjčky',path:'/proverit-pujcku',note:'Oprávnění poskytovatele u ČNB jsme automaticky neověřili.'}),
 contract:Object.freeze({title:'kontrola smlouvy',path:'/proverit-smlouvu',note:'Kontrola nenahrazuje právní posouzení.'}),
 web:Object.freeze({title:'kontrola webu',path:'/proverit-web',note:'Web jsme nenavštívili a jeho provozovatele neověřujeme.'}),
 firm:Object.freeze({title:'kontrola firmy',path:'/proverit-firmu',note:'Zápis v registru není záruka bezpečnosti.'}),
 investment:Object.freeze({title:'kontrola investiční nabídky',path:'/proverit-investici',note:'Oprávnění ČNB jsme automaticky neověřili. Nejde o investiční doporučení.'})
});
export const SHARE_CATEGORIES=Object.freeze({
 serious:'Výsledek: našli jsme závažné varovné signály. Než cokoli zaplatíte, podepíšete nebo sdělíte, ověřte si to jinou cestou.',
 attention:'Výsledek: stojí za pozornost. Kontrola našla signály, které je dobré si nezávisle ověřit.',
 none_found:'Výsledek: nenašli jsme výrazné varovné signály. To neznamená, že je vše v pořádku. Kontrola nemůže zaručit bezpečnost.',
 incomplete:'Výsledek: kontrolu se nepodařilo dokončit nebo z dostupných údajů nelze posoudit. Chybějící ověření neberte jako dobrou zprávu.',
 neutral:'Kontrola proběhla. Doporučený postup: požadavek si ověřte jinou cestou, přes kontakt, který už znáte.'
});
// Verdict level → share category. not_assessable is reported as incomplete; anything else is rejected.
const LEVEL_CATEGORY=Object.freeze({serious:'serious',attention:'attention',none_found:'none_found',incomplete:'incomplete',not_assessable:'incomplete'});
export function shareCategory(level){
 if(!Object.hasOwn(LEVEL_CATEGORY,level))throw Error('INVALID_SHARE_LEVEL');
 return LEVEL_CATEGORY[level];
}
export const SHARE_LABEL='Poslat výsledek blízkému';
export function buildShare(type,category){
 if(!Object.hasOwn(SHARE_TYPES,type)||!Object.hasOwn(SHARE_CATEGORIES,category))throw Error('INVALID_SHARE');
 const t=SHARE_TYPES[type],url=ORIGIN+t.path;
 const title='Věřím tomu? – '+t.title;
 const text=SHARE_CATEGORIES[category]+' '+t.note;
 return Object.freeze({title,text,url,full:title+'\n\n'+text+'\n\nVlastní kontrolu si můžete udělat na '+url});
}
// Native share → clipboard → manual copy. A cancelled native share is final (no fallback).
export async function shareResult(type,category,{nav=globalThis.navigator}={}){
 const data=buildShare(type,category);
 if(typeof nav?.share==='function'){
  try{await nav.share({title:data.title,text:data.text,url:data.url});return {outcome:'shared',data};}
  catch(e){if(e?.name==='AbortError')return {outcome:'cancelled',data};}
 }
 if(typeof nav?.clipboard?.writeText==='function'){
  try{await nav.clipboard.writeText(data.full);return {outcome:'copied',data};}catch{}
 }
 return {outcome:'manual',data};
}
const STATUS={shared:'Výsledek je připravený ke sdílení.',cancelled:'Sdílení bylo zrušeno.',copied:'Text je zkopírovaný. Vložte ho do zprávy pro blízkého.',manual:'Text označte a zkopírujte. Neobsahuje nic z toho, co jste zadali.'};
// Builds the share control for a FINAL result. Callers mount it only after the result is shown.
export function createShareControl(doc,type,category,{nav}={}){
 buildShare(type,category);
 const root=doc.createElement('div');root.className='share-result';root.dataset.shareType=type;root.dataset.shareCategory=category;
 const button=doc.createElement('button');button.type='button';button.className='share-button secondary-action';button.textContent=SHARE_LABEL;
 const hint=doc.createElement('p');hint.className='share-hint';hint.textContent='Pošleme jen typ kontroly, obecný výsledek a odkaz. Nic z toho, co jste zadali.';
 const status=doc.createElement('p');status.className='share-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const manual=doc.createElement('textarea');manual.className='share-manual';manual.readOnly=true;manual.hidden=true;manual.rows=6;manual.setAttribute('aria-label','Text výsledku ke zkopírování');
 let busy=false;
 button.addEventListener('click',async()=>{
  if(busy)return;busy=true;button.disabled=true;status.textContent='';manual.hidden=true;
  try{const {outcome,data}=await shareResult(type,category,{nav:nav??doc.defaultView?.navigator});
   status.textContent=STATUS[outcome];
   if(outcome==='manual'){manual.value=data.full;manual.hidden=false;manual.focus();manual.select();}
  }finally{busy=false;button.disabled=false;}
 });
 root.append(button,hint,status,manual);
 return root;
}
