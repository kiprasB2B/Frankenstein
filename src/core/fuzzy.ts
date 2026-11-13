// Paprasta „fuzzy“ paieška: simboliai turi eiti iš eilės; balas didesnis už gretimus ir žodžių pradžias.

export interface FuzzyResult {
  score: number;
  indices: number[];
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function fuzzy(query: string, text: string): FuzzyResult | null {
  if (!query) return { score: 0, indices: [] };
  const q = fold(query);
  const t = fold(text);
  // Tikslus poeilutės atitikmuo – geriausias.
  const sub = t.indexOf(q);
  if (sub !== -1) {
    const bonus = sub === 0 ? 30 : /[\s/_\-.]/.test(t[sub - 1]) ? 20 : 10;
    return { score: 100 + bonus - t.length * 0.1, indices: Array.from({ length: q.length }, (_, i) => sub + i) };
  }
  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    score += found === prev + 1 ? 5 : 1;
    if (found === 0 || /[\s/_\-.]/.test(t[found - 1])) score += 3;
    indices.push(found);
    prev = found;
    ti = found + 1;
  }
  return { score: score - t.length * 0.05, indices };
}

export function highlight(text: string, indices: number[], esc: (s: string) => string): string {
  if (!indices.length) return esc(text);
  const set = new Set(indices);
  let out = '';
  let open = false;
  for (let i = 0; i < text.length; i++) {
    const m = set.has(i);
    if (m && !open) {
      out += '<mark>';
      open = true;
    } else if (!m && open) {
      out += '</mark>';
      open = false;
    }
    out += esc(text[i]);
  }
  return out + (open ? '</mark>' : '');
}
