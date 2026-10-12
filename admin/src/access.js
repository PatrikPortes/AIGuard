import { createRemoteJWKSet, jwtVerify } from 'jose';
export function accessVerifier({issuer,audience},keys=createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'),{timeoutDuration:5000,cooldownDuration:30000,cacheMaxAge:600000})) {
 return async token=>{
  if(typeof token!=='string'||token.length>16384)throw Error('Access denied');
  const {payload}=await jwtVerify(token,keys,{issuer,audience,algorithms:['RS256'],requiredClaims:['exp','iat','iss','aud'],clockTolerance:5});
  if(!Number.isFinite(payload.iat)||payload.iat>Date.now()/1000+5)throw Error('Invalid issued time');
  if(payload.type!=='app')throw Error('Invalid Access application token');
  // Verified identity is deliberately neither returned nor logged.
 };
}
