// Paletė gyvena CSS kintamuosiuose (:root). Canvas piešiniai ją nuskaito iš čia.
const cache = new Map<string, string>();

export function cssVar(name: string): string {
  let v = cache.get(name);
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    cache.set(name, v);
  }
  return v;
}

export function hexToRgb(hex: string): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.replace(/./g, (c) => c + c) : m, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
