import type { Vault, VaultEvent } from './vault';
import { Emitter, debounce } from './events';
import { basename, dirname, join, noteName } from './paths';

// Užrašų indeksas: wiki nuorodos, atgalinės nuorodos ir #žymos.

export interface LinkRef {
  target: string; // kaip parašyta [[...]] (be #antraštės ir |alias)
  line: number; // 0-based
}

export interface ParsedNote {
  links: LinkRef[];
  tags: string[];
}

export const WIKILINK_RE = /\[\[([^[\]|#\n]+)(#[^[\]|\n]*)?(?:\|([^[\]\n]*))?\]\]/g;
// Žyma: # + raidės/skaičiai/_-/, bent vienas ne skaitmuo. Prieš ją – eilutės pradžia arba tarpas.
export const TAG_RE = /(^|[\s(,;])#((?:[\p{L}\p{N}_\-/])*[\p{L}_](?:[\p{L}\p{N}_\-/])*)/gu;

/** Paslepia kodo blokus ir eilutinį kodą (išlaikant eilučių struktūrą). */
export function maskCode(src: string): string {
  return src
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(^\1[^\n]*$|$(?![\s\S]))/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

export function parseNote(src: string): ParsedNote {
  const text = maskCode(src);
  const links: LinkRef[] = [];
  const tags = new Set<string>();
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(WIKILINK_RE)) links.push({ target: m[1].trim(), line: i });
    for (const m of line.matchAll(TAG_RE)) tags.add(m[2].toLowerCase());
  });
  return { links, tags: [...tags] };
}

export interface Backlink {
  source: string;
  lines: { line: number; text: string }[];
}

export class NoteIndex extends Emitter<{ updated: void }> {
  private notes = new Map<string, ParsedNote>();

  constructor(private vault: Vault) {
    super();
    vault.on('reload', () => this.rebuild());
    vault.on('change', (ev) => this.onChange(ev));
    this.rebuild();
  }

  rebuild() {
    this.notes.clear();
    for (const p of this.vault.notes()) this.notes.set(p, parseNote(this.vault.read(p)));
    this.changed();
  }

  private changed() {
    this.emit('updated', undefined);
    this.saveCache();
  }

  private saveCache = debounce(() => {
    const data: Record<string, ParsedNote> = {};
    for (const [p, n] of this.notes) data[p] = n;
    this.vault.writeJSON('index.json', { version: 1, updated: new Date().toISOString(), notes: data });
  }, 2000);

  private onChange(ev: VaultEvent) {
    if (ev.type === 'create' && ev.kind === 'file') this.notes.set(ev.path, parseNote(this.vault.read(ev.path)));
    else if (ev.type === 'modify') this.notes.set(ev.path, parseNote(this.vault.read(ev.path)));
    else if (ev.type === 'delete') {
      for (const p of [...this.notes.keys()]) if (p === ev.path || p.startsWith(ev.path + '/')) this.notes.delete(p);
    } else if (ev.type === 'rename') {
      for (const [from, to] of ev.moved) {
        const n = this.notes.get(from);
        this.notes.delete(from);
        if (n) this.notes.set(to, n);
      }
      if (ev.kind === 'file') this.updateLinksAfterRename(ev.from, ev.to);
    } else return;
    this.changed();
  }

  /** Pervadinus užrašą, atnaujina [[nuorodas]] kituose užrašuose. */
  private async updateLinksAfterRename(from: string, to: string) {
    const oldName = noteName(from);
    const newName = noteName(to);
    if (oldName === newName) return;
    const oldKeys = new Set([oldName.toLowerCase(), from.replace(/\.md$/i, '').toLowerCase()]);
    // Jei liko kitas užrašas tokiu pačiu pavadinimu – nuorodų nekeičiame.
    if (this.vault.findByName(oldName)) return;
    for (const [p, n] of this.notes) {
      if (!n.links.some((l) => oldKeys.has(l.target.toLowerCase()))) continue;
      const src = this.vault.read(p);
      const next = src.replace(WIKILINK_RE, (m, target: string, head = '', alias?: string) =>
        oldKeys.has(target.trim().toLowerCase()) ? `[[${newName}${head}${alias !== undefined ? '|' + alias : ''}]]` : m,
      );
      if (next !== src) await this.vault.write(p, next, 'rename');
    }
  }

  get(path: string): ParsedNote | undefined {
    return this.notes.get(path);
  }

  resolve(target: string): string | undefined {
    return this.vault.findByName(target);
  }

  /** Kelias, kuriame būtų sukurtas neegzistuojantis užrašas. */
  pathForNew(target: string): string {
    const t = target.trim().replace(/\.md$/i, '');
    return join(dirname(t), basename(t) + '.md');
  }

  outgoing(path: string): { target: string; path?: string }[] {
    const seen = new Set<string>();
    const out: { target: string; path?: string }[] = [];
    for (const l of this.notes.get(path)?.links ?? []) {
      const key = l.target.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ target: l.target, path: this.resolve(l.target) });
    }
    return out;
  }

  backlinks(path: string): Backlink[] {
    const out: Backlink[] = [];
    for (const [src, n] of this.notes) {
      if (src === path) continue;
      const lines = [...new Set(n.links.filter((l) => this.resolve(l.target) === path).map((l) => l.line))];
      if (!lines.length) continue;
      const text = this.vault.read(src).split('\n');
      out.push({ source: src, lines: lines.map((line) => ({ line, text: text[line] ?? '' })) });
    }
    return out.sort((a, b) => a.source.localeCompare(b.source, 'lt'));
  }

  /** Visos žymos su užrašų skaičiumi. */
  tags(): { tag: string; count: number }[] {
    const m = new Map<string, number>();
    for (const n of this.notes.values()) for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'lt'));
  }

  notesWithTags(tags: string[]): string[] {
    return [...this.notes]
      .filter(([, n]) => tags.every((t) => n.tags.some((x) => x === t || x.startsWith(t + '/'))))
      .map(([p]) => p)
      .sort((a, b) => a.localeCompare(b, 'lt'));
  }

  /** Grafo duomenys: mazgai (užrašai + neegzistuojantys tikslai) ir ryšiai. */
  graph(): { nodes: { id: string; label: string; exists: boolean; tags: string[] }[]; links: { source: string; target: string }[] } {
    const nodes = new Map<string, { id: string; label: string; exists: boolean; tags: string[] }>();
    for (const [p, n] of this.notes) nodes.set(p, { id: p, label: noteName(p), exists: true, tags: n.tags });
    const links: { source: string; target: string }[] = [];
    const seen = new Set<string>();
    for (const [p, n] of this.notes) {
      for (const l of n.links) {
        let t = this.resolve(l.target);
        if (!t) {
          t = 'missing:' + l.target.toLowerCase();
          if (!nodes.has(t)) nodes.set(t, { id: t, label: l.target, exists: false, tags: [] });
        }
        const key = p + '→' + t;
        if (t === p || seen.has(key)) continue;
        seen.add(key);
        links.push({ source: p, target: t });
      }
    }
    return { nodes: [...nodes.values()], links };
  }
}
