const endpoint='https://api.cloudflare.com/client/v4/graphql';
export class CloudflareAnalytics {
 constructor({zone,token,publicHostname},fetcher=fetch){this.zone=zone;this.token=token;this.hostname=publicHostname;this.fetcher=fetcher;}
 async query(query,variables){
  if(!this.zone||!this.token)throw Error('not_configured');
  const r=await this.fetcher(endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error([401,403].includes(r.status)?'permissions':r.status===429?'rate_limited':'upstream');
  const reader=r.body.getReader();let size=0,parts=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144)throw Error('upstream');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  let data;try{data=JSON.parse(Buffer.concat(parts).toString());}catch{throw Error('upstream');}
  if(data.errors?.length||!data.data)throw Error('dataset_unavailable');return data.data;
 }
 async totals(now=new Date()){
  const settings=await this.query('query($zone: string!){viewer{zones(filter:{zoneTag:$zone}){settings{httpRequestsAdaptiveGroups{enabled availableFields notOlderThan maxDuration}}}}}',{zone:this.zone});
  const s=settings.viewer?.zones?.[0]?.settings?.httpRequestsAdaptiveGroups;
  if(!s?.enabled||!s.availableFields?.includes('count'))throw Error('dataset_unavailable');
  const metrics={};
  // This bounded first version requests HTTP counts only; never IPs, URLs or identities.
  for(const hours of [24,168]){
   if(s.notOlderThan<hours*3600||s.maxDuration<hours*3600){metrics[hours]=null;continue;}
   const d=await this.query('query($zone:string!,$filter:ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!){viewer{zones(filter:{zoneTag:$zone}){httpRequestsAdaptiveGroups(limit:1,filter:$filter){count}}}}',{zone:this.zone,filter:{datetime_geq:new Date(now.getTime()-hours*3600000).toISOString(),datetime_lt:now.toISOString(),clientRequestHTTPHost:this.hostname}});
   const rows=d.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
   if(!Array.isArray(rows))throw Error('dataset_unavailable');const count=rows.length?rows[0].count:0;
   if(!Number.isSafeInteger(count)||count<0)throw Error('upstream');metrics[hours]=count;
  }
  return {requests24h:metrics[24],requests7d:metrics[168],source:'Cloudflare HTTP Analytics',sampled:true};
 }
}
