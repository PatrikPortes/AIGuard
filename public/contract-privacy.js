// Memory-only redaction and reverse mapping. Never persist or send this map.
const AUTO=[
 ['RODNÉ ČÍSLO',/\b\d{6}\/?\d{3,4}\b/g],
 ['E-MAIL',/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
 ['ÚČET',/\b(?:\d{1,6}-)?\d{2,10}\/\d{4}\b/g],
 ['IBAN',/\b(?:CZ\d{2}(?: ?\d){20}|SK\d{2}(?: ?\d){20}|DE\d{2}(?: ?\d){18}|AT\d{2}(?: ?\d){16}|GB\d{2}(?: ?[A-Z0-9]){18})\b/g],
 ['IBAN',/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi],
 ['IBAN',/\b(?!(?:CZ|SK|DE|AT|GB))[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g],
 ['TELEFON',/(?:\+\d{1,3}[ .-]?)?(?:\d[ .-]?){8}\d\b/g],
 ['DOKLAD',/\b(?:OP|občanský průkaz|číslo dokladu)\s*:?\s*[A-Z0-9]{8,12}\b/giu],
 ['DATUM NAROZENÍ',/\b(?:datum narození|narozen[aáý]?|nar\.)\s*:?\s*(?:dne\s*)?(?:\d{1,2}[./-]\s*\d{1,2}[./-]\s*\d{4}|\d{4}-\d{2}-\d{2})/giu],
 ['ADRESA',/\b(?:bytem|adresa|sídlo)\s*:?\s*[\p{L} .-]{2,80}\d{1,5}[a-z]?(?:\/\d{1,5})?[, ]{1,5}\d{3}\s?\d{2}\s[\p{L} .-]{2,60}/giu],
];
export function anonymizeContract(text,{automatic=true,manual=[]}={}){
 const ranges=[];for(const r of manual){if(!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<0||r.end>text.length||r.end<=r.start)throw Error('Invalid selection');ranges.push({...r,label:'OSOBNÍ ÚDAJ',priority:0});}
 if(automatic)for(const [label,pattern]of AUTO)for(const m of text.matchAll(pattern))ranges.push({start:m.index,end:m.index+m[0].length,label,priority:1});
 ranges.sort((a,b)=>a.start-b.start||a.priority-b.priority||b.end-a.end);const merged=[];for(const r of ranges){const last=merged.at(-1);if(last&&r.start<last.end){last.end=Math.max(last.end,r.end);if(last.label!==r.label)last.label='OSOBNÍ ÚDAJ';}else merged.push({...r});}
 let sent='',cursor=0;const map=[];for(const r of merged){sent+=text.slice(cursor,r.start);const sentStart=sent.length;sent+='['+r.label+']';map.push({originalStart:r.start,originalEnd:r.end,sentStart,sentEnd:sent.length});cursor=r.end;}sent+=text.slice(cursor);return{sent,map};
}
export function originalRange(start,end,map){
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start)return null;
 const convert=position=>{let delta=0;for(const r of map){if(position>r.sentStart&&position<r.sentEnd)return null;if(position===r.sentStart)return r.originalStart;if(position===r.sentEnd)return r.originalEnd;if(position>=r.sentEnd)delta+=r.originalEnd-r.originalStart-(r.sentEnd-r.sentStart);}return position+delta;};
 const a=convert(start),b=convert(end);return a===null||b===null?null:{start:a,end:b};
}
export function pageAt(text,start){return text.slice(0,start).split('\f').length;}
