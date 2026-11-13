// Puts the finished pieces into the kit folder under the names people see (the last step: everything before it
// works in ~/.cache/kardashev-marketing/). Only what is asked for is written, so a partial re-shoot replaces
// just its own files. A file about to be replaced is first moved to `--keep <folder>` (inside the kit) if given.
// usage: node kit.mjs <what…> [--kit dir] [--keep "Previous (v0.13.2)"] [--shots id,id]
//   what: stills (4K JPG + PNG; --shots limits it to those shots) · tall-stills · art · music ·
//         trailer teaser teaser-tall day day-tall liftoff liftoff-tall type1 type1-tall (the cut videos)
// Needs ffmpeg and ImageMagick.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const HOME = path.join(process.env.HOME, '.cache/kardashev-marketing');
const KIT = path.resolve(flag('--kit') ?? path.join(process.env.HOME, 'Videos/The Kardashev Project - Marketing'));
const keep = flag('--keep');
const shots = flag('--shots')?.split(',') ?? null;
const what = new Set(args);

/** The stills, in the story's order: [name in the kit, shot (capture.mjs --still writes <shot>.png)]. */
export const STILLS = [
  ['earth-2026', 'earth-night-2'], ['the-garage', 'garage'], ['first-build', 'hud-build'], ['campus-rising', 'timelapse'],
  ['aurora-over-lulea', 'lulea-night'], ['lakeshore-reactor', 'lakeshore'], ['high-plains-wind', 'wind-2'], ['wyoming-campus', 'wyoming'],
  ['columbia-gorge-dusk', 'gorge-dusk'], ['chip-fab', 'fab'], ['the-mine', 'mine'], ['map-and-shipping', 'hud-map'],
  ['event-card', 'hud-event'], ['research', 'hud-research'], ['campus-interface', 'hud-campus'], ['subsea-cables', 'globe-cables'],
  ['night-over-asia', 'globe-asia'], ['geneva-charter', 'geneva-2'], ['charter-interface', 'hud-charter'], ['sahara-solar', 'sahara'],
  ['north-sea-wind', 'northsea'], ['fusion-at-dusk', 'fusion'], ['supergrid', 'supergrid'], ['on-the-pad', 'liftoff-long-1'],
  ['liftoff', 'liftoff-2'], ['orbit', 'orbit'], ['planet-panel', 'hud-planet'], ['moon-base', 'moon'],
  ['orbital-foundries', 'yards'], ['asteroid-mining', 'eros'], ['ring-one', 'ring'], ['habitat', 'habitat'],
  ['system-interface', 'hud-system'], ['the-swarm', 'swarm-2'], ['sunrise', 'type1-2'], ['ignition', 'type1-3'], ['type-one', 'type1-5'],
];
const TALL_STILLS = [['aurora-over-lulea', 'lulea-night'], ['north-sea-wind', 'northsea'], ['on-the-pad', 'liftoff-long-1'], ['liftoff', 'liftoff-long-2'],
  ['habitat', 'habitat'], ['sunrise', 'type1-2'], ['ignition', 'type1-3'], ['type-one', 'type1-5']];
/** The cut videos: edit (plan.mjs) → [file in the kit, also a 1080p copy?]. */
const VIDEOS = {
  trailer: ['Trailer/TheKardashevProject-Trailer-1440p60.mp4', 'Trailer/TheKardashevProject-Trailer-1080p60.mp4'],
  teaser: ['Teaser/TheKardashevProject-Teaser-1440p60.mp4', 'Teaser/TheKardashevProject-Teaser-1080p60.mp4'],
  'teaser-tall': ['Teaser/TheKardashevProject-Teaser-Vertical.mp4'],
  day: ['Shorts/OneDay-Wide.mp4'], 'day-tall': ['Shorts/OneDay-Vertical.mp4'],
  liftoff: ['Shorts/Liftoff-Wide.mp4'], 'liftoff-tall': ['Shorts/Liftoff-Vertical.mp4'],
  type1: ['Shorts/TypeI-Wide.mp4'], 'type1-tall': ['Shorts/TypeI-Vertical.mp4'],
};

const run = (cmd, a) => { const r = spawnSync(cmd, a, { stdio: ['ignore', 'ignore', 'pipe'] }); if (r.status) { console.error(`${cmd} failed:`, String(r.stderr).slice(-600)); process.exit(1); } };
/** The place a file goes; whatever is there now is set aside first (or simply replaced without --keep). */
const dest = (rel) => {
  const to = path.join(KIT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (keep && fs.existsSync(to)) {
    const old = path.join(KIT, keep, rel);
    fs.mkdirSync(path.dirname(old), { recursive: true });
    if (!fs.existsSync(old)) fs.renameSync(to, old);
  }
  return to;
};
const need = (f) => { if (!fs.existsSync(f)) { console.error('missing:', f); process.exit(1); } return f; };

if (what.has('stills')) {
  // a still that changed its number (a new one joined the story before it) leaves its old files behind: clear them
  const names = new Map(STILLS.map(([n], i) => [n, `${String(i + 1).padStart(2, '0')}-${n}`]));
  for (const dir of ['Stills', 'Stills/png']) {
    for (const f of fs.existsSync(path.join(KIT, dir)) ? fs.readdirSync(path.join(KIT, dir)) : []) {
      const m = f.match(/^(\d\d)-(.+)\.(jpg|png)$/);
      if (!m || !names.has(m[2]) || names.get(m[2]) === `${m[1]}-${m[2]}`) continue;
      fs.renameSync(path.join(KIT, dir, f), path.join(KIT, dir, `${names.get(m[2])}.${m[3]}`));
      console.log(`${dir}/${f} → ${names.get(m[2])}.${m[3]}`);
    }
  }
  for (const [n, shot] of STILLS) {
    if (shots && !shots.includes(shot.replace(/-\d$/, '')) && !shots.includes(shot)) continue;
    const src = need(path.join(HOME, 'stills-wide', `${shot}.png`));
    fs.copyFileSync(src, dest(`Stills/png/${names.get(n)}.png`));
    run('magick', [src, '-quality', '94', dest(`Stills/${names.get(n)}.jpg`)]);
    console.log(`Stills/${names.get(n)}.jpg (+ png)`);
  }
}
if (what.has('tall-stills')) {
  for (const [n, shot] of TALL_STILLS) {
    run('magick', [need(path.join(HOME, 'stills-tall', `${shot}.png`)), '-quality', '94', dest(`Stills/vertical/${n}.jpg`)]);
    console.log(`Stills/vertical/${n}.jpg`);
  }
}
if (what.has('art')) {
  for (const f of fs.readdirSync(need(path.join(HOME, 'art')))) { fs.copyFileSync(path.join(HOME, 'art', f), dest(`Key Art/${f}`)); console.log(`Key Art/${f}`); }
}
if (what.has('music')) {
  for (const m of ['trailer', 'teaser', 'calm', 'rise']) { fs.copyFileSync(need(path.join(HOME, 'score', `${m}.wav`)), dest(`Music/TheKardashevProject-Music-${m}.wav`)); console.log(`Music/…-${m}.wav`); }
}
for (const [ed, [full, small]] of Object.entries(VIDEOS)) {
  if (!what.has(ed)) continue;
  const src = need(path.join(HOME, 'out', `${ed}.mp4`));
  fs.copyFileSync(src, dest(full));
  console.log(full);
  if (small) {
    // the 1080p copy: for the sites that cap uploads there (X, Discord); the sound is carried over untouched
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
      '-profile:v', 'high', '-bf', '2', '-g', '30', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-color_range', 'tv', '-c:a', 'copy', '-movflags', '+faststart', dest(small)]);
    console.log(small);
  }
}
