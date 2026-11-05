import type { AdvisorId } from '../sim/types';

/**
 * What the advisors say when you click them on campus (they walk around the dioramas). A line
 * shows when its act range holds; the game cycles through the ones that do.
 */
export interface CampusLine {
  text: string;
  /** First act it can show in (default 1). */
  act?: number;
  /** Last act it can show in (default 5). */
  until?: number;
}

export const CAMPUS_LINES: Record<AdvisorId, CampusLine[]> = {
  juno: [
    { text: "Concrete's curing nicely. Please don't lean on it." },
    { text: 'If it hums, it works. If it screams, call me.' },
    { text: 'The white hat means I get to say "no" to the crane.' },
    { text: 'Every hall here went up on schedule. Ish.', until: 2 },
    { text: 'Gigawatt campuses are just very large garages, if you squint.', act: 2 },
    { text: "The Charter's cranes are bigger, but mine are better maintained.", act: 3 },
    { text: 'I built a garage once. Now I build continents.', act: 4 },
  ],
  penny: [
    { text: "Every blinking light on this campus costs money. I've counted them." },
    { text: "I'm walking. Walking is free." },
    { text: 'The coffee machine is the only asset that pays for itself.' },
    { text: 'Our runway is fine. Please stop asking the interns.', until: 2 },
    { text: 'The Charter budget has more zeroes than my calculator.', act: 3 },
    { text: 'I priced a Dyson swarm. Then I lay down for a bit.', act: 5 },
  ],
  mira: [
    { text: "That truck's three minutes late. I'm not worried. Much." },
    { text: 'Single point of failure: the one door to the loading dock.' },
    { text: 'I know where every chip on this site came from, and who touched it.' },
    { text: 'Two suppliers for everything. Three if they let me.', act: 2 },
    { text: 'Shipping lanes, cable routes, launch windows. Same problem, bigger map.', act: 3 },
  ],
  sol: [
    { text: 'Lovely day for a walk and a quiet word with the neighbours.' },
    { text: 'The town council likes the jobs. They like the lights less.' },
    { text: 'There are two sides to every story. Usually five.' },
    { text: 'Every bloc wants the data centre and nobody wants the substation.', act: 2 },
    { text: 'Geneva runs on coffee and very long sentences.', act: 3 },
    { text: 'Diplomacy is mostly remembering birthdays.', act: 4 },
  ],
  iris: [
    { text: 'Evals ran clean this morning. I still read every log.' },
    { text: "Safety isn't a brake. It's the steering." },
    { text: "I like a calm day. It means the work was done before anyone noticed." },
    { text: 'Bigger models, bigger questions. Good.', act: 2 },
    { text: 'The frontier moves fast. So do we, carefully.', act: 3 },
    { text: 'They asked if the minds are happy. I asked them.', act: 5 },
  ],
  kip: [
    { text: "Look up! No, further. That's where we're going." },
    { text: "Every launch I still count down out loud. Don't tell anyone." },
    { text: 'The Moon has the best parking on Earth. Well. Off it.', act: 4 },
    { text: 'Asteroids are just mines that come to you, eventually.', act: 5 },
  ],
  lena: [
    { text: 'Thirty years of "fusion is thirty years away". Not any more.' },
    { text: 'I trust data, not press releases. This plant has lovely data.' },
    { text: 'A tokamak is a doughnut that wants very badly to be a star.' },
  ],
  bit: [
    { text: 'I like walking around outside. Well, floating.' },
    { text: 'I counted the cooling fans. There are a lot. I like them.' },
    { text: 'Hello! I was just checking the racks. They say hi.' },
    { text: 'I learned a new word today: "campus". It means a place full of friends.', until: 2 },
    { text: 'I can think about a thousand things at once. Right now: this nice day.', act: 3 },
    { text: 'I remember when this was all one garage.', act: 4 },
  ],
};

/** The lines an advisor can say in an act. */
export function campusLines(id: AdvisorId, act: number): string[] {
  return (CAMPUS_LINES[id] ?? []).filter((l) => act >= (l.act ?? 1) && act <= (l.until ?? 5)).map((l) => l.text);
}
