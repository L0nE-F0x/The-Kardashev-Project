# The marketing kit's pipeline

Everything in `~/Videos/The Kardashev Project - Marketing/` (trailer, teaser, shorts, stills, key art) is made by
these scripts from the running game. Nothing here is part of the game or its build.

## What does what

| File | Job |
|---|---|
| `music-map.mjs` | the one clock picture and sound share: 120 BPM, a bar = 2 s; what each piece does bar by bar |
| `score/` | the music, written with the game's own audio engine (`render.mjs` renders it; its own README comment says how) |
| `shots.mjs` | every shot: the scene, the light, the camera move, what happens each frame |
| `director.js` | runs in the game's page: builds the worlds and scenes, a free camera, a pointer for interface shots, the test bots at the controls for time-lapses |
| `cdp.mjs` | the Chrome DevTools client; puts the page on a virtual clock so every frame is exactly 1/60 s of game time |
| `capture.mjs` | records shots to `~/.cache/kardashev-marketing/clips-<wide|tall>/` (`--preview` = three small frames a shot; `--still` = 4K PNGs) |
| `plan.mjs` | the cuts: which shot when, the titles over it, the Kardashev read-out's numbers |
| `titles.html` / `titles.mjs` | the animated titles, one transparent PNG a frame |
| `edit.mjs` | cuts clips + titles + music into a video (ffmpeg) |
| `art.html` / `art.mjs` | key art from the stills: logo over a picture at the sizes the sites ask for |
| `kit.mjs` | the last step: files the finished pieces into the kit folder under the names people see (stills numbered in story order, a 1080p copy of the trailer and teaser); `--keep <folder>` sets aside what it replaces |
| `x.mjs`, `shots-try/` | directing by hand: run a snippet in a tab that stays open and look at the result |

## Making it again

With the dev server running (`npm run dev`) and a headless Chrome on the real GPU on port 9333 (the command in
CLAUDE.md under "QA", with `--remote-debugging-port=9333 --user-data-dir=$HOME/.cache/kardashev-marketing/chrome
--window-size=1920,1080 --mute-audio`):

```bash
node tools/trailer/capture.mjs all --preview          # look at ~/.cache/kardashev-marketing/x/preview-wide-*.jpg first
node tools/trailer/capture.mjs all                    # every shot, 2560×1440 at 60 fps (about 40 minutes)
node tools/trailer/capture.mjs earth-night,garage,timelapse,lulea-night,wind,fusion,northsea,supergrid,liftoff,moon,yards,habitat,swarm,type1,day,liftoff-long --view tall
node tools/trailer/capture.mjs all --still            # 4K stills (and `type1 --still --view tall` for the poster)
node tools/trailer/score/render.mjs all               # the music (needs its own Vite on 5318 and Chrome on 9334: see the file)
node tools/trailer/titles.mjs all                     # don't edit titles.html while this runs (Vite reloads the page)
for e in trailer teaser teaser-tall day day-tall liftoff liftoff-tall type1 type1-tall; do node tools/trailer/edit.mjs $e; done
node tools/trailer/art.mjs
node tools/trailer/kit.mjs stills tall-stills art music trailer teaser teaser-tall day day-tall liftoff liftoff-tall type1 type1-tall
```

**When only the interface changed** (v0.14's five looks, 2026-11-14): the shots without interface were measured
against the build first (six stills re-shot, under 0.5% mean difference: people and clouds standing elsewhere) and
kept; only the `hud-*` shots, the two cuts that use them and their stills were made again:

```bash
H=hud-build,hud-map,hud-research,hud-event,hud-campus,hud-charter,hud-planet,hud-system
node tools/trailer/capture.mjs $H && node tools/trailer/capture.mjs $H --still
node tools/trailer/titles.mjs trailer,teaser && node tools/trailer/edit.mjs trailer && node tools/trailer/edit.mjs teaser
node tools/trailer/kit.mjs stills trailer teaser --shots $H --keep "Previous (v0.13.2)"
```

`edit.mjs <edit> --draft` cuts a half-size draft in a minute; look at it as a sheet of frames:
`ffmpeg -i out/trailer-draft.mp4 -vf "fps=1,scale=426:240,tile=6x8" -frames:v 1 sheet.jpg`.

## Things worth knowing

- A tight loop of frames starves the page: models and textures load between frames, so warm-ups use
  `D.runAsync` and `D.loaded()`.
- A shot that starts a real game (`D.start`) leaves it running; `D.world()` goes back to the title first, or the
  next scene shows that game's world instead of the one asked for.
- The clips are full-range BT.601 (Chrome's JPEG screenshots); `edit.mjs` converts to ordinary BT.709 video. Checked
  against the game's own frame: within 2 levels.
- The vertical cuts are recorded upright (a wider lens, the globe from further off), not cropped from the wide ones.
- Each act has its own interface look (v0.14): a company started in an act (`D.start('act3')` …) wears that act's.
  Every act has one `hud-*` shot in the trailer, so the cut shows all five.
- A company played forward by a bot has every unlock briefing still waiting, and each opens a panel over the shot:
  `await D.briefed()` after `D.days(…)`. The bot's own days also call Council sessions; let the game's clock run
  the shot instead (`game.setSpeed`).
- The launch pads run on the scene's clock (`sets/launch/pad.ts`): the liftoff shots set that clock so the rocket
  leaves on a bar line.
