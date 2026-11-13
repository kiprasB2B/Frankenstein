import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { ForceLayout2D } from './forceLayout2d';
import { CanvasRenderer2D } from './canvasRenderer2d';
import { ForceLayout3D } from './forceLayout3d';
import { CanvasRenderer3D } from './canvasRenderer3d';
import type { Camera, GraphData, Layout, Renderer, RenderState, SimNode } from './types';

export interface GraphViewOptions {
  getData(): GraphData;
  getActive(): string | null;
  onOpen(id: string, newTab: boolean): void;
  onBack(): void;
  canBack(): boolean;
  /** Įvykių prenumerata, grąžina atsisakymo funkciją. */
  subscribe(cb: () => void): () => void;
  initialMode?: GraphMode;
}

export type GraphMode = '2d' | '3d';

/** Sukuria išdėstymą ir piešėją pagal režimą – vienintelė vieta, kur pasirenkamas variklis. */
function createEngine(mode: GraphMode): { layout: Layout; renderer: Renderer } {
  switch (mode) {
    case '3d':
      return { layout: new ForceLayout3D(), renderer: new CanvasRenderer3D() };
    case '2d':
    default:
      return { layout: new ForceLayout2D(), renderer: new CanvasRenderer2D() };
  }
}

const prefs: { local: boolean; missing: boolean; mode?: GraphMode; spin: boolean } = { local: false, missing: true, spin: true };

/** Interaktyvus grafo vaizdas: tempimas, mastelis, užvedimas, paspaudimas. */
export class GraphView {
  readonly el: HTMLElement;
  private layout: Layout;
  private renderer: Renderer;
  private stage: HTMLElement;
  private state: RenderState = { camera: { x: 0, y: 0, k: 1 }, hover: null, active: null, neighbors: new Set(), filter: '' };
  private raf = 0;
  private dirty = true;
  private ro: ResizeObserver;
  private unsub: () => void;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { node: SimNode | null; sx: number; sy: number; moved: boolean; cam: Camera; pinch?: number } | null = null;
  private fitted = false;
  private info: HTMLElement;
  private adj = new Map<string, Set<string>>();

  private mode: GraphMode;
  private lastInteract = 0;

  constructor(private opts: GraphViewOptions) {
    this.mode = prefs.mode ?? opts.initialMode ?? '2d';
    ({ layout: this.layout, renderer: this.renderer } = createEngine(this.mode));
    this.stage = h('div', { class: 'graph-stage' }, this.renderer.canvas);
    const filter = h('input', { class: 'graph-filter', placeholder: 'Filtruoti mazgus…', type: 'search', spellcheck: false });
    filter.addEventListener('input', () => {
      this.state.filter = filter.value;
      this.dirty = true;
    });
    const toggle = (label: string, key: 'local' | 'missing', title: string) => {
      const b = h('button', { class: 'chip-toggle' + (prefs[key] ? ' on' : ''), title }, label);
      b.onclick = () => {
        prefs[key] = !prefs[key];
        b.classList.toggle('on', prefs[key]);
        this.refresh();
        this.fitted = false;
        setTimeout(() => this.fit(), 400);
      };
      return b;
    };
    this.info = h('span', { class: 'graph-info' });
    const modeBtn = h('button', { class: 'chip-toggle mode-3d' + (this.mode === '3d' ? ' on' : ''), title: 'Perjungti 2D / 3D', html: icon('cube', 14) + '<span>3D</span>' });
    modeBtn.onclick = () => {
      this.setMode(this.mode === '3d' ? '2d' : '3d');
      modeBtn.classList.toggle('on', this.mode === '3d');
      spinBtn.hidden = this.mode !== '3d';
    };
    const spinBtn = h('button', { class: 'chip-toggle' + (prefs.spin ? ' on' : ''), title: 'Lėtas automatinis sukimasis 3D režime' }, 'Sukimasis');
    spinBtn.hidden = this.mode !== '3d';
    spinBtn.onclick = () => {
      prefs.spin = !prefs.spin;
      spinBtn.classList.toggle('on', prefs.spin);
    };
    this.el = h(
      'div',
      { class: 'graph-view' },
      this.stage,
      h(
        'div',
        { class: 'graph-controls' },
        h('button', {
          class: 'icon-btn graph-gear',
          title: 'Grafo nustatymai',
          'aria-label': 'Grafo nustatymai',
          html: icon('settings', 17),
          onclick: () => this.el.classList.toggle('panel-open'),
        }),
        h('button', { class: 'icon-btn', title: 'Talpinti į ekraną', 'aria-label': 'Talpinti į ekraną', html: icon('wand', 17), onclick: () => this.fit(true) }),
        h('button', {
          class: 'icon-btn',
          title: 'Grįžti',
          'aria-label': 'Grįžti',
          html: icon('arrow-left', 17),
          onclick: () => this.opts.onBack(),
        }),
      ),
      h(
        'div',
        { class: 'graph-panel' },
        h('div', { class: 'graph-panel-head' }, h('span', null, 'Grafo nustatymai'), h('button', { class: 'icon-btn', title: 'Uždaryti', html: icon('x', 14), onclick: () => this.el.classList.remove('panel-open') })),
        h('div', { class: 'gp-label' }, 'Filtras'),
        filter,
        h('div', { class: 'gp-label' }, 'Rodyti'),
        h('div', { class: 'gp-row' }, toggle('Vietinis', 'local', 'Rodyti tik aktyvaus užrašo aplinką'), toggle('Neegzistuojantys', 'missing', 'Rodyti nuorodas į dar nesukurtus užrašus')),
        h('div', { class: 'gp-label' }, 'Režimas'),
        h('div', { class: 'gp-row' }, modeBtn, spinBtn),
      ),
      h('div', { class: 'graph-hint' }, this.info, h('span', { class: 'graph-help' })),
    );
    this.layout.onTick(() => (this.dirty = true));
    this.updateHelp();
    this.ro = new ResizeObserver(() => {
      const r = this.stage.getBoundingClientRect();
      this.renderer.resize(r.width, r.height);
      this.dirty = true;
    });
    this.ro.observe(this.stage);
    this.bindEvents();
    this.unsub = opts.subscribe(() => this.refresh());
    this.refresh();
    this.loop();
    setTimeout(() => this.fit(), 700);
  }

  private filteredData(): GraphData {
    let data = this.opts.getData();
    if (!prefs.missing) {
      const ok = new Set(data.nodes.filter((n) => n.exists).map((n) => n.id));
      data = { nodes: data.nodes.filter((n) => ok.has(n.id)), links: data.links.filter((l) => ok.has(l.source) && ok.has(l.target)) };
    }
    const active = this.opts.getActive();
    if (prefs.local && active) {
      const adj = new Map<string, string[]>();
      for (const l of data.links) {
        (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push(l.target);
        (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push(l.source);
      }
      const keep = new Set([active]);
      let frontier = [active];
      for (let d = 0; d < 2; d++) {
        const next: string[] = [];
        for (const id of frontier) for (const nb of adj.get(id) ?? []) if (!keep.has(nb)) keep.add(nb), next.push(nb);
        frontier = next;
      }
      data = { nodes: data.nodes.filter((n) => keep.has(n.id)), links: data.links.filter((l) => keep.has(l.source) && keep.has(l.target)) };
    }
    return data;
  }

  private updateHelp() {
    const el = this.el.querySelector('.graph-help');
    if (el)
      el.textContent =
        this.mode === '3d'
          ? 'Tempkite foną – sukti · Shift + tempimas – stumti · ratukas – mastelis · paspaudimas – atidaryti'
          : 'Tempkite mazgus · ratukas – mastelis · paspaudimas – atidaryti';
  }

  /** Perjungia 2D / 3D: pakeičia išdėstymą ir piešėją, duomenys ir sąveika lieka. */
  setMode(mode: GraphMode) {
    if (mode === this.mode) return;
    this.mode = prefs.mode = mode;
    this.layout.stop();
    this.renderer.destroy();
    ({ layout: this.layout, renderer: this.renderer } = createEngine(mode));
    this.stage.prepend(this.renderer.canvas);
    const r = this.stage.getBoundingClientRect();
    this.renderer.resize(r.width, r.height);
    this.layout.onTick(() => (this.dirty = true));
    this.state.camera = { x: 0, y: 0, k: 1, yaw: 0.6, pitch: -0.35 };
    this.setHover(null);
    this.refresh();
    this.updateHelp();
    this.fit();
    setTimeout(() => this.fit(true), 600);
  }

  refresh() {
    const data = this.filteredData();
    this.layout.setData(data);
    this.adj.clear();
    for (const l of this.layout.links) {
      (this.adj.get(l.source.id) ?? this.adj.set(l.source.id, new Set()).get(l.source.id)!).add(l.target.id);
      (this.adj.get(l.target.id) ?? this.adj.set(l.target.id, new Set()).get(l.target.id)!).add(l.source.id);
    }
    this.state.active = this.opts.getActive();
    this.info.textContent = `${data.nodes.filter((n) => n.exists).length} užraš. · ${data.links.length} ryš.`;
    this.dirty = true;
  }

  focus(path: string | null) {
    this.state.active = path;
    if (prefs.local) this.refresh();
    this.dirty = true;
  }

  /** Talpina visus mazgus į matomą plotą. */
  fit(animate = false) {
    const ns = this.layout.nodes;
    const r = this.stage.getBoundingClientRect();
    if (!ns.length || !r.width) return;
    if (this.mode === '3d') {
      const R = Math.max(40, ...ns.map((n) => Math.hypot(n.x, n.y, n.z ?? 0)));
      const k = Math.min(1.4, Math.max(0.2, Math.min(r.width, r.height) / (2.4 * R + 80)));
      const from = this.state.camera.k;
      const t0 = performance.now();
      const step = () => {
        const t = animate ? Math.min(1, (performance.now() - t0) / 450) : 1;
        this.state.camera.k = from + (k - from) * (1 - Math.pow(1 - t, 3));
        this.state.camera.x = this.state.camera.x * (1 - t);
        this.state.camera.y = this.state.camera.y * (1 - t);
        this.dirty = true;
        if (t < 1) requestAnimationFrame(step);
      };
      step();
      return;
    }
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of ns) {
      x0 = Math.min(x0, n.x);
      y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x);
      y1 = Math.max(y1, n.y);
    }
    const k = Math.min(2, Math.max(0.2, Math.min(r.width / (x1 - x0 + 120), r.height / (y1 - y0 + 120))));
    const target = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, k };
    if (!animate) {
      this.state.camera = target;
      this.dirty = true;
      this.fitted = true;
      return;
    }
    const from = { ...this.state.camera };
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 450);
      const e = 1 - Math.pow(1 - t, 3);
      this.state.camera = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e };
      this.dirty = true;
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }

  private loop = () => {
    if (this.mode === '3d' && prefs.spin && !this.drag && !this.state.hover && performance.now() - this.lastInteract > 2500) {
      this.state.camera.yaw = (this.state.camera.yaw ?? 0) + 0.0015;
      this.dirty = true;
    }
    if (this.dirty || this.state.hover) {
      this.renderer.draw(this.layout, this.state);
      this.dirty = false;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private local(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = this.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toWorld(sx: number, sy: number) {
    const r = this.stage.getBoundingClientRect();
    const c = this.state.camera;
    return { x: (sx - r.width / 2) / c.k + c.x, y: (sy - r.height / 2) / c.k + c.y };
  }

  private setHover(n: SimNode | null) {
    if (this.state.hover === n) return;
    this.state.hover = n;
    this.state.neighbors = n ? (this.adj.get(n.id) ?? new Set()) : new Set();
    this.stage.style.cursor = n ? 'pointer' : 'grab';
    this.dirty = true;
  }

  private bindEvents() {
    const s = this.stage;
    s.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.local(e);
      this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    s.addEventListener('pointerdown', (e) => {
      this.lastInteract = performance.now();
      s.setPointerCapture(e.pointerId);
      const p = this.local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.drag = { node: null, sx: (a.x + b.x) / 2, sy: (a.y + b.y) / 2, moved: true, cam: { ...this.state.camera }, pinch: Math.hypot(a.x - b.x, a.y - b.y) };
        return;
      }
      const node = this.renderer.pick(this.layout, this.state, p.x, p.y);
      this.drag = { node, sx: p.x, sy: p.y, moved: false, cam: { ...this.state.camera } };
      if (node) {
        this.setHover(node);
        this.layout.setDragging(true);
      } else s.style.cursor = 'grabbing';
    });

    s.addEventListener('pointermove', (e) => {
      const p = this.local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      const d = this.drag;
      if (!d) {
        this.setHover(this.renderer.pick(this.layout, this.state, p.x, p.y));
        return;
      }
      if (d.pinch !== undefined && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const k = Math.min(6, Math.max(0.1, d.cam.k * (dist / d.pinch)));
        this.state.camera = { ...this.state.camera, k };
        this.dirty = true;
        return;
      }
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 4) d.moved = true;
      this.lastInteract = performance.now();
      if (d.node) {
        if (this.renderer.unproject) {
          const w = this.renderer.unproject(this.state, p.x, p.y, d.node);
          this.layout.pin(d.node, w.x, w.y, w.z);
        } else {
          const w = this.toWorld(p.x, p.y);
          this.layout.pin(d.node, w.x, w.y);
        }
      } else if (d.moved) {
        if (this.mode === '3d' && !e.shiftKey) {
          const pitch = Math.max(-1.45, Math.min(1.45, (d.cam.pitch ?? 0) + (p.y - d.sy) * 0.006));
          this.state.camera = { ...this.state.camera, yaw: (d.cam.yaw ?? 0) + (p.x - d.sx) * 0.006, pitch };
        } else {
          this.state.camera = { ...this.state.camera, x: d.cam.x - (p.x - d.sx) / d.cam.k, y: d.cam.y - (p.y - d.sy) / d.cam.k };
        }
      }
      this.dirty = true;
    });

    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      const d = this.drag;
      if (!d) return;
      if (d.pinch !== undefined) {
        if (this.pointers.size === 0) this.drag = null;
        return;
      }
      this.drag = null;
      s.style.cursor = this.state.hover ? 'pointer' : 'grab';
      if (d.node) {
        this.layout.setDragging(false);
        if (!d.moved) this.opts.onOpen(d.node.id, e.ctrlKey || e.metaKey);
        else if (!e.shiftKey) this.layout.release(d.node); // Shift – palikti prisegtą
        if (e.pointerType !== 'mouse') this.setHover(null);
      }
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('pointerleave', () => !this.drag && this.setHover(null));
    s.addEventListener('dblclick', (e) => {
      const p = this.local(e);
      if (!this.renderer.pick(this.layout, this.state, p.x, p.y)) this.zoomAt(p.x, p.y, 1.6);
    });
  }

  private zoomAt(sx: number, sy: number, factor: number) {
    this.lastInteract = performance.now();
    if (this.mode === '3d') {
      this.state.camera.k = Math.min(6, Math.max(0.1, this.state.camera.k * factor));
      this.dirty = true;
      return;
    }
    const before = this.toWorld(sx, sy);
    const c = this.state.camera;
    c.k = Math.min(6, Math.max(0.1, c.k * factor));
    const after = this.toWorld(sx, sy);
    c.x += before.x - after.x;
    c.y += before.y - after.y;
    this.dirty = true;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.layout.stop();
    this.ro.disconnect();
    this.unsub();
    this.renderer.destroy();
    this.el.remove();
    void this.fitted;
  }
}
