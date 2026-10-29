import { initWorkspace, setWorkspaceStatus, renderArtifacts } from './workspace.js';
const $ = id => document.getElementById(id);
const STORAGE = 'jarvis.workspace.v1';
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const hasTTS = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let state = { chats: [], memories: [], settings: { speak: false, voice: '', rate: 1 } };
let storageWarning = '';
try {
  const raw = localStorage.getItem(STORAGE);
  if (raw) {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.chats) || !Array.isArray(data.memories)) throw Error();
    state.chats = data.chats.filter(c => c && typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages)).slice(0, 100).map(c => ({ ...c, messages: c.messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-200) }));
    state.memories = data.memories.filter(m => m && typeof m.id === 'string' && typeof m.text === 'string' && m.text.length <= 500).slice(0, 30);
    state.settings = { speak: data.settings?.speak === true, voice: typeof data.settings?.voice === 'string' ? data.settings.voice : '', rate: [0.8, 1, 1.2].includes(data.settings?.rate) ? data.settings.rate : 1 };
  }
} catch { storageWarning = 'Saved history could not be read. This session will still work; your previous data has not been overwritten.'; }
let currentId = null, busy = false, status = null, listening = false, recognition = null, storageBlocked = Boolean(storageWarning);
const uid = () => crypto.randomUUID();
function save() {
  if (storageBlocked) return;
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  catch { showNotice('Browser storage is unavailable or full. Changes in this session will not survive a reload. Delete older conversations or allow site storage.'); }
}
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function showNotice(message, action, handler) {
  $('notice').replaceChildren(document.createTextNode(message));
  if (action) { const b = node('button', '', action); b.onclick = handler; $('notice').append(b); }
  $('notice').classList.remove('hidden');
}
function hideNotice() { $('notice').classList.add('hidden'); }
function activeChat() { return state.chats.find(c => c.id === currentId); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('menuButton').setAttribute('aria-expanded', 'false'); }
function renderHistory() {
  $('history').replaceChildren();
  if (!state.chats.length) $('history').append(node('p', 'history-empty', 'A fresh start. Your conversations will appear here.'));
  for (const chat of state.chats) {
    const row = node('div', `history-row${chat.id === currentId ? ' selected' : ''}`);
    const button = node('button', 'history-link', `◌  ${chat.title}`); button.title = chat.title;
    button.onclick = () => { if (busy) return; stopVoice(); currentId = chat.id; render(); closeSidebar(); };
    const del = node('button', 'icon-button delete-chat', '×'); del.setAttribute('aria-label', `Delete ${chat.title}`);
    del.onclick = () => { if (busy || !confirm('Delete this conversation from this browser?')) return; state.chats = state.chats.filter(c => c.id !== chat.id); if (currentId === chat.id) currentId = null; save(); render(); };
    button.disabled = busy; del.disabled = busy; row.append(button, del); $('history').append(row);
  }
  $('memoryCount').textContent = state.memories.length;
}
function renderMessages() {
  const chat = activeChat(); $('messages').replaceChildren();
  $('stage').classList.toggle('hidden', Boolean(chat?.messages.length));
  $('conversation').classList.toggle('hidden', !chat?.messages.length);
  $('chatTitle').textContent = chat?.title || 'New conversation';
  for (const msg of chat?.messages || []) {
    const row = node('article', `message ${msg.role}`);
    const avatar = node('span', 'message-avatar', msg.role === 'user' ? 'Y' : 'J');
    const content = node('div', 'message-content');
    const heading = node('div', 'message-heading', msg.role === 'user' ? 'You' : 'JARVIS');
    const date = new Date(msg.createdAt); if (!Number.isNaN(date.getTime())) heading.append(node('small', '', date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
    content.append(heading, node('div', 'message-body', msg.content));
    renderArtifacts(msg, content);
    if (msg.failed) content.append(node('p', 'panel-description', 'Request failed · this turn is excluded from future AI context.'));
    const actions = node('div', 'message-tools');
    if (msg.role === 'assistant' && hasTTS) { const b = node('button', '', '♫ Read aloud'); b.onclick = () => speak(msg.content); actions.append(b); }
    const memory = node('button', '', '＋ Save a memory'); memory.onclick = () => { openMemory(); $('memoryInput').value = msg.content.slice(0, 500); $('memoryInput').focus(); }; actions.append(memory);
    content.append(actions); row.append(avatar, content); $('messages').append(row);
  }
}
function render() { renderHistory(); renderMessages(); syncVoice(); }
function setBusy(value) {
  busy = value; $('sendButton').disabled = value; $('newChat').disabled = value; $('prompt').disabled = value;
  $('thinking').classList.toggle('hidden', !value); $('reactor').classList.toggle('busy', value);
  $('stageStatus').textContent = value ? 'THINKING' : 'READY WHEN YOU ARE'; renderHistory();
}
function scrollToEnd() { window.scrollTo({ top: document.body.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
async function checkStatus() {
  const indicator = $('connection'); indicator.className = 'connection'; indicator.replaceChildren(node('i'), document.createTextNode('Checking server'));
  try {
    const res = await fetch('/api/status', { signal: AbortSignal.timeout(8000) }); if (!res.ok) throw Error();
    status = await res.json(); setWorkspaceStatus(status); indicator.className = `connection ${status.configured ? 'ready' : 'error'}`;
    indicator.replaceChildren(node('i'), document.createTextNode(status.configured ? 'Gemini configured' : 'Setup required'));
    $('providerLabel').textContent = status.model;
    if (!status.configured) showNotice('Connect your intelligence. Add a Gemini API key on the server to begin chatting.', 'Setup details', openSettings);
  } catch { status = null; indicator.className = 'connection error'; indicator.replaceChildren(node('i'), document.createTextNode('Server unavailable')); showNotice('Cannot reach the JARVIS server. Start the server and check again.', 'Retry', checkStatus); }
}
async function send() {
  const rawInput = $('prompt').value.trim(); if (!rawInput || busy) return;
  const command = rawInput.match(/^\/(search|research|image|debug)\s+/i);
  const input = command ? rawInput.slice(command[0].length).trim() : rawInput;
  let mode = command ? command[1].toLowerCase() : $('chatMode').value;
  if (mode === 'auto') mode = /^(create|generate|draw|make)\b.{0,40}\b(image|picture|illustration|logo|artwork)\b/i.test(input) ? 'image' : /\b(search|look up|latest|current|today|internet|web|news)\b/i.test(input) ? 'search' : /\b(compare|research|best product|best laptop|best phone)\b/i.test(input) ? 'research' : /\b(debug|traceback|stack trace|fix this code)\b/i.test(input) ? 'debug' : 'chat';
  if (listening) recognition?.stop();
  hideNotice(); stopVoice();
  let chat = activeChat();
  if (!chat) { chat = { id: uid(), title: input.slice(0, 48), messages: [] }; state.chats.unshift(chat); state.chats = state.chats.slice(0, 100); currentId = chat.id; }
  // Failed turns are retained as user text locally, but not sent as consecutive user turns.
  chat.messages.push({ role: 'user', content: input, mode, createdAt: new Date().toISOString() });
  chat.messages = chat.messages.slice(-200);
  $('prompt').value = ''; $('prompt').style.height = 'auto'; save(); render(); setBusy(true); scrollToEnd();
  try {
    const turns = chat.messages.filter(m => !m.failed).slice(-40).map(({ role, content }) => ({ role, content }));
    const res = await fetch(mode === 'image' ? '/api/images' : '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'image' ? { prompt: input } : { messages: turns, memory: state.memories.map(m => m.text), mode }), signal: AbortSignal.timeout(mode === 'image' ? 135000 : 75000) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'The request failed. Please retry.');
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw Error('The server returned no response.');
    chat.messages.push({ role: 'assistant', content: data.reply, sources: data.sources, grounded: data.grounded, searchAttribution: data.searchAttribution, imageUrl: data.imageUrl, mode, createdAt: new Date().toISOString() }); save(); renderMessages();
    if (state.settings.speak) speak(data.reply);
    $('connection').className = 'connection ready'; $('connection').replaceChildren(node('i'), document.createTextNode('Gemini connected'));
  } catch (error) {
    chat.messages.at(-1).failed = true; save(); renderMessages();
    const message = error.name === 'TimeoutError' ? 'This request timed out. Please try again.' : error.message === 'Failed to fetch' ? 'Connection lost. Check the server and try again.' : error.message;
    showNotice(message, 'Retry message', () => { $('prompt').value = rawInput; $('prompt').focus(); });
    $('connection').className = 'connection error'; $('connection').replaceChildren(node('i'), document.createTextNode('Request failed'));
  } finally { setBusy(false); scrollToEnd(); $('prompt').focus(); }
}
function stopVoice() { if (hasTTS) speechSynthesis.cancel(); }
function speak(text) {
  if (!hasTTS) return showNotice('Spoken responses are not supported in this browser.');
  if (listening) recognition?.stop(); stopVoice();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = speechSynthesis.getVoices().find(v => v.voiceURI === state.settings.voice); if (voice) utterance.voice = voice;
  utterance.rate = state.settings.rate;
  utterance.onerror = event => { if (!['interrupted', 'canceled'].includes(event.error)) showNotice('Speech playback failed. Check your browser audio permissions or choose another voice.'); };
  speechSynthesis.speak(utterance);
}
function syncVoice() {
  $('speechToggle').setAttribute('aria-pressed', String(state.settings.speak));
  $('speechToggle').setAttribute('aria-label', state.settings.speak ? 'Disable spoken responses' : 'Enable spoken responses');
  $('speechToggle').disabled = !hasTTS;
}
function toggleMic() {
  if (listening) { recognition?.stop(); return; }
  if (!Recognition) return showNotice('Voice input is unavailable in this browser. Try a browser with SpeechRecognition support, such as Chrome. You can always type.');
  if (!window.isSecureContext) return showNotice('Microphone input requires HTTPS or localhost. Use a secure connection or type your message.');
  if (busy) return;
  stopVoice(); recognition = new Recognition(); recognition.lang = navigator.language || 'en-US'; recognition.continuous = false; recognition.interimResults = true;
  const initial = $('prompt').value;
  recognition.onstart = () => { listening = true; $('micButton').classList.add('listening'); $('micButton').setAttribute('aria-label', 'Stop voice input'); showNotice('Listening… Your browser may send audio to its speech service. Tap the microphone to stop.'); };
  recognition.onresult = event => { let transcript = ''; for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript; $('prompt').value = `${initial}${initial ? ' ' : ''}${transcript}`.slice(0, 12000); resizePrompt(); };
  recognition.onerror = event => { const messages = { 'not-allowed': 'Microphone permission was denied. Allow microphone access in browser settings, or type instead.', 'audio-capture': 'No microphone was found. Check your device input.', 'no-speech': 'No speech detected. Tap the microphone to try again.', 'network': 'The browser speech service could not connect. Check your connection or type instead.' }; showNotice(messages[event.error] || `Voice input stopped (${event.error}). You can still type.`); };
  recognition.onend = () => { listening = false; $('micButton').classList.remove('listening'); $('micButton').setAttribute('aria-label', 'Start voice input'); if ($('notice').textContent.startsWith('Listening')) hideNotice(); };
  try { recognition.start(); } catch { showNotice('Voice input could not start. Try again or use the keyboard.'); }
}
function openPanel(title) { $('panelTitle').textContent = title; $('panelContent').replaceChildren(); if (!$('panel').open) $('panel').showModal(); }
function openMemory() {
  openPanel('A memory, with your permission.'); $('panelContent').append($('memoryTemplate').content.cloneNode(true));
  $('memoryForm').onsubmit = event => {
    event.preventDefault(); const text = $('memoryInput').value.trim(); if (!text) return;
    if (state.memories.length >= 30) return alert('You can save up to 30 memories. Remove one before adding another.');
    if (state.memories.some(m => m.text === text)) return alert('This memory is already saved.');
    state.memories.push({ id: uid(), text }); save(); $('memoryInput').value = ''; renderMemories(); renderHistory();
  }; renderMemories();
}
function renderMemories() {
  $('memoryList').replaceChildren();
  if (!state.memories.length) $('memoryList').append(node('p', 'panel-description', 'Nothing saved yet. You are in control of what JARVIS remembers.'));
  for (const memory of state.memories) {
    const row = node('div', 'memory-row'); const del = node('button', 'icon-button', '×'); del.setAttribute('aria-label', `Forget ${memory.text}`);
    del.onclick = () => { if (!confirm('Forget this memory?')) return; state.memories = state.memories.filter(m => m.id !== memory.id); save(); renderMemories(); renderHistory(); };
    row.append(node('p', '', memory.text), del); $('memoryList').append(row);
  }
}
function openSettings() {
  openPanel('Make yourself at home.');
  const info = node('div', 'settings-info'); info.textContent = `Provider: Google Gemini · ${status?.model || 'Server offline'}\n${status?.configured ? 'Server key present. Connection is verified only when a chat request succeeds.' : 'Add GEMINI_API_KEY to the server .env file, then restart the server. Never put a key in this page.'}`; info.style.whiteSpace = 'pre-line'; $('panelContent').append(info);
  const row = node('label', 'setting-row', 'Speak responses'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = state.settings.speak; checkbox.disabled = !hasTTS; checkbox.onchange = () => { state.settings.speak = checkbox.checked; save(); syncVoice(); if (!checkbox.checked) stopVoice(); }; row.append(checkbox); $('panelContent').append(row);
  const label = node('label', '', 'Voice'); label.htmlFor = 'voiceSelect'; const select = node('select'); select.id = 'voiceSelect';
  select.append(new Option('Browser default', '')); if (hasTTS) for (const voice of speechSynthesis.getVoices()) select.append(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI)); select.value = state.settings.voice; select.onchange = () => { state.settings.voice = select.value; save(); };
  $('panelContent').append(label, select);
  const rateLabel = node('label', '', 'Speaking speed'); rateLabel.htmlFor = 'rateSelect'; const rate = node('select'); rate.id = 'rateSelect'; for (const [value, text] of [[0.8, 'Relaxed'], [1, 'Natural'], [1.2, 'Brisk']]) rate.append(new Option(text, String(value))); rate.value = String(state.settings.rate); rate.onchange = () => { state.settings.rate = Number(rate.value); save(); }; $('panelContent').append(rateLabel, rate);
  const stop = node('button', 'secondary-button', 'Stop speaking'); stop.onclick = stopVoice; const test = node('button', 'secondary-button', 'Test voice'); test.disabled = !hasTTS; test.onclick = () => speak('Hello. I am JARVIS. Ready when you are.'); const recheck = node('button', 'secondary-button', 'Check connection'); recheck.onclick = async () => { await checkStatus(); if ($('panel').open) openSettings(); }; $('panelContent').append(test, stop, recheck);
  $('panelContent').append(node('p', 'panel-description', `Voice input: ${Recognition ? 'browser API detected; microphone permission and service availability still required' : 'not supported in this browser'}. Speech playback: ${hasTTS ? 'browser API detected; available voices vary by device' : 'not supported'}.\nConversation text and approved memories are sent to Google when you send a message. History and preferences are saved only in this browser. Browser speech recognition may use a third-party service. Use Tools for Gmail, reminders and approved Windows launches. Direct phone control is not available.`));
}
function resizePrompt() { $('prompt').style.height = 'auto'; $('prompt').style.height = `${Math.min($('prompt').scrollHeight, 160)}px`; }
$('newChat').onclick = () => { if (busy) return; currentId = null; stopVoice(); render(); closeSidebar(); $('prompt').focus(); };
$('sendButton').onclick = send; $('prompt').oninput = resizePrompt;
$('prompt').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } };
$('micButton').onclick = toggleMic;
$('speechToggle').onclick = () => { state.settings.speak = !state.settings.speak; save(); syncVoice(); if (!state.settings.speak) stopVoice(); else speak('Voice responses enabled.'); };
$('memoryNav').onclick = () => { closeSidebar(); openMemory(); }; $('settingsNav').onclick = () => { closeSidebar(); openSettings(); }; $('chatNav').onclick = closeSidebar;
$('closePanel').onclick = () => $('panel').close();
$('panel').onclick = event => { if (event.target === $('panel')) { const rect = $('panel').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('panel').close(); } };
$('menuButton').onclick = () => { const open = $('sidebar').classList.toggle('open'); $('menuButton').setAttribute('aria-expanded', String(open)); };
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeSidebar(); stopVoice(); if (listening) recognition?.stop(); } });
document.addEventListener('click', event => { if (innerWidth <= 760 && !$('sidebar').contains(event.target) && !$('menuButton').contains(event.target)) closeSidebar(); });
$('clearHistory').onclick = () => { if (busy || !confirm('Delete all conversations on this browser? Approved memories will be kept.')) return; state.chats = []; currentId = null; storageBlocked = false; save(); render(); };
for (const button of document.querySelectorAll('[data-prompt]')) button.onclick = () => { $('prompt').value = button.dataset.prompt; resizePrompt(); $('prompt').focus(); };
if (hasTTS) speechSynthesis.addEventListener('voiceschanged', () => { if ($('panel').open && $('voiceSelect')) { const value = state.settings.voice; const select = $('voiceSelect'); select.replaceChildren(new Option('Browser default', '')); for (const voice of speechSynthesis.getVoices()) select.append(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI)); select.value = value; } });
window.addEventListener('pagehide', () => { stopVoice(); recognition?.abort(); });
// Inline vector icons keep controls recognizable without remote fonts or libraries.
function controlIcon(id, paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'})) svg.setAttribute(key, value);
  for (const d of paths) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.append(path); }
  $(id).replaceChildren(svg);
}
controlIcon('micButton', ['M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Z', 'M5 10v2a7 7 0 0 0 14 0v-2', 'M12 19v3M8 22h8']);
controlIcon('speechToggle', ['M11 4 5 9H2v6h3l6 5Z', 'M15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16']);
render(); await checkStatus(); initWorkspace(); if (storageWarning) showNotice(storageWarning);

$('attachButton').onclick = () => $('attachment').click();
$('attachment').onchange = async () => {
  const file = $('attachment').files[0]; if (!file) return;
  try {
    if (file.size > 48000) throw Error('Attach a text excerpt smaller than 48 KB.');
    if (!/\.(txt|md|js|ts|py|json|csv|log|html|css|sql|jsx|tsx|yaml|yml)$/i.test(file.name)) throw Error('Choose a supported text, code or log file.');
    const text = await file.text(); if (text.includes('\0')) throw Error('Binary files are not supported.');
    const combined = `${$('prompt').value}\n\nFile: ${file.name}\n${text}`.trim();
    if (combined.length > 12000) throw Error('This text exceeds the 12,000-character message limit. Attach a smaller excerpt.');
    $('prompt').value = combined; $('chatMode').value = 'debug'; resizePrompt();
    showNotice('File added to your message. Review and remove secrets before sending it to Gemini.');
  } catch (e) { showNotice(e.message); } finally { $('attachment').value = ''; }
};
