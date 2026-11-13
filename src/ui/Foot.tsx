import { Icon, useGame } from './components';
import { rich } from './emoji';
import { upIcon } from './Objectives';
import { horizon, upcoming } from '../sim/upcoming';
import { fmtDays, yearOf } from '../sim/core';
import { buildArtUrl } from './buildArt';

/**
 * The strip along the foot of the screen (v0.14, SPEC §34): the newest headline at the left (click for the News
 * panel) and what is coming at the right, soonest first. Each coming thing is a button that skips the clock ahead
 * to it (Acts I–III; Acts IV–V move by plans and eras, so their line is empty and says so).
 */
export function FootStrip() {
  const game = useGame();
  const s = game.state!;
  const jumps = (s.act ?? 1) >= 4;
  const soon = (jumps ? horizon(s) : upcoming(s)).slice(0, 5);
  // a plan's horizon is years off: say the year once it is more than a year away
  const when = (day: number) => (jumps && day - s.day > 360 ? String(Math.floor(yearOf(day))) : fmtDays(day - s.day));
  const news = s.news[0];
  const canSkip = !jumps && s.meta.tutorialStep < 0 && !game.skip && !game.blocked;
  return (
    <div class="foot interactive">
      <button class="foot-news btnless" onClick={() => game.openPanel('news')} data-tip="Open the news log" data-key="N">
        <span class="fl">
          <Icon name="news" size="sm" /> News
        </span>
        <span class={`ft ${news?.kind ?? ''}`} key={news ? `${news.day}:${news.text}` : 'none'}>
          {news ? rich(news.text) : 'The world waits. Click a site on the map to begin.'}
        </span>
      </button>
      <div class="foot-line" data-tut="comingup">
        <span class="fl">Coming up</span>
        <div class="track">
          {soon.map((it) => (
            <button
              class="fe btnless"
              key={it.key}
              disabled={!canSkip}
              onClick={() => game.skipTo(it.day, it.text)}
              data-tip={canSkip ? `${it.text}\nClick to run the clock flat out until then (${fmtDays(it.day - s.day)}). Any event card stops it, and so does any speed button.` : jumps ? `${it.text}\nIn ${fmtDays(it.day - s.day)}. The plan carries the clock there.` : it.text}
            >
              <i class="dot" />
              <b>{when(it.day)}</b>
              <span class="fe-t">
                <Icon name={upIcon(it.icon)} size="sm" /> {it.text}
              </span>
            </button>
          ))}
          {!soon.length && <span class="fe none">{jumps ? 'Nothing on the horizon yet: the next plan sets what comes.' : 'Nothing on its way. Build, order or research something.'}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * What was kept from the garage (SPEC §34): Juno's sticky note from 2027 and a photograph of the first building.
 * It is drawn in every act and shown only by the last two looks, where it is the one solid thing among the light.
 */
export function Keepsake() {
  const photo = buildArtUrl('hq');
  return (
    <div class="keepsake" aria-hidden="true">
      {photo && <img src={photo} alt="" />}
      {photo && <i>2027</i>}
      we started in a garage. don’t forget.
      <br />— Juno
    </div>
  );
}
