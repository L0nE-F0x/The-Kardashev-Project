export type TechCategory = 'ai' | 'hardware' | 'energy' | 'safety' | 'policy';

/** Multiplicative effects; the sim multiplies every completed tech's value for a key. */
export type TechKey =
  | 'algoEff'
  | 'inferEff'
  | 'safetyEff'
  | 'demand'
  | 'pue'
  | 'solarCF'
  | 'windCF'
  | 'batteryMWh'
  | 'batteryCost'
  | 'gasFuel'
  | 'gasCO2'
  | 'interconnect'
  | 'permit'
  | 'licenseGain'
  | 'hbmExposure'
  | 'dcBuild'
  | 'incidentSeverity'
  | 'research'
  | 'waterPenalty'
  | 'heatPenalty';

export interface TechDef {
  id: string;
  name: string;
  cat: TechCategory;
  cost: number;
  requires?: string[];
  blurb: string;
  effect: string;
  mods: Partial<Record<TechKey, number>>;
}

export const TECH_CATEGORIES: Record<TechCategory, { name: string; icon: string }> = {
  ai: { name: 'Models', icon: '🧠' },
  hardware: { name: 'Hardware', icon: '🔷' },
  energy: { name: 'Energy', icon: '⚡' },
  safety: { name: 'Safety', icon: '🛡' },
  policy: { name: 'Policy', icon: '🤝' },
};

export const TECHS: TechDef[] = [
  // ── Models ──────────────────────────────────────────────────────────────────────────────
  { id: 'moe', name: 'Mixture of Experts', cat: 'ai', cost: 30, blurb: 'Route each token to a few specialist sub-networks.', effect: 'Algorithmic efficiency ×2 — every training FLOP counts double.', mods: { algoEff: 2 } },
  { id: 'distillation', name: 'Distillation', cat: 'ai', cost: 40, blurb: 'Teach small, cheap models to imitate big ones.', effect: 'Inference revenue per accelerator ×1.5.', mods: { inferEff: 1.5 } },
  { id: 'scaling-laws', name: 'Scaling-Law Forecasting', cat: 'ai', cost: 60, requires: ['moe'], blurb: 'Predict a run’s loss before you spend the compute.', effect: 'Algorithmic efficiency ×1.5.', mods: { algoEff: 1.5 } },
  { id: 'spec-decoding', name: 'Speculative Decoding', cat: 'ai', cost: 65, requires: ['distillation'], blurb: 'A tiny draft model guesses, the big one checks.', effect: 'Inference revenue per accelerator ×1.3.', mods: { inferEff: 1.3 } },
  { id: 'agents', name: 'Long-Horizon Agents', cat: 'ai', cost: 90, requires: ['scaling-laws'], blurb: 'Models that plan, use tools and finish multi-day tasks.', effect: 'Market demand for your models ×2.', mods: { demand: 2 } },
  { id: 'ai-researchers', name: 'AI Research Assistants', cat: 'ai', cost: 110, requires: ['agents'], blurb: 'Your own models start running experiments overnight.', effect: 'Research output ×1.4.', mods: { research: 1.4 } },
  // ── Hardware ────────────────────────────────────────────────────────────────────────────
  { id: 'liquid-cooling', name: 'Liquid Cooling', cat: 'hardware', cost: 35, blurb: 'Cold plates on every chip instead of roaring fans.', effect: 'Data center PUE 1.30 → 1.15 (less power per chip).', mods: { pue: 0.885 } },
  { id: 'dry-cooling', name: 'Dry Cooling', cat: 'hardware', cost: 35, blurb: 'Closed-loop cooling that barely sips water.', effect: 'No efficiency penalty at water-scarce sites; heatwaves hurt less.', mods: { waterPenalty: 0, heatPenalty: 0.5 } },
  { id: 'modular-dc', name: 'Modular Data Halls', cat: 'hardware', cost: 60, requires: ['liquid-cooling'], blurb: 'Factory-built halls that bolt together on site.', effect: 'Data centers build 30% faster.', mods: { dcBuild: 0.7 } },
  { id: 'hbm-futures', name: 'HBM Futures', cat: 'hardware', cost: 45, blurb: 'Lock in memory allocations years ahead.', effect: 'HBM shortages slow your chip orders half as much.', mods: { hbmExposure: 0.5 } },
  // ── Energy ──────────────────────────────────────────────────────────────────────────────
  { id: 'trackers', name: 'Single-Axis Trackers', cat: 'energy', cost: 30, blurb: 'Panels that follow the sun across the sky.', effect: 'Solar output +15%.', mods: { solarCF: 1.15 } },
  { id: 'lfp-cells', name: 'LFP Mega-Cells', cat: 'energy', cost: 40, blurb: 'Cheap iron-phosphate cells by the shipping container.', effect: 'Batteries store 25% more and cost 20% less.', mods: { batteryMWh: 1.25, batteryCost: 0.8 } },
  { id: 'tall-towers', name: 'Taller Wind Towers', cat: 'energy', cost: 40, blurb: 'Reach the steadier winds higher up.', effect: 'Wind output +15%.', mods: { windCF: 1.15 } },
  { id: 'ccgt', name: 'Combined-Cycle Retrofit', cat: 'energy', cost: 45, blurb: 'Capture turbine exhaust heat to make more steam power.', effect: 'Gas plants burn 20% less fuel and emit 20% less CO₂.', mods: { gasFuel: 0.8, gasCO2: 0.8 } },
  // ── Safety ──────────────────────────────────────────────────────────────────────────────
  { id: 'interp-1', name: 'Interpretability I', cat: 'safety', cost: 35, blurb: 'Find the features a model actually uses.', effect: 'Safety research efficiency ×2.', mods: { safetyEff: 2 } },
  { id: 'constitution', name: 'Constitutional Training', cat: 'safety', cost: 50, blurb: 'Train models against a written set of principles.', effect: 'Safety efficiency ×1.5; trust grows faster everywhere.', mods: { safetyEff: 1.5, licenseGain: 1.3 } },
  { id: 'evals', name: 'Dangerous-Capability Evals', cat: 'safety', cost: 55, requires: ['interp-1'], blurb: 'Red-team every model before release.', effect: 'Safety incidents are 40% less severe.', mods: { incidentSeverity: 0.6 } },
  // ── Policy ──────────────────────────────────────────────────────────────────────────────
  { id: 'fast-track', name: 'Interconnect Fast-Track', cat: 'policy', cost: 45, blurb: 'Pre-studied grid connections and a pile of paperwork done early.', effect: 'Grid connections arrive 40% sooner.', mods: { interconnect: 0.6 } },
  { id: 'community', name: 'Community Benefit Deals', cat: 'policy', cost: 40, blurb: 'Local hiring, rebates and a new school roof.', effect: 'Permits 10% faster; local trust grows 30% faster.', mods: { permit: 0.9, licenseGain: 1.3 } },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));
