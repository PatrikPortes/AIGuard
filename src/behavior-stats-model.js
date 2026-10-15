// Stage 12 A1: fixed vocabulary of the server-side behaviour statistics (docs/STAGE12A_REVIEW.md).
// Only these values can ever be counted or stored: no text, URL, query, IP, User-Agent, cookie,
// session or time finer than a day. Shared by the main thread, the worker and the SQL CHECKs.
export const EVENTS=Object.freeze(['page_view','bot_page_view','check_submitted','check_completed','check_failed','check_rejected']);
// HTML routes of src/server.js. Anything else is never a page view.
export const PAGE_BY_PATH=Object.freeze({'/':'index','/overit-zpravu':'message','/proverit-web':'web','/proverit-pujcku':'loan','/proverit-smlouvu':'contract',
 '/proverit-firmu':'firm','/proverit-investici':'investment','/uz-se-to-stalo':'happened','/privacy':'privacy','/o-projektu':'about','/kontakt':'contact','/404.html':'not_found'});
export const PAGES=Object.freeze([...new Set(Object.values(PAGE_BY_PATH))]);
// One checker per public check API; /api/analyze is split by topic after validation (loan → loan_text).
export const CHECKER_BY_PATH=Object.freeze({'/api/analyze':'message','/api/firm':'firm','/api/firm-search':'firm_search','/api/eshop-operator':'eshop_operator','/api/analyze-contract':'contract','/api/check':'check'});
export const CHECKERS=Object.freeze(['message','loan_text',...new Set(Object.values(CHECKER_BY_PATH).filter(c=>c!=='message'))]);
export const DEVICES=Object.freeze(['mobile','desktop','unknown']);
export const FAILURES=Object.freeze(['rate_limited','quota','timeout','upstream','client_abort']);
export const REJECTIONS=Object.freeze(['input','precondition']);
export const SEARCH=Object.freeze(['search','page']);
export const K1=Object.freeze([...PAGES,...CHECKERS]);
export const K2=Object.freeze(['',...DEVICES,...FAILURES,...REJECTIONS,...SEARCH]);

// The only allowed (event, k1, k2) combinations.
export function allowed(event,k1,k2){
 switch(event){
  case 'page_view':return PAGES.includes(k1)&&(k2===''||DEVICES.includes(k2));
  case 'bot_page_view':return PAGES.includes(k1)&&k2==='';
  case 'check_submitted':return CHECKERS.includes(k1)&&(k1==='firm_search'?SEARCH.includes(k2):k2==='');
  // D1: completed message checks are counted only by the existing usage statistics (single source of truth).
  case 'check_completed':return CHECKERS.includes(k1)&&k1!=='message'&&(k1==='firm_search'?SEARCH.includes(k2):k2==='');
  case 'check_failed':return CHECKERS.includes(k1)&&FAILURES.includes(k2);
  case 'check_rejected':return CHECKERS.includes(k1)&&REJECTIONS.includes(k2);
  default:return false;
 }
}

// Same calendar day as the existing usage statistics (Europe/Prague, DST-aware).
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'});
export const behaviorDay=now=>dayFormat.format(new Date(now));
export const isDay=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s;};
export const RETENTION=Object.freeze({days:400,botDays:90,snapshotDays:190,maxCount:10000000});

// Set by the server's error responder: the error code of the response (a fixed ServiceError code).
export const OUTCOME_CODE=Symbol('behaviorOutcomeCode');
