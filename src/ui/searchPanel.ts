import type { Vault } from '../core/vault';
import { noteName, dirname } from '../core/paths';
import { debounce } from '../core/events';
import { clear, escapeHtml, h } from './dom';
import { icon } from './icons';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

interface Hit {
  path: string;
  nameHit: boolean;
  lines: { line: number; html: string }[];
  total: number;
}

/** Pilno teksto paieška per visus užrašus (Ctrl+Shift+F). */
export class SearchPanel {
  readonly el: HTMLElement;
  readonly input: HTMLInputElement;
  private results: HTMLElement;
  private summary: HTMLElement;

  constructor(
    private vault: Vault,
    private open: (path: string, newTab: boolean, line?: number) => void,
  ) {
    this.input = h('input', { class: 'input search-input', placeholder: 'Ieškoti visuose užrašuose…', spellcheck: false, type: 'search' });
    this.summary = h('div', { class: 'search-summary' });
    this.results = h('div', { class: 'search-results' });
    this.el = h(
      'div',
      { class: 'panel panel-search' },
      h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Paieška')),
      h('div', { class: 'search-box' }, h('span', { class: 'search-icon', html: icon('search', 14) }), this.input),
      this.summary,
      h('div', { class: 'panel-body' }, this.results),
    );
    const run = debounce(() => this.run(), 140);
    this.input.addEventListener('input', run);
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = this.results.querySelector<HTMLElement>('.search-hit');
        first?.click();
      }
    });
    vault.on('change', () => this.input.value && run());
    this.run();
  }

  focus(query?: string) {
    if (query !== undefined) {
      this.input.value = query;
      this.run();
    }
    this.input.focus();
    this.input.select();
  }

  private search(q: string): Hit[] {
    const terms = fold(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const hits: Hit[] = [];
    for (const path of this.vault.notes()) {
      const text = this.vault.read(path);
      const ftext = fold(text);
      const fname = fold(noteName(path));
      if (!terms.every((t) => ftext.includes(t) || fname.includes(t))) continue;
      const lines: Hit['lines'] = [];
      let total = 0;
      text.split('\n').forEach((line, i) => {
        const fl = fold(line);
        if (!terms.some((t) => fl.includes(t))) return;
        total++;
        if (lines.length < 6) lines.push({ line: i, html: this.mark(line, terms) });
      });
      hits.push({ path, nameHit: terms.every((t) => fname.includes(t)), lines, total });
    }
    return hits.sort((a, b) => Number(b.nameHit) - Number(a.nameHit) || b.total - a.total);
  }

  /** Paryškina atitikmenis (folded tekstas turi tą patį ilgį kaip originalas daugumai raidžių). */
  private mark(line: string, terms: string[]): string {
    let text = line.trim();
    const fl = fold(text);
    let first = Infinity;
    for (const t of terms) {
      const i = fl.indexOf(t);
      if (i !== -1) first = Math.min(first, i);
    }
    let offset = 0;
    if (first > 60) {
      offset = first - 40;
      text = text.slice(offset);
    }
    const ft = fl.slice(offset);
    const ranges: [number, number][] = [];
    for (const t of terms) {
      let i = ft.indexOf(t);
      while (i !== -1) {
        ranges.push([i, i + t.length]);
        i = ft.indexOf(t, i + t.length);
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let out = offset ? '…' : '';
    let pos = 0;
    for (const [a, b] of ranges) {
      if (a < pos) continue;
      out += escapeHtml(text.slice(pos, a)) + '<mark>' + escapeHtml(text.slice(a, b)) + '</mark>';
      pos = b;
    }
    return out + escapeHtml(text.slice(pos, 220));
  }

  run() {
    clear(this.results);
    const q = this.input.value.trim();
    if (!q) {
      this.summary.textContent = '';
      this.results.append(h('div', { class: 'empty-hint' }, 'Įveskite žodį ar frazę. Ieškoma užrašų pavadinimuose ir turinyje, nekreipiant dėmesio į didžiąsias raides ir diakritiką.'));
      return;
    }
    const hits = this.search(q);
    const total = hits.reduce((s, x) => s + x.total, 0);
    this.summary.textContent = hits.length ? `${hits.length} užraš. · ${total} atitikm.` : '';
    if (!hits.length) this.results.append(h('div', { class: 'empty-hint' }, `„${q}“ nerasta.`));
    for (const hit of hits) {
      const group = h(
        'div',
        { class: 'search-group' },
        h(
          'button',
          { class: 'search-file', onclick: (e: MouseEvent) => this.open(hit.path, e.ctrlKey || e.metaKey) },
          h('span', { html: icon('file', 13) }),
          h('span', { class: 'search-file-name' }, noteName(hit.path)),
          dirname(hit.path) ? h('span', { class: 'search-file-dir' }, dirname(hit.path)) : null,
          h('span', { class: 'count' }, String(hit.total)),
        ),
      );
      for (const l of hit.lines) {
        group.append(h('button', { class: 'search-hit', html: l.html, onclick: (e: MouseEvent) => this.open(hit.path, e.ctrlKey || e.metaKey, l.line) }));
      }
      this.results.append(group);
    }
  }
}
