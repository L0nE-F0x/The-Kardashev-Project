import type { AdvisorId } from '../sim/types';

export interface AdvisorDef {
  id: AdvisorId;
  name: string;
  role: string;
  vibe: string;
}

export const ADVISORS: Record<AdvisorId, AdvisorDef> = {
  juno: { id: 'juno', name: 'Juno Okafor', role: 'Chief Engineer', vibe: 'Can-do, wants it built yesterday.' },
  penny: { id: 'penny', name: 'Penny Ruiz', role: 'CFO', vibe: 'Frugal, bone-dry humour.' },
  mira: { id: 'mira', name: 'Mira Sato', role: 'Supply Chain', vibe: 'Sees single points of failure everywhere.' },
  sol: { id: 'sol', name: 'Sol Haddad', role: 'Diplomat', vibe: 'Smooth, sees both sides.' },
  iris: { id: 'iris', name: 'Dr. Iris Vance', role: 'Safety Lead', vibe: 'Calm and principled, not a doomer.' },
  kip: { id: 'kip', name: 'Kip Lindqvist', role: 'Launch & Space', vibe: 'Relentless space optimist.' },
  bit: { id: 'bit', name: 'Bit', role: 'Your AI', vibe: 'Curious, earnest, getting smarter.' },
};
