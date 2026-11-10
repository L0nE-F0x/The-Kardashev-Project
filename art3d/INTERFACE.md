# Interface art (v0.13): no pixel art

Decided by the user on 2026-11-11: "change all the remaining pixel art to 3D style". The world has been 3D since
v0.10; the interface still carried the pixel edition's art (logo, app icon, portraits, icons, the Type I end card,
a few small pictures). All of it is replaced. This file is the shared direction for that work and the convention
afterwards.

## The look

The game looks like a warm, well-lit scale model: clean shapes, matte materials, soft shadows, golden light
(`art3d/DIRECTION.md`). The interface is dark glass with a teal accent and a gold highlight
(`src/render3d/ui/tokens.css`: the `--e-*` variables). Interface art has to belong to both:

- **Smooth and resolution-independent.** Vector (SVG) or rendered at twice the size it is shown, then scaled by the
  browser. Never `image-rendering: pixelated`, never whole-pixel snapping (`round()` sizing), never dithering,
  never 1-pixel outlines.
- **Light from the upper left**, one soft key and a cool rim, as on the campuses. Depth comes from two or three
  tones of one colour (lit, base, shaded), not from black outlines.
- **The palette stays**: `src/render/palette.ts` is still the source of colours (as hex: `PALETTE[key]`), so the
  interface keeps its hues: power is yellow, compute cyan, research violet, safety blue, money gold, and so on.
  The pixel icons' colours tell you which hue each subject has.
- **Readable first.** Most icons are shown at 16–20 px and portraits at 40–64 px (CSS pixels) on a dark panel.
  A shape that does not read at that size is wrong, however nice it is large.

## The pieces

| Piece | Becomes | Shown at |
|---|---|---|
| Portraits (advisors, Bit, CEOs, delegates, governors, successors, rival AIs) | Busts rendered live in 3D from the same look data, with the five moods and the four ages | 40 px in lists, 64 px where someone speaks, up to 120 px |
| Interface icons (`ui/icons.ts`, 123 of them) | SVG, 24×24 grid, two or three tones | 16–20 px, 27 px in headers |
| Dock icons (`ui/dockIcons.ts`) | SVG, 32×32 grid, a little richer than the small ones | ~27–36 px |
| Achievement medals | SVG | 24–48 px |
| Logo | A 3D-rendered wordmark (extruded, bevelled, lit), transparent background | 363–484 px wide on the title screen, the website hero, the boot screen, the social card |
| App icon, favicon | The game's own 3D globe on a dark space tile | 16 px to 1024 px |
| Type I end card | A 3D picture of the Sun, the swarm and the Earth with the run's numbers set in the interface's type | 1920×1080 |
| Home-site previews (New company) | A small 3D view of the place on the globe | 72×40 px and up |

## Rules for whoever builds one

- Keep the public names and function signatures (`iconUrl(name)`, `portraitUrl(id, mood, bitGen, age)`,
  `logoUrl()`…) unless a caller really needs something else: dozens of panels call them.
- Portrait and icon functions are called synchronously while a panel renders. Return a URL at once and cache it.
- The sim and the tests run in Node without a browser: look data and anything a test needs must import without
  touching `document`, `window` or WebGL at module load.
- Era palettes: the old art was re-tinted per era. The new art does not have to be; if it reads the palette at
  all, read the base colours.
- Check the result where players see it: the title screen, an event card (the pop-up with choices), the dock, a
  panel list, the top bar, at 100% and 130% interface size.
