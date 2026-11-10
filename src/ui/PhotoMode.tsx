/**
 * Photo mode (campuses): the interface steps aside for a camera bar — the hour, the weather, the
 * lens and the blur — and the picture saves as a PNG without any interface in it. The clock waits meanwhile.
 */
import { useEffect, useState } from 'preact/hooks';
import { Icon, useGame } from './components';
import { savedNote, saveImage } from '../platform/platform';

type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'dust';

/** What a scene must offer for photo mode (the 3D campus does). */
interface PhotoScene {
  localHour(): number;
  setHour(h: number): void;
  setWeather(w: Weather | null): void;
  readonly weatherChoice: Weather | null;
  setLens(fov: number): void;
  readonly lens: number;
  blur: number;
}

const photoScene = (s: unknown): PhotoScene | null => (s && typeof (s as PhotoScene).setLens === 'function' ? (s as PhotoScene) : null);

const clock = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

/** The camera button beside the campus bar. */
export function PhotoButton() {
  const game = useGame();
  if (game.mode !== 'diorama' || game.photo || !game.stage.capture || !photoScene(game.stage.getScene())) return null;
  return (
    <button class="btn small photo-open frame interactive" onClick={() => game.togglePhoto(true)} data-tip="Photo mode: hide the interface, pick the light and the weather, save a picture">
      <Icon name="fullscreen" size="sm" /> Photo
    </button>
  );
}

export function PhotoBar() {
  const game = useGame();
  const scene = game.photo ? photoScene(game.stage.getScene()) : null;
  const [, redraw] = useState(0);
  const [note, setNote] = useState('');
  const [bare, setBare] = useState(false);
  // photo mode belongs to the campus view: anything that leaves it ends it
  useEffect(() => {
    if (game.photo && (game.mode !== 'diorama' || !scene)) game.togglePhoto(false);
  });
  useEffect(() => {
    if (!game.photo) { setBare(false); setNote(''); }
  }, [game.photo]);
  if (!game.photo || !scene) return null;
  const again = () => redraw((n) => n + 1);
  const save = () => {
    const url = game.stage.capture?.();
    // the player's own clock in the name, so the pictures sort the way they were taken
    const d = new Date();
    const stamp = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join('-');
    const name = `kardashev-${game.dioramaSite ?? 'campus'}-${stamp}.png`;
    const failed = 'The picture could not be saved: take a screenshot instead.';
    if (!url) return setNote(failed);
    void saveImage(name, url).then((p) => setNote(savedNote(p, failed)));
  };
  if (bare)
    return (
      <button class="photobar photobar-bare btn small frame interactive" onClick={() => setBare(false)}>
        Show the camera bar
      </button>
    );
  return (
    <div class="photobar frame interactive">
      <label data-tip="The campus's local hour (the sun stands where it would there, today)">
        <span>Hour · {clock(scene.localHour())}</span>
        <input type="range" min="0" max="24" step="0.05" value={scene.localHour()} onInput={(e) => { scene.setHour(+(e.target as HTMLInputElement).value); again(); }} />
      </label>
      <label>
        <span>Weather</span>
        <select value={scene.weatherChoice ?? ''} onChange={(e) => { scene.setWeather(((e.target as HTMLSelectElement).value || null) as Weather | null); again(); }}>
          <option value="">As it is</option>
          <option value="clear">Clear</option>
          <option value="cloudy">Cloudy</option>
          <option value="rain">Rain</option>
          <option value="snow">Snow</option>
          <option value="dust">Dust</option>
        </select>
      </label>
      <label data-tip="A long lens flattens the scene like a model; a wide one takes in the sky">
        <span>Lens · {Math.round(scene.lens)}°</span>
        <input type="range" min="16" max="64" step="1" value={scene.lens} onInput={(e) => { scene.setLens(+(e.target as HTMLInputElement).value); again(); }} />
      </label>
      <label data-tip="How soft everything before and behind the point you look at gets">
        <span>Blur</span>
        <input type="range" min="0" max="3" step="0.05" value={scene.blur} onInput={(e) => { scene.blur = +(e.target as HTMLInputElement).value; again(); }} />
      </label>
      <button class="btn small" onClick={() => setBare(true)} data-tip="Hide this bar too (for your own screenshot)">Hide bar</button>
      <button class="btn small primary" onClick={save}>Save picture</button>
      <button class="btn small" onClick={() => game.togglePhoto(false)} data-tip="Back to the game (Esc)">Done</button>
      {note && <span class="small muted photobar-note">{note}</span>}
    </div>
  );
}
