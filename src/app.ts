import { Vault } from './core/vault';
import type { StorageAdapter } from './storage/adapter';
import { FsAdapter, fsAccessSupported } from './storage/fsAdapter';
import { IdbAdapter } from './storage/idbAdapter';
import { FileTree } from './ui/fileTree';
import { clear, h, isMobile } from './ui/dom';
import { icon } from './ui/icons';
import { renderLanding, LOGO } from './ui/landing';
import { toast } from './ui/dialogs';
import { debounce } from './core/events';
import { createRenderer } from './editor/markdown';
import { Workspace } from './workspace/workspace';
import { DEFAULT_SETTINGS, type Settings, type WorkspaceHost, type WorkspaceState, type EmptyViewFactory } from './workspace/types';
import type { NoteView } from './workspace/noteView';
import type { Extension } from '@codemirror/state';
import { NoteIndex } from './core/noteIndex';
import { BacklinksPanel } from './ui/backlinks';
import { wikiLinkExtensions } from './editor/wikilinks';
import { SearchPanel } from './ui/searchPanel';
import { TagsPanel } from './ui/tagsPanel';
import { openPicker } from './ui/picker';
import { fuzzy, highlight } from './core/fuzzy';
import { escapeHtml } from './ui/dom';
import { dirname, noteName } from './core/paths';
import { GraphView } from './graph/graphView';
import { download, exportVault, importEntries, pickFile, readZip } from './core/zip';
import { confirmDialog } from './ui/dialogs';
import { join } from './core/paths';

export interface Command {
  id: string;
  name: string;
  icon?: string;
  hotkey?: string;
  run(): void;
}

type LeftPanel = 'files' | 'search' | 'tags';

const LAST_VAULT_KEY = 'frankenstein.lastVault';

/** Pagrindinis programos valdiklis: vault gyvavimo ciklas ir sąsajos karkasas. */
export class App implements WorkspaceHost, EmptyViewFactory {
  vault!: Vault;
  settings: Settings = { ...DEFAULT_SETTINGS };
  tree!: FileTree;
  ws!: Workspace;
  private landing: { el: HTMLElement; destroy(): void } | null = null;
  index!: NoteIndex;
  backlinks!: BacklinksPanel;
  search!: SearchPanel;
  tags!: TagsPanel;
  private leftPanel: LeftPanel = 'files';
  private leftSwitch!: HTMLElement;
  private leftHost!: HTMLElement;
  private renderer = createRenderer({ resolve: (t) => this.index?.resolve(t) });
  private ready = false;

  // Karkaso elementai
  shell!: HTMLElement;
  left!: HTMLElement;
  right!: HTMLElement;
  center!: HTMLElement;
  topActions!: HTMLElement;

  constructor(private root: HTMLElement) {
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('beforeunload', () => this.ws?.flush());
    document.addEventListener('visibilitychange', () => document.hidden && this.ws?.flush());
  }

  async boot() {
    const last = localStorage.getItem(LAST_VAULT_KEY);
    if (last === 'idb' || (last === 'fs' && !fsAccessSupported())) {
      await this.openAdapter(new IdbAdapter());
      return;
    }
    await this.showLanding();
  }

  async showLanding() {
    this.ready = false;
    this.ws?.flush();
    clear(this.root);
    const stored = fsAccessSupported() ? await FsAdapter.stored() : undefined;
    this.landing = renderLanding({
      storedFolder: stored?.name,
      onOpenFolder: async () => {
        try {
          await this.openAdapter(await FsAdapter.pick());
        } catch (e) {
          if ((e as Error).name !== 'AbortError') toast('Nepavyko atidaryti aplanko: ' + (e as Error).message, 'error');
        }
      },
      onResumeFolder: async () => {
        if (stored && (await FsAdapter.ensurePermission(stored))) await this.openAdapter(new FsAdapter(stored));
        else toast('Leidimas nesuteiktas.', 'error');
      },
      onBrowserVault: () => this.openAdapter(new IdbAdapter()),
      onImportZip: async () => {
        const file = await pickFile('.zip,application/zip');
        if (!file) return;
        await this.openAdapter(new IdbAdapter());
        if (this.vault) await this.importZip(file);
      },
    });
    this.root.append(this.landing.el);
  }

  async openAdapter(adapter: StorageAdapter) {
    const vault = new Vault(adapter);
    try {
      await vault.load();
    } catch (e) {
      toast('Nepavyko nuskaityti vault: ' + (e as Error).message, 'error');
      return;
    }
    localStorage.setItem(LAST_VAULT_KEY, adapter.kind);
    this.landing?.destroy();
    this.landing = null;
    this.vault = vault;
    this.settings = await vault.readJSON<Settings>('settings.json', { ...DEFAULT_SETTINGS });
    await this.onVaultLoaded();
    this.buildShell();
    const state = await vault.readJSON<WorkspaceState>('workspace.json', { panes: [], activePane: 0 });
    this.restoreState(state);
    this.ready = true;
    this.onActiveChange();
  }

  /** Vieta indeksui ir kitiems moduliams, kurie priklauso nuo vault turinio. */
  protected async onVaultLoaded() {
    this.index = new NoteIndex(this.vault);
  }

  private buildShell() {
    const vault = this.vault;
    clear(this.root);
    this.tree = new FileTree(vault, {
      onOpen: (p, newTab) => this.openPath(p, newTab),
      onOpenSplit: (p) => this.openInSplit(p),
      onExpandedChange: () => this.persist(),
    });
    this.ws = new Workspace(this);

    const vaultLabel = h(
      'button',
      { class: 'vault-name', title: 'Keisti vault', onclick: () => this.switchVault() },
      h('span', { class: 'vault-kind', html: icon(vault.adapter.kind === 'fs' ? 'folder' : 'vault', 14) }),
      h('span', null, vault.name),
    );
    const tb = (ic: string, title: string, fn: () => void) => h('button', { class: 'icon-btn', title, 'aria-label': title, html: icon(ic, 18), onclick: fn });
    this.topActions = h(
      'div',
      { class: 'topbar-actions' },
      tb('search', 'Greitas perjungiklis (Ctrl+O)', () => this.quickSwitcher()),
      tb('calendar', 'Dienos užrašas (Alt+D)', () => this.openDaily()),
      tb('graph', 'Grafo vaizdas (Ctrl+G)', () => this.openGraph()),
      tb('command', 'Komandų paletė (Ctrl+P)', () => this.commandPalette()),
    );
    const topbar = h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn only-mobile', title: 'Failai', html: icon('menu', 18), onclick: () => this.toggleSide('left') }),
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', html: LOGO }), h('span', { class: 'brand-name' }, 'Frankenstein')),
      vaultLabel,
      h('div', { class: 'topbar-spacer' }),
      this.topActions,
      h('button', { class: 'icon-btn', title: 'Kairysis skydelis', html: icon('panel-left', 18), onclick: () => this.toggleSide('left'), 'data-desktop': '' }),
      h('button', { class: 'icon-btn', title: 'Dešinysis skydelis', html: icon('panel-right', 18), onclick: () => this.toggleSide('right') }),
    );

    this.search = new SearchPanel(vault, (p, newTab, line) => this.openPath(p, newTab, line));
    this.tags = new TagsPanel(this.index, (p, newTab) => this.openPath(p, newTab));
    this.tags.render();
    const sw = (id: LeftPanel, ic: string, title: string) =>
      h('button', { class: 'side-tab', 'data-panel': id, title, 'aria-label': title, html: icon(ic, 16), onclick: () => this.showLeftPanel(id) });
    this.leftSwitch = h(
      'div',
      { class: 'side-tabs', role: 'tablist' },
      sw('files', 'folder', 'Failai'),
      sw('search', 'search', 'Paieška (Ctrl+Shift+F)'),
      sw('tags', 'hash', 'Žymos'),
    );
    this.leftHost = h('div', { class: 'side-host' });
    this.left = h('aside', { class: 'sidebar sidebar-left' }, this.leftSwitch, this.leftHost);
    this.showLeftPanel('files');
    this.backlinks = new BacklinksPanel(
      this.index,
      (p, newTab, line) => this.openPath(p, newTab, line),
      (t) => this.openLink(t),
    );
    this.right = h('aside', { class: 'sidebar sidebar-right' }, this.backlinks.el);
    this.center = h('main', { class: 'workspace' }, this.ws.el);
    const backdrop = h('div', { class: 'backdrop', onclick: () => this.closeDrawers() });

    this.shell = h('div', { class: 'shell' }, topbar, h('div', { class: 'body' }, this.left, this.center, this.right, backdrop));
    this.root.append(this.shell);
    this.tree.render();
  }

  private restoreState(s: WorkspaceState) {
    this.tree.expanded = new Set(s.expanded ?? []);
    if (s.leftPanel) this.showLeftPanel(s.leftPanel as LeftPanel);
    if (!isMobile()) {
      this.shell.classList.toggle('left-collapsed', !!s.leftCollapsed);
      this.shell.classList.toggle('right-collapsed', !!s.rightCollapsed);
    }
    this.ws.restore(s);
    this.tree.render();
  }

  // ---------- WorkspaceHost ----------

  renderMarkdown(src: string): string {
    return this.renderer.render(src);
  }

  editorExtensions(_view: NoteView): Extension[] {
    return wikiLinkExtensions({
      notes: () => this.vault.notes(),
      tags: () => this.index.tags().map((t) => t.tag),
      exists: (t) => !!this.index.resolve(t),
      open: (t, newTab) => this.openLink(t, { newTab }),
      openTag: (t) => this.onTagClick(t),
    });
  }

  /** Atidaro [[nuorodą]]; jei tokio užrašo nėra – sukuria jį. */
  async openLink(target: string, opts: { newTab?: boolean; from?: string } = {}) {
    let path = this.index.resolve(target);
    if (!path) {
      const p = this.index.pathForNew(target);
      try {
        await this.vault.write(p, '');
        path = p;
        toast(`Sukurtas užrašas „${target}“`);
      } catch (e) {
        toast('Nepavyko sukurti užrašo: ' + (e as Error).message, 'error');
        return;
      }
    }
    this.openPath(path, opts.newTab);
  }

  onTagClick(tag: string) {
    this.tags.select(tag);
    this.showLeftPanel('tags', true);
  }

  showLeftPanel(id: LeftPanel, reveal = false) {
    this.leftPanel = id;
    const el = id === 'files' ? this.tree.el : id === 'search' ? this.search.el : this.tags.el;
    if (this.leftHost.firstChild !== el) {
      this.leftHost.replaceChildren(el);
      el.classList.remove('slide-in');
      void el.offsetWidth;
      el.classList.add('slide-in');
    }
    this.leftSwitch.querySelectorAll<HTMLElement>('.side-tab').forEach((b) => b.classList.toggle('on', b.dataset.panel === id));
    if (reveal) {
      if (isMobile()) this.shell.classList.add('left-open');
      else this.shell.classList.remove('left-collapsed');
    }
    this.persist();
  }

  createGraphView(nav: { back(): void; canBack(): boolean }) {
    const lastNote = () => {
      for (const p of [this.ws.activePane, ...this.ws.panes]) {
        const t = p.active;
        if (t?.loc.kind === 'note') return t.loc.path;
        const prev = t?.history.slice(0, t.idx).reverse().find((l) => l.kind === 'note');
        if (prev?.kind === 'note') return prev.path;
      }
      return null;
    };
    const gv = new GraphView({
      getData: () => this.index.graph(),
      getActive: lastNote,
      onOpen: (id, newTab) => {
        if (id.startsWith('missing:')) {
          const node = this.index.graph().nodes.find((n) => n.id === id);
          if (node) this.openLink(node.label, { newTab });
        } else this.openPath(id, newTab);
      },
      onBack: () => nav.back(),
      canBack: () => nav.canBack(),
      subscribe: (cb) => this.index.on('updated', debounce(cb, 300)),
    });
    return { el: gv.el, destroy: () => gv.destroy(), refresh: () => gv.refresh(), focus: (p: string | null) => gv.focus(p) };
  }

  /** Atidaro grafą (jei jau atidarytas – perjungia į jį). */
  openGraph(newTab = false) {
    for (const p of this.ws.panes) {
      const t = p.tabs.find((x) => x.loc.kind === 'graph');
      if (t && !newTab) {
        this.ws.setActivePane(p);
        p.activate(t);
        return;
      }
    }
    this.ws.open({ kind: 'graph' }, { newTab: true });
    this.closeDrawers();
  }

  // ---------- Paieška ir komandos ----------

  quickSwitcher() {
    openPicker({
      placeholder: 'Įveskite užrašo pavadinimą…',
      footer: '<kbd>↑↓</kbd> pasirinkti <kbd>Enter</kbd> atidaryti <kbd>Ctrl+Enter</kbd> naujame skirtuke <kbd>Esc</kbd> uždaryti',
      items: (q) => {
        const notes = this.vault.notes();
        if (!q.trim()) {
          return notes.slice(0, 50).map((p) => ({ id: p, html: escapeHtml(noteName(p)), detail: dirname(p), icon: 'file' }));
        }
        const res = notes
          .map((p) => ({ p, r: fuzzy(q, noteName(p)) ?? (fuzzy(q, p) ? { score: fuzzy(q, p)!.score - 50, indices: [] } : null) }))
          .filter((x) => x.r)
          .sort((a, b) => b.r!.score - a.r!.score)
          .map((x) => ({ id: x.p, html: highlight(noteName(x.p), x.r!.indices, escapeHtml), detail: dirname(x.p), icon: 'file' }));
        if (!this.index.resolve(q.trim())) res.push({ id: '\0new', html: `Sukurti „${escapeHtml(q.trim())}“`, detail: '', icon: 'file-plus' });
        return res;
      },
      onPick: (it, q, e) => {
        if (it.id === '\0new') this.openLink(q.trim(), { newTab: e.ctrlKey || e.metaKey });
        else this.openPath(it.id, e.ctrlKey || e.metaKey);
      },
      empty: 'Užrašų nerasta.',
    });
  }

  commandPalette() {
    const cmds = this.commands();
    openPicker({
      placeholder: 'Įveskite komandą…',
      items: (q) =>
        cmds
          .map((c) => ({ c, r: fuzzy(q, c.name) }))
          .filter((x) => x.r)
          .sort((a, b) => (q ? b.r!.score - a.r!.score : 0))
          .map((x) => ({ id: x.c.id, html: highlight(x.c.name, x.r!.indices, escapeHtml), icon: x.c.icon ?? 'spark', hint: x.c.hotkey })),
      onPick: (it) => cmds.find((c) => c.id === it.id)?.run(),
      footer: '<kbd>↑↓</kbd> pasirinkti <kbd>Enter</kbd> vykdyti <kbd>Esc</kbd> uždaryti',
    });
  }

  openSearch(query?: string) {
    this.showLeftPanel('search', true);
    this.search.focus(query);
  }

  commands(): Command[] {
    const ws = this.ws;
    return [
      { id: 'note.new', name: 'Naujas užrašas', icon: 'file-plus', hotkey: 'Alt+N', run: () => this.newNote() },
      { id: 'switcher', name: 'Greitas perjungiklis: atidaryti užrašą', icon: 'search', hotkey: 'Ctrl+O', run: () => this.quickSwitcher() },
      { id: 'search', name: 'Ieškoti visuose užrašuose', icon: 'search', hotkey: 'Ctrl+Shift+F', run: () => this.openSearch() },
      { id: 'mode', name: 'Perjungti šaltinį / peržiūrą', icon: 'eye', hotkey: 'Ctrl+E', run: () => ws.activePane.toggleMode() },
      { id: 'graph', name: 'Atidaryti grafo vaizdą', icon: 'graph', hotkey: 'Ctrl+G', run: () => this.openGraph() },
      { id: 'tags', name: 'Rodyti žymas', icon: 'hash', run: () => this.showLeftPanel('tags', true) },
      { id: 'files', name: 'Rodyti failų medį', icon: 'folder', run: () => this.showLeftPanel('files', true) },
      { id: 'left', name: 'Rodyti / slėpti kairįjį skydelį', icon: 'panel-left', run: () => this.toggleSide('left') },
      { id: 'right', name: 'Rodyti / slėpti nuorodų skydelį', icon: 'panel-right', run: () => this.toggleSide('right') },
      { id: 'back', name: 'Atgal', icon: 'arrow-left', hotkey: 'Alt+←', run: () => ws.activePane.back() },
      { id: 'forward', name: 'Pirmyn', icon: 'arrow-right', hotkey: 'Alt+→', run: () => ws.activePane.forward() },
      { id: 'tab.close', name: 'Uždaryti skirtuką', icon: 'x', hotkey: 'Alt+W', run: () => ws.activePane.active && ws.activePane.closeTab(ws.activePane.active) },
      { id: 'note.rename', name: 'Pervadinti užrašą', icon: 'edit', hotkey: 'F2', run: () => this.renameActive() },
      { id: 'vault.reload', name: 'Perskaityti vault iš naujo', icon: 'refresh', run: () => this.reloadVault() },
      { id: 'vault.switch', name: 'Keisti vault', icon: 'vault', run: () => this.switchVault() },
      ...this.extraCommands(),
    ];
  }

  /** Vėlesnių etapų komandos. */
  protected extraCommands(): Command[] {
    return [
      { id: 'daily', name: 'Atidaryti šiandienos dienos užrašą', icon: 'calendar', hotkey: 'Alt+D', run: () => this.openDaily() },
      { id: 'split', name: 'Padalinti ekraną / uždaryti padalijimą', icon: 'split', hotkey: 'Ctrl+\\', run: () => this.toggleSplit() },
      { id: 'tab.new', name: 'Naujas skirtukas', icon: 'file-plus', hotkey: 'Alt+T', run: () => this.ws.open({ kind: 'empty' }, { newTab: true }) },
      { id: 'tab.next', name: 'Kitas skirtukas', icon: 'arrow-right', hotkey: 'Ctrl+Tab', run: () => this.cycleTab(1) },
      { id: 'tab.prev', name: 'Ankstesnis skirtukas', icon: 'arrow-left', hotkey: 'Ctrl+Shift+Tab', run: () => this.cycleTab(-1) },
      { id: 'export', name: 'Eksportuoti vault kaip .zip', icon: 'download', run: () => this.exportZip() },
      { id: 'import', name: 'Importuoti .zip į vault', icon: 'upload', run: () => this.importZip() },
    ];
  }

  // ---------- 6 etapas: dienos užrašas, padalijimas, eksportas ----------

  static todayName(d = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async openDaily() {
    const name = App.todayName();
    const path = join(this.settings.dailyFolder, name + '.md');
    if (!this.vault.has(path)) {
      const weekday = new Date().toLocaleDateString('lt-LT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      await this.vault.write(path, `_${weekday}_\n\n## Užduotys\n- [ ] \n\n## Užrašai\n\n#dienoraštis\n`);
      toast('Sukurtas šiandienos užrašas');
    }
    this.openPath(path);
  }

  toggleSplit() {
    if (this.ws.panes.length > 1) this.ws.closePane(this.ws.activePane);
    else this.ws.split();
  }

  openInSplit(path: string) {
    if (this.ws.panes.length < 2) this.ws.split();
    const other = this.ws.panes.find((p) => p !== this.ws.activePane) ?? this.ws.panes[1];
    this.ws.setActivePane(other);
    other.open({ kind: 'note', path });
  }

  cycleTab(dir: number) {
    const p = this.ws.activePane;
    if (!p.tabs.length) return;
    const i = p.active ? p.tabs.indexOf(p.active) : 0;
    p.activate(p.tabs[(i + dir + p.tabs.length) % p.tabs.length]);
  }

  async exportZip() {
    this.ws.flush();
    try {
      const blob = await exportVault(this.vault);
      download(blob, `${this.vault.name.replace(/[^\p{L}\p{N}_-]+/gu, '-')}-${App.todayName()}.zip`);
      toast('Vault eksportuotas');
    } catch (e) {
      toast('Eksportas nepavyko: ' + (e as Error).message, 'error');
    }
  }

  async importZip(file?: File | null) {
    file ??= await pickFile('.zip,application/zip');
    if (!file) return;
    try {
      const entries = readZip(await file.arrayBuffer());
      if (!entries.length) return toast('Archyve nerasta failų.', 'error');
      const clashes = entries.filter((e) => this.vault.has(e.path)).length;
      if (
        clashes &&
        !(await confirmDialog('Importuoti archyvą?', `${entries.length} failai bus įrašyti į „${this.vault.name}“. ${clashes} esami užrašai tokiais pačiais pavadinimais bus perrašyti.`, 'Importuoti'))
      )
        return;
      this.ws.flush();
      const n = await importEntries(this.vault, entries);
      this.ws.panes.forEach((p) => p.renderBody());
      toast(`Importuota failų: ${n}`);
    } catch (e) {
      toast('Importas nepavyko: ' + (e as Error).message, 'error');
    }
  }

  renameActive() {
    const t = this.center.querySelector<HTMLInputElement>('.pane.active-pane .note-title') ?? this.center.querySelector<HTMLInputElement>('.note-title');
    t?.focus();
    t?.select();
  }

  async reloadVault() {
    this.ws.flush();
    await this.vault.load();
    this.ws.panes.forEach((p) => p.renderBody());
    toast('Vault perskaitytas iš naujo');
  }

  onActiveChange() {
    if (!this.ready) return;
    const p = this.ws.activePath();
    this.tree.setActive(p);
    this.backlinks.setPath(p);
    if (p) this.ws.panes.forEach((x) => x.focusGraph(p));
    document.title = p ? `${p.split('/').pop()!.replace(/\.md$/, '')} – Frankenstein` : 'Frankenstein';
  }

  persist = debounce(() => {
    if (!this.ready) return;
    const state: WorkspaceState = {
      ...this.ws.serialize(),
      leftCollapsed: this.shell.classList.contains('left-collapsed'),
      rightCollapsed: this.shell.classList.contains('right-collapsed'),
      expanded: [...this.tree.expanded],
      leftPanel: this.leftPanel,
    };
    this.vault.writeJSON('workspace.json', state);
  }, 600);

  renderEmpty(): HTMLElement {
    return h(
      'div',
      { class: 'empty-state' },
      h(
        'div',
        { class: 'empty-inner' },
        h('div', { class: 'empty-logo', html: LOGO }),
        h('p', null, 'Atidarykite užrašą arba sukurkite naują.'),
        h(
          'div',
          { class: 'empty-actions' },
          h('button', { class: 'btn primary', onclick: () => this.newNote(), html: icon('file-plus', 14) + 'Naujas užrašas' }),
        ),
      ),
    );
  }

  // ---------- Veiksmai ----------

  openPath(path: string, newTab = false, line?: number) {
    this.ws.openNote(path, { newTab });
    this.closeDrawers();
    if (line !== undefined) requestAnimationFrame(() => this.ws.activeNoteView()?.revealLine(line));
  }

  async newNote(dir = '') {
    const p = await this.vault.createNote(dir);
    this.openPath(p);
    requestAnimationFrame(() => {
      const t = this.center.querySelector<HTMLInputElement>('.pane.active-pane .note-title, .note-title');
      t?.focus();
      t?.select();
    });
  }

  toggleSide(side: 'left' | 'right') {
    if (isMobile()) {
      const cls = `${side}-open`;
      const open = !this.shell.classList.contains(cls);
      this.closeDrawers();
      this.shell.classList.toggle(cls, open);
    } else {
      this.shell.classList.toggle(`${side}-collapsed`);
      this.persist();
    }
  }

  closeDrawers() {
    this.shell?.classList.remove('left-open', 'right-open');
  }

  async switchVault() {
    this.ws?.flush();
    localStorage.removeItem(LAST_VAULT_KEY);
    await this.showLanding();
  }

  // ---------- Klaviatūra ----------

  private onKey(e: KeyboardEvent) {
    if (!this.ready) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const run = (fn: () => void) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
    if (mod && !e.shiftKey && !e.altKey && k === 'e') return run(() => this.ws.activePane.toggleMode());
    if (mod && !e.shiftKey && k === 's') return run(() => this.ws.flush());
    if (e.altKey && !mod && e.key === 'ArrowLeft') return run(() => this.ws.activePane.back());
    if (e.altKey && !mod && e.key === 'ArrowRight') return run(() => this.ws.activePane.forward());
    if (mod && e.shiftKey && k === 'f') return run(() => this.openSearch());
    if (mod && !e.shiftKey && k === 'o') return run(() => this.quickSwitcher());
    if (e.altKey && !mod && e.code === 'KeyD') return run(() => this.openDaily());
    if (e.altKey && !mod && e.code === 'KeyT') return run(() => this.ws.open({ kind: 'empty' }, { newTab: true }));
    if (mod && e.code === 'Backslash') return run(() => this.toggleSplit());
    if (e.ctrlKey && e.key === 'Tab') return run(() => this.cycleTab(e.shiftKey ? -1 : 1));
    if (mod && !e.shiftKey && k === 'g') return run(() => this.openGraph());
    if (mod && !e.shiftKey && k === 'p') return run(() => this.commandPalette());
    if (e.altKey && !mod && e.code === 'KeyN') return run(() => this.newNote());
    if (e.altKey && !mod && e.code === 'KeyW') return run(() => this.commands().find((c) => c.id === 'tab.close')!.run());
    this.onExtraKey(e, mod, k, run);
  }

  /** Papildomos klavišų kombinacijos (pildoma vėlesniuose etapuose). */
  protected onExtraKey(_e: KeyboardEvent, _mod: boolean, _k: string, _run: (fn: () => void) => void) {}
}
