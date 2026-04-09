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
      key: 'blog',
      label: 'Blog',
      href: 'blog.html',
      children: [
        { key: 'blog-posts', label: 'posts', href: 'blog.html?filter=post' },
        { key: 'blog-notes', label: 'notes', href: 'blog.html?filter=note' },
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
    { name: "pilgrim's path", artist: 'craigory ham', src: '/audio/pilgrims-path.mp3',  duration: '4:07' },
    { name: 'stoic porridge',  artist: 'craigory ham', src: '/audio/stoic-porridge.mp3', duration: '5:29' },
    { name: 'onward',          artist: 'craigory ham', src: '/audio/onward.mp3',          duration: '5:56' },
    { name: 'drifter',         artist: 'duster',       src: '/audio/drifter.mp3',         duration: '3:41' },
  ];

  const OIL_GRADIENT = 'linear-gradient(90deg,#40a4b9 0%,#77bfcf 18%,#9d78d4 38%,#da8bda 54%,#9d78d4 70%,#77bfcf 85%,#40a4b9 100%)';

  const SK = {
    idx:      'cl_p_idx',
    pos:      'cl_p_pos',
    playing:  'cl_p_playing',
    volume:   'cl_p_volume',
    loop:     'cl_p_loop',
    shuffle:  'cl_p_shuffle',
    order:    'cl_p_order',
  };

  function ssGet(k, def) {
    try { const v = sessionStorage.getItem(k); return v !== null ? JSON.parse(v) : def; }
    catch(e) { return def; }
  }
  function ssSet(k, v) {
    try { sessionStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
  }

  let npIdx     = ssGet(SK.idx,     0);
  let npPos     = ssGet(SK.pos,     0);
  let npResume  = ssGet(SK.playing, false);
  let npVolume  = ssGet(SK.volume,  1.0);
  let npLoop    = ssGet(SK.loop,    0);
  let npShuffle = ssGet(SK.shuffle, false);
  let npOrder   = ssGet(SK.order,   null);

  let npAudio    = new Audio();
  let npPlaying  = false;
  let npVisTimer = null;
  let npOilTimer = null;
  let npBars     = [];
  let npEls      = {};

  function buildOrder() {
    const a = TRACKS.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    const ci = a.indexOf(npIdx);
    if (ci > 0) { [a[0], a[ci]] = [a[ci], a[0]]; }
    npOrder = a;
    ssSet(SK.order, npOrder);
  }

  function orderPos() {
    if (!npOrder) buildOrder();
    return npOrder.indexOf(npIdx);
  }

  function nextIdx() {
    if (npShuffle) {
      if (!npOrder) buildOrder();
      return npOrder[(orderPos() + 1) % npOrder.length];
    }
    return (npIdx + 1) % TRACKS.length;
  }

  function prevIdx() {
    if (npShuffle) {
      if (!npOrder) buildOrder();
      return npOrder[(orderPos() - 1 + npOrder.length) % npOrder.length];
    }
    return (npIdx - 1 + TRACKS.length) % TRACKS.length;
  }

  function npFmt(s) {
    if (isNaN(s) || s == null) return '0:00';
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  function npSetStatus(t) { if (npEls.status) npEls.status.textContent = t; }

  function npSaveState() {
    ssSet(SK.idx,     npIdx);
    ssSet(SK.pos,     npAudio.currentTime || 0);
    ssSet(SK.playing, npPlaying);
    ssSet(SK.volume,  npVolume);
    ssSet(SK.loop,    npLoop);
    ssSet(SK.shuffle, npShuffle);
  }

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
    const pitch = 5, totalSpan = npBars.length * pitch, dur = 4000;
    let t0 = null;
    function sweep(ts) {
      if (!t0) t0 = ts;
      npPaintBars(((ts - t0) % dur / dur) * totalSpan);
      npOilTimer = requestAnimationFrame(sweep);
    }
    npOilTimer = requestAnimationFrame(sweep);
  }

  function npUpdateLoopBtn() {
    if (!npEls.loopBtn) return;
    const labels = ['\u21ba', '\u21ba\u00b9', '\u21ba'];
    npEls.loopBtn.textContent = labels[npLoop];
    npEls.loopBtn.classList.toggle('active', npLoop > 0);
    npEls.loopBtn.title = ['no loop', 'loop track', 'loop playlist'][npLoop];
    npAudio.loop = (npLoop === 1);
  }

  function npUpdateShuffleBtn() {
    if (!npEls.shuffleBtn) return;
    npEls.shuffleBtn.classList.toggle('active', npShuffle);
  }

  function npRenderTL() {
    if (!npEls.tracklist) return;
    npEls.tracklist.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const row  = document.createElement('div');
      row.className = 'np-track-item' + (i === npIdx ? ' playing' : '');
      const idxEl = document.createElement('span'); idxEl.className = 'np-ti-idx';  idxEl.textContent  = String(i + 1).padStart(2, '0');
      const name  = document.createElement('span'); name.className  = 'np-ti-name'; name.textContent   = t.name;
      const dur   = document.createElement('span'); dur.className   = 'np-ti-dur';  dur.textContent    = t.duration;
      row.appendChild(idxEl); row.appendChild(name); row.appendChild(dur);
      row.addEventListener('click', () => npLoad(i, true));
      npEls.tracklist.appendChild(row);
    });
  }

  function npLoad(idx, play, startPos) {
    npIdx = idx;
    const t = TRACKS[idx];
    if (npEls.name)   npEls.name.textContent   = t.name;
    if (npEls.artist) npEls.artist.textContent = t.artist;
    if (npEls.dur)    npEls.dur.textContent    = t.duration;
    if (npEls.fill)   npEls.fill.style.width   = '0%';
    if (npEls.cur)    npEls.cur.textContent    = '0:00';
    npAudio.pause();
    npAudio = new Audio(t.src);
    npAudio.volume = npVolume;
    npAudio.loop   = (npLoop === 1);
    npAudio.addEventListener('timeupdate', npOnTick);
    npAudio.addEventListener('ended', npOnEnd);
    npAudio.addEventListener('error', () => npSetStatus('ERR: not found'));
    npRenderTL();
    if (startPos) {
      npAudio.addEventListener('canplay', function seek() {
        npAudio.currentTime = startPos;
        npAudio.removeEventListener('canplay', seek);
      }, { once: true });
    }
    if (play) npStart();
    else {
      npPlaying = false;
      if (npEls.playBtn) npEls.playBtn.textContent = '\u25b6';
      npAnimBars(false);
      npSetStatus('STOPPED....');
      npSaveState();
    }
  }

  function npStart() {
    npAudio.play().then(() => {
      npPlaying = true;
      if (npEls.playBtn) npEls.playBtn.textContent = '\u23f8';
      npAnimBars(true);
      npSetStatus('PLAYING....');
      npSaveState();
    }).catch(() => npSetStatus('ERR: cannot play'));
  }

  function npToggle() {
    if (npPlaying) {
      npAudio.pause(); npPlaying = false;
      if (npEls.playBtn) npEls.playBtn.textContent = '\u25b6';
      npAnimBars(false); npSetStatus('PAUSED.....');
      npSaveState();
    } else { npStart(); }
  }

  function npPrev() { npLoad(prevIdx(), npPlaying); }
  function npNext() { npLoad(nextIdx(), npPlaying); }

  function npOnEnd() {
    if (npLoop === 1) return;
    if (npLoop === 2 || !npShuffle) {
      const ni = nextIdx();
      const wrap = !npShuffle && ni === 0 && npLoop === 0;
      if (wrap) {
        npPlaying = false;
        if (npEls.playBtn) npEls.playBtn.textContent = '\u25b6';
        npAnimBars(false); npSetStatus('STOPPED....');
        npSaveState();
      } else {
        npLoad(ni, true);
      }
    } else {
      npLoad(nextIdx(), true);
    }
  }

  function npCycleLoop() {
    npLoop = (npLoop + 1) % 3;
    ssSet(SK.loop, npLoop);
    npUpdateLoopBtn();
  }

  function npToggleShuffle() {
    npShuffle = !npShuffle;
    ssSet(SK.shuffle, npShuffle);
    if (npShuffle) buildOrder();
    else { npOrder = null; ssSet(SK.order, null); }
    npUpdateShuffleBtn();
  }

  function npSetVolume(v) {
    npVolume = v;
    npAudio.volume = v;
    ssSet(SK.volume, v);
    if (npEls.volIcon) {
      npEls.volIcon.textContent = v === 0 ? '\u2205' : v < 0.5 ? '\u266a' : '\u266b';
    }
  }

  function npOnTick() {
    const p = npAudio.duration ? (npAudio.currentTime / npAudio.duration * 100) : 0;
    if (npEls.fill) npEls.fill.style.width = p + '%';
    if (npEls.cur)  npEls.cur.textContent  = npFmt(npAudio.currentTime);
    if (npEls.dur && npAudio.duration) npEls.dur.textContent = npFmt(npAudio.duration);
    if (Math.round(npAudio.currentTime * 2) % 4 === 0) npSaveState();
  }

  function npSeek(e) {
    if (!npAudio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    npAudio.currentTime = ((e.clientX - rect.left) / rect.width) * npAudio.duration;
  }

  const active      = window.NAV_ACTIVE || '';
  const urlFilter   = new URLSearchParams(window.location.search).get('filter');
  const filterToKey = { post: 'blog-posts', note: 'blog-notes' };
  const activeChild = urlFilter ? (filterToKey[urlFilter] || '') : '';

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
      const parentActive = item.key === active || (activeChild && item.children && item.children.some(c => c.key === activeChild));
      a.className = 'nav-parent' + (parentActive ? ' active' : '');
      a.href = item.href; a.textContent = item.label;
      li.appendChild(a);
      if (item.children) {
        const cw = document.createElement('div'); cw.className = 'nav-children';
        item.children.forEach(child => {
          const ca = document.createElement('a');
          const childActive = child.key === active || child.key === activeChild;
          ca.className = 'nav-child' + (childActive ? ' active' : '');
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

    const player = document.createElement('div'); player.className = 'nav-player';

    const volWrap = document.createElement('div'); volWrap.className = 'np-vol-wrap';
    const volIcon = document.createElement('span'); volIcon.className = 'np-vol-icon';
    volIcon.textContent = npVolume === 0 ? '\u2205' : npVolume < 0.5 ? '\u266a' : '\u266b';
    volIcon.setAttribute('aria-hidden', 'true');
    const volSlider = document.createElement('input');
    volSlider.className = 'np-vol-slider'; volSlider.type = 'range';
    volSlider.min = '0'; volSlider.max = '1'; volSlider.step = '0.05';
    volSlider.value = String(npVolume);
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

    const nameEl   = document.createElement('div'); nameEl.className   = 'np-track-name';   nameEl.textContent = TRACKS[npIdx].name;
    const artistEl = document.createElement('div'); artistEl.className = 'np-track-artist'; artistEl.textContent = TRACKS[npIdx].artist;
    player.appendChild(nameEl); player.appendChild(artistEl);

    const statusEl = document.createElement('div'); statusEl.className = 'np-status'; statusEl.textContent = 'STOPPED....'; player.appendChild(statusEl);

    const progWrap = document.createElement('div'); progWrap.className = 'np-progress-wrap';
    progWrap.addEventListener('click', npSeek);
    const progFill = document.createElement('div'); progFill.className = 'np-progress-fill';
    progWrap.appendChild(progFill); player.appendChild(progWrap);

    const timeRow = document.createElement('div'); timeRow.className = 'np-time';
    const curEl = document.createElement('span'); curEl.textContent = npFmt(npPos);
    const durEl = document.createElement('span'); durEl.textContent = TRACKS[npIdx].duration;
    timeRow.appendChild(curEl); timeRow.appendChild(durEl); player.appendChild(timeRow);

    const controls = document.createElement('div'); controls.className = 'np-controls';

    const shuffleBtn = document.createElement('button'); shuffleBtn.className = 'np-btn'; shuffleBtn.textContent = '\u21c4';
    shuffleBtn.setAttribute('type','button'); shuffleBtn.setAttribute('aria-label','Toggle shuffle');
    shuffleBtn.addEventListener('click', npToggleShuffle);

    const prevBtn = document.createElement('button'); prevBtn.className = 'np-btn'; prevBtn.textContent = '|\u25c2';
    prevBtn.setAttribute('type','button'); prevBtn.setAttribute('aria-label','Previous track');
    prevBtn.addEventListener('click', npPrev);

    const playBtn = document.createElement('button'); playBtn.className = 'np-btn np-btn-play'; playBtn.textContent = '\u25b6';
    playBtn.setAttribute('type','button'); playBtn.setAttribute('aria-label','Play/pause');
    playBtn.addEventListener('click', npToggle);

    const nextBtn = document.createElement('button'); nextBtn.className = 'np-btn'; nextBtn.textContent = '\u25b8|';
    nextBtn.setAttribute('type','button'); nextBtn.setAttribute('aria-label','Next track');
    nextBtn.addEventListener('click', npNext);

    const loopBtn = document.createElement('button'); loopBtn.className = 'np-btn'; loopBtn.textContent = '\u21ba';
    loopBtn.setAttribute('type','button'); loopBtn.setAttribute('aria-label','Cycle loop mode');
    loopBtn.addEventListener('click', npCycleLoop);

    controls.appendChild(shuffleBtn); controls.appendChild(prevBtn);
    controls.appendChild(playBtn);    controls.appendChild(nextBtn);
    controls.appendChild(loopBtn);
    player.appendChild(controls);

    const tlLabel = document.createElement('div'); tlLabel.className = 'np-tracklist-label'; tlLabel.textContent = 'tracklist';
    const tlEl = document.createElement('div'); tlEl.className = 'np-tracklist';
    npEls.tracklist = tlEl;
    player.appendChild(tlLabel); player.appendChild(tlEl);

    npEls.vis        = vis;
    npEls.name       = nameEl;
    npEls.artist     = artistEl;
    npEls.status     = statusEl;
    npEls.fill       = progFill;
    npEls.cur        = curEl;
    npEls.dur        = durEl;
    npEls.playBtn    = playBtn;
    npEls.loopBtn    = loopBtn;
    npEls.shuffleBtn = shuffleBtn;
    npEls.volIcon    = volIcon;

    sidebar.appendChild(player);

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

    npUpdateLoopBtn();
    npUpdateShuffleBtn();
    npRenderTL();
    npLoad(npIdx, false, npPos > 1 ? npPos : 0);
    if (npResume) { setTimeout(() => npStart(), 300); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
