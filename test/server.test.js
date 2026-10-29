import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import { generateReply, validateChat } from '../server/ai.js';
async function app(options, run) {
  const dir=await mkdtemp(path.join(tmpdir(),'jarvis-http-test-'));
  const server = createApp({...options,dataDir:dir}); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); await rm(dir,{recursive:true,force:true}); }
}
const input = { messages: [{ role: 'user', content: 'Hello' }], memory: ['I prefer concise answers.'] };
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test('serves real assets with security headers and no credentials', async () => app({ apiKey: 'server-only-key' }, async base => {
  for (const file of ['/', '/app.js', '/style.css', '/favicon.svg']) {
    const res = await fetch(base + file); assert.equal(res.status, 200); assert.ok(res.headers.get('content-security-policy')); assert.ok(!(await res.text()).includes('server-only-key'));
  }
  const status = await (await fetch(base + '/api/status')).json(); assert.equal(status.configured, true); assert.equal(status.tools.find(t => t.id === 'search').status, 'configured'); assert.ok(!JSON.stringify(status).includes('server-only-key'));
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/server/ai.js')).status, 404);
}));
test('missing API key yields actionable 503 rather than fake response', async () => app({ apiKey: '' }, async base => {
  const res = await fetch(base + '/api/chat', post(input)); assert.equal(res.status, 503); assert.equal((await res.json()).code, 'NOT_CONFIGURED');
}));
test('chat forwards approved memory and messages with secret only in provider header', async () => {
  let called = false;
  await app({ apiKey: 'secret-key', fetchImpl: async (url, opts) => {
    called = true; assert.match(url, /^https:\/\/generativelanguage.googleapis.com/); assert.ok(!url.includes('secret-key')); assert.equal(opts.headers['x-goog-api-key'], 'secret-key');
    const body = JSON.parse(opts.body); assert.equal(body.contents[0].parts[0].text, 'Hello'); assert.match(body.systemInstruction.parts[0].text, /I prefer concise answers/);
    return Response.json({ candidates: [{ content: { parts: [{ text: 'A private thought', thought: true }, { text: 'Hello there.' }] } }] });
  } }, async base => { const res = await fetch(base + '/api/chat', post(input)); assert.equal(res.status, 200); assert.equal((await res.json()).reply, 'Hello there.'); }); assert.equal(called, true);
});
test('rejects invalid input and cross-origin requests before contacting provider', async () => app({ apiKey: 'key', fetchImpl: () => { throw Error('must not run'); } }, async base => {
  for (const body of [{}, { messages: [] }, { messages: [{ role: 'system', content: 'bad' }] }, { ...input, memory: ['x'.repeat(501)] }]) assert.equal((await fetch(base + '/api/chat', post(body))).status, 400);
  const request = post(input); request.headers.Origin = 'https://evil.example'; assert.equal((await fetch(base + '/api/chat', request)).status, 403);
  assert.equal((await fetch(base + '/api/chat', { method: 'POST', body: 'not json', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await fetch(base + '/api/chat', { method: 'POST', body: '{}' })).status, 415);
}));
test('validates context limits and conversation roles', () => {
  assert.throws(() => validateChat({ messages: [{ role: 'user', content: 'a'.repeat(12001) }] }));
  assert.throws(() => validateChat({ messages: [{ role: 'assistant', content: 'hello' }] }));
  assert.throws(() => validateChat({ messages: Array.from({ length: 6 }, () => ({ role: 'user', content: 'a'.repeat(11000) })) }));
});
for (const [upstream, code, status] of [[403, 'AUTH_ERROR', 502], [429, 'RATE_LIMITED', 429], [404, 'UPSTREAM_ERROR', 502], [500, 'UPSTREAM_ERROR', 502]]) test(`provider ${upstream} handled safely`, async () => {
  await assert.rejects(generateReply(input, { apiKey: 'secret', fetchImpl: async () => new Response('sensitive upstream detail', { status: upstream }) }), e => e.code === code && e.status === status && !e.message.includes('sensitive'));
});
test('network and empty response errors are explicit', async () => {
  await assert.rejects(generateReply(input, { apiKey: 'key', fetchImpl: async () => { throw Error('connection'); } }), e => e.code === 'NETWORK_ERROR');
  await assert.rejects(generateReply(input, { apiKey: 'key', fetchImpl: async () => Response.json({ candidates: [] }) }), e => e.code === 'EMPTY_RESPONSE');
});
