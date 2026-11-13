import MarkdownItCtor from 'markdown-it';
import type { StateCore } from 'markdown-it';

// Peržiūros režimo atvaizdavimas per markdown-it su Frankenstein plėtiniais.

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

export function createRenderer(_ctx: RenderContext) {
  const md = new MarkdownItCtor({ html: false, linkify: true, breaks: true, typographer: false });
  md.use(taskLists);

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
