import { Icon, Window, useGame } from '../components';
import { ACHIEVEMENTS, type AchievementDef, type Tier } from '../../content/achievements';
import { achievements } from '../../save/achievements';
import { C } from '../../render/palette';
import { PixelCanvas, toDataUrl } from '../../render/pixels';

const TIER_COLS: Record<Tier | 'locked', [number, number, number]> = {
  bronze: [C.snd2, C.snd4, C.snd6],
  silver: [C.ink5, C.ink8, C.white],
  gold: [C.org0, C.yel0, C.yel2],
  locked: [C.ink2, C.ink3, C.ink4],
};

const medals = new Map<string, string>();

/** A 24×24 pixel medal: a rimmed disc lit from the upper left, with two ribbon tails. */
function medalUrl(tier: Tier | 'locked'): string {
  let url = medals.get(tier);
  if (url) return url;
  const [rim, mid, hi] = TIER_COLS[tier];
  const pc = new PixelCanvas(24, 24);
  // ribbon tails
  const ribbon = tier === 'locked' ? C.ink3 : C.red2;
  const ribbon2 = tier === 'locked' ? C.ink2 : C.blu3;
  for (let y = 15; y < 24; y++) {
    pc.hline(6 - Math.floor((y - 15) / 3), y, 4, ribbon);
    pc.hline(14 + Math.floor((y - 15) / 3), y, 4, ribbon2);
  }
  pc.circle(12, 11, 10.5, C.ink1);
  pc.circle(12, 11, 9.5, rim);
  pc.circle(12, 11, 8.5, mid);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (pc.get(x, y) === mid && Math.hypot(x - 9, y - 8) < 4.5) pc.set(x, y, hi);
  pc.ring(12, 11, 7.5, rim);
  url = toDataUrl(pc);
  medals.set(tier, url);
  return url;
}

export function AchievementBadge({ a, got }: { a: AchievementDef; got: boolean }) {
  return (
    <span class={`badge ${got ? '' : 'locked'}`}>
      <img class="px medal" src={medalUrl(got ? a.tier : 'locked')} alt="" draggable={false} />
      <span class="glyph">{got || !a.secret ? <Icon name={a.icon} size="sm" /> : <b>?</b>}</span>
    </span>
  );
}

const GROUPS: { title: string; test: (a: AchievementDef) => boolean }[] = [
  { title: 'Act I · The Garage', test: (a) => a.act === 1 },
  { title: 'Act II · The Scale-Up', test: (a) => a.act === 2 },
  { title: 'Act III · The Charter', test: (a) => a.act === 3 },
  { title: 'Act IV · Planetary', test: (a) => a.act === 4 },
  { title: 'Act V · Type I', test: (a) => a.act === 5 },
  { title: 'Around campus', test: (a) => a.act === 0 && !a.sandbox },
  { title: 'Sandbox', test: (a) => !!a.sandbox },
];

/** Menu → Achievements: everything you've earned on this device, by act. */
export function AchievementsScreen() {
  const game = useGame();
  const st = achievements();
  const total = ACHIEVEMENTS.length;
  const have = ACHIEVEMENTS.filter((a) => st.got[a.id]).length;
  return (
    <Window title="Achievements" icon="goals" wide onClose={() => game.openMenuScreen('main')}>
      <p class="small muted">
        {have} of {total} on this device. Campaign achievements don’t unlock in a sandbox, and an act a preset skips isn’t yours to collect.
      </p>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h4 class="section">{g.title}</h4>
          <div class="achievements">
            {ACHIEVEMENTS.filter(g.test).map((a) => {
              const at = st.got[a.id];
              const hidden = !at && a.secret;
              return (
                <div class={`achievement ${at ? 'got' : ''}`} key={a.id}>
                  <AchievementBadge a={a} got={!!at} />
                  <span class="txt">
                    <span class="n">{hidden ? 'A secret' : a.name}</span>
                    <span class="d">{hidden ? 'Keep playing.' : a.desc}</span>
                    {at && <span class="d gold">{new Date(at).toLocaleDateString()}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Window>
  );
}
