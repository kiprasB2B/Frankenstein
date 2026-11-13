import { h } from './dom';
import { icon } from './icons';
import { DEFAULT_SETTINGS, type Settings } from '../workspace/types';

/** Nustatymų langas. Grąžina naujus nustatymus arba null, jei atšaukta. */
export function openSettings(current: Settings, folders: string[]): Promise<Settings | null> {
  return new Promise((resolve) => {
    const s: Settings = { ...current };
    const o = h('div', { class: 'overlay settings-overlay' });
    const listId = 'fr-folders';
    const datalist = h('datalist', { id: listId }, folders.map((f) => h('option', { value: f })));

    const field = (label: string, hint: string, control: HTMLElement) =>
      h('label', { class: 'set-field' }, h('span', { class: 'set-label' }, label), control, hint ? h('small', { class: 'set-hint' }, hint) : null);

    const mode = h(
      'select',
      { class: 'input' },
      h('option', { value: 'live' }, 'Gyva peržiūra'),
      h('option', { value: 'source' }, 'Šaltinis'),
      h('option', { value: 'preview' }, 'Skaitymas'),
    );
    mode.value = s.defaultMode;
    const graph = h('select', { class: 'input' }, h('option', { value: '2d' }, '2D'), h('option', { value: '3d' }, '3D'));
    graph.value = s.graphMode;
    const daily = h('input', { class: 'input', value: s.dailyFolder, list: listId, placeholder: '(vault šaknis)' });
    const attach = h('input', { class: 'input', value: s.attachmentFolder, list: listId, placeholder: '(vault šaknis)' });
    const tpl = h('textarea', { class: 'input set-textarea', spellcheck: false, rows: 7 });
    tpl.value = s.dailyTemplate;
    const delay = h('input', { class: 'input', type: 'number', min: 100, max: 10000, step: 100, value: String(s.autosaveDelay) });
    const font = h('input', { class: 'set-range', type: 'range', min: 12, max: 22, step: 1, value: String(s.fontSize) });
    const fontOut = h('span', { class: 'set-range-value' }, `${s.fontSize} px`);
    font.addEventListener('input', () => {
      fontOut.textContent = `${font.value} px`;
      document.documentElement.style.setProperty('--editor-font-size', font.value + 'px');
    });

    const collect = (): Settings => ({
      ...s,
      defaultMode: mode.value as Settings['defaultMode'],
      graphMode: graph.value as Settings['graphMode'],
      dailyFolder: daily.value.trim().replace(/^\/+|\/+$/g, ''),
      attachmentFolder: attach.value.trim().replace(/^\/+|\/+$/g, ''),
      dailyTemplate: tpl.value,
      autosaveDelay: Math.min(10000, Math.max(100, Number(delay.value) || DEFAULT_SETTINGS.autosaveDelay)),
      fontSize: Number(font.value),
    });
    const done = (v: Settings | null) => {
      if (!v) document.documentElement.style.setProperty('--editor-font-size', current.fontSize + 'px');
      o.classList.remove('open');
      setTimeout(() => o.remove(), 180);
      resolve(v);
    };
    const reset = () => {
      mode.value = DEFAULT_SETTINGS.defaultMode;
      graph.value = DEFAULT_SETTINGS.graphMode;
      daily.value = DEFAULT_SETTINGS.dailyFolder;
      attach.value = DEFAULT_SETTINGS.attachmentFolder;
      tpl.value = DEFAULT_SETTINGS.dailyTemplate;
      delay.value = String(DEFAULT_SETTINGS.autosaveDelay);
      font.value = String(DEFAULT_SETTINGS.fontSize);
      font.dispatchEvent(new Event('input'));
    };

    const box = h(
      'form',
      {
        class: 'dialog settings',
        onsubmit: (e: Event) => {
          e.preventDefault();
          done(collect());
        },
      },
      h('div', { class: 'settings-head' }, h('span', { class: 'dialog-title', html: icon('settings', 16) + '<span>Nustatymai</span>' }),
        h('button', { type: 'button', class: 'icon-btn', title: 'Uždaryti', html: icon('x', 16), onclick: () => done(null) })),
      h(
        'div',
        { class: 'settings-body' },
        h('div', { class: 'set-section' }, 'Redaktorius'),
        field('Numatytasis režimas', 'Kaip atidaromi nauji užrašai. Ctrl+E perjungia gyvą peržiūrą ir šaltinį.', mode),
        h('div', { class: 'set-field' }, h('span', { class: 'set-label' }, 'Šrifto dydis'), h('div', { class: 'set-range-row' }, font, fontOut)),
        field('Automatinio išsaugojimo delsa (ms)', 'Kiek palaukti po paskutinio klavišo paspaudimo prieš įrašant failą.', delay),
        h('div', { class: 'set-section' }, 'Dienos užrašai'),
        field('Aplankas', 'Kur kuriami dienos užrašai (pavadinimas – šiandienos data).', daily),
        field('Šablonas', 'Kintamieji: {{data}} – 2026-11-13, {{diena}} – savaitės diena ir data, {{laikas}} – 14:05.', tpl),
        h('div', { class: 'set-section' }, 'Failai ir grafas'),
        field('Priedų aplankas', 'Kur išsaugomi įklijuoti ar įtempti paveikslėliai.', attach),
        field('Grafo režimas', 'Kuriuo režimu atidaromas grafas (perjungti galima ir grafo įrankių juostoje).', graph),
        datalist,
      ),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: reset }, 'Atkurti numatytuosius'),
        h('span', { style: 'flex:1' }),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Atšaukti'),
        h('button', { type: 'submit', class: 'btn primary' }, 'Išsaugoti'),
      ),
    );
    o.append(box);
    o.addEventListener('mousedown', (e) => e.target === o && done(null));
    box.addEventListener('keydown', (e) => e.key === 'Escape' && done(null));
    document.body.append(o);
    requestAnimationFrame(() => o.classList.add('open'));
    setTimeout(() => mode.focus(), 30);
  });
}

/** Užpildo dienos užrašo šabloną. */
export function fillTemplate(tpl: string, d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const vars: Record<string, string> = {
    data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    diena: d.toLocaleDateString('lt-LT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    laikas: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => vars[k.toLowerCase()] ?? m);
}
