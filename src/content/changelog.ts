import raw from '../../CHANGELOG.md?raw';

export interface Release {
  version: string;
  title: string;
  date: string;
  items: string[];
}

/** Parse CHANGELOG.md ("## 0.2.0 — Title (date)" headings with "- item" bullets). */
export function parseChangelog(text: string): Release[] {
  const out: Release[] = [];
  let cur: Release | null = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^##\s+([\d.]+)\s*[—-]\s*(.+?)\s*(?:\((.+)\))?\s*$/);
    if (h) {
      cur = { version: h[1], title: h[2], date: h[3] ?? '', items: [] };
      out.push(cur);
      continue;
    }
    const b = line.match(/^\s*[-*]\s+(.+)$/);
    if (b && cur) cur.items.push(b[1]);
  }
  return out;
}

export const RELEASES = parseChangelog(raw);
export const APP_VERSION = __APP_VERSION__;
