import http from 'node:http';
export async function brainRequest(brain,token,route,body) {
  const url=new URL(route,brain);const payload=JSON.stringify(body);const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
  // The local brain is on this computer. Keep its loopback requests local, while
  // remote HTTPS requests retain the environment proxy and certificate trust.
  if(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))return new Promise((resolve,reject)=>{
    const request=http.request(url,{method:'POST',headers:{...headers,'Content-Length':Buffer.byteLength(payload)},agent:new http.Agent({proxyEnv:{}})},response=>{let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;if(text.length>300000)request.destroy(Error('Brain response exceeds size limit.'));});response.on('end',()=>{if(response.statusCode!==200)return reject(Error('Brain request failed ('+response.statusCode+'). Check pairing.'));try{resolve(JSON.parse(text));}catch{reject(Error('Brain returned invalid JSON.'));}});});request.setTimeout(15000,()=>request.destroy(Error('Brain request timed out.')));request.on('error',()=>reject(Error('Cannot reach the local brain. Check its port and running server.')));request.end(payload);
  });
  const response=await fetch(url,{method:'POST',headers,body:payload,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Brain request failed ('+response.status+'). Check address, pairing and authentication.');return response.json();
}
