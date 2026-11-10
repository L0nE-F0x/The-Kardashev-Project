import { useState } from 'preact/hooks';
import { Choice, Icon, Toggle, Window, useGame } from '../components';
import { HOME_SITES } from '../../content/sites';
import { REGIONS } from '../../content/regions';
import { DIFFICULTIES, EVENT_RATES, FOUNDERS, RIVAL_PACES, type Difficulty, type EventRate, type FounderId, type RivalPace } from '../../content/difficulty';
import { fmtMoney } from '../../sim/core';
import { sitePreviewUrl } from '../sitePreview';
import { SandboxControls } from './SandboxControls';
import { SANDBOX_DEFAULT } from '../../sim/sandbox';
import type { SandboxOpts } from '../../sim/types';

const randomSeed = () => Math.floor(Math.random() * 900000) + 100000;

export function NewCompany({ tutorialDefault }: { tutorialDefault?: boolean }) {
  const game = useGame();
  const [name, setName] = useState('Little Sun Labs');
  const [home, setHome] = useState(HOME_SITES[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [founder, setFounder] = useState<FounderId>('classic');
  const [tutorial, setTutorial] = useState(tutorialDefault ?? (!game.settings.tutorialOffered || game.slots().length === 0));
  const [advanced, setAdvanced] = useState(false);
  const [cash, setCash] = useState<number | null>(null);
  const [eventRate, setEventRate] = useState<EventRate>('normal');
  const [rivalPace, setRivalPace] = useState<RivalPace>('normal');
  const [seed, setSeed] = useState<number>(randomSeed());
  const [start, setStart] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [mode, setMode] = useState<'campaign' | 'sandbox'>('campaign');
  const [sandbox, setSandbox] = useState<SandboxOpts>(SANDBOX_DEFAULT);
  const [scenario, setScenario] = useState(false);
  const sb = mode === 'sandbox';
  const lod = game.world.lods[1];
  const startCash = (cash ?? DIFFICULTIES[difficulty].cash) + FOUNDERS[founder].cash;

  const found = () => {
    game.startNew({ name, homeSite: home, seed, difficulty, founder, eventRate, rivalPace, startCash: cash ?? undefined, tutorial: !sb && start === 1 && tutorial, act2: start === 2, act3: start === 3, act4: start === 4, act5: start === 5, sandbox: sb ? sandbox : undefined });
  };

  return (
    <Window title={sb ? 'New sandbox' : 'New company'} icon="hq" wide onClose={() => game.openMenuScreen('main')}>
      <div class="row wrap" style={{ gap: '10px', alignItems: 'center', marginBottom: '10px' }} data-tut="mode">
        <div class="seg">
          <button class={`btn small ${!sb ? 'active' : ''}`} onClick={() => setMode('campaign')} aria-pressed={!sb}>
            Campaign
          </button>
          <button class={`btn small ${sb ? 'active' : ''}`} onClick={() => setMode('sandbox')} aria-pressed={sb}>
            🧪 Sandbox
          </button>
        </div>
        <span class="small muted grow">
          {sb ? 'The same world, with switches: money that never runs out, research on fast-forward, building overnight, and sliders for the world itself. No records or unlocks.' : 'The story from a garage to Type I, with its goals, crises and records.'}
        </span>
      </div>
      <div class="row wrap" style={{ gap: '12px', alignItems: 'flex-end' }}>
        <label class="grow" style={{ minWidth: '220px' }}>
          <span class="label">Company name</span>
          <input type="text" value={name} maxLength={28} onInput={(e) => setName((e.target as HTMLInputElement).value)} style={{ width: '100%' }} />
        </label>
        <div style={{ minWidth: '240px' }}>
          {start === 1 && !sb ? (
            <Toggle label="Bit shows me around" hint="A guided first ten minutes." value={tutorial} onChange={setTutorial} />
          ) : (
            <span class="small muted">Advisors brief you on each new system as it opens.</span>
          )}
        </div>
      </div>

      <h4 class="section">Where do you start?</h4>
      <div class="cardgrid five">
        <button class={`btn pickcard ${start === 1 ? 'active' : ''}`} onClick={() => setStart(1)} aria-pressed={start === 1}>
          <span class="n">
            <Icon name="hq" size="sm" /> Act I · The Garage
          </span>
          <span class="b">2027. Three desks, a rented rack and a seed round. The full story.</span>
        </button>
        <button class={`btn pickcard ${start === 2 ? 'active' : ''}`} onClick={() => setStart(2)} aria-pressed={start === 2} data-tut="start-act2">
          <span class="n">
            <Icon name="campus" size="sm" /> Act II · The Scale-Up
          </span>
          <span class="b">Spring 2029. Series A closed, a campus with two data halls, Bit-2 shipping. Straight to gigawatts.</span>
        </button>
        <button class={`btn pickcard ${start === 3 ? 'active' : ''}`} onClick={() => setStart(3)} aria-pressed={start === 3} data-tut="start-act3">
          <span class="n">
            <Icon name="charter" size="sm" /> Act III · The Charter
          </span>
          <span class="b">January 2035. A listed company with a gigawatt campus — and twelve blocs asking you to run the Kardashev Project.</span>
        </button>
        <button class={`btn pickcard ${start === 4 ? 'active' : ''}`} onClick={() => setStart(4)} aria-pressed={start === 4} data-tut="start-act4">
          <span class="n">
            <Icon name="globe" size="sm" /> Act IV · Planetary
          </span>
          <span class="b">January 2045. A renewed Planetary Charter, fusion lit in a pilot plant, a launch pad — and a whole planet to run.</span>
        </button>
        <button class={`btn pickcard ${start === 5 ? 'active' : ''}`} onClick={() => setStart(5)} aria-pressed={start === 5} data-tut="start-act5">
          <span class="n">
            <Icon name="swarm" size="sm" /> Act V · Type I
          </span>
          <span class="b">January 2068. A hundred terawatts, the Heat Wall behind you, a mass driver on the Moon — and a hundredfold climb to go.</span>
        </button>
      </div>

      {sb && (
        <>
          <h4 class="section">Sandbox switches (change them any time from the 🧪 badge in the top bar)</h4>
          <div class="custom">
            <SandboxControls value={sandbox} onChange={setSandbox} scenario={scenario} onScenario={setScenario} />
          </div>
        </>
      )}

      <h4 class="section">{start === 1 ? 'Where is your garage?' : 'Where is your HQ? (your campus goes to the roomiest site in that region)'}</h4>
      <div class="cardgrid four">
        {HOME_SITES.map((s) => (
          <button key={s.id} class={`btn pickcard ${home === s.id ? 'active' : ''}`} onClick={() => setHome(s.id)} aria-pressed={home === s.id}>
            <img class="preview" src={sitePreviewUrl(lod, s.id)} width={576} height={320} style={{ imageRendering: 'auto', height: 'auto' }} alt="" draggable={false} />
            <span class="n">{s.name}</span>
            <span class="b">{REGIONS[s.region].name}</span>
            <span class="b">
              Talent ×{s.talent.toFixed(1)} · grid ${Math.round(REGIONS[s.region].gridPrice * s.priceMult)}/MWh
            </span>
          </button>
        ))}
      </div>

      <h4 class="section">Difficulty</h4>
      <div class="cardgrid three">
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map((id) => {
          const d = DIFFICULTIES[id];
          return (
            <button key={id} class={`btn pickcard ${difficulty === id ? 'active' : ''}`} onClick={() => setDifficulty(id)} aria-pressed={difficulty === id}>
              <span class="n">{d.name}</span>
              <span class="b">{d.blurb}</span>
              <span class="b gold">
                {start === 1
                  ? `${fmtMoney(d.cash, 0)} seed`
                  : start === 2
                    ? `${fmtMoney({ relaxed: 2.6e9, standard: 2e9, hard: 1.5e9 }[id] ?? 2e9, 0)} after the Series A`
                    : start === 3
                      ? `${fmtMoney({ relaxed: 32e9, standard: 25e9, hard: 18e9 }[id] ?? 25e9, 0)} after the IPO`
                      : 'a listed giant and the Charter’s treasury'}
              </span>
            </button>
          );
        })}
      </div>

      <h4 class="section">Founders</h4>
      <div class="cardgrid five">
        {(Object.keys(FOUNDERS) as FounderId[]).filter((id) => !FOUNDERS[id].unlock || game.settings.stewardUnlocked).map((id) => {
          const f = FOUNDERS[id];
          return (
            <button key={id} class={`btn pickcard ${founder === id ? 'active' : ''}`} onClick={() => setFounder(id)} aria-pressed={founder === id}>
              <span class="n">
                <Icon name={f.icon} size="sm" /> {f.name}
              </span>
              <span class="b">{f.tagline}</span>
              {id !== 'classic' && (
                <>
                  <span class="b good">+ {f.perk}</span>
                  <span class="b warn">− {f.flaw}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <button class="btn small section" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>
        {advanced ? '▾' : '▸'} Custom start
      </button>
      {advanced && (
        <div class="custom">
          <label class="setting slider">
            <span class="txt">
              <span class="l">Seed money</span>
              <span class="h">Overrides the difficulty’s seed round.</span>
            </span>
            <input type="range" min={250e6} max={2e9} step={50e6} value={cash ?? DIFFICULTIES[difficulty].cash} onInput={(e) => setCash(Number((e.target as HTMLInputElement).value))} aria-label="Seed money" />
            <span class="val">{fmtMoney(cash ?? DIFFICULTIES[difficulty].cash, 0)}</span>
          </label>
          <Choice<EventRate> label="Random events" value={eventRate} options={(Object.keys(EVENT_RATES) as EventRate[]).map((k) => [k, EVENT_RATES[k].name])} onChange={setEventRate} />
          <Choice<RivalPace> label="Rival labs" hint="How fast Meridian, Lattice and Open Orchard improve." value={rivalPace} options={(Object.keys(RIVAL_PACES) as RivalPace[]).map((k) => [k, RIVAL_PACES[k].name])} onChange={setRivalPace} />
          <div class="setting opt">
            <span class="txt">
              <span class="l">World seed</span>
              <span class="h">Same seed + same choices = same world. Share it with a friend.</span>
            </span>
            <div class="row" style={{ gap: '4px' }}>
              <input type="text" inputMode="numeric" value={String(seed)} onInput={(e) => setSeed(Number((e.target as HTMLInputElement).value.replace(/\D/g, '')) || 1)} style={{ width: '110px' }} />
              <button class="btn small" onClick={() => setSeed(randomSeed())} aria-label="Random seed">
                🎲
              </button>
            </div>
          </div>
        </div>
      )}

      <div class="row between wrap section" style={{ gap: '8px' }}>
        <span class="small muted">
          {sb ? '🧪 Sandbox · ' : ''}
          {start === 2 ? 'Act II · ' : start === 3 ? 'Act III · ' : start === 4 ? 'Act IV · ' : start === 5 ? 'Act V · ' : ''}
          {DIFFICULTIES[difficulty].name} · {FOUNDERS[founder].name} · {start === 1 ? `${fmtMoney(Math.max(10e6, startCash), 0)} to start` : start === 2 ? 'Series A in the bank' : start === 3 ? 'public, with Charter Standing 2' : start === 4 ? 'a renewed Planetary Charter' : 'a hundred terawatts and the Heat Wall behind you'}
        </span>
        <button class="btn primary big" onClick={found} disabled={game.slotsFull()} data-tip={game.slotsFull() ? 'All 5 slots are in use — delete a company first.' : undefined}>
          <Icon name="play" size="sm" /> {sb ? 'Open the sandbox' : 'Found the company'}
        </button>
      </div>
    </Window>
  );
}
