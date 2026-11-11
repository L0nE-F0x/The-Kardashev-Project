/**
 * No emoji in the interface (art3d/INTERFACE.md): they look different on every system and clash with the drawn
 * icons. The game's text still carries them as markers: every news line starts with one (the sim sorts headlines
 * by them), event cards name their header picture with one, a few hints point at a dock button with one. This is
 * the one place that turns them into the interface's own icons: `<Rich text>` for any line of game text,
 * `emojiIcon` for a card's header. An emoji with no entry here is dropped, so a new one never shows up raw.
 */
import type { ComponentChildren } from 'preact';
import { ICON_NAMES, iconUrl, type IconName } from './icons';

const MAP: Record<string, IconName> = {
  // the interface, time and outcomes
  '✅': 'check',
  '❌': 'close',
  '⚠': 'warn',
  '🚨': 'warn',
  '⚫': 'warn',
  '⛔': 'lock',
  '🔒': 'lock',
  '🗝': 'lock',
  '🔓': 'lock',
  '⏳': 'clock',
  '🐢': 'clock',
  '⏩': 'jump',
  '⏭': 'skip',
  '⏸': 'pause',
  '📌': 'pin',
  '🏁': 'goals',
  '🎬': 'goals',
  '🚩': 'land',
  '🏆': 'legit',
  '🎉': 'legit',
  '🗓': 'plan',
  '📋': 'plan',
  '🧭': 'plan',
  '🗺': 'map',
  '📰': 'news',
  // money and markets
  '💰': 'cash',
  '💸': 'cash',
  '💵': 'cash',
  '🛟': 'cash',
  '🏦': 'finance',
  '📈': 'finance',
  '📊': 'chart',
  '🔔': 'ipo',
  '📦': 'orders',
  '🏷': 'deal',
  '💼': 'deal',
  '📜': 'treaty',
  '🕊': 'treaty',
  '✍': 'contract',
  '📄': 'contract',
  '📑': 'contract',
  '📨': 'tender',
  '📬': 'tender',
  '📭': 'tender',
  '🎩': 'board',
  '🦄': 'startup',
  // power, plants and the climate
  '⚡': 'power',
  '🔌': 'grid',
  '☀': 'swarm',
  '🌅': 'swarm',
  '🌤': 'swarm',
  '🔆': 'swarm',
  '🌬': 'wind',
  '🔥': 'gas',
  '🔋': 'battery',
  '💧': 'hydro',
  '♨': 'geothermal',
  '🌋': 'geothermal',
  '⚛': 'nuclear',
  '🌗': 'fusion',
  '🧲': 'fusion',
  '🌡': 'heat',
  '🏜': 'heat',
  '🌫': 'co2',
  '🌳': 'garden',
  '🌱': 'garden',
  // compute and models
  '🧮': 'compute',
  '💾': 'compute',
  '🔷': 'compute',
  '🖥': 'datacenter',
  '🧠': 'brain',
  '🤖': 'ai',
  '✨': 'ai',
  '🧪': 'lab',
  '🔬': 'research',
  '💡': 'research',
  '🏠': 'hq',
  '🏢': 'campus',
  '🏙': 'campus',
  '🏗': 'campus',
  '🗂': 'desk',
  // chips, supply and the network
  '🧩': 'packaging',
  '🏭': 'fab',
  '⛏': 'mine',
  '⛰': 'mine',
  '🟫': 'copper',
  '🎈': 'helium',
  '🌊': 'cable',
  // people, safety and politics
  '👋': 'people',
  '👷': 'team',
  '🧳': 'talent',
  '🤝': 'partner',
  '🎁': 'partner',
  '🧬': 'longevity',
  '🛡': 'shield',
  '🔍': 'evals',
  '🕵': 'evals',
  '🦈': 'rival',
  '⚔': 'rival',
  '📣': 'rival',
  '🏳': 'blocs',
  '🚪': 'blocs',
  '✊': 'faction',
  '🪧': 'faction',
  '🏛': 'council',
  '⚖': 'council',
  '🗳': 'vote',
  '🖐': 'province',
  // the world and space
  '🌌': 'k',
  '🌍': 'globe',
  '🌐': 'world',
  '🚢': 'ship',
  '⚓': 'ship',
  '✈': 'plane',
  '🚀': 'launch',
  '🛰': 'satellite',
  '📡': 'satellite',
  '💥': 'debris',
  '🌙': 'moon',
  '🌑': 'moon',
  '☄': 'asteroid',
  '🔭': 'asteroid',
  '🏡': 'habitat',
  '☿': 'mercury',
};

const VS = new RegExp(String.fromCharCode(0xfe0f), 'g');
const NAMES = new Set<string>(ICON_NAMES);
// every astral pictograph (mapped or not: an unmapped one is dropped) and the mapped symbols of the basic plane;
// arrows, ticks, crosses and the like (↔ ▶ ✓ ✗ ✕) are ordinary text and stay
const BMP = Object.keys(MAP)
  .filter((k) => k.length === 1)
  .join('');
// …and an icon by name, `:solar:`, for interface text that wants one in the middle of a string (a tooltip)
const FIND = new RegExp(`([\\u{1F000}-\\u{1FAFF}]|[${BMP}]|:[a-z0-9]+:)\\uFE0F?( ?)`, 'gu');

/** The interface icon an emoji (or an icon's own name) stands for, or null. */
export function emojiIcon(mark: string | undefined | null): IconName | null {
  if (!mark) return null;
  if (NAMES.has(mark)) return mark as IconName;
  return MAP[mark.replace(VS, '')] ?? null;
}

/** A line of game text as plain text: the emoji gone (for titles, aria labels and tooltips set as attributes). */
export function plain(text: string): string {
  return text
    .replace(FIND, (all, mark: string) => (mark.startsWith(':') && !NAMES.has(mark.slice(1, -1)) ? all : ''))
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** A line of game text with each emoji drawn as the interface's icon (or dropped when it stands for nothing). */
export function rich(text: string | undefined | null): ComponentChildren {
  if (!text) return text ?? null;
  FIND.lastIndex = 0;
  if (!FIND.test(text)) return text;
  const out: ComponentChildren[] = [];
  let at = 0;
  FIND.lastIndex = 0;
  for (let m = FIND.exec(text); m; m = FIND.exec(text)) {
    const token = m[1].length > 2 && m[1].startsWith(':') ? m[1].slice(1, -1) : '';
    if (token && !NAMES.has(token)) continue; // not an icon's name: ordinary text, left where it is
    if (m.index > at) out.push(text.slice(at, m.index));
    const name = token ? (token as IconName) : MAP[m[1]];
    if (name) {
      out.push(<img class="px sm ti" src={iconUrl(name)} alt="" draggable={false} />);
      // a marker in brackets, "(🧮)", keeps its bracket tight; otherwise the space after it stays
      if (m[2]) out.push(' ');
    }
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** `rich` as a component, for places that take one. */
export function Rich({ text }: { text: string | undefined | null }) {
  return <>{rich(text)}</>;
}
