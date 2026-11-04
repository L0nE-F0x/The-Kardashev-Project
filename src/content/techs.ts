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
  | 'solarCost'
  | 'windCost'
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
  | 'heatPenalty'
  // ── Act II ──
  | 'pkgEff'
  | 'nuclearBuild'
  | 'linkLoss'
  | 'linkRange'
  | 'relationGain'
  | 'licenceDays'
  | 'rivalReact'
  | 'rivalBoost'
  | 'openPressure'
  | 'smuggleRisk'
  // ── Act III ──
  | 'energyYield'
  | 'charterCost'
  | 'charterSpeed'
  | 'accessGain'
  | 'alignGain'
  | 'legitGain'
  // ── Act IV ──
  | 'fusionOdds'
  | 'fusionCost'
  | 'tritiumBreed'
  | 'linkYield'
  | 'spaceCost'
  | 'debrisGrowth'
  | 'aiIncident'
  | 'dacEff'
  | 'wellbeingGain';

export interface TechDef {
  id: string;
  name: string;
  cat: TechCategory;
  cost: number;
  requires?: string[];
  blurb: string;
  effect: string;
  mods: Partial<Record<TechKey, number>>;
  /** Act it becomes available in (default 1). */
  act?: number;
  /** Act II phase it becomes available in. */
  phase?: number;
  /** Act III: the Charter phase it becomes available in. */
  cphase?: number;
  /** Act IV: the planet stage it becomes available in. */
  stage?: number;
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

  // ════════════════════════════════════ ACT II ════════════════════════════════════════
  // ── Models ──
  { id: 'synthetic-data', name: 'Synthetic Data Pipelines', cat: 'ai', cost: 140, act: 2, requires: ['scaling-laws'], blurb: 'When the internet runs out, models write their own textbooks.', effect: 'Algorithmic efficiency ×1.5.', mods: { algoEff: 1.5 } },
  { id: 'reasoning', name: 'Test-Time Reasoning', cat: 'ai', cost: 160, act: 2, requires: ['agents'], blurb: 'Let the model think longer before it answers.', effect: 'Market demand ×1.3; inference revenue ×1.2.', mods: { demand: 1.3, inferEff: 1.2 } },
  { id: 'long-context', name: 'Million-Token Context', cat: 'ai', cost: 120, act: 2, requires: ['distillation'], blurb: 'Whole codebases and contracts in a single prompt.', effect: 'Market demand ×1.25.', mods: { demand: 1.25 } },
  { id: 'auto-research', name: 'Automated Research Labs', cat: 'ai', cost: 240, act: 2, phase: 2, requires: ['ai-researchers'], blurb: 'Your models design, run and write up experiments end to end.', effect: 'Research output ×1.5.', mods: { research: 1.5 } },
  { id: 'world-models', name: 'World Models', cat: 'ai', cost: 300, act: 2, phase: 3, requires: ['synthetic-data'], blurb: 'Models that learn physics from video and simulation.', effect: 'Algorithmic efficiency ×1.6.', mods: { algoEff: 1.6 } },
  // ── Hardware ──
  { id: 'immersion', name: 'Immersion Cooling', cat: 'hardware', cost: 110, act: 2, requires: ['liquid-cooling'], blurb: 'Servers bathe in dielectric fluid. Heatwaves barely register.', effect: 'PUE ×0.93; heatwaves hurt half as much.', mods: { pue: 0.93, heatPenalty: 0.5 } },
  { id: 'chiplets', name: 'Chiplet Architectures', cat: 'hardware', cost: 120, act: 2, blurb: 'Smaller dies, stitched together: better yields, easier packaging.', effect: 'Packaging goes 25% further; HBM shortages bite 20% less.', mods: { pkgEff: 1.25, hbmExposure: 0.8 } },
  { id: 'hbm4', name: 'HBM4 Stacks', cat: 'hardware', cost: 130, act: 2, requires: ['hbm-futures'], blurb: 'Taller, wider memory stacks with their own logic base die.', effect: 'HBM shortages bite 30% less.', mods: { hbmExposure: 0.7 } },
  { id: 'gw-campus', name: 'Gigawatt Campus Design', cat: 'hardware', cost: 180, act: 2, phase: 3, requires: ['modular-dc'], blurb: 'Substations, cooling plants and halls designed as one machine.', effect: 'Unlocks the Gigawatt Campus; data centers build 10% faster.', mods: { dcBuild: 0.9 } },
  // ── Energy ──
  { id: 'egs', name: 'Enhanced Geothermal', cat: 'energy', cost: 120, act: 2, blurb: 'Fracking know-how pointed at hot dry rock.', effect: 'Geothermal plants at hot-rock sites, not just volcanic ones.', mods: {} },
  { id: 'perovskite', name: 'Perovskite Tandems', cat: 'energy', cost: 150, act: 2, requires: ['trackers'], blurb: 'A second solar layer on top of silicon catches more of the spectrum.', effect: 'Solar output +20%; solar 15% cheaper.', mods: { solarCF: 1.2, solarCost: 0.85 } },
  { id: 'hvdc', name: 'HVDC Lines', cat: 'energy', cost: 130, act: 2, blurb: 'High-voltage direct current: long lines, small losses.', effect: 'Power lines reach 2.5× further and lose 60% less.', mods: { linkRange: 2.5, linkLoss: 0.4 } },
  { id: 'smr-licensing', name: 'SMR Design Certification', cat: 'energy', cost: 110, act: 2, phase: 2, blurb: 'One approved design, built many times.', effect: 'Nuclear builds 15% faster.', mods: { nuclearBuild: 0.85 } },
  { id: 'grid-forming', name: 'Grid-Forming Inverters', cat: 'energy', cost: 90, act: 2, blurb: 'Batteries that can hold up a grid on their own.', effect: 'Grid connections 20% sooner; batteries store 15% more.', mods: { interconnect: 0.8, batteryMWh: 1.15 } },
  // ── Safety ──
  { id: 'interp-2', name: 'Interpretability II', cat: 'safety', cost: 140, act: 2, requires: ['interp-1'], blurb: 'Trace whole circuits, not just features.', effect: 'Safety research efficiency ×2.', mods: { safetyEff: 2 } },
  { id: 'oversight', name: 'Scalable Oversight', cat: 'safety', cost: 180, act: 2, requires: ['evals'], blurb: 'Weaker models, carefully arranged, can check stronger ones.', effect: 'Safety efficiency ×1.5; incidents 30% less severe.', mods: { safetyEff: 1.5, incidentSeverity: 0.7 } },
  { id: 'ai-control', name: 'AI Control Protocols', cat: 'safety', cost: 160, act: 2, phase: 2, requires: ['constitution'], blurb: 'Assume a model might misbehave and design the deployment so it can’t do harm.', effect: 'Incidents 40% less severe; trust grows 20% faster.', mods: { incidentSeverity: 0.6, licenseGain: 1.2 } },
  // ── Policy ──
  { id: 'policy-desk', name: 'Policy Desk', cat: 'policy', cost: 80, act: 2, blurb: 'Former diplomats on staff, in every capital.', effect: 'Relations with governments grow 30% faster; licences 25% faster.', mods: { relationGain: 1.3, licenceDays: 0.75 } },
  { id: 'compliance', name: 'Export Compliance Systems', cat: 'policy', cost: 100, act: 2, phase: 2, requires: ['policy-desk'], blurb: 'Track every chip from wafer to rack.', effect: 'Licences 40% faster; detours half as risky.', mods: { licenceDays: 0.6, smuggleRisk: 0.5 } },
  { id: 'local-content', name: 'Local Content Programmes', cat: 'policy', cost: 90, act: 2, requires: ['community'], blurb: 'Hire, train and buy locally wherever you build.', effect: 'Permits 10% faster; trust grows 20% faster.', mods: { permit: 0.9, licenseGain: 1.2 } },

  // ════════════════════════════════════ ACT III ════════════════════════════════════════
  // ── Models ──
  { id: 'agentic-science', name: 'Agentic Science', cat: 'ai', cost: 380, act: 3, requires: ['auto-research'], blurb: 'Swarms of agents that read, hypothesise, run the experiment and write it up overnight.', effect: 'Research output ×1.5.', mods: { research: 1.5 } },
  { id: 'recursive-distill', name: 'Recursive Distillation', cat: 'ai', cost: 420, act: 3, requires: ['world-models'], blurb: 'Each generation teaches the next a little more efficiently.', effect: 'Algorithmic efficiency ×1.6.', mods: { algoEff: 1.6 } },
  { id: 'grid-ai', name: 'Grid-Scale Forecasting AI', cat: 'ai', cost: 300, act: 3, cphase: 2, requires: ['reasoning'], blurb: 'Models that predict sun, wind and demand hours ahead across a continent.', effect: 'Charter megaprojects deliver 8% more.', mods: { energyYield: 1.08 } },
  // ── Hardware ──
  { id: 'optical-io', name: 'Optical Interconnects', cat: 'hardware', cost: 320, act: 3, requires: ['chiplets'], blurb: 'Light instead of copper between chips: more bandwidth, less power.', effect: 'PUE ×0.95; inference revenue ×1.15.', mods: { pue: 0.95, inferEff: 1.15 } },
  { id: 'rad-hard', name: 'Radiation-Hardened Accelerators', cat: 'hardware', cost: 260, act: 3, cphase: 2, blurb: 'Chips that shrug off cosmic rays — for orbit, and for Kip.', effect: 'Charter contracts 5% cheaper (space builds especially).', mods: { charterCost: 0.95 } },
  // ── Energy ──
  { id: 'superconducting', name: 'Superconducting Cables', cat: 'energy', cost: 340, act: 3, cphase: 2, requires: ['hvdc'], blurb: 'Cryogenic lines that carry gigawatts with almost no loss.', effect: 'Charter megaprojects deliver 6% more; power lines lose 50% less.', mods: { energyYield: 1.06, linkLoss: 0.5 } },
  { id: 'sodium-cells', name: 'Sodium-Ion Grid Storage', cat: 'energy', cost: 260, act: 3, requires: ['lfp-cells'], blurb: 'Batteries from salt instead of lithium.', effect: 'Batteries 30% cheaper; Charter builds 5% faster.', mods: { batteryCost: 0.7, charterSpeed: 0.95 } },
  { id: 'advanced-fission', name: 'Advanced Fission', cat: 'energy', cost: 360, act: 3, requires: ['smr-licensing'], blurb: 'Molten salt and high-temperature reactors from a factory line.', effect: 'Nuclear builds 20% faster; Charter builds 5% faster.', mods: { nuclearBuild: 0.8, charterSpeed: 0.95 } },
  // ── Safety ──
  { id: 'interp-3', name: 'Interpretability III', cat: 'safety', cost: 380, act: 3, requires: ['interp-2'], blurb: 'Read a frontier model’s plans before it acts on them.', effect: 'Safety research ×2; world alignment grows 20% faster.', mods: { safetyEff: 2, alignGain: 1.2 } },
  { id: 'formal-verification', name: 'Formal Verification of Agents', cat: 'safety', cost: 420, act: 3, cphase: 3, requires: ['oversight'], blurb: 'Mathematical proofs about what a deployed agent can and can’t do.', effect: 'Incidents 40% less severe everywhere; world alignment grows 20% faster.', mods: { incidentSeverity: 0.6, alignGain: 1.2 } },
  // ── Policy ──
  { id: 'open-tendering', name: 'Open Tendering Platform', cat: 'policy', cost: 240, act: 3, requires: ['policy-desk'], blurb: 'Every bid, score and award published in real time.', effect: 'Legitimacy gains ×1.25; Charter contracts 5% cheaper.', mods: { legitGain: 1.25, charterCost: 0.95 } },
  { id: 'citizen-assemblies', name: 'Citizen Assemblies', cat: 'policy', cost: 280, act: 3, cphase: 2, requires: ['local-content'], blurb: 'Randomly chosen citizens deliberate on every megaproject.', effect: 'Access grows 25% faster; Legitimacy gains ×1.15.', mods: { accessGain: 1.25, legitGain: 1.15 } },
  // ── Act IV · Planetary ──
  { id: 'hts-magnets', name: 'Next-Gen HTS Magnets', cat: 'energy', cost: 520, act: 4, stage: 1, blurb: 'Superconducting tape that holds a stronger field in a smaller coil.', effect: 'Fusion pilots more likely to work (×1.15); fleets 10% cheaper.', mods: { fusionOdds: 1.15, fusionCost: 0.9 } },
  { id: 'breeding-blankets', name: 'Lithium Breeding Blankets', cat: 'energy', cost: 560, act: 4, stage: 2, requires: ['hts-magnets'], blurb: 'Wrap the plasma in lithium and every fusion neutron breeds the next fuel.', effect: 'Fusion fleets breed tritium 60% faster.', mods: { tritiumBreed: 1.6 } },
  { id: 'fusion-factories', name: 'Fusion Plant Factories', cat: 'energy', cost: 640, act: 4, stage: 2, requires: ['hts-magnets'], blurb: 'Build the plant on an assembly line and ship it in modules.', effect: 'Fusion fleets 20% cheaper.', mods: { fusionCost: 0.8 } },
  { id: 'superconducting-cable', name: 'Superconducting Cable', cat: 'hardware', cost: 540, act: 4, stage: 1, blurb: 'Cryogenic cable that carries a continent’s power with almost no loss.', effect: 'The supergrid’s daylight bonus ×1.3.', mods: { linkYield: 1.3 } },
  { id: 'sorbent-dac', name: 'Moisture-Swing Sorbents', cat: 'energy', cost: 480, act: 4, stage: 1, blurb: 'Sorbents that drink CO₂ when dry and let it go when wet — no heat needed.', effect: 'Air capture removes 40% more.', mods: { dacEff: 1.4 } },
  { id: 'rapid-reuse', name: 'Rapid Reuse Heavy Lift', cat: 'hardware', cost: 600, act: 4, stage: 3, blurb: 'Rockets that land, refuel and fly again before lunch.', effect: 'Everything in space 15% cheaper.', mods: { spaceCost: 0.85 } },
  { id: 'debris-tracking', name: 'Debris Tracking & Avoidance', cat: 'hardware', cost: 460, act: 4, stage: 3, blurb: 'Every fragment catalogued and every satellite dodging on its own.', effect: 'Debris builds up 40% slower.', mods: { debrisGrowth: 0.6 } },
  { id: 'constitutional-dispatch', name: 'Constitutional Dispatch', cat: 'safety', cost: 560, act: 4, stage: 1, blurb: 'AIs that run grids under a written, auditable constitution.', effect: 'AI incidents in provinces 40% rarer.', mods: { aiIncident: 0.6 } },
  { id: 'ai-auditors', name: 'AI Auditors', cat: 'safety', cost: 620, act: 4, stage: 2, requires: ['constitutional-dispatch'], blurb: 'Smaller, trusted models that watch the big ones every second of the day.', effect: 'AI incidents 35% rarer; world alignment grows 15% faster.', mods: { aiIncident: 0.65, alignGain: 1.15 } },
  { id: 'universal-services', name: 'Universal Basic Services', cat: 'policy', cost: 500, act: 4, stage: 1, blurb: 'Cheap power turned into free water, cooling, transport and compute for everyone.', effect: 'Province wellbeing ×1.06.', mods: { wellbeingGain: 1.06 } },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));
