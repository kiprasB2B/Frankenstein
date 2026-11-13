import { h } from '../ui/dom';
import type { VaultEvent } from '../core/vault';
import { Pane } from './pane';
import type { EmptyViewFactory, Location, Mode, WorkspaceHost, WorkspaceState } from './types';

/** Darbo vieta: viena arba dvi ekrano dalys (split) su skirtukais. */
export class Workspace {
  readonly el: HTMLElement;
  panes: Pane[] = [];
  activePane!: Pane;

  constructor(private host: WorkspaceHost & EmptyViewFactory) {
    this.el = h('div', { class: 'panes' });
    this.addPane();
    host.vault.on('change', (ev) => this.onVaultChange(ev));
  }

  private addPane(): Pane {
    const p = new Pane(this, this.host);
    this.panes.push(p);
    this.el.append(p.el);
    if (this.panes.length > 1) {
      this.el.insertBefore(h('div', { class: 'pane-divider' }), p.el);
    }
    this.el.classList.toggle('split', this.panes.length > 1);
    this.activePane = p;
    this.updateActiveClass();
    return p;
  }

  setActivePane(p: Pane) {
    if (this.activePane === p) return;
    this.activePane = p;
    this.updateActiveClass();
    this.host.onActiveChange();
  }

  private updateActiveClass() {
    this.panes.forEach((p) => p.el.classList.toggle('active-pane', p === this.activePane && this.panes.length > 1));
  }

  open(loc: Location, opts: { newTab?: boolean; mode?: Mode; pane?: Pane } = {}) {
    (opts.pane ?? this.activePane).open(loc, opts);
  }

  openNote(path: string, opts: { newTab?: boolean; mode?: Mode } = {}) {
    this.open({ kind: 'note', path }, opts);
  }

  /** Padalina ekraną: dešinėje atidaromas tas pats užrašas. */
  split() {
    if (this.panes.length > 1) return;
    const cur = this.activePane.active;
    const p = this.addPane();
    p.open(cur?.loc ?? { kind: 'empty' }, { newTab: true, mode: cur?.mode });
    this.panes.forEach((x) => x.renderChrome());
    this.host.persist();
  }

  closePane(p: Pane) {
    if (this.panes.length < 2) return;
    p.flush();
    this.panes.splice(this.panes.indexOf(p), 1);
    this.el.querySelector('.pane-divider')?.remove();
    p.destroy();
    this.el.classList.remove('split');
    this.activePane = this.panes[0];
    this.updateActiveClass();
    this.panes[0].renderChrome();
    this.host.onActiveChange();
    this.host.persist();
  }

  /** Aktyvaus užrašo kelias (jei aktyvus skirtukas – užrašas). */
  activePath(): string | null {
    const t = this.activePane.active;
    return t?.loc.kind === 'note' ? t.loc.path : null;
  }

  activeNoteView() {
    const p = this.activePane;
    return p.active?.loc.kind === 'note' ? p.noteView : null;
  }

  private onVaultChange(ev: VaultEvent) {
    for (const p of this.panes) {
      if (ev.type === 'rename') p.onRename(ev.moved);
      else if (ev.type === 'delete') p.onDelete(ev.path, ev.kind === 'folder');
      else if (ev.type === 'modify') p.onModify(ev.path, ev.source);
    }
    if (ev.type !== 'modify') this.host.persist();
  }

  refreshGraphs() {
    this.panes.forEach((p) => p.refreshGraph());
  }

  flush() {
    this.panes.forEach((p) => p.flush());
  }

  serialize(): Pick<WorkspaceState, 'panes' | 'activePane'> {
    return { panes: this.panes.map((p) => p.serialize()), activePane: this.panes.indexOf(this.activePane) };
  }

  restore(s: WorkspaceState) {
    const panes = s.panes?.length ? s.panes.slice(0, 2) : [{ tabs: [], active: 0 }];
    if (panes.length > 1) this.addPane();
    panes.forEach((ps, i) => this.panes[i].restore(ps));
    this.activePane = this.panes[s.activePane] ?? this.panes[0];
    this.updateActiveClass();
  }
}
