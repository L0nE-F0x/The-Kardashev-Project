import { Container, Particle, ParticleContainer, Sprite, type Texture } from 'pixi.js';
import { hex } from './palette';
import { pixelTexture } from './sprites/mapIcons';

interface PixelRun {
  kind: 'px';
  c: ParticleContainer;
  parts: Particle[];
  used: number;
}

interface SpriteRun {
  kind: 'spr';
  c: Container;
  sprites: Sprite[];
  used: number;
}

/**
 * What the orbit and solar-system views draw this frame that moves: thousands of 1×1 pixels (stars,
 * the belt, the swarm, beams) and a few small sprites, reused frame to frame. Pixels go into
 * ParticleContainers (a pixel costs a few numbers, not a whole sprite) and sprites into plain
 * containers between them, a run at a time in the order they come, so what's drawn over what is
 * exactly as it was with one sprite each (Earth still over the swarm, a sparkle over its asteroid).
 */
export class PixelPool {
  /** Runs alternate kinds: a run of pixels, a run of sprites, … (a run that isn't needed this frame stays empty). */
  private runs: (PixelRun | SpriteRun)[] = [];
  private cur = -1;
  private count = 0;
  /** Palette index → particle colour (BGR with alpha, for the current era). */
  private cols: number[] = [];

  constructor(private readonly parent: Container) {}

  begin() {
    this.cur = -1;
    this.count = 0;
    for (const r of this.runs) r.used = 0;
  }

  /** One pixel of a palette colour at a whole-pixel spot. */
  px(x: number, y: number, c: number) {
    const run = this.run('px') as PixelRun;
    let p = run.parts[run.used];
    if (!p) {
      p = new Particle({ texture: pixelTexture() });
      run.parts.push(p);
      run.c.addParticle(p);
    }
    p.x = x;
    p.y = y;
    p.color = this.cols[c] ?? this.colour(c);
    run.used++;
    this.count++;
  }

  /** A small sprite (untinted) with its top-left at a whole-pixel spot. */
  spr(tex: Texture, x: number, y: number) {
    const run = this.run('spr') as SpriteRun;
    let sp = run.sprites[run.used];
    if (!sp) {
      sp = new Sprite(tex);
      run.c.addChild(sp);
      run.sprites.push(sp);
    } else if (sp.texture !== tex) sp.texture = tex;
    sp.visible = true;
    sp.position.set(x, y);
    run.used++;
    this.count++;
  }

  end() {
    for (const r of this.runs) {
      // a spare pixel goes fully transparent (removing it would make the container rebuild its buffers)
      if (r.kind === 'px') for (let k = r.used; k < r.parts.length; k++) r.parts[k].color = 0;
      else for (let k = r.used; k < r.sprites.length; k++) r.sprites[k].visible = false;
      r.c.visible = r.used > 0;
    }
  }

  /** Forget the colours worked out so far (the palette changed under them). */
  retint() {
    this.cols = [];
  }

  /** Things drawn this frame (tests count them). */
  get size() {
    return this.count;
  }

  private colour(c: number): number {
    const rgb = hex(c);
    const bgr = ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >>> 16) & 0xff);
    return (this.cols[c] = (0xff000000 | bgr) >>> 0);
  }

  /** The run for the next thing of this kind: the current one, else the next one (skipping one of the other kind). */
  private run(kind: 'px' | 'spr'): PixelRun | SpriteRun {
    let r = this.runs[this.cur];
    if (r && r.kind === kind) return r;
    this.cur++;
    r = this.runs[this.cur];
    if (r && r.kind !== kind) r = this.runs[++this.cur];
    if (!r) {
      r =
        kind === 'px'
          ? { kind, c: new ParticleContainer({ texture: pixelTexture(), dynamicProperties: { position: true, color: true } }), parts: [], used: 0 }
          : { kind, c: new Container(), sprites: [], used: 0 };
      this.runs.push(r);
      this.parent.addChild(r.c);
    }
    return r;
  }
}
