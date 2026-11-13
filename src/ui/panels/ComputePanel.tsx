import { Icon, KV, Panel, pct, useGame } from '../components';
import { Card, Cols, Gauge, Meter, SplitBar, Tile, Tiles, type Tone } from '../kit';
import { OwnLicenceBox } from './Act3Panels';
import { RENTAL } from '../../content/companies';
import { fmtDate, fmtDays, fmtMoney, fmtSci } from '../../sim/core';
import { CAPABILITY_TIERS, capabilityOf, algoEff, incidentChance, inferPriceTrend, openBest, rentalMax, rentalPrice, tierOf, MFU } from '../../sim/model';
import { DIFFICULTIES } from '../../content/difficulty';
import { modMult } from '../../sim/effects';
import { nextModelPlan } from '../../sim/ai';
import type { AllocKey } from '../../sim/actions';
import type { IconName } from '../icons';

const ALLOC: [AllocKey, IconName, string, string, Tone][] = [
  ['train', 'train', 'Training', 'Builds the next model. Bigger runs need more FLOP.', 'violet'],
  ['infer', 'infer', 'Inference', 'Serves customers. Revenue depends on model quality vs the frontier.', 'gold'],
  ['research', 'research', 'Research', 'Boosts research output (diminishing returns).', 'cyan'],
  ['safety', 'shield', 'Safety', 'Raises alignment. Keep ~10% as much as training to hold the margin.', 'blue'],
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
  const safetyCapped = s.flags.safetyCapUntil && s.day < Number(s.flags.safetyCapUntil);

  const model = s.models[s.models.length - 1];
  const risk = st.capability > 0 ? incidentChance(st.margin) * DIFFICULTIES[s.meta.difficulty].incident : 0;
  const marginTone: Tone = st.margin >= 0.25 ? 'good' : st.margin >= 0 ? 'blue' : st.margin >= -0.5 ? 'warn' : 'bad';
  return (
    <Panel title="Compute & models" icon="compute" class="wide" onClose={() => game.openPanel(null)}>
      <Tiles>
        <Tile label="Compute" icon="compute" tone="cyan" value={<>{st.computeEF < 100 ? st.computeEF.toFixed(2) : Math.round(st.computeEF).toLocaleString('en-US')}<small>EF/s</small></>} sub={`${(st.installedAccel + st.rentedAccel).toLocaleString()} chips at work`} tip="Everything your halls and your rented chips can compute, at peak." />
        <Tile label="Best model" icon="brain" tone="violet" value={model ? model.name : 'None yet'} sub={model ? `${st.capability.toFixed(2)} · ${CAPABILITY_TIERS[tierOf(st.capability)]}` : 'Train Bit-1 below'} tip={`The frontier (the best closed model from Meridian or Lattice) stands at ${st.frontier.toFixed(2)}.`} />
        <Tile label="Revenue" icon="cash" tone="gold" value={<>{fmtMoney(st.revenueMonth)}<small>/mo</small></>} sub={`quality ×${st.inferQuality.toFixed(2)} of the frontier`} tip="What customers pay for inference each month. It scales with how good your best model is against the frontier." />
        <Tile label="Safety margin" icon="shield" tone={marginTone} value={`${st.margin >= 0 ? '+' : ''}${st.margin.toFixed(2)}`} sub={st.capability > 0 ? `${pct(risk, 1)} incident risk a month` : 'no model yet'} tip="Alignment minus capability. Below zero, safety incidents become likely." />
      </Tiles>

      <Card title="Training" icon="train">
        <OwnLicenceBox />
        {run ? (
          <div>
            <Meter
              tall
              tone="violet"
              value={run.done / run.target}
              label={
                <>
                  <b>{run.name}</b> <span class="muted">· {fmtSci(run.target)} FLOP</span>
                </>
              }
              text={Number.isFinite(etaDays) ? `${pct(run.done / run.target)} · ~${fmtDays(etaDays)} left` : 'stalled: give training some compute'}
            />
            <div class="small muted" style={{ marginTop: '7px' }}>
              Expected capability on release: {capabilityOf(run.target, algoEff(s)).toFixed(2)} ({CAPABILITY_TIERS[tierOf(capabilityOf(run.target, algoEff(s)))]}). Better algorithms raise it.
            </div>
          </div>
        ) : (
          <div class="row between wrap">
            <span>
              Next: <b>{plan.name}</b> <span class="muted">· {fmtSci(plan.flop)} FLOP · capability ≈ {capabilityOf(plan.flop, algoEff(s)).toFixed(2)}</span>
              <div class="small muted">{Number.isFinite(planDays) ? `About ${fmtDays(planDays)} at the current rate.` : 'Needs compute: rent some or build a hall.'}</div>
            </span>
            <button class="btn primary" data-tut="start-train" onClick={() => game.startTraining()}>
              <Icon name="play" size="sm" /> Start {plan.name}
            </button>
          </div>
        )}
      </Card>

      <Cols>
        <Card title="Allocation" icon="chart">
          <SplitBar parts={ALLOC.map(([key, , label, tip, tone]) => ({ label, value: s.alloc[key], tone, tip }))} legend={false} />
          <div class="alloc" style={{ marginTop: '11px' }}>
            {ALLOC.map(([key, icon, label, tip, tone]) => (
              <>
                <Icon name={icon} size="sm" key={`${key}i`} />
                <span class="small" key={`${key}l`} data-tip={tip}>
                  {label}
                </span>
                <input
                  key={`${key}r`}
                  class={`t-${tone}`}
                  data-tut={key === 'safety' ? 'alloc-safety' : undefined}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(s.alloc[key] * 100)}
                  onInput={(e) => game.setAlloc(key, Number((e.target as HTMLInputElement).value) / 100)}
                  aria-label={label}
                />
                <span class="small num" key={`${key}v`} style={{ textAlign: 'right' }}>
                  {pct(s.alloc[key])}
                </span>
              </>
            ))}
          </div>
          {safetyCapped && <div class="small warn">Investor terms cap safety at {pct(Number(s.flags.safetyCapValue ?? 0.05))} until {fmtDate(Number(s.flags.safetyCapUntil))}.</div>}
          {!run && s.alloc.train > 0 && <div class="small warn" style={{ marginTop: '6px' }}>No training run active: the training share is serving inference for now.</div>}
          <div class="small muted" style={{ marginTop: '6px' }}>
            Training {fmtSci(trainPerDay * 30.4)} FLOP/mo · inference ~{Math.round(inferChips).toLocaleString()} chips · research {st.rpPerDay.toFixed(1)}/day
          </div>
        </Card>
        <Card title="Chips" icon="compute">
          <KV
            rows={[
              ['Installed', `${st.installedAccel.toLocaleString()}`],
              ...(st.ownedAccel > st.installedAccel ? ([['Waiting for a hall', `${(st.ownedAccel - st.installedAccel).toLocaleString()}`]] as [string, string][]) : []),
              ['Rented (Cumulus)', `${st.rentedAccel.toLocaleString()}`],
            ]}
          />
          <h4 class="sub">Cloud rental</h4>
          <div class="stepper">
            <button class="btn small" onClick={() => game.setRental(s.rental.units - RENTAL.step)} disabled={s.rental.units <= 0}>
              −{RENTAL.step}
            </button>
            <div class="grow">
              <b class="num">{s.rental.units.toLocaleString()}</b> <span class="muted small">/ {rentalMax(s).toLocaleString()}</span>
            </div>
            <button class="btn small" data-tut="rent-plus" onClick={() => game.setRental(s.rental.units + RENTAL.step)} disabled={s.rental.units >= rentalMax(s)}>
              +{RENTAL.step}
            </button>
          </div>
          <div class="small muted" style={{ marginTop: '6px' }}>
            {fmtMoney(rentalPrice(s), 0)} per chip-month · now {fmtMoney(s.rental.units * rentalPrice(s))}/mo. Instant, but pricey.
          </div>
        </Card>
      </Cols>

      <Cols>
        <Card title="Market" icon="chart">
          <KV
            rows={[
              ['Frontier capability', st.frontier.toFixed(2), 'Best closed model from Meridian or Lattice'],
              ['Your quality vs frontier', `×${st.inferQuality.toFixed(2)}`, `Revenue per chip scales with this${st.capability > 0 && st.capability < openBest(s) ? '. Your best model trails the free open-weights one, which costs you a further 25%.' : ''}`],
              ...((s.act ?? 1) >= 2 ? ([['Market price', `×${inferPriceTrend(s).toFixed(2)}`, 'AI prices fall about 20% a year as everyone builds out: the same chips earn less each year unless your models get better.']] as [string, string, string][]) : []),
              ['Demand for your models', `~${Math.round(st.inferDemand / RENTAL.perf).toLocaleString()} chips`, 'Inference beyond demand earns 15%'],
            ]}
          />
          <div class="small muted" style={{ marginTop: '6px' }}>
            {s.market.rivals.map((r) => `${r.name.split(' ')[0]} ${r.capability.toFixed(2)}`).join(' · ')}
          </div>
        </Card>
        <Card title="Safety" icon="shield">
          <div class="row" style={{ gap: '16px', alignItems: 'center' }}>
            <Gauge value={st.margin} min={-1} max={1.5} danger={0} text={`${st.margin >= 0 ? '+' : ''}${st.margin.toFixed(2)}`} label="margin" tone={marginTone} />
            <div class="grow">
              <KV
                rows={[
                  ['Alignment', st.alignment.toFixed(2)],
                  ['Capability', st.capability.toFixed(2)],
                  ['Incidents so far', String(s.safety.incidents)],
                ]}
              />
            </div>
          </div>
          <div class="small muted" style={{ marginTop: '6px' }}>Each new model raises capability and squeezes the margin.</div>
        </Card>
      </Cols>

      {s.models.length > 0 && (
        <Card title="Models" icon="brain">
          {[...s.models].reverse().map((m) => (
            <div class="lrow" key={m.name}>
              <span>
                <b>{m.name}</b> <span class="muted small">· {fmtSci(m.flop)} FLOP · {fmtDate(m.day)}</span>
              </span>
              <span>
                <span class="num">{m.capability.toFixed(2)}</span> <span class="muted small">{CAPABILITY_TIERS[tierOf(m.capability)]}</span>
              </span>
            </div>
          ))}
        </Card>
      )}
    </Panel>
  );
}
