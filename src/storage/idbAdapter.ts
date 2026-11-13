import type { StorageAdapter, StorageEntry } from './adapter';
import { idbBatch, idbGet, idbGetAll, STORE_FILES } from './idb';
import { dirname, isHidden, isInside, normalize } from '../core/paths';

interface Row {
  path: string;
  kind: 'file' | 'folder';
  content?: string | Uint8Array;
  mtime: number;
}

/** Vault naršyklės IndexedDB saugykloje – kai File System Access API nepalaikomas. */
export class IdbAdapter implements StorageAdapter {
  readonly kind = 'idb' as const;
  readonly name = 'Naršyklės vault';

  async list(): Promise<StorageEntry[]> {
    const rows = await idbGetAll<Row>(STORE_FILES);
    return rows.filter((r) => !isHidden(r.path)).map((r) => ({ path: r.path, kind: r.kind }));
  }

  private async row(path: string): Promise<Row | undefined> {
    return idbGet<Row>(STORE_FILES, normalize(path));
  }

  async read(path: string): Promise<string> {
    const r = await this.row(path);
    if (!r || r.kind !== 'file') throw new Error(`Failas nerastas: ${path}`);
    return typeof r.content === 'string' ? r.content : new TextDecoder().decode(r.content ?? new Uint8Array());
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const r = await this.row(path);
    if (!r || r.kind !== 'file') throw new Error(`Failas nerastas: ${path}`);
    return typeof r.content === 'string' ? new TextEncoder().encode(r.content) : (r.content ?? new Uint8Array());
  }

  async exists(path: string): Promise<boolean> {
    return !!(await this.row(path));
  }

  private parentRows(path: string): Row[] {
    const out: Row[] = [];
    let d = dirname(path);
    while (d) {
      out.push({ path: d, kind: 'folder', mtime: Date.now() });
      d = dirname(d);
    }
    return out;
  }

  async write(path: string, data: string | Uint8Array): Promise<void> {
    path = normalize(path);
    const parents = this.parentRows(path);
    await idbBatch(STORE_FILES, (s) => {
      parents.forEach((p) => s.put(p));
      s.put({ path, kind: 'file', content: data, mtime: Date.now() } satisfies Row);
    });
  }

  async mkdir(path: string): Promise<void> {
    path = normalize(path);
    const rows = [{ path, kind: 'folder' as const, mtime: Date.now() }, ...this.parentRows(path)];
    await idbBatch(STORE_FILES, (s) => rows.forEach((r) => s.put(r)));
  }

  async remove(path: string): Promise<void> {
    path = normalize(path);
    const rows = await idbGetAll<Row>(STORE_FILES);
    await idbBatch(STORE_FILES, (s) => {
      rows.filter((r) => isInside(r.path, path)).forEach((r) => s.delete(r.path));
    });
  }

  async rename(from: string, to: string): Promise<void> {
    from = normalize(from);
    to = normalize(to);
    const rows = await idbGetAll<Row>(STORE_FILES);
    const moving = rows.filter((r) => isInside(r.path, from));
    const parents = this.parentRows(to);
    await idbBatch(STORE_FILES, (s) => {
      parents.forEach((p) => s.put(p));
      for (const r of moving) {
        s.delete(r.path);
        s.put({ ...r, path: to + r.path.slice(from.length), mtime: Date.now() });
      }
    });
  }
}
