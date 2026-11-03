import { Icon, Portrait, useGame } from './components';
import { EVENT_BY_ID } from '../content/events';
import { fmtDate, fmtMoney, fmtMW } from '../sim/core';
import { CAPABILITY_TIERS, tierOf } from '../sim/model';

export function EventModal() {
  const game = useGame();
  const s = game.state!;
  const active = s.events.active;
  if (!active || game.awayReport) return null;
  if (!game.settings.autoPause && !game.eventOpen) return null;
  const def = EVENT_BY_ID[active.id];
  if (!def) return null;
  const ctx = active.ctx;
  const choices = def.choices(s, ctx);
  return (
    <div class="scrim">
      <div class="modal frame" role="dialog" aria-label={def.title(s, ctx)}>
        <div class="head">
          <span class="ico">{def.icon}</span>
          <div class="grow">
            <div class="label">
              {def.category} · {fmtDate(s.day)}
            </div>
            <h2>{def.title(s, ctx)}</h2>
          </div>
        </div>
        <div class="body">
          <div class="story">{def.body(s, ctx)}</div>
          {def.advisors(s, ctx).map((a, i) => (
            <div class="quote" key={i}>
              <Portrait id={a.id} mood={a.mood} size={56} />
              <div class="bubble">
                <b>{a.id === 'bit' ? 'Bit' : { juno: 'Juno · Engineering', penny: 'Penny · Finance', mira: 'Mira · Supply chain', sol: 'Sol · Diplomacy', iris: 'Iris · Safety', kip: 'Kip · Space' }[a.id]}</b>
                {a.text}
              </div>
            </div>
          ))}
          <div class="choices">
            {choices.map((c, i) => (
              <button key={i} class={`btn choice ${i === 0 ? 'primary' : ''}`} disabled={!!c.disabled} onClick={() => game.chooseEvent(i)}>
                <span class="t">{c.label}</span>
                <span class="d">{c.detail}</span>
                {c.disabled && <span class="why">✗ {c.disabled}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AwayModal() {
  const game = useGame();
  const r = game.awayReport;
  if (!r) return null;
  const { before, after } = r;
  const months = r.days / 30.4;
  const d = (label: string, v: string, cls = '') => (
    <div class="delta">
      <div class="label">{label}</div>
      <div class={`v ${cls}`}>{v}</div>
    </div>
  );
  return (
    <div class="scrim">
      <div class="modal frame away">
        <div class="head">
          <span class="ico">🌙</span>
          <div class="grow">
            <div class="label">While you were away</div>
            <h2>
              {r.hours < 1 ? `${Math.round(r.hours * 60)} minutes` : `${r.hours.toFixed(1)} hours`} away · {months < 1 ? `${r.days} days` : `${months.toFixed(1)} months`} passed
            </h2>
          </div>
        </div>
        <div class="body">
          <div class="quote">
            <Portrait id="bit" mood="happy" size={56} />
            <div class="bubble">
              <b>Bit</b>
              I kept everything running! It's now {fmtDate(after.day, true)}. Here's what changed:
            </div>
          </div>
          <div class="deltas">
            {d('Cash', `${after.cash - before.cash >= 0 ? '+' : ''}${fmtMoney(after.cash - before.cash)}`, after.cash >= before.cash ? 'good' : 'bad')}
            {d('Kardashev', `+${(after.K - before.K).toFixed(5)}`, 'cyan')}
            {d('Revenue', `${fmtMoney(after.revenueMonth)}/mo`)}
            {d('Chips installed', `${after.installed.toLocaleString()}`)}
            {d('Models', `${after.models}${after.models > before.models ? ' (new!)' : ''}`)}
            {d('Techs', `${after.techs}${after.techs > before.techs ? ` (+${after.techs - before.techs})` : ''}`)}
          </div>
          {r.highlights.length > 0 && (
            <div class="section small">
              {r.highlights.map((n, i) => (
                <div key={i} class={n.kind === 'bad' ? 'warn' : 'good'}>
                  {n.text}
                </div>
              ))}
            </div>
          )}
          <div class="choices">
            <button class="btn primary choice" onClick={() => game.dismissAway()}>
              <span class="t">Back to work</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActCompleteModal() {
  const game = useGame();
  const s = game.state!;
  if (!game.showActComplete) return null;
  if (s.flags.act2Complete) return <Act2CompleteModal />;
  const st = s.stats;
  const model = s.models[s.models.length - 1];
  return (
    <div class="scrim">
      <div class="modal frame">
        <div class="head">
          <span class="ico">🏁</span>
          <div class="grow">
            <div class="label">{fmtDate(s.day, true)}</div>
            <h2>Act I complete — The Garage</h2>
          </div>
        </div>
        <div class="body">
          <div class="story">
            {s.company.name} went from three desks and a rented rack to a real AI company with its own compute, its own model and a Series A in the bank.
          </div>
          <div class="deltas">
            <div class="delta">
              <div class="label">Model</div>
              <div class="v">{model?.name}</div>
              <div class="small muted">{CAPABILITY_TIERS[tierOf(st.capability)]} · {st.capability.toFixed(2)}</div>
            </div>
            <div class="delta">
              <div class="label">Compute</div>
              <div class="v cyan">{st.computeEF.toFixed(1)} EF</div>
            </div>
            <div class="delta">
              <div class="label">Revenue</div>
              <div class="v gold">{fmtMoney(st.revenueMonth)}/mo</div>
            </div>
            <div class="delta">
              <div class="label">Safety margin</div>
              <div class={`v ${st.margin >= 0 ? 'good' : 'warn'}`}>{st.margin.toFixed(2)}</div>
            </div>
            <div class="delta">
              <div class="label">Your generation</div>
              <div class="v">{fmtMW(st.playerGenMW)}</div>
            </div>
            <div class="delta">
              <div class="label">Kardashev</div>
              <div class="v cyan">{st.K.toFixed(5)}</div>
            </div>
          </div>
          <div class="quote">
            <Portrait id="juno" mood="excited" size={56} />
            <div class="bubble">
              <b>Juno · Engineering</b>
              Next: gigawatt campuses, our own power plants, maybe a fab partnership. Act II — The Scale-Up — starts now.
            </div>
          </div>
          <div class="choices">
            <button class="btn primary choice" onClick={() => game.dismissActComplete()}>
              <span class="t">
                <Icon name="play" size="sm" /> On to Act II
              </span>
              <span class="d">The Scale-Up: from megawatts to gigawatts.</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GameOverModal() {
  const game = useGame();
  const s = game.state;
  if (!s?.meta.gameOver) return null;
  const st = s.stats;
  return (
    <div class="scrim">
      <div class="modal frame">
        <div class="head">
          <span class="ico">🪦</span>
          <div class="grow">
            <div class="label">{fmtDate(s.day, true)}</div>
            <h2>{s.company.name} has closed</h2>
          </div>
        </div>
        <div class="body">
          <div class="story">Hard mode is unforgiving: the money ran out. Here’s how far you got.</div>
          <div class="deltas">
            <div class="delta">
              <div class="label">Best model</div>
              <div class="v">{s.models[s.models.length - 1]?.name ?? '—'}</div>
            </div>
            <div class="delta">
              <div class="label">Compute</div>
              <div class="v cyan">{st.computeEF.toFixed(1)} EF</div>
            </div>
            <div class="delta">
              <div class="label">Kardashev</div>
              <div class="v cyan">{st.K.toFixed(5)}</div>
            </div>
          </div>
          <div class="quote">
            <Portrait id="penny" mood="worried" size={56} />
            <div class="bubble">
              <b>Penny · Finance</b>
              Most startups die of running out of money. We’ll be smarter next time.
            </div>
          </div>
          <div class="choices">
            <button
              class="btn primary choice"
              onClick={() => {
                game.quitToMenu();
                game.openMenuScreen('new');
              }}
            >
              <span class="t">Start a new company</span>
            </button>
            <button class="btn choice" onClick={() => game.quitToMenu()}>
              <span class="t">Back to the main menu</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Act2CompleteModal() {
  const game = useGame();
  const s = game.state!;
  const st = s.stats;
  const model = s.models[s.models.length - 1];
  const standing = s.finale?.standing ?? 0;
  const seat = standing >= 3 ? 'a founding seat' : standing === 2 ? 'a strong voice' : standing === 1 ? 'a seat at the back' : 'an observer’s badge';
  return (
    <div class="scrim">
      <div class="modal frame">
        <div class="head">
          <span class="ico">🔔</span>
          <div class="grow">
            <div class="label">{fmtDate(s.day, true)}</div>
            <h2>Act II complete — The Scale-Up</h2>
          </div>
        </div>
        <div class="body">
          <div class="story">
            {s.company.name} rang the bell at {fmtMoney(s.capital.ipo?.valuation ?? s.finance.valuation)}. Gigawatt campuses, power you own, chips you can count on — and you came through the Crunch holding {standing} of 3 fronts.
          </div>
          <div class="deltas">
            <div class="delta">
              <div class="label">IPO</div>
              <div class="v gold">{fmtMoney(s.capital.ipo?.valuation ?? 0)}</div>
              <div class="small muted">raised {fmtMoney(s.capital.ipo?.raised ?? 0)}</div>
            </div>
            <div class="delta">
              <div class="label">Model</div>
              <div class="v">{model?.name}</div>
              <div class="small muted">{CAPABILITY_TIERS[tierOf(st.capability)]} · {st.capability.toFixed(2)}</div>
            </div>
            <div class="delta">
              <div class="label">IT capacity</div>
              <div class="v cyan">{fmtMW(st.itMW)}</div>
            </div>
            <div class="delta">
              <div class="label">Your generation</div>
              <div class="v">{fmtMW(st.genAvgMW)}</div>
              <div class="small muted">{Math.round((st.cleanGenMW / Math.max(1, st.genAvgMW)) * 100)}% clean</div>
            </div>
            <div class="delta">
              <div class="label">Charter standing</div>
              <div class={`v ${standing >= 2 ? 'good' : 'warn'}`}>{standing} / 3</div>
            </div>
            <div class="delta">
              <div class="label">Kardashev</div>
              <div class="v cyan">{st.K.toFixed(5)}</div>
            </div>
          </div>
          <div class="quote">
            <Portrait id="sol" mood="excited" size={56} />
            <div class="bubble">
              <b>Sol · Diplomacy</b>
              The blocs have called an emergency summit. After the Crunch, they want someone to coordinate power, chips and compute for the whole planet — and they keep saying our name. We’d have {seat}. Act III — The Charter — is on the drawing board.
            </div>
          </div>
          <div class="choices">
            <button class="btn primary choice" onClick={() => game.dismissActComplete()}>
              <span class="t">
                <Icon name="play" size="sm" /> Keep playing (sandbox)
              </span>
              <span class="d">Keep growing toward Type I; Act III is coming.</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
