# The Kardashev Project

A cozy-but-real 3D management sim about the AI boom. Start in 2027 as a garage AI startup, build power, chips,
compute and supply lines on a real Earth, keep your models safe, and guide civilisation from **K ≈ 0.73 to Type I**.

**Get it:** https://thekardashevproject.netlify.app — a desktop game for Windows, macOS and Linux (installers on
[Releases](https://github.com/L0nE-F0x/The-Kardashev-Project/releases)). A Steam release is planned.

> Status: **v0.12.0 "All In"**. The whole campaign is playable end to end: Acts I (The Garage), II (The Scale-Up),
> III (The Charter), IV (Planetary) and V (Type I). See `SPEC.md` for the design and `CHANGELOG.md` for what changed.

## Run it locally

```bash
npm install
npm run dev             # the game at http://127.0.0.1:5317/play/ (the website at /)
npm test                # the sim's tests and the balance bots
```

The desktop app (needs Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)):

```bash
npm run desktop:dev     # the game in a native window
npm run desktop:build   # installers in src-tauri/target/release/bundle/
```

Two things are built from this repo: `npm run build` makes the game (`dist/`, bundled into the desktop app) and
`npm run build:site` makes the website (`dist-site/`, what Netlify serves). The game is not on the website.

## What's in it

- **A real Earth as a 3D globe**: Natural Earth coastlines, twelve regional blocs, real chokepoints, the sun where
  it really is, weather and city lights.
- **Every site is a place you can fly around**: campuses, power plants, Geneva, launch pads, the Moon and the
  habitats of Act V, with people who keep a working day, traffic, weather and the real local time.
- **Act I, The Garage**: rent compute, train Bit-1, build your first data hall, order chips that sail real sea
  routes, raise a Series A.
- **Act II, The Scale-Up**: gigawatt campuses, reactors and your own fab; supply deals, export rules, subsea
  cables, a board, rivals, and a three-front finale, the Crunch.
- **Act III, The Charter**: become Steward of a planetary project. Post contracts, judge bids from every company
  on Earth, win votes in a Council of twelve blocs, then hold the Threshold and win the renewal vote.
- **Act IV, Planetary**: five-year plans and time-lapse jumps; a supergrid that follows the sun, a fusion race,
  provinces run by AIs you trust, orbit and a Moon base; then the Heat Wall.
- **Act V, Type I**: self-replicating foundries on the Moon and real asteroids, a swarm of collectors round the
  Sun, big decisions about what the minds are owed, Solar Maximum and the last climb to K 1.0000.
- **Teaching layers**: Bit's tutorial, a How to Play handbook, advisor tips and a Field Guide to the real science.
- **Sandbox mode, 37 achievements, five save slots**, photo mode, a cinematic score, and an app that updates itself.

## Controls

Drag to turn the globe · scroll to zoom · click a site to inspect, double-click to visit it · Space pause ·
1–4 speed · C compute · O orders · R research · F finance · G goals · N news · B Field Guide · K stats ·
? How to play · M/Esc back to the globe. Later acts add their own panels (the dock shows the keys).

## Credits

Made by Lone Fox, built with Claude. Map data: Natural Earth (public domain). Typeface: Atkinson Hyperlegible Next
(SIL OFL). Built with three.js, Preact, Vite and Tauri. The people, trees and rocks
were modelled with Meshy; the rest of the world, the interface art and the sound are generated in code.
