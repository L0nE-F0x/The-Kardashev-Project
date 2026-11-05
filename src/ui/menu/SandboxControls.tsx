import { Choice, Toggle } from '../components';
import type { SandboxOpts } from '../../sim/types';

type Slider = 'politics' | 'climate' | 'shocks' | 'chips';

const SLIDERS: { key: Slider; label: string; hint: string; min: number; max: number; step: number }[] = [
  { key: 'politics', label: 'Bloc politics', hint: 'How hard relations swing, both ways. Low: the world shrugs. High: every move is a headline.', min: 0.25, max: 2.5, step: 0.25 },
  { key: 'climate', label: 'Climate sensitivity', hint: 'Warming per tonne of carbon (it starts to matter in Act IV). 0 = a planet that forgives everything.', min: 0, max: 3, step: 0.25 },
  { key: 'shocks', label: 'Crises and supply shocks', hint: 'What every crisis card costs, on top of the difficulty.', min: 0, max: 3, step: 0.25 },
  { key: 'chips', label: 'Chip prices', hint: 'What Lumen and Kestrel charge for an accelerator.', min: 0.25, max: 2, step: 0.25 },
];

/** The sandbox switches and (optionally) the scenario sliders, for New Company and the in-game panel. */
export function SandboxControls({ value, onChange, scenario = true, onScenario }: { value: SandboxOpts; onChange: (v: SandboxOpts) => void; scenario?: boolean; onScenario?: (open: boolean) => void }) {
  const set = (patch: Partial<SandboxOpts>) => onChange({ ...value, ...patch });
  return (
    <div class="sandbox-controls">
      <Toggle label="Money never runs out" hint="Your company's cash (and, from Act III, the Charter's treasury) tops itself up." value={value.unlimited} onChange={(v) => set({ unlimited: v })} />
      <Choice<SandboxOpts['research']>
        label="Research"
        hint="Everything: every technology your act has reached is already known."
        value={value.research}
        options={[
          ['normal', 'Normal'],
          ['fast', '4× faster'],
          ['all', 'Everything'],
        ]}
        onChange={(v) => set({ research: v })}
      />
      <Toggle label="Build overnight" hint="Facilities, upgrades, links, grid hook-ups and Charter projects finish the next day." value={value.instant} onChange={(v) => set({ instant: v })} />
      {onScenario && (
        <button class="btn small" style={{ justifySelf: 'start' }} onClick={() => onScenario(!scenario)} aria-expanded={scenario}>
          {scenario ? '▾' : '▸'} Scenario sliders
        </button>
      )}
      {scenario &&
        SLIDERS.map((sl) => (
          <label class="setting slider" key={sl.key}>
            <span class="txt">
              <span class="l">{sl.label}</span>
              <span class="h">{sl.hint}</span>
            </span>
            <input type="range" min={sl.min} max={sl.max} step={sl.step} value={value[sl.key]} onInput={(e) => set({ [sl.key]: Number((e.target as HTMLInputElement).value) } as Partial<SandboxOpts>)} aria-label={sl.label} />
            <span class="val">×{value[sl.key].toFixed(2).replace(/0$/, '')}</span>
          </label>
        ))}
    </div>
  );
}
