import type { AdvisorId } from '../sim/types';

/** Advisor jobs: Act II standing orders. Each advisor runs one job. */
export interface JobDef {
  advisor: AdvisorId;
  title: string;
  blurb: string;
  /** Main slider. */
  a: { label: string; min: number; max: number; step: number; fmt: 'months' | 'pct' | 'money' | 'margin' | 'mw'; def: number };
  b?: { label: string; options: [number, string][]; def: number };
  /** Act II phase it unlocks in. */
  phase: number;
  /** Bit's job needs trust: a safety margin at least this high. */
  minMargin?: number;
}

export const JOBS: JobDef[] = [
  {
    advisor: 'mira', title: 'Keep the halls stocked', phase: 1,
    blurb: 'Mira orders accelerators so every data hall has chips on the way for its free rack space.',
    a: { label: 'Monthly chip budget', min: 50e6, max: 3e9, step: 50e6, fmt: 'money', def: 300e6 },
    b: { label: 'Supplier', options: [[0, 'Shortest queue'], [1, 'Lumen'], [2, 'Kestrel']], def: 0 },
  },
  {
    advisor: 'juno', title: 'Power headroom', phase: 1,
    blurb: 'Juno builds generation at your sites so supply stays ahead of load by the margin you set.',
    a: { label: 'Headroom over load', min: 0, max: 0.5, step: 0.05, fmt: 'pct', def: 0.15 },
    b: { label: 'Build', options: [[0, 'Clean first'], [1, 'Cheapest'], [2, 'Firm first']], def: 0 },
  },
  {
    advisor: 'penny', title: 'Cash floor', phase: 1,
    blurb: 'Penny pauses everyone’s automatic spending below this floor, and draws on credit if you have it.',
    a: { label: 'Cash floor', min: 0, max: 5e9, step: 100e6, fmt: 'money', def: 500e6 },
  },
  {
    advisor: 'sol', title: 'Paperwork & goodwill', phase: 1,
    blurb: 'Sol applies for export licences you need and keeps relations from slipping below 40 with small gestures.',
    a: { label: 'Monthly goodwill budget', min: 0, max: 200e6, step: 10e6, fmt: 'money', def: 30e6 },
  },
  {
    advisor: 'iris', title: 'Safety margin', phase: 1,
    blurb: 'Iris shifts the compute split to keep your safety margin above the line you set.',
    a: { label: 'Keep margin above', min: -0.5, max: 1, step: 0.05, fmt: 'margin', def: 0 },
  },
  {
    advisor: 'bit', title: 'Next training run', phase: 1, minMargin: 0,
    blurb: 'Bit starts the next model as soon as one ships. Needs a safety margin of at least 0 — you only automate what you trust.',
    a: { label: 'Training share to restore', min: 0.2, max: 0.8, step: 0.05, fmt: 'pct', def: 0.5 },
  },
];

export const JOB_BY_ADVISOR: Partial<Record<AdvisorId, JobDef>> = Object.fromEntries(JOBS.map((j) => [j.advisor, j]));
