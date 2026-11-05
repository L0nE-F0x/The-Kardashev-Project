import { useState } from 'preact/hooks';
import { BuiltBy, Icon, Window, fmtPlaytime, useGame } from '../components';
import { logoUrl } from '../logo';
import { SITE_BY_ID } from '../../content/sites';
import { DIFFICULTIES, FOUNDERS } from '../../content/difficulty';
import { APP_VERSION } from '../../content/changelog';
import { NewCompany } from './NewCompany';
import { SettingsBody } from './SettingsScreen';
import { FieldGuideBody } from './FieldGuide';
import { Credits, InstallHelp, WhatsNew } from './InfoScreens';
import { AchievementsScreen } from './Achievements';
import { importSave } from '../../save/save';
import { canPromptInstall, isAndroid, isDesktopApp, isIOS, isPhone, isStandalone, promptInstall, quitApp } from '../../platform/platform';

const BANNER_KEY = 'kardashev.appBannerDismissed';

/** Phones in a browser: offer the app (Android) or the home-screen install (iPhone), once until dismissed. */
function AppBanner() {
  const game = useGame();
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || isDesktopApp || isStandalone() || !isPhone() || !(isAndroid() || isIOS()) || game.menuScreen !== 'main') return null;
  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(BANNER_KEY, '1');
    } catch {
      /* storage blocked */
    }
  };
  return (
    <div class="appbanner frame interactive">
      <Icon name="fullscreen" />
      <span class="grow small">{isAndroid() ? 'Play full screen with the Android app.' : 'Add the game to your Home Screen to play full screen.'}</span>
      <button class="btn small primary" onClick={() => game.openMenuScreen('install')}>
        {isAndroid() ? 'Get the app' : 'How'}
      </button>
      <button class="btn small ghost" onClick={dismiss} aria-label="Not now">
        <Icon name="close" size="sm" />
      </button>
    </div>
  );
}
import type { IconName } from '../icons';

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** The front door: menu column over the cinematic tour, plus the menu's windows. */
export function MainMenu() {
  const game = useGame();
  const [tutorialNew, setTutorialNew] = useState(false);
  const slots = game.slots();
  const latest = slots[0];
  const screen = game.menuScreen;
  const newVersion = game.settings.lastSeenVersion !== APP_VERSION;
  const install = async () => {
    if (canPromptInstall()) await promptInstall();
    else game.openMenuScreen('install');
  };
  const item = (icon: IconName, label: string, onClick: () => void, badge?: boolean) => (
    <button class="btn menuitem" onClick={onClick}>
      <Icon name={icon} /> <span class="grow">{label}</span>
      {badge && <span class="dot" aria-label="new" />}
    </button>
  );
  return (
    <div class="menu">
      <div class="menu-col frame interactive">
        <img class="menu-logo" src={logoUrl()} alt="The Kardashev Project" draggable={false} />
        {latest && !latest.gameOver && (
          <button class="btn primary continue" onClick={() => game.continueSlot(latest.id)}>
            <Icon name="play" />
            <span class="grow">
              <span class="c1">Continue</span>
              <span class="c2">
                {latest.name} · {latest.dateLabel} · K {latest.K.toFixed(4)}
              </span>
            </span>
          </button>
        )}
        {item('hq', 'New company', () => {
          setTutorialNew(false);
          game.openMenuScreen('new');
        })}
        {slots.length > 0 && item('orders', `Load company (${slots.length}/5)`, () => game.openMenuScreen('load'))}
        {item('goals', 'Tutorial', () => {
          setTutorialNew(true);
          game.openMenuScreen('new');
        })}
        {item('research', 'Field Guide', () => game.openMenuScreen('guide'), game.guideBadge() > 0)}
        {item('goals', 'Achievements', () => game.openMenuScreen('achievements'))}
        {item('settings', 'Settings', () => game.openMenuScreen('settings'))}
        {item('news', 'What’s new', () => {
          game.updateSettings({ lastSeenVersion: APP_VERSION });
          game.openMenuScreen('whatsnew');
        }, newVersion)}
        {item('people', 'Credits', () => game.openMenuScreen('credits'))}
        {!isStandalone() && item('arrow', isAndroid() ? 'Get the Android app' : canPromptInstall() || game.installAvailable ? 'Install app' : 'Get the app', isAndroid() ? () => game.openMenuScreen('install') : install)}
        {isDesktopApp && item('close', 'Quit', () => void quitApp())}
        <div class="menu-foot small muted">
          v{APP_VERSION} · Acts I–V: The Garage · The Scale-Up · The Charter · Planetary · Type I
          <div class="menu-foot-links">
            <BuiltBy />
            {!isDesktopApp && (
              <>
                {' · '}
                <a href="../" class="link">
                  Home page
                </a>
              </>
            )}
          </div>
        </div>
      </div>
      {game.tourCaption && <div class="tour-caption frame">{game.tourCaption}</div>}
      <AppBanner />

      {screen === 'new' && <NewCompany tutorialDefault={tutorialNew ? true : undefined} key={tutorialNew ? 't' : 'n'} />}
      {screen === 'load' && <LoadGame />}
      {screen === 'settings' && (
        <Window title="Settings" icon="settings" wide onClose={() => game.openMenuScreen('main')}>
          <SettingsBody />
        </Window>
      )}
      {screen === 'guide' && (
        <Window title="Field Guide" icon="research" wide onClose={() => game.openMenuScreen('main')}>
          <FieldGuideBody />
        </Window>
      )}
      {screen === 'whatsnew' && <WhatsNew />}
      {screen === 'credits' && <Credits />}
      {screen === 'achievements' && <AchievementsScreen />}
      {screen === 'install' && <InstallHelp />}
    </div>
  );
}

function LoadGame() {
  const game = useGame();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const slots = game.slots();
  return (
    <Window title="Your companies" icon="orders" wide onClose={() => game.openMenuScreen('main')}>
      <div class="slots">
        {slots.map((sl) => (
          <div class={`slotcard frame ${sl.gameOver ? 'over' : ''}`} key={sl.id}>
            <div class="row between">
              <b class="n">{sl.name}</b>
              <span class="small muted">{ago(sl.savedAt)}</span>
            </div>
            <div class="small">
              {SITE_BY_ID[sl.home]?.name} · {sl.dateLabel} · {sl.model}
            </div>
            <div class="small muted">
              K {sl.K.toFixed(5)} · {DIFFICULTIES[sl.difficulty as keyof typeof DIFFICULTIES]?.name ?? sl.difficulty} · {FOUNDERS[sl.founder as keyof typeof FOUNDERS]?.name ?? sl.founder} · {fmtPlaytime(sl.playtime)}
              {sl.sandbox ? ' · 🧪 Sandbox' : ''}
              {sl.typeI ? ` · ☀ Type I in ${sl.typeI}` : (sl.act ?? 1) >= 5 ? ' · Act V' : sl.act4 ? ' · 🌍 Act IV done' : (sl.act ?? 1) >= 4 ? ' · Act IV' : sl.act3 ? ' · 🚀 Act III done' : (sl.act ?? 1) >= 3 ? ' · Act III' : sl.act2 ? ' · 🔔 Act II done' : (sl.act ?? 1) >= 2 ? ' · Act II' : sl.act1 ? ' · ✅ Act I' : ''}
            </div>
            <div class="row wrap" style={{ gap: '4px', marginTop: '6px' }}>
              {sl.gameOver ? (
                <span class="small bad">Bankrupt</span>
              ) : (
                <button class="btn small primary" onClick={() => game.continueSlot(sl.id)}>
                  <Icon name="play" size="sm" /> Play
                </button>
              )}
              {confirm === sl.id ? (
                <button
                  class="btn small danger"
                  onClick={() => {
                    game.deleteCompany(sl.id);
                    setConfirm(null);
                  }}
                >
                  Really delete
                </button>
              ) : (
                <button class="btn small" onClick={() => setConfirm(sl.id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <h4 class="section">Import a company</h4>
      <div class="row wrap" style={{ gap: '6px' }}>
        <input type="text" class="grow" value={code} placeholder="Paste a save code" onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
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
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (!f) return;
              const s = importSave(await f.text());
              if (!s) return setMsg('That file is not a Kardashev save.');
              game.importCompany(s);
            }}
          />
        </label>
      </div>
      {msg && <div class="small gold">{msg}</div>}
    </Window>
  );
}
