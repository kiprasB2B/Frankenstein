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
      onExpandedChange: () => this.persist(),
    });
    this.ws = new Workspace(this);

    const vaultLabel = h(
      'button',
      { class: 'vault-name', title: 'Keisti vault', onclick: () => this.switchVault() },
      h('span', { class: 'vault-kind', html: icon(vault.adapter.kind === 'fs' ? 'folder' : 'vault', 14) }),
      h('span', null, vault.name),
    );
    this.topActions = h('div', { class: 'topbar-actions' });
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

    this.left = h('aside', { class: 'sidebar sidebar-left' }, this.tree.el);
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

  onTagClick(_tag: string) {}

  onActiveChange() {
    if (!this.ready) return;
    const p = this.ws.activePath();
    this.tree.setActive(p);
    this.backlinks.setPath(p);
    document.title = p ? `${p.split('/').pop()!.replace(/\.md$/, '')} – Frankenstein` : 'Frankenstein';
  }

  persist = debounce(() => {
    if (!this.ready) return;
    const state: WorkspaceState = {
      ...this.ws.serialize(),
      leftCollapsed: this.shell.classList.contains('left-collapsed'),
      rightCollapsed: this.shell.classList.contains('right-collapsed'),
      expanded: [...this.tree.expanded],
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
    this.onExtraKey(e, mod, k, run);
  }

  /** Papildomos klavišų kombinacijos (pildoma vėlesniuose etapuose). */
  protected onExtraKey(_e: KeyboardEvent, _mod: boolean, _k: string, _run: (fn: () => void) => void) {}
}
