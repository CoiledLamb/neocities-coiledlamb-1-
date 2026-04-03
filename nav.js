// ==============================================
// SHARED SIDEBAR NAV — v1
// Set window.NAV_ACTIVE before loading:
//   <script>window.NAV_ACTIVE = 'figures';</script>
//   <script src="nav.js"></script>
// ==============================================
(function () {
  const NAV = [
    {
      key: 'artwork',
      label: 'Artwork',
      href: 'artwork.html',
      children: [
        { key: 'figures', label: 'Figures',  href: 'figures.html' },
        { key: 'hands',   label: 'Hands',    href: 'hands.html'   },
        { key: 'nsfw',    label: 'NSFW',     href: 'nsfw.html',   badge: '18+' },
      ]
    },
    {
      key: 'toys',
      label: 'Toys',
      href: 'toys.html',
      children: [
        { key: 'oilslick', label: 'Oilslick Labs', href: 'oilslick-lab.html' },
      ]
    },
  ];

  const TRACKS = [
    { name: "pilgrim's path", artist: 'craigory ham', duration: '4:07' },
    { name: 'stoic porridge',  artist: 'craigory ham', duration: '5:29' },
    { name: 'onward',          artist: 'craigory ham', duration: '5:56' },
    { name: 'drifter',         artist: 'duster',       duration: '3:41' },
  ];

  const OIL_GRADIENT = 'linear-gradient(90deg,#40a4b9 0%,#77bfcf 18%,#9d78d4 38%,#da8bda 54%,#9d78d4 70%,#77bfcf 85%,#40a4b9 100%)';

  // ==============================================
  // SESSION STORAGE — persists volume across pages
  // ==============================================
  const SS_VOL  = 'cl_player_volume';
  const SS_IDX  = 'cl_player_idx';

  function ssGet(k, def) {
    try { const v = sessionStorage.getItem(k); return v !== null ? JSON.parse(v) : def; }
    catch(e) { return def; }
  }
  function ssSet(k, v) {
    try { sessionStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
  }

  // UI state — no audio here, everything is driven by frame messages
  let uiIdx     = ssGet(SS_IDX, 0);
  let uiPlaying = false;
  let uiLooping = false;
  let uiVolume  = ssGet(SS_VOL, 1.0);

  let npBars    = [];
  let npVisTimer = null;
  let npOilTimer = null;
  let npFrame    = null;   // <iframe> reference
  let npEls      = {};

  // ==============================================
  // IFRAME BRIDGE
  // ==============================================
  function cmd(obj) {
    if (npFrame && npFrame.contentWindow) {
      npFrame.contentWindow.postMessage(obj, '*');
    }
  }

  function onFrameMessage(e) {
    const d = e.data;
    if (!d || !d.evt) return;

    if (d.evt === 'tick') {
      if (npEls.cur)  npEls.cur.textContent  = d.cur;
      if (npEls.dur && d.dur)  npEls.dur.textContent  = d.dur;
      if (npEls.fill) npEls.fill.style.width = d.pct + '%';
      return;
    }

    if (d.evt === 'err') {
      npSetStatus(d.msg); return;
    }

    if (d.evt === 'state') {
      // Sync all UI to frame state
      uiIdx     = d.idx;
      uiPlaying = d.playing;
      uiLooping = d.looping;
      ssSet(SS_IDX, uiIdx);

      if (npEls.name)    npEls.name.textContent    = d.name;
      if (npEls.artist)  npEls.artist.textContent  = d.artist;
      if (npEls.dur)     npEls.dur.textContent     = d.duration;
      if (npEls.fill)    npEls.fill.style.width    = d.pct + '%';
      if (npEls.cur)     npEls.cur.textContent     = d.cur || '0:00';
      if (npEls.playBtn) npEls.playBtn.textContent = d.playing ? '\u25a0' : '\u25b6';
      if (npEls.loopBtn) npEls.loopBtn.classList.toggle('active', d.looping);

      npSetStatus(d.playing ? 'PLAYING....' : 'PAUSED.....');
      npAnimBars(d.playing);
      npRenderTL();
    }
  }

  // ==============================================
  // VISUALISER
  // ==============================================
  function npFmt(s) {
    if (isNaN(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  function npSetStatus(t) { if (npEls.status) npEls.status.textContent = t; }

  function npPaintBars(offset) {
    const pitch = 5, total = npBars.length * pitch;
    npBars.forEach((b, i) => {
      b.style.background         = OIL_GRADIENT;
      b.style.backgroundSize     = total + 'px 100%';
      b.style.backgroundPosition = (-(i * pitch) + offset) + 'px 0';
    });
  }

  function npClearBarPaint() {
    npBars.forEach(b => {
      b.style.background = b.style.backgroundSize = b.style.backgroundPosition = '';
    });
  }

  function npAnimBars(on) {
    clearInterval(npVisTimer);
    cancelAnimationFrame(npOilTimer);
    if (npEls.vis) npEls.vis.classList.toggle('np-vis-active', on);
    if (!on) { npBars.forEach(b => b.style.height = '3px'); npClearBarPaint(); return; }

    npVisTimer = setInterval(() => {
      npBars.forEach(b => { b.style.height = (3 + Math.random() * 10) + 'px'; });
    }, 130);

    const pitch = 5, totalSpan = npBars.length * pitch, duration = 4000;
    let start = null;
    function sweepFrame(ts) {
      if (!start) start = ts;
      const offset = ((ts - start) % duration / duration) * totalSpan;
      npPaintBars(offset);
      npOilTimer = requestAnimationFrame(sweepFrame);
    }
    npOilTimer = requestAnimationFrame(sweepFrame);
  }

  // ==============================================
  // UI ACTIONS — just send commands to the frame
  // ==============================================
  function npToggle()     { cmd(uiPlaying ? { cmd: 'pause' } : { cmd: 'play' }); }
  function npPrev()       { cmd({ cmd: 'prev' }); }
  function npNext()       { cmd({ cmd: 'next' }); }
  function npToggleLoop() { cmd({ cmd: 'loop', value: !uiLooping }); }

  function npSetVolume(v) {
    uiVolume = v;
    ssSet(SS_VOL, v);
    cmd({ cmd: 'volume', value: v });
    if (npEls.volIcon) {
      npEls.volIcon.textContent = v === 0 ? '\u2205' : v < 0.5 ? '\u266a' : '\u266b';
    }
  }

  function npSeek(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    cmd({ cmd: 'seek', ratio: (e.clientX - rect.left) / rect.width });
  }

  function npLoadTrack(i) { cmd({ cmd: 'load', idx: i, play: true }); }

  function npRenderTL() {
    if (!npEls.tracklist) return;
    npEls.tracklist.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const row  = document.createElement('div');
      row.className = 'np-track-item' + (i === uiIdx ? ' playing' : '');
      const idx  = document.createElement('span'); idx.className  = 'np-ti-idx';  idx.textContent  = String(i + 1).padStart(2, '0');
      const name = document.createElement('span'); name.className = 'np-ti-name'; name.textContent = t.name;
      const dur  = document.createElement('span'); dur.className  = 'np-ti-dur';  dur.textContent  = t.duration;
      row.appendChild(idx); row.appendChild(name); row.appendChild(dur);
      row.addEventListener('click', () => npLoadTrack(i));
      npEls.tracklist.appendChild(row);
    });
  }

  // ==============================================
  // BUILD SIDEBAR
  // ==============================================
  const active = window.NAV_ACTIVE || '';

  function buildSidebar() {
    const sidebar = document.createElement('nav');
    sidebar.className = 'nav-sidebar';
    sidebar.setAttribute('aria-label', 'Site navigation');

    const logo  = document.createElement('div');  logo.className  = 'nav-logo';
    const title = document.createElement('a');    title.className = 'nav-logo-title oil-text';
    title.href = 'artwork.html'; title.textContent = 'coiled lamb';
    logo.appendChild(title);
    const sub = document.createElement('a'); sub.className = 'nav-logo-sub';
    sub.href = 'about.html'; sub.textContent = 'about';
    if (active === 'about') sub.style.color = '#e0eeec';
    logo.appendChild(sub);
    sidebar.appendChild(logo);

    const links = document.createElement('div'); links.className = 'nav-links';
    NAV.forEach((item, i) => {
      if (i > 0) { const d = document.createElement('div'); d.className = 'nav-divider'; links.appendChild(d); }
      const li = document.createElement('div');
      const a  = document.createElement('a');
      a.className = 'nav-parent' + (item.key === active ? ' active' : '');
      a.href = item.href; a.textContent = item.label;
      li.appendChild(a);
      if (item.children) {
        const cw = document.createElement('div'); cw.className = 'nav-children';
        item.children.forEach(child => {
          const ca = document.createElement('a');
          ca.className = 'nav-child' + (child.key === active ? ' active' : '');
          ca.href = child.href; ca.textContent = child.label;
          if (child.badge) {
            const b = document.createElement('span'); b.className = 'nav-badge'; b.textContent = child.badge; ca.appendChild(b);
          }
          cw.appendChild(ca);
        });
        li.appendChild(cw);
      }
      links.appendChild(li);
    });
    sidebar.appendChild(links);

    // ── Music player ──────────────────────────────
    const player = document.createElement('div'); player.className = 'nav-player';

    // Hidden iframe — owns the <audio> element, persists across page navigations
    const frame = document.createElement('iframe');
    frame.src    = '/player-frame.html';
    frame.style.cssText = 'position:absolute;width:0;height:0;border:none;pointer-events:none;';
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    player.appendChild(frame);
    npFrame = frame;

    // Vol slider — top-right, absolutely positioned
    const volWrap = document.createElement('div'); volWrap.className = 'np-vol-wrap';
    const volIcon = document.createElement('span'); volIcon.className = 'np-vol-icon';
    volIcon.textContent = uiVolume === 0 ? '\u2205' : uiVolume < 0.5 ? '\u266a' : '\u266b';
    volIcon.setAttribute('aria-hidden', 'true');
    const volSlider = document.createElement('input');
    volSlider.className = 'np-vol-slider'; volSlider.type = 'range';
    volSlider.min = '0'; volSlider.max = '1'; volSlider.step = '0.05';
    volSlider.value = String(uiVolume);
    volSlider.setAttribute('aria-label', 'Volume');
    volSlider.addEventListener('input', () => npSetVolume(parseFloat(volSlider.value)));
    volWrap.appendChild(volIcon); volWrap.appendChild(volSlider);
    player.appendChild(volWrap);

    const plabel = document.createElement('div'); plabel.className = 'np-label';
    plabel.textContent = '\u258c now playing'; player.appendChild(plabel);

    const vis = document.createElement('div'); vis.className = 'np-vis';
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('div'); b.className = 'np-vis-bar';
      vis.appendChild(b); npBars.push(b);
    }
    player.appendChild(vis);

    const nameEl   = document.createElement('div'); nameEl.className   = 'np-track-name';   nameEl.textContent = TRACKS[uiIdx].name;
    const artistEl = document.createElement('div'); artistEl.className = 'np-track-artist'; artistEl.textContent = TRACKS[uiIdx].artist;
    player.appendChild(nameEl); player.appendChild(artistEl);

    const statusEl = document.createElement('div'); statusEl.className = 'np-status'; statusEl.textContent = 'LOADING....'; player.appendChild(statusEl);

    const progWrap = document.createElement('div'); progWrap.className = 'np-progress-wrap';
    progWrap.addEventListener('click', npSeek);
    const progFill = document.createElement('div'); progFill.className = 'np-progress-fill';
    progWrap.appendChild(progFill); player.appendChild(progWrap);

    const timeRow = document.createElement('div'); timeRow.className = 'np-time';
    const curEl = document.createElement('span'); curEl.textContent = '0:00';
    const durEl = document.createElement('span'); durEl.textContent = TRACKS[uiIdx].duration;
    timeRow.appendChild(curEl); timeRow.appendChild(durEl); player.appendChild(timeRow);

    const controls = document.createElement('div'); controls.className = 'np-controls';
    const prevBtn = document.createElement('button'); prevBtn.className = 'np-btn'; prevBtn.textContent = '|\u25c2';
    prevBtn.setAttribute('type','button'); prevBtn.setAttribute('aria-label','Previous track'); prevBtn.addEventListener('click', npPrev);
    const playBtn = document.createElement('button'); playBtn.className = 'np-btn np-btn-play'; playBtn.textContent = '\u25b6';
    playBtn.setAttribute('type','button'); playBtn.setAttribute('aria-label','Play/pause'); playBtn.addEventListener('click', npToggle);
    const nextBtn = document.createElement('button'); nextBtn.className = 'np-btn'; nextBtn.textContent = '\u25b8|';
    nextBtn.setAttribute('type','button'); nextBtn.setAttribute('aria-label','Next track'); nextBtn.addEventListener('click', npNext);
    const loopBtn = document.createElement('button'); loopBtn.className = 'np-btn'; loopBtn.textContent = '\u21ba';
    loopBtn.setAttribute('type','button'); loopBtn.setAttribute('aria-label','Toggle loop'); loopBtn.addEventListener('click', npToggleLoop);
    controls.appendChild(prevBtn); controls.appendChild(playBtn); controls.appendChild(nextBtn); controls.appendChild(loopBtn);
    player.appendChild(controls);

    const tlLabel = document.createElement('div'); tlLabel.className = 'np-tracklist-label'; tlLabel.textContent = 'tracklist';
    const tlEl = document.createElement('div');
    player.appendChild(tlLabel); player.appendChild(tlEl);

    sidebar.appendChild(player);

    npEls = { vis, name: nameEl, artist: artistEl, status: statusEl,
              fill: progFill, cur: curEl, dur: durEl,
              playBtn, loopBtn, volIcon, tracklist: tlEl };

    // ── Footer ─────────────────────────────────
    const footer = document.createElement('div'); footer.className = 'nav-footer';
    const replay = document.createElement('button'); replay.className = 'nav-replay';
    replay.textContent = '[ replay opening ]'; replay.setAttribute('type','button');
    replay.setAttribute('aria-label','Replay opening sequence');
    replay.onclick = () => { if (typeof window.startBoot === 'function') window.startBoot(true); };
    footer.appendChild(replay); sidebar.appendChild(footer);

    return sidebar;
  }

  const BODY_LEVEL_IDS = new Set(['boot', 'lightbox', 'scanlines', 'age-gate']);

  function injectNav() {
    const sidebar = buildSidebar();
    document.body.insertBefore(sidebar, document.body.firstChild);

    const wrapper = document.createElement('div'); wrapper.className = 'nav-offset';
    Array.from(document.body.children).forEach(c => {
      if (c === sidebar || BODY_LEVEL_IDS.has(c.id)) return;
      wrapper.appendChild(c);
    });
    document.body.appendChild(wrapper);

    // Listen for messages from the player frame
    window.addEventListener('message', onFrameMessage);

    // Once the iframe loads, restore volume + request current state
    npFrame.addEventListener('load', () => {
      cmd({ cmd: 'volume', value: uiVolume });
      cmd({ cmd: 'getState' });
      npSetStatus('STOPPED....');
      npRenderTL();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
