import {initHUD} from './hud.js';
import {initCore,setCoreStatus,openTasks} from './core.js';
import { initAutomation, setAutomationStatus } from './automation.js';
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
let status = null, reminderTimer, lastReminderError = '', notified = new Set();
export function setWorkspaceStatus(value) { status = value; setAutomationStatus(value);setCoreStatus(value); }
async function api(route, body) {
  const response = await fetch(route, body === undefined ? { signal: AbortSignal.timeout(15000) } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis-CSRF': status?.csrfToken || '' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const data = await response.json(); if (!response.ok) throw Error(data.error || 'Request failed.'); return data;
}
function panel(title) { $('panel').classList.remove('wide-panel'); $('panelTitle').textContent = title; $('panelContent').replaceChildren(); if (!$('panel').open) $('panel').showModal(); }
function note(text) { $('panelContent').append(el('p', 'panel-description', text)); }
function result(text, isError = false) { const n = $('toolResult'); if (n) { n.textContent = text; n.classList.toggle('error-text', isError); } }
function resultArea() { const area = el('p', 'tool-result'); area.id = 'toolResult'; area.setAttribute('role', 'status'); $('panelContent').append(area); }
function button(text, fn, cls = 'secondary-button') { const b = el('button', cls, text); b.type = 'button'; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { result(e.message, true); } finally { b.disabled = false; } }; return b; }
function field(form, name, label, { type = 'text', max = 200, required = true, multiline = false } = {}) {
  const l = el('label', '', label); l.htmlFor = name; const n = el(multiline ? 'textarea' : 'input', 'tool-input'); n.id = name; n.name = name; n.required = required; n.maxLength = max; if (!multiline) n.type = type; else n.rows = 5; form.append(l, n); return n;
}
function link(text, href, cls = 'secondary-button') { const a = el('a', cls, text); a.href = href; if (href.startsWith('https:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; }
async function approve(tool, args, after) {
  const { action } = await api('/api/actions/prepare', { tool, args });
  panel('Review & approve'); note('Only the action below will run. Approval expires in five minutes. No action has been executed yet.');
  $('panelContent').append(el('strong', '', action.tool));
  const preview = el('dl', 'action-preview');
  for (const [key, value] of Object.entries(action.args)) preview.append(el('dt', '', key), el('dd', '', key === 'dueAt' ? new Date(value).toLocaleString() : value));
  $('panelContent').append(preview); resultArea();
  const execute = button('Approve & execute', async () => {
    execute.disabled = true; cancel.disabled = true;
    try { const response = await api('/api/actions/execute', { id: action.id, approved: true }); result(response.message); execute.remove(); cancel.textContent = 'Done'; cancel.disabled = false; cancel.onclick = after; }
    catch (e) { result(e.message + (tool === 'mail.send' ? ' Check Sent before preparing another send to avoid duplicates.' : ' Prepare a new action to retry.'), true); execute.remove(); cancel.disabled = false; cancel.textContent = 'Back'; }
  }, 'primary-button');
  const cancel = button('Cancel', after); $('panelContent').append(execute, cancel);
}
export function openWorkspace() {
  panel('Your connected workspace'); note('Choose a tool. Configured means credentials are present; each provider request can still fail due to quota or account access. Nothing runs without your action.');
  const grid = el('div', 'workspace-grid');
  for (const [title, text, fn] of [['Reminders', 'Save, review and export to your calendar', openReminders], ['Mail', 'Connect Gmail, read and approve sends', openMail], ['Desktop apps', 'Approved launches on your Windows computer', openDesktop], ['Phone handoffs', 'Compose mail and import calendar events', openPhone]]) {
    const card = button('', fn, 'workspace-card'); card.append(el('strong', '', title), el('small', '', text)); grid.append(card);
  }
  $('panelContent').append(grid);
  for (const tool of status?.tools || []) { const row = el('div', 'tool-row'); const info = el('div'); info.append(el('strong', '', tool.name), el('p', '', tool.description)); row.append(info, el('span', `tool-badge ${tool.status}`, tool.status.toUpperCase())); $('panelContent').append(row); }
  resultArea();
}
export async function openReminders() {
  panel('Reminders & calendar'); note('Saved on the JARVIS server. In-app alerts require this page and server to stay open. Import a calendar file for notifications managed by your phone or laptop calendar.');
  const form = el('form'); const title = field(form, 'reminderTitle', 'What should you remember?'); const due = field(form, 'reminderTime', 'When? (your device’s local time)', { type: 'datetime-local' });
  const submit = el('button', 'primary-button', 'Review reminder'); form.append(submit);
  form.onsubmit = async e => { e.preventDefault(); submit.disabled = true; try { const date = new Date(due.value); if (!Number.isFinite(date.getTime())) throw Error('Choose a valid date and time.'); await approve('reminders.create', { title: title.value, dueAt: date.toISOString() }, openReminders); } catch (e) { result(e.message, true); } finally { submit.disabled = false; } };
  $('panelContent').append(form);
  $('panelContent').append(button('Enable browser notifications', async () => { if (!('Notification' in window)) throw Error('This browser does not support notifications. Use calendar import instead.'); const permission = await Notification.requestPermission(); result(`Browser notifications: ${permission}. Alerts still require JARVIS to be open.`); }));
  const list = el('div'); list.id = 'reminderList'; $('panelContent').append(list); resultArea();
  try {
    const data = await api('/api/reminders');
    if (!list.isConnected) return;
    if (!data.reminders.length) list.append(el('p', 'panel-description', 'No reminders yet.'));
    for (const reminder of data.reminders) {
      const row = el('div', 'reminder-item'); row.append(el('strong', '', reminder.title), el('p', 'panel-description', `${new Date(reminder.dueAt).toLocaleString()} · ${reminder.completed ? 'Completed' : reminder.due ? 'Due' : 'Scheduled'}`));
      const download = link('Export calendar', `/api/reminders/${reminder.id}.ics`); download.download = 'jarvis-reminder.ics'; row.append(download);
      if (!reminder.completed) row.append(button('Complete', async () => { await api('/api/reminders/update', { id: reminder.id, action: 'complete' }); await openReminders(); }));
      row.append(button('Delete', async () => { if (!confirm(`Delete reminder: ${reminder.title}?`)) return; await api('/api/reminders/update', { id: reminder.id, action: 'delete' }); await openReminders(); })); list.append(row);
    }
  } catch (e) { result(e.message, true); }
}
export async function openMail() {
  panel('Mail, with your permission'); note('Gmail uses Google OAuth with read and send scopes. Mail is not fed into AI automatically. Account authorization is separate from your Gemini API key.'); resultArea();
  try {
    const fresh = await api('/api/status'); setWorkspaceStatus(fresh);
    if (!$('panel').open || $('panelTitle').textContent !== 'Mail, with your permission') return;
    if (!fresh.mail.configured) note('Setup required: enable Gmail API in Google Cloud, create a Web application OAuth client, and set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in .env. See INTEGRATIONS.md.');
    if (!fresh.mail.connected) {
      $('panelContent').append(button('Connect Gmail', async () => { const data = await api('/api/mail/connect', {}); const url = new URL(data.url); if (url.origin !== 'https://accounts.google.com') throw Error('Invalid sign-in destination.'); location.assign(url.href); }, 'primary-button'));
    } else {
      note('Account authorization is stored locally. Load messages to verify live access.');
      $('panelContent').append(button('Disconnect Gmail', async () => { if (!confirm('Remove local Gmail access tokens?')) return; await api('/api/mail/disconnect', {}); await openMail(); }));
      const search = el('form'); const query = field(search, 'mailQuery', 'Search Gmail (blank = inbox)', { required: false }); const load = el('button', 'secondary-button', 'Load messages'); search.append(load); const list = el('div');
      search.onsubmit = async e => { e.preventDefault(); load.disabled = true; try { const data = await api('/api/mail/list', { query: query.value }); list.replaceChildren(); if (!data.messages.length) list.append(el('p', 'panel-description', 'No matching messages.')); for (const message of data.messages) { const row = el('article', 'mail-item'); row.append(el('strong', '', message.subject || '(No subject)'), el('small', '', `${message.from} · ${message.date}`), el('p', '', message.snippet), link('Open in Gmail', 'https://mail.google.com/mail/u/0/#inbox/' + encodeURIComponent(message.id))); list.append(row); } } catch (e) { result(e.message, true); } finally { load.disabled = false; } };
      $('panelContent').append(search, list);
      const compose = el('form'); const to = field(compose, 'mailTo', 'Recipient', { type: 'email', max: 254 }); const subject = field(compose, 'mailSubject', 'Subject'); const body = field(compose, 'mailBody', 'Message', { multiline: true, max: 20000 }); const review = el('button', 'primary-button', 'Review before sending'); compose.append(review);
      compose.onsubmit = async e => { e.preventDefault(); review.disabled = true; try { await approve('mail.send', { to: to.value, subject: subject.value, body: body.value }, openMail); } catch (e) { result(e.message, true); } finally { review.disabled = false; } }; $('panelContent').append(compose);
    }
    $('panelContent').append(link('Open Gmail', 'https://mail.google.com/'), button('Compose in my mail app', openPhone));
  } catch (e) { result(e.message, true); }
}
export function openDesktop() {
  panel('Desktop app launcher'); note('This launches apps only on the computer running the Node server. Enable ENABLE_DESKTOP_TOOLS=true in that computer’s .env. No arbitrary commands, remote screen control or phone app control.');
  note(status?.desktop ? 'Windows launcher enabled. Review and approve each launch.' : 'Unavailable here: Windows and explicit opt-in are both required.');
  for (const [id, name] of [['notepad', 'Notepad'], ['calculator', 'Calculator'], ['explorer', 'File Explorer']]) { const launch = button(`Open ${name}`, () => approve('desktop.launch', { app: id }, openDesktop)); launch.disabled = !status?.desktop; $('panelContent').append(launch); } resultArea();
}
export function openPhone() {
  panel('Phone & app handoffs'); note('These links ask your device to open a supported app. You finish and approve actions there. A browser cannot directly control Android/iOS apps, alarms or settings.');
  const form = el('form'); const to = field(form, 'composeTo', 'Recipient', { type: 'email', max: 254 }); const subject = field(form, 'composeSubject', 'Subject'); const body = field(form, 'composeBody', 'Message', { multiline: true, max: 1500 }); const compose = el('button', 'primary-button', 'Open mail app to review'); form.append(compose);
  form.onsubmit = e => { e.preventDefault(); if (/[\r\n]/.test(to.value + subject.value)) return result('Recipient and subject must be single lines.', true); location.href = `mailto:${encodeURIComponent(to.value)}?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(body.value)}`; };
  $('panelContent').append(form, button('Create a calendar reminder', openReminders), link('Open Gmail in browser', 'https://mail.google.com/')); resultArea();
}
export function renderArtifacts(msg, container) {
  if (msg.role !== 'assistant') return;
  if(typeof msg.taskId==='string'&&/^[a-f0-9-]{36}$/.test(msg.taskId))container.append(button('Open task activity & approvals',()=>openTasks(msg.taskId)));
  if (typeof msg.imageUrl === 'string' && /^\/api\/images\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(msg.imageUrl)) {
    const image = el('img', 'generated-image'); image.src = msg.imageUrl; image.alt = 'AI-generated image for your prompt'; image.loading = 'lazy';
    image.onerror = () => { image.replaceWith(el('p', 'panel-description', 'This image is unavailable on this JARVIS installation.')); };
    const download = link('Download image', msg.imageUrl); download.download = 'jarvis-image.' + msg.imageUrl.split('.').at(-1); container.append(image, download);
  }
  if (msg.mode === 'search' || msg.mode === 'research') container.append(el('p', 'source-label', msg.grounded ? 'Google Search sources' : 'No grounding sources returned. Treat current claims as unverified.'));
  if (Array.isArray(msg.sources)) for (const source of msg.sources.slice(0, 30)) {
    try { const url = new URL(source.url); if (url.protocol !== 'https:' || url.username || url.password) continue; container.append(link(String(source.title || url.hostname), url.href, 'source-link')); } catch { /* Reject unsafe links. */ }
  }
  if (typeof msg.searchAttribution === 'string' && msg.searchAttribution.length <= 100000) {
    const frame = el('iframe', 'search-attribution'); frame.title = 'Google Search attribution'; frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox'); frame.srcdoc = msg.searchAttribution; frame.referrerPolicy = 'no-referrer'; container.append(frame);
  }
}
async function checkReminders() {
  try {
    const { reminders } = await api('/api/reminders');
    if (lastReminderError) { lastReminderError = ''; $('reminderBanner').hidden = true; }
    const due = reminders.filter(r => r.due && !r.completed);
    $('reminderBanner').hidden = !due.length;
    if (due.length) { $('reminderBanner').textContent = `${due.length} reminder${due.length === 1 ? '' : 's'} due · ${due[0].title} — Open reminders`; for (const reminder of due) if (!notified.has(reminder.id)) { notified.add(reminder.id); if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('JARVIS reminder', { body: reminder.title }); } catch { /* Mobile browsers may require a service worker; in-app alert remains visible. */ } } } }
  } catch { lastReminderError = 'Reminders could not refresh. Check the server connection.'; $('reminderBanner').hidden = false; $('reminderBanner').textContent = lastReminderError; }
}
export function initWorkspace() {
  initAutomation();initCore();initHUD();
  $('toolsNav').onclick = openWorkspace;
  $('remindersNav').onclick = openReminders; $('mailNav').onclick = openMail;
  $('reminderBanner').onclick = openReminders;
  clearInterval(reminderTimer); reminderTimer = setInterval(checkReminders, 30000); checkReminders();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
  if (new URLSearchParams(location.search).get('gmail') === 'connected') { history.replaceState(null, '', '/'); openMail(); }
}
