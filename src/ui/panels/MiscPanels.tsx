import { useState } from 'preact/hooks';
import { Icon, Panel, Portrait, useGame } from '../components';
import { OBJECTIVES } from '../../content/objectives';
import { fmtDate } from '../../sim/core';
import { ERA_NAMES, type Era } from '../../render/palette';
import { exportSave, importSave, writeSave } from '../../save/save';

export function NewsPanel() {
  const game = useGame();
  const s = game.state!;
  return (
    <Panel title="News" icon="news" class="wide" onClose={() => game.openPanel(null)}>
      {s.news.length === 0 && <div class="small muted">Quiet so far.</div>}
      {s.news.map((n, i) => (
        <div key={i} class="row small" style={{ alignItems: 'flex-start', marginBottom: '4px' }}>
          <span class="muted" style={{ minWidth: '90px' }}>
            {fmtDate(n.day)}
          </span>
          <span class={n.kind === 'good' ? 'good' : n.kind === 'bad' ? 'warn' : ''}>{n.text}</span>
        </div>
      ))}
    </Panel>
  );
}

export function GoalsPanel() {
  const game = useGame();
  const s = game.state!;
  return (
    <Panel title="Act I · The Garage" icon="goals" class="wide" onClose={() => game.openPanel(null)}>
      <p class="small muted" style={{ marginTop: 0 }}>
        Grow from a garage startup into a real AI company: your own model, your own compute, safely — then raise a Series A. Acts II–V (hyperscaler → steward of the Kardashev Project → Type I) are on the roadmap.
      </p>
      {OBJECTIVES.map((o) => {
        const done = s.objectives.done.includes(o.id);
        const unlocked = (o.after ?? []).every((a) => s.objectives.done.includes(a));
        return (
          <div class="objective" key={o.id} style={{ opacity: unlocked || done ? 1 : 0.45 }}>
            <Portrait id={o.advisor} size={32} />
            <div class="grow">
              <div class="t">
                {done ? <Icon name="check" size="sm" /> : null} {o.title} {o.goal && <span class="label gold">· goal</span>}
              </div>
              <div class="h">{o.hint}</div>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

export function SettingsPanel() {
  const game = useGame();
  const s = game.state!;
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const eraValue = game.eraOverride === null ? 'auto' : String(game.eraOverride);
  return (
    <Panel title="Settings" icon="settings" class="wide" onClose={() => game.openPanel(null)}>
      <div class="row wrap" style={{ gap: '8px' }}>
        <button class={`btn ${game.settings.sound ? 'active' : ''}`} onClick={() => game.updateSettings({ sound: !game.settings.sound })}>
          <Icon name={game.settings.sound ? 'sound' : 'mute'} size="sm" /> Sound {game.settings.sound ? 'on' : 'off'}
        </button>
        <button class={`btn ${game.settings.offline ? 'active' : ''}`} onClick={() => game.updateSettings({ offline: !game.settings.offline })} data-tip="While the tab is closed, the world keeps running at 1 game-month per real hour (max 1 year). No crises fire while you're away.">
          <Icon name="clock" size="sm" /> Offline progress {game.settings.offline ? 'on' : 'off'}
        </button>
        <button class={`btn ${game.settings.tutorialHints ? 'active' : ''}`} onClick={() => game.updateSettings({ tutorialHints: !game.settings.tutorialHints })}>
          <Icon name="goals" size="sm" /> Goal tracker {game.settings.tutorialHints ? 'on' : 'off'}
        </button>
        <button class="btn" onClick={() => game.updateSettings({ zoom: game.settings.zoom >= 2 ? 1 : 2 })} data-tip="Bigger pixels (whole-number zoom)">
          <Icon name="map" size="sm" /> Pixel zoom ×{game.settings.zoom}
        </button>
      </div>
      <div class="section">
        <h4>Era palette preview</h4>
        <div class="small muted" style={{ marginBottom: '5px' }}>
          The whole world re-grades as civilisation climbs the scale. Preview the later looks:
        </div>
        <div class="seg">
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
      <div class="section">
        <h4>Save</h4>
        <div class="row wrap" style={{ gap: '6px' }}>
          <button
            class="btn"
            onClick={() => {
              game.save();
              setMsg('Saved.');
            }}
          >
            Save now
          </button>
          <button
            class="btn"
            onClick={() => {
              const c = exportSave(s);
              setCode(c);
              void navigator.clipboard?.writeText(c).then(() => setMsg('Save code copied to clipboard.'), () => setMsg('Save code below — copy it somewhere safe.'));
            }}
          >
            Export save code
          </button>
          <button
            class="btn"
            onClick={() => {
              const imported = importSave(code);
              if (!imported) return setMsg('That save code did not work.');
              imported.savedAt = Date.now(); // an import is not time away — no offline catch-up
              writeSave(imported);
              game.continueSaved();
              setMsg('Save loaded.');
            }}
            disabled={!code}
          >
            Import from code
          </button>
        </div>
        <input type="text" value={code} placeholder="Paste a save code here" onInput={(e) => setCode((e.target as HTMLInputElement).value)} style={{ width: '100%', marginTop: '6px' }} />
        {msg && <div class="small gold" style={{ marginTop: '4px' }}>{msg}</div>}
      </div>
      <div class="section row wrap" style={{ gap: '6px' }}>
        <button class="btn" onClick={() => game.quitToTitle()}>
          Back to title
        </button>
        {!confirmNew ? (
          <button class="btn danger" onClick={() => setConfirmNew(true)}>
            Abandon this company…
          </button>
        ) : (
          <button
            class="btn danger"
            onClick={() => {
              setConfirmNew(false);
              game.quitToTitle();
              game.toast('Pick “New company” on the title screen to start over.', 'info');
            }}
          >
            Yes — go to title to start over
          </button>
        )}
      </div>
      <div class="small muted section">
        Keys: Space pause · 1–4 speed · C compute · O orders · R research · F finance · G goals · N news · L power line · M map · Esc close. Drag to pan, scroll or pinch to zoom.
      </div>
    </Panel>
  );
}
