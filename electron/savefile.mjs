/**
 * Files the player asks the game to keep: a photo, the Type I end card, an exported company, the playtest log.
 * Pictures go into Pictures/The Kardashev Project, everything else into Documents/The Kardashev Project,
 * never overwriting an existing file.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SAVE_FOLDER = 'The Kardashev Project';
/** A 4K photo is a few megabytes; nothing the game saves comes near 64 MB. */
export const MAX_SAVE_BYTES = 64 * 1024 * 1024;

/** A file name with nothing in it that could leave the folder or upset a file system. */
export function cleanSaveName(name) {
  const raw = String(name ?? '');
  let out = '';
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    const alnum = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (alnum || ch === '.' || ch === '-' || ch === '_' || ch === ' ' || ch === '(' || ch === ')') out += ch;
    else out += '-';
  }
  out = out.replace(/^[. ]+|[. ]+$/g, '');
  if (!out) return 'kardashev';
  return [...out].slice(0, 120).join('');
}

/** `dir/name`, or `dir/name (2)`, `(3)`… when that file is already there: nothing is ever overwritten. */
export function freeSavePath(dir, name) {
  const first = path.join(dir, name);
  if (!fs.existsSync(first)) return first;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; n < 10_000; n++) {
    const candidate = path.join(dir, `${stem} (${n})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return first;
}

/** Write `bytes` into `baseDir/The Kardashev Project/<safe name>`, returning the full path written. */
export function writeSavedFile({ baseDir, name, bytes }) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (!buf.byteLength || buf.byteLength > MAX_SAVE_BYTES) {
    throw new Error('no file data');
  }
  const safe = cleanSaveName(name);
  const dir = path.join(baseDir, SAVE_FOLDER);
  fs.mkdirSync(dir, { recursive: true });
  const target = freeSavePath(dir, safe);
  fs.writeFileSync(target, buf);
  return target;
}
