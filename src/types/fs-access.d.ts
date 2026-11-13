// Minimalūs File System Access API tipai, kurių dar nėra standartinėje TS DOM bibliotekoje.
interface FsPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?(d?: FsPermissionDescriptor): Promise<PermissionState>;
  requestPermission?(d?: FsPermissionDescriptor): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker?(opts?: { mode?: 'read' | 'readwrite'; id?: string }): Promise<FileSystemDirectoryHandle>;
}
