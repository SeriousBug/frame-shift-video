export interface FileSystemItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}
