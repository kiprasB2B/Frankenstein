import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Vault } from './vault';
import { isMarkdown, normalize } from './paths';

const CONFIG_FILES = ['settings.json', 'workspace.json'];

/** Supakuoja visą vault (užrašus, kitus failus ir nustatymus) į .zip. */
export async function exportVault(vault: Vault): Promise<Blob> {
  const files: Zippable = {};
  for (const e of await vault.adapter.list()) {
    if (e.kind === 'folder') files[e.path + '/'] = new Uint8Array();
    else files[e.path] = isMarkdown(e.path) ? strToU8(vault.read(e.path)) : await vault.adapter.readBinary(e.path);
  }
  for (const name of CONFIG_FILES) {
    try {
      files['.frankenstein/' + name] = strToU8(await vault.adapter.read('.frankenstein/' + name));
    } catch {
      /* nėra */
    }
  }
  const data = zipSync(files, { level: 6 });
  return new Blob([data as BlobPart], { type: 'application/zip' });
}

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

/** Išskleidžia .zip ir grąžina saugius kelius (be „..“, be sisteminių aplankų). */
export function readZip(buf: ArrayBuffer): ZipEntry[] {
  const raw = unzipSync(new Uint8Array(buf));
  let entries = Object.entries(raw)
    .filter(([p]) => !p.endsWith('/') && !p.startsWith('__MACOSX/') && !p.split('/').includes('..') && !p.endsWith('.DS_Store'))
    .map(([p, data]) => ({ path: normalize(p.replace(/\\/g, '/')), data }))
    .filter((e) => e.path);
  // Jei visi failai viename viršutiniame aplanke (pvz. „vault/…“) – jį nuimame.
  const tops = new Set(entries.map((e) => e.path.split('/')[0]));
  if (tops.size === 1 && entries.every((e) => e.path.includes('/'))) {
    const top = [...tops][0] + '/';
    entries = entries.map((e) => ({ ...e, path: e.path.slice(top.length) }));
  }
  return entries;
}

export async function importEntries(vault: Vault, entries: ZipEntry[]): Promise<number> {
  let n = 0;
  for (const e of entries) {
    if (e.path.startsWith('.frankenstein/') && !CONFIG_FILES.some((c) => e.path === '.frankenstein/' + c)) continue;
    if (isMarkdown(e.path) || e.path.endsWith('.json')) await vault.adapter.write(e.path, strFromU8(e.data));
    else await vault.adapter.write(e.path, e.data);
    n++;
  }
  await vault.load();
  return n;
}

