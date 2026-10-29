import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createApp } from '../server/index.js';
import { generateChat, generateImage } from '../server/ai.js';
import { Store } from '../server/store.js';
import { Gmail } from '../server/mail.js';
import { ApprovalQueue, validateAction, launchApp, calendarFile } from '../server/actions.js';
const input = { messages: [{ role: 'user', content: 'Compare current laptops' }], memory: [], mode: 'research' };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZcoAAAAASUVORK5CYII=';
async function fixture(options, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'jarvis-test-')); const server = createApp({ apiKey: 'test-key', dataDir: dir, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { const status = await (await fetch(base + '/api/status')).json(); await fn({ base, status, dir, post: (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis-CSRF': status.csrfToken, ...headers }, body: JSON.stringify(body) }) }); }
  finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
}
test('grounded research requests Google Search and exposes only safe source URLs', async () => {
  const response = await generateChat(input, { apiKey: 'key', fetchImpl: async (_, opts) => {
    const body = JSON.parse(opts.body); assert.deepEqual(body.tools, [{ google_search: {} }]); assert.match(body.systemInstruction.parts[0].text, /criteria table/);
    return Response.json({ candidates: [{ content: { parts: [{ text: 'A researched answer.' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/review', title: 'Review' } }, { web: { uri: 'javascript:alert(1)' } }, { web: { uri: 'https://example.com/review' } }], searchEntryPoint: { renderedContent: '<div>Google search</div>' } } }] });
  } });
  assert.equal(response.grounded, true); assert.equal(response.sources.length, 1); assert.equal(response.sources[0].url, 'https://example.com/review'); assert.ok(response.searchAttribution);
});
test('debug does not request web or pretend to execute code', async () => {
  await generateChat({ ...input, mode: 'debug' }, { apiKey: 'key', fetchImpl: async (_, opts) => { const body = JSON.parse(opts.body); assert.equal(body.tools, undefined); assert.match(body.systemInstruction.parts[0].text, /cannot execute code/); return Response.json({ candidates: [{ content: { parts: [{ text: 'Proposed fix' }] } }] }); } });
});
test('image generation persists provider bytes and serves only generated paths', async () => fixture({ fetchImpl: async (_, opts) => { assert.deepEqual(JSON.parse(opts.body).generationConfig.responseModalities, ['TEXT', 'IMAGE']); return Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: png, mimeType: 'image/png' } }] } }] }); } }, async ({ post, base, dir }) => {
  const result = await post('/api/images', { prompt: 'A cyan reactor' }); assert.equal(result.status, 200); const data = await result.json();
  const image = await fetch(base + data.imageUrl); assert.equal(image.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(png, 'base64'));
  assert.ok((await readFile(path.join(dir, 'images', data.imageUrl.split('/').at(-1)))).length);
  assert.equal((await fetch(base + '/api/images/../../.env')).status, 404);
}));
test('image provider refusal and invalid bytes do not fabricate images', async () => {
  for (const parts of [[], [{ inlineData: { mimeType: 'image/png', data: 'bm90IGFuIGltYWdl' } }]]) await assert.rejects(generateImage('test', { apiKey: 'key', fetchImpl: async () => Response.json({ candidates: [{ content: { parts } }] }) }), e => e.code === 'NO_IMAGE');
});
test('approval is explicit, immutable and single-use', () => {
  const queue = new ApprovalQueue(); const args = { app: 'notepad' }; const action = queue.prepare('desktop.launch', args); args.app = 'calculator';
  assert.throws(() => queue.consume(action.id, false), e => e.code === 'APPROVAL_REQUIRED');
  assert.equal(queue.consume(action.id, true).args.app, 'notepad'); assert.throws(() => queue.consume(action.id, true), e => e.code === 'APPROVAL_EXPIRED');
  const expired = queue.prepare('desktop.launch', args); expired.expiresAt = 0; assert.throws(() => queue.consume(expired.id, true));
  for (const bad of ['cmd', 'powershell', '__proto__', 'notepad.exe & calc']) assert.throws(() => validateAction('desktop.launch', { app: bad }));
  assert.throws(() => validateAction('mail.send', { to: 'a@example.com\r\nBcc: evil@example.com', subject: 'x', body: 'x' }));
});
test('reminders persist and export escaped calendar events; CSRF is enforced', async () => fixture({}, async ({ post, base, dir }) => {
  const args = { title: 'Tea, then review; notes\nBring a mug', dueAt: new Date(Date.now() + 600000).toISOString() };
  assert.equal((await post('/api/actions/prepare', { tool: 'reminders.create', args }, { 'X-Jarvis-CSRF': '' })).status, 403);
  const { action } = await (await post('/api/actions/prepare', { tool: 'reminders.create', args })).json();
  assert.deepEqual(await new Store(dir).read('reminders', []), []);
  assert.equal((await post('/api/actions/execute', { id: action.id, approved: false })).status, 403);
  const created = await post('/api/actions/execute', { id: action.id, approved: true, args: { title: 'tampered' } }); assert.equal(created.status, 200); const { reminder } = await created.json();
  assert.equal(reminder.title, args.title); assert.equal((await new Store(dir).read('reminders', [])).length, 1);
  assert.equal((await post('/api/actions/execute', { id: action.id, approved: true })).status, 409);
  const calendar = await (await fetch(base + `/api/reminders/${reminder.id}.ics`)).text(); assert.match(calendar, /Tea\\, then review\\; notes\\nBring a mug/); assert.match(calendar, /BEGIN:VALARM/);
  await post('/api/reminders/update', { id: reminder.id, action: 'complete' }); assert.equal((await (await fetch(base + '/api/reminders')).json()).reminders[0].completed, true);
  await post('/api/reminders/update', { id: reminder.id, action: 'delete' }); assert.equal((await (await fetch(base + '/api/reminders')).json()).reminders.length, 0);
}));
test('store serializes concurrent writes without losing reminders', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jarvis-store-')); try { const store = new Store(dir); await Promise.all(Array.from({ length: 15 }, (_, i) => store.update('reminders', [], list => [...list, i]))); assert.equal((await store.read('reminders', [])).length, 15); } finally { await rm(dir, { recursive: true, force: true }); }
});
test('desktop launches use a fixed executable without a shell and require opt-in', async () => {
  await assert.rejects(launchApp('calculator', { enabled: true, platform: 'linux' }), e => e.code === 'DESKTOP_UNAVAILABLE');
  await assert.rejects(launchApp('calculator', { enabled: false, platform: 'win32' }));
  const result = await launchApp('calculator', { enabled: true, platform: 'win32', spawnImpl: (exe, args, opts) => { assert.equal(exe, 'calc.exe'); assert.deepEqual(args, []); assert.equal(opts.shell, false); const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit('spawn')); return child; } }); assert.match(result.message, /accepted/);
});
test('Gmail OAuth binds browser state, uses PKCE, refreshes tokens and sends Unicode mail', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jarvis-mail-')); const store = new Store(dir); const calls = [];
  const fake = async (url, opts) => { calls.push({ url, opts }); if (url.includes('/token')) return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 }); if (url.includes('messages/send')) return Response.json({ id: 'sent-test-id' }); if (url.includes('messages?')) return Response.json({ messages: [{ id: 'mail1' }] }); return Response.json({ id: 'mail1', snippet: '<b>untrusted text</b>', payload: { headers: [{ name: 'Subject', value: 'Hello' }, { name: 'From', value: 'friend@example.com' }] } }); };
  try {
    const mail = new Gmail(store, { clientId: 'test-client', clientSecret: 'test-client-secret', fetchImpl: fake });
    const bad = mail.connect(); const badUrl = new URL(bad.url); await assert.rejects(mail.callback(new URLSearchParams({ state: badUrl.searchParams.get('state'), code: 'code' }), 'wrong-browser'), e => e.code === 'OAUTH_STATE');
    const login = mail.connect(); const url = new URL(login.url); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    await mail.callback(new URLSearchParams({ state: url.searchParams.get('state'), code: 'code' }), login.browser);
    await assert.rejects(mail.callback(new URLSearchParams({ state: url.searchParams.get('state'), code: 'code' }), login.browser));
    assert.equal((await mail.status()).connected, true);
    const token = await store.read('gmail', null); token.expiresAt = 0; await store.write('gmail', token);
    const messages = await mail.list('in:inbox'); assert.equal(messages[0].subject, 'Hello'); assert.equal(calls.filter(c => c.url.includes('/token')).length, 2);
    const sent = await mail.send(validateAction('mail.send', { to: 'a@example.com', subject: 'Hello नमस्ते', body: 'Unicode message ✓' })); assert.equal(sent.id, 'sent-test-id');
    const request = calls.find(c => c.url.includes('messages/send')); const mime = Buffer.from(JSON.parse(request.opts.body).raw, 'base64url').toString(); assert.match(mime, /Content-Transfer-Encoding: base64/); assert.match(mime, /Subject: =\?UTF-8\?B\?/); assert.equal(request.opts.headers.Authorization, 'Bearer test-access');
    await mail.disconnect(); assert.equal((await mail.status()).connected, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('mail remains unavailable without account configuration', async () => fixture({}, async ({ post, status }) => {
  assert.equal(status.mail.configured, false); assert.equal((await post('/api/mail/connect', {})).status, 503); assert.equal((await post('/api/mail/list', {})).status, 409);
  assert.equal((await post('/api/actions/prepare', { tool: 'mail.send', args: { to: 'a@example.com', subject: 'x', body: 'y' } })).status, 409);
}));
test('authentication protects assets and API; host allowlist rejects DNS rebinding', async () => fixture({ password: 'test-login' }, async ({ base }) => {
  assert.equal((await fetch(base)).status, 401); assert.equal((await fetch(base + '/api/status')).status, 401);
  assert.equal((await fetch(base, { headers: { Authorization: 'Basic ' + Buffer.from('jarvis:test-login').toString('base64') } })).status, 200);
  const rejectedHost = await new Promise((resolve, reject) => { const req = http.get(base, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
  assert.equal(rejectedHost, 403);
}));
test('calendar folds UTF-8 text without splitting characters', () => {
  const value = calendarFile({ id: 'test', dueAt: new Date().toISOString(), title: '日'.repeat(100) }); for (const line of value.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
});
test('Gmail HTTP send waits for approval and ignores tampered execution arguments', async () => {
  let sends = 0;
  await fixture({ gmail: { clientId: 'test-client', clientSecret: 'test-secret' }, fetchImpl: async (url, opts) => {
    assert.ok(url.endsWith('/messages/send')); sends++;
    const mime = Buffer.from(JSON.parse(opts.body).raw, 'base64url').toString(); assert.match(mime, /To: approved@example.com/); assert.ok(!mime.includes('tampered@example.com'));
    return Response.json({ id: 'test-sent-id' });
  } }, async ({ post, dir }) => {
    await new Store(dir).write('gmail', { refresh_token: 'test-refresh', access_token: 'test-access', expiresAt: Date.now() + 3600000 });
    const { action } = await (await post('/api/actions/prepare', { tool: 'mail.send', args: { to: 'approved@example.com', subject: 'Approved subject', body: 'Approved body' } })).json();
    assert.equal(sends, 0);
    assert.equal((await post('/api/actions/execute', { id: action.id, approved: false })).status, 403); assert.equal(sends, 0);
    const response = await post('/api/actions/execute', { id: action.id, approved: true, args: { to: 'tampered@example.com' } }); assert.equal(response.status, 200); assert.equal((await response.json()).id, 'test-sent-id'); assert.equal(sends, 1);
    assert.equal((await post('/api/actions/execute', { id: action.id, approved: true })).status, 409); assert.equal(sends, 1);
  });
});
