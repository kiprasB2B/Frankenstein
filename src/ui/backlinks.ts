import type { NoteIndex } from '../core/noteIndex';
import { noteName } from '../core/paths';
import { clear, escapeHtml, h } from './dom';
import { icon } from './icons';

/** Dešinysis skydelis: atgalinės ir išeinančios nuorodos. */
export class BacklinksPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private path: string | null = null;

  constructor(
    private index: NoteIndex,
    private open: (path: string, newTab: boolean, line?: number) => void,
    private openLink: (target: string) => void,
  ) {
    this.body = h('div', { class: 'panel-body' });
    this.el = h('div', { class: 'panel panel-backlinks' }, h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Nuorodos')), this.body);
    index.on('updated', () => this.render());
  }

  setPath(path: string | null) {
    this.path = path;
    this.render();
  }

  render() {
    clear(this.body);
    const path = this.path;
    if (!path) {
      this.body.append(h('div', { class: 'empty-hint' }, 'Atidarykite užrašą, kad pamatytumėte jo ryšius.'));
      return;
    }
    const back = this.index.backlinks(path);
    const target = noteName(path);
    this.body.append(this.section('Atgalinės nuorodos', back.length));
    if (!back.length) this.body.append(h('div', { class: 'empty-hint' }, `Į „${target}“ dar niekas nenurodo.`));
    for (const b of back) {
      this.body.append(
        h(
          'div',
          { class: 'bl-card', tabindex: 0, onclick: (e: MouseEvent) => this.open(b.source, e.ctrlKey || e.metaKey, b.lines[0]?.line), onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && this.open(b.source, false) },
          h('div', { class: 'bl-title', html: icon('file', 13) + `<span>${escapeHtml(noteName(b.source))}</span>` }),
          b.lines.slice(0, 4).map((l) => h('div', { class: 'bl-line', html: this.highlight(l.text) })),
        ),
      );
    }
    const out = this.index.outgoing(path);
    this.body.append(this.section('Išeinančios nuorodos', out.length));
    if (!out.length) this.body.append(h('div', { class: 'empty-hint' }, 'Šiame užraše nėra [[nuorodų]].'));
    for (const o of out) {
      this.body.append(
        h(
          'button',
          {
            class: 'bl-out' + (o.path ? '' : ' unresolved'),
            title: o.path ?? 'Užrašo dar nėra – paspauskite, kad sukurtumėte',
            onclick: (e: MouseEvent) => (o.path ? this.open(o.path, e.ctrlKey || e.metaKey) : this.openLink(o.target)),
          },
          h('span', { html: icon(o.path ? 'link' : 'file-plus', 13) }),
          h('span', null, o.target),
        ),
      );
    }
  }

  private section(title: string, n: number) {
    return h('div', { class: 'bl-section' }, h('span', null, title), h('span', { class: 'count' }, String(n)));
  }

  private highlight(line: string): string {
    return escapeHtml(line.trim()).replace(/\[\[([^\]]+)\]\]/g, '<mark>$1</mark>');
  }
}
