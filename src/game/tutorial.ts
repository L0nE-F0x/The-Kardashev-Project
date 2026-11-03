import type { Game } from './game';
import type { Mood } from '../content/events';
import { SITE_BY_ID } from '../content/sites';
import { fmtMoney } from '../sim/core';

/**
 * Bit's guided walkthrough of the first ten minutes. Each step points at a real piece of UI
 * (a `data-tut` attribute, or `site:<id>` for a map marker) and advances when its condition
 * becomes true — or when the player presses Next on talk-only steps.
 */
export interface TutorialStep {
  id: string;
  text: (g: Game) => string;
  mood?: Mood;
  /** `data-tut` name, or `site:<id>` for a map marker. Omit for a centred bubble. */
  target?: (g: Game) => string | null;
  /** Advance automatically once this is true. */
  done?: (g: Game) => boolean;
  /** Label for a manual Next button (talk-only steps). */
  next?: string;
  /** Prepare the screen when the step begins. */
  enter?: (g: Game) => void;
}

/** A good first data center site near each starting garage. */
const FIRST_SITE: Record<string, string> = {
  'bay-area': 'mojave',
  'n-virginia': 'west-texas',
  london: 'iberia',
  bengaluru: 'thar',
};

export function suggestedSite(g: Game): string {
  return FIRST_SITE[g.state?.company.homeSite ?? ''] ?? 'west-texas';
}

const s = (g: Game) => g.state!;

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'hello',
    mood: 'excited',
    text: (g) => `Hi! I’m Bit — well, I will be once you train me. We have ${fmtMoney(s(g).finance.cash, 0)} of seed money and a garage. Let me show you around!`,
    next: 'Show me',
  },
  {
    id: 'hud',
    target: () => 'stats',
    text: () => 'Up here: cash, power, compute, our model and the safety margin. Hover (or long-press) almost anything for the details.',
    next: 'Next',
  },
  {
    id: 'kmeter',
    target: () => 'kmeter',
    text: () => 'And this is the big one: the Kardashev scale. Earth runs on about 19.6 terawatts — K 0.729. The long game is to push it toward Type I.',
    next: 'Next',
  },
  {
    id: 'open-compute',
    target: () => 'dock-compute',
    text: () => 'First, we need compute. Open the Compute panel.',
    done: (g) => g.panel === 'compute',
  },
  {
    id: 'rent',
    target: () => 'rent-plus',
    enter: (g) => {
      if (g.panel !== 'compute') g.openPanel('compute');
    },
    text: () => 'Rent 500 accelerators from Cumulus Cloud. Instant — but pricey, so we won’t rent forever.',
    done: (g) => s(g).rental.units >= 500,
  },
  {
    id: 'train',
    target: () => 'start-train',
    text: () => 'Now start training Bit-1. That’s me! (The next me.)',
    done: (g) => !!s(g).training || s(g).models.length > 0,
  },
  {
    id: 'play',
    target: () => 'speed',
    text: () => 'Time is paused. Press play — at normal speed, one second is one day. ▶▶ goes faster.',
    done: (g) => g.speed > 0,
  },
  {
    id: 'wait-bit1',
    mood: 'happy',
    text: (g) => {
      const run = s(g).training;
      const pct = run ? Math.floor((run.done / run.target) * 100) : 100;
      return `Training… ${pct}%. It takes about two weeks of game time. Meanwhile — notice the goal card on the left? It always knows what’s next.`;
    },
    done: (g) => s(g).models.length > 0,
  },
  {
    id: 'safety',
    target: () => 'alloc-safety',
    enter: (g) => {
      if (g.panel !== 'compute') g.openPanel('compute');
    },
    mood: 'neutral',
    text: () => 'I’m live and earning a little! Before we grow, put some compute into safety research — Iris says at least 8%. Drag the Safety slider.',
    done: (g) => s(g).alloc.safety >= 0.08,
  },
  {
    id: 'research',
    target: (g) => (g.panel === 'research' ? 'tech-first' : 'dock-research'),
    enter: (g) => {
      if (g.panel === 'compute') g.openPanel(null);
    },
    text: (g) => (g.panel === 'research' ? 'Pick any project — Mixture of Experts makes training cheaper. Click it.' : 'Research makes everything better. Open the Research panel.'),
    done: (g) => !!s(g).research.current || s(g).research.done.length > 0,
  },
  {
    id: 'site',
    target: (g) => `site:${suggestedSite(g)}`,
    enter: (g) => {
      g.panel = null;
      g.selection = null;
      const site = SITE_BY_ID[suggestedSite(g)];
      const scene = g.stage.getScene() as { focusSite?: (id: string) => void } | null;
      if (site) scene?.focusSite?.(site.id);
    },
    text: (g) => `Renting is expensive — we need our own data center. ${SITE_BY_ID[suggestedSite(g)]?.name} looks good: cheap land and sunshine. Click it on the map.`,
    done: (g) => g.selection?.kind === 'site' && SITE_BY_ID[g.selection.id]?.kind === 'build' && g.selection.id !== s(g).company.homeSite,
  },
  {
    id: 'build-dc',
    target: () => 'build-datacenter',
    text: () => 'Build a Data Center here. It takes over a year — so start early!',
    done: (g) => s(g).facilities.some((f) => f.type === 'datacenter'),
  },
  {
    id: 'power',
    target: () => 'build-solar',
    mood: 'neutral',
    text: () => 'It will need power. Solar + batteries is fastest to build; a grid connection is cheaper but the queue is long. Build a Solar Farm (or request grid above).',
    done: (g) => s(g).objectives.done.includes('power') || s(g).facilities.some((f) => f.type === 'solar' || f.type === 'wind' || f.type === 'gas') || Object.values(s(g).sites).some((x) => x.grid.pending.length > 0),
  },
  {
    id: 'order',
    target: (g) => (g.panel === 'orders' ? 'order-button' : 'dock-orders'),
    text: (g) => (g.panel === 'orders' ? 'Pick a supplier and quantity, then order. Lumen chips are faster; Kestrel’s queue is shorter.' : 'Chips! Open Orders to buy accelerators that ship to the new site.'),
    done: (g) => s(g).orders.length > 0 || s(g).shipments.length > 0,
  },
  {
    id: 'done',
    target: () => 'dock-guide',
    mood: 'excited',
    enter: (g) => {
      g.panel = null;
    },
    text: () => 'That’s the loop! The goal card will guide you to your Series A. Curious how anything works in the real world? It’s all in the Field Guide.',
    next: 'Let’s go!',
  },
];

/** Index of the step where the clock first starts. Until then, time stays paused. */
export const PLAY_STEP = TUTORIAL.findIndex((t) => t.id === 'play');
