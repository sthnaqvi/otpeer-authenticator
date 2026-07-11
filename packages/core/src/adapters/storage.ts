/**
 * Reads/writes the raw vault blob. Node/Electron implement this with
 * fs-extra; React Native implements it with a mobile-appropriate key-value
 * store (e.g. react-native-mmkv). Core never touches the filesystem/storage
 * API directly, only through this interface.
 */
export interface StorageAdapter {
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
  delete(): Promise<void>;
  exists(): Promise<boolean>;
  /** Human-readable description of where the vault lives (file path on Node) */
  location?(): string;
}
