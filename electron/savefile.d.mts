export const SAVE_FOLDER: string;
export const MAX_SAVE_BYTES: number;

export function cleanSaveName(name: string): string;
export function freeSavePath(dir: string, name: string): string;
export function writeSavedFile(opts: { baseDir: string; name: string; bytes: Uint8Array | Buffer }): string;
