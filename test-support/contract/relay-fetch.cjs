// Isolated fake upstream only. Never used by production.
globalThis.fetch=async(url,options)=>{
 if(url==='https://api.openai.com/v1/chat/completions')return new Response(JSON.stringify({received:JSON.parse(options.body)}),{status:200});
 if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return new Response(JSON.stringify({success:true,hostname:'verimtomu.fyi',action:'contract-check',unexpected:'must-not-forward'}),{status:200});
 throw Error('Unexpected upstream');
};
