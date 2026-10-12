import { domainToASCII } from 'node:url';
// Limited local reference list, not identity, ownership, SPF/DKIM or DNS checks.
// Sources and limits are documented in docs/ux/sender-phishing.md.
const brands = [
  {name:'Meta / Facebook',mention:/\b(?:facebook|meta)\b/u,domains:['facebook.com','facebookmail.com','fb.com','meta.com','metamail.com'],tokens:['facebook','meta']},
  {name:'Česká pošta',mention:/\bcesk[aey] post[aeyu]|\bceskaposta\b/u,domains:['ceskaposta.cz','cpost.cz'],tokens:['ceskaposta','cpost']},
];
export function validatedSender(value) {
 if(value===undefined)return '';
 if(typeof value!=='string'||value.length>256||Buffer.byteLength(value,'utf8')>1024||/[\x00-\x1f\x7f]/u.test(value))throw Error('Neplatný odesílatel.');
 return value.trim();
}
const similarLetters={а:'a',е:'e',с:'c',о:'o',р:'p',х:'x',у:'y',і:'i',ј:'j',ӏ:'l',ο:'o',ρ:'p',α:'a'};
const fold=value=>value.normalize('NFKC').toLowerCase().replace(/[аесорхуіјӏορα]/gu,c=>similarLetters[c]).normalize('NFD').replace(/\p{M}/gu,'').replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu,'');
function near(a,b){if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(a.length-i)+(b.length-j)<=1;}
export function senderSignals(sender,content,existing){
 if(!sender)return [];
 const match=sender.match(/(?:^|<)\s*([^\s<>@]{1,64})@([^\s<>@]{1,190})\s*>?$/u);
 if(!match)return [];
 const raw=match[2];let domain=domainToASCII(raw.normalize('NFKC').toLowerCase()).toLowerCase();
 if(!domain||domain.length>253||!domain.includes('.')||domain.split('.').some(x=>!x||x.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x)))return [{id:'sender_format',weight:5,title:'Odesílatele nelze spolehlivě porovnat',explanation:'E-mailová doména má neobvyklý zápis. Její pravost ani vlastnictví jsme neověřili.'}];
 const senderLabel=fold(sender.slice(0,match.index)+match[1]);const tokens=fold(raw).replace(/[01]/g,c=>c==='0'?'o':'l').split(/[.\-_]/u);
 const ids=new Set(existing.map(s=>s.id));const request=ids.has('credentials')||ids.has('urgency')||ids.has('account_threat')||ids.has('money');
 const found=[];
 for(const brand of brands){
  const claimed=brand.mention.test(senderLabel)||(brand.mention.test(content)&&request);
  const known=brand.domains.some(root=>domain===root||domain.endsWith('.'+root));
  // A familiar spelling never removes a content warning or proves authenticity.
  if(known)continue;
  const resembles=brand.tokens.some(token=>tokens.some(part=>part.length>=4&&near(part,token)));
  if(claimed)found.push({id:'sender_mismatch',weight:25,title:'Nesoulad mezi uvedenou organizací a odesílatelem',explanation:`Zpráva nebo označení odesílatele odkazuje na ${brand.name}, ale e-mailová doména neodpovídá našemu omezenému přehledu běžných domén této organizace. Může jít i o jiného oprávněného odesílatele; požadavek ověřte nezávisle.`});
  if(resembles&&(claimed||request))found.push({id:'sender_impersonation',weight:20,title:'Doména může napodobovat známou značku',explanation:`Zápis e-mailové domény připomíná ${brand.name}, ale shodu s běžnou doménou jsme nenašli. Samotná podobnost není důkaz podvodu.`});
 }
 return found.filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index);
}
export const PHISHING_ACTION='Na odkaz ve zprávě neklikejte. Přihlaste se přímo přes oficiální web nebo aplikaci služby.';
export function phishingCombination(signals){const ids=new Set(signals.map(s=>s.id));return (ids.has('link')||ids.has('link_request'))&&((ids.has('account_threat')&&ids.has('urgency'))||((ids.has('sender_mismatch')||ids.has('sender_impersonation'))&&(ids.has('account_threat')||ids.has('credentials')||ids.has('urgency'))));}
