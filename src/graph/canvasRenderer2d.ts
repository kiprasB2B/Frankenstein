import { cssVar, hexToRgb } from '../ui/theme';
import { nodeRadius } from './forceLayout2d';
import type { Layout, Renderer, RenderState, SimNode } from './types';

/** Švytinčių dalelių sprite – piešiamas vieną kartą ir kopijuojamas (greičiau nei shadowBlur). */
function glowSprite(rgb: string, size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${rgb},0.55)`);
  grd.addColorStop(0.25, `rgba(${rgb},0.22)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/** 2D Canvas piešėjas. 3D režimui būtų kitas Renderer įgyvendinimas. */
export class CanvasRenderer2D implements Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private colors = {
    fg: hexToRgb(cssVar('--c-fg')),
    accent: hexToRgb(cssVar('--c-accent')),
    glow: hexToRgb(cssVar('--c-glow')),
    bg: cssVar('--c-bg'),
  };
  private sprites = { accent: glowSprite(this.colors.accent), glow: glowSprite(this.colors.glow) };

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

  private toScreen(st: RenderState, x: number, y: number): [number, number] {
    const { camera: c } = st;
    return [(x - c.x) * c.k + this.w / 2, (y - c.y) * c.k + this.h / 2];
  }

  private matches(n: SimNode, filter: string) {
    return !filter || n.label.toLowerCase().includes(filter) || n.tags.some((t) => ('#' + t).includes(filter));
  }

  draw(layout: Layout, st: RenderState) {
    const { ctx, colors } = this;
    const k = st.camera.k;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    const focus = st.hover;
    const isHot = (n: SimNode) => !focus || n === focus || st.neighbors.has(n.id);
    const filter = st.filter.trim().toLowerCase();

    // Ryšiai
    ctx.lineWidth = Math.max(0.5, Math.min(1.2, k * 0.8));
    for (const l of layout.links) {
      const hot = focus && (l.source === focus || l.target === focus);
      const visible = this.matches(l.source, filter) && this.matches(l.target, filter);
      const a = !visible ? 0.03 : hot ? 0.75 : focus ? 0.05 : 0.16;
      ctx.strokeStyle = hot ? `rgba(${colors.accent},${a})` : `rgba(${colors.fg},${a})`;
      const [x1, y1] = this.toScreen(st, l.source.x, l.source.y);
      const [x2, y2] = this.toScreen(st, l.target.x, l.target.y);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (hot) {
        // Dalelė, keliaujanti ryšiu – gyvumo efektas.
        const t = (performance.now() / 1400) % 1;
        const [fx, fy] = l.source === focus ? [x1, y1] : [x2, y2];
        const [tx, ty] = l.source === focus ? [x2, y2] : [x1, y1];
        ctx.fillStyle = `rgba(${colors.glow},0.9)`;
        ctx.beginPath();
        ctx.arc(fx + (tx - fx) * t, fy + (ty - fy) * t, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mazgai
    const labels: [SimNode, number, number, number, boolean][] = [];
    for (const n of layout.nodes) {
      const [x, y] = this.toScreen(st, n.x, n.y);
      const r = nodeRadius(n) * Math.max(0.6, Math.min(k, 2.2));
      if (x < -50 || y < -50 || x > this.w + 50 || y > this.h + 50) continue;
      const hot = isHot(n);
      const visible = this.matches(n, filter);
      const isActive = n.id === st.active;
      const alpha = !visible ? 0.08 : hot ? 1 : 0.18;
      ctx.globalAlpha = alpha;
      if (n.exists && visible) {
        const spr = isActive || n === focus ? this.sprites.glow : this.sprites.accent;
        const gs = r * (isActive || n === focus ? 9 : 6);
        ctx.drawImage(spr, x - gs / 2, y - gs / 2, gs, gs);
      }
      ctx.fillStyle = !n.exists ? `rgba(${colors.fg},0.35)` : isActive || n === focus ? `rgb(${colors.glow})` : `rgb(${colors.accent})`;
      ctx.beginPath();
      ctx.arc(x, y, isActive ? r * 1.25 : r, 0, Math.PI * 2);
      ctx.fill();
      if (isActive) {
        ctx.strokeStyle = `rgba(${colors.glow},0.6)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.25 + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const showLabel = visible && (n === focus || isActive || (focus ? st.neighbors.has(n.id) : k > 1.1 || (filter && visible) || n.degree >= 4 / k));
      if (showLabel) labels.push([n, x, y, r, hot]);
    }

    // Užrašai virš mazgų
    ctx.font = `${Math.round(11 + Math.min(2, k))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const [n, x, y, r, hot] of labels) {
      const strong = n === focus || n.id === st.active;
      ctx.fillStyle = strong ? `rgb(${colors.glow})` : `rgba(${colors.fg},${hot ? 0.85 : 0.35})`;
      if (strong) {
        ctx.shadowColor = `rgba(${colors.accent},0.8)`;
        ctx.shadowBlur = 8;
      }
      ctx.fillText(n.label.length > 40 ? n.label.slice(0, 38) + '…' : n.label, x, y + r + 5);
      ctx.shadowBlur = 0;
    }
  }

  pick(layout: Layout, st: RenderState, sx: number, sy: number): SimNode | null {
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of layout.nodes) {
      const [x, y] = this.toScreen(st, n.x, n.y);
      const r = nodeRadius(n) * Math.max(0.6, Math.min(st.camera.k, 2.2)) + 6;
      const d = Math.hypot(x - sx, y - sy);
      if (d < r && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  destroy() {
    this.canvas.remove();
  }
}
