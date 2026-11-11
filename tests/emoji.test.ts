import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emojiIcon, plain } from '../src/ui/emoji';
import { ICON_NAMES } from '../src/ui/icons';

/**
 * The interface shows no emoji (art3d/INTERFACE.md). The game's text still carries them as markers (news lines,
 * event cards' pictures, a few hints) and ui/emoji.tsx draws each as an interface icon. A marker it does not know
 * would vanish from the screen, so every one in the text has to be in its table.
 */
const ROOTS = ['src/content', 'src/sim', 'src/game'];
// pictographs: everything astral, plus the symbol blocks of the basic plane
const PICTO = /[\u{1F000}-\u{1FAFF}]|[⌀-⏿☀-➿⬀-⯿]/gu;
// ordinary text marks that stay as they are (ticks, crosses, the note pencil)
const TEXT = new Set(['✓', '✗', '✕', '✎']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('emoji markers', () => {
  const found = new Map<string, string>();
  for (const root of ROOTS) for (const f of files(root)) for (const m of readFileSync(f, 'utf8').match(PICTO) ?? []) if (!found.has(m)) found.set(m, f);

  it('finds the markers the game text uses', () => {
    expect(found.size).toBeGreaterThan(60);
  });

  it('draws every marker in the game text as an interface icon', () => {
    const unknown = [...found].filter(([ch]) => !TEXT.has(ch) && !emojiIcon(ch)).map(([ch, f]) => `${ch} (${f})`);
    expect(unknown, 'add these to the table in src/ui/emoji.tsx').toEqual([]);
  });

  it('takes an icon’s own name and the emoji with its variation selector', () => {
    expect(emojiIcon('foundry')).toBe('foundry');
    expect(emojiIcon('☀️')).toBe(emojiIcon('☀'));
    expect(emojiIcon('not an icon')).toBeNull();
    for (const name of ICON_NAMES) expect(emojiIcon(name)).toBe(name);
  });

  it('strips markers from plain text and leaves ordinary symbols alone', () => {
    expect(plain('🏗 Data Center at West Texas Plains is online.')).toBe('Data Center at West Texas Plains is online.');
    expect(plain('Open Compute (🧮) and rent')).toBe('Open Compute () and rent');
    expect(plain('Minds ↔ people ▶▶ ✓ 10:30:45')).toBe('Minds ↔ people ▶▶ ✓ 10:30:45');
    expect(plain(':solar: 21%')).toBe('21%');
  });
});
