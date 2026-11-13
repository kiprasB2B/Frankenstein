import { h } from './dom';
import { icon } from './icons';
import { ParticleField } from './particles';
import { fsAccessSupported } from '../storage/fsAdapter';

export interface LandingOptions {
  storedFolder?: string;
  onOpenFolder(): void;
  onResumeFolder(): void;
  onBrowserVault(): void;
  onImportZip?(): void;
}

export const LOGO = `<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-opacity=".5" stroke-width="1.2"><path d="M14 20 L44 14 L50 44 L20 50 Z"/><path d="M14 20 L50 44 M44 14 L20 50"/></g><circle class="lm-a" cx="14" cy="20" r="3.2"/><circle class="lm-a" cx="44" cy="14" r="2.3"/><circle class="lm-a" cx="20" cy="50" r="2.3"/><circle class="lm-b" cx="50" cy="44" r="4"/></svg>`;

/** Ekranas, rodomas kai vault dar neatidarytas. */
export function renderLanding(opts: LandingOptions): { el: HTMLElement; destroy(): void } {
  const canvas = h('canvas', { class: 'landing-bg' });
  const fs = fsAccessSupported();
  const card = (ic: string, title: string, sub: string, fn: () => void, primary = false) =>
    h(
      'button',
      { class: 'landing-card' + (primary ? ' primary' : ''), onclick: fn },
      h('span', { class: 'landing-card-icon', html: icon(ic, 22) }),
      h('span', { class: 'landing-card-text' }, h('strong', null, title), h('small', null, sub)),
      h('span', { class: 'landing-card-arrow', html: icon('arrow-right', 16) }),
    );

  const el = h(
    'div',
    { class: 'landing' },
    canvas,
    h(
      'div',
      { class: 'landing-inner' },
      h('div', { class: 'landing-logo', html: LOGO }),
      h('h1', { class: 'landing-title', 'aria-label': 'ADAM' }, 'ADAM'),
      h('p', { class: 'landing-sub' }, 'Susietų minčių laboratorija. Markdown užrašai, wiki nuorodos ir švytintis žinių grafas – tiesiog naršyklėje.'),
      h(
        'div',
        { class: 'landing-cards' },
        opts.storedFolder && fs
          ? card('refresh', `Tęsti: ${opts.storedFolder}`, 'Atidaryti paskutinį naudotą aplanką', opts.onResumeFolder, true)
          : null,
        fs
          ? card('folder-open', 'Atidaryti aplanką', 'Užrašai saugomi kaip .md failai jūsų kompiuteryje', opts.onOpenFolder, !opts.storedFolder)
          : null,
        card('vault', 'Naršyklės vault', 'Užrašai saugomi šios naršyklės IndexedDB saugykloje', opts.onBrowserVault, !fs),
        opts.onImportZip ? card('upload', 'Importuoti .zip', 'Atkurti vault iš anksčiau eksportuoto archyvo', opts.onImportZip) : null,
      ),
      h(
        'p',
        { class: 'landing-note' },
        fs
          ? '„Atidaryti aplanką“ – pasirinkite bet kurį kompiuterio aplanką (pvz. Dokumentai/Užrašai): visi užrašai bus paprasti .md failai jame. Nežinote, ką rinktis? „Naršyklės vault“ – greičiausia pradžia; failus vėliau įkelsite mygtuku „Įkelti failus“.'
          : null,
      ),
      fs
        ? null
        : h('p', { class: 'landing-note' }, 'Jūsų naršyklė nepalaiko tiesioginės prieigos prie aplankų (File System Access API), todėl naudojama naršyklės saugykla. Duomenis galite bet kada eksportuoti kaip .zip.'),
    ),
  );
  const field = new ParticleField(canvas);
  return { el, destroy: () => field.destroy() };
}
