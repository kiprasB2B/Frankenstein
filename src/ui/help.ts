import { h } from './dom';
import { icon } from './icons';

/** Pagalbos langas: kaip pradėti, kur yra failai ir klavišų kombinacijos. */
export function openHelp(opts: { vaultKind: 'fs' | 'idb'; vaultName: string; onExplorer(): void; onUpload(): void; onSamples(): void }) {
  const o = h('div', { class: 'overlay settings-overlay' });
  const close = () => {
    o.classList.remove('open');
    setTimeout(() => o.remove(), 180);
  };
  const step = (n: number, title: string, text: string, action?: [string, () => void]) =>
    h(
      'div',
      { class: 'help-step' },
      h('span', { class: 'help-num' }, String(n)),
      h(
        'div',
        null,
        h('strong', null, title),
        h('p', null, text),
        action ? h('button', { class: 'btn', onclick: () => (close(), action[1]()) }, action[0]) : null,
      ),
    );
  const keys: [string, string][] = [
    ['Ctrl+O', 'Greitai atidaryti užrašą'],
    ['Ctrl+P', 'Komandų paletė'],
    ['Ctrl+Shift+F', 'Paieška visuose užrašuose'],
    ['Alt+E', 'Failų naršyklė'],
    ['Alt+N', 'Naujas užrašas'],
    ['Alt+D', 'Dienos užrašas'],
    ['Ctrl+E', 'Gyva peržiūra / šaltinis'],
    ['Ctrl+G', 'Grafas'],
    ['Ctrl+,', 'Nustatymai'],
  ];
  const where =
    opts.vaultKind === 'fs'
      ? `Jūsų užrašai yra kompiuterio aplanke „${opts.vaultName}“ – tai paprasti .md failai, kuriuos galite atidaryti ir kitomis programomis.`
      : 'Jūsų užrašai saugomi šios naršyklės atmintyje. Atsarginę kopiją pasidarykite apačioje esančiame vault meniu → „Eksportuoti .zip“.';
  const box = h(
    'div',
    { class: 'dialog settings help' },
    h(
      'div',
      { class: 'settings-head' },
      h('span', { class: 'dialog-title', html: icon('help', 16) + '<span>Kaip naudotis ADAM</span>' }),
      h('button', { type: 'button', class: 'icon-btn', title: 'Uždaryti', html: icon('x', 16), onclick: close }),
    ),
    h(
      'div',
      { class: 'settings-body' },
      h('div', { class: 'set-section' }, 'Pirmi žingsniai'),
      step(1, 'Failų naršyklė', 'Namų ikona kairėje atidaro naršyklę kaip Windows „File Explorer“: aplankai, failai, datos, paieška.', ['Atidaryti naršyklę', opts.onExplorer]),
      step(2, 'Pridėkite failų', 'Mygtukas „Įkelti failus“ priima .md, .txt ir paveikslėlius. Failus galite ir tiesiog įtempti iš kompiuterio į naršyklę ar redaktorių.', ['Įkelti failus', opts.onUpload]),
      step(3, 'Rašykite ir junkite', 'Atidarykite užrašą dvigubu paspaudimu. Rašykite [[ ir pasirinkite kitą užrašą – taip atsiranda ryšiai grafe.', ['Sukurti pavyzdinius užrašus', opts.onSamples]),
      step(4, 'Kur mano failai?', where),
      h('div', { class: 'set-section' }, 'Klavišai'),
      h('div', { class: 'help-keys' }, keys.map(([k, t]) => h('div', null, h('kbd', null, k), h('span', null, t)))),
    ),
  );
  o.append(box);
  o.addEventListener('mousedown', (e) => e.target === o && close());
  o.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  document.body.append(o);
  requestAnimationFrame(() => o.classList.add('open'));
  (box.querySelector('.icon-btn') as HTMLElement)?.focus();
}
