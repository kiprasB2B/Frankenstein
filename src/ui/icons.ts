// Plonos (1.25px) linijinės ikonos. Spalva paveldima per currentColor.
const P: Record<string, string> = {
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  'file-plus': '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M12 11v6M9 14h6"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  'folder-open': '<path d="M3 6h6l2 2h8v3"/><path d="M3 19l3-8h16l-3 8z"/><path d="M3 6v13"/>',
  'folder-plus': '<path d="M3 6h6l2 2h10v11H3z"/><path d="M12 11v5M9.5 13.5h5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  graph: '<circle cx="6" cy="7" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="16" cy="18" r="2"/><circle cx="7" cy="17" r="1.5"/><path d="M8 7.5l8-1M17.4 8l-1 8M8.4 16.8l5.6.9M7.5 9l-.4 6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  command: '<path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15zm0 0v6m0 0h2.5a2.5 2.5 0 1 1-2.5 2.5V15zm0 0H9m0 0v2.5A2.5 2.5 0 1 1 6.5 15H9z"/>',
  'chevron-right': '<path d="M10 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 10l6 6 6-6"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 4v16"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  'panel-left': '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16"/>',
  'panel-right': '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M15 4v16"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M4 20h16"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  vault: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5"/>',
  spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  hash: '<path d="M9 4L7 20M17 4l-2 16M4 9h16M3.5 15h16"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  zoom: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
};

export function icon(name: keyof typeof P | string, size = 16): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}

export function iconEl(name: string, size = 16): HTMLElement {
  const s = document.createElement('span');
  s.className = 'icon-wrap';
  s.innerHTML = icon(name, size);
  return s;
}
