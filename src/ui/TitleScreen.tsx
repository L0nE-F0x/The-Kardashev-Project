import { useMemo, useState } from 'preact/hooks';
import { Icon, Portrait, useGame } from './components';
import { HOME_SITES } from '../content/sites';
import { REGIONS } from '../content/regions';
import { C } from '../render/palette';
import { PixelCanvas, toDataUrl } from '../render/pixels';
import { drawText, measureText } from '../render/font';

/** Chunky bevelled pixel logo built from the 3×5 font. */
function logoUrl(): string {
  const big = 'KARDASHEV';
  const S = 3; // each font pixel → 3×3 block
  const bigW = measureText(big) * S;
  const W = bigW + 16;
  const H = 5 * S + 26;
  const pc = new PixelCanvas(W, H);
  const glyphs = new PixelCanvas(measureText(big), 5);
  drawText(glyphs, big, 0, 0, C.white);
  const ox = 8;
  const oy = 10;
  // drop shadow
  for (let y = 0; y < 5; y++) for (let x = 0; x < glyphs.w; x++) if (glyphs.get(x, y)) pc.rect(ox + x * S + 2, oy + y * S + 2, S, S, C.vio1);
  // fill with a vertical gradient + bevel
  const ramp = [C.yel2, C.yel1, C.yel0, C.org2, C.org1, C.org0];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < glyphs.w; x++) {
      if (!glyphs.get(x, y)) continue;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const gy = y * S + j;
          const c = ramp[Math.min(ramp.length - 1, Math.floor((gy / (5 * S)) * ramp.length))];
          pc.set(ox + x * S + i, oy + gy, c);
        }
      }
      if (!glyphs.get(x, y - 1)) pc.hline(ox + x * S, oy + y * S, S, C.white);
    }
  }
  pc.outline(C.ink0);
  // "THE" and "PROJECT"
  drawText(pc, 'THE', ox, 2, C.cyn5);
  const proj = 'P R O J E C T';
  drawText(pc, proj, W - 8 - measureText(proj), oy + 5 * S + 6, C.cyn5);
  // a tiny sun climbing the scale
  pc.circle(W - 10, 5, 3, C.yel0);
  pc.set(W - 11, 4, C.yel2);
  const barEnd = W - 12 - measureText(proj) - ox;
  for (let i = 0; i < barEnd; i += 2) pc.set(ox + i, oy + 5 * S + 8, i < barEnd * 0.73 ? C.cyn4 : C.ink5);
  return toDataUrl(pc);
}

export function TitleScreen() {
  const game = useGame();
  const [step, setStep] = useState<'menu' | 'new'>('menu');
  const [name, setName] = useState('Little Sun Labs');
  const [home, setHome] = useState(HOME_SITES[0].id);
  const logo = useMemo(logoUrl, []);
  const hasSave = game.hasSave();
  return (
    <div class="title">
      <div class="card frame">
        <img class="logo" src={logo} alt="The Kardashev Project" />
        <div class="tagline">Guide the AI boom — energy, chips, compute and supply lines — and lift Earth up the Kardashev scale.</div>
        {step === 'menu' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
            {hasSave && (
              <button class="btn primary" style={{ minWidth: '240px', justifyContent: 'center' }} onClick={() => game.continueSaved()}>
                <Icon name="play" size="sm" /> Continue
              </button>
            )}
            <button class={`btn ${hasSave ? '' : 'primary'}`} style={{ minWidth: '240px', justifyContent: 'center' }} onClick={() => setStep('new')}>
              <Icon name="hq" size="sm" /> New company
            </button>
            <div class="row" style={{ marginTop: '10px', gap: '6px' }}>
              <Portrait id="juno" size={40} />
              <Portrait id="penny" size={40} />
              <Portrait id="mira" size={40} />
              <Portrait id="sol" size={40} />
              <Portrait id="iris" size={40} />
              <Portrait id="bit" size={40} bitGen={1} mood="happy" />
            </div>
            <div class="small muted" style={{ marginTop: '6px' }}>
              Act I · The Garage — a vertical slice. Earth today: 19.6 TW · K 0.729
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'left' }}>
            <label>
              <span class="label">Company name</span>
              <input type="text" value={name} maxLength={28} onInput={(e) => setName((e.target as HTMLInputElement).value)} style={{ width: '100%' }} />
            </label>
            <div class="label" style={{ marginTop: '10px' }}>
              Where is your garage?
            </div>
            <div class="homegrid">
              {HOME_SITES.map((s) => (
                <button key={s.id} class={`btn homecard ${home === s.id ? 'active' : ''}`} onClick={() => setHome(s.id)}>
                  <span class="n">{s.name}</span>
                  <span class="b">{REGIONS[s.region].name}</span>
                  <span class="b">
                    Talent ×{s.talent.toFixed(1)} · grid ${Math.round(REGIONS[s.region].gridPrice * s.priceMult)}/MWh
                  </span>
                </button>
              ))}
            </div>
            <div class="row between">
              <button class="btn" onClick={() => setStep('menu')}>
                Back
              </button>
              <button class="btn primary" onClick={() => game.startNew(name, home)}>
                <Icon name="play" size="sm" /> Found the company
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
