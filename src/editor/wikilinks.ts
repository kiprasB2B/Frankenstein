import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, MatchDecorator } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { noteName, dirname } from '../core/paths';

export interface LinkHost {
  notes(): string[];
  tags(): string[];
  exists(target: string): boolean;
  open(target: string, newTab: boolean): void;
  openTag(tag: string): void;
}

/** Automatinis pasiūlymas rašant „[[“ ir „#“. */
function completions(host: LinkHost) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const link = ctx.matchBefore(/\[\[[^\][\n|#]*/);
    if (link) {
      const from = link.from + 2;
      const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
      const options: Completion[] = host.notes().map((p) => ({
        label: noteName(p),
        detail: dirname(p) || undefined,
        type: 'text',
        apply: (view, _c, f, t) => {
          const name = noteName(p);
          const closing = after === ']]' ? '' : ']]';
          view.dispatch({
            changes: { from: f, to: t, insert: name + closing },
            selection: { anchor: f + name.length + 2 },
          });
        },
      }));
      return { from, options, validFor: /^[^\][\n|#]*$/ };
    }
    const tag = ctx.matchBefore(/(^|[\s(])#[\p{L}\p{N}_\-/]*/u);
    if (tag && (tag.text.length > 1 || ctx.explicit)) {
      const hash = tag.from + tag.text.indexOf('#');
      return {
        from: hash + 1,
        options: host.tags().map((t) => ({ label: t, type: 'keyword', detail: 'žyma' })),
        validFor: /^[\p{L}\p{N}_\-/]*$/u,
      };
    }
    return null;
  };
}

function linkDecorations(host: LinkHost) {
  const deco = new MatchDecorator({
    regexp: /\[\[([^[\]|#\n]+)(#[^[\]|\n]*)?(\|[^[\]\n]*)?\]\]|(?<=^|[\s(,;])#[\p{L}\p{N}_\-/]*[\p{L}_][\p{L}\p{N}_\-/]*/gu,
    decoration: (m) =>
      m[1] !== undefined
        ? Decoration.mark({
            class: 'cm-wikilink' + (host.exists(m[1].trim()) ? '' : ' unresolved'),
            attributes: { 'data-target': m[1].trim(), title: 'Ctrl + paspaudimas – atidaryti' },
          })
        : Decoration.mark({ class: 'cm-tag', attributes: { 'data-tag': m[0].slice(1).toLowerCase() } }),
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = deco.createDeco(view);
      }
      update(u: ViewUpdate) {
        this.decorations = deco.updateDeco(u, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function wikiLinkExtensions(host: LinkHost): Extension[] {
  return [
    autocompletion({ override: [completions(host)], icons: false, activateOnTyping: true, maxRenderedOptions: 60 }),
    linkDecorations(host),
    EditorView.domEventHandlers({
      mousedown(e) {
        const t = e.target as HTMLElement;
        if (!(e.ctrlKey || e.metaKey)) return false;
        const link = t.closest<HTMLElement>('.cm-wikilink');
        if (link?.dataset.target) {
          e.preventDefault();
          host.open(link.dataset.target, e.shiftKey);
          return true;
        }
        const tag = t.closest<HTMLElement>('.cm-tag');
        if (tag?.dataset.tag) {
          e.preventDefault();
          host.openTag(tag.dataset.tag);
          return true;
        }
        return false;
      },
    }),
    EditorView.theme({
      // Vidinė nuoroda – Secondary Blue; nesukurtas užrašas – „Dėmesio“; žyma – „Kategorijos“
      '.cm-wikilink': { color: 'var(--c-secondary)', cursor: 'pointer' },
      '.cm-wikilink.unresolved': { color: 'var(--c-warning)', textDecoration: 'underline dashed rgba(var(--rgb-warning), .5)' },
      '.cm-tag': { color: 'var(--c-category)', cursor: 'pointer' },
    }),
  ];
}
