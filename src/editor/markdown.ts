import MarkdownItCtor from 'markdown-it';
import type { StateCore } from 'markdown-it';

// Peržiūros režimo atvaizdavimas per markdown-it su ADAM plėtiniais.

export interface RenderContext {
  /** Grąžina užrašo kelią pagal wiki nuorodos tikslą arba undefined. */
  resolve(target: string): string | undefined;
}

type MarkdownIt = InstanceType<typeof MarkdownItCtor>;

const TASK_RE = /^\[([ xX])\][  ]/;

/** - [ ] / - [x] → paspaudžiamos varnelės su šaltinio eilutės numeriu. */
function taskLists(md: MarkdownIt) {
  md.core.ruler.after('inline', 'fr_tasks', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
      const first = tok.children?.[0];
      if (!first || first.type !== 'text') continue;
      const m = TASK_RE.exec(first.content);
      if (!m) continue;
      const li = tokens[i - 2];
      const line = li.map?.[0] ?? tok.map?.[0] ?? 0;
      const checked = m[1] !== ' ';
      li.attrJoin('class', 'task-item' + (checked ? ' done' : ''));
      first.content = first.content.slice(m[0].length);
      const cb = new state.Token('html_inline', '', 0);
      cb.content = `<input type="checkbox" class="task-check" data-line="${line}"${checked ? ' checked' : ''} aria-label="Užduotis">`;
      tok.children!.unshift(cb);
    }
  });
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** [[Užrašas]], [[Užrašas|tekstas]], [[Užrašas#antraštė]] */
function wikiLinks(md: MarkdownIt, ctx: RenderContext) {
  md.inline.ruler.before('link', 'fr_wikilink', (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b) return false;
    const end = src.indexOf(']]', start + 2);
    if (end === -1) return false;
    const inner = src.slice(start + 2, end);
    if (!inner || /[\[\]\n]/.test(inner)) return false;
    if (!silent) {
      const [targetPart, alias] = inner.split('|');
      const [target, heading] = targetPart.split('#');
      const t = target.trim();
      const resolved = ctx.resolve(t);
      const label = alias?.trim() || (heading ? `${t} › ${heading}` : t);
      const tok = state.push('html_inline', '', 0);
      tok.content = `<a href="#" class="wikilink${resolved ? '' : ' unresolved'}" data-target="${esc(t)}" title="${esc(
        resolved ?? 'Sukurti „' + t + '“',
      )}">${esc(label)}</a>`;
    }
    state.pos = end + 2;
    return true;
  });
}

const TAG_AT = /^#((?:[\p{L}\p{N}_\-/])*[\p{L}_](?:[\p{L}\p{N}_\-/])*)/u;

/** #žymos – paspaudžiamos. */
function tags(md: MarkdownIt) {
  md.inline.ruler.before('emphasis', 'fr_tag', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x23) return false;
    const prev = state.pos > 0 ? state.src[state.pos - 1] : ' ';
    if (!/[\s(,;]/.test(prev)) return false;
    const m = TAG_AT.exec(state.src.slice(state.pos));
    if (!m) return false;
    if (!silent) {
      const tok = state.push('html_inline', '', 0);
      tok.content = `<a href="#" class="tag" data-tag="${esc(m[1].toLowerCase())}">#${esc(m[1])}</a>`;
    }
    state.pos += m[0].length;
    return true;
  });
}

export function createRenderer(ctx: RenderContext) {
  const md = new MarkdownItCtor({ html: false, linkify: true, breaks: true, typographer: false });
  md.use(taskLists);
  md.use(wikiLinks, ctx);
  md.use(tags);

  // Išorinės nuorodos atidaromos naujame lange.
  const defaultLinkOpen = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const href = String(tokens[idx].attrGet('href') ?? '');
    if (/^[a-z]+:/i.test(href)) {
      tokens[idx].attrSet('target', '_blank');
      tokens[idx].attrSet('rel', 'noopener noreferrer');
      tokens[idx].attrJoin('class', 'external');
    }
    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  // Blokams pridedame šaltinio eilutės numerį (naršymui iš paieškos/nuorodų).
  md.core.ruler.push('fr_lines', (state) => {
    for (const t of state.tokens) if (t.map && t.nesting === 1) t.attrSet('data-src-line', String(t.map[0]));
  });

  return {
    render: (src: string) => md.render(src),
  };
}

/** Perjungia varnelę nurodytoje eilutėje. Grąžina naują tekstą arba null. */
export function toggleTaskAt(src: string, line: number): string | null {
  const lines = src.split('\n');
  const l = lines[line];
  if (l === undefined) return null;
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(l);
  if (!m) return null;
  lines[line] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + l.slice(m[0].length);
  return lines.join('\n');
}
