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
    id: 'loop',
    mood: 'happy',
    text: () => 'The whole game in one breath: money builds data halls and the power to run them → halls hold chips → chips are compute → compute trains models like me → better models earn more → more money. Research and safety make every turn of that loop better.',
    next: 'Got it',
  },
  {
    id: 'hud',
    target: () => 'stats',
    text: () => 'Up here: cash (and which way it’s heading each month), power served vs needed, compute, our best model and the safety margin. Red or orange means trouble. Hover (or long-press) any of it for the details.',
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
    text: () => 'Compute is what trains models, and compute comes from chips. Rent 500 accelerators from Cumulus Cloud: instant, but pricey — a bridge until we have our own hall.',
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
    text: () => 'Time is paused. Press play — at 1× one second is one day. The ▶▶ buttons (or keys 1–4) go 2×, 4× and 8×; Space pauses.',
    done: (g) => g.speed > 0,
  },
  {
    id: 'wait-bit1',
    mood: 'happy',
    target: () => 'objectives',
    enter: (g) => {
      // the goal card sits under the Compute panel: close it so the card can be seen (narrow screens also hide
      // the card while the inspector is open)
      if (g.panel === 'compute') g.openPanel(null);
      if (window.innerWidth <= 820) g.selection = null;
    },
    text: (g) => {
      const run = s(g).training;
      const pct = run ? Math.floor((run.done / run.target) * 100) : 100;
      const rate = s(g).stats.trainPFd;
      const days = run && rate > 0 ? Math.max(1, Math.ceil((run.target - run.done) / rate)) : 0;
      return `Training… ${pct}%${days ? ` — about ${days} days to go (▶▶ makes them fly)` : ''}. Meanwhile, see the goal card? It always knows what’s next.`;
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
    text: () => 'I’m live and earning a little! These sliders split our compute: training (the next model), inference (customers = money), research and safety. Every model makes me more capable; safety keeps me checkable. Iris says at least 8% — drag the Safety slider.',
    done: (g) => s(g).alloc.safety >= 0.08,
  },
  {
    id: 'research',
    target: (g) => (g.panel === 'research' ? 'tech-first' : 'dock-research'),
    enter: (g) => {
      if (g.panel === 'compute') g.openPanel(null);
    },
    text: (g) => (g.panel === 'research' ? 'Pick any project — Mixture of Experts makes every model we train smarter. Click it.' : 'Research makes everything better. Open the Research panel.'),
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
    text: (g) => `Renting is expensive — we need our own data center. Every site is different: sun, wind, power prices, space. ${SITE_BY_ID[suggestedSite(g)]?.name} looks good: cheap land and sunshine. Click it on the map.`,
    done: (g) => g.selection?.kind === 'site' && SITE_BY_ID[g.selection.id]?.kind === 'build' && g.selection.id !== s(g).company.homeSite,
  },
  {
    id: 'build-dc',
    target: () => 'build-datacenter',
    text: () => 'Build a Data Center here. It takes the best part of a year — so start early!',
    done: (g) => s(g).facilities.some((f) => f.type === 'datacenter'),
  },
  {
    id: 'power',
    target: () => 'build-solar',
    mood: 'neutral',
    text: () => 'It will need power. Solar is the fastest to build; a grid connection is cheaper but the queue is long. Build a Solar Farm (or request grid above).',
    done: (g) => s(g).objectives.done.includes('power') || s(g).facilities.some((f) => f.type === 'solar' || f.type === 'wind' || f.type === 'gas') || Object.values(s(g).sites).some((x) => x.grid.pending.length > 0),
  },
  {
    id: 'battery',
    target: () => 'build-battery',
    mood: 'neutral',
    text: () => 'The sun clocks off at night, and so would our hall. Add Battery Storage here so it runs around the clock.',
    // done once the hall has something that runs at night: a battery, gas, or a grid connection
    done: (g) => {
      const st = s(g);
      const halls = st.facilities.filter((f) => f.type === 'datacenter').map((f) => f.siteId);
      return halls.some((id) => st.facilities.some((f) => f.siteId === id && (f.type === 'battery' || f.type === 'gas')) || st.sites[id].grid.mw + st.sites[id].grid.pending.reduce((a, p) => a + p.mw, 0) >= 5);
    },
  },
  {
    id: 'order',
    target: (g) => (g.panel === 'orders' ? 'order-button' : 'dock-orders'),
    text: (g) => (g.panel === 'orders' ? 'The order is sized to fill the new hall — a half-empty hall makes Bit-2 take years. Lumen ships sooner; Kestrel is cheaper. Then order!' : 'Chips! Open Orders to buy accelerators that ship to the new site.'),
    done: (g) => s(g).orders.length > 0 || s(g).shipments.length > 0,
  },
  {
    id: 'speed-up',
    target: () => 'speed',
    mood: 'excited',
    enter: (g) => {
      g.panel = null;
    },
    text: () => 'Now the waiting part: the hall takes the best part of a year. That’s the rhythm of this game — set things in motion, then let time run. Try ▶▶▶ now. I stop the clock myself whenever a card needs you.',
    done: (g) => g.speed >= 4,
    next: 'Later',
  },
  {
    id: 'dock',
    target: () => 'dock',
    text: () => 'Each button on the left is a department: Compute, Orders, Research, Finance, then Goals, the Field Guide and News. A red badge means something in there is waiting for you. Hover (or long-press) a button for its name.',
    next: 'Next',
  },
  {
    id: 'day',
    target: () => 'objectives',
    mood: 'happy',
    text: () => 'A normal day from here: read the goal card, glance at the top bar for red numbers, clear the red badges, queue the next thing before the last one finishes — research, chips, the next run — then speed up and answer the cards.',
    next: 'Next',
  },
  {
    id: 'done',
    target: () => 'dock-howto',
    mood: 'excited',
    enter: (g) => {
      g.panel = null;
    },
    text: () => 'That’s it! If you ever wonder what to do, How to play (this button, or the ? key) has the whole handbook — a typical day for every act, every panel, the common mistakes. The goal card leads to your Series A. Let’s build!',
    next: 'Let’s go!',
  },
];

/** Index of the step where the clock first starts. Until then, time stays paused. */
export const PLAY_STEP = TUTORIAL.findIndex((t) => t.id === 'play');
