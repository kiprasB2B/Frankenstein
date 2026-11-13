import type { StorageAdapter, StorageEntry } from './adapter';
import { basename, dirname, join, normalize } from '../core/paths';
import { idbGet, idbPut, STORE_META } from './idb';

type DirHandle = FileSystemDirectoryHandle;
type AnyHandle = FileSystemFileHandle | FileSystemDirectoryHandle;

async function* entriesOf(dir: DirHandle): AsyncGenerator<[string, AnyHandle]> {
  // `entries()` dar ne visur aprašytas TS DOM tipuose.
  const it = (dir as unknown as { entries(): AsyncIterable<[string, AnyHandle]> }).entries();
  for await (const e of it) yield e;
}

export function fsAccessSupported(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

/** Vault tikrame kompiuterio aplanke per File System Access API. */
export class FsAdapter implements StorageAdapter {
  readonly kind = 'fs' as const;
  constructor(readonly root: DirHandle) {}

  get name() {
    return this.root.name;
  }

  static async pick(): Promise<FsAdapter> {
    const handle = await window.showDirectoryPicker!({ mode: 'readwrite', id: 'frankenstein-vault' });
    await idbPut(STORE_META, handle, 'fsHandle');
    return new FsAdapter(handle);
  }

  /** Paskutinis atidarytas aplankas (rankena saugoma IndexedDB). */
  static async stored(): Promise<DirHandle | undefined> {
    try {
      return await idbGet<DirHandle>(STORE_META, 'fsHandle');
    } catch {
      return undefined;
    }
  }

  /** Paprašo leidimo – turi būti iškviesta po vartotojo veiksmo. */
  static async ensurePermission(h: DirHandle): Promise<boolean> {
    const opts = { mode: 'readwrite' as const };
    if ((await h.queryPermission?.(opts)) === 'granted') return true;
    return (await h.requestPermission?.(opts)) === 'granted';
  }

  private async dir(path: string, create = false): Promise<DirHandle> {
    let d = this.root;
    for (const seg of normalize(path).split('/').filter(Boolean)) {
      d = await d.getDirectoryHandle(seg, { create });
    }
    return d;
  }

  private async file(path: string, create = false): Promise<FileSystemFileHandle> {
    const d = await this.dir(dirname(path), create);
    return d.getFileHandle(basename(path), { create });
  }

  async list(): Promise<StorageEntry[]> {
    const out: StorageEntry[] = [];
    const walk = async (d: DirHandle, prefix: string) => {
      for await (const [name, h] of entriesOf(d)) {
        if (name.startsWith('.')) continue;
        const p = join(prefix, name);
        if (h.kind === 'directory') {
          out.push({ path: p, kind: 'folder' });
          await walk(h as DirHandle, p);
        } else {
          try {
            const f = await (h as FileSystemFileHandle).getFile();
            out.push({ path: p, kind: 'file', mtime: f.lastModified, size: f.size });
          } catch {
            out.push({ path: p, kind: 'file' });
          }
        }
      }
    };
    await walk(this.root, '');
    return out;
  }

  async read(path: string): Promise<string> {
    return (await (await this.file(path)).getFile()).text();
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await (await this.file(path)).getFile()).arrayBuffer());
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.file(path);
      return true;
    } catch {
      try {
        await this.dir(path);
        return true;
      } catch {
        return false;
      }
    }
  }

  async write(path: string, data: string | Uint8Array): Promise<void> {
    const fh = await this.file(path, true);
    const w = await fh.createWritable();
    await w.write(data as FileSystemWriteChunkType);
    await w.close();
  }

  async mkdir(path: string): Promise<void> {
    await this.dir(path, true);
  }

  async remove(path: string): Promise<void> {
    const parent = await this.dir(dirname(path));
    await parent.removeEntry(basename(path), { recursive: true });
  }

  async rename(from: string, to: string): Promise<void> {
    from = normalize(from);
    to = normalize(to);
    let isDir = false;
    try {
      await this.dir(from);
      isDir = true;
    } catch {
      /* failas */
    }
    if (!isDir) {
      await this.write(to, await this.readBinary(from));
    } else {
      // Aplankus perkeliame kopijuodami (move() palaikomas ne visose naršyklėse).
      const copy = async (src: string, dst: string) => {
        await this.mkdir(dst);
        for await (const [name, h] of entriesOf(await this.dir(src))) {
          if (h.kind === 'directory') await copy(join(src, name), join(dst, name));
          else await this.write(join(dst, name), await this.readBinary(join(src, name)));
        }
      };
      await copy(from, to);
    }
    await this.remove(from);
  }
}
