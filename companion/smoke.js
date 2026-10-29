// Controlled browser fixture: real Chromium actions, no personal accounts or mail.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ManagedBrowser} from './browser.js';
const managed=new ManagedBrowser({chromium,allowedHosts:new Set(['example.com']),lookup:async()=>[{address:'93.184.216.34'}],launch:{headless:true,executablePath:process.env.COMPANION_CHROME_PATH||undefined,args:process.env.JARVIS_TEST_NO_SANDBOX==='true'?['--no-sandbox']:[]}});
try{
 await managed.ensure();await managed.page.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Companion fixture</h1><input id="search"><input id="password" type="password"><button type="submit">Send</button><a id="next" href="/next">Next</a>'}));
 await managed.execute({kind:'browser.navigate',args:{url:'https://example.com/'}});assert.match((await managed.execute({kind:'browser.read'})).text,/Companion fixture/);
 await managed.execute({kind:'record.start'});await managed.execute({kind:'browser.fill',args:{selector:'#search',value:'approved search'}});await managed.page.locator('#search').press('Tab');
 await assert.rejects(managed.execute({kind:'browser.fill',args:{selector:'#password',value:'must-not-fill'}}));assert.equal(await managed.page.locator('#password').inputValue(),'');
 const recording=await managed.execute({kind:'record.stop'});assert.ok(recording.steps.some(s=>s.kind==='browser.fill'));assert.ok(!JSON.stringify(recording).includes('must-not-fill'));
 await managed.execute({kind:'skill.replay',args:{steps:recording.steps}});assert.equal(await managed.page.locator('#search').inputValue(),'approved search');
 await assert.rejects(managed.execute({kind:'browser.link',args:{selector:'button'}}));await managed.execute({kind:'browser.link',args:{selector:'#next'}});assert.equal(managed.page.url(),'https://example.com/next');
 await assert.rejects(managed.execute({kind:'browser.navigate',args:{url:'https://127.0.0.1/'}}));console.log('Companion Chromium smoke passed: navigate/read/fill, sensitive-field rejection, browser recording/replay, link-only navigation and host guard. Controlled page; no real accounts or Windows app launch.');
}finally{await managed.close();}
