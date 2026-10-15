import { readFileSync } from 'node:fs';
export function config(env=process.env) {
 const issuer=env.ACCESS_ISSUER, audience=env.ACCESS_AUDIENCE;
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'')||!/^[a-f0-9]{64}$/.test(audience||''))throw Error('Access issuer and application audience must be configured.');
 const host=env.ADMIN_HOSTNAME||'admin.verimtomu.fyi';if(!/^[a-z0-9.-]+$/.test(host))throw Error('Invalid admin hostname');
 const port=Number(env.PORT||3100);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
 const zone=env.CF_ZONE_ID||'';if(zone&&!/^[a-f0-9]{32}$/.test(zone))throw Error('Invalid zone');
 const token=env.CF_API_TOKEN_FILE?readFileSync(env.CF_API_TOKEN_FILE,'utf8').trim():'';
 if(token&&(!/^[A-Za-z0-9_-]{20,256}$/.test(token)))throw Error('Invalid analytics token file');
 // Stage 10: Search Console is optional. Without a credentials file the dashboard works as before;
 // an invalid file or site disables only the SEO section (validated when loaded, never fatal here).
 // The file is the OAuth refresh token written by tools/gsc-oauth-authorize.mjs (read-only mount).
 const gsc={credentialsFile:env.GSC_CREDENTIALS_FILE||'',siteUrl:env.GSC_SITE_URL||'sc-domain:verimtomu.fyi'};
 return {issuer,audience,host,port,bind:env.HOST||'0.0.0.0',db:env.ADMIN_DB_PATH||'/data/admin.sqlite',zone,token,publicHostname:'verimtomu.fyi',usageSnapshot:env.USAGE_SNAPSHOT_PATH||'',gsc};
}
