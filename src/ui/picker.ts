import { h, clear } from './dom';
import { icon } from './icons';

// Bendras modalinis sąrašas: greitas perjungiklis ir komandų paletė.

export interface PickerItem {
  id: string;
  html: string; // pavadinimas (jau su <mark> paryškinimais)
  detail?: string;
  icon?: string;
  hint?: string; // pvz. klavišų kombinacija
}

export interface PickerOptions {
  placeholder: string;
  items(query: string): PickerItem[];
  onPick(item: PickerItem, query: string, e: KeyboardEvent | MouseEvent): void;
  footer?: string;
  empty?: string;
}

let current: { close(): void } | null = null;

export function openPicker(opts: PickerOptions) {
  current?.close();
  const input = h('input', { class: 'picker-input', placeholder: opts.placeholder, spellcheck: false, autocomplete: 'off' });
  const list = h('div', { class: 'picker-list', role: 'listbox' });
  const box = h(
    'div',
    { class: 'picker', role: 'dialog' },
    h('div', { class: 'picker-search', html: icon('search', 16) }, input),
    list,
    opts.footer ? h('div', { class: 'picker-footer', html: opts.footer }) : null,
  );
  const overlay = h('div', { class: 'overlay picker-overlay' }, box);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  let items: PickerItem[] = [];
  let sel = 0;
  const prevFocus = document.activeElement as HTMLElement | null;

  const render = () => {
    items = opts.items(input.value).slice(0, 100);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    clear(list);
    if (!items.length) list.append(h('div', { class: 'picker-empty' }, opts.empty ?? 'Nieko nerasta.'));
    items.forEach((it, i) => {
      const row = h(
        'div',
        {
          class: 'picker-item' + (i === sel ? ' sel' : ''),
          role: 'option',
          onmousemove: () => {
            if (sel !== i) {
              sel = i;
              updateSel();
            }
          },
          onclick: (e: MouseEvent) => pick(i, e),
        },
        it.icon ? h('span', { class: 'picker-icon', html: icon(it.icon, 15) }) : null,
        h('span', { class: 'picker-main' }, h('span', { class: 'picker-title', html: it.html }), it.detail ? h('span', { class: 'picker-detail' }, it.detail) : null),
        it.hint ? h('kbd', null, it.hint) : null,
      );
      list.append(row);
    });
  };
  const updateSel = () => {
    list.querySelectorAll('.picker-item').forEach((el, i) => el.classList.toggle('sel', i === sel));
    list.querySelector('.picker-item.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const close = (restore = true) => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 180);
    current = null;
    if (restore) prevFocus?.focus?.();
  };
  const pick = (i: number, e: KeyboardEvent | MouseEvent) => {
    const it = items[i];
    if (!it) return;
    const q = input.value;
    close(false);
    opts.onPick(it, q, e);
  };

  input.addEventListener('input', () => {
    sel = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      sel = (sel + 1) % Math.max(1, items.length);
      updateSel();
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      sel = (sel - 1 + items.length) % Math.max(1, items.length);
      updateSel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(sel, e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
  render();
  input.focus();
  current = { close };
}
