import { h } from './dom';
import { icon } from './icons';
import { LOGO } from './landing';
import { SAMPLES } from '../samples';
import type { GraphData, RenderState } from '../graph/types';
import { WIKILINK_RE } from '../core/noteIndex';

export interface WelcomeActions {
  createSamples(open?: string): void;
  newNote(): void;
  importZip(): void;
  openDaily(): void;
  upload?(): void;
}

function sampleGraph(): GraphData {
  const names = new Set(SAMPLES.map((s) => s.name));
  const links: GraphData['links'] = [];
  const extra = new Set<string>();
  for (const s of SAMPLES) {
    for (const m of s.body.matchAll(WIKILINK_RE)) {
      const t = m[1].trim();
      if (!names.has(t)) extra.add(t);
      if (t !== s.name) links.push({ source: s.name, target: t });
    }
  }
  return {
    nodes: [
      ...SAMPLES.map((s) => ({ id: s.name, label: s.name, exists: true, tags: [] })),
      ...[...extra].map((t) => ({ id: t, label: t, exists: false, tags: [] })),
    ],
    links,
  };
}

/** Interaktyvus „pradžios“ ekranas, kai vault tuščias. */
export function renderWelcome(actions: WelcomeActions): HTMLElement {
  const stage = h('div', { class: 'welcome-graph' });
  const card = h('div', { class: 'welcome-card' });
  const state: RenderState = { camera: { x: 0, y: 0, k: 1.5 }, hover: null, active: 'Sveiki atvykę', neighbors: new Set(), filter: '' };

  const describe = (id: string | null) => {
    const s = SAMPLES.find((x) => x.name === id);
    card.innerHTML = s
      ? `<strong>${s.name}</strong><span>${s.blurb}</span><em>Paspauskite, kad sukurtumėte pavyzdžius ir atidarytumėte šį užrašą</em>`
      : id
        ? `<strong>${id}</strong><span>Šio užrašo dar nėra – nuoroda jį sukurs.</span>`
        : `<strong>Pavyzdinis žinių tinklas</strong><span>Užveskite pelę ant dalelės.</span>`;
  };
  describe(null);

  const el = h(
    'div',
    { class: 'welcome' },
    h(
      'div',
      { class: 'welcome-text' },
      h('div', { class: 'empty-logo', html: LOGO }),
      h('h2', null, 'Laboratorija tuščia'),
      h('p', null, 'Pradėkite nuo pavyzdinių susietų užrašų – jie parodys wiki nuorodas, žymas, varneles ir grafą. Arba sukurkite savo pirmą užrašą.'),
      h(
        'div',
        { class: 'welcome-actions' },
        h('button', { class: 'btn primary', html: icon('spark', 14) + 'Sukurti pavyzdinius užrašus', onclick: () => actions.createSamples() }),
        h('button', { class: 'btn', html: icon('file-plus', 14) + 'Naujas užrašas', onclick: () => actions.newNote() }),
        actions.upload ? h('button', { class: 'btn', html: icon('upload', 14) + 'Įkelti failus', onclick: () => actions.upload!() }) : null,
        h('button', { class: 'btn', html: icon('calendar', 14) + 'Dienos užrašas', onclick: () => actions.openDaily() }),
        h('button', { class: 'btn ghost', html: icon('upload', 14) + 'Importuoti .zip', onclick: () => actions.importZip() }),
      ),
    ),
    h('div', { class: 'welcome-visual' }, stage, card),
  );

  // Grafo variklis (d3-force) kraunamas tik tada, kai rodomas šis ekranas.
  Promise.all([import('../graph/forceLayout2d'), import('../graph/canvasRenderer2d')]).then(([{ ForceLayout2D }, { CanvasRenderer2D }]) => {
    const layout = new ForceLayout2D();
    const renderer = new CanvasRenderer2D();
    stage.append(renderer.canvas);
    layout.setData(sampleGraph());
    let raf = 0;
    const ro = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      renderer.resize(r.width, r.height);
    });
    ro.observe(stage);
    const loop = () => {
      if (!el.isConnected && raf) {
        // Vaizdas pašalintas – sustabdome.
        cancelAnimationFrame(raf);
        layout.stop();
        ro.disconnect();
        return;
      }
      const t = performance.now() / 4000;
      state.camera.x = Math.sin(t) * 6;
      state.camera.y = Math.cos(t * 0.8) * 4;
      renderer.draw(layout, state);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const local = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    stage.addEventListener('pointermove', (e) => {
      const n = renderer.pick(layout, state, ...local(e));
      state.hover = n;
      state.neighbors = new Set(n ? layout.links.filter((l) => l.source === n || l.target === n).flatMap((l) => [l.source.id, l.target.id]) : []);
      stage.style.cursor = n ? 'pointer' : 'default';
      describe(n?.id ?? null);
    });
    stage.addEventListener('pointerleave', () => {
      state.hover = null;
      describe(null);
    });
    stage.addEventListener('click', (e) => {
      const n = renderer.pick(layout, state, ...local(e as PointerEvent));
      if (n) actions.createSamples(n.exists ? n.id : SAMPLES[0].name);
    });
  });
  return el;
}
