import { Icon, Window, useGame } from '../components';
import { ACHIEVEMENTS, type AchievementDef } from '../../content/achievements';
import { achievements } from '../../save/achievements';
import { medalUrl } from '../medals';

/** A medal of the achievement's tier (medals.ts), its icon on the medal's plate. */
export function AchievementBadge({ a, got }: { a: AchievementDef; got: boolean }) {
  return (
    <span class={`ach-badge ${got ? '' : 'locked'}`}>
      <img class="medal" src={medalUrl(got ? a.tier : 'locked')} alt="" draggable={false} />
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
    <Window title="Achievements" icon="legit" wide onClose={() => game.openMenuScreen('main')}>
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
