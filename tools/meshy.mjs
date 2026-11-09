// Meshy for the 3D look test: a concept image first (cheap, checkable), then a model from it.
// The key is read from ~/.config/meshy/key at run time (never put it in the repo).
//
//   node tools/meshy.mjs balance
//   node tools/meshy.mjs concept <name> "<subject>"      text → image (nano-banana-2, 6 cr) with the house style
//                                                          → art3d/concepts/<name>.png
//   node tools/meshy.mjs model <name> [--polys 12000]    image → 3D from art3d/concepts/<name>.png (meshy 7.1 +
//                                                          2k texture, 30 cr) → art3d/raw/<name>.glb + thumbnail
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
  const prompt = `${subject}. ${STYLE}`;
  const { result: id } = await api('POST', '/v1/text-to-image', { ai_model: opt('model', 'nano-banana-2'), prompt, aspect_ratio: opt('aspect', '1:1') });
  log({ name, step: 'concept', id, subject });
  const t = await wait(`/v1/text-to-image/${id}`, `${name} concept`);
  log({ name, step: 'concept.done', id, credits: t.consumed_credits });
  await download(t.image_urls[0], `${ROOT}concepts/${name}.png`);
} else if (cmd === 'model') {
  const [name] = rest;
  const png = `${ROOT}concepts/${name}.png`;
  if (!fs.existsSync(png)) throw new Error(`no concept at ${png}`);
  const image_url = `data:image/png;base64,${fs.readFileSync(png).toString('base64')}`;
  const { result: id } = await api('POST', '/v1/image-to-3d', {
    image_url, ai_model: 'meshy-7.1', should_texture: true, enable_pbr: false, texture_resolution: '2k',
    should_remesh: true, topology: 'triangle', target_polycount: Number(opt('polys', 12000)),
    target_formats: ['glb'], origin_at: 'bottom',
  });
  log({ name, step: 'model', id });
  const t = await wait(`/v1/image-to-3d/${id}`, `${name} model`);
  log({ name, step: 'model.done', id, credits: t.consumed_credits });
  await download(t.model_urls.glb, `${ROOT}raw/${name}.glb`);
  if (t.thumbnail_url) await download(t.thumbnail_url, `${ROOT}raw/${name}.png`);
} else {
  console.log('usage: balance | concept <name> "<subject>" | model <name> [--polys n] | status <kind> <id>');
}
