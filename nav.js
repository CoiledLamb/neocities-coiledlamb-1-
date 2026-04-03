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

  // ==============================================
  // MUSIC PLAYER STATE
  // ==============================================
  const TRACKS = [
    { name: "pilgrim's path", artist: 'craigory ham', src: '/audio/pilgrims-path.mp3', duration: '4:07' },
    { name: 'stoic porridge',  artist: 'craigory ham', src: '/audio/stoic-porridge.mp3', duration: '5:29' },
    { name: 'onward',          artist: 'craigory ham', src: '/audio/onward.mp3',         duration: '5:56' },
    { name: 'drifter',         artist: 'duster',       src: '/audio/drifter.mp3',        duration: '3:41' },
  ];

  let npAudio    = new Audio();
  let npIdx      = 0;
  let npPlaying  = false;
  let npLooping  = false;
  let npVisTimer = null;
  let npBars     = [];
  let npVolume   = 1.0;

  // DOM refs populated during buildSidebar
  let npEls = {};

  function npFmt(s) {
    if (isNaN(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  function npSetStatus(t) { if (npEls.status) npEls.status.textContent = t; }

  function npAnimBars(on) {
    clearInterval(npVisTimer);
    if (npEls.vis) npEls.vis.classList.toggle('np-vis-active', on);
    if (!on) { npBars.forEach(b => b.style.height = '3px'); return; }
    npVisTimer = setInterval(() => {
      npBars.forEach(b => { b.style.height = (3 + Math.random() * 10) + 'px'; });
    }, 130);
  }

  function npRenderTL() {
    if (!npEls.tracklist) return;
    npEls.tracklist.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'np-track-item' + (i === npIdx ? ' playing' : '');
      const idx  = document.createElement('span'); idx.className = 'np-ti-idx'; idx.textContent = String(i + 1).padStart(2, '0');
      const name = document.createElement('span'); name.className = 'np-ti-name'; name.textContent = t.name;
      const dur  = document.createElement('span'); dur.className  = 'np-ti-dur';  dur.textContent  = t.duration;
      row.appendChild(idx); row.appendChild(name); row.appendChild(dur);
      row.addEventListener('click', () => npLoad(i, true));
      npEls.tracklist.appendChild(row);
    });
  }

  function npLoad(idx, play) {
    npIdx = idx;
    const t = TRACKS[idx];
    if (npEls.name)   npEls.name.textContent   = t.name;
    if (npEls.artist) npEls.artist.textContent = t.artist;
    if (npEls.dur)    npEls.dur.textContent    = t.duration;
    if (npEls.fill)   npEls.fill.style.width   = '0%';
    if (npEls.cur)    npEls.cur.textContent    = '0:00';
    npAudio.pause();
    npAudio = new Audio(t.src);
    npAudio.loop   = npLooping;
    npAudio.volume = npVolume;
    npAudio.addEventListener('timeupdate', npUpdateProg);
    npAudio.addEventListener('ended', npOnEnd);
    npAudio.addEventListener('error', () => npSetStatus('ERR: not found'));
    npRenderTL();
    if (play) npStart();
    else {
      npPlaying = false;
      if (npEls.playBtn) npEls.playBtn.textContent = '\u25b6';
      npAnimBars(false);
      npSetStatus('LOADED.....');
    }
  }

  function npStart() {
    npAudio.play().then(() => {
      npPlaying = true;
      if (npEls.playBtn) npEls.playBtn.textContent = '\u25a0';
      npAnimBars(true);
      npSetStatus('PLAYING....');
    }).catch(() => npSetStatus('ERR: cannot play'));
  }

  function npToggle() {
    if (npPlaying) {
      npAudio.pause(); npPlaying = false;
      if (npEls.playBtn) npEls.playBtn.textContent = '\u25b6';
      npAnimBars(false); npSetStatus('PAUSED.....');
    } else { npStart(); }
  }

  function npPrev() { npLoad((npIdx - 1 + TRACKS.length) % TRACKS.length, npPlaying); }
  function npNext() { npLoad((npIdx + 1) % TRACKS.length, npPlaying); }
  function npOnEnd() { if (!npLooping) npNext(); }

  function npToggleLoop() {
    npLooping = !npLooping;
    npAudio.loop = npLooping;
    if (npEls.loopBtn) npEls.loopBtn.classList.toggle('active', npLooping);
  }

  function npSetVolume(v) {
    npVolume = v;
    npAudio.volume = v;
    if (npEls.volIcon) {
      npEls.volIcon.textContent = v === 0 ? '\u2205' : v < 0.5 ? '\u266a' : '\u266b';
    }
  }

  function npUpdateProg() {
    const p = npAudio.duration ? (npAudio.currentTime / npAudio.duration * 100) : 0;
    if (npEls.fill) npEls.fill.style.width = p + '%';
    if (npEls.cur)  npEls.cur.textContent  = npFmt(npAudio.currentTime);
    if (npEls.dur && npAudio.duration) npEls.dur.textContent = npFmt(npAudio.duration);
  }

  function npSeek(e) {
    if (!npAudio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    npAudio.currentTime = ((e.clientX - rect.left) / rect.width) * npAudio.duration;
  }

  // ==============================================
  // BUILD SIDEBAR
  // ==============================================
  const active = window.NAV_ACTIVE || '';

  function buildSidebar() {
    const sidebar = document.createElement('nav');
    sidebar.className = 'nav-sidebar';
    sidebar.setAttribute('aria-label', 'Site navigation');

    // Logo block
    const logo = document.createElement('div');
    logo.className = 'nav-logo';

    const title = document.createElement('a');
    title.className = 'nav-logo-title oil-text';
    title.href = 'artwork.html';
    title.textContent = 'coiled lamb';
    logo.appendChild(title);

    const sub = document.createElement('a');
    sub.className = 'nav-logo-sub';
    sub.href = 'about.html';
    sub.textContent = 'about';
    if (active === 'about') sub.style.color = '#e0eeec';
    logo.appendChild(sub);

    sidebar.appendChild(logo);

    // Nav links (scrollable middle section)
    const links = document.createElement('div');
    links.className = 'nav-links';

    NAV.forEach((item, i) => {
      if (i > 0) {
        const div = document.createElement('div');
        div.className = 'nav-divider';
        links.appendChild(div);
      }

      const li = document.createElement('div');

      const a = document.createElement('a');
      a.className = 'nav-parent' + (item.key === active ? ' active' : '');
      a.href = item.href;
      a.textContent = item.label;
      li.appendChild(a);

      if (item.children) {
        const childWrap = document.createElement('div');
        childWrap.className = 'nav-children';
        item.children.forEach(child => {
          const ca = document.createElement('a');
          ca.className = 'nav-child' + (child.key === active ? ' active' : '');
          ca.href = child.href;
          ca.textContent = child.label;
          if (child.badge) {
            const b = document.createElement('span');
            b.className = 'nav-badge';
            b.textContent = child.badge;
            ca.appendChild(b);
          }
          childWrap.appendChild(ca);
        });
        li.appendChild(childWrap);
      }

      links.appendChild(li);
    });

    sidebar.appendChild(links);

    // ── Music player ──────────────────────────────
    const player = document.createElement('div');
    player.className = 'nav-player';

    const plabel = document.createElement('div');
    plabel.className = 'np-label';
    plabel.textContent = '\u258c now playing';
    player.appendChild(plabel);

    // Visualiser bars
    const vis = document.createElement('div');
    vis.className = 'np-vis';
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('div');
      b.className = 'np-vis-bar';
      vis.appendChild(b);
      npBars.push(b);
    }
    player.appendChild(vis);

    // Track info
    const nameEl   = document.createElement('div'); nameEl.className   = 'np-track-name';   nameEl.textContent = "pilgrim's path";
    const artistEl = document.createElement('div'); artistEl.className = 'np-track-artist'; artistEl.textContent = 'craigory ham';
    player.appendChild(nameEl);
    player.appendChild(artistEl);

    // Status
    const statusEl = document.createElement('div'); statusEl.className = 'np-status'; statusEl.textContent = 'STOPPED....';
    player.appendChild(statusEl);

    // Progress bar
    const progWrap = document.createElement('div'); progWrap.className = 'np-progress-wrap';
    progWrap.addEventListener('click', npSeek);
    const progFill = document.createElement('div'); progFill.className = 'np-progress-fill';
    progWrap.appendChild(progFill);
    player.appendChild(progWrap);

    // Time display
    const timeRow = document.createElement('div'); timeRow.className = 'np-time';
    const curEl   = document.createElement('span'); curEl.textContent = '0:00';
    const durEl   = document.createElement('span'); durEl.textContent = '4:07';
    timeRow.appendChild(curEl); timeRow.appendChild(durEl);
    player.appendChild(timeRow);

    // Controls row — transport buttons + volume inline
    const controls = document.createElement('div'); controls.className = 'np-controls';

    const prevBtn = document.createElement('button'); prevBtn.className = 'np-btn'; prevBtn.textContent = '|\u25c2';
    prevBtn.setAttribute('type', 'button'); prevBtn.setAttribute('aria-label', 'Previous track');
    prevBtn.addEventListener('click', npPrev);

    const playBtn = document.createElement('button'); playBtn.className = 'np-btn np-btn-play'; playBtn.textContent = '\u25b6';
    playBtn.setAttribute('type', 'button'); playBtn.setAttribute('aria-label', 'Play/pause');
    playBtn.addEventListener('click', npToggle);

    const nextBtn = document.createElement('button'); nextBtn.className = 'np-btn'; nextBtn.textContent = '\u25b8|';
    nextBtn.setAttribute('type', 'button'); nextBtn.setAttribute('aria-label', 'Next track');
    nextBtn.addEventListener('click', npNext);

    const loopBtn = document.createElement('button'); loopBtn.className = 'np-btn'; loopBtn.textContent = '\u21ba';
    loopBtn.setAttribute('type', 'button'); loopBtn.setAttribute('aria-label', 'Toggle loop');
    loopBtn.addEventListener('click', npToggleLoop);

    // Volume icon + slider — lives inside the controls row, slider flex-grows to fill
    const volIcon = document.createElement('span'); volIcon.className = 'np-vol-icon';
    volIcon.textContent = '\u266b';
    volIcon.setAttribute('aria-hidden', 'true');

    const volSlider = document.createElement('input');
    volSlider.className = 'np-vol-slider';
    volSlider.type  = 'range';
    volSlider.min   = '0';
    volSlider.max   = '1';
    volSlider.step  = '0.05';
    volSlider.value = '1';
    volSlider.setAttribute('aria-label', 'Volume');
    volSlider.addEventListener('input', () => npSetVolume(parseFloat(volSlider.value)));

    controls.appendChild(prevBtn); controls.appendChild(playBtn);
    controls.appendChild(nextBtn); controls.appendChild(loopBtn);
    controls.appendChild(volIcon); controls.appendChild(volSlider);
    player.appendChild(controls);

    // Tracklist
    const tlLabel = document.createElement('div'); tlLabel.className = 'np-tracklist-label'; tlLabel.textContent = 'tracklist';
    const tlEl    = document.createElement('div');
    player.appendChild(tlLabel);
    player.appendChild(tlEl);

    sidebar.appendChild(player);

    // Store DOM refs
    npEls = { vis, name: nameEl, artist: artistEl, status: statusEl,
              fill: progFill, cur: curEl, dur: durEl,
              playBtn, loopBtn, volIcon, tracklist: tlEl };

    // ── Footer — replay button ────────────────────
    const footer = document.createElement('div');
    footer.className = 'nav-footer';

    const replay = document.createElement('button');
    replay.className = 'nav-replay';
    replay.textContent = '[ replay opening ]';
    replay.setAttribute('type', 'button');
    replay.setAttribute('aria-label', 'Replay opening sequence');
    replay.onclick = function () {
      if (typeof window.startBoot === 'function') window.startBoot(true);
    };
    footer.appendChild(replay);
    sidebar.appendChild(footer);

    return sidebar;
  }

  // IDs that must stay as direct <body> children — never wrapped in .nav-offset
  const BODY_LEVEL_IDS = new Set(['boot', 'lightbox', 'scanlines', 'age-gate']);

  function injectNav() {
    const sidebar = buildSidebar();
    document.body.insertBefore(sidebar, document.body.firstChild);

    const children = Array.from(document.body.children);
    const wrapper  = document.createElement('div');
    wrapper.className = 'nav-offset';

    children.forEach(c => {
      if (c === sidebar) return;
      if (BODY_LEVEL_IDS.has(c.id)) return;
      wrapper.appendChild(c);
    });

    document.body.appendChild(wrapper);

    // Initialise player to first track (no autoplay)
    npRenderTL();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
