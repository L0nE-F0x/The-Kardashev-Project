/**
 * The soundtrack (v0.15.4): seven pieces on one theme (theme.ts), each in its own file in tracks/. The music grows
 * with the civilisation the way the interface does, from the garage to the light (SPEC §39):
 *
 *   menu    the title screen's anthem              Bb major, the theme in full with a lift to C
 *   era0    Act I, the garage                      garage funk / neo-soul: Rhodes, clav, bass, a whistled tune
 *   era1    Act II, the scale-up                   80s city pop: DX piano, FM brass, slap bass, a wind-synth lead
 *   era2    Act III, the Charter                   bossa nova: nylon guitar, upright bass, brushes, flute, vibes
 *   era3    Act IV, the planet                     interlocking marimbas and hand drums
 *   era4    Act V, the swarm                       a cosmic waltz: celesta, harp, glass, the ondes
 *   ending  Type I                                 the theme through every era's colours, rising to the light
 */
import type { TrackDef } from './cinematic';
import { track as menu } from './tracks/menu';
import { track as era0 } from './tracks/era0';
import { track as era1 } from './tracks/era1';
import { track as era2 } from './tracks/era2';
import { track as era3 } from './tracks/era3';
import { track as era4 } from './tracks/era4';
import { track as ending } from './tracks/ending';

export type CinematicId = 'menu' | 'era0' | 'era1' | 'era2' | 'era3' | 'era4' | 'ending';
export const TRACKS: Record<CinematicId, TrackDef> = { menu, era0, era1, era2, era3, era4, ending };
