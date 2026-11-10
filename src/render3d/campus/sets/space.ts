/**
 * Act V set pieces in 3D, in space (see ../act3sets.ts for the footprints and options): the L4/L5
 * yards (foundry modules on a truss spine, the self-printed copy, the outbound cradle, the feed
 * dock, the empty berth) and Ring One (rack sections with their radiator fins, the hub, the
 * growing head). They float: no ground; each piece is a section of one long station whose spine
 * lines up with its neighbours'. The pieces themselves live in ./space/.
 */
import type { Act3PieceKind } from '../plan';
import type { Act3SetFactory } from '../act3sets';
import { yardsCopy, yardsModule } from './space/module';
import { yardsBerth, yardsDock, yardsOutbound } from './space/yards';
import { ringHead, ringHub, ringRack } from './space/ring';

export const SETS_SPACE: Partial<Record<Act3PieceKind, Act3SetFactory>> = {
  yardsModule, yardsCopy, yardsOutbound, yardsDock, yardsBerth,
  ringRack, ringHub, ringHead,
};
