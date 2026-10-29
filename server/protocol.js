import { ServiceError } from './provider.js';
const bad = text => { throw new ServiceError(text, 400, 'INVALID_COMMAND'); };
export function validateCommand(command) {
  if (!command || typeof command !== 'object') bad('Choose a supported device command.');
  const { kind, args = {} } = command;
  if (['system.info','git.status','git.diff','docker.list','docker.stats'].includes(kind)) return {kind,args:{}};
  if(kind==='git.log'){const days=Number(args.days||1);if(!Number.isInteger(days)||days<1||days>30)bad('Git log accepts 1–30 days.');return{kind,args:{days}};}
  if(kind==='docker.logs'){if(typeof args.container!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(args.container))bad('Enter a valid container name or ID.');return{kind,args:{container:args.container}};}
  if (kind === 'desktop.launch') { if (!['notepad', 'calculator', 'explorer'].includes(args.app)) bad('Choose an allowlisted Windows app.'); return { kind, args: { app: args.app } }; }
  if (['files.list','files.read'].includes(kind)) { const path = args.path || ''; if (typeof path !== 'string' || path.length > 300 || /^[\\/]|^[a-z]:/i.test(path) || path.replaceAll('\\','/').split('/').some(s=>s==='..'||s.startsWith('.'))) bad('Use a relative path inside the approved files folder.'); return { kind, args: { path } }; }
  if (kind === 'browser.navigate') { let url; try { url = new URL(args.url); } catch { bad('Enter a valid HTTPS URL.'); } if (url.protocol !== 'https:' || url.username || url.password) bad('Browser navigation requires a public HTTPS URL without credentials.'); return { kind, args: { url: url.href } }; }
  if (['browser.read', 'record.start', 'record.stop'].includes(kind)) return { kind, args: {} };
  if (kind === 'browser.fill' || kind === 'browser.link') {
    if (typeof args.selector !== 'string' || !args.selector.trim() || args.selector.length > 300) bad('Enter a selector of up to 300 characters.');
    if (kind === 'browser.fill' && (typeof args.value !== 'string' || args.value.length > 2000)) bad('Field text must be at most 2,000 characters.');
    return { kind, args: { selector: args.selector, ...(kind === 'browser.fill' ? { value: args.value } : {}) } };
  }
  if (kind === 'skill.replay') {
    if (!Array.isArray(args.steps) || args.steps.length < 1 || args.steps.length > 30 || args.steps.some(s => !['browser.navigate','browser.fill','browser.link','browser.read'].includes(s.kind))) bad('A skill needs 1–30 supported browser steps.');
    return { kind, args: { steps: args.steps.map(validateCommand) } };
  }
  bad('Unsupported command. Arbitrary shell, screen and file control are not available.');
}
