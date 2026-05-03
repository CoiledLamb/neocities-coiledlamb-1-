// Shared map shell — ports the TLH route-map.js panel verbatim:
//   • ring polygon as the playable interior (clipPath-masked terrain)
//   • ring road segments between adjacent nodes (stage-tinted)
//   • 12 nodes with greek glyphs + labels
//   • courier dot animating around the ring
//   • route footer with x/y coord + next-dest readout
// All terrain renderers slot in as <children> behind the road.

const ns = 'http://www.w3.org/2000/svg';

// ── Ring road ────────────────────────────────────────────────
// `treatment` switches the road styling for the readability study:
//   'default' — original thin teal stroke
//   'bright'  — thicker, brighter (close to accent)
//   'casing'  — thin dark halo + bright core (always-on contrast)
function RingRoad({ treatment = 'default' }) {
  const segs = EDGES.map(([a, b]) => {
    const na = NODE_BY_ID[a], nb = NODE_BY_ID[b];
    return { x1: na.x, y1: na.y, x2: nb.x, y2: nb.y };
  });
  if (treatment === 'bright') {
    return (
      <g pointerEvents="none">
        {segs.map((s, i) => (
          <line key={i} {...s}
                stroke={TLH.textSec}
                strokeWidth="2.4"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.55))' }}/>
        ))}
      </g>
    );
  }
  if (treatment === 'casing') {
    return (
      <g pointerEvents="none">
        {/* dark casing halo first */}
        {segs.map((s, i) => (
          <line key={`c${i}`} {...s}
                stroke="#000"
                strokeOpacity="0.7"
                strokeWidth="3.6"
                strokeLinecap="round"/>
        ))}
        {/* light core */}
        {segs.map((s, i) => (
          <line key={`r${i}`} {...s}
                stroke={TLH.text}
                strokeWidth="1.6"
                strokeLinecap="round"/>
        ))}
      </g>
    );
  }
  // default
  return (
    <g pointerEvents="none">
      {segs.map((s, i) => (
        <line key={i} {...s}
              stroke="#2a5c5a"
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.55))' }}/>
      ))}
    </g>
  );
}

// ── Nodes ────────────────────────────────────────────────────
// Ports the actual game system from route-map.js: per-node stage drives
// circle size/fill/stroke, glyph fill, and label fill via palette tokens.
// `isCurrent = (n.id === fromId || n.id === toId)` — both endpoints of
// the edge the courier is currently on light up cyan.
//
// Stage ramp (game-faithful, route-map.js lines 610–660):
//   current  : r=10, fill=#0b2e2d, stroke=accent, stroke-width=1.8,
//              glyph=accent, label=accent
//   stage 3  : fill=#1e5554, stroke=#3a6a68, glyph=textMid,  label=textDim
//   stage 2  : fill=#1a3f3e, stroke=#2f5e5c, glyph=textDim,  label=textFaint
//   stage 1  : fill=#142e2d, stroke=#1e5554, glyph=textFaint,label=rule
//
// Every node in this exploration is treated as stage 3 (visited+confirmed)
// so terrain doesn't visually fight a sea of stage-1 dim-rule labels —
// users will see a working game state, not a fresh save.
function NodesLayer({ onHover, courierProgress = 0 }) {
  // Recreate the courier's edge index so we know fromId/toId.
  const total = EDGES.length;
  const phase = courierProgress * total;
  const ei = Math.floor(phase) % total;
  const [fromId, toId] = EDGES[ei];

  return (
    <g>
      {NODES.map(n => {
        const isUpper = n.y < RING_CY;
        const labelY = isUpper ? n.y - 14 : n.y + 22;
        const isCurrent = (n.id === fromId || n.id === toId);
        // Treat all non-current nodes as stage 3 so the map reads as a
        // working game in progress, not a fresh save.
        const stage = 3;

        const r       = isCurrent ? 10 : 8;
        // Game uses #1e5554 for stage-3 fill — too close to contour-tinted
        // ground. Deepen to panelDarker so the circle reads as a "well"
        // cut into terrain. Stroke stays at game's #3a6a68 so the rim still
        // reads in-palette.
        const cFill   = isCurrent ? '#0b2e2d' : TLH.panelDarker;
        const cStroke = isCurrent ? TLH.accent : '#3a6a68';
        const cWidth  = isCurrent ? 1.8 : 1.2;
        const glyphFill = isCurrent ? TLH.accent : TLH.textMid;
        const labelFill = isCurrent ? TLH.accent : TLH.textDim;

        return (
          <g key={n.id}
             onMouseEnter={() => onHover && onHover(n)}
             onMouseLeave={() => onHover && onHover(null)}
             style={{ cursor: 'pointer' }}>
            <circle cx={n.x} cy={n.y} r={r}
                    fill={cFill}
                    stroke={cStroke}
                    strokeWidth={cWidth}/>
            <text x={n.x} y={n.y}
                  fontFamily="'Source Code Pro', ui-monospace, monospace"
                  fontSize="13" fontWeight="700"
                  fill={glyphFill}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ pointerEvents: 'none' }}>
              {n.g}
            </text>
            <text x={n.x}
                  y={labelY}
                  fontFamily="'Source Code Pro', ui-monospace, monospace"
                  fontSize="11"
                  fill={labelFill}
                  textAnchor="middle"
                  fontWeight={isCurrent ? 700 : 400}
                  style={{ pointerEvents: 'none' }}>
              {n.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ── Courier dot ──────────────────────────────────────────────
// Walks the EDGES array in order at a slow constant pace so each
// card feels alive without distracting from the terrain reads.
function Courier({ progress }) {
  const total = EDGES.length;
  const phase = progress * total;
  const ei = Math.floor(phase) % total;
  const t  = phase - Math.floor(phase);
  const [a, b] = EDGES[ei];
  const na = NODE_BY_ID[a], nb = NODE_BY_ID[b];
  const x = na.x + (nb.x - na.x) * t;
  const y = na.y + (nb.y - na.y) * t;
  return (
    <g pointerEvents="none">
      {/* sonar pulse */}
      <circle cx={x} cy={y} r="3" fill={TLH.accent} opacity="0.30">
        <animate attributeName="r" from="2.5" to="9" dur="1.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.45" to="0" dur="1.6s" repeatCount="indefinite"/>
      </circle>
      {/* current-pos dot — matches route-map.js #routeDot */}
      <circle cx={x} cy={y} r="3.4"
              fill={TLH.textBright}
              stroke={TLH.accent}
              strokeWidth="1.3"/>
    </g>
  );
}

// ── Compass + scale (chrome that reads as "this is a real map") ─
function MapChrome() {
  return (
    <g pointerEvents="none" fontFamily="'Source Code Pro', ui-monospace, monospace">
      {/* north arrow, top-left */}
      <g transform="translate(28, 32)">
        <line x1="0" y1="0" x2="0" y2="-12" stroke={TLH.textDim} strokeWidth="0.8"/>
        <polygon points="0,-15 -3,-9 3,-9" fill={TLH.textDim}/>
        <text x="0" y="-18" fontSize="7" fill={TLH.textDim} textAnchor="middle">N</text>
      </g>
      {/* scale bar, bottom-left */}
      <g transform="translate(20, 380)">
        <line x1="0" y1="0" x2="60" y2="0" stroke={TLH.textDim} strokeWidth="0.8"/>
        <line x1="0" y1="-2" x2="0" y2="2" stroke={TLH.textDim} strokeWidth="0.8"/>
        <line x1="30" y1="-2" x2="30" y2="2" stroke={TLH.textDim} strokeWidth="0.8"/>
        <line x1="60" y1="-2" x2="60" y2="2" stroke={TLH.textDim} strokeWidth="0.8"/>
        <text x="0" y="10" fontSize="6.5" fill={TLH.textDim}>0</text>
        <text x="60" y="10" fontSize="6.5" fill={TLH.textDim}>2km</text>
      </g>
    </g>
  );
}

// ── Footer (matches .route-footer in the-long-haul.css) ─────────
function RouteFooter({ progress }) {
  const total = EDGES.length;
  const phase = progress * total;
  const ei = Math.floor(phase) % total;
  const t  = phase - Math.floor(phase);
  const [a, b] = EDGES[ei];
  const na = NODE_BY_ID[a], nb = NODE_BY_ID[b];
  const x = Math.round(na.x + (nb.x - na.x) * t);
  const y = Math.round(na.y + (nb.y - na.y) * t);
  const segLen = Math.hypot(nb.x - na.x, nb.y - na.y);
  const remaining = Math.round((1 - t) * segLen / 30 * 1000); // 30 svg-units / km
  const dest = NODE_BY_ID[b].label;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '4px 8px 3px',
      fontSize: 9, fontFamily: "'Source Code Pro', ui-monospace, monospace",
      color: TLH.textSec, letterSpacing: '0.03em', opacity: 0.9,
      borderTop: `1px solid ${TLH.rule}`, background: TLH.panelDark,
    }}>
      <div>
        <span style={{ opacity: 0.5, marginRight: 3 }}>x:</span>
        <span style={{ color: TLH.accent, fontWeight: 700 }}>{x}</span>
        <span style={{ opacity: 0.5, margin: '0 3px 0 6px' }}>y:</span>
        <span style={{ color: TLH.accent, fontWeight: 700 }}>{y}</span>
      </div>
      <div>
        <span style={{ opacity: 0.5, marginRight: 3 }}>→</span>
        <span style={{ color: TLH.accent, fontWeight: 700 }}>{dest}</span>
        <span style={{ color: TLH.accent, fontWeight: 700, marginLeft: 6 }}>{remaining}m</span>
      </div>
    </div>
  );
}

// ── Hydrography overlay ──────────────────────────────────────
// Draws the lake fill, river, and tributary streams on top of the
// terrain raster. Lives between terrain and ring chrome.
//
// Palette stays in the muted-teal range — water is a tone DARKER
// than the basin so it reads as recessed, with a thin slightly
// lighter shoreline. No accent-cyan; that's reserved for UI.
function Hydrography({ palette = 'normal', lakeShape = 'oval', showLines = true, showLake = true }) {
  // Water reads LIGHTER than surrounding terrain (real topo convention —
  // reservoirs on USGS quads are pale blue/cyan, not black). We pull
  // from the muted teal range but step lighter than basin.
  const water     = '#5a9a98';   // light teal, brighter than terrain
  const waterLine = '#3a6a68';
  const bank      = '#1a4544';
  const damStone  = '#4a7a78';
  const lakePath = lakeShape === 'lobed' ? LAKE_PATH_D_LOBED
                 : lakeShape === 'dendritic' ? LAKE_PATH_D_DENDRITIC
                 : LAKE_PATH_D;
  return (
    <g pointerEvents="none">
      {/* ── lake — solid fill, no stroke ──────────────────── */}
      {showLake && <path d={lakePath} fill={water}/>}
      {showLines && <>
      {/* ── river ──────────────────────────────────────────── */}
      <path d={RIVER_PATH_D} fill="none" stroke={bank}
            strokeWidth="3.5" strokeOpacity="0.55"
            strokeLinecap="round" strokeLinejoin="round"/>
      <path d={RIVER_PATH_D} fill="none" stroke={waterLine}
            strokeWidth="1.2" strokeOpacity="0.85"
            strokeLinecap="round" strokeLinejoin="round"/>
      {/* ── tributary streams ──────────────────────────────── */}
      {STREAM_PATH_DS.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke={bank}
                strokeWidth="1.8" strokeOpacity="0.4"
                strokeLinecap="round" strokeLinejoin="round"/>
          <path d={d} fill="none" stroke={waterLine}
                strokeWidth="0.6" strokeOpacity="0.75"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={i === 1 ? "3 2" : null}/>
        </g>
      ))}
      </>}
    </g>
  );
}

// ── Map shell ────────────────────────────────────────────────
// Terrain spans the FULL viewBox — extending past the ring road
// gives the impression that the route is just a survey loop carved
// through a much larger landscape. The ring polygon then reads as
// "the patrolled circuit" rather than "the world boundary."
//
// Outside the ring, terrain is dimmed slightly + an inner shadow
// hugs the polygon boundary, so the inhabited interior still pops.
function MapShell({
  children, courierProgress = 0, clipId = 'ringClip',
  hydroPalette = 'normal',
  roadTreatment = 'default',
  interior = 'normal',  // 'normal' | 'dim' | 'quiet'
  lakeShape = 'oval',
  desertHatch = false,
  hydroLines = true,
  showLake = true,
}) {
  const [hover, setHover] = React.useState(null);
  const polyPts = EDGE_ORDER.map(id => `${NODE_BY_ID[id].x},${NODE_BY_ID[id].y}`).join(' ');
  // "Outside" mask = full rect minus the ring polygon (even-odd fill)
  const outsidePath =
    `M0,0 L${VB_W},0 L${VB_W},${VB_H} L0,${VB_H} Z ` +
    `M${EDGE_ORDER.map(id => `${NODE_BY_ID[id].x},${NODE_BY_ID[id].y}`).join(' L')} Z`;
  const insideClipId = `${clipId}-inside`;
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`}
         width="100%" height="100%"
         style={{ display: 'block', background: TLH.panel }}>
      <defs>
        <clipPath id={`${clipId}-outside`} clipPathUnits="userSpaceOnUse">
          <path d={outsidePath} fillRule="evenodd"/>
        </clipPath>
        <clipPath id={insideClipId} clipPathUnits="userSpaceOnUse">
          <polygon points={polyPts}/>
        </clipPath>
        <radialGradient id={`${clipId}-vignette`} cx="50%" cy="50%" r="55%">
          <stop offset="70%" stopColor="#000" stopOpacity="0"/>
          <stop offset="100%" stopColor="#000" stopOpacity="0.35"/>
        </radialGradient>
      </defs>

      {/* full-canvas terrain */}
      <g>{children}</g>

      {/* desert dot-hatch overlay — sand stippling NW */}
      {desertHatch && <DesertHatch/>}

      {/* hydrography — lake, river, dam, streams */}
      <Hydrography lakeShape={lakeShape} showLines={hydroLines} showLake={showLake}/>

      {/* INTERIOR treatment — apply over terrain, before chrome.
          'dim'   = pull interior toward panel color
          'quiet' = lower interior opacity wash so colors mute */}
      {interior === 'dim' && (
        <g clipPath={`url(#${insideClipId})`} pointerEvents="none">
          <rect x="0" y="0" width={VB_W} height={VB_H}
                fill={TLH.panel} opacity="0.55"/>
        </g>
      )}
      {interior === 'quiet' && (
        <g clipPath={`url(#${insideClipId})`} pointerEvents="none">
          <rect x="0" y="0" width={VB_W} height={VB_H}
                fill={TLH.panelDark} opacity="0.4"/>
        </g>
      )}

      {/* dim the area outside the ring so the loop reads as the focus */}
      <g clipPath={`url(#${clipId}-outside)`} pointerEvents="none">
        <rect x="0" y="0" width={VB_W} height={VB_H}
              fill={TLH.panelDarker} opacity="0.45"/>
        <rect x="0" y="0" width={VB_W} height={VB_H}
              fill="url(#hatch)" opacity="0.18"/>
      </g>

      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"
                 patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={TLH.textFaint} strokeWidth="0.35"/>
        </pattern>
      </defs>

      <polygon points={polyPts} fill="none"
               stroke={TLH.textSec}
               strokeWidth="0.7"
               strokeOpacity="0.55"
               strokeDasharray="3 3"
               pointerEvents="none"/>

      <rect x="0" y="0" width={VB_W} height={VB_H}
            fill={`url(#${clipId}-vignette)`} pointerEvents="none"/>

      <RingRoad treatment={roadTreatment}/>
      <NodesLayer onHover={setHover} courierProgress={courierProgress}/>
      <Courier progress={courierProgress}/>
    </svg>
  );
}

// ── Desert hatch overlay ─────────────────────────────────────
// Stippled dot pattern over the NW desert basin. Cartographic
// convention for sand: scatter of small dots, denser in the center.
// Generated with deterministic jittered grid sampling so it stays
// stable across renders.
function DesertHatch() {
  const dots = React.useMemo(() => {
    const out = [];
    // Desert anchor NW(90,110), influence ~80. Sample a grid of
    // candidate points; keep with falloff probability so dots
    // cluster toward the center and thin at the edges.
    const cx = 90, cy = 110, R = 90;
    const step = 5;  // base spacing
    let seed = 1;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let y = cy - R; y <= cy + R; y += step) {
      for (let x = cx - R; x <= cx + R; x += step) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > R) continue;
        // Density: full near center, fading at edge
        const density = 1 - (d / R) * 0.85;
        if (rand() > density) continue;
        // Jitter
        const jx = x + (rand() - 0.5) * step * 0.9;
        const jy = y + (rand() - 0.5) * step * 0.9;
        // Two dot sizes for visual variety (mostly small)
        const r = rand() < 0.18 ? 0.65 : 0.4;
        out.push({ x: jx, y: jy, r });
      }
    }
    return out;
  }, []);
  return (
    <g pointerEvents="none" opacity="0.7">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.r}
                fill={TLH.textDim}/>
      ))}
    </g>
  );
}

Object.assign(window, {
  RingRoad, NodesLayer, Courier, MapChrome, RouteFooter, MapShell, Hydrography, DesertHatch,
});
