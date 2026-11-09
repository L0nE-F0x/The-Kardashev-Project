/**
 * Inside Aurora (an O'Neill-style habitat cylinder): you stand on the inside of the hull, the land
 * curves up both sides and meets overhead, in three strips of countryside (patchwork fields, woods,
 * a river and lakes, roads and villages, more of them the more lived-in it is) between long windows
 * of sky, with the sun-line running down the axis.
 */
import * as THREE from 'three';
import { col, fbm, mix, rng, withClouds } from '../kit';

export const HAB_R = 260;

/** Height of the cylinder's floor at a sideways offset z (the axis runs along x). */
export const habFloor = (z: number) => HAB_R - Math.sqrt(Math.max(0, HAB_R * HAB_R - Math.min(z * z, HAB_R * HAB_R * 0.98)));

/** Angle round the hull for a texture column u (0 = the floor under you, ±π = overhead): see the geometry below. */
const angleOf = (u: number) => {
  let a = u * Math.PI * 2 + Math.PI / 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
};
/**
 * Three land strips and three windows, symmetric about the floor: the floor's strip is the widest (±0.75 rad, the
 * town stands on it), the other two are centred at ±120°, and one window runs overhead.
 */
const isWindow = (a: number) => !(Math.abs(a) < 0.75 || Math.abs(Math.abs(a) - (Math.PI * 2) / 3) < Math.PI / 6);
/** Close round the floor the land is calm meadow (the town's own ground); fields start further out. */
const TOWN_A = 0.36;

const TW = 2048, TH = 2048;
const CROPS = ['#c9b35a', '#a8c45a', '#7fae46', '#5c8f3a', '#d8c27a', '#9a7a52', '#b7a6d8', '#8fbf6a', '#e0cf8a'];

/** The countryside painted once per lived level (a canvas: fields as shapes, never per-pixel noise). */
function landTexture(lived: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = TW;
  cv.height = TH;
  const g = cv.getContext('2d')!;
  const r = rng(91);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, TW, TH);
  // the strips: runs of columns that are land
  const strips: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= TW; x++) {
    const land = x < TW && !isWindow(angleOf((x + 0.5) / TW));
    if (land && start < 0) start = x;
    if (!land && start >= 0) { strips.push([start, x]); start = -1; }
  }
  for (const [x0, x1] of strips) {
    const w = x1 - x0;
    // meadow base with broad soft variation
    g.fillStyle = '#6fa443';
    g.fillRect(x0, 0, w, TH);
    for (let i = 0; i < 40; i++) {
      const cx = x0 + r() * w, cy = r() * TH, rad = 60 + r() * 160;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const c = r() < 0.5 ? 'rgba(150,190,80,0.35)' : 'rgba(70,120,50,0.3)';
      gr.addColorStop(0, c);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    // (the floor's strip keeps a calm meadow under the town)
    const townCols = Math.abs(angleOf((x0 + x1) / 2 / TW)) < 0.2 ? [Math.round(TW * 0.75 - (TOWN_A / (Math.PI * 2)) * TW), Math.round(TW * 0.75 + (TOWN_A / (Math.PI * 2)) * TW)] : null;
    const inTown = (x: number, xw: number) => !!townCols && x + xw > townCols[0] && x < townCols[1];
    // patchwork fields in blocks between the cross lanes
    const lanes: number[] = [];
    for (let y = 40 + r() * 60; y < TH; y += 150 + r() * 110) lanes.push(y);
    let prev = 0;
    for (const ly of [...lanes, TH]) {
      let fx = x0 + 6;
      while (fx < x1 - 12) {
        const fw = Math.min(x1 - 6 - fx, 18 + r() * 46);
        let fy = prev + 5;
        while (fy < ly - 10) {
          const fh = Math.min(ly - 5 - fy, 22 + r() * 60);
          if (r() < 0.82 && !inTown(fx, fw)) {
            g.fillStyle = CROPS[Math.floor(r() * CROPS.length)];
            g.fillRect(fx, fy, fw - 2, fh - 2);
            // furrows on some
            if (r() < 0.4) {
              g.strokeStyle = 'rgba(60,50,30,0.18)';
              g.lineWidth = 1;
              for (let k = 2; k < fh - 3; k += 3) { g.beginPath(); g.moveTo(fx + 1, fy + k); g.lineTo(fx + fw - 3, fy + k); g.stroke(); }
            }
            // an orchard: rows of dots
            if (r() < 0.12) {
              g.fillStyle = '#3f7a35';
              for (let ox = fx + 3; ox < fx + fw - 3; ox += 4) for (let oy = fy + 3; oy < fy + fh - 3; oy += 4) g.fillRect(ox, oy, 2, 2);
            }
          }
          fy += fh;
        }
        fx += fw;
      }
      prev = ly;
    }
    // woods: clumps of dark crowns
    for (let i = 0; i < 26; i++) {
      const cx = x0 + 10 + r() * (w - 20), cy = r() * TH, n = 30 + Math.floor(r() * 90), spread = 18 + r() * 40;
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
        const tx = cx + Math.cos(a) * d * 0.7, ty = cy + Math.sin(a) * d * 1.4;
        if (tx < x0 + 3 || tx > x1 - 3 || inTown(tx, 1)) continue;
        g.fillStyle = r() < 0.5 ? '#2f6332' : '#3d7a3a';
        g.beginPath();
        g.arc(tx, ty, 2.2 + r() * 2.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    // lakes
    for (let i = 0; i < 3; i++) {
      const cx = x0 + w * (0.25 + r() * 0.5), cy = r() * TH;
      if (inTown(cx - 40, 80)) continue;
      g.fillStyle = '#9ccf9a';
      g.beginPath(); g.ellipse(cx, cy, 16 + r() * 14, 34 + r() * 40, r() * 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3f86b8';
      g.beginPath(); g.ellipse(cx, cy, 12 + r() * 10, 28 + r() * 34, r() * 0.4, 0, Math.PI * 2); g.fill();
    }
    // a river winding the length of the strip, with pale banks
    const mid = townCols ? (townCols[1] + x1) / 2 : x0 + w / 2, amp = townCols ? (x1 - townCols[1]) * 0.3 : w * 0.28;
    const rx = (y: number, phase: number) => mid + amp * Math.sin(y * 0.004 + phase) + amp * 0.3 * Math.sin(y * 0.017 + phase * 3);
    const phase = r() * 6;
    for (const [lw, c] of [[9, '#cfe0a0'], [5, '#3f86b8']] as const) {
      g.strokeStyle = c;
      g.lineWidth = lw;
      g.lineCap = 'round';
      g.beginPath();
      for (let y = 0; y <= TH; y += 16) (y ? g.lineTo(rx(y, phase), y) : g.moveTo(rx(y, phase), y));
      g.stroke();
    }
    // the long road beside one edge and the cross lanes
    const roadX = townCols ? x0 + (townCols[0] - x0) * 0.5 : x0 + w * 0.18;
    g.strokeStyle = '#e6dcc4';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(roadX, 0); g.lineTo(roadX, TH); g.stroke();
    g.lineWidth = 1.6;
    for (const ly of lanes) { g.beginPath(); g.moveTo(x0 + 4, ly); g.lineTo(x1 - 4, ly); g.stroke(); }
    // villages on the road, more as Aurora fills up
    const villages = 5 + Math.round(lived * 9);
    for (let i = 0; i < villages; i++) {
      const vy = r() * TH, vx = roadX + (r() - 0.3) * w * 0.35, n = 10 + Math.floor(r() * (20 + lived * 40));
      for (let k = 0; k < n; k++) {
        const hx = vx + (r() - 0.5) * 34, hy = vy + (r() - 0.5) * 60;
        if (hx < x0 + 4 || hx > x1 - 6 || inTown(hx, 4)) continue;
        g.fillStyle = 'rgba(40,60,30,0.35)';
        g.fillRect(hx + 1, hy + 1, 4, 3);
        g.fillStyle = ['#c8644a', '#e9e1d2', '#b8b0a4', '#d9a05a', '#8fb3c8'][Math.floor(r() * 5)];
        g.fillRect(hx, hy, 4, 3);
      }
      g.fillStyle = '#4c8a3c';
      for (let k = 0; k < 10; k++) { g.beginPath(); g.arc(vx + (r() - 0.5) * 40, vy + (r() - 0.5) * 70, 2, 0, Math.PI * 2); g.fill(); }
    }
    // the strip's edge: a hedge then the window frame's shadow
    const edge = g.createLinearGradient(x0, 0, x0 + 14, 0);
    edge.addColorStop(0, 'rgba(30,40,30,0.6)');
    edge.addColorStop(1, 'rgba(30,40,30,0)');
    g.fillStyle = edge;
    g.fillRect(x0, 0, 14, TH);
    const edge2 = g.createLinearGradient(x1, 0, x1 - 14, 0);
    edge2.addColorStop(0, 'rgba(30,40,30,0.6)');
    edge2.addColorStop(1, 'rgba(30,40,30,0)');
    g.fillStyle = edge2;
    g.fillRect(x1 - 14, 0, 14, TH);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function habitatShell(lived: number): THREE.Group {
  const g = new THREE.Group();
  const len = 2400, segA = 360, segL = 60;
  const geo = new THREE.CylinderGeometry(HAB_R, HAB_R, len, segA, segL, true);
  geo.rotateZ(Math.PI / 2);
  // the floor (our ground) is at the bottom: y = 0 there
  geo.translate(0, HAB_R, 0);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) - HAB_R, z = pos.getZ(i);
    const a = Math.atan2(z, -y); // 0 at the floor, ±π overhead
    // the windows are sky; the land takes its colour from the painted texture (white here)
    const c = isWindow(a) ? mix('#6c9fd2', '#c4e0f2', fbm(x * 0.004, a * 2, 3, 2)).multiplyScalar(1.15) : col('#ffffff').lerp(col('#f2ece0'), lived * 0.1);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const shell = new THREE.Mesh(geo, withClouds(new THREE.MeshStandardMaterial({ map: landTexture(lived), vertexColors: true, roughness: 0.95, side: THREE.BackSide })));
  shell.receiveShadow = true;
  g.add(shell);
  // the sun-line down the axis
  const line = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, len, 12).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 2.2), toneMapped: true }));
  line.position.y = HAB_R;
  g.add(line);
  return g;
}
