import type { Extension } from '@codemirror/state';
import type { Vault } from '../core/vault';
import type { NoteView } from './noteView';

/** source – Markdown šaltinis, live – gyva peržiūra redaktoriuje, preview – skaitymo vaizdas. */
export type Mode = 'source' | 'live' | 'preview';

/** Vieta skirtuke: užrašas arba specialus vaizdas (grafas). */
export type Location = { kind: 'note'; path: string } | { kind: 'graph' } | { kind: 'empty' };

export interface SerializedTab {
  loc: Location;
  mode: Mode;
}

export interface SerializedPane {
  tabs: SerializedTab[];
  active: number;
}

export interface WorkspaceState {
  panes: SerializedPane[];
  activePane: number;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  leftPanel?: string;
  expanded?: string[];
}

export interface Settings {
  defaultMode: Mode;
  dailyFolder: string;
  autosaveDelay: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultMode: 'live',
  dailyFolder: 'Dienos užrašai',
  autosaveDelay: 400,
};

/** Ką darbo vietos komponentai gauna iš programos. */
export interface WorkspaceHost {
  vault: Vault;
  settings: Settings;
  renderMarkdown(src: string): string;
  editorExtensions(view: NoteView): Extension[];
  /** Atidaro wiki nuorodą; jei užrašo nėra – sukuria. */
  openLink(target: string, opts?: { newTab?: boolean; from?: string }): void;
  onTagClick(tag: string): void;
  /** Paveikslėlio adresas peržiūrai (vault failas → blob URL). */
  resolveImage?(src: string, fromPath?: string): Promise<string | null>;
  /** Kviečiama, kai pasikeičia aktyvus skirtukas / užrašas. */
  onActiveChange(): void;
  /** Kviečiama, kai reikia išsaugoti darbo vietos būseną. */
  persist(): void;
  createGraphView?(nav: { back(): void; canBack(): boolean }): { el: HTMLElement; destroy(): void; refresh?(): void; focus?(path: string | null): void };
}

export interface EmptyViewFactory {
  renderEmpty(): HTMLElement;
}
