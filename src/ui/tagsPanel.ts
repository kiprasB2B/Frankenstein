import type { NoteIndex } from '../core/noteIndex';
import { noteName, dirname } from '../core/paths';
import { clear, h } from './dom';
import { icon } from './icons';

/** Žymų sąrašas ir užrašų filtravimas pagal žymas (kelios žymos – IR). */
export class TagsPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  selected = new Set<string>();

  constructor(
    private index: NoteIndex,
    private open: (path: string, newTab: boolean) => void,
  ) {
    this.body = h('div', { class: 'panel-body' });
    this.el = h('div', { class: 'panel panel-tags' }, h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Žymos')), this.body);
    index.on('updated', () => this.render());
  }

  select(tag: string, only = true) {
    if (only) this.selected.clear();
    this.selected.add(tag);
    this.render();
  }

  render() {
    clear(this.body);
    const tags = this.index.tags();
    if (this.selected.size) {
      this.body.append(
        h('button', { class: 'back-link', onclick: () => (this.selected.clear(), this.render()), html: icon('arrow-left', 14) + '<span>Visos žymos</span>' }),
      );
    }
    if (!tags.length) {
      this.body.append(h('div', { class: 'empty-hint' }, 'Žymų dar nėra. Parašykite #žyma bet kuriame užraše.'));
      return;
    }
    const cloud = h('div', { class: 'tag-cloud' });
    for (const t of tags) {
      const on = this.selected.has(t.tag);
      cloud.append(
        h(
          'button',
          {
            class: 'tag-chip' + (on ? ' on' : ''),
            title: on ? 'Pašalinti iš filtro' : 'Filtruoti pagal žymą (Shift – pridėti prie filtro)',
            onclick: (e: MouseEvent) => {
              if (on) this.selected.delete(t.tag);
              else {
                if (!e.shiftKey && !e.ctrlKey && !e.metaKey) this.selected.clear();
                this.selected.add(t.tag);
              }
              this.render();
            },
          },
          h('span', null, '#' + t.tag),
          h('span', { class: 'tag-count' }, String(t.count)),
        ),
      );
    }
    this.body.append(cloud);
    if (!this.selected.size) {
      this.body.append(h('div', { class: 'empty-hint' }, 'Paspauskite žymą, kad pamatytumėte jos užrašus. Shift + paspaudimas – kelios žymos.'));
      return;
    }
    const notes = this.index.notesWithTags([...this.selected]);
    this.body.append(h('div', { class: 'bl-section' }, h('span', null, 'Užrašai'), h('span', { class: 'count' }, String(notes.length))));
    for (const p of notes) {
      this.body.append(
        h(
          'button',
          { class: 'bl-out note-link', onclick: (e: MouseEvent) => this.open(p, e.ctrlKey || e.metaKey) },
          h('span', { html: icon('file', 13) }),
          h('span', null, noteName(p)),
          dirname(p) ? h('span', { class: 'search-file-dir' }, dirname(p)) : null,
        ),
      );
    }
  }
}
