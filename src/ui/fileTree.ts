import type { Vault } from '../core/vault';
import { basename, dirname, isInside, noteName } from '../core/paths';
import { clear, h } from './dom';
import { icon, iconEl } from './icons';
import { confirmDialog, showMenu, toast } from './dialogs';

export interface FileTreeOptions {
  onOpen(path: string, newTab: boolean): void;
  onExpandedChange?(expanded: string[]): void;
  onOpenSplit?(path: string): void;
  onMoveTo?(path: string): void;
}

interface Node {
  path: string;
  name: string;
  kind: 'file' | 'folder';
  children: Node[];
}

/** Failų medis kairiame skydelyje: atidarymas, kūrimas, pervadinimas, trynimas, drag & drop. */
export class FileTree {
  readonly el: HTMLElement;
  private list: HTMLElement;
  expanded = new Set<string>();
  active: string | null = null;
  private dragPath: string | null = null;
  private renaming: string | null = null;
  private rendering = false;

  constructor(
    private vault: Vault,
    private opts: FileTreeOptions,
  ) {
    this.list = h('div', { class: 'tree', role: 'tree' });
    this.el = h(
      'div',
      { class: 'panel panel-files' },
      h(
        'div',
        { class: 'panel-head' },
        h('span', { class: 'panel-title' }, 'Failai'),
        h(
          'div',
          { class: 'panel-actions' },
          this.actionBtn('file-plus', 'Naujas užrašas', () => this.newNote('')),
          this.actionBtn('folder-plus', 'Naujas aplankas', () => this.newFolder('')),
          this.actionBtn('chevron-down', 'Suskleisti viską', () => {
            this.expanded.clear();
            this.changed();
          }),
        ),
      ),
      this.list,
    );
    this.setupRootDrop();
    vault.on('change', () => this.render());
    vault.on('reload', () => this.render());
  }

  private actionBtn(ic: string, title: string, fn: () => void) {
    return h('button', { class: 'icon-btn', title, 'aria-label': title, html: icon(ic), onclick: fn });
  }

  private changed() {
    this.opts.onExpandedChange?.([...this.expanded]);
    this.render();
  }

  setActive(path: string | null) {
    this.active = path;
    if (path) {
      // Išskleidžiame aktyvaus failo tėvinius aplankus.
      let d = dirname(path);
      while (d) {
        this.expanded.add(d);
        d = dirname(d);
      }
    }
    this.render();
  }

  private buildTree(): Node {
    const root: Node = { path: '', name: '', kind: 'folder', children: [] };
    const folders = new Map<string, Node>([['', root]]);
    const getFolder = (p: string): Node => {
      let n = folders.get(p);
      if (!n) {
        n = { path: p, name: basename(p), kind: 'folder', children: [] };
        folders.set(p, n);
        getFolder(dirname(p)).children.push(n);
      }
      return n;
    };
    this.vault.folders().forEach(getFolder);
    for (const f of this.vault.notes()) {
      getFolder(dirname(f)).children.push({ path: f, name: noteName(f), kind: 'file', children: [] });
    }
    const sort = (n: Node) => {
      n.children.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'folder' ? -1 : 1) : a.name.localeCompare(b.name, 'lt')));
      n.children.forEach(sort);
    };
    sort(root);
    return root;
  }

  render() {
    this.rendering = true;
    try {
      this.renderInner();
    } finally {
      this.rendering = false;
    }
  }

  private renderInner() {
    clear(this.list);
    const root = this.buildTree();
    if (!root.children.length) {
      this.list.append(h('div', { class: 'empty-hint' }, 'Vault tuščias. Sukurkite pirmą užrašą.'));
      return;
    }
    const renderNode = (n: Node, depth: number, parent: HTMLElement) => {
      const row = this.row(n, depth);
      parent.append(row);
      if (n.kind === 'folder') {
        const open = this.expanded.has(n.path);
        const kids = h('div', { class: 'tree-children' + (open ? ' open' : ''), role: 'group' });
        if (open) n.children.forEach((c) => renderNode(c, depth + 1, kids));
        parent.append(kids);
      }
    };
    root.children.forEach((c) => renderNode(c, 0, this.list));
  }

  private row(n: Node, depth: number): HTMLElement {
    const isFolder = n.kind === 'folder';
    const open = this.expanded.has(n.path);
    const label: HTMLElement =
      this.renaming === n.path ? this.renameInput(n) : h('span', { class: 'tree-label' }, n.name);
    const row = h(
      'div',
      {
        class:
          'tree-row ' +
          (isFolder ? 'is-folder' : 'is-file') +
          (this.active === n.path ? ' active' : '') +
          (isFolder && this.active && isInside(this.active, n.path) ? ' has-active' : ''),
        role: 'treeitem',
        tabindex: 0,
        draggable: this.renaming !== n.path,
        style: `--depth:${depth}`,
        title: n.path,
        'data-path': n.path,
      },
      isFolder ? h('span', { class: 'tree-chevron' + (open ? ' open' : ''), html: icon('chevron-right', 12) }) : h('span', { class: 'tree-dot' }),
      iconEl(isFolder ? (open ? 'folder-open' : 'folder') : 'file', 14),
      label,
      h('button', {
        class: 'icon-btn tree-more',
        title: 'Veiksmai',
        html: icon('more', 14),
        onclick: (e: MouseEvent) => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          this.menu(n, r.left, r.bottom + 4);
        },
      }),
    );
    row.addEventListener('click', (e) => {
      if (this.renaming === n.path) return;
      if (isFolder) {
        if (open) this.expanded.delete(n.path);
        else this.expanded.add(n.path);
        this.changed();
      } else this.opts.onOpen(n.path, e.ctrlKey || e.metaKey);
    });
    row.addEventListener('auxclick', (e) => {
      if (e.button === 1 && !isFolder) this.opts.onOpen(n.path, true);
    });
    row.addEventListener('keydown', (e) => {
      if (e.target !== row) return;
      if (e.key === 'Enter') row.click();
      if (e.key === 'F2') this.startRename(n.path);
      if (e.key === 'Delete') this.remove(n);
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.menu(n, e.clientX, e.clientY);
    });
    // Drag & drop
    row.addEventListener('dragstart', (e) => {
      this.dragPath = n.path;
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('text/plain', n.path);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      this.dragPath = null;
      row.classList.remove('dragging');
      this.list.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
    });
    const targetDir = isFolder ? n.path : dirname(n.path);
    row.addEventListener('dragover', (e) => {
      if (!this.dragPath || !this.canDrop(this.dragPath, targetDir)) return;
      e.preventDefault();
      e.stopPropagation();
      this.list.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
      (isFolder ? row : (row.parentElement?.previousElementSibling as HTMLElement | null) ?? this.list)?.classList.add('drop-target');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.dragPath) this.drop(this.dragPath, targetDir);
    });
    return row;
  }

  private canDrop(src: string, dir: string) {
    if (dirname(src) === dir) return false;
    return !isInside(dir, src);
  }

  private setupRootDrop() {
    this.list.addEventListener('dragover', (e) => {
      if (!this.dragPath || !this.canDrop(this.dragPath, '')) return;
      e.preventDefault();
      this.list.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
      this.list.classList.add('drop-target');
    });
    this.list.addEventListener('dragleave', (e) => {
      if (e.target === this.list) this.list.classList.remove('drop-target');
    });
    this.list.addEventListener('drop', (e) => {
      e.preventDefault();
      this.list.classList.remove('drop-target');
      if (this.dragPath) this.drop(this.dragPath, '');
    });
  }

  private async drop(src: string, dir: string) {
    this.list.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
    this.dragPath = null;
    if (!this.canDrop(src, dir)) return;
    try {
      await this.vault.move(src, dir);
      if (dir) this.expanded.add(dir);
      this.changed();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  private menu(n: Node, x: number, y: number) {
    const dir = n.kind === 'folder' ? n.path : dirname(n.path);
    showMenu(x, y, [
      ...(n.kind === 'file'
        ? [
            { label: 'Atidaryti naujame skirtuke', icon: 'file', action: () => this.opts.onOpen(n.path, true) },
            { label: 'Atidaryti padalintame ekrane', icon: 'split', action: () => this.opts.onOpenSplit?.(n.path) },
            'sep' as const,
          ]
        : []),
      { label: 'Naujas užrašas', icon: 'file-plus', action: () => this.newNote(dir) },
      { label: 'Naujas aplankas', icon: 'folder-plus', action: () => this.newFolder(dir) },
      'sep',
      { label: 'Pervadinti', icon: 'edit', action: () => this.startRename(n.path) },
      { label: 'Perkelti į…', icon: 'folder-open', action: () => this.opts.onMoveTo?.(n.path) },
      { label: 'Ištrinti', icon: 'trash', danger: true, action: () => this.remove(n) },
    ]);
  }

  async newNote(dir: string) {
    const p = await this.vault.createNote(dir);
    if (dir) this.expanded.add(dir);
    this.opts.onOpen(p, false);
    this.startRename(p);
  }

  async newFolder(dir: string) {
    const p = await this.vault.createFolder(dir);
    if (dir) this.expanded.add(dir);
    this.startRename(p);
  }

  startRename(path: string) {
    this.renaming = path;
    this.render();
    const input = this.list.querySelector<HTMLInputElement>('.tree-rename');
    input?.focus();
    input?.select();
  }

  private renameInput(n: Node): HTMLInputElement {
    const input = h('input', { class: 'tree-rename', value: n.name, spellcheck: false });
    let done = false;
    const finish = async (commit: boolean) => {
      if (done) return;
      done = true;
      this.renaming = null;
      const v = input.value.trim();
      if (commit && v && v !== n.name) {
        try {
          const np = await this.vault.rename(n.path, v);
          if (this.active === n.path) this.active = np;
        } catch (err) {
          toast((err as Error).message, 'error');
        }
      }
      this.render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => !this.rendering && finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
    return input;
  }

  private async remove(n: Node) {
    const ok = await confirmDialog(
      n.kind === 'folder' ? 'Ištrinti aplanką?' : 'Ištrinti užrašą?',
      n.kind === 'folder' ? `„${n.name}“ ir visas jo turinys bus ištrintas negrįžtamai.` : `„${n.name}“ bus ištrintas negrįžtamai.`,
      'Ištrinti',
      true,
    );
    if (!ok) return;
    try {
      await this.vault.delete(n.path);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }
}
