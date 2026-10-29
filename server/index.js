import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateReply, validateChat, ServiceError } from './ai.js';
import { tools } from './tools.js';
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
export function createApp({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-2.5-flash', fetchImpl = fetch } = {}) {
  let active = 0;
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/status') return json(200, { configured: Boolean(apiKey), model, tools, provider: 'Google Gemini' });
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        // Reject cross-origin browser requests; this service has no public authentication.
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`)) return json(403, { error: 'Cross-origin requests are not allowed.', code: 'FORBIDDEN' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Use application/json.' });
        if (active >= 3) return json(429, { error: 'Assistant is busy. Please try again shortly.', code: 'BUSY' });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 300000) { json(413, { error: 'Request is too large.' }); return; } chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return json(400, { error: 'Invalid JSON.' }); }
        const input = validateChat(body);
        active++;
        try { const reply = await generateReply(input, { apiKey, model, fetchImpl }); return json(200, { reply, model }); } finally { active--; }
      }
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname]; const content = await readFile(path.join(publicDir, file));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); return res.end(content);
      }
      json(404, { error: 'Not found.' });
    } catch (error) {
      json(error instanceof ServiceError ? error.status : 500, { error: error instanceof ServiceError ? error.message : 'The server could not complete the request.', code: error.code || 'SERVER_ERROR' });
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1'; const port = Number(process.env.PORT || 3000);
  createApp().listen(port, host, () => console.log(`JARVIS listening on ${host}:${port}. Gemini ${process.env.GEMINI_API_KEY ? 'configured (not yet verified)' : 'not configured'}.`));
}
