import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ServiceError } from './provider.js';
export class Store {
  constructor(directory) { this.directory = directory; this.queue = Promise.resolve(); }
  async read(name, fallback) {
    try { return JSON.parse(await readFile(path.join(this.directory, name + '.json'), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return fallback; throw new ServiceError('Local data could not be read. Restore your .data backup; files were not overwritten.', 500, 'STORAGE_ERROR'); }
  }
  async write(name, value) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, name + '.json'); const temp = file + '.' + randomUUID() + '.tmp';
    try { await writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await rename(temp, file); }
    finally { await unlink(temp).catch(() => {}); }
  }
  update(name, fallback, fn) {
    const work = this.queue.then(async () => { const value = await fn(await this.read(name, fallback)); await this.write(name, value); return value; });
    this.queue = work.catch(() => {}); return work;
  }
  async remove(name) { await unlink(path.join(this.directory, name + '.json')).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}
