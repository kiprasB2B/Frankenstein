import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { ForceLayout2D } from './forceLayout2d';
import { CanvasRenderer2D } from './canvasRenderer2d';
import type { Camera, GraphData, Layout, Renderer, RenderState, SimNode } from './types';

export interface GraphViewOptions {
  getData(): GraphData;
  getActive(): string | null;
  onOpen(id: string, newTab: boolean): void;
  onBack(): void;
  canBack(): boolean;
  /** Įvykių prenumerata, grąžina atsisakymo funkciją. */
  subscribe(cb: () => void): () => void;
}

export type GraphMode = '2d'; // ateityje: | '3d'

/** Sukuria išdėstymą ir piešėją pagal režimą – vienintelė vieta, kurią reikėtų papildyti 3D. */
function createEngine(mode: GraphMode): { layout: Layout; renderer: Renderer } {
  switch (mode) {
    case '2d':
    default:
      return { layout: new ForceLayout2D(), renderer: new CanvasRenderer2D() };
  }
}

const prefs = { local: false, missing: true };

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

  constructor(private opts: GraphViewOptions, mode: GraphMode = '2d') {
    ({ layout: this.layout, renderer: this.renderer } = createEngine(mode));
    this.stage = h('div', { class: 'graph-stage' }, this.renderer.canvas);
    const filter = h('input', { class: 'graph-filter', placeholder: 'Filtruoti mazgus…', type: 'search', spellcheck: false });
    filter.addEventListener('input', () => {
      this.state.filter = filter.value;
      this.dirty = true;
    });
    const toggle = (label: string, key: keyof typeof prefs, title: string) => {
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
    this.el = h(
      'div',
      { class: 'graph-view' },
      this.stage,
      h(
        'div',
        { class: 'graph-toolbar' },
        h('button', {
          class: 'back-link',
          html: icon('arrow-left', 14) + '<span>Atgal</span>',
          title: 'Grįžti į ankstesnį užrašą',
          onclick: () => this.opts.onBack(),
        }),
        filter,
        toggle('Vietinis', 'local', 'Rodyti tik aktyvaus užrašo aplinką'),
        toggle('Neegzistuojantys', 'missing', 'Rodyti nuorodas į dar nesukurtus užrašus'),
        h('button', { class: 'icon-btn', title: 'Talpinti į ekraną', html: icon('zoom', 16), onclick: () => this.fit(true) }),
      ),
      h('div', { class: 'graph-hint' }, this.info, h('span', null, 'Tempkite mazgus · ratukas – mastelis · paspaudimas – atidaryti')),
    );
    this.layout.onTick(() => (this.dirty = true));
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
        this.state.camera = { ...d.cam, k };
        this.dirty = true;
        return;
      }
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 4) d.moved = true;
      if (d.node) {
        const w = this.toWorld(p.x, p.y);
        this.layout.pin(d.node, w.x, w.y);
      } else if (d.moved) {
        this.state.camera = { ...d.cam, x: d.cam.x - (p.x - d.sx) / d.cam.k, y: d.cam.y - (p.y - d.sy) / d.cam.k };
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
