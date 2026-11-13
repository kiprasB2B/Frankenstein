import type { EditorState } from '@codemirror/state';
import { clear, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { dirname, noteName } from '../core/paths';
import { NoteView } from './noteView';
import type { EmptyViewFactory, Location, Mode, SerializedPane, WorkspaceHost } from './types';
import type { Workspace } from './workspace';

let tabSeq = 0;

export function sameLoc(a: Location, b: Location): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'note' || a.path === (b as { path: string }).path;
}

/** Skirtukas su savo naršymo istorija (atgal / pirmyn). */
export class Tab {
  readonly id = ++tabSeq;
  history: Location[];
  idx = 0;
  editorState?: EditorState;
  scroll?: number;

  constructor(
    public pane: Pane,
    public loc: Location,
    public mode: Mode,
  ) {
    this.history = [loc];
  }

  get title(): string {
    if (this.loc.kind === 'note') return noteName(this.loc.path);
    if (this.loc.kind === 'graph') return 'Grafas';
    return 'Naujas skirtukas';
  }
}

/** Darbo vietos dalis (ekrano pusė): skirtukų juosta, antraštė ir turinys. */
export class Pane {
  readonly el: HTMLElement;
  private tabbar: HTMLElement;
  private header: HTMLElement;
  private body: HTMLElement;
  tabs: Tab[] = [];
  active: Tab | null = null;
  noteView: NoteView | null = null;
  private graph: ReturnType<NonNullable<WorkspaceHost['createGraphView']>> | null = null;
  private status: 'saving' | 'saved' | 'error' = 'saved';

  constructor(
    private ws: Workspace,
    private host: WorkspaceHost & EmptyViewFactory,
  ) {
    this.tabbar = h('div', { class: 'tabbar', role: 'tablist' });
    this.header = h('div', { class: 'pane-header' });
    this.body = h('div', { class: 'pane-body' });
    this.el = h('section', { class: 'pane' }, this.tabbar, this.header, this.body);
    this.el.addEventListener('mousedown', () => ws.setActivePane(this), true);
    this.el.addEventListener('focusin', () => ws.setActivePane(this));
  }

  // ---------- Atidarymas ir naršymas ----------

  open(loc: Location, opts: { newTab?: boolean; mode?: Mode } = {}) {
    if (opts.newTab || !this.active) {
      // Jei toks skirtukas jau atidarytas – tiesiog perjungiame.
      const existing = opts.newTab ? undefined : this.tabs.find((t) => sameLoc(t.loc, loc));
      const tab = existing ?? new Tab(this, loc, opts.mode ?? this.host.settings.defaultMode);
      if (!existing) this.tabs.splice(this.active ? this.tabs.indexOf(this.active) + 1 : this.tabs.length, 0, tab);
      this.activate(tab);
      return;
    }
    const tab = this.active;
    if (sameLoc(tab.loc, loc)) {
      if (opts.mode) this.setMode(opts.mode);
      return;
    }
    this.noteView?.detach();
    tab.history = tab.history.slice(0, tab.idx + 1);
    tab.history.push(loc);
    tab.idx = tab.history.length - 1;
    this.navigate(tab, loc);
  }

  private navigate(tab: Tab, loc: Location) {
    if (tab.loc.kind === 'note' && this.noteView?.tab === tab) this.noteView.detach();
    tab.loc = loc;
    tab.editorState = undefined;
    tab.scroll = 0;
    this.activate(tab, true);
  }

  back() {
    const t = this.active;
    if (!t || t.idx <= 0) return;
    t.idx--;
    this.navigate(t, t.history[t.idx]);
  }

  forward() {
    const t = this.active;
    if (!t || t.idx >= t.history.length - 1) return;
    t.idx++;
    this.navigate(t, t.history[t.idx]);
  }

  activate(tab: Tab, force = false) {
    if (this.active === tab && !force) return;
    if (this.active && this.active !== tab && this.noteView?.tab === this.active) this.noteView.detach();
    this.active = tab;
    this.renderBody();
    this.renderChrome();
    this.host.onActiveChange();
    this.host.persist();
  }

  closeTab(tab: Tab) {
    const i = this.tabs.indexOf(tab);
    if (i === -1) return;
    if (this.noteView?.tab === tab) {
      this.noteView.detach();
      this.noteView.tab = null;
    }
    this.tabs.splice(i, 1);
    if (this.active === tab) {
      this.active = null;
      const next = this.tabs[i] ?? this.tabs[i - 1];
      if (next) this.activate(next);
      else if (this.ws.panes.length > 1) {
        this.ws.closePane(this);
        return;
      } else {
        this.renderBody();
        this.renderChrome();
        this.host.onActiveChange();
      }
    } else this.renderChrome();
    this.host.persist();
  }

  closeOthers(tab: Tab) {
    this.tabs.filter((t) => t !== tab).forEach((t) => this.closeTab(t));
  }

  // ---------- Režimai ----------

  setMode(mode: Mode) {
    const t = this.active;
    if (!t || t.loc.kind !== 'note') return;
    if (t.mode === mode) return;
    this.noteView?.flush();
    t.mode = mode;
    this.noteView?.applyMode(mode);
    if (mode === 'source') this.noteView?.focus();
    this.renderChrome();
    this.host.persist();
  }

  toggleMode() {
    if (this.active?.loc.kind === 'note') this.setMode(this.active.mode === 'source' ? 'preview' : 'source');
  }

  // ---------- Atvaizdavimas ----------

  renderBody() {
    const t = this.active;
    if (this.graph && t?.loc.kind !== 'graph') {
      this.graph.destroy();
      this.graph = null;
    }
    clear(this.body);
    this.body.classList.remove('enter');
    void this.body.offsetWidth;
    this.body.classList.add('enter');
    if (!t || t.loc.kind === 'empty') {
      this.body.append(this.host.renderEmpty());
      return;
    }
    if (t.loc.kind === 'graph') {
      if (!this.graph && this.host.createGraphView) this.graph = this.host.createGraphView({
          back: () => (t.idx > 0 ? this.back() : this.closeTab(t)),
          canBack: () => t.idx > 0,
        });
      if (this.graph) this.body.append(this.graph.el);
      return;
    }
    if (!this.host.vault.has(t.loc.path)) {
      this.body.append(h('div', { class: 'empty-state' }, h('p', null, 'Užrašas nerastas.')));
      return;
    }
    if (!this.noteView) {
      this.noteView = new NoteView(this.host);
      this.noteView.onStatus = (s) => {
        this.status = s;
        this.renderStatus();
      };
    }
    this.body.append(this.noteView.el);
    this.noteView.show(t);
  }

  focusGraph(path: string | null) {
    this.graph?.focus?.(path);
  }

  refreshGraph() {
    this.graph?.refresh?.();
  }

  renderChrome() {
    this.renderTabbar();
    this.renderHeader();
  }

  private renderTabbar() {
    clear(this.tabbar);
    for (const t of this.tabs) {
      const el = h(
        'div',
        {
          class: 'tab' + (t === this.active ? ' active' : ''),
          role: 'tab',
          'aria-selected': String(t === this.active),
          title: t.loc.kind === 'note' ? t.loc.path : t.title,
          draggable: true,
          onclick: () => this.activate(t),
          onauxclick: (e: MouseEvent) => e.button === 1 && this.closeTab(t),
        },
        h('span', { class: 'tab-icon', html: icon(t.loc.kind === 'graph' ? 'graph' : t.loc.kind === 'note' ? 'file' : 'spark', 13) }),
        h('span', { class: 'tab-title' }, t.title),
        h('button', {
          class: 'tab-close',
          title: 'Uždaryti (Ctrl+W)',
          html: icon('x', 12),
          onclick: (e: MouseEvent) => {
            e.stopPropagation();
            this.closeTab(t);
          },
        }),
      );
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('application/x-fr-tab', String(t.id));
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => {
        if (e.dataTransfer?.types.includes('application/x-fr-tab')) e.preventDefault();
      });
      el.addEventListener('drop', (e) => {
        const id = Number(e.dataTransfer?.getData('application/x-fr-tab'));
        const src = this.tabs.find((x) => x.id === id);
        if (!src || src === t) return;
        e.preventDefault();
        this.tabs.splice(this.tabs.indexOf(src), 1);
        this.tabs.splice(this.tabs.indexOf(t), 0, src);
        this.renderTabbar();
        this.host.persist();
      });
      this.tabbar.append(el);
    }
    this.tabbar.append(
      h('button', {
        class: 'icon-btn tab-new',
        title: 'Naujas skirtukas',
        html: icon('file-plus', 14),
        onclick: () => this.open({ kind: 'empty' }, { newTab: true }),
      }),
    );
    this.tabbar.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private renderHeader() {
    clear(this.header);
    const t = this.active;
    const btn = (ic: string, title: string, fn: () => void, extra = '', disabled = false) =>
      h('button', { class: 'icon-btn ' + extra, title, 'aria-label': title, html: icon(ic, 16), onclick: fn, disabled });
    this.header.append(
      btn('arrow-left', 'Atgal (Alt+←)', () => this.back(), '', !t || t.idx <= 0),
      btn('arrow-right', 'Pirmyn (Alt+→)', () => this.forward(), '', !t || t.idx >= t.history.length - 1),
    );
    const crumbs = h('div', { class: 'crumbs' });
    if (t?.loc.kind === 'note') {
      const dir = dirname(t.loc.path);
      if (dir) dir.split('/').forEach((seg) => crumbs.append(h('span', { class: 'crumb' }, seg), h('span', { class: 'crumb-sep' }, '/')));
      crumbs.append(h('span', { class: 'crumb current' }, noteName(t.loc.path)));
    } else if (t) crumbs.append(h('span', { class: 'crumb current' }, t.title));
    this.header.append(crumbs, h('span', { class: 'save-status' }));
    if (t?.loc.kind === 'note') {
      const preview = t.mode === 'preview';
      this.header.append(
        h(
          'button',
          {
            class: 'mode-toggle' + (preview ? ' on' : ''),
            title: 'Perjungti režimą (Ctrl+E)',
            onclick: () => this.toggleMode(),
          },
          h('span', { class: 'mode-opt' + (!preview ? ' sel' : ''), html: icon('code', 14) + '<span>Šaltinis</span>' }),
          h('span', { class: 'mode-opt' + (preview ? ' sel' : ''), html: icon('eye', 14) + '<span>Peržiūra</span>' }),
        ),
      );
    }
    this.header.append(
      btn('split', this.ws.panes.length > 1 ? 'Uždaryti padalijimą' : 'Padalinti ekraną (Ctrl+\\)', () =>
        this.ws.panes.length > 1 ? this.ws.closePane(this) : this.ws.split(),
        this.ws.panes.length > 1 ? 'on' : '',
      ),
    );
    this.renderStatus();
  }

  private renderStatus() {
    const el = this.header.querySelector('.save-status');
    if (!el) return;
    el.className = 'save-status ' + this.status;
    el.textContent = this.active?.loc.kind !== 'note' ? '' : this.status === 'saving' ? 'Saugoma…' : this.status === 'error' ? 'Klaida' : 'Išsaugota';
  }

  // ---------- Vault įvykiai ----------

  onRename(moved: Map<string, string>) {
    let changed = false;
    for (const t of this.tabs) {
      t.history = t.history.map((l) => (l.kind === 'note' && moved.has(l.path) ? { kind: 'note', path: moved.get(l.path)! } : l));
      if (t.loc.kind === 'note' && moved.has(t.loc.path)) {
        t.loc = { kind: 'note', path: moved.get(t.loc.path)! };
        changed = true;
        if (this.noteView?.tab === t) this.noteView.setTitle(t.loc.path);
      }
    }
    if (changed) this.renderChrome();
  }

  onDelete(path: string, isFolder: boolean) {
    const gone = (p: string) => (isFolder ? p.startsWith(path + '/') : p === path);
    for (const t of [...this.tabs]) {
      t.history = t.history.filter((l) => l.kind !== 'note' || !gone(l.path));
      t.idx = Math.min(t.idx, t.history.length - 1);
      if (t.loc.kind === 'note' && gone(t.loc.path)) {
        if (this.noteView?.tab === t) this.noteView.tab = null;
        this.closeTab(t);
      }
    }
  }

  onModify(path: string, source: unknown) {
    for (const t of this.tabs) {
      if (t.loc.kind !== 'note' || t.loc.path !== path) continue;
      // Neaktyvūs skirtukai atsinaujina patys (show() palygina turinį su vault).
      if (this.noteView?.tab === t && this.active === t && source !== this.noteView) this.noteView.syncFromVault();
    }
  }

  // ---------- Būsena ----------

  serialize(): SerializedPane {
    return {
      tabs: this.tabs.filter((t) => t.loc.kind !== 'empty').map((t) => ({ loc: t.loc, mode: t.mode })),
      active: Math.max(0, this.tabs.filter((t) => t.loc.kind !== 'empty').indexOf(this.active!)),
    };
  }

  restore(s: SerializedPane) {
    this.tabs = s.tabs
      .filter((st) => st.loc.kind !== 'note' || this.host.vault.has(st.loc.path))
      .map((st) => new Tab(this, st.loc, st.mode));
    const a = this.tabs[s.active] ?? this.tabs[0] ?? null;
    if (a) this.activate(a, true);
    else {
      this.renderBody();
      this.renderChrome();
    }
  }

  flush() {
    this.noteView?.flush();
  }

  destroy() {
    this.noteView?.destroy();
    this.graph?.destroy();
    this.el.remove();
  }
}
