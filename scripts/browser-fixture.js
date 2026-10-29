// Explicit test-only server. Never used by npm start or npm run dev.
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.js';
if(process.env.JARVIS_TEST_FIXTURE!=='true')throw Error('This is a controlled test fixture, not a production server. Set JARVIS_TEST_FIXTURE=true only for browser tests.');
const dataDir=await mkdtemp(path.join(tmpdir(),'jarvis-ui-fixture-'));
const fixtureFetch=async(url,options={})=>{
 if(url.startsWith('https://api.github.com/'))return Response.json(options.method==='POST'?{number:99,html_url:'https://github.com/owner/repo/issues/99'}:[{sha:'fixture',commit:{message:'Controlled commit',author:{date:'2026-10-29'}},html_url:'https://github.com/owner/repo/commit/fixture'}]);
 const body=JSON.parse(options.body||'{}');const system=body.systemInstruction?.parts?.[0]?.text||'';
 if(system.includes('task planner')){const input=JSON.parse(body.contents[0].parts[0].text);const value=input.observations.length?{reply:'Controlled commit summary.',reads:[],proposal:null}:{reply:'',reads:[{tool:'github.commits',args:{repository:'owner/repo'}}],proposal:null};return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});}
 return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({kind:'call',name:'Call preparation',instructions:'Prepare a concise call brief. Flag unknown dates.',unsupported:[]})}]}}]});
};
createApp({testFixture:true,apiKey:'test-only-fixture',dataDir,draftImpl:async()=>({subject:'Controlled call brief',body:'Known: sample discussion. Unconfirmed: meeting date. Ask for confirmation.'}),fetchImpl:fixtureFetch}).listen(Number(process.env.PORT||3002),'127.0.0.1',()=>console.log('TEST FIXTURE ONLY: JARVIS UI server on loopback port '+(process.env.PORT||3002)));
