import {characterAssets} from './character-assets.js';
// Stage 8 (S8.2/S8.3): "Poslat výsledek blízkému".
// The shared text is a pure function of two fixed enums: the checker type (a page constant)
// and the result category. No input, result text, finding, URL, IČO, name or identifier is
// ever passed in, so nothing the user entered can leak. The link is the canonical public
// checker page without query or fragment. No external requests, storage, cookies or tracking. Images use existing same-origin assets.
const ORIGIN='https://verimtomu.fyi';
const generatedCards=new WeakSet();
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
export async function shareResult(type,category,{nav=globalThis.navigator,file}={}){
 const data=buildShare(type,category);
 if(typeof nav?.share==='function'){
  try{let withImage=false;if(file&&generatedCards.has(file)&&typeof nav.canShare==='function'){try{withImage=nav.canShare({files:[file]})===true;}catch{}}await nav.share({...{title:data.title,text:data.text,url:data.url},...(withImage?{files:[file]}:{})});return {outcome:'shared',data};}
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
 let busy=false,file;
 const save=doc.createElement('button');save.type='button';save.className='share-save secondary-action';save.textContent='Uložit obrázek výsledku';save.hidden=true;
 if(doc.defaultView?.HTMLCanvasElement){button.disabled=true;
  renderShareCard(type,category,{doc}).then(value=>{file=value;save.hidden=false;}).catch(()=>{status.textContent='Obrázek se nepodařilo připravit. Můžete sdílet obecný výsledek jako text.';}).finally(()=>{button.disabled=false;});
 }
 save.addEventListener('click',()=>{if(!file)return;const url=doc.defaultView.URL.createObjectURL(file),a=doc.createElement('a');a.href=url;a.download=file.name;doc.body.append(a);a.click();a.remove();setTimeout(()=>doc.defaultView.URL.revokeObjectURL(url),60000);});
 hint.textContent='Sdílíme obrázek s obecným výsledkem, bez vašich údajů. Odkaz vede na vlastní kontrolu, ne na původní zadání. Pokud obrázek nejde sdílet, můžete jej uložit.';
 button.addEventListener('click',async()=>{
  if(busy)return;busy=true;button.disabled=true;status.textContent='';manual.hidden=true;
  try{const {outcome,data}=await shareResult(type,category,{nav:nav??doc.defaultView?.navigator,file});
   status.textContent=STATUS[outcome];
   if(outcome==='manual'){manual.value=data.full;manual.hidden=false;manual.focus();manual.select();}
  }finally{busy=false;button.disabled=false;}
 });
 root.append(button,save,hint,status,manual);
 return root;
}

// PNG is created locally from fixed enums and existing artwork. No result object is accepted.
export async function renderShareCard(type,category,{doc=globalThis.document}={}){
 const data=buildShare(type,category),c=doc.createElement('canvas');c.width=1200;c.height=1200;const ctx=c.getContext('2d');if(!ctx)throw Error('CANVAS_UNAVAILABLE');
 const load=src=>new Promise((resolve,reject)=>{const img=new doc.defaultView.Image(),timer=setTimeout(()=>{img.src='';reject(Error('IMAGE_TIMEOUT'));},4000);img.onload=()=>{clearTimeout(timer);resolve(img);};img.onerror=()=>{clearTimeout(timer);reject(Error('IMAGE_UNAVAILABLE'));};img.src=src;});
 const [logo,verka,robo]=await Promise.all([load('/assets/brand/logo.png'),load(characterAssets[category==='serious'?'verka-warning':category==='attention'||category==='neutral'?'verka-explaining':'verka-thinking']),load(characterAssets['robo-default'])]);
 const image=(img,x,y,w,h)=>{const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight);ctx.drawImage(img,x+(w-img.naturalWidth*scale)/2,y+(h-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale);};
 const text=(value,x,y,width,size=34,weight=500)=>{ctx.fillStyle='#0f1b3d';ctx.font=`${weight} ${size}px system-ui, sans-serif`;let line='';for(const word of value.split(' ')){const next=line?line+' '+word:word;if(ctx.measureText(next).width>width&&line){ctx.fillText(line,x,y);y+=size*1.35;line=word;}else line=next;}if(line){ctx.fillText(line,x,y);y+=size*1.35;}return y;};
 ctx.fillStyle='#fffce5';ctx.fillRect(0,0,1200,1200);image(logo,56,40,92,100);text('Věřím tomu?',166,100,950,60,800);text('Radši ověřit než litovat.',166,149,900,28,600);
 ctx.fillStyle='#ffffff';ctx.beginPath();ctx.roundRect(48,204,1104,794,32);ctx.fill();
 text(SHARE_TYPES[type].title.toLocaleUpperCase('cs'),84,263,720,25,700);
 const headline={serious:'Závažné varovné signály',attention:'Stojí za pozornost',none_found:'Bez výrazných varovných signálů',incomplete:'Nedokončeno / nelze posoudit',neutral:'Co jsme zjistili'}[category];
 let y=text(headline,84,334,700,51,800);y=text(SHARE_CATEGORIES[category],84,y+30,680,32,500);text(SHARE_TYPES[type].note,84,y+28,680,27,500);
 image(verka,800,294,310,370);image(robo,830,651,260,270);
 ctx.fillStyle='#f0eeff';ctx.beginPath();ctx.roundRect(76,811,702,150,20);ctx.fill();text('DŮLEŽITÉ',100,851,640,23,750);text('Nenalezené riziko neznamená, že žádné neexistuje.',100,898,640,29,650);
 text('Vlastní kontrola: '+data.url.replace('https://',''),64,1062,1080,30,650);text('Odkaz otevře nástroj. Původní zadání ani výsledek neukládáme do odkazu.',64,1118,1080,25,500);
 const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG_UNAVAILABLE')),'image/png'));
 const file=new doc.defaultView.File([blob],`verimtomu-${type}-${category}.png`,{type:'image/png'});generatedCards.add(file);return file;
}
