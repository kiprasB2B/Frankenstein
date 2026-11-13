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
import { download, pickFile, pickFiles } from './ui/files';

// Sunkesni moduliai kraunami tik prireikus.
const loadZip = () => import('./core/zip');
const loadGraph = () => import('./graph/graphView');
import { confirmDialog } from './ui/dialogs';
import { join, isImage, extname } from './core/paths';
import { EditorView } from '@codemirror/view';
import { fillTemplate, openSettings } from './ui/settingsDialog';
import { renderWelcome } from './ui/welcome';
import { ExplorerView } from './ui/explorer';
import { openHelp } from './ui/help';
import { showMenu } from './ui/dialogs';
import { SAMPLES } from './samples';

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
  private lastNote: string | null = null;
  recent: string[] = [];

  // Karkaso elementai
  shell!: HTMLElement;
  left!: HTMLElement;
  right!: HTMLElement;
  center!: HTMLElement;

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
    this.applySettings();
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
      onMoveTo: (p) => this.moveToPicker(p),
      onUpload: (dir) => this.upload(dir),
      onFilesDropped: (dir, files) => this.upload(dir, files),
      onExpandedChange: () => this.persist(),
    });
    this.ws = new Workspace(this);

    // ---- Kairė ikonų juosta (kaip Obsidian „ribbon“) ----
    const rb = (ic: string, title: string, fn: () => void, cls = '') =>
      h('button', { class: 'ribbon-btn ' + cls, title, 'aria-label': title, html: icon(ic, 18), onclick: fn });
    const ribbon = h(
      'nav',
      { class: 'ribbon', 'aria-label': 'Pagrindiniai veiksmai' },
      rb('panel-left', 'Rodyti / slėpti šoninį skydelį', () => this.toggleSide('left'), 'ribbon-toggle'),
      h('div', { class: 'ribbon-group' },
        rb('home', 'Failų naršyklė (Alt+E)', () => this.openExplorer()),
        rb('graph', 'Grafo vaizdas (Ctrl+G)', () => this.openGraph()),
        rb('search', 'Greitai atidaryti užrašą (Ctrl+O)', () => this.quickSwitcher()),
        rb('calendar', 'Šiandienos dienos užrašas (Alt+D)', () => this.openDaily()),
        rb('file-plus', 'Naujas užrašas (Alt+N)', () => this.newNote(this.currentDir())),
        rb('upload', 'Įkelti failus iš kompiuterio', () => this.upload(this.currentDir())),
        rb('command', 'Komandų paletė (Ctrl+P)', () => this.commandPalette()),
      ),
      h('div', { class: 'ribbon-spacer' }),
      h('div', { class: 'ribbon-logo', html: LOGO, title: 'ADAM' }),
    );

    // ---- Kairysis skydelis: perjungiklis, turinys, vault juosta ----
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
    const vaultBtn = h(
      'button',
      { class: 'vault-switch', title: 'Vault veiksmai' },
      h('span', { html: icon('chevrons-up-down', 14) }),
      h('span', { class: 'vault-title' }, vault.name),
    );
    vaultBtn.onclick = () => {
      const r = vaultBtn.getBoundingClientRect();
      showMenu(r.left, r.top - 8 - 4 * 30, [
        { label: 'Atidaryti kitą vault…', icon: 'vault', action: () => this.switchVault() },
        { label: 'Eksportuoti .zip', icon: 'download', action: () => this.exportZip() },
        { label: 'Importuoti .zip', icon: 'upload', action: () => this.importZip() },
        { label: 'Perskaityti iš naujo', icon: 'refresh', action: () => this.reloadVault() },
      ]);
    };
    const vaultBar = h(
      'div',
      { class: 'vault-bar' },
      vaultBtn,
      h('button', { class: 'icon-btn', title: 'Pagalba', 'aria-label': 'Pagalba', html: icon('help', 16), onclick: () => this.openHelpDialog() }),
      h('button', { class: 'icon-btn', title: 'Nustatymai (Ctrl+,)', 'aria-label': 'Nustatymai', html: icon('settings', 16), onclick: () => this.openSettingsDialog() }),
    );
    this.left = h('aside', { class: 'sidebar sidebar-left' }, this.leftSwitch, this.leftHost, vaultBar);
    this.showLeftPanel('files');

    this.backlinks = new BacklinksPanel(
      this.index,
      (p, newTab, line) => this.openPath(p, newTab, line),
      (t) => this.openLink(t),
    );
    this.right = h('aside', { class: 'sidebar sidebar-right' }, this.backlinks.el);
    this.center = h(
      'main',
      { class: 'workspace' },
      this.ws.el,
      h('button', { class: 'icon-btn right-toggle', title: 'Nuorodų skydelis', 'aria-label': 'Nuorodų skydelis', html: icon('panel-right', 16), onclick: () => this.toggleSide('right') }),
    );
    const backdrop = h('div', { class: 'backdrop', onclick: () => this.closeDrawers() });

    // ---- Telefono viršutinė juosta (kompiuteryje paslėpta) ----
    const tb = (ic: string, title: string, fn: () => void) => h('button', { class: 'icon-btn', title, 'aria-label': title, html: icon(ic, 18), onclick: fn });
    const mobileBar = h(
      'header',
      { class: 'topbar' },
      tb('menu', 'Failai', () => this.toggleSide('left')),
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', html: LOGO }), h('span', { class: 'brand-name' }, 'ADAM')),
      h('div', { class: 'topbar-spacer' }),
      tb('home', 'Failų naršyklė', () => this.openExplorer()),
      tb('search', 'Greitai atidaryti', () => this.quickSwitcher()),
      tb('graph', 'Grafas', () => this.openGraph()),
      tb('command', 'Komandos', () => this.commandPalette()),
      tb('panel-right', 'Nuorodos', () => this.toggleSide('right')),
    );

    this.shell = h('div', { class: 'shell' }, mobileBar, h('div', { class: 'body' }, ribbon, this.left, this.center, this.right, backdrop));
    this.root.append(this.shell);
    this.tree.render();
  }

  /** Aplankas, kuriame dabar „esame“ (naršyklės aplankas arba aktyvaus užrašo aplankas). */
  currentDir(): string {
    const t = this.ws?.activePane.active;
    if (t?.loc.kind === 'files') return t.loc.dir;
    if (t?.loc.kind === 'note' || t?.loc.kind === 'image') return dirname(t.loc.path);
    return '';
  }

  openExplorer(dir = '') {
    for (const p of this.ws.panes) {
      const t = p.tabs.find((x) => x.loc.kind === 'files');
      if (t) {
        this.ws.setActivePane(p);
        p.activate(t);
        if (t.loc.kind === 'files' && t.loc.dir !== dir) p.open({ kind: 'files', dir });
        this.closeDrawers();
        return;
      }
    }
    this.ws.open({ kind: 'files', dir }, { newTab: true });
    this.closeDrawers();
  }

  createExplorer(dir: string, nav: { navigate(dir: string): void; back(): void; forward(): void; canBack(): boolean; canForward(): boolean }) {
    const ex = new ExplorerView(
      {
        vault: this.vault,
        open: (p, newTab) => this.openFromExplorer(p, newTab),
        navigate: (d) => nav.navigate(d),
        back: () => nav.back(),
        forward: () => nav.forward(),
        canBack: () => nav.canBack(),
        canForward: () => nav.canForward(),
        recent: () => this.recent,
        upload: (d, files) => this.upload(d, files),
        newNote: (d) => this.newNote(d),
        newFolder: (d) => this.vault.createFolder(d),
        moveTo: (p) => this.moveToPicker(p),
        renderWelcome: () => this.renderWelcomeScreen(),
      },
      dir,
    );
    return { el: ex.el, destroy: () => ex.destroy() };
  }

  /** Iš naršyklės failai atidaromi atskirame skirtuke – pati naršyklė lieka atidaryta. */
  openFromExplorer(path: string, newTab = false) {
    const kind = isImage(path) ? 'image' : 'note';
    for (const p of this.ws.panes) {
      const t = p.tabs.find((x) => (x.loc.kind === 'note' || x.loc.kind === 'image') && x.loc.path === path);
      if (t && !newTab) {
        this.ws.setActivePane(p);
        p.activate(t);
        return;
      }
    }
    this.ws.open(kind === 'image' ? { kind: 'image', path } : { kind: 'note', path }, { newTab: true });
    this.closeDrawers();
  }

  /** Įkelia failus iš kompiuterio: .md/.markdown/.txt kaip užrašus, paveikslėlius kaip priedus. */
  async upload(dir: string, files?: File[]) {
    files ??= await pickFiles('.md,.markdown,.txt,image/*');
    if (!files.length) return;
    let ok = 0;
    const skipped: string[] = [];
    let last = '';
    for (const f of files) {
      const ext = extname(f.name);
      const base = (ext ? f.name.slice(0, -ext.length) : f.name).replace(/[\\/:*?"<>|#^[\]]/g, '-') || 'Failas';
      try {
        if (f.type.startsWith('image/') || isImage(f.name)) {
          const p = this.vault.uniquePath(dir, base, ext || '.png');
          await this.vault.writeAsset(p, new Uint8Array(await f.arrayBuffer()));
          last = p;
          ok++;
        } else if (['.md', '.markdown', '.txt'].includes(ext) || f.type.startsWith('text/')) {
          const p = this.vault.uniquePath(dir, base, '.md');
          await this.vault.write(p, await f.text());
          last = p;
          ok++;
        } else skipped.push(f.name);
      } catch (e) {
        toast(`Nepavyko įkelti „${f.name}“: ${(e as Error).message}`, 'error');
      }
    }
    if (ok) toast(ok === 1 ? `Įkelta: ${last.split('/').pop()}` : `Įkelta failų: ${ok}`);
    if (skipped.length) toast(`Praleista (nepalaikomas tipas): ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}`, 'error');
    if (ok === 1 && files.length === 1) this.openPath(last);
  }

  openHelpDialog() {
    openHelp({
      vaultKind: this.vault.adapter.kind,
      vaultName: this.vault.name,
      onExplorer: () => this.openExplorer(),
      onUpload: () => this.upload(this.currentDir()),
      onSamples: () => this.createSamples(),
    });
  }

  private restoreState(s: WorkspaceState) {
    this.tree.expanded = new Set(s.expanded ?? []);
    if (s.leftPanel) this.showLeftPanel(s.leftPanel as LeftPanel);
    if (!isMobile()) {
      this.shell.classList.toggle('left-collapsed', !!s.leftCollapsed);
      this.shell.classList.toggle('right-collapsed', !!s.rightCollapsed);
    }
    this.recent = (s.recent ?? []).filter((p) => this.vault.has(p) || this.vault.hasAsset(p));
    this.ws.restore(s);
    // Pirmą kartą (ar uždarius visus skirtukus) – atidarome failų naršyklę.
    if (this.ws.panes.every((p) => !p.tabs.length)) this.ws.open({ kind: 'files', dir: '' }, { newTab: true });
    this.tree.render();
  }

  // ---------- WorkspaceHost ----------

  renderMarkdown(src: string): string {
    return this.renderer.render(src);
  }

  resolveImage = async (src: string, fromPath?: string): Promise<string | null> => {
    const p = this.vault.findAsset(src, fromPath);
    return p ? this.vault.assetUrl(p) : null;
  };

  assetUrl = (path: string) => this.vault.assetUrl(path);

  /** Įklijuoti / įtempti paveikslėliai išsaugomi priedų aplanke ir įterpiami kaip ![[...]]. */
  private async saveImages(files: File[], view: EditorView, pos: number) {
    const inserts: string[] = [];
    for (const f of files) {
      const ext = extname(f.name) || '.' + (f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const base = f.name && !/^image\.\w+$/.test(f.name) ? f.name.slice(0, f.name.length - extname(f.name).length) : `Paveikslėlis ${stamp}`;
      const path = this.vault.uniquePath(this.settings.attachmentFolder, base.replace(/[\\/:*?"<>|#^[\]]/g, '-'), ext);
      await this.vault.writeAsset(path, new Uint8Array(await f.arrayBuffer()));
      inserts.push(`![[${path.split('/').pop()}]]`);
    }
    if (inserts.length) {
      view.dispatch({ changes: { from: pos, insert: inserts.join('\n') }, selection: { anchor: pos + inserts.join('\n').length } });
      toast(inserts.length > 1 ? `Įterpta paveikslėlių: ${inserts.length}` : 'Paveikslėlis įterptas');
    }
  }

  editorExtensions(_view: NoteView): Extension[] {
    const images = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
    const imageHandlers = EditorView.domEventHandlers({
      paste: (e, view) => {
        const files = images(e.clipboardData?.files);
        if (!files.length) return false;
        e.preventDefault();
        this.saveImages(files, view, view.state.selection.main.head);
        return true;
      },
      drop: (e, view) => {
        const files = images(e.dataTransfer?.files);
        if (!files.length) return false;
        e.preventDefault();
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
        this.saveImages(files, view, pos);
        return true;
      },
    });
    return [imageHandlers, ...wikiLinkExtensions({
      notes: () => this.vault.notes(),
      tags: () => this.index.tags().map((t) => t.tag),
      exists: (t) => !!this.index.resolve(t),
      open: (t, newTab) => this.openLink(t, { newTab }),
      openTag: (t) => this.onTagClick(t),
    })];
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
    const lastNote = () => (this.lastNote && this.vault.has(this.lastNote) ? this.lastNote : null);
    const el = h('div', { class: 'graph-view graph-loading' }, h('div', { class: 'loader' }));
    let gv: import('./graph/graphView').GraphView | null = null;
    let dead = false;
    const opts = {
      getData: () => this.index.graph(),
      getActive: lastNote,
      onOpen: (id: string, newTab: boolean) => {
        if (id.startsWith('missing:')) {
          const node = this.index.graph().nodes.find((n) => n.id === id);
          if (node) this.openLink(node.label, { newTab });
        } else this.openPath(id, newTab);
      },
      onBack: () => nav.back(),
      canBack: () => nav.canBack(),
      subscribe: (cb: () => void) => this.index.on('updated', debounce(cb, 300)),
      initialMode: this.settings.graphMode,
    };
    loadGraph().then(({ GraphView }) => {
      if (dead) return;
      gv = new GraphView(opts);
      el.replaceWith(gv.el);
    });
    return {
      get el() {
        return gv?.el ?? el;
      },
      destroy: () => {
        dead = true;
        gv?.destroy();
        el.remove();
      },
      refresh: () => gv?.refresh(),
      focus: (p: string | null) => gv?.focus(p),
    };
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

  /** Aplanko pasirinkimas perkėlimui – veikia ir telefone, kur tempimas neveikia. */
  moveToPicker(path: string) {
    const isFolder = this.vault.hasFolder(path) && path !== '';
    const current = dirname(path);
    const name = isFolder ? path.split('/').pop()! : noteName(path);
    const targets = ['', ...this.vault.folders()].filter(
      (f) => f !== current && !(isFolder && (f === path || f.startsWith(path + '/'))),
    );
    openPicker({
      placeholder: `Perkelti „${name}“ į aplanką…`,
      footer: '<kbd>↑↓</kbd> pasirinkti <kbd>Enter</kbd> perkelti <kbd>Esc</kbd> atšaukti',
      items: (q) =>
        targets
          .map((f) => ({ f, label: f || '/ (vault šaknis)', r: fuzzy(q, f || '/') }))
          .filter((x) => x.r)
          .sort((a, b) => (q ? b.r!.score - a.r!.score : 0))
          .map((x) => ({ id: x.f, html: x.f ? highlight(x.f, x.r!.indices, escapeHtml) : escapeHtml(x.label), icon: 'folder' })),
      onPick: async (it) => {
        try {
          await this.vault.move(path, it.id);
          toast(`Perkelta į „${it.id || 'šaknį'}“`);
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      },
      empty: 'Kitų aplankų nėra. Sukurkite aplanką failų medyje.',
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
      { id: 'explorer', name: 'Failų naršyklė', icon: 'home', hotkey: 'Alt+E', run: () => this.openExplorer() },
      { id: 'upload', name: 'Įkelti failus iš kompiuterio…', icon: 'upload', run: () => this.upload(this.currentDir()) },
      { id: 'help', name: 'Pagalba: kaip naudotis', icon: 'help', run: () => this.openHelpDialog() },
      { id: 'graph', name: 'Atidaryti grafo vaizdą', icon: 'graph', hotkey: 'Ctrl+G', run: () => this.openGraph() },
      { id: 'tags', name: 'Rodyti žymas', icon: 'hash', run: () => this.showLeftPanel('tags', true) },
      { id: 'files', name: 'Rodyti failų medį', icon: 'folder', run: () => this.showLeftPanel('files', true) },
      { id: 'left', name: 'Rodyti / slėpti kairįjį skydelį', icon: 'panel-left', run: () => this.toggleSide('left') },
      { id: 'right', name: 'Rodyti / slėpti nuorodų skydelį', icon: 'panel-right', run: () => this.toggleSide('right') },
      { id: 'back', name: 'Atgal', icon: 'arrow-left', hotkey: 'Alt+←', run: () => ws.activePane.back() },
      { id: 'forward', name: 'Pirmyn', icon: 'arrow-right', hotkey: 'Alt+→', run: () => ws.activePane.forward() },
      { id: 'tab.close', name: 'Uždaryti skirtuką', icon: 'x', hotkey: 'Alt+W', run: () => ws.activePane.active && ws.activePane.closeTab(ws.activePane.active) },
      { id: 'note.move', name: 'Perkelti užrašą į kitą aplanką…', icon: 'folder-open', run: () => { const p = this.ws.activePath(); if (p) this.moveToPicker(p); } },
      { id: 'note.rename', name: 'Pervadinti užrašą', icon: 'edit', hotkey: 'F2', run: () => this.renameActive() },
      { id: 'vault.reload', name: 'Perskaityti vault iš naujo', icon: 'refresh', run: () => this.reloadVault() },
      { id: 'vault.switch', name: 'Keisti vault', icon: 'vault', run: () => this.switchVault() },
      ...this.extraCommands(),
    ];
  }

  private applySettings() {
    document.documentElement.style.setProperty('--editor-font-size', (this.settings.fontSize || 15) + 'px');
  }

  async openSettingsDialog() {
    const next = await openSettings(this.settings, this.vault.folders());
    if (!next) return;
    this.settings = Object.assign(this.settings, next); // tas pats objektas – jį naudoja atidaryti redaktoriai
    this.applySettings();
    await this.vault.writeJSON('settings.json', this.settings);
    toast('Nustatymai išsaugoti');
  }

  /** Vėlesnių etapų komandos. */
  protected extraCommands(): Command[] {
    return [
      { id: 'settings', name: 'Nustatymai', icon: 'settings', hotkey: 'Ctrl+,', run: () => this.openSettingsDialog() },
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
      await this.vault.write(path, fillTemplate(this.settings.dailyTemplate ?? DEFAULT_SETTINGS.dailyTemplate));
      toast('Sukurtas šiandienos užrašas');
    }
    this.openPath(path);
  }

  async createSamples(open = SAMPLES[0].name) {
    for (const s of SAMPLES) {
      const p = s.name + '.md';
      if (!this.vault.has(p)) await this.vault.write(p, s.body + '\n');
    }
    toast('Sukurti pavyzdiniai užrašai');
    this.openPath(open + '.md');
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
      const { exportVault } = await loadZip();
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
      const { readZip, importEntries } = await loadZip();
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
    if (p) this.lastNote = p;
    const at = this.ws.activePane.active?.loc;
    const opened = at && (at.kind === 'note' || at.kind === 'image') ? at.path : null;
    if (opened && this.recent[0] !== opened) {
      this.recent = [opened, ...this.recent.filter((x) => x !== opened)].slice(0, 30);
      this.persist();
    }
    this.tree.setActive(p);
    this.backlinks.setPath(p);
    if (p) this.ws.panes.forEach((x) => x.focusGraph(p));
    document.title = p ? `${p.split('/').pop()!.replace(/\.md$/, '')} – ADAM` : 'ADAM';
  }

  persist = debounce(() => {
    if (!this.ready) return;
    const state: WorkspaceState = {
      ...this.ws.serialize(),
      leftCollapsed: this.shell.classList.contains('left-collapsed'),
      rightCollapsed: this.shell.classList.contains('right-collapsed'),
      expanded: [...this.tree.expanded],
      leftPanel: this.leftPanel,
      recent: this.recent,
    };
    this.vault.writeJSON('workspace.json', state);
  }, 600);

  renderWelcomeScreen(): HTMLElement {
    return renderWelcome({
      createSamples: (open) => this.createSamples(open),
      newNote: () => this.newNote(),
      importZip: () => this.importZip(),
      openDaily: () => this.openDaily(),
      upload: () => this.upload(''),
    });
  }

  renderEmpty(): HTMLElement {
    if (this.vault.isEmpty()) return this.renderWelcomeScreen();
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
          h('button', { class: 'btn', onclick: () => this.openExplorer(), html: icon('home', 14) + 'Failų naršyklė' }),
          h('button', { class: 'btn', onclick: () => this.quickSwitcher(), html: icon('search', 14) + 'Atidaryti užrašą' }),
          h('button', { class: 'btn', onclick: () => this.openGraph(), html: icon('graph', 14) + 'Grafas' }),
        ),
        h(
          'div',
          { class: 'shortcuts' },
          ...[
            ['Ctrl+O', 'greitas perjungiklis'],
            ['Ctrl+P', 'komandų paletė'],
            ['Ctrl+Shift+F', 'paieška'],
            ['Alt+D', 'dienos užrašas'],
          ].map(([k, t]) => h('div', null, h('kbd', null, k), h('span', null, t))),
        ),
      ),
    );
  }

  // ---------- Veiksmai ----------

  openPath(path: string, newTab = false, line?: number) {
    // Jei aktyvi failų naršyklė – jos neperrašome, failas atsidaro šalia.
    if (!newTab && this.ws.activePane.active?.loc.kind === 'files') {
      this.openFromExplorer(path);
      if (line !== undefined) requestAnimationFrame(() => this.ws.activeNoteView()?.revealLine(line));
      return;
    }
    if (isImage(path)) {
      this.ws.open({ kind: 'image', path }, { newTab });
      this.closeDrawers();
      return;
    }
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
    if (e.altKey && !mod && e.code === 'KeyE') return run(() => this.openExplorer());
    if (e.altKey && !mod && e.code === 'KeyD') return run(() => this.openDaily());
    if (e.altKey && !mod && e.code === 'KeyT') return run(() => this.ws.open({ kind: 'empty' }, { newTab: true }));
    if (mod && e.code === 'Backslash') return run(() => this.toggleSplit());
    if (e.ctrlKey && e.key === 'Tab') return run(() => this.cycleTab(e.shiftKey ? -1 : 1));
    if (mod && e.key === ',') return run(() => this.openSettingsDialog());
    if (mod && !e.shiftKey && k === 'g') return run(() => this.openGraph());
    if (mod && !e.shiftKey && k === 'p') return run(() => this.commandPalette());
    if (e.altKey && !mod && e.code === 'KeyN') return run(() => this.newNote());
    if (e.altKey && !mod && e.code === 'KeyW') return run(() => this.commands().find((c) => c.id === 'tab.close')!.run());
    this.onExtraKey(e, mod, k, run);
  }

  /** Papildomos klavišų kombinacijos (pildoma vėlesniuose etapuose). */
  protected onExtraKey(_e: KeyboardEvent, _mod: boolean, _k: string, _run: (fn: () => void) => void) {}
}
