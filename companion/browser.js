import dns from 'node:dns/promises';
import net from 'node:net';
import { validateCommand } from '../server/protocol.js';
export function publicAddress(address) {
  if (net.isIP(address) === 4) { const [a,b] = address.split('.').map(Number); return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a>=224||a===198&&(b===18||b===19)); }
  if (net.isIP(address) === 6) { const lower=address.toLowerCase(); return !lower.startsWith('fc')&&!lower.startsWith('fd')&&!lower.startsWith('fe')&&!lower.startsWith('ff')&&lower!=='::'&&lower!=='::1'&&!lower.startsWith('::ffff:')&&lower.startsWith('2'); }
  return false;
}
export async function allowedUrl(value, allowedHosts, lookup = dns.lookup) {
  const url = new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!allowedHosts.has(url.hostname))throw Error('This HTTPS hostname is not in COMPANION_ALLOWED_HOSTS.');
  const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Private, loopback and metadata destinations are blocked.');return url.href;
}
export class ManagedBrowser {
  constructor({ chromium, allowedHosts, launch = {}, lookup } ) { this.chromium=chromium;this.allowedHosts=allowedHosts;this.launch={...launch,env:Object.fromEntries(Object.entries(launch.env||process.env).filter(([key])=>!/KEY|TOKEN|SECRET|PASSWORD/i.test(key)))};this.lookup=lookup;this.browser=null;this.page=null;this.recording=false;this.steps=[]; }
  async ensure() {
    if(this.page&&!this.page.isClosed())return;
    this.browser=await this.chromium.launch(this.launch);const context=await this.browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
    await context.routeWebSocket('**/*',socket=>socket.close({code:1008,reason:'WebSockets are disabled by the companion network policy.'}));
    await context.route('**/*',async route=>{try{await allowedUrl(route.request().url(),this.allowedHosts,this.lookup);await route.continue();}catch{await route.abort();}});
    await context.exposeBinding('__jarvisRecord',(_,step)=>{
      if(!this.recording||this.steps.length>=30)return;
      try{const checked=validateCommand(step);if(['browser.navigate','browser.fill'].includes(checked.kind))this.steps.push(checked);}catch{/* Ignore page-supplied unsupported events. */}
    });
    await context.addInitScript(()=>{
      const safeSelector=element=>element.id?'#'+CSS.escape(element.id):element.getAttribute('name')?'[name='+JSON.stringify(element.getAttribute('name'))+']':null;
      document.addEventListener('change',event=>{const e=event.target;if(!(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement)||/password|hidden|file/i.test(e.type)||/password|secret|token|credit|card|otp|auth|one.?time|cc-|csrf|session|credential|pin/i.test((e.name||'')+' '+(e.id||'')+' '+(e.autocomplete||'')))return;const selector=safeSelector(e);if(selector&&e.value.length<=2000)window.__jarvisRecord({kind:'browser.fill',args:{selector,value:e.value}}).catch(()=>{});},true);
    });
    this.page=await context.newPage();this.page.setDefaultTimeout(10000);this.page.setDefaultNavigationTimeout(20000);
    this.page.on('framenavigated',frame=>{if(this.recording&&frame===this.page.mainFrame()&&this.steps.length<30){try{const url=new URL(frame.url());url.search='';url.hash='';if(url.protocol==='https:')this.steps.push({kind:'browser.navigate',args:{url:url.href}});}catch{}}});
  }
  async execute(command, deadline=Date.now()+110000) {
    const checked=validateCommand(command);if(Date.now()>deadline)throw Error('Device task deadline exceeded.');
    if(checked.kind==='skill.replay'){const output=[];for(const step of checked.args.steps)output.push(await this.execute(step,deadline));return{steps:output};}
    await this.ensure();const {kind,args}=checked;
    if(kind==='browser.navigate'){const url=await allowedUrl(args.url,this.allowedHosts,this.lookup);await this.page.goto(url,{waitUntil:'domcontentloaded'});return{url:this.page.url(),title:await this.page.title()};}
    if(kind==='browser.read')return{url:this.page.url(),title:await this.page.title(),text:(await this.page.locator('body').innerText()).slice(0,12000)};
    if(kind==='browser.fill'){
      const field=this.page.locator(args.selector).first();const safe=await field.evaluate(e=>['INPUT','TEXTAREA'].includes(e.tagName)&&!['password','hidden','file'].includes(e.type)&&!/password|secret|token|credit|card|otp|auth|one.?time|cc-|csrf|session|credential|pin/i.test((e.name||'')+' '+(e.id||'')+' '+(e.autocomplete||'')));
      if(!safe)throw Error('Password, hidden, file and sensitive fields cannot be filled or recorded. Enter credentials manually in the managed browser.');await field.fill(args.value);return{message:'Field filled. Forms are never submitted automatically.'};
    }
    if(kind==='browser.link'){const href=await this.page.locator(args.selector).first().getAttribute('href');if(!href)throw Error('Select an ordinary HTTPS link. Buttons and forms are not clicked.');const url=await allowedUrl(new URL(href,this.page.url()).href,this.allowedHosts,this.lookup);await this.page.goto(url,{waitUntil:'domcontentloaded'});return{url:this.page.url()};}
    if(kind==='record.start'){this.steps=[];this.recording=true;if(this.page.url().startsWith('https:'))this.steps.push({kind:'browser.navigate',args:{url:new URL(this.page.url()).origin+new URL(this.page.url()).pathname}});return{message:'Recording supported browser navigation and non-sensitive field changes. Perform the routine in this managed browser, then approve Stop recording. No desktop screen or keystroke recording.'};}
    if(kind==='record.stop'){this.recording=false;return{steps:this.steps,message:'Review every URL, field value and selector before saving or replaying. Password fields are excluded, but remove any other private text yourself.'};}
    throw Error('Unsupported browser command.');
  }
  async close(){this.recording=false;await this.browser?.close().catch(()=>{});this.browser=null;this.page=null;}
}
