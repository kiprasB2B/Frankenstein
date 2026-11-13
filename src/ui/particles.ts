// Švytinčių dalelių laukas juodame fone (pradžios ekranui).
import { cssVar, hexToRgb } from './theme';

export class ParticleField {
  private ctx: CanvasRenderingContext2D;
  private pts: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
  private raf = 0;
  private mouse = { x: -1e4, y: -1e4 };
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private count = 70) {
    this.ctx = canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    canvas.addEventListener('pointerleave', () => (this.mouse = { x: -1e4, y: -1e4 }));
    this.resize();
    this.loop();
  }

  private resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(this.count * Math.min(1, (w * h) / (1280 * 800)) + 20);
    this.pts = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.4 + 0.4,
    }));
  }

  private loop = () => {
    const { ctx } = this;
    const w = this.canvas.clientWidth;
    const hgt = this.canvas.clientHeight;
    const accent = hexToRgb(cssVar('--c-accent'));
    const fg = hexToRgb(cssVar('--c-fg'));
    ctx.clearRect(0, 0, w, hgt);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const p of this.pts) {
      if (!reduce) {
        p.x += p.vx;
        p.y += p.vy;
      }
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > hgt) p.vy *= -1;
    }
    const maxD = 120;
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[i];
      for (let j = i + 1; j < this.pts.length; j++) {
        const b = this.pts[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < maxD) {
          ctx.strokeStyle = `rgba(${fg},${0.08 * (1 - d / maxD)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const p of this.pts) {
      const near = Math.hypot(p.x - this.mouse.x, p.y - this.mouse.y) < 140;
      ctx.shadowBlur = near ? 12 : 6;
      ctx.shadowColor = `rgba(${accent},0.9)`;
      ctx.fillStyle = near ? cssVar('--c-glow') : `rgba(${accent},0.75)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, near ? p.r + 0.8 : p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    this.raf = requestAnimationFrame(this.loop);
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }
}
