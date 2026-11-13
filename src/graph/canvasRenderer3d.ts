import { cssVar, hexToRgb } from '../ui/theme';
import { nodeRadius } from './forceLayout2d';
import { glowSprite } from './canvasRenderer2d';
import type { Layout, Renderer, RenderState, SimNode } from './types';

const FOCAL = 700; // kameros atstumas perspektyvai

interface Projected {
  sx: number;
  sy: number;
  s: number; // perspektyvos mastelis
  depth: number; // z kameros erdvėje (didesnis – toliau)
}

/**
 * 3D piešėjas ant Canvas 2D: pasukimas (yaw/pitch), perspektyva, gylio rūšiavimas ir „rūkas“.
 * Be WebGL – lengvas ir veikia visur; tą pačią Renderer sąsają galėtų įgyvendinti ir three.js.
 */
export class CanvasRenderer3D implements Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private colors = {
    fg: hexToRgb(cssVar('--c-fg')),
    accent: hexToRgb(cssVar('--c-accent')),
    glow: hexToRgb(cssVar('--c-glow')),
    neutral: hexToRgb(cssVar('--c-neutral')),
    bg: cssVar('--c-bg'),
  };
  private sprites = { accent: glowSprite(this.colors.accent), glow: glowSprite(this.colors.glow) };
  private spriteCache = new Map<string, HTMLCanvasElement>();
  private spriteFor(rgb?: string) {
    if (!rgb) return this.sprites.accent;
    let sp = this.spriteCache.get(rgb);
    if (!sp) this.spriteCache.set(rgb, (sp = glowSprite(rgb)));
    return sp;
  }
  private proj = new Map<SimNode, Projected>();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'graph-canvas';
    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(width: number, height: number) {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = width;
    this.h = height;
    this.canvas.width = Math.max(1, width * this.dpr);
    this.canvas.height = Math.max(1, height * this.dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
  }

  private project(st: RenderState, n: SimNode): Projected {
    const c = st.camera;
    const yaw = c.yaw ?? 0;
    const pitch = c.pitch ?? 0;
    const z = n.z ?? 0;
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    const x1 = n.x * cy + z * sy;
    const z1 = -n.x * sy + z * cy;
    const y2 = n.y * cp - z1 * sp;
    const z2 = n.y * sp + z1 * cp;
    const s = FOCAL / Math.max(60, FOCAL + z2);
    return { sx: this.w / 2 + (x1 - c.x) * s * c.k, sy: this.h / 2 + (y2 - c.y) * s * c.k, s, depth: z2 };
  }

  unproject(st: RenderState, sx: number, sy: number, node: SimNode) {
    const c = st.camera;
    const p = this.proj.get(node) ?? this.project(st, node);
    const x1 = (sx - this.w / 2) / (p.s * c.k) + c.x;
    const y2 = (sy - this.h / 2) / (p.s * c.k) + c.y;
    const z2 = p.depth;
    const yaw = c.yaw ?? 0;
    const pitch = c.pitch ?? 0;
    const y = y2 * Math.cos(pitch) + z2 * Math.sin(pitch);
    const z1 = -y2 * Math.sin(pitch) + z2 * Math.cos(pitch);
    return { x: x1 * Math.cos(yaw) - z1 * Math.sin(yaw), y, z: x1 * Math.sin(yaw) + z1 * Math.cos(yaw) };
  }

  private matches(n: SimNode, filter: string) {
    return !filter || n.label.toLowerCase().includes(filter) || n.tags.some((t) => ('#' + t).includes(filter));
  }

  draw(layout: Layout, st: RenderState) {
    const { ctx, colors } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.proj.clear();
    for (const n of layout.nodes) this.proj.set(n, this.project(st, n));

    let dMin = Infinity,
      dMax = -Infinity;
    for (const p of this.proj.values()) {
      dMin = Math.min(dMin, p.depth);
      dMax = Math.max(dMax, p.depth);
    }
    const fog = (d: number) => 1 - 0.75 * ((d - dMin) / Math.max(1, dMax - dMin)); // arti – 1, toli – 0.25
    const focus = st.hover;
    const filter = st.filter.trim().toLowerCase();
    const k = st.camera.k;

    // Ryšiai (toliausi pirmiau)
    const links = [...layout.links].sort(
      (a, b) => this.proj.get(b.source)!.depth + this.proj.get(b.target)!.depth - (this.proj.get(a.source)!.depth + this.proj.get(a.target)!.depth),
    );
    for (const l of links) {
      const a = this.proj.get(l.source)!;
      const b = this.proj.get(l.target)!;
      const hot = focus && (l.source === focus || l.target === focus);
      const visible = this.matches(l.source, filter) && this.matches(l.target, filter);
      const f = fog((a.depth + b.depth) / 2);
      const alpha = !visible ? 0.03 : hot ? 0.8 : (focus ? 0.05 : 0.2) * f;
      ctx.strokeStyle = hot ? `rgba(${colors.accent},${alpha})` : `rgba(${colors.fg},${alpha})`;
      ctx.lineWidth = Math.max(0.4, ((a.s + b.s) / 2) * Math.min(1.2, k * 0.8));
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      if (hot) {
        const t = (performance.now() / 1400) % 1;
        const [from, to] = l.source === focus ? [a, b] : [b, a];
        ctx.fillStyle = `rgba(${colors.glow},0.9)`;
        ctx.beginPath();
        ctx.arc(from.sx + (to.sx - from.sx) * t, from.sy + (to.sy - from.sy) * t, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mazgai pagal gylį
    const nodes = [...layout.nodes].sort((a, b) => this.proj.get(b)!.depth - this.proj.get(a)!.depth);
    const labels: [SimNode, Projected, number, boolean][] = [];
    for (const n of nodes) {
      const p = this.proj.get(n)!;
      const r = nodeRadius(n) * p.s * Math.max(0.6, Math.min(k, 1.8));
      if (p.sx < -50 || p.sy < -50 || p.sx > this.w + 50 || p.sy > this.h + 50) continue;
      const hot = !focus || n === focus || st.neighbors.has(n.id);
      const visible = this.matches(n, filter);
      const isActive = n.id === st.active;
      const f = fog(p.depth);
      ctx.globalAlpha = !visible ? 0.06 : hot ? Math.max(0.35, f) : 0.12;
      if (n.exists && visible) {
        const strong = isActive || n === focus;
        const gs = r * (strong ? 9 : 6);
        ctx.drawImage(strong ? this.sprites.glow : this.spriteFor(n.color), p.sx - gs / 2, p.sy - gs / 2, gs, gs);
      }
      ctx.fillStyle = !n.exists ? `rgba(${colors.neutral},0.55)` : isActive || n === focus ? `rgb(${colors.glow})` : `rgb(${n.color ?? colors.accent})`;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, isActive ? r * 1.25 : r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const show = visible && (n === focus || isActive || (focus ? st.neighbors.has(n.id) : (f > 0.85 && k > 1.2) || n.degree >= 8));
      if (show) labels.push([n, p, r, hot]);
    }

    ctx.font = `${Math.round(11 + Math.min(2, k))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const [n, p, r, hot] of labels) {
      const strong = n === focus || n.id === st.active;
      ctx.fillStyle = strong ? `rgb(${colors.glow})` : `rgba(${colors.fg},${hot ? 0.8 * Math.max(0.5, fog(p.depth)) : 0.3})`;
      if (strong) {
        ctx.shadowColor = `rgba(${colors.accent},0.8)`;
        ctx.shadowBlur = 8;
      }
      ctx.fillText(n.label.length > 40 ? n.label.slice(0, 38) + '…' : n.label, p.sx, p.sy + r + 5);
      ctx.shadowBlur = 0;
    }
  }

  pick(layout: Layout, st: RenderState, sx: number, sy: number): SimNode | null {
    let best: SimNode | null = null;
    let bestDepth = Infinity;
    for (const n of layout.nodes) {
      const p = this.proj.get(n) ?? this.project(st, n);
      const r = nodeRadius(n) * p.s * Math.max(0.6, Math.min(st.camera.k, 2.2)) + 6;
      // Artimiausias kamerai mazgas laimi
      if (Math.hypot(p.sx - sx, p.sy - sy) < r && p.depth < bestDepth) {
        best = n;
        bestDepth = p.depth;
      }
    }
    return best;
  }

  destroy() {
    this.canvas.remove();
  }
}
