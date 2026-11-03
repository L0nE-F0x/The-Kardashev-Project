# The Kardashev Project

A cozy-but-real pixel-art management sim about the AI boom. Start in 2027 as a garage AI startup,
build power, chips, compute and supply lines on a real-Earth pixel map, keep your models safe, and
(eventually) guide civilisation from **K ≈ 0.73 to Type I**.

> Status: **Act I — The Garage** is playable (vertical slice "First Light"). See `SPEC.md` for the full design.

## Play locally

```bash
npm install
npm run dev     # http://127.0.0.1:5317
```

## What's in the slice

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
- **Pressure**: 20 events (supply shocks, disasters, politics, climate, safety incidents, markets), each with
  advisor commentary and real trade-offs.
- **Campus dioramas**: side-view pixel scenes of each site, with animated facilities, weather, real local time of
  day, night lighting and a time-lapse toggle.
- **Era palettes**: the whole world re-grades as K climbs (preview them in Settings).
- **Offline progress**: the world keeps running while you're away (1 game-month per real hour, max a year).
- Works with mouse and keyboard or touch. Saves to your browser, with export/import save codes.

## Controls

Drag to pan · scroll or pinch to zoom · click a site to inspect, double-click to view its campus ·
Space pause · 1–4 speed · C compute · O orders · R research · F finance · G goals · N news ·
L power-line tool · M/Esc back to map.

## Credits

Map data © Natural Earth (public domain). Fonts: Pixelify Sans and Silkscreen (SIL OFL).
All art is generated in code; no image assets.
