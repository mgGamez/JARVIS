import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { generateChat, generateImage, validateChat, ServiceError } from './ai.js';
import { capabilities } from './tools.js';
import { Store } from './store.js';
import { Gmail } from './mail.js';
import { ApprovalQueue, launchApp, calendarFile } from './actions.js';
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'], '/workspace.js': ['workspace.js', 'text/javascript; charset=utf-8'] };
const hash = value => createHash('sha256').update(value).digest();
export function createApp(options = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const model = options.model || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const imageModel = options.imageModel || process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  const fetchImpl = options.fetchImpl || fetch;
  const store = new Store(options.dataDir || process.env.JARVIS_DATA_DIR || fileURLToPath(new URL('../.data/', import.meta.url)));
  const gmail = new Gmail(store, { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: process.env.GOOGLE_REDIRECT_URI, fetchImpl, ...options.gmail });
  const desktop = (options.desktopEnabled ?? process.env.ENABLE_DESKTOP_TOOLS === 'true') && (options.platform || process.platform) === 'win32';
  const approvals = new ApprovalQueue(); const csrf = randomBytes(32).toString('hex');
  const password = options.password ?? process.env.JARVIS_PASSWORD;
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...(process.env.JARVIS_ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)]);
  let active = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      let hostname; try { hostname = new URL('http://' + req.headers.host).hostname; } catch { return json(400, { error: 'Invalid host.' }); }
      if (!allowedHosts.has(hostname)) return json(403, { error: 'Unrecognized host. Configure JARVIS_ALLOWED_HOSTS and authentication before remote use.' });
      const remote = req.socket.remoteAddress;
      if (!password && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return json(403, { error: 'Remote access requires JARVIS_PASSWORD and trusted HTTPS.' });
      if (password) {
        const expected = 'Basic ' + Buffer.from(`jarvis:${password}`).toString('base64');
        if (!timingSafeEqual(hash(req.headers.authorization || ''), hash(expected))) { res.setHeader('WWW-Authenticate', 'Basic realm="JARVIS", charset="UTF-8"'); return json(401, { error: 'Sign in with username jarvis and your JARVIS_PASSWORD.' }); }
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const mail = await gmail.status();
        return json(200, { version: '2.0.0', configured: Boolean(apiKey), model, imageModel, desktop, mail, csrfToken: csrf, provider: 'Google Gemini', tools: capabilities({ configured: Boolean(apiKey), imageModel, desktop, gmail: mail }) });
      }
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
        if (!['/api/chat', '/api/images'].includes(url.pathname) && req.headers['x-jarvis-csrf'] !== csrf) return json(403, { error: 'Reload JARVIS before approving an action.', code: 'CSRF' });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 300000) return json(413, { error: 'Request is too large.' }); chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return json(400, { error: 'Invalid JSON.' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'Expected an object.' });
        if (['/api/chat', '/api/images'].includes(url.pathname)) {
          if (active >= 3) return json(429, { error: 'Assistant is busy. Try again shortly.', code: 'BUSY' });
          active++;
          try {
            if (url.pathname === '/api/chat') return json(200, { ...await generateChat(validateChat(body), { apiKey, model, fetchImpl }), model });
            const image = await generateImage(body.prompt, { apiKey, imageModel, fetchImpl });
            const dir = path.join(store.directory, 'images'); await mkdir(dir, { recursive: true, mode: 0o700 });
            if ((await readdir(dir)).length >= 100) throw new ServiceError('Image storage limit reached (100). Back up and remove older files in .data/images.', 409, 'STORAGE_FULL');
            const file = randomUUID() + (image.mimeType === 'image/png' ? '.png' : image.mimeType === 'image/jpeg' ? '.jpg' : '.webp');
            await writeFile(path.join(dir, file), image.bytes, { mode: 0o600, flag: 'wx' });
            return json(200, { reply: image.text || 'Your generated image is ready.', imageUrl: '/api/images/' + file, model: imageModel });
          } finally { active--; }
        }
        if (url.pathname === '/api/actions/prepare') {
          if (body.tool === 'mail.send' && !(await gmail.status()).connected) throw new ServiceError('Connect Gmail first.', 409, 'MAIL_DISCONNECTED');
          if (body.tool === 'desktop.launch' && !desktop) throw new ServiceError('Enable desktop tools on a Windows computer first.', 409, 'DESKTOP_UNAVAILABLE');
          return json(200, { action: approvals.prepare(body.tool, body.args) });
        }
        if (url.pathname === '/api/actions/execute') {
          const action = approvals.consume(body.id, body.approved);
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
        if (url.pathname === '/api/mail/list') return json(200, { messages: await gmail.list(body.query) });
        if (url.pathname === '/api/mail/disconnect') return json(200, await gmail.disconnect());
      }
      if (req.method === 'GET' && Object.hasOwn(assets, url.pathname)) {
        const [file, type] = assets[url.pathname]; const content = await readFile(path.join(publicDir, file));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); return res.end(content);
      }
      json(404, { error: 'Not found.' });
    } catch (error) { json(error instanceof ServiceError ? error.status : 500, { error: error instanceof ServiceError ? error.message : 'The server could not complete the request. Check local data permissions and retry.', code: error.code || 'SERVER_ERROR' }); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000; return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3000);
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && !process.env.JARVIS_PASSWORD) { console.error('Remote binding requires JARVIS_PASSWORD. Use HOST=127.0.0.1 for local use.'); process.exitCode = 1; }
  else createApp().listen(port, host, () => console.log(`JARVIS 2 listening on ${host}:${port}. Gemini ${process.env.GEMINI_API_KEY ? 'configured (verify with a request)' : 'not configured'}.`));
}
