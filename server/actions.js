import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { issueInput } from './github.js';
import { validateCommand } from './protocol.js';
import { ServiceError } from './provider.js';
const fail = message => { throw new ServiceError(message, 400, 'INVALID_ACTION'); };
export const desktopApps = Object.freeze({ notepad: 'notepad.exe', calculator: 'calc.exe', explorer: 'explorer.exe' });
export function validateAction(tool, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('Invalid action arguments.');
  if (tool === 'mail.send') {
    const { to, subject, body } = args;
    if (typeof to !== 'string' || to.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(to) || /[\r\n]/.test(to)) fail('Enter one valid recipient email address.');
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject)) fail('Subject must contain 1–200 characters on one line.');
    if (typeof body !== 'string' || !body.trim() || body.length > 20000) fail('Message must contain 1–20,000 characters.');
    return { to, subject, body };
  }
  if (tool === 'github.issue') return issueInput(args);
  if (tool === 'device.task') { if (typeof args.deviceId !== 'string' || !/^[a-f0-9-]{36}$/.test(args.deviceId)) fail('Choose a paired device.'); return { deviceId: args.deviceId, command: validateCommand(args.command) }; }
  if (tool === 'desktop.launch') { if (!Object.hasOwn(desktopApps, args.app)) fail('Choose Notepad, Calculator or File Explorer.'); return { app: args.app }; }
  if (tool === 'reminders.create') {
    if (typeof args.title !== 'string' || !args.title.trim() || args.title.length > 200) fail('Reminder needs a title of 1–200 characters.');
    const due = new Date(args.dueAt);
    if (typeof args.dueAt !== 'string' || !Number.isFinite(due.getTime()) || due.getTime() <= Date.now() || due.getTime() > Date.now() + 366 * 86400000) fail('Choose a future date within one year.');
    return { title: args.title.trim(), dueAt: due.toISOString() };
  }
  fail('This action is not registered.');
}
export class ApprovalQueue {
  constructor() { this.pending = new Map(); }
  prepare(tool, args) {
    for (const [id, item] of this.pending) if (item.expiresAt < Date.now()) this.pending.delete(id);
    if (this.pending.size >= 100) throw new ServiceError('Too many pending approvals. Wait five minutes.', 429, 'BUSY');
    const action = { id: randomUUID(), tool, args: validateAction(tool, args), expiresAt: Date.now() + 300000 };
    this.pending.set(action.id, action); return action;
  }
  consume(id, approved) {
    if (approved !== true) throw new ServiceError('Explicit approval is required.', 403, 'APPROVAL_REQUIRED');
    const action = this.pending.get(id);
    if (!action || action.expiresAt < Date.now()) { this.pending.delete(id); throw new ServiceError('This approval expired or was already used. Prepare a new action.', 409, 'APPROVAL_EXPIRED'); }
    this.pending.delete(id); return action;
  }
}
export async function launchApp(app, { enabled = false, platform = process.platform, spawnImpl = spawn } = {}) {
  validateAction('desktop.launch', { app });
  if (!enabled || platform !== 'win32') throw new ServiceError('App launching requires Windows and ENABLE_DESKTOP_TOOLS=true on the computer running JARVIS.', 409, 'DESKTOP_UNAVAILABLE');
  await new Promise((resolve, reject) => {
    const child = spawnImpl(desktopApps[app], [], { shell: false, detached: true, stdio: 'ignore', env: Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|TOKEN|SECRET|PASSWORD/i.test(key))) });
    child.once('error', () => reject(new ServiceError('Windows could not launch this app.', 502, 'LAUNCH_FAILED')));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return { message: `Windows accepted the launch request for ${app}.` };
}
export function calendarFile(reminder) {
  const escape = text => text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const date = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JARVIS//Reminders//EN', 'BEGIN:VEVENT', `UID:${reminder.id}@jarvis.local`, `DTSTAMP:${date(new Date())}`, `DTSTART:${date(reminder.dueAt)}`, `DTEND:${date(new Date(new Date(reminder.dueAt).getTime() + 60000))}`, `SUMMARY:${escape(reminder.title)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(reminder.title)}`, 'TRIGGER:PT0S', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  // Fold UTF-8 lines at <=75 octets per RFC 5545.
  return lines.map(line => { const chunks = []; let piece = ''; for (const char of line) { if (Buffer.byteLength(piece + char) > 74) { chunks.push(piece); piece = ' '; } piece += char; } chunks.push(piece); return chunks.join('\r\n'); }).join('\r\n') + '\r\n';
}
