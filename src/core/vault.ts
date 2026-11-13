import type { StorageAdapter } from '../storage/adapter';
import { Emitter } from './events';
import { basename, dirname, isInside, isMarkdown, join, noteName, validateName } from './paths';

export type VaultEvent =
  | { type: 'create'; path: string; kind: 'file' | 'folder' }
  | { type: 'modify'; path: string; source?: unknown }
  | { type: 'delete'; path: string; kind: 'file' | 'folder' }
  | { type: 'rename'; from: string; to: string; kind: 'file' | 'folder'; moved: Map<string, string> };

const CONFIG_DIR = '.frankenstein';

/**
 * Vault – atmintyje laikomas visų .md užrašų turinys + aplankų sąrašas,
 * sinchronizuojamas su pasirinkta saugykla.
 */
export class Vault extends Emitter<{ change: VaultEvent; reload: void }> {
  private files = new Map<string, string>();
  private folderSet = new Set<string>();

  constructor(readonly adapter: StorageAdapter) {
    super();
  }

  get name() {
    return this.adapter.name;
  }

  async load(): Promise<void> {
    this.files.clear();
    this.folderSet.clear();
    const entries = await this.adapter.list();
    await Promise.all(
      entries.map(async (e) => {
        if (e.kind === 'folder') this.folderSet.add(e.path);
        else if (isMarkdown(e.path)) this.files.set(e.path, await this.adapter.read(e.path));
      }),
    );
    this.emit('reload', undefined);
  }

  notes(): string[] {
    return [...this.files.keys()].sort((a, b) => a.localeCompare(b, 'lt'));
  }

  folders(): string[] {
    return [...this.folderSet].sort((a, b) => a.localeCompare(b, 'lt'));
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  hasFolder(path: string): boolean {
    return path === '' || this.folderSet.has(path);
  }

  read(path: string): string {
    return this.files.get(path) ?? '';
  }

  isEmpty(): boolean {
    return this.files.size === 0;
  }

  private ensureParents(path: string) {
    let d = dirname(path);
    while (d) {
      if (!this.folderSet.has(d)) {
        this.folderSet.add(d);
        this.emit('change', { type: 'create', path: d, kind: 'folder' });
      }
      d = dirname(d);
    }
  }

  /** Įrašo užrašą (sukuria, jei nėra). `source` leidžia redaktoriui atpažinti savo pakeitimus. */
  async write(path: string, content: string, source?: unknown): Promise<void> {
    const existed = this.files.has(path);
    if (existed && this.files.get(path) === content) return;
    this.files.set(path, content);
    this.ensureParents(path);
    this.emit('change', existed ? { type: 'modify', path, source } : { type: 'create', path, kind: 'file' });
    await this.adapter.write(path, content);
  }

  /** Grąžina laisvą kelią: „Pavadinimas.md“, „Pavadinimas 1.md“, ... */
  uniquePath(dir: string, base: string, ext = '.md'): string {
    let p = join(dir, base + ext);
    for (let i = 1; this.files.has(p) || this.folderSet.has(p); i++) p = join(dir, `${base} ${i}${ext}`);
    return p;
  }

  async createNote(dir = '', base = 'Be pavadinimo', content = ''): Promise<string> {
    const path = this.uniquePath(dir, base);
    await this.write(path, content);
    return path;
  }

  async createFolder(dir = '', base = 'Naujas aplankas'): Promise<string> {
    const path = this.uniquePath(dir, base, '');
    await this.adapter.mkdir(path);
    this.ensureParents(path);
    this.folderSet.add(path);
    this.emit('change', { type: 'create', path, kind: 'folder' });
    return path;
  }

  async delete(path: string): Promise<void> {
    const isFolder = this.folderSet.has(path);
    await this.adapter.remove(path);
    if (isFolder) {
      for (const f of [...this.files.keys()]) if (isInside(f, path)) this.files.delete(f);
      for (const f of [...this.folderSet]) if (isInside(f, path)) this.folderSet.delete(f);
    } else this.files.delete(path);
    this.emit('change', { type: 'delete', path, kind: isFolder ? 'folder' : 'file' });
  }

  /** Pervadina failą ar aplanką. `newName` – tik pavadinimas (užrašams be .md). */
  async rename(path: string, newName: string): Promise<string> {
    const err = validateName(newName);
    if (err) throw new Error(err);
    const isFolder = this.folderSet.has(path);
    const to = join(dirname(path), isFolder ? newName.trim() : newName.trim() + '.md');
    return this.moveTo(path, to);
  }

  /** Perkelia į kitą aplanką (drag & drop). */
  async move(path: string, targetDir: string): Promise<string> {
    if (dirname(path) === targetDir) return path;
    if (this.folderSet.has(path) && isInside(targetDir, path)) throw new Error('Aplanko negalima perkelti į jį patį.');
    return this.moveTo(path, join(targetDir, basename(path)));
  }

  private async moveTo(from: string, to: string): Promise<string> {
    if (from === to) return from;
    const isFolder = this.folderSet.has(from);
    if (this.files.has(to) || this.folderSet.has(to)) throw new Error(`„${basename(to)}“ jau egzistuoja.`);
    await this.adapter.rename(from, to);
    const moved = new Map<string, string>();
    if (isFolder) {
      for (const f of [...this.folderSet])
        if (isInside(f, from)) {
          this.folderSet.delete(f);
          this.folderSet.add(to + f.slice(from.length));
        }
      for (const [f, c] of [...this.files])
        if (isInside(f, from)) {
          this.files.delete(f);
          const nf = to + f.slice(from.length);
          this.files.set(nf, c);
          moved.set(f, nf);
        }
    } else {
      this.files.set(to, this.files.get(from) ?? '');
      this.files.delete(from);
      moved.set(from, to);
    }
    this.ensureParents(to);
    this.emit('change', { type: 'rename', from, to, kind: isFolder ? 'folder' : 'file', moved });
    return to;
  }

  /** Užrašų paieška pagal pavadinimą (be .md, be didžiųjų raidžių skirtumo). */
  findByName(name: string): string | undefined {
    const n = name.trim().toLowerCase().replace(/\.md$/, '');
    if (!n) return undefined;
    if (this.files.has(n + '.md')) return n + '.md';
    let best: string | undefined;
    for (const p of this.files.keys()) {
      const lp = p.toLowerCase();
      if (lp === n + '.md') return p;
      if (noteName(p).toLowerCase() === n || lp.endsWith('/' + n + '.md')) {
        if (!best || p.length < best.length) best = p;
      }
    }
    return best;
  }

  // ---- JSON konfigūracija vault'e (.frankenstein/*.json) ----

  async readJSON<T>(name: string, fallback: T): Promise<T> {
    try {
      return { ...fallback, ...JSON.parse(await this.adapter.read(join(CONFIG_DIR, name))) };
    } catch {
      return fallback;
    }
  }

  async writeJSON(name: string, data: unknown): Promise<void> {
    try {
      await this.adapter.write(join(CONFIG_DIR, name), JSON.stringify(data, null, 2));
    } catch (e) {
      console.warn('Nepavyko įrašyti', name, e);
    }
  }
}
