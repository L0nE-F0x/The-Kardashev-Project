// Cuts a video from the recorded clips (capture.mjs), the titles (titles.mjs) and the score (score/render.mjs),
// as plan.mjs says. usage: node edit.mjs <edit> [out.mp4] [--draft] [--mute]
//   the picture comes out at the clips' own size (2560×1440 wide, 1080×1920 tall); --draft = quarter size, fast
import fs from 'node:fs';
import path from 'node:path';
import { EDITS } from './plan.mjs';

const args = process.argv.slice(2);
const draft = args.includes('--draft'), mute = args.includes('--mute');
const [name, outArg] = args.filter((a) => !a.startsWith('--'));
const ed = EDITS[name];
if (!ed) { console.error('edits:', Object.keys(EDITS).join(' ')); process.exit(1); }
const HOME = path.join(process.env.HOME, '.cache/kardashev-marketing');
const out = outArg ?? path.join(HOME, 'out', `${name}${draft ? '-draft' : ''}.mp4`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const FPS = 60;
const clipDir = path.join(HOME, `clips-${ed.view}`);
const [W, H] = (ed.view === 'tall' ? [1080, 1920] : [2560, 1440]).map((v) => (draft ? v / 2 : v));
const END = ed.length;

const input = [], f = [];
const clips = ed.clips.map(([shot, t0, t1, at, o = {}]) => ({ shot, t0, t1: Math.min(t1, END), at, x: o.x ?? 0, speed: o.speed ?? 1 }));
// a hard cut joins two clips end to end; a dissolve (x seconds) overlaps them, half on each side of the cut
const dIn = clips.map((c, i) => (i === 0 ? 0 : c.x));
const frames = (sec) => Math.round(sec * FPS);
clips.forEach((c, i) => {
  const dI = dIn[i], dO = i + 1 < clips.length ? dIn[i + 1] : 0;
  const len = c.t1 - c.t0 + dI / 2 + dO / 2;
  const start = Math.max(0, c.at - (dI / 2) * c.speed);
  input.push('-ss', start.toFixed(4), '-t', (len * c.speed + 0.5).toFixed(4), '-i', path.join(clipDir, `${c.shot}.mp4`));
  // the clips are full-range BT.601 (Chrome's JPEGs); the film is ordinary BT.709 video
  f.push(`[${i}:v]setpts=(PTS-STARTPTS)/${c.speed},fps=${FPS},scale=${W}:${H}:in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=bicubic,format=yuv444p,tpad=stop_mode=clone:stop_duration=2,trim=end_frame=${frames(len)},setpts=PTS-STARTPTS,settb=1/${FPS}[c${i}]`);
});
// runs of hard cuts are joined first, then the runs are dissolved into each other
const runs = [];
clips.forEach((c, i) => { if (i === 0 || dIn[i] > 0) runs.push([i]); else runs[runs.length - 1].push(i); });
runs.forEach((r, k) => {
  if (r.length === 1) f.push(`[c${r[0]}]null[r${k}]`);
  else f.push(`${r.map((i) => `[c${i}]`).join('')}concat=n=${r.length}:v=1:a=0,settb=1/${FPS}[r${k}]`);
});
let prev = 'r0';
for (let k = 1; k < runs.length; k++) {
  const i = runs[k][0], d = dIn[i];
  f.push(`[${prev}][r${k}]xfade=transition=fade:duration=${d.toFixed(4)}:offset=${(clips[i].t0 - d / 2).toFixed(4)}[x${k}]`);
  prev = `x${k}`;
}
f.push(`[${prev}]trim=duration=${END.toFixed(4)},setpts=PTS-STARTPTS[base0]`);
let base = 'base0';
if (ed.blurFrom !== undefined) {
  // behind the end card the picture goes soft (a blurred copy fades in over it)
  const s = (ed.view === 'tall' ? 14 : 18) / (draft ? 2 : 1);
  f.push(`[base0]split[ba][bb]`, `[bb]gblur=sigma=${s}:steps=2:enable='gte(t,${(ed.blurFrom - 0.05).toFixed(3)})',format=yuva444p,fade=t=in:st=${ed.blurFrom.toFixed(3)}:d=0.9:alpha=1[bf]`, `[ba][bf]overlay=format=auto[base1]`);
  base = 'base1';
}
// Two passes. One graph with thirty clips, the titles and the sound in it stalled near the end whenever the picture
// and the titles ran out on the same frame (ffmpeg 8's scheduler): so the picture is cut first, into a lossless
// file, and the titles and the sound go on in a second, simple pass. Each pass is watched: no progress for a
// while = stop it and say so, instead of sitting there for ever.
import('node:child_process').then(async ({ spawn }) => {
  const run = (label, cmd) => new Promise((resolve) => {
    const log = path.join(HOME, 'out', `${name}${draft ? '-draft' : ''}.${label}.log`);
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'warning', '-stats', ...cmd], { stdio: ['ignore', 'ignore', 'pipe'] });
    let last = Date.now(), frame = '';
    const w = fs.createWriteStream(log);
    p.stderr.on('data', (d) => { w.write(d); const m = String(d).match(/frame=\s*(\d+)/g); if (m && m[m.length - 1] !== frame) { frame = m[m.length - 1]; last = Date.now(); } });
    const dog = setInterval(() => { if (Date.now() - last > 120000) { console.log(`${name}: ${label} made no progress for two minutes (${frame}); stopped. Log: ${log}`); p.kill('SIGKILL'); } }, 5000);
    p.on('close', (code) => { clearInterval(dog); w.end(); resolve(code === 0); });
  });
  const t0 = Date.now();
  const baseFile = path.join(HOME, 'out', `${name}${draft ? '-draft' : ''}.picture.mkv`);
  f.push(`[${base}]format=yuv444p[v]`);
  let ok = await run('picture', [...input, '-filter_complex', f.join(';'), '-map', '[v]', '-t', END.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'yuv444p', baseFile]);
  const wav = path.join(HOME, 'score', `${ed.music}.wav`);
  const audio = !mute && fs.existsSync(wav);
  if (ok) {
    const cmd = ['-i', baseFile, '-threads', '1', '-thread_queue_size', '256', '-framerate', String(FPS), '-i', path.join(HOME, 'titles', name, '%05d.png')];
    if (audio) cmd.push('-i', wav);
    cmd.push('-filter_complex', `[1:v]scale=${W}:${H}:out_color_matrix=bt709:out_range=tv:flags=bicubic,format=yuva444p[tt];[0:v][tt]overlay=format=auto:eof_action=repeat,format=yuv420p[v]`, '-map', '[v]');
    if (audio) cmd.push('-map', '2:a', '-af', `afade=t=out:st=${(END - 0.25).toFixed(2)}:d=0.25`, '-c:a', 'aac', '-b:a', '320k', '-ar', '48000');
    cmd.push('-t', END.toFixed(3), '-r', String(FPS));
    if (draft) cmd.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23');
    else cmd.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-bf', '2', '-g', '30', '-x264-params', 'keyint=30:min-keyint=30');
    cmd.push('-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', out);
    ok = await run('titles', cmd);
  }
  if (ok) fs.rmSync(baseFile, { force: true });
  console.log(`${name}: ${ok ? out : 'FAILED'} in ${((Date.now() - t0) / 1000).toFixed(0)}s${audio ? '' : ' (no sound)'}`);
  process.exit(ok ? 0 : 1);
});
