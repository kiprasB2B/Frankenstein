import type { Vault } from '../core/vault';
import { basename, dirname, extname, isImage, isInside, noteName } from '../core/paths';
import { clear, escapeHtml, h, isMobile } from './dom';
import { icon } from './icons';
import { confirmDialog, promptDialog, showMenu, toast } from './dialogs';

// Failų naršyklė „Windows Explorer“ principu: adreso eilutė, įrankių juosta,
// „Neseniai atidaryti“ kortelės, failų sąrašas su datomis ir būsenos juosta.

export interface ExplorerHost {
  vault: Vault;
  open(path: string, newTab: boolean): void;
  navigate(dir: string): void;
  back(): void;
  forward(): void;
  canBack(): boolean;
  canForward(): boolean;
  recent(): string[];
  upload(dir: string, files?: File[]): Promise<void>;
  newNote(dir: string): void;
  newFolder(dir: string): Promise<string>;
  moveTo(path: string): void;
  renderWelcome(): HTMLElement;
  stats?(): VaultStats;
  search?(query: string): void;
  openGraph?(): void;
}

export interface VaultStats {
  storage: string;
  notes: number;
  assets: number;
  folders: number;
  links: number;
  tags: number;
  tasksDone: number;
  tasksOpen: number;
  broken: number;
  orphans: number;
}

interface Item {
  path: string;
  name: string;
  kind: 'folder' | 'note' | 'image';
  mtime: number;
  size: number;
}

type SortKey = 'name' | 'mtime' | 'type' | 'size';
const LS = 'adam.explorer';

function loadPrefs(): { view: 'list' | 'grid'; sort: SortKey; dir: 1 | -1; recentOpen: boolean } {
  try {
    return { view: 'list', sort: 'name', dir: 1, recentOpen: true, ...JSON.parse(localStorage.getItem(LS) ?? '{}') };
  } catch {
    return { view: 'list', sort: 'name', dir: 1, recentOpen: true };
  }
}

const fmtDate = (t: number) =>
  t
    ? new Date(t).toLocaleString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const typeName = (it: Item) =>
  it.kind === 'folder' ? 'Aplankas' : it.kind === 'note' ? 'Užrašas (.md)' : `Paveikslėlis (${extname(it.path).slice(1).toUpperCase()})`;
const typeIcon = (it: Item) => (it.kind === 'folder' ? 'folder' : it.kind === 'image' ? 'image' : 'file');

export class ExplorerView {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private status: HTMLElement;
  private searchInput: HTMLInputElement;
  private selected = new Set<string>();
  private prefs = loadPrefs();
  private unsub: () => void;
  private items: Item[] = [];

  constructor(
    private host: ExplorerHost,
    private dir: string,
  ) {
    this.searchInput = h('input', { class: 'ex-search-input', type: 'search', placeholder: 'Ieškoti vault…', spellcheck: false });
    this.searchInput.addEventListener('input', () => this.renderBody());
    this.body = h('div', { class: 'ex-body', tabindex: 0 });
    this.status = h('div', { class: 'ex-status' });
    this.el = h('div', { class: 'explorer' }, this.navBar(), this.toolBar(), this.body, this.status);
    this.bindBody();
    const rerender = () => {
      if (!this.host.vault.hasFolder(this.dir)) this.dir = '';
      this.renderBody();
    };
    const u1 = host.vault.on('change', rerender);
    const u2 = host.vault.on('reload', rerender);
    this.unsub = () => (u1(), u2());
    this.renderBody();
  }

  private savePrefs() {
    try {
      localStorage.setItem(LS, JSON.stringify(this.prefs));
    } catch {
      /* nesvarbu */
    }
  }

  // ---------- Viršutinės juostos ----------

  private btn(ic: string, title: string, fn: () => void, label?: string, cls = '') {
    return h('button', { class: 'ex-btn ' + cls, title, 'aria-label': title, html: icon(ic, 16) + (label ? `<span>${label}</span>` : ''), onclick: fn });
  }

  private navBar() {
    const crumbs = h('div', { class: 'ex-crumbs' });
    const segs = this.dir ? this.dir.split('/') : [];
    crumbs.append(
      h('button', { class: 'ex-crumb home', html: icon('home', 15) + `<span>${escapeHtml(this.host.vault.name)}</span>`, onclick: () => this.host.navigate('') }),
    );
    segs.forEach((seg, i) => {
      crumbs.append(h('span', { class: 'ex-sep', html: icon('chevron-right', 12) }));
      const target = segs.slice(0, i + 1).join('/');
      crumbs.append(h('button', { class: 'ex-crumb' + (i === segs.length - 1 ? ' current' : ''), onclick: () => this.host.navigate(target) }, seg));
    });
    const back = this.btn('arrow-left', 'Atgal (Alt+←)', () => this.host.back());
    const fwd = this.btn('arrow-right', 'Pirmyn (Alt+→)', () => this.host.forward());
    const up = this.btn('arrow-up', 'Į viršų (Backspace)', () => this.host.navigate(dirname(this.dir)));
    back.disabled = !this.host.canBack();
    fwd.disabled = !this.host.canForward();
    up.disabled = !this.dir;
    return h(
      'div',
      { class: 'ex-nav' },
      back,
      fwd,
      up,
      this.btn('refresh', 'Atnaujinti', () => this.renderBody()),
      crumbs,
      h('label', { class: 'ex-search' }, this.searchInput, h('span', { html: icon('search', 14) })),
    );
  }

  private toolBar() {
    const newBtn = this.btn('file-plus', 'Naujas', () => {}, 'Naujas', 'accent');
    newBtn.onclick = () => {
      const r = newBtn.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, [
        { label: 'Užrašas', icon: 'file-plus', action: () => this.host.newNote(this.dir) },
        { label: 'Aplankas', icon: 'folder-plus', action: () => this.newFolder() },
      ]);
    };
    const sortBtn = this.btn('sort', 'Rūšiuoti', () => {}, 'Rūšiuoti');
    sortBtn.onclick = () => {
      const r = sortBtn.getBoundingClientRect();
      const opt = (k: SortKey, label: string) => ({
        label: (this.prefs.sort === k ? '● ' : '') + label,
        action: () => this.setSort(k),
      });
      showMenu(r.left, r.bottom + 4, [
        opt('name', 'Pavadinimas'),
        opt('mtime', 'Pakeitimo data'),
        opt('type', 'Tipas'),
        opt('size', 'Dydis'),
        'sep',
        { label: this.prefs.dir === 1 ? 'Mažėjančiai' : 'Didėjančiai', icon: 'sort', action: () => ((this.prefs.dir = this.prefs.dir === 1 ? -1 : 1), this.savePrefs(), this.renderBody()) },
      ]);
    };
    const viewBtn = this.btn(this.prefs.view === 'list' ? 'list' : 'grid', 'Rodinys', () => {}, 'Rodinys');
    viewBtn.onclick = () => {
      const r = viewBtn.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, [
        { label: 'Sąrašas su detalėmis', icon: 'list', action: () => this.setView('list') },
        { label: 'Didelės piktogramos', icon: 'grid', action: () => this.setView('grid') },
      ]);
    };
    return h(
      'div',
      { class: 'ex-tools' },
      newBtn,
      this.btn('upload', 'Įkelti failus iš kompiuterio (.md, .txt, paveikslėliai)', () => this.host.upload(this.dir), 'Įkelti failus'),
      h('span', { class: 'ex-div' }),
      this.btn('edit', 'Pervadinti (F2)', () => this.renameSelected(), '', 'needs-sel'),
      this.btn('folder-open', 'Perkelti į…', () => this.moveSelected(), '', 'needs-sel'),
      this.btn('trash', 'Ištrinti (Delete)', () => this.deleteSelected(), '', 'needs-sel'),
      h('span', { class: 'ex-div' }),
      sortBtn,
      viewBtn,
    );
  }

  private setSort(k: SortKey) {
    if (this.prefs.sort === k) this.prefs.dir = this.prefs.dir === 1 ? -1 : 1;
    else {
      this.prefs.sort = k;
      this.prefs.dir = k === 'mtime' ? -1 : 1;
    }
    this.savePrefs();
    this.renderBody();
  }

  private setView(v: 'list' | 'grid') {
    this.prefs.view = v;
    this.savePrefs();
    this.renderBody();
  }

  // ---------- Duomenys ----------

  private itemFor(path: string, kind: Item['kind']): Item {
    const info = kind === 'folder' ? { mtime: 0, size: 0 } : this.host.vault.info(path);
    let mtime = info.mtime;
    let size = info.size;
    if (kind === 'folder') {
      // Aplanko data – naujausias jame esantis failas
      for (const p of [...this.host.vault.notes(), ...this.host.vault.assets()])
        if (isInside(p, path)) {
          mtime = Math.max(mtime, this.host.vault.info(p).mtime);
          size++;
        }
    }
    return { path, name: kind === 'note' ? noteName(path) : basename(path), kind, mtime, size };
  }

  private collect(): Item[] {
    const v = this.host.vault;
    const q = this.searchInput.value.trim().toLowerCase();
    const inDir = (p: string) => dirname(p) === this.dir;
    const match = (p: string) => (q ? basename(p).toLowerCase().includes(q) : inDir(p));
    const out: Item[] = [
      ...v.folders().filter(match).map((p) => this.itemFor(p, 'folder')),
      ...v.notes().filter(match).map((p) => this.itemFor(p, 'note')),
      ...v.assets().filter(match).map((p) => this.itemFor(p, 'image')),
    ];
    const { sort, dir } = this.prefs;
    const kindRank = { folder: 0, note: 1, image: 2 };
    out.sort((a, b) => {
      if (a.kind === 'folder' && b.kind !== 'folder') return -1;
      if (b.kind === 'folder' && a.kind !== 'folder') return 1;
      let c = 0;
      if (sort === 'mtime') c = a.mtime - b.mtime;
      else if (sort === 'size') c = a.size - b.size;
      else if (sort === 'type') c = kindRank[a.kind] - kindRank[b.kind];
      return (c || a.name.localeCompare(b.name, 'lt')) * (c ? dir : sort === 'name' ? dir : 1);
    });
    return out;
  }

  // ---------- Atvaizdavimas ----------

  renderBody() {
    const v = this.host.vault;
    const scroll = this.body.scrollTop;
    clear(this.body);
    this.el.querySelector('.ex-nav')?.replaceWith(this.navBar());
    const searching = !!this.searchInput.value.trim();
    if (v.isEmpty() && !v.assets().length && !v.folders().length) {
      this.body.append(this.host.renderWelcome());
      this.items = [];
      this.updateStatus();
      return;
    }
    if (!this.dir && !searching) {
      if (this.host.stats) this.body.append(this.statusSection(this.host.stats()));
      this.body.append(this.recentSection());
    }
    this.items = this.collect();
    for (const p of [...this.selected]) if (!this.items.some((i) => i.path === p)) this.selected.delete(p);

    this.body.append(
      h(
        'div',
        { class: 'ex-section-head' },
        h('span', null, searching ? `Paieškos rezultatai: „${this.searchInput.value.trim()}“` : this.dir ? basename(this.dir) : 'Visi failai'),
      ),
    );
    if (!this.items.length) {
      this.body.append(
        h(
          'div',
          { class: 'ex-empty' },
          h('div', { html: icon(searching ? 'search' : 'folder-open', 28) }),
          h('p', null, searching ? 'Nieko nerasta.' : 'Šis aplankas tuščias.'),
          searching ? null : h('p', { class: 'ex-empty-hint' }, 'Spauskite „Naujas“ arba „Įkelti failus“, arba tiesiog įtempkite failus iš kompiuterio čia.'),
        ),
      );
    } else if (this.prefs.view === 'grid') this.body.append(this.grid(searching));
    else this.body.append(this.list(searching));
    this.body.scrollTop = scroll;
    this.updateStatus();
  }

  /**
   * ADAM būsenos skydelis: kiekviena kortelė turi funkcinę spalvą, piktogramą ir tekstą,
   * kad būseną būtų galima suprasti neskaitant viso turinio (ir ne vien iš spalvos).
   */
  private statusSection(st: VaultStats): HTMLElement {
    const total = st.tasksDone + st.tasksOpen;
    const pct = total ? Math.round((st.tasksDone / total) * 100) : 0;
    const card = (tone: string, ic: string, label: string, value: string, sub: string, onClick?: () => void, bar?: number) => {
      const inner = [
        h('span', { class: 'st-label', html: (ic === 'dot' ? '<span class="st-dot"></span>' : icon(ic, 12)) + `<span>${label}</span>` }),
        h('span', { class: 'st-value' }, value),
        bar !== undefined ? h('span', { class: 'st-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${bar}%` })) : null,
        h('span', { class: 'st-sub' }, sub),
      ];
      return onClick
        ? h('button', { class: `st-card tone-${tone}`, onclick: onClick, title: label + ': ' + value + ' – ' + sub }, ...inner)
        : h('div', { class: `st-card tone-${tone}` }, ...inner);
    };
    const grid = h(
      'div',
      { class: 'ex-status-grid', role: 'list', 'aria-label': 'Vault būsena' },
      card('primary', 'dot', 'ADAM sistema', 'Online', st.storage),
      card('info', 'file', 'Užrašai', String(st.notes), `${st.assets} paveiksl. · ${st.folders} aplank.`),
      card('analytics', 'graph', 'Analitika', `${st.links} ryš.`, `${st.tags} žymų · atidaryti grafą`, this.host.openGraph),
      card('success', 'check', 'Atlikta', total ? `${st.tasksDone} / ${total}` : '—', total ? `${pct} % užduočių atlikta` : 'Užduočių dar nėra', () => this.host.search?.('"[x]"'), total ? pct : undefined),
      st.tasksOpen
        ? card('warning', 'alert', 'Laukia veiksmo', String(st.tasksOpen), 'neatliktos užduotys – peržiūrėti', () => this.host.search?.('"[ ]"'))
        : card('success', 'check', 'Laukia veiksmo', '0', 'Visos užduotys atliktos'),
      st.broken
        ? card('danger', 'alert-octagon', 'Nutrūkusios nuorodos', String(st.broken), 'nuorodos į nesukurtus užrašus', this.host.openGraph)
        : card('success', 'link', 'Nuorodos', '0 klaidų', 'Visos nuorodos veikia'),
      card('neutral', 'spark', 'Izoliuoti', String(st.orphans), 'užrašai be jokių ryšių'),
    );
    return h('div', null, h('div', { class: 'ex-section-head' }, h('span', null, 'Būsena')), grid);
  }

  private recentSection(): HTMLElement {
    const v = this.host.vault;
    const recent = this.host
      .recent()
      .filter((p) => v.has(p) || v.hasAsset(p))
      .slice(0, 6);
    const pool = recent.length ? recent : v.notes().sort((a, b) => v.info(b).mtime - v.info(a).mtime).slice(0, 6);
    const open = this.prefs.recentOpen;
    const head = h(
      'button',
      {
        class: 'ex-section-head toggle' + (open ? ' open' : ''),
        onclick: () => {
          this.prefs.recentOpen = !open;
          this.savePrefs();
          this.renderBody();
        },
      },
      h('span', { html: icon('chevron-down', 14) }),
      h('span', null, recent.length ? 'Neseniai atidaryti' : 'Naujausi užrašai'),
    );
    if (!open || !pool.length) return h('div', null, head);
    const cards = h('div', { class: 'ex-cards' });
    for (const p of pool) {
      const img = isImage(p);
      const text = img ? '' : v.read(p).replace(/[#*>`_[\]-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
      const thumb = h('div', { class: 'ex-card-thumb' + (img ? ' img' : '') });
      if (img) {
        const im = h('img', { alt: '' });
        v.assetUrl(p).then((u) => u && (im.src = u));
        thumb.append(im);
      } else thumb.append(h('p', null, text || 'Tuščias užrašas'));
      cards.append(
        h(
          'button',
          { class: 'ex-card', title: p, onclick: (e: MouseEvent) => this.host.open(p, e.ctrlKey || e.metaKey) },
          thumb,
          h(
            'div',
            { class: 'ex-card-meta' },
            h('span', { html: icon(img ? 'image' : 'file', 14) }),
            h('span', { class: 'ex-card-name' }, img ? basename(p) : noteName(p)),
          ),
          h('div', { class: 'ex-card-sub' }, (dirname(p) || v.name) + ' · ' + fmtDate(v.info(p).mtime)),
        ),
      );
    }
    return h('div', null, head, cards);
  }

  private list(searching: boolean): HTMLElement {
    const th = (k: SortKey, label: string) =>
      h(
        'button',
        { class: 'ex-th' + (this.prefs.sort === k ? ' on' : ''), onclick: () => this.setSort(k) },
        label,
        this.prefs.sort === k ? h('span', { class: 'ex-sort', html: icon(this.prefs.dir === 1 ? 'chevron-down' : 'chevron-up', 11) }) : null,
      );
    const table = h(
      'div',
      { class: 'ex-list', role: 'grid' },
      h('div', { class: 'ex-row ex-head' }, th('name', 'Pavadinimas'), th('mtime', 'Pakeista'), th('type', 'Tipas'), th('size', searching ? 'Vieta' : 'Dydis')),
    );
    for (const it of this.items) {
      const row = h(
        'div',
        { class: 'ex-row ex-item' + (this.selected.has(it.path) ? ' sel' : ''), role: 'row', 'data-path': it.path, draggable: true },
        h('span', { class: 'ex-name' }, h('span', { class: 'ex-ic ' + it.kind, html: icon(typeIcon(it), 16) }), h('span', { class: 'ex-label' }, it.name)),
        h('span', { class: 'ex-cell' }, fmtDate(it.mtime)),
        h('span', { class: 'ex-cell' }, typeName(it)),
        h('span', { class: 'ex-cell' }, searching ? dirname(it.path) || '/' : it.kind === 'folder' ? `${it.size} el.` : fmtSize(it.size)),
      );
      this.bindItem(row, it);
      table.append(row);
    }
    return table;
  }

  private grid(searching: boolean): HTMLElement {
    const g = h('div', { class: 'ex-grid' });
    for (const it of this.items) {
      const thumb = h('div', { class: 'ex-tile-thumb ' + it.kind, html: it.kind === 'image' ? '' : icon(typeIcon(it), 34) });
      if (it.kind === 'image') {
        const im = h('img', { alt: '' });
        this.host.vault.assetUrl(it.path).then((u) => u && (im.src = u));
        thumb.append(im);
      }
      const tile = h(
        'div',
        { class: 'ex-tile ex-item' + (this.selected.has(it.path) ? ' sel' : ''), 'data-path': it.path, draggable: true, title: it.path },
        thumb,
        h('span', { class: 'ex-tile-name' }, it.name),
        searching ? h('span', { class: 'ex-tile-sub' }, dirname(it.path) || '/') : null,
      );
      this.bindItem(tile, it);
      g.append(tile);
    }
    return g;
  }

  private updateStatus() {
    const n = this.items.length;
    const s = this.selected.size;
    this.status.textContent = `${n} ${n === 1 ? 'elementas' : n > 1 && n < 10 ? 'elementai' : 'elementų'}${s ? ` · pažymėta: ${s}` : ''}`;
    this.el.classList.toggle('has-sel', s > 0);
  }

  // ---------- Sąveika ----------

  private activate(it: Item, newTab = false) {
    if (it.kind === 'folder') this.host.navigate(it.path);
    else this.host.open(it.path, newTab);
  }

  private select(path: string, add: boolean) {
    if (!add) this.selected.clear();
    if (add && this.selected.has(path)) this.selected.delete(path);
    else this.selected.add(path);
    this.body.querySelectorAll<HTMLElement>('.ex-item').forEach((el) => el.classList.toggle('sel', this.selected.has(el.dataset.path!)));
    this.updateStatus();
  }

  private bindItem(el: HTMLElement, it: Item) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      // Telefone – vienas bakstelėjimas atidaro, kompiuteryje – pažymi.
      if (isMobile()) return this.activate(it);
      this.select(it.path, e.ctrlKey || e.metaKey);
    });
    el.addEventListener('dblclick', (e) => this.activate(it, e.ctrlKey || e.metaKey));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.selected.has(it.path)) this.select(it.path, false);
      showMenu(e.clientX, e.clientY, [
        { label: it.kind === 'folder' ? 'Atidaryti aplanką' : 'Atidaryti', icon: it.kind === 'folder' ? 'folder-open' : 'file', action: () => this.activate(it) },
        ...(it.kind !== 'folder' ? [{ label: 'Atidaryti naujame skirtuke', icon: 'file-plus', action: () => this.activate(it, true) }] : []),
        'sep' as const,
        { label: 'Pervadinti', icon: 'edit', action: () => this.renameSelected() },
        { label: 'Perkelti į…', icon: 'folder-open', action: () => this.host.moveTo(it.path) },
        { label: 'Ištrinti', icon: 'trash', danger: true, action: () => this.deleteSelected() },
      ]);
    });
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData('application/x-adam-path', it.path);
      e.dataTransfer!.effectAllowed = 'move';
    });
    if (it.kind === 'folder') {
      el.addEventListener('dragover', (e) => {
        if (e.dataTransfer?.types.includes('application/x-adam-path') || e.dataTransfer?.types.includes('Files')) {
          e.preventDefault();
          el.classList.add('drop');
        }
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('drop');
        const src = e.dataTransfer?.getData('application/x-adam-path');
        if (src && src !== it.path && !isInside(it.path, src)) {
          try {
            await this.host.vault.move(src, it.path);
          } catch (err) {
            toast((err as Error).message, 'error');
          }
        } else if (e.dataTransfer?.files.length) await this.host.upload(it.path, [...e.dataTransfer.files]);
      });
    }
  }

  private bindBody() {
    const b = this.body;
    b.addEventListener('click', () => {
      this.selected.clear();
      this.body.querySelectorAll('.ex-item.sel').forEach((x) => x.classList.remove('sel'));
      this.updateStatus();
    });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { label: 'Naujas užrašas', icon: 'file-plus', action: () => this.host.newNote(this.dir) },
        { label: 'Naujas aplankas', icon: 'folder-plus', action: () => this.newFolder() },
        { label: 'Įkelti failus…', icon: 'upload', action: () => this.host.upload(this.dir) },
      ]);
    });
    // Failai iš kompiuterio – tiesiog įtempti
    b.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        b.classList.add('drop-files');
      }
    });
    b.addEventListener('dragleave', (e) => e.target === b && b.classList.remove('drop-files'));
    b.addEventListener('drop', async (e) => {
      b.classList.remove('drop-files');
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      await this.host.upload(this.dir, [...e.dataTransfer.files]);
    });
    b.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const idx = this.items.findIndex((i) => this.selected.has(i.path));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = this.items[Math.max(0, Math.min(this.items.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) {
          this.select(n.path, false);
          this.body.querySelector(`[data-path="${CSS.escape(n.path)}"]`)?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter' && idx >= 0) this.activate(this.items[idx]);
      else if (e.key === 'Delete') this.deleteSelected();
      else if (e.key === 'F2') this.renameSelected();
      else if (e.key === 'Backspace' && this.dir) this.host.navigate(dirname(this.dir));
    });
  }

  private async newFolder() {
    const name = await promptDialog('Naujo aplanko pavadinimas', 'Naujas aplankas', 'Sukurti');
    if (!name?.trim()) return;
    try {
      const p = await this.host.newFolder(this.dir);
      if (basename(p) !== name.trim()) await this.host.vault.rename(p, name.trim());
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  private async renameSelected() {
    const path = [...this.selected][0];
    if (!path) return;
    const it = this.items.find((i) => i.path === path);
    if (!it) return;
    const ext = it.kind === 'image' ? extname(path) : '';
    const current = it.kind === 'image' ? basename(path).slice(0, -ext.length) : it.name;
    const name = await promptDialog('Pervadinti', current, 'Pervadinti');
    if (!name || name.trim() === current) return;
    try {
      const np = await this.host.vault.rename(path, name.trim());
      this.selected = new Set([np]);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  private moveSelected() {
    const path = [...this.selected][0];
    if (path) this.host.moveTo(path);
  }

  private async deleteSelected() {
    const paths = [...this.selected];
    if (!paths.length) return;
    const ok = await confirmDialog(
      paths.length > 1 ? `Ištrinti ${paths.length} elementus?` : 'Ištrinti?',
      paths.length > 1 ? 'Pažymėti failai ir aplankai bus ištrinti negrįžtamai.' : `„${basename(paths[0])}“ bus ištrintas negrįžtamai.`,
      'Ištrinti',
      true,
    );
    if (!ok) return;
    for (const p of paths) {
      try {
        await this.host.vault.delete(p);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }
    this.selected.clear();
  }

  focus() {
    this.body.focus();
  }

  destroy() {
    this.unsub();
    this.el.remove();
  }
}

