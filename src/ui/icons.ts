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
  arrow: [`.........\n....a....\n...aa....\n..aaaaaa.\n.aaaaaaa.\n..aaaaaa.\n...aa....\n....a....\n.........`, { a: 'ink9' }],
  co2: [`.........\n..aaa....\n.abbba...\nabbbbbaa.\nabbbbbbba\n.aaaaaaa.\n.........\n.c.c.c...\n.........`, { a: 'ink5', b: 'ink7', c: 'ink6' }],
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
  // ── Act III (placeholders — redrawn by the art pass) ──
  charter: [g('...aaa...', '.aabbbaa.', '.abcbcba.', 'abbbcbbba', 'abcccccba', 'abbbcbbba', '.abcbcba.', '.aabbbaa.', '...aaa...'), { a: 'snd3', b: 'yel0', c: 'sea6' }],
  council: [g('....a....', '...aba...', '..abbba..', '.aaaaaaa.', '.a.a.a.a.', '.a.a.a.a.', '.a.a.a.a.', 'aaaaaaaaa', 'abbbbbbba'), { a: 'ink8', b: 'yel0' }],
  mission: [g('....a....', '...aba...', '...aba...', '..abcba..', '..abcba..', '.abbcbba.', '.abbbbba.', 'aa.a.a.aa', '...ddd...'), { a: 'ink8', b: 'blu4', c: 'sky4', d: 'org1' }],
  partner: [g('.aa...aa.', 'abba.abba', 'abba.abba', '.aa...aa.', '.........', 'aaaa.aaaa', 'abbbabbba', 'abbbabbba', 'aaaa.aaaa'), { a: 'ink6', b: 'cyn4' }],
  world: [g('...aaa...', '.aabbcaa.', '.abccbba.', 'abbcbbcba', 'acccbbbba', 'abbbbccba', '.abbbcca.', '.aabbbaa.', '...aaa...'), { a: 'sea2', b: 'sea6', c: 'grn6' }],
  legit: [g('aaaaaaaaa', 'abbbbbbba', 'abccbccba', 'abbbbbbba', 'abccccbba', 'abbbbbbba', '.abbbbba.', '..abbba..', '...aaa...'), { a: 'snd3', b: 'yel1', c: 'snd4' }],
  capital: [g('.........', '...aaa...', '..abbba..', '.abbcbba.', '.abcccba.', '.abbcbba.', '..abbba..', '...aaa...', '.........'), { a: 'vio1', b: 'vio4', c: 'yel0' }],
  access: [g('....a....', '...aaa...', '..a.a.a..', '....a....', '.a..a..a.', 'aaa.a.aaa', '.a..a..a.', '...aaa...', '..aaaaa..'), { a: 'cyn4' }],
  vote: [g('.........', '.aaaaaaa.', '.abbbbba.', '.abcbcba.', '.abbbbba.', 'aaaaaaaaa', 'addddddda', 'addddddda', 'aaaaaaaaa'), { a: 'ink7', b: 'white', c: 'grn6', d: 'blu3' }],
  hvdc: [g('a.......a', 'aa.....aa', '.aa...aa.', '..abbba..', '..bcccb..', '..abbba..', '.aa...aa.', 'aa.....aa', 'a.......a'), { a: 'ink6', b: 'org1', c: 'yel1' }],
  launch: [g('....a....', '...aba...', '...aba...', '...aba...', '..abbba..', '..abbba..', '.aa.a.aa.', '...cdc...', '....c....'), { a: 'ink8', b: 'white', c: 'org1', d: 'yel0' }],
  satellite: [g('.........', 'aa.....aa', 'aab...baa', 'aa.bbb.aa', '...bcb...', 'aa.bbb.aa', 'aab...baa', 'aa.....aa', '.........'), { a: 'blu4', b: 'ink8', c: 'cyn5' }],
  fusion: [g('...aaa...', '.aa...aa.', 'a..bbb..a', 'a.bcccb.a', 'a.bcdcb.a', 'a.bcccb.a', 'a..bbb..a', '.aa...aa.', '...aaa...'), { a: 'vio3', b: 'pnk0', c: 'yel1', d: 'white' }],
  lock: [g('...aaa...', '..a...a..', '..a...a..', '.aaaaaaa.', '.abbbbba.', '.abbcbba.', '.abbcbba.', '.abbbbba.', '.aaaaaaa.'), { a: 'ink7', b: 'snd5', c: 'snd2' }],
  threshold: [g('....a....', '...aba...', '...aba...', '..abcba..', '..abcba..', '.abbcbba.', '.abbbbba.', 'abbbcbbba', 'aaaaaaaaa'), { a: 'red2', b: 'org1', c: 'yel1' }],
  mega: [g('.........', '.a.a.a.a.', 'aaaaaaaaa', 'abababab.', 'aaaaaaaaa', 'abababab.', 'aaaaaaaaa', '.c.c.c.c.', 'ccccccccc'), { a: 'blu2', b: 'sky4', c: 'snd4' }],
  evals: [g('.aaaaaaa.', 'abbbbbbba', 'ab.....ba', 'ab.c.c.ba', 'ab..c..ba', 'ab.c.c.ba', 'ab.....ba', 'abbbbbbba', '.aaaaaaa.'), { a: 'blu1', b: 'blu4', c: 'grn6' }],
  tender: [g('aaaaaa...', 'abbbbaa..', 'abccbaba.', 'abbbbaaaa', 'abccccbba', 'abbbbbbba', 'abccccbba', 'abbbbbbba', 'aaaaaaaaa'), { a: 'ink6', b: 'ink9', c: 'ink5' }],
  desk: [g('.........', '..aaaaa..', '..abbba..', '..aaaaa..', 'aaaaaaaaa', 'acccccccc', 'a.c...c.c', 'a.c...c.c', '..c...c..'), { a: 'ink7', b: 'cyn4', c: 'snd3' }],
  faction: [g('a........', 'abbbb....', 'abbbbcc..', 'abbbbccc.', 'a...ccccc', 'a........', 'a........', 'a........', 'aa.......'), { a: 'ink8', b: 'blu4', c: 'red3' }],
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
