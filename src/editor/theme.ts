import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Redaktoriaus tema naudoja tuos pačius CSS kintamuosius kaip ir visa sąsaja.
export const labTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      color: 'var(--c-text)',
      backgroundColor: 'transparent',
      fontSize: '15px',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-ui)',
      lineHeight: '1.7',
      padding: 'var(--s-6) 0 40vh',
    },
    '.cm-content': {
      maxWidth: '760px',
      margin: '0 auto',
      padding: '0 var(--s-5)',
      caretColor: 'var(--c-glow)',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': {
      borderLeft: '2px solid var(--c-glow)',
      boxShadow: '0 0 8px var(--c-accent), 0 0 2px var(--c-glow)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(var(--rgb-accent), 0.22) !important',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(var(--rgb-fg), 0.025)' },
    '.cm-gutters': { display: 'none' },
    '.cm-tooltip': {
      border: '1px solid var(--c-line-strong)',
      backgroundColor: 'var(--c-raised)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: '0 12px 40px rgba(0,0,0,.7)',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-ui)', maxHeight: '260px' },
    '.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px !important', color: 'var(--c-text-dim)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'rgba(var(--rgb-accent), 0.12)',
      color: 'var(--c-accent)',
      textShadow: 'var(--glow-text)',
    },
    '.cm-completionDetail': { color: 'var(--c-text-faint)', fontStyle: 'normal', marginLeft: '8px' },
    '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--c-glow)' },
    '.cm-panels': { backgroundColor: 'var(--c-raised)', color: 'var(--c-text)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--c-line)' },
    '.cm-panel.cm-search': { padding: '8px 12px', fontFamily: 'var(--font-ui)' },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': {
      background: 'var(--c-bg)',
      border: '1px solid var(--c-line-strong)',
      borderRadius: 'var(--radius)',
      color: 'var(--c-text)',
      backgroundImage: 'none',
    },
    '.cm-searchMatch': { backgroundColor: 'rgba(var(--rgb-accent), 0.18)', outline: '1px solid rgba(var(--rgb-accent), .4)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(var(--rgb-glow), 0.3)' },
    '.cm-matchingBracket': { backgroundColor: 'transparent', color: 'var(--c-glow) !important' },
    // Markdown eilučių stiliai (žr. lineStyles plėtinį)
    '.cm-line.md-h1': { fontSize: '1.85em', fontWeight: '300', letterSpacing: '0.01em', paddingTop: '.4em' },
    '.cm-line.md-h2': { fontSize: '1.45em', fontWeight: '400', paddingTop: '.3em' },
    '.cm-line.md-h3': { fontSize: '1.2em', fontWeight: '500', paddingTop: '.2em' },
    '.cm-line.md-h4, .cm-line.md-h5, .cm-line.md-h6': { fontWeight: '600' },
    '.cm-line.md-quote': { borderLeft: '2px solid rgba(var(--rgb-accent), .5)', paddingLeft: '14px', color: 'var(--c-text-dim)' },
    '.cm-line.md-code': {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      backgroundColor: 'rgba(var(--rgb-fg), 0.035)',
      padding: '0 12px',
    },
  },
  { dark: true },
);

export const labHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading, color: 'var(--c-text)' },
    { tag: t.strong, fontWeight: '600' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--c-text-faint)' },
    { tag: t.link, color: 'var(--c-accent)' },
    { tag: t.url, color: 'var(--c-text-faint)' },
    { tag: t.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.88em', color: 'var(--c-text)' },
    { tag: t.processingInstruction, color: 'var(--c-text-faint)' },
    { tag: t.meta, color: 'var(--c-text-faint)' },
    { tag: t.quote, color: 'var(--c-text-dim)' },
    { tag: t.list, color: 'var(--c-text-faint)' },
    { tag: t.contentSeparator, color: 'var(--c-text-faint)' },
    { tag: t.comment, color: 'var(--c-text-faint)' },
    { tag: [t.keyword, t.operator], color: 'var(--c-accent)' },
    { tag: [t.string, t.special(t.string)], color: 'var(--c-text-dim)' },
    { tag: [t.number, t.bool, t.atom], color: 'var(--c-glow)' },
    { tag: t.labelName, color: 'var(--c-text-faint)' },
  ]),
);
