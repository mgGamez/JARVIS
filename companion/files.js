import path from 'node:path';
import {realpath,stat,readFile,readdir} from 'node:fs/promises';
export async function localFiles(kind,args,root) {
  if(!root)throw Error('Set COMPANION_FILES_ROOT to a dedicated folder you approve sharing.');
  const relative=args.path||'';if(typeof relative!=='string'||relative.length>300||path.isAbsolute(relative)||/^[a-z]:|^\\\\/i.test(relative)||relative.replaceAll('\\','/').split('/').some(s=>s==='..'||s.startsWith('.')))throw Error('Use a relative, non-hidden path inside the approved folder.');
  const base=await realpath(root),target=await realpath(path.resolve(base,relative));if(target!==base&&!target.startsWith(base+path.sep))throw Error('Path or symlink escapes the approved folder.');
  if(kind==='files.list') {const entries=await readdir(target,{withFileTypes:true});return{entries:entries.filter(e=>!e.name.startsWith('.')&&!e.isSymbolicLink()).slice(0,100).map(e=>({name:e.name,type:e.isDirectory()?'directory':'file'}))};}
  if(!/\.(txt|md|csv|json|log|js|ts|py|html|css|sql|yaml|yml)$/i.test(target)||/credential|secret|token|password/i.test(path.basename(target)))throw Error('Only non-secret text/code files can be read.');
  const info=await stat(target);if(!info.isFile()||info.size>48000)throw Error('Choose a text file smaller than 48 KB.');const text=await readFile(target,'utf8');if(text.includes('\0'))throw Error('Binary files are not supported.');return{path:relative,text:text.slice(0,12000),truncated:text.length>12000};
}
