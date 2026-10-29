import { systemTool } from './system-tools.js';
import { brainRequest } from './client.js';
import { chromium } from 'playwright';
import { ManagedBrowser } from './browser.js';
import { localFiles } from './files.js';
import { launchApp } from '../server/actions.js';
const brain=new URL(process.env.JARVIS_BRAIN_URL||'http://localhost:3000');
if(brain.username||brain.password||!['https:','http:'].includes(brain.protocol)||brain.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(brain.hostname))throw Error('Use HTTPS for a remote brain, or localhost HTTP for a local brain. Do not put passwords in the URL.');
const token=process.env.JARVIS_DEVICE_TOKEN;if(!token||!/^[a-f0-9]{64}$/.test(token))throw Error('Set your private JARVIS_DEVICE_TOKEN from Devices > Pair computer.');
const allowedHosts=new Set((process.env.COMPANION_ALLOWED_HOSTS||'example.com').split(',').map(s=>s.trim()).filter(Boolean));
const browser=new ManagedBrowser({chromium,allowedHosts,launch:{env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|TOKEN|SECRET|PASSWORD/i.test(key))),headless:process.env.COMPANION_HEADLESS==='true',...(process.env.COMPANION_CHROME_PATH?{executablePath:process.env.COMPANION_CHROME_PATH}:{}),...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})}});
const capabilities=['browser','recording','system',...(process.env.COMPANION_REPO_ROOT?['git']:[]),...(process.env.ENABLE_DOCKER_TOOLS==='true'?['docker']:[]),...(process.env.COMPANION_FILES_ROOT?['files']:[]),...(process.platform==='win32'&&process.env.ENABLE_DESKTOP_TOOLS==='true'?['desktop']:[])];
const request=(path,body)=>brainRequest(brain,token,path,body);
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;browser.close();});
console.log('JARVIS companion online. Only explicitly approved queued tasks are accepted.');
while(!stopping){
  try{
    const {job}=await request('/api/companion/poll',{capabilities});
    if(job){let result=null,error='';let timeout;const heartbeat=setInterval(()=>request('/api/companion/poll',{capabilities,busy:true}).catch(()=>{}),10000);
      try{result=await Promise.race([(/^(system|git|docker)\./.test(job.command.kind))?systemTool(job.command):job.command.kind.startsWith('files.')?localFiles(job.command.kind,job.command.args,process.env.COMPANION_FILES_ROOT):job.command.kind==='desktop.launch'?launchApp(job.command.args.app,{enabled:process.env.ENABLE_DESKTOP_TOOLS==='true'}):browser.execute(job.command),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Task timeout. Inspect the device before retrying.')),115000);})]);}
      catch(e){error=e.message;await browser.close();}finally{clearTimeout(timeout);clearInterval(heartbeat);}
      // Do not retry a completion report: a lost response is explicitly uncertain.
      await request('/api/companion/result',{id:job.id,result,error});
    }
  }catch(e){console.error(e.message);}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,3000));
}
await browser.close();
