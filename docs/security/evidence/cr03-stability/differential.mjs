import assert from 'node:assert/strict';
import {matchingRepresentation as before} from './baseline-analysis.mjs';
import {matchingRepresentation as after} from '../../../../src/analysis.js';
const corpus=['ztrati'+'l'.repeat(9994),'ztrati'.repeat(1666),'prihlaste'.repeat(1111),'9'.repeat(10000),'posli '.repeat(1666),'dnes '.repeat(2000),'garantovan'.repeat(1000),'\uFDFA'.repeat(3000)];
const normalize=String.prototype.normalize;let counts;
String.prototype.normalize=function(form){counts[form]=(counts[form]||0)+1;return Reflect.apply(normalize,this,[form]);};
const operations=[];
try{for(const [i,content] of corpus.entries()){counts={};before(content);const old=counts;counts={};after(content);operations.push({case:i,baseline:old,after:counts});}}finally{String.prototype.normalize=normalize;}
const alphabet=['A','Z','a','m','i','p','s','l','o',' ','.','\n','\r','\u2028','\u200b','\u200d','\u00ad','\u2060','\u0301','\u0327','а','о','і','α','ρ','Ł','Ñ','É','Καλημέρα','добро','שלום','\uFDFA','℀','K','Ａ','𝒎','ﬃ','1','9','%','\0','漢'];
let seed=0x74657374;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
let compared=0;
for(const value of [...corpus,Array.from({length:128},(_,i)=>String.fromCharCode(i)).join(''), ...alphabet]){assert.deepEqual(after(value),before(value));compared++;}
for(let i=0;i<5000;i++){let s='';for(let j=0,n=1+rnd()%100;j<n;j++)s+=alphabet[rnd()%alphabet.length];assert.deepEqual(after(s),before(s));compared++;}
console.log(JSON.stringify({normalization_operations:operations,differential_inputs:compared,matching_content_and_flags_identical:true},null,2));
