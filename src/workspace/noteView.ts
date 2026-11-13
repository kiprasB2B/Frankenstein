import { EditorView } from '@codemirror/view';
import { Compartment, type EditorState } from '@codemirror/state';
import { livePreview } from '../editor/livePreview';
import { createEditorState } from '../editor/setup';
import { toggleTaskAt } from '../editor/markdown';
import { h } from '../ui/dom';
import { toast } from '../ui/dialogs';
import { dirname, noteName } from '../core/paths';
import type { Mode, WorkspaceHost } from './types';
import type { Tab } from './pane';

/** Vieno užrašo vaizdas: pavadinimas, CodeMirror redaktorius (šaltinis) ir peržiūra. */
export class NoteView {
  readonly el: HTMLElement;
  readonly view: EditorView;
  private titleInput: HTMLInputElement;
  private editorHost: HTMLElement;
  readonly previewEl: HTMLElement;
  tab: Tab | null = null;
  private saveTimer: (() => void) & { cancel(): void };
  private dirty = false;
  private live = new Compartment();
  onStatus: (s: 'saving' | 'saved' | 'error') => void = () => {};

  constructor(private host: WorkspaceHost) {
    this.titleInput = h('input', { class: 'note-title', spellcheck: false, 'aria-label': 'Užrašo pavadinimas' });
    this.editorHost = h('div', { class: 'note-editor' });
    this.previewEl = h('article', { class: 'note-preview markdown' });
    this.el = h('div', { class: 'note-view' }, h('div', { class: 'note-title-wrap' }, this.titleInput), this.editorHost, this.previewEl);
    this.view = new EditorView({ parent: this.editorHost });
    // Delsa skaitoma kiekvieną kartą – nustatymų pakeitimas galioja iškart.
    let timer: number | undefined;
    const run = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => this.save(), Math.max(100, host.settings.autosaveDelay));
    };
    run.cancel = () => clearTimeout(timer);
    this.saveTimer = run;

    this.titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.view.focus();
      }
      if (e.key === 'Escape') {
        this.titleInput.value = this.path ? noteName(this.path) : '';
        this.view.focus();
      }
    });
    this.titleInput.addEventListener('change', () => this.renameFromTitle());
    this.previewEl.addEventListener('click', (e) => this.onPreviewClick(e));
    this.previewEl.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('a, input')) return;
      this.tab?.pane.setMode('live');
    });
  }

  get path(): string | null {
    return this.tab?.loc.kind === 'note' ? this.tab.loc.path : null;
  }

  /** Parodo skirtuką: atkuria jo redaktoriaus būseną arba sukuria naują. */
  show(tab: Tab) {
    if (this.tab && this.tab !== tab) this.detach();
    this.tab = tab;
    const path = this.path!;
    if (!tab.editorState || tab.editorState.doc.toString() !== this.host.vault.read(path)) {
      tab.editorState = this.newState(this.host.vault.read(path));
    }
    this.view.setState(tab.editorState);
    this.titleInput.value = noteName(path);
    this.applyMode(tab.mode);
    requestAnimationFrame(() => {
      if (tab.scroll) this.scroller().scrollTop = tab.scroll;
    });
  }

  private newState(doc: string): EditorState {
    return createEditorState(doc, {
      onDocChange: () => {
        this.dirty = true;
        this.onStatus('saving');
        this.saveTimer();
      },
      extra: [...this.host.editorExtensions(this), this.live.of(this.liveExt(this.tab?.mode ?? 'source'))],
    });
  }

  /** Išsaugo redaktoriaus būseną į skirtuką (prieš perjungiant). */
  detach() {
    if (!this.tab) return;
    this.flush();
    this.tab.editorState = this.view.state;
    this.tab.scroll = this.scroller().scrollTop;
  }

  private scroller(): HTMLElement {
    return this.tab?.mode === 'preview' ? this.el : (this.view.scrollDOM as HTMLElement);
  }

  private liveExt(mode: Mode) {
    return mode === 'live'
      ? livePreview({
          openLink: (t, newTab) => this.host.openLink(t, { newTab, from: this.path ?? undefined }),
          resolveImage: this.host.resolveImage ? (src, from) => this.host.resolveImage!(src, from) : undefined,
          currentPath: () => this.path,
        })
      : [];
  }

  applyMode(mode: Mode) {
    this.el.classList.toggle('mode-preview', mode === 'preview');
    this.el.classList.toggle('mode-source', mode === 'source');
    this.el.classList.toggle('mode-live', mode === 'live');
    if (mode !== 'preview') this.view.dispatch({ effects: this.live.reconfigure(this.liveExt(mode)) });
    if (mode === 'preview') this.renderPreview();
    else requestAnimationFrame(() => this.view.requestMeasure());
  }

  /** Pažymi eilutę (0-based) ir nuslenka iki jos. */
  revealLine(line: number) {
    const doc = this.view.state.doc;
    const l = doc.line(Math.min(Math.max(1, line + 1), doc.lines));
    if (this.tab?.mode === 'preview') {
      const els = this.previewEl.querySelectorAll<HTMLElement>('[data-src-line]');
      let best: HTMLElement | null = null;
      els.forEach((el) => {
        if (Number(el.dataset.srcLine) <= line) best = el;
      });
      (best as HTMLElement | null)?.scrollIntoView({ block: 'center' });
      return;
    }
    this.view.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
    this.view.focus();
  }

  focus() {
    if (this.tab?.mode !== 'preview') this.view.focus();
  }

  renderPreview() {
    this.previewEl.innerHTML = this.host.renderMarkdown(this.view.state.doc.toString());
    this.previewEl.querySelectorAll<HTMLImageElement>('img[data-vault-src]').forEach((img) => {
      const src = img.dataset.vaultSrc!;
      this.host.resolveImage?.(src, this.path ?? undefined).then((u) => {
        if (u) img.src = u;
        else img.replaceWith(Object.assign(document.createElement('span'), { className: 'img-missing', textContent: `Paveikslėlis nerastas: ${src}` }));
      });
    });
  }

  /** Priverstinai įrašo laukiančius pakeitimus. */
  flush() {
    if (this.dirty) {
      this.saveTimer.cancel();
      this.save();
    }
  }

  private async save() {
    const path = this.path;
    if (!path || !this.dirty) return;
    this.dirty = false;
    try {
      await this.host.vault.write(path, this.view.state.doc.toString(), this);
      this.onStatus('saved');
    } catch (e) {
      this.onStatus('error');
      toast('Nepavyko išsaugoti: ' + (e as Error).message, 'error');
    }
  }

  /** Užrašas pasikeitė iš išorės (kitas langas, varnelė ir pan.). */
  syncFromVault() {
    const path = this.path;
    if (!path) return;
    const text = this.host.vault.read(path);
    if (text === this.view.state.doc.toString()) return;
    const sel = this.view.state.selection.main.head;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
      selection: { anchor: Math.min(sel, text.length) },
    });
    this.dirty = false;
    this.saveTimer.cancel();
    if (this.tab?.mode === 'preview') this.renderPreview();
  }

  setTitle(path: string) {
    if (document.activeElement !== this.titleInput) this.titleInput.value = noteName(path);
  }

  private async renameFromTitle() {
    const path = this.path;
    const v = this.titleInput.value.trim();
    if (!path || !v || v === noteName(path)) return;
    try {
      this.flush();
      await this.host.vault.rename(path, v);
    } catch (e) {
      toast((e as Error).message, 'error');
      this.titleInput.value = noteName(path);
    }
  }

  private onPreviewClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const cb = t.closest<HTMLInputElement>('input.task-check');
    if (cb) {
      const line = Number(cb.dataset.line);
      const next = toggleTaskAt(this.view.state.doc.toString(), line);
      if (next !== null) {
        const l = this.view.state.doc.line(line + 1);
        const nl = next.split('\n')[line];
        // Pakeičiame tik vieną eilutę – išlieka atšaukimo istorija.
        this.view.dispatch({ changes: { from: l.from, to: l.to, insert: nl } });
        this.flush();
        cb.closest('li')?.classList.toggle('done', cb.checked);
      }
      return;
    }
    const wl = t.closest<HTMLElement>('a.wikilink');
    if (wl) {
      e.preventDefault();
      this.host.openLink(wl.dataset.target!, { newTab: e.ctrlKey || e.metaKey, from: this.path ?? undefined });
      return;
    }
    const tag = t.closest<HTMLElement>('a.tag');
    if (tag) {
      e.preventDefault();
      this.host.onTagClick(tag.dataset.tag!);
    }
  }

  get folder(): string {
    return this.path ? dirname(this.path) : '';
  }

  destroy() {
    this.detach();
    this.view.destroy();
  }
}
