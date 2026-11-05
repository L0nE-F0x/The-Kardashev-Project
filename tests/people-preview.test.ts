/**
 * The diorama people: every look, pose, the advisors, Bit, the dog, cyclists and the speech
 * bubbles keep their sizes and a closed outline (no figure pixel touching the canvas edge, feet on
 * the feet row). With PREVIEW_DIR set it also writes a contact sheet:
 *   PREVIEW_DIR=/some/dir npx vitest run tests/people-preview.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { C, paletteTable } from '../src/render/palette';
import { PixelCanvas } from '../src/render/pixels';
import { encodePngRgba } from '../tools/lib/png';
import { advisorLook, bitFrames, CARRY, emoteArt, FIG_FEET, FIG_H, FIG_W, figure, lookFor, seatedFigure, WALK, type Emote, type Pose, type Role } from '../src/render/diorama/people';
import { bikeArt, dogArt } from '../src/render/diorama/life';
import { campusLines } from '../src/content/campusLines';

const POSES: Pose[] = [...WALK, ...CARRY, 'stand', 'wave', 'phone', 'talk', 'cheer', 'work0', 'work1'];
const ROLES: Role[] = ['staff', 'worker', 'tech', 'astronaut'];
const ADVISORS = ['juno', 'penny', 'mira', 'sol', 'iris', 'kip', 'lena'] as const;
const EMOTES: Emote[] = ['alert', 'ask', 'heart', 'note', 'bolt', 'star', 'dots', 'coffee'];

/** Figure pixels (not the outline) on the canvas border: an outline that got clipped. */
function edgePixels(pc: PixelCanvas): number {
  const body = (x: number, y: number) => (pc.get(x, y) && pc.get(x, y) !== C.ink1 ? 1 : 0);
  let n = 0;
  for (let x = 0; x < pc.w; x++) n += body(x, 0) + body(x, pc.h - 1);
  for (let y = 0; y < pc.h; y++) n += body(0, y) + body(pc.w - 1, y);
  return n;
}

describe('diorama people', () => {
  it('draws every role, era and pose at 8×14 with the feet on row 12 and a closed outline', () => {
    for (const role of ROLES) {
      for (let era = 0; era < 5; era++) {
        for (let seed = 0; seed < 12; seed++) {
          const L = lookFor(seed * 13 + era, role, era);
          for (const pose of POSES) {
            const pc = figure(L, pose);
            expect([pc.w, pc.h]).toEqual([FIG_W, FIG_H]);
            expect(edgePixels(pc), `${role} ${era} ${seed} ${pose}`).toBe(0);
            let feet = 0;
            for (let x = 0; x < pc.w; x++) if (pc.get(x, FIG_FEET) && pc.get(x, FIG_FEET) !== C.ink1) feet++;
            expect(feet, `${role} ${pose} has feet`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('dresses the advisors as in their portraits, at every age, and gives each something to say', () => {
    for (const id of ADVISORS) {
      for (const age of [0, 1, 2, 3]) {
        const L = advisorLook(id, age);
        for (const pose of POSES) expect(edgePixels(figure(L, pose))).toBe(0);
        expect(seatedFigure(L).h).toBe(12);
      }
      expect(campusLines(id, id === 'kip' ? 3 : id === 'lena' ? 4 : 1).length).toBeGreaterThan(1);
    }
    expect(campusLines('bit', 1).length).toBeGreaterThan(1);
    // Juno's white hat sets her apart from the crews' yellow ones
    expect(advisorLook('juno').hatCol).toBe(C.white);
  });

  it('keeps Bit, the dog, the cyclists and the bubbles their sizes', () => {
    for (const form of [1, 4, 7, 9, 10, 11]) for (const pc of bitFrames(form)) expect([pc.w, pc.h]).toEqual([FIG_W, FIG_H]);
    for (const f of [0, 1, 2]) expect([dogArt(C.snd4, f).w, dogArt(C.snd4, f).h]).toEqual([8, 6]);
    for (const f of [0, 1]) expect(bikeArt(lookFor(3, 'staff', 2), f).w).toBe(14);
    for (const e of EMOTES) expect([emoteArt(e).w, emoteArt(e).h]).toEqual([11, 11]);
  });

  it.skipIf(!process.env.PREVIEW_DIR)('writes a contact sheet', () => {
    const rows: PixelCanvas[][] = [];
    for (const role of ROLES) for (let era = 0; era < 5; era += role === 'staff' ? 1 : 2) rows.push(POSES.map((p) => figure(lookFor(era * 5 + 3, role, era), p)));
    for (const id of ADVISORS) rows.push([...POSES.slice(0, 9).map((p) => figure(advisorLook(id), p)), seatedFigure(advisorLook(id)), figure(advisorLook(id, 2), 'stand')]);
    rows.push([...[1, 5, 8, 10, 11].flatMap((f) => bitFrames(f)), ...[0, 1, 2].map((f) => dogArt(C.snd4, f)), bikeArt(lookFor(5, 'staff', 2), 0), bikeArt(lookFor(5, 'staff', 2), 1)]);
    rows.push(EMOTES.map(emoteArt));
    const cw = 15;
    const ch = 17;
    const W = Math.max(...rows.map((r) => r.length)) * cw;
    const H = rows.length * ch;
    const sheet = new PixelCanvas(W, H);
    sheet.rect(0, 0, W, H, C.rck5);
    rows.forEach((r, y) => {
      sheet.rect(0, y * ch + 15, W, 2, C.rck4);
      r.forEach((pc, x) => sheet.blit(pc, x * cw + 2, y * ch + 15 - pc.h + (pc.h === FIG_H ? 1 : 0)));
    });
    const Z = 6;
    const pal = paletteTable();
    const out = new Uint8Array(W * Z * H * Z * 4);
    for (let y = 0; y < H * Z; y++) {
      for (let x = 0; x < W * Z; x++) {
        const c = sheet.data[Math.floor(y / Z) * W + Math.floor(x / Z)];
        const o = (y * W * Z + x) * 4;
        out[o] = pal[c * 4];
        out[o + 1] = pal[c * 4 + 1];
        out[o + 2] = pal[c * 4 + 2];
        out[o + 3] = 255;
      }
    }
    fs.writeFileSync(path.join(process.env.PREVIEW_DIR!, 'people-sheet.png'), encodePngRgba(W * Z, H * Z, out));
  });
});
