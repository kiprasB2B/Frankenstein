import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';

// Obsidian tipo „gyva peržiūra“: Markdown simboliai slepiami visur, išskyrus eilutes,
// kuriose yra žymeklis. Varnelės, paveikslėliai ir horizontalios linijos piešiami valdikliais.

export interface LiveHost {
  openLink(target: string, newTab: boolean): void;
  /** Grąžina naršyklėje rodomą paveikslėlio adresą (vault failui – blob URL). */
  resolveImage?(src: string, fromPath?: string): Promise<string | null>;
  currentPath?(): string | null;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const WIKI_RE = /(!?)\[\[([^[\]\n]+?)\]\]/g;

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(o: CheckboxWidget) {
    return o.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'task-check cm-task-check';
    box.checked = this.checked;
    box.setAttribute('aria-label', 'Užduotis');
    box.addEventListener('mousedown', (e) => e.preventDefault());
    box.addEventListener('click', (e) => {
      e.preventDefault();
      const line = view.state.doc.lineAt(view.posAtDOM(box));
      const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(line.text);
      if (!m) return;
      const at = line.from + m[1].length;
      view.dispatch({ changes: { from: at, to: at + 1, insert: m[2] === ' ' ? 'x' : ' ' } });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-bullet';
    s.textContent = '•';
    return s;
  }
}

class HrWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-hr';
    return s;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly host: LiveHost,
  ) {
    super();
  }
  eq(o: ImageWidget) {
    return o.src === this.src && o.alt === this.alt;
  }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-embed-img';
    const img = document.createElement('img');
    img.alt = this.alt;
    img.title = this.alt || this.src;
    img.loading = 'lazy';
    wrap.append(img);
    if (/^(https?:|data:|blob:)/i.test(this.src)) img.src = this.src;
    else if (this.host.resolveImage) {
      this.host.resolveImage(this.src, this.host.currentPath?.() ?? undefined).then((url) => {
        if (url) img.src = url;
        else {
          wrap.classList.add('missing');
          wrap.textContent = `Paveikslėlis nerastas: ${this.src}`;
        }
      });
    }
    return wrap;
  }
}

function activeLines(view: EditorView): Set<number> {
  const set = new Set<number>();
  // Kol redaktorius neaktyvus – rodome viską kaip peržiūrą.
  if (!view.hasFocus) return set;
  const doc = view.state.doc;
  for (const r of view.state.selection.ranges) {
    const a = doc.lineAt(r.from).number;
    const b = doc.lineAt(r.to).number;
    for (let i = a; i <= b; i++) set.add(i);
  }
  return set;
}

function build(view: EditorView, host: LiveHost): DecorationSet {
  const out: Range<Decoration>[] = [];
  const doc = view.state.doc;
  const active = activeLines(view);
  const hide = Decoration.replace({});
  const isActive = (pos: number) => active.has(doc.lineAt(pos).number);
  const wikiRanges: [number, number][] = [];
  const inWiki = (from: number, to: number) => wikiRanges.some(([a, b]) => from < b && to > a);

  // 1) [[wiki nuorodos]] ir ![[įterpiniai]]
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      for (const m of line.text.matchAll(WIKI_RE)) {
        const start = line.from + m.index!;
        const end = start + m[0].length;
        wikiRanges.push([start, end]);
        if (active.has(line.number)) continue;
        const inner = m[2];
        const [targetPart, alias] = inner.split('|');
        if (m[1] === '!' && IMAGE_EXT.test(targetPart.trim())) {
          out.push(Decoration.replace({ widget: new ImageWidget(targetPart.trim(), alias ?? '', host) }).range(start, end));
          continue;
        }
        const open = start + m[1].length + 2; // po „[[“
        if (alias !== undefined) {
          out.push(hide.range(start, open + targetPart.length + 1));
        } else out.push(hide.range(start, open));
        out.push(hide.range(end - 2, end));
      }
      pos = line.to + 1;
    }
  }

  // 2) Markdown sintaksė
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (n) => {
        const name = n.name;
        if (inWiki(n.from, n.to)) return;
        switch (name) {
          case 'HeaderMark': {
            if (isActive(n.from)) return;
            const next = doc.sliceString(n.to, n.to + 1);
            out.push(hide.range(n.from, next === ' ' ? n.to + 1 : n.to));
            return;
          }
          case 'EmphasisMark':
          case 'StrikethroughMark':
            if (!isActive(n.from)) out.push(hide.range(n.from, n.to));
            return;
          case 'CodeMark':
            if (n.node.parent?.name === 'InlineCode' && !isActive(n.from)) out.push(hide.range(n.from, n.to));
            return;
          case 'QuoteMark': {
            if (isActive(n.from)) return;
            const next = doc.sliceString(n.to, n.to + 1);
            out.push(hide.range(n.from, next === ' ' ? n.to + 1 : n.to));
            return;
          }
          case 'HorizontalRule':
            if (!isActive(n.from)) out.push(Decoration.replace({ widget: new HrWidget() }).range(n.from, n.to));
            return;
          case 'ListMark': {
            if (isActive(n.from)) return;
            const item = n.node.parent;
            const task = item?.getChild('Task');
            const marker = task?.getChild('TaskMarker');
            if (marker) {
              const text = doc.sliceString(marker.from, marker.to);
              const after = doc.sliceString(marker.to, marker.to + 1) === ' ' ? 1 : 0;
              out.push(Decoration.replace({ widget: new CheckboxWidget(/x/i.test(text)) }).range(n.from, marker.to + after));
              const lineEnd = doc.lineAt(n.from).to;
              if (/x/i.test(text)) out.push(Decoration.mark({ class: 'cm-task-done' }).range(marker.to, lineEnd));
              return;
            }
            const mark = doc.sliceString(n.from, n.to);
            if (/^[-*+]$/.test(mark)) out.push(Decoration.replace({ widget: new BulletWidget() }).range(n.from, n.to));
            return;
          }
          case 'Image': {
            if (isActive(n.from)) return false;
            const url = n.node.getChild('URL');
            if (!url) return false;
            const src = doc.sliceString(url.from, url.to).replace(/^<|>$/g, '');
            const text = doc.sliceString(n.from, n.to);
            const alt = /^!\[([^\]]*)\]/.exec(text)?.[1] ?? '';
            out.push(Decoration.replace({ widget: new ImageWidget(decodeURI(src), alt, host) }).range(n.from, n.to));
            return false;
          }
          case 'Link': {
            const url = n.node.getChild('URL');
            if (!url || isActive(n.from)) return;
            const marks = n.node.getChildren('LinkMark');
            if (marks.length < 2) return;
            const href = doc.sliceString(url.from, url.to).replace(/^<|>$/g, '');
            out.push(hide.range(marks[0].from, marks[0].to));
            out.push(Decoration.mark({ class: 'cm-md-link', attributes: { 'data-href': href, title: href } }).range(marks[0].to, marks[1].from));
            out.push(hide.range(marks[1].from, n.to));
            return false;
          }
        }
      },
    });
  }
  return Decoration.set(out, true);
}

export function livePreview(host: LiveHost): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, host);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || u.transactions.some((t) => t.reconfigured))
          this.decorations = build(u.view, host);
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(e, view) {
          if (e.button !== 0) return false;
          const t = e.target as HTMLElement;
          const link = t.closest<HTMLElement>('.cm-wikilink');
          const ext = t.closest<HTMLElement>('.cm-md-link');
          const el = link ?? ext;
          if (!el) return false;
          // Jei eilutė jau atidaryta redagavimui – leidžiame statyti žymeklį.
          const line = view.state.doc.lineAt(view.posAtDOM(el)).number;
          if (activeLines(view).has(line) && !(e.ctrlKey || e.metaKey)) return false;
          e.preventDefault();
          if (link?.dataset.target) host.openLink(link.dataset.target, e.ctrlKey || e.metaKey);
          else if (ext?.dataset.href) window.open(ext.dataset.href, '_blank', 'noopener');
          return true;
        },
      },
    },
  );
  return [
    plugin,
    EditorView.editorAttributes.of({ class: 'cm-live' }),
    EditorView.theme({
      '.cm-bullet': { color: 'var(--c-accent)', padding: '0 4px 0 2px', textShadow: 'var(--glow-text)' },
      '.cm-hr': {
        display: 'inline-block',
        width: '100%',
        height: '1px',
        verticalAlign: 'middle',
        background: 'linear-gradient(90deg, transparent, var(--c-line-strong), transparent)',
      },
      '.cm-md-link': { color: 'var(--c-info)', cursor: 'pointer', borderBottom: '1px solid rgba(var(--rgb-info), .35)' },
      '.cm-task-check': { margin: '0 8px 0 2px !important', verticalAlign: '-2px' },
      '.cm-task-done': { color: 'var(--c-text-faint)', textDecoration: 'line-through rgba(var(--rgb-success), .5)' },
      '.cm-embed-img': { display: 'inline-block', maxWidth: '100%', margin: '4px 0' },
      '.cm-embed-img img': { maxWidth: '100%', maxHeight: '480px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--c-line)', display: 'block' },
      '.cm-embed-img.missing': { color: 'var(--c-text-faint)', fontSize: '12px', border: '1px dashed var(--c-line-strong)', padding: '4px 8px', borderRadius: 'var(--radius)' },
      '&.cm-live .cm-wikilink': { cursor: 'pointer' },
    }),
  ];
}
