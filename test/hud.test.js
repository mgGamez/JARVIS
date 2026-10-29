import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.js';

test('dashboard reports scoped measurements without secrets; stop revokes direct approvals and resume stays explicit',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'jarvis-hud-'));
 const server=createApp({dataDir:dir,apiKey:'private-hud-test-key',scheduler:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const csrf=(await(await fetch(base+'/api/status')).json()).csrfToken;
  const post=(route,body,token=csrf)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-CSRF':token},body:JSON.stringify(body)});
  const data=await(await fetch(base+'/api/dashboard')).json();assert.equal(data.system.cpuPercent,null);assert.ok(data.system.totalMemoryBytes>0);assert.ok(data.system.processMemoryBytes>0);assert.match(data.system.scope,/Brain server/);assert.equal(data.providers.length,7);assert.equal(data.providers.find(p=>p.id==='gemini').configured,true);assert.ok(!JSON.stringify(data).includes('private-hud-test-key'));
  const args={title:'HUD test',dueAt:new Date(Date.now()+3600000).toISOString()};
  const {action}=await(await post('/api/actions/prepare',{tool:'reminders.create',args})).json();assert.ok(action.id);
  assert.equal((await post('/api/control/stop',{},'')).status,403);assert.equal((await post('/api/control/stop',{})).status,200);
  assert.equal((await post('/api/actions/execute',{id:action.id,approved:true})).status,409);assert.equal((await post('/api/control/resume',{approved:false})).status,403);
  assert.equal((await post('/api/control/resume',{approved:true})).status,200);assert.equal((await post('/api/actions/execute',{id:action.id,approved:true})).status,409);
  assert.equal((await(await fetch(base+'/api/reminders')).json()).reminders.length,0);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
