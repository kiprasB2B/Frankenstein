// Kelių pagalbinės funkcijos. Vault viduje keliai visada naudoja „/“ ir neturi pradinio „/“.

export function normalize(p: string): string {
  return p
    .split('/')
    .filter((s) => s && s !== '.')
    .join('/');
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join('/'));
}

export function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

export function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i).toLowerCase();
}

/** Užrašo pavadinimas be .md plėtinio. */
export function noteName(p: string): string {
  const b = basename(p);
  return b.toLowerCase().endsWith('.md') ? b.slice(0, -3) : b;
}

export function isMarkdown(p: string): boolean {
  return extname(p) === '.md';
}

export function isHidden(p: string): boolean {
  return p.split('/').some((s) => s.startsWith('.'));
}

/** Ar `child` yra `parent` aplanke (bet kokiame gylyje). */
export function isInside(child: string, parent: string): boolean {
  if (!parent) return true;
  return child === parent || child.startsWith(parent + '/');
}

const INVALID = /[\\/:*?"<>|#^[\]]/;

export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Pavadinimas negali būti tuščias.';
  if (INVALID.test(n)) return 'Pavadinime negali būti simbolių \\ / : * ? " < > | # ^ [ ]';
  if (n.startsWith('.')) return 'Pavadinimas negali prasidėti tašku.';
  return null;
}

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp'];

export function isImage(p: string): boolean {
  return IMAGE_EXT.includes(extname(p));
}

export const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};
