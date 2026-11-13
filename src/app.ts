import { Vault } from './core/vault';
import type { StorageAdapter } from './storage/adapter';
import { FsAdapter, fsAccessSupported } from './storage/fsAdapter';
import { IdbAdapter } from './storage/idbAdapter';
import { FileTree } from './ui/fileTree';
import { clear, h, isMobile } from './ui/dom';
import { icon } from './ui/icons';
import { renderLanding, LOGO } from './ui/landing';
import { toast } from './ui/dialogs';
import { noteName } from './core/paths';

const LAST_VAULT_KEY = 'frankenstein.lastVault';

/** Pagrindinis programos valdiklis: vault gyvavimo ciklas ir sąsajos karkasas. */
export class App {
  vault: Vault | null = null;
  tree!: FileTree;
  private landing: { el: HTMLElement; destroy(): void } | null = null;

  // Karkaso elementai
  shell!: HTMLElement;
  left!: HTMLElement;
  right!: HTMLElement;
  center!: HTMLElement;
  private vaultLabel!: HTMLElement;

  constructor(private root: HTMLElement) {}

  async boot() {
    const last = localStorage.getItem(LAST_VAULT_KEY);
    if (last === 'idb' || (last === 'fs' && !fsAccessSupported())) {
      await this.openAdapter(new IdbAdapter());
      return;
    }
    await this.showLanding();
  }

  async showLanding() {
    this.vault = null;
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
    this.buildShell();
    await this.onVaultReady();
  }

  /** Iškviečiama, kai vault užkrautas ir karkasas sukurtas. */
  protected async onVaultReady() {
    this.renderCenter();
  }

  private buildShell() {
    const vault = this.vault!;
    clear(this.root);
    this.tree = new FileTree(vault, {
      onOpen: (p, newTab) => this.openNote(p, newTab),
    });

    this.vaultLabel = h('button', { class: 'vault-name', title: 'Keisti vault', onclick: () => this.switchVault() },
      h('span', { class: 'vault-kind', html: icon(vault.adapter.kind === 'fs' ? 'folder' : 'vault', 14) }),
      h('span', null, vault.name),
    );

    const topbar = h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn only-mobile', title: 'Failai', html: icon('menu', 18), onclick: () => this.toggleSide('left') }),
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', html: LOGO }), h('span', { class: 'brand-name' }, 'Frankenstein')),
      this.vaultLabel,
      h('div', { class: 'topbar-spacer' }),
      h('div', { class: 'topbar-actions' }),
      h('button', { class: 'icon-btn', title: 'Kairysis skydelis', html: icon('panel-left', 18), onclick: () => this.toggleSide('left'), 'data-desktop': '' }),
      h('button', { class: 'icon-btn', title: 'Dešinysis skydelis', html: icon('panel-right', 18), onclick: () => this.toggleSide('right') }),
    );

    this.left = h('aside', { class: 'sidebar sidebar-left' }, this.tree.el);
    this.right = h('aside', { class: 'sidebar sidebar-right' }, h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Atgalinės nuorodos'))));
    this.center = h('main', { class: 'workspace' });
    const backdrop = h('div', { class: 'backdrop', onclick: () => this.closeDrawers() });

    this.shell = h('div', { class: 'shell' }, topbar, h('div', { class: 'body' }, this.left, this.center, this.right, backdrop));
    this.root.append(this.shell);
    this.tree.render();
    if (isMobile()) this.shell.classList.add('right-collapsed');
  }

  toggleSide(side: 'left' | 'right') {
    if (isMobile()) {
      const cls = `${side}-open`;
      const open = !this.shell.classList.contains(cls);
      this.closeDrawers();
      this.shell.classList.toggle(cls, open);
    } else {
      this.shell.classList.toggle(`${side}-collapsed`);
    }
  }

  closeDrawers() {
    this.shell?.classList.remove('left-open', 'right-open');
  }

  async switchVault() {
    localStorage.removeItem(LAST_VAULT_KEY);
    await this.showLanding();
  }

  // ---- 1 etapas: paprasta peržiūra (vėliau pakeičiama redaktoriumi) ----
  private current: string | null = null;

  openNote(path: string, _newTab = false) {
    this.current = path;
    this.tree.setActive(path);
    this.closeDrawers();
    this.renderCenter();
  }

  private renderCenter() {
    clear(this.center);
    if (!this.current || !this.vault?.has(this.current)) {
      this.center.append(h('div', { class: 'empty-state' }, h('p', null, 'Pasirinkite užrašą kairėje.')));
      return;
    }
    this.center.append(
      h('div', { class: 'note-view' }, h('h1', null, noteName(this.current)), h('pre', null, this.vault.read(this.current))),
    );
  }
}
