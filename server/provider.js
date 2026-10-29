import {localFetch} from './local-http.js';
import {randomUUID} from 'node:crypto';
import {defaultAI,providerDefaults,keyNames,redactBody,localBase} from './llm-config.js';
export class ServiceError extends Error { constructor(message,status=502,code='UPSTREAM_ERROR'){super(message);this.status=status;this.code=code;} }
export async function providerRequest(requestedModel,originalBody,options={}) {
  const {fetchImpl=fetch,timeout=60000,store}=options;const settings=store?await store.read('ai-settings',defaultAI()):defaultAI();
  const provider=options.forceGemini?'gemini':options.provider||settings.provider;
  if(!Object.hasOwn(providerDefaults,provider))throw new ServiceError('Unknown AI provider.',400,'AI_SETTINGS');
  const local=['ollama','llama'].includes(provider);
  if(settings.privacy==='strict'&&!local)throw new ServiceError('Strict privacy permits local Ollama/llama.cpp AI only. Select a local model in AI Core.',403,'PRIVACY_BLOCKED');
  if(originalBody.tools&&!['gemini'].includes(provider))throw new ServiceError('Google grounding requires Gemini. Choose Gemini for Search/Research or use an ordinary chat mode.',400,'UNSUPPORTED_PROVIDER_FEATURE');
  const key=options.credentials?.[provider]||(provider==='gemini'?options.apiKey:process.env[keyNames[provider]]);
  if(!local&&!key)throw new ServiceError('Configure '+keyNames[provider]+' in the private server .env and restart.',503,'NOT_CONFIGURED');
  const model=options.modelOverride||(provider==='gemini'?(options.forceGemini?requestedModel:store?settings.models.gemini||requestedModel:requestedModel||settings.models.gemini):settings.models[provider]);
  const body=!local&&settings.privacy==='guarded'?redactBody(originalBody):originalBody;
  const maxTokens=Math.min(body.generationConfig?.maxOutputTokens||4096,4096);const reserve=Buffer.byteLength(JSON.stringify(body))+maxTokens+1024;const id=randomUUID();const started=Date.now();const day=new Date().toISOString().slice(0,10);
  if(store)await store.update('ai-usage',{day,used:0,reserved:0,calls:[]},value=>{if(value.day!==day)value={day,used:0,reserved:0,calls:value.calls||[]};if(value.used+value.reserved+reserve>settings.dailyTokenBudget)throw new ServiceError('Daily AI token guard reached. Review usage/budget in AI Core.',429,'BUDGET_LIMIT');value.reserved+=reserve;return value;});
  let response,data,status='failed',code='',actual=null,estimate=reserve;
  try{
    const messages=[{role:'system',content:body.systemInstruction?.parts?.map(p=>p.text||'').join('\n')||''},...(body.contents||[]).map(c=>({role:c.role==='model'?'assistant':'user',content:c.parts?.map(p=>p.text||'').join('')||''}))];
    let url,headers={'Content-Type':'application/json'},payload;
    if(provider==='gemini'){url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;headers['x-goog-api-key']=key;payload=body;}
    else if(provider==='anthropic'){url='https://api.anthropic.com/v1/messages';headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';payload={model,max_tokens:maxTokens,system:messages[0].content,messages:messages.slice(1)};}
    else if(provider==='ollama'){url=localBase(provider)+'/api/chat';payload={model,messages,stream:false,options:{num_predict:maxTokens},...(body.generationConfig?.responseMimeType==='application/json'?{format:'json'}:{})};}
    else {const bases={openai:'https://api.openai.com/v1',groq:'https://api.groq.com/openai/v1',openrouter:'https://openrouter.ai/api/v1',llama:local?localBase(provider)+'/v1':''};url=bases[provider]+'/chat/completions';if(key)headers.Authorization='Bearer '+key;payload={model,messages,max_tokens:maxTokens,stream:false,...(body.generationConfig?.responseMimeType==='application/json'?{response_format:{type:'json_object'}}:{})};}
    try{response=await (local&&fetchImpl===fetch?localFetch:fetchImpl)(url,{method:'POST',headers,signal:AbortSignal.timeout(timeout),body:JSON.stringify(payload)});}catch(error){if(['TimeoutError','AbortError'].includes(error.name))throw new ServiceError(provider+' request timed out. Inspect saved task state before retrying.',504,'PROVIDER_TIMEOUT');throw new ServiceError('Could not reach '+provider+'. Check server connectivity or local model service.',502,'NETWORK_ERROR');}
    if(!response.ok){if([401,403].includes(response.status))throw new ServiceError(provider+' rejected credentials or model access. Check that provider account.',502,'AUTH_ERROR');if(response.status===429)throw new ServiceError(provider+' quota/rate limit reached. Check provider quota and billing.',429,'RATE_LIMITED');throw new ServiceError(response.status===404?'The configured '+provider+' model or endpoint is unavailable. Check AI Core/.env.':provider+' is temporarily unavailable.',502,'UPSTREAM_ERROR');}
    try{data=await response.json();}catch{throw new ServiceError(provider+' returned unreadable JSON.',502,'UPSTREAM_ERROR');}
    if(provider==='gemini')actual=data.usageMetadata?.totalTokenCount??null;
    else if(provider==='anthropic'){actual=data.usage?Number(data.usage.input_tokens||0)+Number(data.usage.output_tokens||0):null;data={candidates:[{content:{parts:(data.content||[]).filter(c=>c.type==='text').map(c=>({text:c.text}))}}]};}
    else if(provider==='ollama'){actual=typeof data.eval_count==='number'?data.eval_count+Number(data.prompt_eval_count||0):null;data={candidates:[{content:{parts:[{text:data.message?.content||''}]}}]};}
    else{actual=data.usage?.total_tokens??null;data={candidates:[{content:{parts:[{text:data.choices?.[0]?.message?.content||''}]}}]};}
    estimate=Math.ceil((Buffer.byteLength(JSON.stringify(body))+Buffer.byteLength(JSON.stringify(data)))/3);status='succeeded';return {...data,jarvisProvider:provider,jarvisModel:model};
  }catch(error){code=error.code||'UPSTREAM_ERROR';throw error;}
  finally{if(store)await store.update('ai-usage',{day,used:0,reserved:0,calls:[]},value=>{value.reserved=Math.max(0,value.reserved-reserve);value.used+=Number.isFinite(actual)?actual:status==='succeeded'?estimate:0;value.calls=[...(value.calls||[]),{id,at:started,provider,model,privacy:settings.privacy,status,code,tokens:Number.isFinite(actual)?actual:null,estimatedTokens:status==='succeeded'?estimate:0,durationMs:Date.now()-started}].slice(-500);return value;});}
}
