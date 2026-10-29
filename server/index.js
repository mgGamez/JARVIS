import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { generateChat, generateImage, validateChat, ServiceError } from './ai.js';
import { capabilities } from './tools.js';
import { Store } from './store.js';
import { Gmail } from './mail.js';
import { TaskAgent } from './agent.js';
import { MemoryVault } from './memory.js';
import { GitHub } from './github.js';
import { defaultAI, providerDefaults, keyNames, validateAI } from './llm-config.js';
import { providerRequest } from './provider.js';
import { Automation, draftWorkflow, compileWorkflow, template, validateWorkflow } from './automation.js';
import { ApprovalQueue, launchApp, calendarFile } from './actions.js';
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'], '/workspace.js': ['workspace.js', 'text/javascript; charset=utf-8'], '/automation.js': ['automation.js', 'text/javascript; charset=utf-8'], '/core.js': ['core.js', 'text/javascript; charset=utf-8'] };
const hash = value => createHash('sha256').update(value).digest();
export function createApp(options = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const model = options.model || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const imageModel = options.imageModel || process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  const fetchImpl = options.fetchImpl || fetch;
  const store = new Store(options.dataDir || process.env.JARVIS_DATA_DIR || fileURLToPath(new URL('../.data/', import.meta.url)));
  const memory=new MemoryVault(store.directory);
  const aiOptions={apiKey,model,fetchImpl,store};
  const github=new GitHub({fetchImpl,token:options.githubToken??process.env.GITHUB_API_TOKEN??process.env.GH_TOKEN});
  const gmail = new Gmail(store, { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: process.env.GOOGLE_REDIRECT_URI, fetchImpl, ...options.gmail });
  const automation = new Automation(store, { draft: options.draftImpl || (input => draftWorkflow(input, aiOptions)), send: args => gmail.send(args), github:args=>github.createIssue(args), calendar: options.calendarImpl || ((from,to) => gmail.calendarEvents(from,to)) });
  const agent=new TaskAgent(store,{aiOptions,github,gmail,memory,automation});
  const desktop = (options.desktopEnabled ?? process.env.ENABLE_DESKTOP_TOOLS === 'true') && (options.platform || process.platform) === 'win32';
  const approvals = new ApprovalQueue(); const csrf = randomBytes(32).toString('hex');
  const password = options.password ?? process.env.JARVIS_PASSWORD;
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...(process.env.JARVIS_ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)]);
  let active = 0;let ready=Promise.resolve();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      await ready;
      const url = new URL(req.url, 'http://localhost');
      let hostname; try { hostname = new URL('http://' + req.headers.host).hostname; } catch { return json(400, { error: 'Invalid host.' }); }
      if (!allowedHosts.has(hostname)) return json(403, { error: 'Unrecognized host. Configure JARVIS_ALLOWED_HOSTS and authentication before remote use.' });
      const companionRequest = req.method === 'POST' && ['/api/companion/poll','/api/companion/result'].includes(url.pathname);
      if (companionRequest) await automation.authenticate((req.headers.authorization || '').replace(/^Bearer /,''));
      const remote = req.socket.remoteAddress;
      if (!companionRequest && !password && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return json(403, { error: 'Remote access requires JARVIS_PASSWORD and trusted HTTPS.' });
      if (password && !companionRequest) {
        const expected = 'Basic ' + Buffer.from(`jarvis:${password}`).toString('base64');
        if (!timingSafeEqual(hash(req.headers.authorization || ''), hash(expected))) { res.setHeader('WWW-Authenticate', 'Basic realm="JARVIS", charset="UTF-8"'); return json(401, { error: 'Sign in with username jarvis and your JARVIS_PASSWORD.' }); }
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const mail = await gmail.status();const ai=await store.read('ai-settings',defaultAI());
        return json(200, { version: '3.0.0',testFixture:options.testFixture===true, configured: ['ollama','llama'].includes(ai.provider)?true:Boolean(ai.provider==='gemini'?apiKey:process.env[keyNames[ai.provider]]), model:ai.models[ai.provider], aiProvider:ai.provider, privacy:ai.privacy, imageModel, desktop, mail, csrfToken: csrf, provider: 'Google Gemini', tools: capabilities({ configured: Boolean(apiKey), imageModel, desktop, gmail: mail }) });
      }
      if(req.method==='GET'&&url.pathname==='/api/overview'){const [tasks,flows,reminders]=await Promise.all([agent.list(),automation.snapshot(),store.read('reminders',[])]);return json(200,{activeTasks:tasks.filter(r=>['queued','running'].includes(r.status)).length,pendingApprovals:flows.runs.filter(r=>r.status==='waiting_approval'&&r.approval?.expires>Date.now()).length+tasks.filter(r=>r.status==='waiting_read_approval'&&r.pendingReads?.expiresAt>Date.now()).length+[...approvals.pending.values()].filter(a=>a.expiresAt>Date.now()).length,onlineDevices:flows.devices.filter(d=>d.online).length,pendingDeviceJobs:flows.jobs.filter(j=>j.status==='queued').length,upcomingReminders:reminders.filter(r=>!r.completed).length,observedAt:Date.now()});}
      if(req.method==='GET'&&url.pathname==='/api/tasks')return json(200,{runs:await agent.list()});
      if(req.method==='GET'&&url.pathname==='/api/tasks/events'){const id=url.searchParams.get('id');if(!(await agent.list()).some(r=>r.id===id))return json(404,{error:'Task not found.'});res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});let cursor=0;let polling=false;const timer=setInterval(async()=>{if(polling)return;polling=true;try{const run=(await agent.list()).find(r=>r.id===id);for(const event of (run?.events||[]).slice(cursor)){res.write('data: '+JSON.stringify(event)+'\n\n');cursor++;}if(!run||['completed','failed','cancelled','waiting_read_approval'].includes(run.status)){res.write('event: done\ndata: '+JSON.stringify({status:run?.status})+'\n\n');clearInterval(timer);res.end();}}catch{clearInterval(timer);res.end();}finally{polling=false;}},500);timer.unref();res.on('close',()=>clearInterval(timer));return;}
      if (req.method === 'GET' && url.pathname === '/api/memory') return json(200,{facts:memory.list(),mode:'keyword'});
      if (req.method === 'GET' && url.pathname === '/api/apps') return json(200,{github:{configured:Boolean(github.token),publicReads:true},google:await gmail.status()});
      if (req.method === 'GET' && url.pathname === '/api/ai') { const settings=await store.read('ai-settings',defaultAI());const usage=await store.read('ai-usage',{day:new Date().toISOString().slice(0,10),used:0,reserved:0,calls:[]});return json(200,{settings,usage,providers:Object.keys(providerDefaults).map(id=>({id,configured:['ollama','llama'].includes(id)?null:Boolean(id==='gemini'?apiKey:process.env[keyNames[id]]),keyName:keyNames[id]||null}))}); }
      if (req.method === 'GET' && url.pathname === '/api/automation') return json(200, { ...await automation.snapshot(), templates: ['meeting','call','research'].map(kind => ({ kind, definition: template(kind) })) });
      if (req.method === 'GET' && url.pathname === '/api/mail/callback') {
        const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('jarvis_oauth='))?.slice('jarvis_oauth='.length);
        await gmail.callback(url.searchParams, cookie);
        res.writeHead(303, { Location: '/?gmail=connected', 'Set-Cookie': 'jarvis_oauth=; HttpOnly; SameSite=Lax; Path=/api/mail; Max-Age=0', 'Cache-Control': 'no-store' }); return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/api/reminders') {
        const reminders = await store.read('reminders', []); return json(200, { reminders: reminders.map(r => ({ ...r, due: !r.completed && new Date(r.dueAt).getTime() <= Date.now() })) });
      }
      if (req.method === 'GET' && /^\/api\/reminders\/[a-f0-9-]{36}\.ics$/.test(url.pathname)) {
        const id = url.pathname.split('/').at(-1).slice(0, -4); const reminder = (await store.read('reminders', [])).find(r => r.id === id);
        if (!reminder) return json(404, { error: 'Reminder not found.' });
        res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="jarvis-reminder.ics"', 'Cache-Control': 'no-store' }); return res.end(calendarFile(reminder));
      }
      if (req.method === 'GET' && /^\/api\/images\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(url.pathname)) {
        const file = url.pathname.split('/').at(-1); let bytes;
        try { bytes = await readFile(path.join(store.directory, 'images', file)); } catch (e) { if (e.code === 'ENOENT') return json(404, { error: 'Image not found. It may belong to a different JARVIS installation.' }); throw e; }
        res.writeHead(200, { 'Content-Type': file.endsWith('.png') ? 'image/png' : file.endsWith('.jpg') ? 'image/jpeg' : 'image/webp', 'Cache-Control': 'private, max-age=3600' }); return res.end(bytes);
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`)) return json(403, { error: 'Cross-origin requests are not allowed.', code: 'FORBIDDEN' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Use application/json.' });
        // All privileged state-changing actions require a same-origin anti-CSRF token.
        if (!companionRequest && !['/api/chat', '/api/images'].includes(url.pathname) && req.headers['x-jarvis-csrf'] !== csrf) return json(403, { error: 'Reload JARVIS before approving an action.', code: 'CSRF' });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 300000) return json(413, { error: 'Request is too large.' }); chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return json(400, { error: 'Invalid JSON.' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'Expected an object.' });
        if (url.pathname === '/api/companion/poll') return json(200, await automation.poll((req.headers.authorization || '').slice(7),body.capabilities,body.busy===true));
        if (url.pathname === '/api/companion/result') { await automation.finish((req.headers.authorization || '').slice(7),body.id,body.result,body.error); return json(200,{ok:true}); }
        if(url.pathname==='/api/tasks/cancel'){await agent.cancel(body.id);return json(200,{ok:true});}
        if(url.pathname==='/api/tasks/start')return json(200,{run:await agent.start(body.goal,body.timeZone)});
        if(url.pathname==='/api/tasks/approve-read'){await agent.approveReads(body.id,body.pendingId,body.approved);return json(200,{ok:true});}
        if(url.pathname==='/api/memory/save') {if(body.approved!==true)throw new ServiceError('Explicit approval is required to save memory.',403,'APPROVAL_REQUIRED');const fact=memory.save(body.content);let indexing='not configured';if(process.env.MEMORY_EMBEDDING_MODEL){try{await memory.index(fact.id);indexing='indexed locally';}catch{indexing='failed; keyword search remains available';}}return json(200,{fact,indexing});}
        if(url.pathname==='/api/memory/search')return json(200,body.semantic===true?await memory.semantic(body.query||''):memory.search(body.query||''));
        if(url.pathname==='/api/memory/index'){if(body.approved!==true)throw new ServiceError('Approve local indexing.',403,'APPROVAL_REQUIRED');await memory.index(String(body.id||''));return json(200,{ok:true});}
        if(url.pathname==='/api/memory/forget'){if(body.approved!==true)throw new ServiceError('Confirm forgetting this fact.',403,'APPROVAL_REQUIRED');memory.forget(String(body.id||''));return json(200,{ok:true});}
        if (url.pathname === '/api/github/read') {await automation.requireAllowed('source.read');return json(200,{data:await github.read(body.repository,body.kind)});}
        if (url.pathname === '/api/ai/settings') {const settings=validateAI(body.settings);await store.write('ai-settings',settings);return json(200,{settings});}
        if (url.pathname === '/api/ai/probe') {const result=await providerRequest(model,{contents:[{parts:[{text:'Reply with OK.'}]}],generationConfig:{maxOutputTokens:16}},{...aiOptions,provider:body.provider});if(!result.candidates?.[0]?.content?.parts?.some(p=>p.text?.trim()))throw new ServiceError('Provider returned no text.',502,'EMPTY_RESPONSE');return json(200,{message:'Provider returned a successful response. Check the model-call log.'});}
        if (url.pathname === '/api/workflows/compile') return json(200,{definition:await compileWorkflow(body.prompt,aiOptions)});
        if (url.pathname === '/api/workflows/validate') return json(200,{definition:validateWorkflow(body.definition)});
        if (url.pathname === '/api/workflows/save') return json(200,{workflow:await automation.save(body.definition,body.id)});
        if (url.pathname === '/api/workflows/publish') return json(200,{workflow:await automation.publish(body.id)});
        if (url.pathname === '/api/workflows/enable') { await automation.enable(body.id,body.enabled); return json(200,{ok:true}); }
        if (url.pathname === '/api/workflows/run') return json(200,{run:await automation.start(body.id,body.notes || '')});
        if (url.pathname === '/api/workflows/approve') { await automation.approve(body.id,body.approvalId,body.approved); return json(200,{ok:true}); }
        if (url.pathname === '/api/workflows/cancel') { await automation.cancel(body.id); return json(200,{ok:true}); }
        if (url.pathname === '/api/authority') return json(200,{authority:await automation.authority(body.authority || {})});
        if (url.pathname === '/api/context') return json(200,{context:await automation.context(body.context || {})});
        if (url.pathname === '/api/devices/pair') return json(200,await automation.pair(body.name));
        if (url.pathname === '/api/devices/revoke') { await automation.revoke(body.id); return json(200,{ok:true}); }
        if (url.pathname === '/api/skills/save') return json(200,{skill:await automation.saveSkill(body.name,body.steps)});
        if (['/api/chat', '/api/images'].includes(url.pathname)) {
          if (active >= 3) return json(429, { error: 'Assistant is busy. Try again shortly.', code: 'BUSY' });
          active++;
          try {
            if (url.pathname === '/api/chat') { const input = validateChat(body); const context = (await automation.read()).context; if (Object.values(context).some(Boolean)) input.memory.push('User-approved shared context: ' + JSON.stringify(context));const last=input.messages.at(-1);for(const fact of memory.search(last.content).facts)input.memory.push('Approved remembered fact: '+fact.content);const prefix=last.content.match(/^@(gemini|openai|anthropic|claude|groq|openrouter|ollama|llama)(?::([a-zA-Z0-9._:/-]+))?\s+/i);const selection=prefix?{provider:prefix[1].toLowerCase()==='claude'?'anthropic':prefix[1].toLowerCase(),...(prefix[2]?{modelOverride:prefix[2]}:{})}:{};if(prefix)last.content=last.content.slice(prefix[0].length);return json(200,await generateChat(input,{...aiOptions,...selection})); }
            const dir = path.join(store.directory, 'images'); await mkdir(dir, { recursive: true, mode: 0o700 });
            if ((await readdir(dir)).length >= 100) throw new ServiceError('Image storage limit reached (100). Back up and remove older files in .data/images before generating more.', 409, 'STORAGE_FULL');
            const image = await generateImage(body.prompt, { ...aiOptions, imageModel });
            const file = randomUUID() + (image.mimeType === 'image/png' ? '.png' : image.mimeType === 'image/jpeg' ? '.jpg' : '.webp');
            await writeFile(path.join(dir, file), image.bytes, { mode: 0o600, flag: 'wx' });
            return json(200, { reply: image.text || 'Your generated image is ready.', imageUrl: '/api/images/' + file, model: imageModel });
          } finally { active--; }
        }
        if (url.pathname === '/api/actions/prepare') {
          if (body.tool === 'github.issue') await automation.requireAllowed('external.write');
          if (body.tool === 'mail.send') await automation.requireAllowed('mail.send');
          if (['desktop.launch','device.task'].includes(body.tool)) await automation.requireAllowed('device.execute');
          if (body.tool === 'mail.send' && !(await gmail.status()).connected) throw new ServiceError('Connect Gmail first.', 409, 'MAIL_DISCONNECTED');
          if (body.tool === 'desktop.launch' && !desktop) throw new ServiceError('Enable desktop tools on a Windows computer first.', 409, 'DESKTOP_UNAVAILABLE');
          return json(200, { action: approvals.prepare(body.tool, body.args) });
        }
        if (url.pathname === '/api/actions/execute') {
          const action = approvals.consume(body.id, body.approved);
          if (action.tool === 'github.issue') {await automation.requireAllowed('external.write');return json(200,await github.createIssue(action.args));}
          if (action.tool === 'device.task') return json(200,{message:'Approved task queued on the selected computer.',job:await automation.enqueue(action.args.deviceId,action.args.command)});
          if (action.tool === 'mail.send') await automation.requireAllowed('mail.send');
          if (action.tool === 'desktop.launch') await automation.requireAllowed('device.execute');
          if (action.tool === 'mail.send') return json(200, await gmail.send(action.args));
          if (action.tool === 'desktop.launch') return json(200, await launchApp(action.args.app, { enabled: desktop, platform: options.platform, spawnImpl: options.spawnImpl }));
          if (action.tool === 'reminders.create') {
            if (new Date(action.args.dueAt).getTime() <= Date.now()) throw new ServiceError('The selected time has passed. Create a new reminder.', 409, 'TIME_PASSED');
            const reminder = { id: randomUUID(), ...action.args, completed: false };
            await store.update('reminders', [], list => { if (list.length >= 500) throw new ServiceError('Reminder limit reached. Delete older reminders.', 409, 'STORAGE_FULL'); return [...list, reminder]; });
            return json(200, { message: 'Reminder saved on the server. Keep JARVIS open for in-app alerts or import it into your calendar.', reminder });
          }
        }
        if (url.pathname === '/api/reminders/update') {
          if (!['complete', 'delete'].includes(body.action) || typeof body.id !== 'string') throw new ServiceError('Invalid reminder action.', 400, 'INVALID_REQUEST');
          await store.update('reminders', [], list => { if (!list.some(r => r.id === body.id)) throw new ServiceError('Reminder not found.', 404, 'NOT_FOUND'); return body.action === 'delete' ? list.filter(r => r.id !== body.id) : list.map(r => r.id === body.id ? { ...r, completed: true } : r); });
          return json(200, { message: 'Reminder updated.' });
        }
        if (url.pathname === '/api/mail/connect') { const login = gmail.connect(); res.setHeader('Set-Cookie', `jarvis_oauth=${login.browser}; HttpOnly; SameSite=Lax; Path=/api/mail; Max-Age=600${req.headers.origin?.startsWith('https:') ? '; Secure' : ''}`); return json(200, { url: login.url }); }
        if (url.pathname === '/api/mail/list') { await automation.requireAllowed('source.read'); return json(200, { messages: await gmail.list(body.query) }); }
        if (url.pathname === '/api/mail/disconnect') return json(200, await gmail.disconnect());
      }
      if (req.method === 'GET' && Object.hasOwn(assets, url.pathname)) {
        const [file, type] = assets[url.pathname]; const content = await readFile(path.join(publicDir, file));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); return res.end(content);
      }
      json(404, { error: 'Not found.' });
    } catch (error) { json(error instanceof ServiceError ? error.status : 500, { error: error instanceof ServiceError ? error.message : 'The server could not complete the request. Check local data permissions and retry.', code: error.code || 'SERVER_ERROR' }); }
  });
  server.automation = automation;
  server.on('listening', () => { if (options.scheduler !== false) ready=Promise.all([automation.startTimer(),agent.recover()]).catch(() => { automation.error='Automation storage initialization failed.'; }); });
  server.on('close', () => {automation.stop();memory.close();});
  server.requestTimeout = 30000; server.headersTimeout = 15000; return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3000);
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && !process.env.JARVIS_PASSWORD) { console.error('Remote binding requires JARVIS_PASSWORD. Use HOST=127.0.0.1 for local use.'); process.exitCode = 1; }
  else createApp().listen(port, host, () => console.log(`JARVIS 3 listening on ${host}:${port}. Gemini ${process.env.GEMINI_API_KEY ? 'configured (verify with a request)' : 'not configured'}.`));
}
