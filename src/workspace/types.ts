import type { Extension } from '@codemirror/state';
import type { Vault } from '../core/vault';
import type { NoteView } from './noteView';

/** source – Markdown šaltinis, live – gyva peržiūra redaktoriuje, preview – skaitymo vaizdas. */
export type Mode = 'source' | 'live' | 'preview';

/** Vieta skirtuke: užrašas arba specialus vaizdas (grafas). */
export type Location =
  | { kind: 'note'; path: string }
  | { kind: 'image'; path: string }
  | { kind: 'files'; dir: string }
  | { kind: 'graph' }
  | { kind: 'empty' };

export function locPath(l: Location): string | null {
  return l.kind === 'note' || l.kind === 'image' ? l.path : null;
}

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
  recent?: string[];
}

export interface Settings {
  defaultMode: Mode;
  dailyFolder: string;
  autosaveDelay: number;
  /** Aplankas įklijuotiems / įtemptiems paveikslėliams. */
  attachmentFolder: string;
  /** Dienos užrašo šablonas: {{data}}, {{diena}}, {{laikas}}. */
  dailyTemplate: string;
  /** Redaktoriaus ir peržiūros šrifto dydis (px). */
  fontSize: number;
  /** Grafo režimas pagal nutylėjimą. */
  graphMode: '2d' | '3d';
}

export const DEFAULT_SETTINGS: Settings = {
  defaultMode: 'live',
  dailyFolder: 'Dienos užrašai',
  autosaveDelay: 400,
  attachmentFolder: 'Priedai',
  dailyTemplate: '_{{diena}}_\n\n## Užduotys\n- [ ] \n\n## Užrašai\n\n#dienoraštis\n',
  fontSize: 15,
  graphMode: '2d',
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
  /** Failų naršyklės vaizdas (skirtukas „files“). */
  createExplorer?(
    dir: string,
    nav: { navigate(dir: string): void; back(): void; forward(): void; canBack(): boolean; canForward(): boolean },
  ): { el: HTMLElement; destroy(): void };
  /** Paveikslėlio peržiūros skirtukui. */
  assetUrl?(path: string): Promise<string | null>;
  createGraphView?(nav: { back(): void; canBack(): boolean }): { el: HTMLElement; destroy(): void; refresh?(): void; focus?(path: string | null): void };
}

export interface EmptyViewFactory {
  renderEmpty(): HTMLElement;
}
