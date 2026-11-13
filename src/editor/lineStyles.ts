import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';

// Prideda eilučių klases antraštėms, citatoms ir kodo blokams (šaltinio režime).
function build(view: EditorView): DecorationSet {
  const out: Range<Decoration>[] = [];
  const add = (from: number, to: number, cls: string) => {
    const doc = view.state.doc;
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      out.push(Decoration.line({ class: cls }).range(line.from));
      pos = line.to + 1;
    }
  };
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (n) => {
        const m = /^ATXHeading(\d)$|^SetextHeading(\d)$/.exec(n.name);
        if (m) add(n.from, n.to, 'md-h' + (m[1] || m[2]));
        else if (n.name === 'Blockquote') add(n.from, n.to, 'md-quote');
        else if (n.name === 'FencedCode' || n.name === 'CodeBlock') add(n.from, n.to, 'md-code');
      },
    });
  }
  out.sort((a, b) => a.from - b.from);
  // Pašaliname dublikatus toje pačioje eilutėje.
  return Decoration.set(out.filter((r, i) => i === 0 || r.from !== out[i - 1].from || r.value.spec.class !== out[i - 1].value.spec.class));
}

export const lineStyles = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.transactions.length) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
