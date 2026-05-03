# Handoff: Route Map — Topographic Rendering (Oval Stepped variant)

## Overview

This is the topographic rendering for the route-map panel in **The Long Haul** (TLH). It replaces the existing flat/biome-tinted terrain with an **8-band stepped hypsometric tint** ("USGS quad" look), keeping all existing gameplay coordinates, ring-road geometry, nodes, and courier behavior intact.

The chosen variant locks in:

- **Lake shape: oval** (rounded blob in the SW)
- **Terrain rendering: stepped hypsometric tint, 8 bands** — flat-color elevation rectangles, no contour lines
- **Hydrography polygon overlay: OFF** — the heightmap depression itself reads as the lake; no redundant blue lake polygon on top
- **Hydro line overlays (river / streams): OFF** — same reason; the carve in the heightmap reads as the channel
- **Desert dot-hatch: ON** — stippled dots over the NW desert basin (cartographic sand convention)

## About the Design Files

The files in `src/` are **design references created in HTML/JSX as a prototype** — they show the intended look and behavior, not production code to copy directly. The task is to **recreate this design in the TLH game's existing render environment** (vanilla JS rendering into the existing `route-map.js` panel), using the established patterns there. The React/JSX is just a fast iteration scaffold; the production implementation should slot into the existing canvas/SVG rendering loop in `tlh/js/render/route-map.js`.

**Critical: gameplay coordinates and ring layout are UNCHANGED.** The 12 nodes, edge list, ring polygon, and viewBox all match `route-map.js` exactly. Only the terrain layer underneath the ring is new.

## Fidelity

**High-fidelity (hifi).** Pixel-perfect intent. All colors, the 8-band hypsometric ramp, heightmap dimensions, and palette values are final. The developer should reproduce these exactly.

## File map (in `src/`)

| File | What it contains |
|---|---|
| `map-data.jsx` | The shared data layer: TLH palette, viewBox + ring layout, NODES/EDGES (verbatim from `route-map.js`), shoreline + river + stream geometry, hypsometric color stops, and the **heightmap builder** (`buildHeightmap()` produces a 200×200 Float32Array of normalized elevations). The whole rendering system reads from this. |
| `topo-shared.jsx` | Render components shared across all terrain variants: `MapShell` (the SVG root with the ring clipPath + chrome), `RingRoad`, `NodesLayer`, `Courier`, `Hydrography`, `DesertHatch`, `RouteFooter`. |
| `topo-variations.jsx` | Terrain renderers — only `TerrainStepped` is used by the chosen variant. It bakes the 200×200 heightmap to a PNG via `<canvas>`, quantizing each cell into one of 8 elevation bands and looking up the band-center color from the hypsometric ramp. |
| `map-card.jsx` | The card wrapper: titled panel chrome (`// route` + clock), MapShell with the chosen terrain slotted in, RouteFooter. |

## What to Build

A drop-in replacement for the terrain layer of the existing route-map panel.

### Render order (back to front)

1. **Background** — panel color `#0d3533`
2. **Terrain raster** — full viewBox (400×400), the 200×200 stepped-hypso PNG scaled to fit
3. **Desert dot-hatch** — stippled dots over NW basin (deterministic, jittered grid)
4. **Hydrography overlay** — *for the chosen variant: nothing* (no lake polygon, no river/stream lines)
5. **Outside-ring dim** — `panelDarker` @ 0.45 opacity + diagonal hatch @ 0.18 opacity, masked to area outside ring polygon
6. **Vignette** — radial gradient, transparent center → black 0.35 at corners
7. **Ring polygon outline** — `textSec` (#7aa8a6), 0.7px, dashed `3 3`, 0.55 opacity
8. **Ring road segments** — `#2a5c5a`, 1.6px, round caps, drop-shadow `0 0 2px rgba(0,0,0,0.55)`
9. **Nodes layer** — circles + greek glyph + label per node (see Nodes spec below)
10. **Courier** — sonar pulse + bright dot at current position along edge

## Heightmap

200×200 Float32Array of normalized elevation values in [0..1].

Built once at module load via `buildHeightmap(LAKE_SHORE_OVAL)`. The builder samples world coordinates over the 400×400 viewBox at 2px steps and computes elevation by combining:

- **Base drift**: low-frequency fractal noise (`fbm(x*0.012, y*0.012, 4)`) centered around 0.36
- **Mountain massif**: distance-to-ridge falloff over `NAT_MOUNTAIN_RIDGE` polyline, plus 4 discrete peaks (`NAT_PEAKS`) stamped as small radial gaussians along the ridge — coefficient 0.40 so peaks have headroom; spine ridge-noise at frequency 0.075 for crinklier detail
- **Plateau / valley fields**: low-amp fbm in NE/SE quadrants
- **Domain warp**: feature-distorting offset on lookup coords so contours wobble instead of forming circles
- **River carve**: -0.32 along `RIVER_PATH_D` with banks
- **Stream carves**: -0.18 along each tributary
- **Lake basin**: flatten cells inside `LAKE_SHORE_OVAL` polygon to elevation 0.04 (the lowest band)
- **High-frequency texture**: 0.07 × fbm at frequency 0.13

All the lake-shape variants are now removed from the chosen variant; only `LAKE_SHORE_OVAL` (the default `LAKE_SHORE` in `map-data.jsx`) is needed for production.

## Stepped hypsometric rendering

For each cell `(x, y)` in the 200×200 heightmap:

1. `band = clamp(floor(elevation * 8), 0, 7)`
2. `tCenter = (band + 0.5) / 8`
3. Look up color via `hypsoSample(tCenter)` against `HYPSO_STOPS`

Then draw the 200×200 result into a canvas, export to PNG, and place that as a `<image>` filling the 400×400 viewBox.

### HYPSO_STOPS (the elevation color ramp)

| t | hex | role |
|---|---|---|
| 0.00 | `#0b2e2d` | basin / water surface (deepest) |
| 0.14 | `#143f3d` | low wetlands |
| 0.28 | `#2a5c5a` | floodplain |
| 0.42 | `#3a6a68` | rolling lowland |
| 0.56 | `#4a7a78` | midslope |
| 0.70 | `#5f9492` | highland |
| 0.82 | `#7aa8a6` | upper ridge |
| 0.92 | `#79bac5` | snowline |
| 1.00 | `#77bfcf` | summit |

`hypsoSample(t)` lerps between adjacent stops in RGB — but for stepped rendering we always sample band centers (`(band + 0.5) / 8`), so the lerp falls naturally on a fixed point inside one stop interval and each band reads as one flat color across all its cells.

## Components

### Panel frame (the card)

- Width: 460px, Height: 500px (the canvas frame; SVG inside scales to fit)
- Background: `#0d3533` (TLH `panel`)
- Border: 1px solid `#1e5554` (TLH `rule`)
- Font: `'Source Code Pro', ui-monospace, monospace`, color `#b1c9c3`

#### Header strip

- Background: `#0b2e2d` (`panelDark`), 1px bottom border `rule`
- Padding: `4px 8px 3px`
- Layout: flex row, space-between, baseline-aligned
- Left: `// route` — color `#3a6a68` (`textDim`), 9px, lowercase, letter-spacing 0.08em
- Right: clock `MM:SS` — color `#77bfcf` (`accent`), 9px, weight 700, letter-spacing 0.04em, opacity 0.85

#### Map area

- Fills remaining height
- Background: `#0d3533`
- Holds the SVG (see Map Shell below)

#### Footer strip

- Background: `#0b2e2d` (`panelDark`), 1px top border `rule`
- Padding: `4px 8px 3px`
- Layout: flex row, space-between, baseline-aligned
- Font: 9px, color `#7aa8a6` (`textSec`), letter-spacing 0.03em, opacity 0.9
- Left: `x: <X> y: <Y>` — labels at opacity 0.5; values in `accent`, weight 700
- Right: `→ <DEST_LABEL> <REMAINING>m` — arrow at opacity 0.5; dest + meters in `accent`, weight 700
- `<REMAINING>` calc: `round((1 - t) * segLen / 30 * 1000)` where 30 svg-units = 1km

### Map Shell (SVG)

- viewBox: `0 0 400 400`
- 100% × 100%, `display: block`, background `panel`
- Defs:
  - `clipPath#ringClip-outside` — full rect minus ring polygon (even-odd fill rule)
  - `clipPath#ringClip-inside` — ring polygon
  - `radialGradient#ringClip-vignette` — cx/cy 50%, r 55%, stops: 70% transparent → 100% `#000` @ 0.35
  - `pattern#hatch` — 6×6, rotated 35°, single vertical line `#2a5c5a` (`textFaint`) @ 0.35 width

### Ring road

For each edge `(a, b)` in `EDGES`, draw a line from `NODE_BY_ID[a]` to `NODE_BY_ID[b]`:

- Stroke: `#2a5c5a` (`textFaint`)
- Stroke width: 1.6
- Stroke linecap: round
- Filter: `drop-shadow(0 0 2px rgba(0,0,0,0.55))`

### Nodes (12 total)

For each node, the rendering depends on whether it's a **current edge endpoint** (the courier is currently on edge `[fromId, toId]`).

For this design, treat every non-current node as **stage 3** (visited+confirmed) so the map reads as a working game in progress.

**Current node** (n.id === fromId || n.id === toId):
- Circle: r=10, fill `#0b2e2d`, stroke `#77bfcf` (`accent`), stroke-width 1.8
- Greek glyph: 13px, weight 700, fill `accent`, centered
- Label: 11px, weight 700, fill `accent`, 14px above (if upper) or 22px below (if lower)

**Stage 3 node** (everyone else):
- Circle: r=8, fill `#081f1e` (`panelDarker`), stroke `#3a6a68`, stroke-width 1.2
- Greek glyph: 13px, weight 700, fill `#4a7a78` (`textMid`)
- Label: 11px, weight 400, fill `#3a6a68` (`textDim`)

(`fill = panelDarker` on non-current nodes is intentional and DIFFERENT from the game's stage-3 `#1e5554` — deepening to `panelDarker` makes the circle read as a "well" cut into the contour-tinted ground rather than a floating chip the same color as midslope terrain.)

Label `y`:
- If `n.y < 200` (upper half): label at `n.y - 14`
- Else (lower half): label at `n.y + 22`

### Courier

Walks `EDGES` array in order at constant pace.

- `total = EDGES.length`
- `phase = courierProgress * total` (where `courierProgress` is the global animation `t` in [0..1], looping every 60s)
- `ei = floor(phase) % total` — current edge index
- `t = phase - floor(phase)` — interpolation 0..1 along the segment
- `[a, b] = EDGES[ei]`
- Position: `(na.x + (nb.x - na.x) * t, na.y + (nb.y - na.y) * t)`

Drawn as:
- **Sonar pulse**: circle at position, fill `accent`, opacity 0.30, with two `<animate>` elements:
  - `r`: from 2.5 to 9, dur 1.6s, repeatCount indefinite
  - `opacity`: from 0.45 to 0, dur 1.6s, repeatCount indefinite
- **Position dot**: r=3.4, fill `#e0eeec` (`textBright`), stroke `accent`, stroke-width 1.3

### Desert dot-hatch (NW basin)

Stippled dot pattern, generated deterministically at first render and reused.

- Anchor: cx=90, cy=110, R=90 (sample radius)
- Step: 5px grid; jitter ±45% of step
- Density falloff: `1 - (d/R) * 0.85`
- Reject candidates if `random() > density`
- Dot radius: 0.65 with 18% probability, else 0.4
- Color: `textDim` (`#3a6a68`)
- Group opacity: 0.7
- Use a seeded PRNG (`seed = (seed * 9301 + 49297) % 233280`, start seed=1) so it's stable across renders

### Outside-ring dim

Two stacked rects, both clipped to `ringClip-outside`:

1. `fill = panelDarker (#081f1e)`, opacity 0.45
2. `fill = url(#hatch)`, opacity 0.18

### Ring polygon outline

`<polygon>` of all 12 nodes, fill none:
- Stroke: `#7aa8a6` (`textSec`)
- Stroke-width: 0.7
- Stroke-opacity: 0.55
- Stroke-dasharray: `3 3`

### Vignette

Full-rect `<rect>` filled with `url(#ringClip-vignette)` — applied AFTER ring outline, BEFORE ring road + nodes + courier.

## Interactions & Behavior

- **No click handlers in the design.** The original game's node click/hover behavior (used for routing) should be preserved from `route-map.js` — this redesign only changes the visual layer, not interaction.
- **Courier animation**: a single requestAnimationFrame loop advances `t` from 0..1 over 60s, looping. Updating `t` rerenders the courier dot, the current-edge highlighting on nodes, and the footer x/y/dest readout.
- **Clock**: derived from `t` as `MM:SS` (where `s = floor(t * 60 * 60) % 3600`). It's a stylized in-game clock, not real wall-time.

## State

Two values drive the entire panel:

- `t` — number in [0..1], advances continuously, drives courier position + clock + footer
- (existing game state) the routing/edge state from `route-map.js` — which edge the courier is on. In this design it's derived from `t` directly; in production it should come from the game state machine and `t` only animates the lerp between segment endpoints.

No fetched data, no async state.

## Design Tokens (TLH palette)

```
shellBg      #155352
panel        #0d3533
panelDark    #0b2e2d
panelDarker  #081f1e
rule         #1e5554
textFaint    #2a5c5a
textDim      #3a6a68
textMid      #4a7a78
textSec      #7aa8a6
text         #b1c9c3
textBright   #e0eeec
accent       #77bfcf
accentDeep   #40a4b9
warn         #9d78d4
warnDeep     #7a58a4
crit         #da8bda
```

These match `:root` in `the-long-haul.css` and are imported via `const TLH = { ... }` in `map-data.jsx`.

### Typography

- Family: `'Source Code Pro', ui-monospace, monospace`
- Weights used: 400 (regular), 700 (bold)
- Sizes used: 6.5px (scale ticks), 7px (compass N), 9px (panel chrome — header + footer), 11px (node labels, scale unit), 13px (greek glyph)

### Spacing

- Header / footer padding: `4px 8px 3px`
- Node label vertical offset: ±14px upper, +22px lower

## Assets

- **Font**: Source Code Pro (Google Fonts) — already loaded in TLH
- **No image assets**. All terrain is procedurally generated to a `<canvas>` then served as a data-URL PNG. All other rendering is SVG primitives.

## Files in this bundle

```
design_handoff_route_map_topo/
├── README.md                          ← this file
├── Reference - Oval Stepped.html      ← runnable preview of the chosen variant
└── src/
    ├── map-data.jsx                   ← palette, geometry, heightmap, hypso ramp
    ├── topo-shared.jsx                ← MapShell, RingRoad, NodesLayer, Courier, etc.
    ├── topo-variations.jsx            ← TerrainStepped (and unused alternates)
    └── map-card.jsx                   ← panel chrome wrapper
```

To preview, open `Reference - Oval Stepped.html` in a modern browser.

## Notes for the developer

- `topo-variations.jsx` includes `TerrainSmooth`, `TerrainContour`, `TerrainHillshade`, and `bakeHillshade` — the chosen variant is **only** `TerrainStepped`. The others can be deleted on import; they're left in the bundle in case you want to reference the contour-line algorithm in the future.
- `map-data.jsx` exports `HEIGHTMAP_LOBED` and `HEIGHTMAP_DENDRITIC` (alternate lake-shape heightmaps explored during design). For production these can be removed; only the default `HEIGHTMAP` (oval) is needed.
- The dendritic shoreline builder (`buildDendriticShoreline`) and `LAKE_SHORE_DENDRITIC` / `LAKE_PATH_D_DENDRITIC` / `LAKE_SHORE_LOBED` / `LAKE_PATH_D_LOBED` are similarly unused — safe to remove.
- The `lakeShape` prop on `MapShell` and `MapCard` is no longer needed; hardcode to "oval" or remove.
- `Hydrography` is still imported but called with `showLines={false}` and `showLake={false}` — effectively a no-op. Consider just dropping the call.
- All 12 nodes' positions, IDs, glyphs, and labels (`NODES`, `NODE_BY_ID`, `EDGES`, `EDGE_ORDER` in `map-data.jsx`) are **byte-identical** to the corresponding values in `tlh/js/render/route-map.js`. Use the game's authoritative copy in production; the JSX copy is just a working duplicate for the prototype.
