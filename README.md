# The Kardashev Project

A cozy-but-real pixel-art management sim about the AI boom. Start in 2027 as a garage AI startup,
build power, chips, compute and supply lines on a real-Earth pixel map, keep your models safe, and
(eventually) guide civilisation from **K ≈ 0.73 to Type I**.

**Play:** https://thekardashevproject.netlify.app — in the browser, installed as an app (offline, landscape on
phones), or as a Windows / macOS / Linux download from [Releases](https://github.com/L0nE-F0x/The-Kardashev-Project/releases).

> Status: **v0.2 "The Front Door"**. Act I (The Garage) is playable end to end. See `SPEC.md` for the full design
> and `CHANGELOG.md` for what changed.

## Play locally

```bash
npm install
npm run dev     # website at http://127.0.0.1:5317, game at http://127.0.0.1:5317/play/
```

Desktop app (needs Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)):

```bash
npm run desktop:dev     # the game in a native window
npm run desktop:build   # installers in src-tauri/target/release/bundle/
```

## What's in it

- **Real-Earth pixel world map**: Natural Earth coastlines, 12 regional blocs, biomes, rivers and mountain
  ranges, two zoom levels, a live day/night terminator from the real clock and city lights.
- **36 build sites** plus fabs, memory makers, the EUV toolmaker, packaging and cloud, all fictional companies on
  real geography.
- **Build** solar, wind, batteries, gas, data centers and labs. Request grid connections (with real
  interconnect queues), and draw transmission lines between sites.
- **Order accelerators** from Lumen or Kestrel. Ships sail real sea routes through Panama, Suez and Malacca, and
  reroute when chokepoints close.
- **Train models** (Bit-1, Bit-2…), and split compute between training, inference revenue, research and safety.
  Rival labs keep shipping.
- **Pressure**: 20+ events (supply shocks, disasters, politics, climate, safety incidents, markets), each with
  advisor commentary and real trade-offs.
- **Campus dioramas**: side-view pixel scenes of each site, with animated facilities, weather, real local time of
  day, night lighting and a time-lapse toggle.
- **Era palettes**: the whole world re-grades as K climbs (preview them in Settings → Display).
- **Main menu** with a cinematic tour, **five save slots**, and a New Company setup: home city, difficulty
  (Relaxed / Standard / Hard), founder perks and a custom start with a shareable seed.
- **Bit's tutorial** walks you through the first ten minutes; the **Field Guide** explains the real science and
  engineering behind the game, unlocking entries as you meet them.
- **Settings**: gameplay (event pausing, offline progress, autosave, spend confirmations), display (pixel and UI
  size, weather, clouds, day/night, CRT filter, battery saver, FPS), audio, accessibility (readable font,
  colour-blind-safe colours, reduced motion, high contrast), controls and save data.
- **Offline progress**: the world keeps running while you're away (1 game-month per real hour by default, max a year).
- Mouse and keyboard or touch. Saves stay on your device, with export/import save codes and files.

## Controls

Drag to pan · scroll or pinch to zoom · click a site to inspect, double-click to view its campus ·
Space pause · 1–4 speed · C compute · O orders · R research · F finance · G goals · N news · B Field Guide ·
L power-line tool · M/Esc back to map · WASD/arrows pan · +/− zoom.

## Credits

Made by Lone Fox, built with Claude. Map data © Natural Earth (public domain). Fonts: Pixelify Sans and
Silkscreen (SIL OFL). Built with PixiJS, Preact, Vite and Tauri. All art and sound is generated in code.
