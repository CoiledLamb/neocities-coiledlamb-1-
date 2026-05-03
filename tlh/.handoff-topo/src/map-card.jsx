// Per-variation card. Wraps MapShell + a chosen terrain renderer
// + a small footer caption with notes about the technique.

function MapCard({ title, blurb, terrain, hydroPalette, roadTreatment, interior, lakeShape = 'oval', desertHatch = false, hydroLines = true, showLake = true }) {
  // Animate courier slowly along the route so it feels alive
  const [t, setT] = React.useState(0.55);
  React.useEffect(() => {
    let raf, start = performance.now();
    const tick = (now) => {
      const dt = (now - start) / 1000;
      // 60s loop, starting at 0.55 to match site state
      const phase = ((dt / 60) + 0.55) % 1;
      setT(phase);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Stable in-game clock readout, ticks once per second of card-life.
  // Format mm:ss like the route-clock; we don't need to mirror world time.
  const clock = React.useMemo(() => {
    const s = Math.floor(t * 60 * 60) % 3600;
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [t]);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: TLH.panel,
      fontFamily: "'Source Code Pro', ui-monospace, monospace",
      color: TLH.text,
      border: `1px solid ${TLH.rule}`,
      boxSizing: 'border-box',
    }}>
      {/* panel title — game-faithful .tlh-ptitle.route-ptitle:
          `// route` left (dim, lowercase, 9px, 0.08em tracking)
          clock right (accent, 9px, 0.04em tracking)
          frame-matched to footer: panelDark bg, rule border-bottom */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '4px 8px 3px',
        fontSize: 9,
        fontFamily: "'Source Code Pro', ui-monospace, monospace",
        background: TLH.panelDark,
        borderBottom: `1px solid ${TLH.rule}`,
      }}>
        <span style={{
          color: TLH.textDim,
          letterSpacing: '0.08em',
          textTransform: 'lowercase',
        }}>// route</span>
        <span style={{
          color: TLH.accent,
          fontWeight: 700,
          letterSpacing: '0.04em',
          opacity: 0.85,
        }}>{clock}</span>
      </div>
      {/* the map — fills the card */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: TLH.panel }}>
        <MapShell courierProgress={t}
                  hydroPalette={hydroPalette}
                  roadTreatment={roadTreatment}
                  interior={interior}
                  lakeShape={lakeShape}
                  desertHatch={desertHatch}
                  hydroLines={hydroLines}
                  showLake={showLake}>
          {terrain}
        </MapShell>
      </div>
      <RouteFooter progress={t}/>
    </div>
  );
}

Object.assign(window, { MapCard });
