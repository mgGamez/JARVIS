import {spawn} from 'node:child_process';
import {createApp} from '../server/index.js';
import {localFetch} from '../server/local-http.js';
const [major,minor]=process.versions.node.split('.').map(Number);if(major<24||major===24&&minor<5)throw Error('Install Node.js 24.5 or newer.');
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be a number from 1 to 65535.');
if(!['localhost','127.0.0.1','::1'].includes(host)&&!process.env.JARVIS_PASSWORD)throw Error('Remote binding needs JARVIS_PASSWORD and trusted HTTPS.');
const base='http://localhost:'+port;const open=()=>{if(process.platform==='win32'){const child=spawn('cmd.exe',['/d','/c','start','',base],{stdio:'ignore',windowsHide:true,shell:false});child.on('error',()=>console.log('Open '+base+' in your browser.'));child.unref();}else console.log('Open '+base+' in your browser.');};
let existing=false;try{const r=await localFetch(base+'/api/status',{headers:process.env.JARVIS_PASSWORD?{Authorization:'Basic '+Buffer.from('jarvis:'+process.env.JARVIS_PASSWORD).toString('base64')}:{},signal:AbortSignal.timeout(1500)});existing=r.ok&&(await r.json()).version==='3.0.0';}catch{}
if(existing){console.log('JARVIS 3 is already running.');open();}else{const server=createApp();server.once('error',e=>{console.error(e.code==='EADDRINUSE'?'Port '+port+' is used by another process. Change PORT in .env; no process was stopped.':'Startup failed. Check HOST, PORT and data permissions.');process.exitCode=1;server.close();});server.listen(port,host,()=>{console.log('JARVIS 3 running at '+base+'. Keep this window open.');open();});}
