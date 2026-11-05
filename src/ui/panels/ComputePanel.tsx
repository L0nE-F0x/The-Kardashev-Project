import { Bar, Icon, KV, Panel, pct, useGame } from '../components';
import { OwnLicenceBox } from './Act3Panels';
import { RENTAL } from '../../content/companies';
import { fmtDate, fmtDays, fmtMoney, fmtSci } from '../../sim/core';
import { CAPABILITY_TIERS, capabilityOf, algoEff, incidentChance, rentalMax, rentalPrice, tierOf, MFU } from '../../sim/model';
import { modMult } from '../../sim/effects';
import { nextModelPlan } from '../../sim/ai';
import type { AllocKey } from '../../sim/actions';
import type { IconName } from '../icons';

const ALLOC: [AllocKey, IconName, string, string][] = [
  ['train', 'train', 'Training', 'Builds the next model. Bigger runs need more FLOP.'],
  ['infer', 'infer', 'Inference', 'Serves customers. Revenue depends on model quality vs the frontier.'],
  ['research', 'research', 'Research', 'Boosts research output (diminishing returns).'],
  ['safety', 'shield', 'Safety', 'Raises alignment. Keep ~10% as much as training to hold the margin.'],
];

export function ComputePanel() {
  const game = useGame();
  const s = game.state!;
  const st = s.stats;
  const plan = nextModelPlan(s);
  const run = s.training;
  const trainPerDay = st.trainPFd;
  const etaDays = run && trainPerDay > 0 ? (run.target - run.done) / trainPerDay : Infinity;
  // with no run going the training share serves customers, so estimate what it WOULD train (same formula as ai.ts)
  const wouldTrainPerDay = run ? trainPerDay : st.computeEF * 1000 * 1e15 * MFU * s.alloc.train * 86400 * modMult(s, 'training');
  const planDays = wouldTrainPerDay > 0 ? plan.flop / wouldTrainPerDay : Infinity;
  const inferChips = (st.computeEF * 1000 * s.alloc.infer) / RENTAL.perf;
  const marginCls = st.margin >= 0.25 ? 'good' : st.margin >= 0 ? '' : st.margin >= -0.5 ? 'warn' : 'bad';
  const safetyCapped = s.flags.safetyCapUntil && s.day < Number(s.flags.safetyCapUntil);

  return (
    <Panel title="Compute & Models" icon="compute" class="wide" onClose={() => game.openPanel(null)}>
      <div class="row wrap" style={{ gap: '14px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '260px' }}>
          <h4>Capacity</h4>
          <KV
            rows={[
              ['Total compute', <b class="cyan">{st.computeEF.toFixed(2)} EF/s</b>],
              ['Your accelerators', `${st.installedAccel.toLocaleString()} installed${st.ownedAccel > st.installedAccel ? ` (+${(st.ownedAccel - st.installedAccel).toLocaleString()} waiting)` : ''}`],
              ['Rented (Cumulus)', `${st.rentedAccel.toLocaleString()}`],
            ]}
          />
          <div class="section">
            <h4>Cloud rental</h4>
            <div class="row">
              <button class="btn small" onClick={() => game.setRental(s.rental.units - RENTAL.step)} disabled={s.rental.units <= 0}>
                −{RENTAL.step}
              </button>
              <div class="grow" style={{ textAlign: 'center' }}>
                <b>{s.rental.units.toLocaleString()}</b> <span class="muted small">/ {rentalMax(s).toLocaleString()}</span>
              </div>
              <button class="btn small" data-tut="rent-plus" onClick={() => game.setRental(s.rental.units + RENTAL.step)} disabled={s.rental.units >= rentalMax(s)}>
                +{RENTAL.step}
              </button>
            </div>
            <div class="small muted" style={{ marginTop: '3px' }}>
              {fmtMoney(rentalPrice(s), 0)} per chip-month · now {fmtMoney(s.rental.units * rentalPrice(s))}/mo. Instant, but pricey.
            </div>
          </div>
        </div>
        <div class="grow" style={{ minWidth: '280px' }}>
          <h4>Allocation</h4>
          <div class="alloc">
            {ALLOC.map(([key, icon, label, tip]) => (
              <>
                <Icon name={icon} size="sm" key={`${key}i`} />
                <span class="small" key={`${key}l`} data-tip={tip}>
                  {label}
                </span>
                <input
                  key={`${key}r`}
                  data-tut={key === 'safety' ? 'alloc-safety' : undefined}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(s.alloc[key] * 100)}
                  onInput={(e) => game.setAlloc(key, Number((e.target as HTMLInputElement).value) / 100)}
                  aria-label={label}
                />
                <span class="small" key={`${key}v`} style={{ textAlign: 'right' }}>
                  {pct(s.alloc[key])}
                </span>
              </>
            ))}
          </div>
          {safetyCapped && <div class="small warn">Board terms cap safety at 5% until {fmtDate(Number(s.flags.safetyCapUntil))}.</div>}
          {!run && s.alloc.train > 0 && <div class="small warn">No training run active — the training share is serving inference for now.</div>}
          <div class="small muted" style={{ marginTop: '6px' }}>
            Training {fmtSci(trainPerDay * 30.4)} FLOP/mo · inference ~{Math.round(inferChips).toLocaleString()} chips · research {st.rpPerDay.toFixed(1)}/day
          </div>
        </div>
      </div>

      <div class="section">
        <h4>Training</h4>
        <OwnLicenceBox />
        {run ? (
          <div>
            <div class="row between">
              <span>
                <Icon name="train" size="sm" /> <b>{run.name}</b> — target {fmtSci(run.target)} FLOP
              </span>
              <span class="small muted">{Number.isFinite(etaDays) ? `~${fmtDays(etaDays)} left` : 'stalled — allocate compute'}</span>
            </div>
            <Bar value={run.done / run.target} kind="violet" tall />
            <div class="small muted" style={{ marginTop: '3px' }}>
              Expected capability on release: {capabilityOf(run.target, algoEff(s)).toFixed(2)} ({CAPABILITY_TIERS[tierOf(capabilityOf(run.target, algoEff(s)))]}) — better algorithms raise it.
            </div>
          </div>
        ) : (
          <div class="row between wrap">
            <span class="small">
              Next: <b>{plan.name}</b> · {fmtSci(plan.flop)} FLOP · capability ≈ {capabilityOf(plan.flop, algoEff(s)).toFixed(2)}
              <span class="muted"> · {Number.isFinite(planDays) ? `~${fmtDays(planDays)} at current rate` : 'needs compute: rent some or build a hall'}</span>
            </span>
            <button class="btn primary" data-tut="start-train" onClick={() => game.startTraining()}>
              <Icon name="play" size="sm" /> Start {plan.name}
            </button>
          </div>
        )}
      </div>

      <div class="row wrap section" style={{ gap: '14px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '260px' }}>
          <h4>Market</h4>
          <KV
            rows={[
              ['Frontier capability', st.frontier.toFixed(2), 'Best closed model from Meridian or Lattice'],
              ['Your quality vs frontier', `×${st.inferQuality.toFixed(2)}`, 'Revenue per chip scales with this'],
              ['Demand for your models', `~${Math.round(st.inferDemand / RENTAL.perf).toLocaleString()} chips`, 'Inference beyond demand earns 15%'],
              ['Inference revenue', <b class="gold">{fmtMoney(st.revenueMonth)}/mo</b>],
            ]}
          />
          <div class="small muted" style={{ marginTop: '4px' }}>
            {s.market.rivals.map((r) => `${r.name.split(' ')[0]} ${r.capability.toFixed(2)}`).join(' · ')}
          </div>
        </div>
        <div class="grow" style={{ minWidth: '260px' }}>
          <h4>Safety</h4>
          <KV
            rows={[
              ['Alignment', st.alignment.toFixed(2)],
              ['Capability', st.capability.toFixed(2)],
              ['Margin', <b class={marginCls}>{st.margin >= 0 ? '+' : ''}{st.margin.toFixed(2)}</b>],
              ['Incident risk', st.capability > 0 ? `${pct(incidentChance(st.margin), 1)} / month` : '—'],
            ]}
          />
          <div class="small muted" style={{ marginTop: '4px' }}>
            Incidents so far: {s.safety.incidents}. Each new model raises capability and squeezes the margin.
          </div>
        </div>
      </div>

      {s.models.length > 0 && (
        <div class="section">
          <h4>Models</h4>
          {s.models.map((m) => (
            <div class="row small between" key={m.name}>
              <span>
                <b>{m.name}</b> · {fmtSci(m.flop)} FLOP
              </span>
              <span class="muted">
                {m.capability.toFixed(2)} {CAPABILITY_TIERS[tierOf(m.capability)]} · {fmtDate(m.day)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
