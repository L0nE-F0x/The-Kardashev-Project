import { PixelCanvas, toDataUrl } from '../render/pixels';
import { onEraChange, type ColorKey } from '../render/palette';

type Grid = [string, Record<string, ColorKey>];

/** 9×9 pixel UI icons. */
const ICONS = {
  cash: [`..aaaaa..\n.abbbbba.\nabbcbcbba\nabcbbbbba\nabbcccbba\nabbbbbcba\nabbcbcbba\n.abbbbba.\n..aaaaa..`, { a: 'snd3', b: 'yel0', c: 'snd2' }],
  power: [`.....aa..\n....aba..\n...aba...\n..abbaaa.\n.abbbbba.\n.aaabba..\n...aba...\n..aba....\n..aa.....`, { a: 'org0', b: 'yel1' }],
  compute: [`.a.a.a.a.\naaaaaaaaa\n.abbbbba.\naabcccbaa\n.abcccba.\naabcccbaa\n.abbbbba.\naaaaaaaaa\n.a.a.a.a.`, { a: 'ink6', b: 'cyn3', c: 'cyn5' }],
  brain: [`..aa.aa..\n.abbabba.\nabcbbbcba\nabbbcbbba\nabcbbbbca\nabbbcbbba\n.abcbbba.\n..abbba..\n...aaa...`, { a: 'vio1', b: 'pnk1', c: 'vio4' }],
  shield: [`aaaaaaaaa\nabbbcbbba\nabbbcbbba\nabcccccba\nabbbcbbba\n.abbcbba.\n.abbbbba.\n..abbba..\n...aaa...`, { a: 'blu1', b: 'blu4', c: 'blu6' }],
  k: [`...aaa...\n.aabbbaa.\n.abcbbba.\nabbbcbbba\nabcbbbcba\nabbbbbbba\n.abbcbba.\n.aabbbaa.\n...aaa...`, { a: 'blu1', b: 'sea6', c: 'grn6' }],
  research: [`..aaaaa..\n...aba...\n...aba...\n...aba...\n..abbba..\n.abccbba.\nabcccccba\nabbbbbbba\n.aaaaaaa.`, { a: 'ink8', b: 'vio2', c: 'vio5' }],
  orders: [`.aaaaaaa.\nabbbbbbba\nacccccccA\nabbbabbba\nabbbabbba\nabbbabbba\nabbbbbbba\nabbbbbbba\n.aaaaaaa.`, { a: 'snd2', b: 'snd5', c: 'snd6', A: 'snd2' }],
  finance: [`a........\na......b.\na.....bb.\na..b.bb..\na.bbbb...\nabb......\na........\naaaaaaaaa\n.........`, { a: 'ink7', b: 'grn6' }],
  news: [`aaaaaaa..\nabbbbbaa.\nabcccbaba\nabbbbbaba\nabcbcbaba\nabbbbbaba\nabcccbaba\nabbbbbbba\n.aaaaaaa.`, { a: 'ink6', b: 'ink9', c: 'ink5' }],
  settings: [`...aaa...\n.a.aba.a.\n..abbba..\naabcccbaa\nabbc.cbba\naabcccbaa\n..abbba..\n.a.aba.a.\n...aaa...`, { a: 'ink5', b: 'ink8', c: 'ink6' }],
  goals: [`ab.......\nabbbb....\nabbbbbbb.\nabbbbbb..\nabbb.....\na........\na........\na........\naa.......`, { a: 'ink8', b: 'red3' }],
  pause: [`.........\n.aa...aa.\n.ab...ab.\n.ab...ab.\n.ab...ab.\n.ab...ab.\n.ab...ab.\n.aa...aa.\n.........`, { a: 'ink9', b: 'ink6' }],
  play: [`.........\n..a......\n..aa.....\n..aba....\n..abba...\n..aba....\n..aa.....\n..a......\n.........`, { a: 'ink9', b: 'grn6' }],
  ff: [`.........\n.a...a...\n.aa..aa..\n.aba.aba.\n.abbaabba\n.aba.aba.\n.aa..aa..\n.a...a...\n.........`, { a: 'ink9', b: 'yel0' }],
  fff: [`.........\na..a..a..\naa.aa.aa.\nabaababab\nabbabbabb\nabaababab\naa.aa.aa.\na..a..a..\n.........`, { a: 'ink9', b: 'org1' }],
  globe: [`...aaa...\n.aabbcaa.\n.abccbba.\nabbcbbcba\nacccbbbba\nabbbbccba\n.abbbcca.\n.aabbbaa.\n...aaa...`, { a: 'sea2', b: 'sea6', c: 'grn5' }],
  solar: [`.........\naaaaaaaaa\nabcbcbcba\naaaaaaaaa\nabcbcbcba\naaaaaaaaa\n....d....\n...ddd...\n.........`, { a: 'blu1', b: 'blu3', c: 'sky4', d: 'ink6' }],
  wind: [`....a....\n....a....\n....a....\n..aabaa..\n.a..c..a.\na...c...a\n....c....\n....c....\n...ccc...`, { a: 'white', b: 'ink6', c: 'ink9' }],
  gas: [`....a....\n...aba...\n...aba...\n..abcba..\n.abcccba.\n.abcccba.\n.abbcbba.\n..abbba..\n...aaa...`, { a: 'red2', b: 'org1', c: 'yel0' }],
  battery: [`...aaa...\n.aaaaaaa.\n.abbbbba.\n.abbcbba.\n.abcccba.\n.abbcbba.\n.abbbbba.\n.abbbbba.\n.aaaaaaa.`, { a: 'ink1', b: 'grn5', c: 'yel1' }],
  datacenter: [`aaaaaaaaa\nabbbbbbba\nabcbcbcba\nabbbbbbba\naaaaaaaaa\nabbbbbbba\nabcbcbcba\nabbbbbbba\naaaaaaaaa`, { a: 'ink1', b: 'ink4', c: 'cyn5' }],
  lab: [`..aaaaa..\n...aba...\n...aba...\n..abbba..\n.abbcbba.\nabcccccba\nabcccccba\nabbbbbbba\n.aaaaaaa.`, { a: 'ink8', b: 'ink9', c: 'vio4' }],
  hq: [`....a....\n...aaa...\n..aabaa..\n.aabbbaa.\naabbbbbaa\n.acbbbca.\n.acbdbca.\n.abbdbba.\n.aaaaaaa.`, { a: 'snd2', b: 'yel0', c: 'sky4', d: 'snd3' }],
  grid: [`..a...a..\n..a...a..\n.aaaaaaa.\n.abbbbba.\n.abbbbba.\n..abbba..\n...aba...\n....a....\n....a....`, { a: 'ink8', b: 'ink5' }],
  link: [`.........\n.aa......\nabba.....\n.aaba....\n...aba...\n....abaa.\n.....abba\n......aa.\n.........`, { a: 'yel0', b: 'org1' }],
  ship: [`.........\n....a....\n...aab...\n..aaabb..\n....a....\nccccccccc\n.ccccccc.\n..ccccc..\n.........`, { a: 'cyn4', b: 'org1', c: 'red2' }],
  plane: [`....a....\n....a....\n...aaa...\naaaaaaaaa\n...aaa...\n....a....\n...aaa...\n.........\n.........`, { a: 'white' }],
  warn: [`....a....\n...aba...\n...aba...\n..abcba..\n..abcba..\n.abbcbba.\n.abbbbba.\nabbbcbbba\naaaaaaaaa`, { a: 'org0', b: 'yel0', c: 'ink1' }],
  check: [`.........\n.......aa\n......aba\n.a...aba.\naba.aba..\n.ababa...\n..aba....\n...a.....\n.........`, { a: 'grn2', b: 'grn6' }],
  close: [`.........\n.aa...aa.\n.aba.aba.\n..abaaa..\n...aba...\n..aaaba..\n.aba.aba.\n.aa...aa.\n.........`, { a: 'ink1', b: 'ink9' }],
  clock: [`..aaaaa..\n.abbbbba.\nabbbcbbba\nabbbcbbba\nabbbcccba\nabbbbbbba\nabbbbbbba\n.abbbbba.\n..aaaaa..`, { a: 'ink5', b: 'ink9', c: 'ink1' }],
  train: [`..aa.aa..\n.abbabba.\nabbbbbbba\nabbbbbbba\n.abbbbba.\n..aaaaa..\n....c....\n...ccc...\n..ccccc..`, { a: 'vio1', b: 'vio4', c: 'yel0' }],
  infer: [`.aaaaaaa.\nabbbbbbba\nabcbcbcba\nabbbbbbba\n.aaaaaaa.\n..aa.....\n.aa......\n.........\n.........`, { a: 'cyn2', b: 'cyn5', c: 'ink1' }],
  people: [`..a...a..\n.aaa.aaa.\n..a...a..\n.bbb.bbb.\nbbbbbbbbb\nbbbbbbbbb\n.........\n.........\n.........`, { a: 'skn4', b: 'blu4' }],
  map: [`aaaaaaaaa\nabbbcbbba\nabcccbbba\nabbcccbba\nabbbbcbba\nabbbbbbba\nabbcbbbba\nabbbbbbba\naaaaaaaaa`, { a: 'ink1', b: 'sea5', c: 'grn5' }],
  sound: [`....a....\n...aa..b.\n.aaba.b..\n.abba.b.b\n.abba.b.b\n.aaba.b..\n...aa..b.\n....a....\n.........`, { a: 'ink8', b: 'cyn5' }],
  mute: [`....a....\n...aa....\n.aaba.b.b\n.abba..b.\n.abba..b.\n.aaba.b.b\n...aa....\n....a....\n.........`, { a: 'ink8', b: 'red3' }],
  arrow: [`.........\n....a....\n...aa....\n..aaaaaa.\n.aaaaaaa.\n..aaaaaa.\n...aa....\n....a....\n.........`, { a: 'ink9' }],
  co2: [`.........\n..aaa....\n.abbba...\nabbbbbaa.\nabbbbbbba\n.aaaaaaa.\n.........\n.c.c.c...\n.........`, { a: 'ink5', b: 'ink7', c: 'ink6' }],
  guide: [`.aaa.aaa.\nabbbcbbba\nabddcddba\nabbbcbbba\nabddcddba\nabbbcbbba\nabddcddba\naaaacaaaa\n.........`, { a: 'ink1', b: 'ink9', c: 'cyn4', d: 'ink6' }],
  trust: [`.........\n.aa...aa.\nabba.abba\nabbbabbba\nabbbbbbba\n.abbbbba.\n..abbba..\n...aba...\n....a....`, { a: 'red1', b: 'pnk0' }],
} satisfies Record<string, Grid>;

export type IconName = keyof typeof ICONS;

const cache = new Map<string, string>();
onEraChange(() => cache.clear());

export function iconUrl(name: IconName): string {
  let u = cache.get(name);
  if (!u) {
    const [rows, map] = ICONS[name] as Grid;
    u = toDataUrl(PixelCanvas.from(rows.replace(/\\n/g, '\n'), map));
    cache.set(name, u);
  }
  return u;
}
