// A new score under finished cuts: swaps the sound of the videos in the kit folder and leaves the picture exactly as
// it is (the video stream is copied, not encoded again). For when only the music changed: render it
// (score/render.mjs), then run this instead of cutting everything again with edit.mjs.
// usage: node resound.mjs <edit…|all> [--kit dir] [--keep "Previous (first score)"]
//   each video about to be replaced is first moved to the --keep folder (inside the kit), if one is given
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EDITS, VIDEOS } from './plan.mjs';

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const HOME = path.join(process.env.HOME, '.cache/kardashev-marketing');
const KIT = path.resolve(flag('--kit') ?? path.join(process.env.HOME, 'Videos/The Kardashev Project - Marketing'));
const keep = flag('--keep');
const names = args[0] === 'all' || !args.length ? Object.keys(VIDEOS) : args;
const ff = (cmd, a) => spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 26 });
/** A fingerprint of a file's picture: the MD5 of its video packets. */
const picture = (f) => ff('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:v:0', '-c', 'copy', '-f', 'md5', '-']).stdout.trim();

fs.mkdirSync(path.join(HOME, 'out'), { recursive: true });
for (const name of names) {
  const ed = EDITS[name];
  if (!ed || !VIDEOS[name]) { console.error('edits:', Object.keys(VIDEOS).join(' ')); process.exit(1); }
  const wav = path.join(HOME, 'score', `${ed.music}.wav`);
  if (!fs.existsSync(wav)) { console.error('missing:', wav); process.exit(1); }
  for (const rel of VIDEOS[name].filter(Boolean)) {
    const file = path.join(KIT, rel);
    if (!fs.existsSync(file)) { console.error('missing:', file); process.exit(1); }
    const tmp = path.join(HOME, 'out', `resound-${path.basename(rel)}`);
    // the same sound settings as edit.mjs: a quarter-second fade at the very end, AAC at 320 kb/s
    const r = ff('ffmpeg', ['-y', '-v', 'error', '-i', file, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-af', `afade=t=out:st=${(ed.length - 0.25).toFixed(2)}:d=0.25`, '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
      '-t', ed.length.toFixed(3), '-movflags', '+faststart', tmp]);
    if (r.status) { console.error(`${rel}: ffmpeg failed:`, r.stderr.slice(-600)); process.exit(1); }
    const same = picture(file) === picture(tmp);
    if (!same) { console.error(`${rel}: the picture changed (it must not); left alone. New file: ${tmp}`); process.exit(1); }
    if (keep) {
      const old = path.join(KIT, keep, rel);
      fs.mkdirSync(path.dirname(old), { recursive: true });
      if (!fs.existsSync(old)) fs.renameSync(file, old);
    }
    fs.copyFileSync(tmp, file);
    fs.rmSync(tmp);
    console.log(`${rel}: new sound (${ed.music}), picture untouched`);
  }
}
