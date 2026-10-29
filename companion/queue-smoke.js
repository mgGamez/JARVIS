// Isolated end-to-end worker process test. No AI, account or external website calls.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createApp} from '../server/index.js';
const root=await mkdtemp(path.join(tmpdir(),'jarvis-worker-test-'));const files=path.join(root,'files');await mkdir(files);await writeFile(path.join(files,'notes.txt'),'Approved companion process fixture.');
const server=createApp({apiKey:'',dataDir:path.join(root,'brain'),scheduler:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;const csrf=(await(await fetch(base+'/api/status')).json()).csrfToken;
const api=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-CSRF':csrf},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};let child;
try{
 const pair=await api('/api/devices/pair',{name:'Isolated process test'});const prepared=await api('/api/actions/prepare',{tool:'device.task',args:{deviceId:pair.device.id,command:{kind:'files.read',args:{path:'notes.txt'}}}});const {job}=await api('/api/actions/execute',{id:prepared.action.id,approved:true});
 child=spawn(process.execPath,['--use-env-proxy',fileURLToPath(new URL('./index.js',import.meta.url))],{env:{...process.env,JARVIS_BRAIN_URL:base,JARVIS_DEVICE_TOKEN:pair.token,COMPANION_FILES_ROOT:files,COMPANION_ALLOWED_HOSTS:'example.com'},stdio:'ignore'});
 let done;for(let i=0;i<150;i++){done=(await server.automation.snapshot()).jobs.find(j=>j.id===job.id);if(['completed','failed'].includes(done.status))break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.equal(done.status,'completed',done.error);assert.equal(done.result.text,'Approved companion process fixture.');console.log('Companion process smoke passed: authenticated HTTP pairing, approved queue, separate worker process, confined local file read and returned result. No AI or external actions.');
}finally{if(child){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3500))]);if(child.exitCode===null)child.kill('SIGKILL');}await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
