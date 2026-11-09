// Meshy for the 3D look test: a concept image first (cheap, checkable), then a model from it.
// The key is read from ~/.config/meshy/key at run time (never put it in the repo).
//
//   node tools/meshy.mjs balance
//   node tools/meshy.mjs concept <name> "<subject>"      text → image (nano-banana-2, 6 cr) with the house style
//                                                          → art3d/concepts/<name>.png
//   node tools/meshy.mjs model <name> [--polys 12000]    image → 3D from art3d/concepts/<name>.png (meshy 7.1 +
//                                                          2k texture, 30 cr) → art3d/raw/<name>.glb + thumbnail
//   node tools/meshy.mjs concept <name> "<subject>" --char   a person in A-pose (CHAR_STYLE), for rigging
//   node tools/meshy.mjs concept <name> "<subject>" --nature scenery (NATURE_STYLE): rocks, bushes, trees
//   node tools/meshy.mjs model <name> --char                 A-pose mesh, ~4k triangles
//   node tools/meshy.mjs rig <name> [--height 1.75]          humanoid rig (5 cr) → art3d/raw/<name>_rigged.glb
//                                                             + the free walk/run clips (_walk.glb, _run.glb)
//   node tools/meshy.mjs animate <name> <id> [<id> …]        library animations on the rig (3 cr each, ids from
//                                                             GET /v1/animations/library) → art3d/raw/<name>_anims.glb
//                                                             (merge into the web figure: tools/glb-anim.mjs)
//   node tools/meshy.mjs status <kind> <id>
//
// Every task id and credit spent goes to art3d/meshy-log.json.
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const API = 'https://api.meshy.ai/openapi';
const KEY = fs.readFileSync(`${os.homedir()}/.config/meshy/key`, 'utf8').trim();
const ROOT = fileURLToPath(new URL('../art3d/', import.meta.url));
const LOG = ROOT + 'meshy-log.json';
for (const d of ['concepts', 'raw']) fs.mkdirSync(ROOT + d, { recursive: true });

/** The house style every concept is drawn in, so the models match each other. */
export const STYLE =
  'A single isolated object for a miniature tabletop diorama, seen from a high three-quarter angle, centered, ' +
  'on a plain flat light grey background with no ground, no base, no shadow, no text, no people. ' +
  'Style: a handcrafted architectural scale model, chunky simplified shapes with crisp bevelled edges, ' +
  'matte painted surfaces with subtle hand-painted colour variation, readable large forms, few small details. ' +
  'Palette: warm sand, terracotta, cream walls, slate-blue and teal accents, muted charcoal roofs, soft greens. ' +
  'Soft even studio light, gentle ambient occlusion, no strong highlights. Not photoreal, not cartoonish.';

/** People: the same scale-model look, as a painted figurine, in A-pose so they can be rigged. */
export const CHAR_STYLE =
  'A single full-body character for a miniature tabletop diorama, standing in a relaxed A-pose, arms slightly away from ' +
  'the body, front view, centered on a plain flat light grey background, no base, no shadow, no text. ' +
  'Style: a hand-painted scale-model figurine, simple chunky readable shapes, slightly stylized proportions (a bit ' +
  'larger head and hands), matte painted surfaces with subtle colour variation, clean silhouette. ' +
  'Palette: warm muted colours, cream, terracotta, slate-blue, teal, charcoal. Not photoreal, not anime.';

/** Scenery (rocks, bushes, trees): model-railway miniatures with natural detail, to sit beside the figurines. */
export const NATURE_STYLE =
  'A single isolated object for a miniature tabletop diorama, seen from a high three-quarter angle, centered, ' +
  'on a plain flat light grey background with no ground, no base, no shadow, no text, no people. ' +
  'Style: premium hand-painted model-railway scenery, natural realistic proportions with gently stylised detail, ' +
  'matte painted surfaces with rich subtle colour variation, earthy natural tones. ' +
  'Soft even studio light, gentle ambient occlusion. Not photoreal, not cartoonish, not low-poly or faceted.';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d = null) => { const i = rest.indexOf(`--${k}`); return i < 0 ? d : (rest[i + 1] ?? true); };

async function api(method, path, body) {
  let r;
  for (let tries = 0; ; tries++) {
    try {
      r = await fetch(API + path, {
        method,
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch (e) {
      // polls retry through blips; a POST could start a paid task twice, so it doesn't
      if (method !== 'GET' || tries >= 20) throw e;
      await new Promise((ok) => setTimeout(ok, 5000));
    }
  }
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: HTTP ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

function log(entry) {
  const all = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
  all.push({ at: new Date().toISOString(), ...entry });
  fs.writeFileSync(LOG, JSON.stringify(all, null, 2));
}

async function wait(path, label) {
  let last = -1;
  for (;;) {
    const t = await api('GET', path);
    if (t.progress !== last) { last = t.progress; process.stdout.write(`\r[${label}] ${t.status} ${t.progress ?? 0}%   `); }
    if (t.status === 'SUCCEEDED') { process.stdout.write('\n'); return t; }
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`${label} ${t.status}: ${JSON.stringify(t.task_error)}`);
    await new Promise((ok) => setTimeout(ok, 5000));
  }
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${file}: HTTP ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log('  →', file.replace(ROOT, 'art3d/'), `${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
}

if (cmd === 'balance') {
  console.log(await api('GET', '/v1/balance'));
} else if (cmd === 'status') {
  console.log(JSON.stringify(await api('GET', `/${rest[0] === 'text-to-3d' ? 'v2' : 'v1'}/${rest[0]}/${rest[1]}`), null, 2));
} else if (cmd === 'concept') {
  const [name, subject] = rest;
  if (!name || !subject) throw new Error('concept <name> "<subject>"');
  const char = rest.includes('--char');
  const prompt = `${subject}. ${char ? CHAR_STYLE : rest.includes('--nature') ? NATURE_STYLE : STYLE}`;
  const { result: id } = await api('POST', '/v1/text-to-image', { ai_model: opt('model', 'nano-banana-2'), prompt, aspect_ratio: opt('aspect', char ? '3:4' : '1:1') });
  log({ name, step: 'concept', id, subject });
  const t = await wait(`/v1/text-to-image/${id}`, `${name} concept`);
  log({ name, step: 'concept.done', id, credits: t.consumed_credits });
  await download(t.image_urls[0], `${ROOT}concepts/${name}.png`);
} else if (cmd === 'model') {
  const [name] = rest;
  const png = `${ROOT}concepts/${name}.png`;
  if (!fs.existsSync(png)) throw new Error(`no concept at ${png}`);
  const image_url = `data:image/png;base64,${fs.readFileSync(png).toString('base64')}`;
  const char = rest.includes('--char');
  const { result: id } = await api('POST', '/v1/image-to-3d', {
    image_url, ai_model: 'meshy-7.1', should_texture: true, enable_pbr: false, texture_resolution: '2k',
    should_remesh: true, topology: 'triangle', target_polycount: Number(opt('polys', char ? 4000 : 12000)),
    target_formats: ['glb'], origin_at: 'bottom', ...(char ? { pose_mode: 'a-pose' } : {}),
  });
  log({ name, step: 'model', id });
  const t = await wait(`/v1/image-to-3d/${id}`, `${name} model`);
  log({ name, step: 'model.done', id, credits: t.consumed_credits });
  await download(t.model_urls.glb, `${ROOT}raw/${name}.glb`);
  if (t.thumbnail_url) await download(t.thumbnail_url, `${ROOT}raw/${name}.png`);
} else if (cmd === 'rig') {
  const [name] = rest;
  const all = JSON.parse(fs.readFileSync(LOG, 'utf8'));
  const done = all.filter((e) => e.name === name && e.step === 'model.done').pop();
  if (!done) throw new Error(`no finished model for ${name}`);
  const { result: id } = await api('POST', '/v1/rigging', { input_task_id: done.id, height_meters: Number(opt('height', 1.75)) });
  log({ name, step: 'rig', id });
  const t = await wait(`/v1/rigging/${id}`, `${name} rig`);
  log({ name, step: 'rig.done', id, credits: t.consumed_credits });
  await download(t.result.rigged_character_glb_url, `${ROOT}raw/${name}_rigged.glb`);
  const basic = t.result.basic_animations ?? {};
  if (basic.walking_glb_url) await download(basic.walking_glb_url, `${ROOT}raw/${name}_walk.glb`);
  if (basic.running_glb_url) await download(basic.running_glb_url, `${ROOT}raw/${name}_run.glb`);
} else if (cmd === 'animate') {
  // library animations on a rigged figure (3 cr per action; one merged file, one clip per action, in order)
  const [name, ...ids] = rest.filter((a) => !a.startsWith('--'));
  const action_ids = ids.map(Number).filter((n) => Number.isInteger(n));
  if (!name || !action_ids.length) throw new Error('animate <name> <action id> [<action id> …]');
  const all = JSON.parse(fs.readFileSync(LOG, 'utf8'));
  const rig = all.filter((e) => e.name === name && e.step === 'rig.done').pop();
  if (!rig) throw new Error(`no finished rig for ${name}`);
  const { result: id } = await api('POST', '/v1/animations', { rig_task_id: rig.id, action_ids });
  log({ name, step: 'animate', id, action_ids });
  const t = await wait(`/v1/animations/${id}`, `${name} animate`);
  log({ name, step: 'animate.done', id, credits: t.consumed_credits });
  await download(t.result.animation_glb_url, `${ROOT}raw/${name}_anims.glb`);
} else {
  console.log('usage: balance | concept <name> "<subject>" | model <name> [--polys n] | rig <name> | animate <name> <ids…> | status <kind> <id>');
}
