const {identity,vr,xml}=require('./fixtures.cjs');
const base='https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/';
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
global.fetch=async(url,o)=>{
 process.send?.({upstream:url,method:o.method||'GET',redirect:o.redirect,body:o.body});
 if(url.startsWith(base)){
  const ico=url.split('/').at(-1);
  if(ico==='vyhledat'){const name=JSON.parse(o.body).obchodniJmeno;if(name==='Timeout')return new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));if(name==='Redirect')throw Error('Redirect');if(name==='Oversize')return json({x:'x'.repeat(260000)});if(name==='Too many')return json({pocetCelkem:1001,ekonomickeSubjekty:[]});if(name==='Wrong ico')return json({pocetCelkem:1,ekonomickeSubjekty:[identity('27082441')]});if(name==='Duplicate')return json({pocetCelkem:2,ekonomickeSubjekty:[identity(),identity()]});if(name==='Mismatch')return new Response('bad',{headers:{'Content-Type':'text/html'}});return json({pocetCelkem:1,ekonomickeSubjekty:[identity()]});}
  if(url.includes('subjekty-vr/')){if(ico==='00006947')throw Error('Unavailable');const x=vr(ico);if(ico==='02032945')x.zaznamy[0].ostatniOrgany=[{typOrganu:'LIKVIDATOR',datumZapisu:'2020-01-01',clenoveOrganu:[{fyzickaOsoba:{jmeno:'Jan',prijmeni:'Test'}}]}];if(ico==='04147464')x.zaznamy[0].insolvence=[{insolvencniZapis:[{typZapisu:'ZAHÁJENÍ',datumZapisu:'2024-07-22',datumVymazu:'2024-08-28',text:'PRIVATE_HOME PRIVATE_RC'}]}];return json(x);}
  if(url.includes('subjekty-res/'))return json({icoId:ico,zaznamy:[{primarniZaznam:true,statistickeUdaje:{kategoriePoctuPracovniku:'120'}}]});
  if(ico==='00020869')return new Response('{}',{status:404,headers:{'Content-Type':'application/json'}});
  if(ico==='00023281')return json(identity('27082440'));
  if(ico==='00023221')throw Error('Redirect');
  if(ico==='00023264')return json({x:'x'.repeat(129000)});
  if(ico==='00023272')return new Response('{}',{headers:{'Content-Type':'text/html'}});
  if(ico==='00023299')return new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));
  const i=identity(ico);if(ico==='01432087'){i.pravniForma='101';i.seznamRegistraci.stavZdrojeVr='NEEXISTUJICI';}return json(i);
 }
 if(url==='https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP'){
  const dic=o.body.match(/<d:dic>(\d+)<\/d:dic>/)[1];let data=xml(dic);
  if(dic==='00006947')data='<!DOCTYPE x [<!ENTITY xx SYSTEM "file:///etc/passwd">]>'+data;
  if(dic==='00023281')data=xml('27082440');
  if(dic==='00023264')data=xml(dic)+' '.repeat(65000);if(dic==='00023272')data=xml(dic).replace('http://adis.mfcr.cz/rozhraniCRPDPH/','https://evil.invalid/');if(dic==='00023299')return new Response(data,{headers:{'Content-Type':'text/html'}});
  if(dic==='00121100')data=data.replace('nespolehlivyPlatce="NE"','nespolehlivyPlatce="ANO"');
  if(dic==='01988468')data=data.replace('typSubjektu="PLATCE_DPH"','typSubjektu="NESPOLEHLIVA_OSOBA"').replace('nespolehlivyPlatce="NE"','nespolehlivyPlatce="ANO"');
  if(dic==='01432087')data=data.replace('typSubjektu="PLATCE_DPH"','typSubjektu="NENALEZEN"').replace('nespolehlivyPlatce="NE"','nespolehlivyPlatce="NENALEZEN"');
  if(dic==='00023213')data=data.replace('</s:Envelope>','');
  if(dic==='00023230')data=data.replace('statusCode="0"','statusCode="1"');
  if(dic==='00023248')data=data.replace('<d:statusSubjektu','<d:statusSubjektu ignored="x" ignored="y"');
  if(dic==='00023256')data=data.replace('<d:statusSubjektu','<d:statusSubjektu xmlns:d="https://evil.invalid"');
  if(dic==='00020869')data=data.replace('statusCode="0"','statusCode="2"');
  return new Response(data,{headers:{'Content-Type':'text/xml'}});
 }
 if(url==='https://api.openai.com/v1/chat/completions')return json({ok:true});
 throw Error('Unexpected upstream');
};
