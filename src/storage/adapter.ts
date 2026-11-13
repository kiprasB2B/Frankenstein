// Saugyklos abstrakcija: vault gali gyventi tikrame aplanke (File System Access API)
// arba naršyklės IndexedDB. Užrašai visada yra paprasti .md tekstiniai failai.

export interface StorageEntry {
  path: string;
  kind: 'file' | 'folder';
  /** Paskutinio pakeitimo laikas (ms) ir dydis baitais, jei žinomi. */
  mtime?: number;
  size?: number;
}

export interface StorageAdapter {
  readonly kind: 'fs' | 'idb';
  readonly name: string;
  /** Visi įrašai rekursyviai, išskyrus paslėptus (prasidedančius tašku). */
  list(): Promise<StorageEntry[]>;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  write(path: string, data: string | Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  /** Ištrina failą arba aplanką rekursyviai. */
  remove(path: string): Promise<void>;
  /** Pervadina / perkelia failą arba aplanką. */
  rename(from: string, to: string): Promise<void>;
}
