import { PixelCanvas, toDataUrl } from '../render/pixels';
import { onEraChange, type ColorKey } from '../render/palette';

type Grid = [string, Record<string, ColorKey>];
/** One row per argument — easier to read than `\n`-joined strings. */
const g = (...rows: string[]) => rows.join('\n');

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
  fullscreen: [g('aaa...aaa', 'ab.....ba', 'a.......a', '.........', '.........', '.........', 'a.......a', 'ab.....ba', 'aaa...aaa'), { a: 'ink9', b: 'ink6' }],
  arrow: [`.........\n....a....\n...aa....\n..aaaaaa.\n.aaaaaaa.\n..aaaaaa.\n...aa....\n....a....\n.........`, { a: 'ink9' }],
  co2: [`.........\n..aaa....\n.abbba...\nabbbbbaa.\nabbbbbbba\n.aaaaaaa.\n.........\n.c.c.c...\n.........`, { a: 'ink5', b: 'ink7', c: 'ink6' }],
  chart: [`.........\n.......c.\n.......c.\n....b..c.\n....b..c.\n.a..b..c.\n.a..b..c.\n.a..b..c.\nddddddddd`, { a: 'cyn4', b: 'yel0', c: 'vio4', d: 'ink7' }],
  help: [`..aaaaa..\n.abbbbba.\nabbcccbba\nabcbbbcba\nabbbbcbba\nabbbcbbba\nabbbbbbba\n.abbcbba.\n..aaaaa..`, { a: 'cyn1', b: 'cyn3', c: 'white' }],
  guide: [`.aaa.aaa.\nabbbcbbba\nabddcddba\nabbbcbbba\nabddcddba\nabbbcbbba\nabddcddba\naaaacaaaa\n.........`, { a: 'ink1', b: 'ink9', c: 'cyn4', d: 'ink6' }],
  trust: [`.........\n.aa...aa.\nabba.abba\nabbbabbba\nabbbbbbba\n.abbbbba.\n..abbba..\n...aba...\n....a....`, { a: 'red1', b: 'pnk0' }],
  // ── Act II ──
  hydro: [g('....a....', '...aba...', '..abbba..', '.abbbcba.', '.adbcbba.', 'adbcccbba', 'abbbcbbba', '.abcbbba.', '..aaaaa..'), { a: 'sea3', b: 'sea6', c: 'yel1', d: 'sea8' }],
  geothermal: [g('.b.....b.', 'b.b...b.b', '.b.b.b.b.', '...b.b...', '..aaaaa..', '..acaca..', 'ddddddddd', 'deddedded', 'ddddddddd'), { a: 'rck5', b: 'ice2', c: 'ink3', d: 'snd3', e: 'org0' }],
  nuclear: [g('..bbbbb..', '.ccbbbcc.', 'cccbbbccc', 'cccbbbccc', 'cccbcbccc', 'bbbbbbbbb', 'bbbcccbbb', '.bbcccbb.', '..ccccc..'), { b: 'yel0', c: 'ink1' }],
  reactor: [g('.....bbb.', '....bbbbb', '.....bbb.', '....aaacc', '.ddd.acc.', 'deeed.ac.', 'deeed.acc', 'deeedaacc', 'fffffffff'), { a: 'ink8', b: 'white', c: 'ink6', d: 'ink5', e: 'ice2', f: 'ink4' }],
  smr: [g('.........', '..a...a..', '.aba.aba.', '.aba.aba.', '.aca.aca.', '.aba.aba.', '.aba.aba.', 'ddddddddd', '.........'), { a: 'ink5', b: 'ink9', c: 'yel0', d: 'ink4' }],
  restart: [g('.b....e..', 'b.b.e.e.e', '.aace.e.e', '..ace...e', '..ac.eee.', '.aacc....', 'aaacc....', 'ddddddddd', '.........'), { a: 'ink8', b: 'white', c: 'ink6', d: 'ink4', e: 'grn6' }],
  packaging: [g('.........', 'dd.ccc.dd', 'ee.cfc.ee', 'dd.ccc.dd', 'ee.ccc.ee', 'bbbbbbbbb', 'gbbbbbbbg', '.h.h.h.h.', '.........'), { b: 'grn4', c: 'cyn3', d: 'vio2', e: 'vio4', f: 'cyn6', g: 'grn2', h: 'snd6' }],
  fab: [g('.a.....a.', '.a..a..a.', '.a..a..a.', 'bbbbbbbbb', 'bcccccccb', 'bcdcdcdcb', 'bcccccccb', 'bcdcdcdcb', 'bbbbbbbbb'), { a: 'ink7', b: 'ink5', c: 'ice2', d: 'cyn4' }],
  campus: [g('.........', '...bbb...', '...bcb...', 'aaabbb...', 'acabcb...', 'aaabbbaaa', 'acabcbaca', 'aaabbbaaa', 'acabcbaca'), { a: 'ink4', b: 'ink2', c: 'yel1' }],
  mine: [g('.........', '...cd.c..', '..ccdccc.', 'aaaaaaaaa', 'abbbbbbba', '.abbbbba.', '.aaaaaaa.', '..d...d..', '.........'), { a: 'ink2', b: 'ink5', c: 'snd4', d: 'ink8' }],
  cable: [g('.........', '..aa...aa', 'aa..aaa..', '.........', 'b.......b', '.b.....b.', '..bbbbb..', '.........', 'ccccccccc'), { a: 'sky4', b: 'cyn5', c: 'snd3' }],
  fiber: [g('c...c...c', '.b..b..b.', '..b.b.b..', '...bbb...', '....b....', '...aaa...', '...aaa...', '...aaa...', '...aaa...'), { a: 'vio2', b: 'pnk0', c: 'white' }],
  deal: [g('.........', '.....a...', '.....aa..', 'aaaaaaaa.', '.....aa..', '..b..a...', '.bb......', 'bbbbbbbb.', '.bb......'), { a: 'grn6', b: 'org1' }],
  board: [g('..aaaaa..', '..abbba..', '..abbba..', '..abbba..', '.aaaaaaa.', '.abbbbba.', '..aacaa..', '...ccc...', '..c.c.c..'), { a: 'snd1', b: 'snd3', c: 'ink6' }],
  blocs: [g('a........', 'abbb.....', 'abbbc....', 'abbbcddd.', 'a...cddd.', 'a...cddd.', 'a...c....', 'a...c....', 'aa..cc...'), { a: 'ink8', b: 'blu4', c: 'ink8', d: 'red3' }],
  team: [g('.b.....b.', 'bbb.a.bbb', '.b.aaa.b.', '.b..a..b.', 'ccc.d.ccc', 'cccdddccc', 'ccdddddcc', '..ddddd..', '.........'), { a: 'skn5', b: 'skn3', c: 'blu3', d: 'org1' }],
  contract: [g('aaaaaaa..', 'abbbbbaa.', 'abcccbbba', 'abbbbbbba', 'abcccccba', 'abbbbbbba', 'abccbddba', 'abbbbddda', 'aaaaaaaaa'), { a: 'snd3', b: 'snd8', c: 'ink6', d: 'red3' }],
  upgrade: [g('....a....', '...aba...', '..abbba..', '.abbbbba.', 'aaabbbaaa', '..abbba..', '..abbba..', '..abbba..', '..aaaaa..'), { a: 'grn2', b: 'grn6' }],
  land: [g('.....ab..', '.....abb.', '.....a...', 'c.c.cac.c', '.ddddadd.', 'cdddddddc', '.ddddddd.', 'cdddddddc', '.c.c.c.c.'), { a: 'ink8', b: 'red3', c: 'white', d: 'grn5' }],
  rival: [g('a.......a', '.a.....a.', '..a...a..', '...a.a...', '....a....', '...a.a...', '.cba.abc.', '.dc...cd.', 'd.......d'), { a: 'ink9', b: 'ink6', c: 'org1', d: 'snd3' }],
  talent: [g('....c....', '...ccc...', '....c....', '...aaa...', '...aaa...', '....a....', '.bbbbbbb.', 'bbbbbbbbb', 'bbbbbbbbb'), { a: 'skn4', b: 'vio4', c: 'yel0' }],
  treaty: [g('.aaaaaaa.', 'abbbbbbba', '.accccca.', '.adddcca.', '.accccca.', '.addeeea.', '.acceeea.', 'abbbbebba', '.aaaaaaa.'), { a: 'snd3', b: 'snd6', c: 'snd8', d: 'ink6', e: 'blu4' }],
  startup: [g('....a....', '...aba...', '...aba...', '...aca...', '...aba...', '..faaaf..', '.ff.a.ff.', '....d....', '...ded...'), { a: 'ink5', b: 'white', c: 'cyn4', d: 'org1', e: 'yel1', f: 'red3' }],
  crunch: [g('.........', '..aaaaa..', '.aggyyra.', 'aggbbbrra', 'agbbbbdra', 'abbbbdbba', 'abbbdbbba', 'aaaaaaaaa', '.........'), { a: 'ink3', b: 'ink9', g: 'grn5', y: 'yel0', r: 'red3', d: 'ink1' }],
  ipo: [g('....a....', '...aba...', '..abbba..', '..abcba..', '..abbba..', '.abbbbba.', 'aabbbbbaa', 'aaaaaaaaa', '....d....'), { a: 'snd3', b: 'yel0', c: 'yel2', d: 'snd3' }],
  lithium: [g('.........', '....a....', '...aba...', '...abc.a.', '.a.abcaba', 'abaabcabc', 'abcabcabc', 'abcabcabc', 'aaaaaaaaa'), { a: 'cyn1', b: 'cyn6', c: 'cyn4' }],
  copper: [g('.........', '.........', '..aaaaa..', '.abccbba.', 'abbbbbbba', 'abbbbbbba', 'aaaaaaaaa', '.........', '.........'), { a: 'red1', b: 'org0', c: 'org2' }],
  helium: [g('..aaaa...', '.abbbba..', 'abcbbbba.', 'abbbbbba.', 'abbbbbba.', '.abbbba..', '..abba...', '...aa....', '....d....'), { a: 'blu2', b: 'sky4', c: 'white', d: 'ink7' }],
  neon: [g('.........', '.a....a..', 'aba..aba.', 'abba.aba.', 'ababaaba.', 'aba.abba.', 'aba..aba.', '.a....a..', '.........'), { a: 'pnk0', b: 'white' }],
  // ── Act III ──
  // the Charter: a gold sunburst round a small blue-green globe (the map's HQ emblem)
  charter: [g('....r....', '.r.ggg.r.', '..gbbbg..', '.gbcceg..', 'rgbceebgr', '.gbccdbg.', '..gbbbg..', '.r.ggg.r.', '....r....'), { r: 'yel0', g: 'org2', b: 'sea4', c: 'sea6', d: 'sea5', e: 'grn6' }],
  // the Council: a marble hall, pediment and columns, a gold seal over the door
  council: [g('....a....', '..aabaa..', '.abbcbba.', 'aaaaaaaaa', '.d.d.d.d.', '.d.d.d.d.', '.d.d.d.d.', 'aaaaaaaaa', 'eeeeeeeee'), { a: 'ink6', b: 'ink9', c: 'yel0', d: 'white', e: 'ink7' }],
  // a mission: a round patch with a gold star
  mission: [g('..aaaaa..', '.abbbbba.', 'abbbcbbba', 'abbcccbba', 'abcccccba', 'abbcbcbba', 'abcbbbcba', '.abbbbba.', '..aaaaa..'), { a: 'blu1', b: 'blu4', c: 'yel0' }],
  // partners: a handshake
  partner: [g('.........', '.........', 'aa.....bb', 'aacc.ddbb', 'acccdddbb', 'a.cccddb.', '...cdd...', '.........', '.........'), { a: 'blu4', b: 'org1', c: 'skn5', d: 'skn3' }],
  // the World screen: the Earth with its meridians, and the sun's glint
  world: [g('...aaa...', '.aabbcaa.', '.abccbdc.', 'acbcbbcda', 'accccbbba', 'abbbcccba', '.abbbcca.', '.aabbbaa.', '...aaa...'), { a: 'sea2', b: 'sea6', c: 'grn6', d: 'yel1' }],
  // Legitimacy: a gold seal with ribbons
  legit: [g('..a.a.a..', '.abbbbba.', 'abbcccbba', '.bcbbbcb.', 'abcbbbcba', '.abcccba.', '..abbba..', '..d...d..', '.dd...dd.'), { a: 'snd3', b: 'yel0', c: 'yel1', d: 'red3' }],
  // political capital: a faceted violet gem
  capital: [g('.........', '..aaaaa..', '.abbcdda.', 'aaaaaaaaa', '.abbcdda.', '..abcda..', '...acd...', '....a....', '.........'), { a: 'vio1', b: 'vio3', c: 'vio4', d: 'vio5' }],
  // compute access: signal arcs reaching out
  access: [g('.........', '..aaaaa..', '.a.....a.', 'a..bbb..a', '..b...b..', '....c....', '...ccc...', '....c....', '.........'), { a: 'cyn3', b: 'cyn5', c: 'cyn6' }],
  // a vote: a ballot going into the box
  vote: [g('...aaa...', '...aba...', '...aba...', '.ccaaacc.', '.cdddddc.', '.ceeeeec.', '.cdddddc.', '.cdddddc.', '.ccccccc.'), { a: 'ink6', b: 'white', c: 'blu1', d: 'blu4', e: 'ink1' }],
  // HVDC: a lattice pylon carrying glowing lines
  hvdc: [g('b.......b', 'aacaaacaa', '.b.aca.b.', '...a.a...', '..aacaa..', '..a.a.a..', '.a..a..a.', '.aa...aa.', 'a.......a'), { a: 'ink6', b: 'yel0', c: 'ink8' }],
  // the launch complex: a service tower beside a rocket on its pad
  launch: [g('.a...c...', '.ab.cdc..', '.a..cdc..', '.ab.cec..', '.a..cdc..', '.abbcdc..', '.a.ccdcc.', 'ffffgffff', 'f..hhh..f'), { a: 'ink6', b: 'ink8', c: 'ink9', d: 'white', e: 'blu4', f: 'ink5', g: 'org0', h: 'yel1' }],
  // a satellite: solar wings either side of a gold bus, a dish
  satellite: [g('.........', 'aba...aba', 'bab...bab', 'abacccaba', 'bab.d.bab', 'aba...aba', '....e....', '...eee...', '.........'), { a: 'blu3', b: 'blu5', c: 'ink8', d: 'yel0', e: 'ink9' }],
  // fusion: plasma held in a ring
  fusion: [g('...aaa...', '.aa...aa.', 'a..bbb..a', 'a.bcccb.a', 'abcdedcba', 'a.bcccb.a', 'a..bbb..a', '.aa...aa.', '...aaa...'), { a: 'vio3', b: 'pnk0', c: 'pnk1', d: 'yel1', e: 'white' }],
  // the blind trust: a padlock
  lock: [g('..aaaaa..', '.ab...ba.', '.a.....a.', 'ccccccccc', 'cdddddddc', 'cddeeeddc', 'cdddedddc', 'cdddddddc', 'ccccccccc'), { a: 'ink6', b: 'ink8', c: 'snd2', d: 'yel0', e: 'snd3' }],
  // the Threshold: light pouring through a doorway
  threshold: [g('.aaaaaaa.', '.abbbbba.', '.abcccba.', '.abcdcba.', '.abcdcba.', '.abcdcba.', '.abcccba.', 'aaecdceaa', 'eeeeeeeee'), { a: 'rck2', b: 'org1', c: 'yel1', d: 'white', e: 'yel0' }],
  // a megaproject: a solar field under a wind turbine and the sun
  mega: [g('dd....c.c', 'd......h.', '......cbc', '.......b.', 'cccccc.b.', 'aaaaaa.b.', '.cccccc.b', '.aaaaaa.b', 'eeeeeeeee'), { a: 'blu2', b: 'ink9', c: 'blu4', d: 'yel0', e: 'grn5', h: 'ink7' }],
  // frontier evals: a magnifier over a model, passing
  evals: [g('..aaa....', '.abbba...', 'abbbcba..', 'abbcbba..', 'acbbbba..', '.abbba...', '..aaada..', '.....dd..', '......dd.'), { a: 'ink8', b: 'blu2', c: 'grn6', d: 'snd4' }],
  // a tender: a sealed envelope of bids
  tender: [g('.........', 'aaaaaaaaa', 'acbbbbbca', 'abcbbbcba', 'abbcbcbba', 'abbbdbbba', 'abbbbbbba', 'aaaaaaaaa', '.........'), { a: 'snd3', b: 'snd8', c: 'snd5', d: 'red3' }],
  // the Charter desk: a desk with a terminal and a lamp
  desk: [g('.......a.', '.bbbb..a.', '.bccb.aa.', '.bbbb.dd.', '..bb.....', 'eeeeeeeee', 'e.f...f.e', 'e.f...f.e', 'e.......e'), { a: 'ink7', b: 'ink4', c: 'cyn5', d: 'yel1', e: 'snd4', f: 'snd2' }],
  // factions: three banners, Atlantic blue, Eastern red, Non-aligned green
  faction: [g('a..a..a..', 'abbaccadd', 'abbaccadd', 'ab.ac.ad.', 'a..a..a..', 'a..a..a..', 'a..a..a..', 'a..a..a..', 'aa.aa.aa.'), { a: 'ink6', b: 'blu4', c: 'red3', d: 'grn6' }],
  // ── Act IV ──
  // the supergrid: a glowing band of power wrapped round the Earth, a node where it lands
  supergrid: [g('...aaa...', '.aabbcaa.', 'abbbccbba', 'eeefeeefe', 'abccbbbba', 'abbcbbbba', '.abbbbba.', '..aaaaa..', '.........'), { a: 'sea2', b: 'sea5', c: 'grn5', e: 'cyn5', f: 'white' }],
  // a fusion fleet: three rings of plasma
  fusionfleet: [g('.........', '.aaa.aaa.', 'abcbabcba', '.aaa.aaa.', '...aaa...', '..abcba..', '...aaa...', '.........', 'eeeeeeeee'), { a: 'vio3', b: 'pnk0', c: 'white', e: 'ink6' }],
  // direct air capture: CO₂ drawn into a bank of fans, clean air out
  dac: [g('.a..a..a.', 'a..a..a..', 'bbbbbbbbb', 'bdcdbdcdb', 'bcecbcecb', 'bdcdbdcdb', 'bbbbbbbbb', '.fffffff.', '.........'), { a: 'ink6', b: 'ink5', c: 'ink8', d: 'ink2', e: 'white', f: 'grn6' }],
  // desalination: a fresh drop lifted out of the waves
  desal: [g('....a....', '...aba...', '..abbba..', '.abbcbba.', '.abbbcba.', '..abbba..', 'dd..a..dd', '.ddd.ddd.', 'e.e.e.e.e'), { a: 'sea3', b: 'sea7', c: 'white', d: 'sea5', e: 'ink8' }],
  // a spaceport: three rockets on a long pad
  spaceport: [g('....a....', '.a..b..a.', '.b..b..b.', '.c..c..c.', '.b..b..b.', '.b..b..b.', 'ddddddddd', 'd.e.e.e.d', '.........'), { a: 'org0', b: 'white', c: 'blu4', d: 'ink5', e: 'yel1' }],
  // an orbital data centre: a lit rack between two solar wings, radiators below
  odc: [g('.........', 'aa.ccc.aa', 'ba.cdc.ab', 'aabcecbaa', 'ba.cdc.ab', 'aa.ccc.aa', '....f....', '...fff...', '....f....'), { a: 'blu3', b: 'blu5', c: 'ink6', d: 'cyn5', e: 'cyn6', f: 'ink8' }],
  // space solar: a gold array beaming power down to a rectenna
  sps: [g('aaaa.aaaa', 'abab.baba', 'aaaacaaaa', '....d....', '...ded...', '....e....', '...e.e...', '....e....', '.fffffff.'), { a: 'org2', b: 'yel1', c: 'ink8', d: 'ink9', e: 'pnk1', f: 'ink6' }],
  // orbital debris: fragments tumbling along a crowded orbit
  debris: [g('a.....b..', '..c......', 'dd...a..c', '..ddd....', '.b...ddd.', '......a.d', 'c..a.....', '...c...b.', '.a....c..'), { a: 'ink8', b: 'org1', c: 'ink6', d: 'ink4' }],
  // the Moon, a base light on its shadow side
  moon: [g('..aaaaa..', '.abbbbca.', 'abcbbbbca', 'abbbbccda', 'abbcbbcda', 'abbbbbcda', '.abbbcde.', '..aaaaa..', '.........'), { a: 'ink5', b: 'ink9', c: 'ink7', d: 'ink6', e: 'yel1' }],
  // the mass driver: a rail of glowing coils flinging a payload off the Moon
  massdriver: [g('.......ba', '......c..', '.....dcd.', '....dcd..', '...dcd...', '..dcd....', '.dcd.....', 'eeeeeeeee', 'fefffefff'), { a: 'white', b: 'yel1', c: 'cyn5', d: 'ink6', e: 'ink7', f: 'ink5' }],
  // the five-year plan: a clipboard of priorities, two ticked
  plan: [g('...fff...', '.aafgfaa.', 'abbbbbbba', 'abcbdddba', 'abbbbbbba', 'abcbddbba', 'abbbbbbba', 'abebdddba', 'aaaaaaaaa'), { a: 'snd3', b: 'snd8', c: 'grn5', d: 'ink6', e: 'yel0', f: 'ink6', g: 'ink8' }],
  // a jump: years running through the hourglass, streaking forward
  jump: [g('.aaaaaaa.', '..bbbbb..', 'd..bbb...', '.d..c....', 'dd..c....', '.d.c.c...', 'd.cbbbc..', '.aaaaaaa.', '.........'), { a: 'snd3', b: 'yel1', c: 'sky5', d: 'cyn5' }],
  // heat: a thermometer near the top, the air shimmering beside it
  heat: [g('..aa.....', '.abba.c..', '.abba..c.', '.abba.c..', '.acca..c.', '.acca.c..', 'acccca...', 'acddca...', '.aaaa....'), { a: 'ink8', b: 'white', c: 'red3', d: 'org2' }],
  // warming: the Earth with a rising red arrow
  warming: [g('.......e.', '......eee', '..aaa.ded', '.abbca.d.', 'abcbbcad.', 'abbccba..', 'abbbbba..', '.abbba...', '..aaa....'), { a: 'sea2', b: 'sea5', c: 'grn5', d: 'red3', e: 'org1' }],
  // wellbeing: a contented green face
  wellbeing: [g('..aaaaa..', '.abbbbba.', 'abcbbbcba', 'abbbbbbba', 'abcbbbcba', 'abbcccbba', '.abbbbba.', '..aaaaa..', '.........'), { a: 'grn2', b: 'grn6', c: 'grn1' }],
  // an AI: a four-point spark in a rounded chip
  ai: [g('.aaaaaaa.', 'ab.....ba', 'a...c...a', 'a..cec..a', 'a.ceded.a', 'a..cec..a', 'a...c...a', 'ab.....ba', '.aaaaaaa.'), { a: 'vio3', b: 'vio2', c: 'cyn4', d: 'white', e: 'cyn6' }],
  // a province: a stretch of land inside its dotted border, the capital starred
  province: [g('.a.a.a...', 'a.bbb.a..', '.bbcbbb.a', 'abbbbcbb.', '.bbcbbbba', 'abbbbdbb.', '.bbbbbbba', '..bbcbb..', '...a.a.a.'), { a: 'ink9', b: 'grn5', c: 'grn4', d: 'yel0' }],
  // orbit: the Earth inside a tilted ring, a satellite riding it
  orbit: [g('......ded', '..aaaaa..', '.abbccba.', 'fabcbbcaf', 'fabbbbbaf', '.fffffff.', '..abbba..', '...aaa...', '.........'), { a: 'sea2', b: 'sea5', c: 'grn5', d: 'blu5', e: 'white', f: 'ink7' }],
  // ── Act V ──
  // the swarm: the Sun ringed by glinting collectors
  swarm: [g('.a..b..a.', '....b....', 'a..ccc..a', '..cdddc..', 'bbcdedcbb', '..cdddc..', 'a..ccc..a', '....b....', '.a..b..a.'), { a: 'cyn5', b: 'org0', c: 'org1', d: 'yel0', e: 'white' }],
  // a foundry: a block of machinery with an arm, its copy taking shape beside it
  foundry: [g('.........', '.aaa.....', '.aba.ccc.', '.aaa.cdc.', '..e..ccc.', '..eeee...', '.fffffff.', '.fgfgfgf.', '.fffffff.'), { a: 'ink6', b: 'cyn5', c: 'ink4', d: 'cyn3', e: 'org1', f: 'ink5', g: 'yel0' }],
  // an asteroid: a lumpy rock with craters, lit from one side
  asteroid: [g('.........', '...aaa...', '..abbba..', '.abcbbda.', '.abbbbda.', '.abbcbda.', '..abdda..', '...aaa...', '.........'), { a: 'rck1', b: 'rck4', c: 'rck2', d: 'rck3' }],
  // a compute ring: a band of glowing racks with radiator fins
  ring: [g('..aaaaa..', '.ab...ba.', 'ab.c.c.ba', 'a..ddd..a', 'a.cdedc.a', 'a..ddd..a', 'ab.c.c.ba', '.ab...ba.', '..aaaaa..'), { a: 'ink7', b: 'cyn5', c: 'ink5', d: 'vio3', e: 'cyn6' }],
  // a habitat: a cylinder seen end-on, green land curving round inside
  habitat: [g('..aaaaa..', '.abbbbba.', 'abcccccba', 'abc...cba', 'abc.d.cba', 'abc...cba', 'abcccccba', '.abbbbba.', '..aaaaa..'), { a: 'ink6', b: 'ink8', c: 'grn5', d: 'sky4' }],
  // longevity: a heart with a sprouting leaf
  longevity: [g('....bb...', '...bcb...', '.aa.b.aa.', 'adeaaadea', 'aeeeeeeea', '.aeeeeea.', '..aeeea..', '...aea...', '....a....'), { a: 'red1', b: 'grn3', c: 'grn6', d: 'pnk1', e: 'red3' }],
  // Mercury: a small cratered grey planet close to a blazing limb
  mercury: [g('aa.......', 'ba..ccc..', 'aa.cdddc.', 'b.cdedddc', 'a.cddddec', 'b.cdeddcc', 'aa.cdddc.', 'ba..ccc..', 'aa.......'), { a: 'yel1', b: 'org1', c: 'ink4', d: 'ink6', e: 'ink5' }],
  // a solar storm: a flare looping off the Sun's limb
  storm: [g('aa.......', 'aab..cc..', 'aab.c..c.', 'aabc....c', 'aab.....c', 'aab....c.', 'aabd..c..', 'aab.dd...', 'aa.......'), { a: 'yel1', b: 'org1', c: 'red3', d: 'org0' }],
  // the Thermal Line: the Earth under a heat bar with its limit marked
  thermal: [g('aaaaaaaaa', 'bbbbbbcd.', 'aaaaaaaaa', '.........', '..eeeee..', '.effgffe.', '.efggffe.', '.effffge.', '..eeeee..'), { a: 'ink6', b: 'org1', c: 'red3', d: 'white', e: 'sea2', f: 'sea5', g: 'grn5' }],
  // a garden province: a tree and grass under the sun
  garden: [g('......a..', '..bbb....', '.bcbcb...', 'bcbbbcb..', '.bbcbb...', '...d.....', '...d.....', 'eefeeefee', 'eeeeeeeee'), { a: 'yel0', b: 'grn5', c: 'grn6', d: 'snd2', e: 'grn3', f: 'grn6' }],
  // minds: a constellation of linked points
  minds: [g('a.......a', '.b.....b.', '..b...b..', '...cac...', '..b.e.b..', '...cac...', '..b...b..', '.b.....b.', 'a.......a'), { a: 'cyn6', b: 'vio3', c: 'cyn4', e: 'white' }],
} satisfies Record<string, Grid>;

export type IconName = keyof typeof ICONS;

const cache = new Map<string, string>();
onEraChange(() => cache.clear());

/** Raw 9×9 canvas (previews, compositing). */
export function iconCanvas(name: IconName): PixelCanvas {
  const [rows, map] = ICONS[name] as Grid;
  return PixelCanvas.from(rows.replace(/\\n/g, '\n'), map);
}

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function iconUrl(name: IconName): string {
  let u = cache.get(name);
  if (!u) {
    u = toDataUrl(iconCanvas(name));
    cache.set(name, u);
  }
  return u;
}
