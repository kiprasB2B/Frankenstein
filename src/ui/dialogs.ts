import { h } from './dom';
import { iconEl } from './icons';

// Stilizuoti dialogai (vietoje naršyklės prompt/confirm) ir pranešimai.

function overlay(): HTMLDivElement {
  const o = h('div', { class: 'overlay' });
  document.body.append(o);
  requestAnimationFrame(() => o.classList.add('open'));
  return o;
}

function closeOverlay(o: HTMLElement) {
  o.classList.remove('open');
  setTimeout(() => o.remove(), 180);
}

export function promptDialog(title: string, value = '', okText = 'Gerai'): Promise<string | null> {
  return new Promise((resolve) => {
    const o = overlay();
    const input = h('input', { class: 'input', value, spellcheck: false });
    const done = (v: string | null) => {
      closeOverlay(o);
      resolve(v);
    };
    const form = h(
      'form',
      {
        class: 'dialog',
        onsubmit: (e: Event) => {
          e.preventDefault();
          done(input.value);
        },
      },
      h('div', { class: 'dialog-title' }, title),
      input,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Atšaukti'),
        h('button', { type: 'submit', class: 'btn primary' }, okText),
      ),
    );
    o.append(form);
    o.addEventListener('mousedown', (e) => e.target === o && done(null));
    form.addEventListener('keydown', (e) => e.key === 'Escape' && done(null));
    setTimeout(() => {
      input.focus();
      const dot = value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : value.length);
    }, 30);
  });
}

export function confirmDialog(title: string, text: string, okText = 'Patvirtinti', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const o = overlay();
    const done = (v: boolean) => {
      closeOverlay(o);
      resolve(v);
    };
    const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, okText);
    const box = h(
      'div',
      { class: 'dialog', tabindex: -1 },
      h('div', { class: 'dialog-title' }, title),
      h('p', { class: 'dialog-text' }, text),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Atšaukti'), ok),
    );
    o.append(box);
    o.addEventListener('mousedown', (e) => e.target === o && done(false));
    box.addEventListener('keydown', (e) => e.key === 'Escape' && done(false));
    setTimeout(() => ok.focus(), 30);
  });
}

let toastHost: HTMLElement | null = null;

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
const TOAST_ICON: Record<ToastKind, string> = { info: 'spark', success: 'check', warning: 'alert', error: 'alert-octagon' };

/** Pranešimas: spalva + piktograma + tekstas (spalva niekada nėra vienintelis ženklas). */
export function toast(text: string, kind: ToastKind = 'info') {
  if (!toastHost) document.body.append((toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })));
  const t = h('div', { class: `toast ${kind}` }, iconEl(TOAST_ICON[kind], 14), h('span', null, text));
  toastHost.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, kind === 'error' || kind === 'warning' ? 5000 : 2600);
}

// ---- Kontekstinis meniu ----
export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  action: () => void;
}

let openMenu: HTMLElement | null = null;

export function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}

export function showMenu(x: number, y: number, items: (MenuItem | 'sep')[]) {
  closeMenu();
  const m = h(
    'div',
    { class: 'ctx-menu', role: 'menu' },
    items.map((it) =>
      it === 'sep'
        ? h('div', { class: 'ctx-sep' })
        : h(
            'button',
            {
              class: 'ctx-item' + (it.danger ? ' danger' : ''),
              role: 'menuitem',
              onclick: () => {
                closeMenu();
                it.action();
              },
            },
            it.icon ? iconEl(it.icon, 14) : null,
            h('span', null, it.label),
          ),
    ),
  );
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  requestAnimationFrame(() => m.classList.add('open'));
  openMenu = m;
}

document.addEventListener('mousedown', (e) => {
  if (openMenu && !openMenu.contains(e.target as Node)) closeMenu();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());
