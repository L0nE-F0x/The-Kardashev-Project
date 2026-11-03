import { useState } from 'preact/hooks';
import { Choice, Icon, Slider, Toggle, fmtPlaytime, useGame } from '../components';
import { ERA_NAMES, type Era } from '../../render/palette';
import { defaultSettings, saveSettings } from '../../save/settings';
import { downloadSave, exportSave, importSave, loadSlot, wipeAllData } from '../../save/save';
import { EVENT_RATES, type EventRate } from '../../content/difficulty';
import { SITE_BY_ID } from '../../content/sites';
import { isDesktopApp, toggleFullscreen } from '../../platform/platform';

type Tab = 'gameplay' | 'display' | 'audio' | 'access' | 'controls' | 'data';
const TABS: [Tab, string][] = [
  ['gameplay', 'Gameplay'],
  ['display', 'Display'],
  ['audio', 'Audio'],
  ['access', 'Accessibility'],
  ['controls', 'Controls'],
  ['data', 'Data'],
];

/** The tabbed Settings screen, used from the main menu and in game. */
export function SettingsBody() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>('gameplay');
  return (
    <div class="settings">
      <div class="tabs" role="tablist">
        {TABS.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} class={`btn small ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>
      <div class="tabbody">
        {tab === 'gameplay' && <Gameplay />}
        {tab === 'display' && <Display />}
        {tab === 'audio' && <Audio />}
        {tab === 'access' && <Access />}
        {tab === 'controls' && <Controls />}
        {tab === 'data' && <Data />}
      </div>
      {game.state && (
        <div class="row wrap section" style={{ gap: '6px' }}>
          <button class="btn" onClick={() => (game.save(), game.toast('Saved.', 'good'))}>
            Save now
          </button>
          <button class="btn" onClick={() => game.quitToMenu()}>
            <Icon name="hq" size="sm" /> Main menu
          </button>
        </div>
      )}
    </div>
  );
}

function Gameplay() {
  const game = useGame();
  const st = game.settings;
  const s = game.state;
  return (
    <>
      <Toggle label="Pause for decisions" hint="Event cards stop the clock. Off: they wait in a pill at the top while time runs." value={st.autoPause} onChange={(v) => game.updateSettings({ autoPause: v })} />
      <Toggle label="Offline progress" hint="The world keeps running while you’re away (no crises fire)." value={st.offline} onChange={(v) => game.updateSettings({ offline: v })} />
      {st.offline && (
        <Choice
          label="Offline speed"
          hint="Game months per real hour away (max one year)."
          value={st.offlineRate}
          options={[
            [0.5, '½ month'],
            [1, '1 month'],
            [2, '2 months'],
          ]}
          onChange={(v) => game.updateSettings({ offlineRate: v })}
        />
      )}
      <Choice
        label="Autosave"
        value={st.autosaveSec}
        options={[
          [10, '10 s'],
          [20, '20 s'],
          [60, '60 s'],
        ]}
        onChange={(v) => game.updateSettings({ autosaveSec: v })}
      />
      <Choice
        label="Ask before big spends"
        value={st.confirmSpend}
        options={[
          [0, 'Never'],
          [50e6, '$50M+'],
          [200e6, '$200M+'],
        ]}
        onChange={(v) => game.updateSettings({ confirmSpend: v })}
      />
      <Toggle label="Goal tracker" hint="The ‘Next up’ card with what to do next." value={st.goalTracker} onChange={(v) => game.updateSettings({ goalTracker: v })} />
      {s && (
        <>
          <h4 class="section">This company</h4>
          <Choice<EventRate>
            label="Random events"
            hint="How often crises and opportunities appear."
            value={s.meta.eventRate}
            options={(Object.keys(EVENT_RATES) as EventRate[]).map((k) => [k, EVENT_RATES[k].name])}
            onChange={(v) => {
              s.meta.eventRate = v;
              game.notify();
            }}
          />
          <div class="row wrap" style={{ gap: '6px', marginTop: '6px' }}>
            <button
              class="btn small"
              onClick={() => {
                game.tutorialRestart();
                game.openPanel(null);
              }}
            >
              <Icon name="goals" size="sm" /> Replay Bit’s tutorial
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Display() {
  const game = useGame();
  const st = game.settings;
  const eraValue = game.eraOverride === null ? 'auto' : String(game.eraOverride);
  return (
    <>
      <Choice
        label="Pixel size"
        hint="Whole-number zoom on top of the automatic scale."
        value={st.zoom}
        options={[
          [1, 'Auto'],
          [2, 'Bigger'],
          [3, 'Biggest'],
        ]}
        onChange={(v) => game.updateSettings({ zoom: v })}
      />
      <Choice
        label="Interface size"
        value={st.uiScale}
        options={[
          [0.9, '90%'],
          [1, '100%'],
          [1.15, '115%'],
          [1.3, '130%'],
        ]}
        onChange={(v) => game.updateSettings({ uiScale: v })}
      />
      <Toggle label="Weather" hint="Rain, snow and dust storms in campus views." value={st.weather} onChange={(v) => game.updateSettings({ weather: v })} />
      <Toggle label="Clouds on the map" value={st.clouds} onChange={(v) => game.updateSettings({ clouds: v })} />
      <Toggle label="Day & night" hint="The real-time night side on the map; local time in campus views. Off: always daytime." value={st.dayNight} onChange={(v) => game.updateSettings({ dayNight: v })} />
      <Toggle label="CRT filter" hint="Scanlines and a soft vignette, for that old-monitor glow." value={st.crt} onChange={(v) => game.updateSettings({ crt: v })} />
      <Toggle label="Battery saver" hint="Draw at ~30 fps with fewer particles." value={st.batterySaver} onChange={(v) => game.updateSettings({ batterySaver: v })} />
      <Toggle label="FPS counter" value={st.fps} onChange={(v) => game.updateSettings({ fps: v })} />
      <div class="setting opt">
        <span class="txt">
          <span class="l">Era palette</span>
          <span class="h">The world re-grades as civilisation climbs the scale. Preview the later looks.</span>
        </span>
        <div class="seg wrap">
          <button class={`btn small ${eraValue === 'auto' ? 'active' : ''}`} onClick={() => game.setEraOverride(null)}>
            Auto
          </button>
          {ERA_NAMES.map((n, i) => (
            <button key={n} class={`btn small ${eraValue === String(i) ? 'active' : ''}`} onClick={() => game.setEraOverride(i as Era)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <button class="btn small" style={{ marginTop: '6px' }} onClick={() => void toggleFullscreen()}>
        Toggle fullscreen
      </button>
    </>
  );
}

function Audio() {
  const game = useGame();
  const st = game.settings;
  return (
    <>
      <Slider label="Master volume" value={st.master} onChange={(v) => game.updateSettings({ master: v })} />
      <Slider label="Music" hint="Theme on the menu, quiet ambience in game." value={st.music} onChange={(v) => game.updateSettings({ music: v })} />
      <Slider label="Sound effects" value={st.sfx} onChange={(v) => game.updateSettings({ sfx: v })} />
      <Toggle label="Mute in the background" hint="Silence when you switch tabs or apps." value={st.muteInBackground} onChange={(v) => game.updateSettings({ muteInBackground: v })} />
    </>
  );
}

function Access() {
  const game = useGame();
  const st = game.settings;
  return (
    <>
      <Toggle label="Readable font" hint="A plain font for all text instead of the pixel font." value={st.readableFont} onChange={(v) => game.updateSettings({ readableFont: v })} />
      <Choice
        label="Colour-blind safe colours"
        hint="Good/bad states switch to colours that stay distinct."
        value={st.colorblind}
        options={[
          ['off', 'Off'],
          ['deutan', 'Red–green'],
          ['tritan', 'Blue–yellow'],
        ]}
        onChange={(v) => game.updateSettings({ colorblind: v })}
      />
      <Toggle label="Reduce motion" hint="Still clouds, no rain, no sliding animations." value={st.reducedMotion} onChange={(v) => game.updateSettings({ reducedMotion: v })} />
      <Toggle label="High contrast" hint="Brighter text and stronger panel edges." value={st.highContrast} onChange={(v) => game.updateSettings({ highContrast: v })} />
    </>
  );
}

const KEYS: [string, string][] = [
  ['Space', 'Pause / resume'],
  ['1 – 4', 'Game speed'],
  ['C · O · R · F', 'Compute · Orders · Research · Finance'],
  ['G · N · B', 'Goals · News · Field Guide'],
  ['L', 'Power-line tool'],
  ['I', 'Fiber tool (Act II)'],
  ['T · E · P', 'Team · Deals · Blocs (Act II)'],
  ['H · U', 'The Charter · The Council (Act III)'],
  ['W A S D / arrows', 'Pan the map'],
  ['+ / −', 'Zoom the map'],
  ['M · Esc', 'Back to the map / close'],
];

function Controls() {
  const game = useGame();
  return (
    <>
      <Choice
        label="Mouse wheel"
        hint="Pinch and + / − always zoom."
        value={game.settings.wheel}
        options={[
          ['zoom', 'Zooms'],
          ['pan', 'Pans'],
        ]}
        onChange={(v) => game.updateSettings({ wheel: v })}
      />
      <h4 class="section">Shortcuts</h4>
      <div class="kv keys">
        {KEYS.map(([k, v]) => (
          <>
            <span class="k" key={k}>
              <kbd>{k}</kbd>
            </span>
            <span class="v" key={v}>
              {v}
            </span>
          </>
        ))}
      </div>
      <p class="small muted">Touch: drag to pan, pinch to zoom, long-press for details, double-tap a site to visit its campus.</p>
    </>
  );
}

function Data() {
  const game = useGame();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const slots = game.slots();
  const onFile = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const s = importSave(await file.text());
    if (!s) return setMsg('That file is not a Kardashev save.');
    game.importCompany(s);
  };
  return (
    <>
      <h4>Companies ({slots.length}/5)</h4>
      {slots.length === 0 && <p class="small muted">No saved companies yet.</p>}
      {slots.map((sl) => (
        <div class="slotrow" key={sl.id}>
          <div class="grow">
            <b>{sl.name}</b>
            <div class="small muted">
              {SITE_BY_ID[sl.home]?.name} · {sl.dateLabel} · {fmtPlaytime(sl.playtime)}
            </div>
          </div>
          <button
            class="btn small"
            data-tip="Copy a save code to the clipboard"
            onClick={() => {
              const s = loadSlot(sl.id);
              if (!s) return;
              const c = exportSave(s);
              setCode(c);
              void navigator.clipboard?.writeText(c).then(
                () => setMsg(`Save code for ${sl.name} copied.`),
                () => setMsg('Save code below — copy it somewhere safe.'),
              );
            }}
          >
            Code
          </button>
          <button
            class="btn small"
            data-tip="Download as a file"
            onClick={() => {
              const s = loadSlot(sl.id);
              if (s) downloadSave(s);
            }}
          >
            File
          </button>
          {confirmDel === sl.id ? (
            <button
              class="btn small danger"
              onClick={() => {
                game.deleteCompany(sl.id);
                setConfirmDel(null);
              }}
            >
              Really delete
            </button>
          ) : (
            <button class="btn small" onClick={() => setConfirmDel(sl.id)} disabled={game.slotId === sl.id}>
              Delete
            </button>
          )}
        </div>
      ))}
      <h4 class="section">Import a company</h4>
      <div class="row wrap" style={{ gap: '6px' }}>
        <input type="text" value={code} placeholder="Paste a save code" onInput={(e) => setCode((e.target as HTMLInputElement).value)} class="grow" />
        <button
          class="btn"
          disabled={!code}
          onClick={() => {
            const s = importSave(code);
            if (!s) return setMsg('That save code did not work.');
            game.importCompany(s);
          }}
        >
          Import
        </button>
        <label class="btn">
          From file…
          <input type="file" accept=".json,application/json" onChange={onFile} hidden />
        </label>
      </div>
      {msg && <div class="small gold" style={{ marginTop: '4px' }}>{msg}</div>}
      <h4 class="section">Reset</h4>
      <div class="row wrap" style={{ gap: '6px' }}>
        <button
          class="btn"
          onClick={() => {
            const fresh = { ...defaultSettings(), lastSeenVersion: game.settings.lastSeenVersion, tutorialOffered: game.settings.tutorialOffered };
            saveSettings(fresh);
            game.updateSettings(fresh);
            setMsg('Settings reset to defaults.');
          }}
        >
          Reset settings
        </button>
        {!confirmWipe ? (
          <button class="btn danger" onClick={() => setConfirmWipe(true)} disabled={!!game.state}>
            Delete all data…
          </button>
        ) : (
          <button
            class="btn danger"
            onClick={() => {
              wipeAllData();
              window.location.reload();
            }}
          >
            Yes, delete every company and setting
          </button>
        )}
      </div>
      <p class="small muted">
        Saves live in this {isDesktopApp ? 'app' : 'browser'} only. Use save codes or files to move a company between devices.
      </p>
    </>
  );
}
