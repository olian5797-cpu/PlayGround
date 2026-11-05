/* ============================================================
   EMBERFALL VAULT
   A one-room Zelda-like. Canvas 2D, no external game assets.
   ============================================================ */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  let ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);

  const dom = {
    shell: $('game-shell'),
    hud: $('hud'),
    hearts: $('hearts'),
    objective: $('objective'),
    objectiveText: $('objective-text'),
    keySlot: $('key-slot'),
    keyLabel: $('key-label'),
    bossUI: $('boss-ui'),
    bossFill: $('boss-fill'),
    bossPips: [...document.querySelectorAll('.phase-pips .pip')],
    toast: $('toast'),
    toastKicker: $('toast-kicker'),
    toastText: $('toast-text'),
    prompt: $('interact-prompt'),
    promptText: $('prompt-text'),
    promptKey: $('prompt-key'),
    useBtn: $('use-btn'),
    touchUI: $('touch-ui'),
    stickZone: $('stick-zone'),
    stickKnob: $('stick-knob'),
    attackBtn: $('attack-btn'),
    rollBtn: $('roll-btn'),
    startBtn: $('start-button'),
    replayBtn: $('replay-button'),
    title: $('title-screen'),
    end: $('end-screen'),
    endKicker: $('end-kicker'),
    endTitle: $('end-title'),
    endCopy: $('end-copy'),
    endStats: $('end-stats'),
    sound: $('sound-toggle'),
    damage: $('damage-flash'),
    rotate: $('rotate-notice'),
  };

  // ------------------------------------------------------------
  // constants & utilities
  // ------------------------------------------------------------
  const QS = new URLSearchParams(location.search);
  const SKIP = new Set((QS.get('skip') || '').split(','));
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
  const choose = (arr) => arr[(Math.random() * arr.length) | 0];
  const angleDiff = (a, b) => {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function roundedRect(c, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
  function ellipse(c, x, y, rx, ry, rot = 0) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, 0, TAU);
  }
  function glow(c, x, y, r, color, alpha = 1) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(.3, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = alpha;
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
  }
  function heartSVG() {
    return `<svg viewBox="0 0 30 28" aria-hidden="true">
      <path class="heart-glow" d="M15 25S3.5 18 2 11.2C.9 6 4.2 2.2 8.5 2.2c3 0 5.2 1.8 6.5 4.2 1.3-2.4 3.5-4.2 6.5-4.2 4.3 0 7.6 3.8 6.5 9C26.5 18 15 25 15 25z"/>
      <path class="heart-body" d="M15 24S4.3 17.2 3 11.1C2 6.4 5 3.2 8.7 3.2c2.7 0 4.8 1.7 6.3 4.1 1.5-2.4 3.6-4.1 6.3-4.1 3.7 0 6.7 3.2 5.7 7.9C25.7 17.2 15 24 15 24z"/>
      <path class="heart-shine" d="M8 5.5c-1.9.2-3.1 1.6-3.1 3.2 0 .6.4 1 .9.8.6-.2.8-.8 1.2-1.6.5-1 1.4-1.6 2.2-1.7.4 0 .6-.7-.1-.7z"/>
    </svg>`;
  }

  // ------------------------------------------------------------
  // device / layout
  // ------------------------------------------------------------
  let W = 0, H = 0, DPR = 1;
  let RENDER_SCALE = QS.has('res') ? clamp(parseFloat(QS.get('res')), .3, 1) : 1;
  let touchMode = false;
  const room = { x: 0, y: 0, w: 1, h: 1, wall: 40 };
  let base = 700;
  let floorCache = null;
  let wallCache = null;
  let wallCaching = false;
  let maxDpr = 2;
  let perfAccum = 0, perfSamples = 0;

  function detectTouch() {
    return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || innerWidth <= 760;
  }

  function computeLayout() {
    touchMode = detectTouch();
    document.body.classList.toggle('is-touch', touchMode);
    const portrait = H / W > 1.08;
    if (portrait) {
      const side = clamp(W * .038, 9, 28);
      const top = Math.max(64, H * .092);
      const controls = touchMode ? clamp(H * .265, 160, 232) : clamp(H * .1, 26, 54);
      const bottom = controls + clamp(H * .012, 6, 15);
      room.x = side;
      room.y = top;
      room.w = W - side * 2;
      room.h = H - top - bottom;
      room.wall = clamp(Math.min(room.w, room.h) * .062, 13, 36);
    } else {
      const side = touchMode ? clamp(W * .145, 122, 174) : clamp(W * .07, 34, 112);
      const top = clamp(H * .115, 46, 104);
      const bottom = clamp(H * .055, 14, 52);
      const availW = W - side * 2;
      const availH = H - top - bottom;
      const aspect = 1.56;
      let rw = Math.min(availW, availH * aspect);
      let rh = rw / aspect;
      if (rh > availH) { rh = availH; rw = rh * aspect; }
      room.x = (W - rw) / 2;
      room.y = top + (availH - rh) / 2;
      room.w = rw;
      room.h = rh;
      room.wall = clamp(Math.min(room.w, room.h) * .07, 18, 56);
    }
    base = Math.min(room.w, room.h);
    dom.rotate.classList.toggle('show', false);
  }

  function resize() {
    W = innerWidth;
    H = innerHeight;
    DPR = Math.min(devicePixelRatio || 1, maxDpr) * RENDER_SCALE;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    computeLayout();
    buildFloorCache();
    buildWallCache();
    if (G.ambient.length === 0) seedAmbient();
    else reflowAmbient();
    positionEntitiesAfterResize();
  }

  // ------------------------------------------------------------
  // normalized <-> screen helpers
  // ------------------------------------------------------------
  const px = (nx) => room.x + nx * room.w;
  const py = (ny) => room.y + ny * room.h;
  const nx = (sx) => (sx - room.x) / room.w;
  const ny = (sy) => (sy - room.y) / room.h;
  function entPos(e) { return { x: px(e.x), y: py(e.y) }; }
  function dxScreen(a, b) { return (b.x - a.x) * room.w; }
  function dyScreen(a, b) { return (b.y - a.y) * room.h; }
  function distEnt(a, b) { return Math.hypot(dxScreen(a, b), dyScreen(a, b)); }
  function distToPoint(e, sx, sy) { return Math.hypot(px(e.x) - sx, py(e.y) - sy); }
  function angleTo(from, to) { return Math.atan2(dyScreen(from, to), dxScreen(from, to)); }
  function angleToPoint(e, sx, sy) { return Math.atan2(sy - py(e.y), sx - px(e.x)); }
  function moveEnt(e, angle, speedPx, dt) {
    e.x += Math.cos(angle) * speedPx * dt / room.w;
    e.y += Math.sin(angle) * speedPx * dt / room.h;
  }
  function clampEnt(e, r, marginTop = 0) {
    const mx = r / room.w;
    const my = r / room.h;
    e.x = clamp(e.x, .035 + mx, .965 - mx);
    e.y = clamp(e.y, .065 + my + marginTop, .955 - my);
  }

  // ------------------------------------------------------------
  // audio: small procedural score / sfx engine
  // ------------------------------------------------------------
  const audio = {
    ac: null,
    master: null,
    muted: false,
    noise: null,
    ambientStarted: false,
    init() {
      if (this.ac) {
        if (this.ac.state === 'suspended') this.ac.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : .26;
      this.master.connect(this.ac.destination);
      const len = this.ac.sampleRate * 2;
      const buffer = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    },
    toggle() {
      this.init();
      this.muted = !this.muted;
      if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : .26, this.ac.currentTime, .04);
      dom.sound.classList.toggle('muted', this.muted);
      dom.sound.setAttribute('aria-label', this.muted ? 'Unmute sound' : 'Mute sound');
    },
    noiseBurst(dur = .2, gain = .1, freq = 900, type = 'bandpass', q = 1.2) {
      if (!this.ac || this.muted) return;
      const src = this.ac.createBufferSource();
      src.buffer = this.noise;
      const filter = this.ac.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const g = this.ac.createGain();
      const t = this.ac.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      src.connect(filter).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + dur + .02);
    },
    tone(freq, dur = .3, gain = .06, type = 'sine', slide = null, delay = 0) {
      if (!this.ac || this.muted) return;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      const t = this.ac.currentTime + delay;
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + .012);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + .03);
    },
    startAmbient() {
      this.init();
      if (!this.ac || this.ambientStarted) return;
      this.ambientStarted = true;
      const t = this.ac.currentTime;
      const bed = this.ac.createGain();
      bed.gain.value = .027;
      bed.connect(this.master);
      [46, 69, 92].forEach((f, i) => {
        const o = this.ac.createOscillator();
        const g = this.ac.createGain();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        g.gain.value = i === 0 ? .8 : .18;
        o.connect(g).connect(bed);
        o.start(t);
      });
      const lfo = this.ac.createOscillator();
      const lg = this.ac.createGain();
      lfo.frequency.value = .08;
      lg.gain.value = .012;
      lfo.connect(lg).connect(bed.gain);
      lfo.start(t);
      const wind = this.ac.createBufferSource();
      wind.buffer = this.noise;
      wind.loop = true;
      const wf = this.ac.createBiquadFilter();
      wf.type = 'lowpass';
      wf.frequency.value = 190;
      const wg = this.ac.createGain();
      wg.gain.value = .02;
      wind.connect(wf).connect(wg).connect(this.master);
      wind.start(t);
    },
    swing() {
      this.noiseBurst(.17, .09, 1100, 'bandpass', 1.7);
      this.noiseBurst(.09, .045, 2600, 'highpass', .8);
    },
    hit() {
      this.tone(91, .15, .09, 'sine', 48);
      this.noiseBurst(.12, .08, 520, 'lowpass', .7);
    },
    hurt() {
      this.noiseBurst(.28, .12, 340, 'lowpass', .6);
      this.tone(122, .3, .08, 'sawtooth', 61);
    },
    dodge() { this.noiseBurst(.2, .055, 780, 'bandpass', .8); },
    pickup() {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .5, .045, 'sine', null, i * .075));
      this.tone(1568, .8, .018, 'sine', null, .32);
    },
    chest() {
      this.noiseBurst(.5, .06, 420, 'lowpass', .8);
      this.tone(82, .8, .08, 'sine', 55);
      [392, 523, 659].forEach((f, i) => this.tone(f, 1.1, .035, 'sine', null, .15 + i * .12));
    },
    unlock() {
      this.tone(55, 1.8, .13, 'sine', 37);
      this.noiseBurst(1.2, .09, 240, 'lowpass', .8);
      [196, 261, 392, 523].forEach((f, i) => this.tone(f, 1.7, .038, 'triangle', null, .35 + i * .13));
    },
    bossRoar() {
      this.tone(48, 1.7, .14, 'sawtooth', 31);
      this.tone(73, 1.5, .08, 'square', 39);
      this.noiseBurst(1.4, .07, 170, 'lowpass', .7);
    },
    slam() {
      this.tone(44, .65, .16, 'sine', 26);
      this.noiseBurst(.65, .13, 180, 'lowpass', .7);
    },
    charge() {
      this.noiseBurst(.5, .07, 250, 'bandpass', .6);
      this.tone(70, .5, .06, 'sawtooth', 45);
    },
    shatter() { this.noiseBurst(.24, .07, 1900, 'highpass', .7); this.tone(230, .12, .04, 'triangle', 90); },
    phase() {
      this.tone(40, 2.2, .15, 'sawtooth', 28);
      [147, 196, 294].forEach((f, i) => this.tone(f, 1.5, .04, 'triangle', null, .2 + i * .17));
      this.noiseBurst(1.5, .08, 220, 'lowpass', .5);
    },
    victory() {
      [261.6, 329.6, 392, 523.2, 659.2].forEach((f, i) => this.tone(f, 2.4, .042, 'sine', null, i * .13));
      this.tone(130.8, 3, .05, 'triangle', null, .1);
    },
    death() {
      this.tone(90, 2.2, .09, 'sine', 36);
      this.noiseBurst(1.4, .05, 200, 'lowpass', .8);
    },
  };
  dom.sound.addEventListener('click', (e) => { e.stopPropagation(); audio.toggle(); });

  // ------------------------------------------------------------
  // game state
  // ------------------------------------------------------------
  const G = {
    state: 'title',
    time: 0,
    runTime: 0,
    hitStop: 0,
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    progress: 'seek', // seek / unlocking / boss / won
    intro: 0,
    toastT: 0,
    ambient: [],
    motes: [],
    particles: [],
    decals: [],
    slashes: [],
    afterimages: [],
    wisps: [],
    projectiles: [],
    shockwaves: [],
    hazards: [],
    pickups: [],
    keyDrop: null,
    player: null,
    boss: null,
    chest: null,
    gate: null,
    pots: [],
    braziers: [],
    torches: [],
    promptTimer: 0,
    deathT: 0,
    victoryT: 0,
    endShown: false,
    paused: false,
    firstFrame: true,
    lastKill: 0,
  };

  function resetRun() {
    G.state = 'playing';
    G.time = 0;
    G.runTime = 0;
    G.hitStop = 0;
    G.shake = 0;
    G.progress = 'seek';
    G.intro = 0;
    G.toastT = 0;
    G.particles.length = 0;
    G.slashes.length = 0;
    G.afterimages.length = 0;
    G.wisps.length = 0;
    G.projectiles.length = 0;
    G.shockwaves.length = 0;
    G.hazards.length = 0;
    G.pickups.length = 0;
    G.decals.length = 0;
    G.keyDrop = null;
    G.deathT = 0;
    G.victoryT = 0;
    G.endShown = false;

    G.player = {
      x: .5, y: .82,
      hp: 6, maxHp: 6,
      facing: -Math.PI / 2,
      inv: 0, rollT: 0, rollCd: 0, rollAng: 0,
      attackT: 0, attackCd: 0, attackHit: false, attackSide: 1,
      walk: 0, moving: false, alive: true,
      hurtT: 0, footT: 0,
    };
    G.boss = {
      x: .5, y: .315,
      hp: 68, maxHp: 68,
      phase: 1,
      state: 'dormant',
      t: 0, cd: 1.2, ang: Math.PI / 2,
      flash: 0, stun: 0, weapon: -0.5,
      face: 1, bob: 0, dying: 0, roar: 0,
      chargeAng: 0, targetX: .5, targetY: .7,
    };
    G.chest = {
      x: .175, y: .675,
      opening: false, openT: 0, open: false, keyTaken: false,
      glow: 1,
    };
    G.gate = {
      t: 0, unlocking: false, open: false, flash: 0,
      y: .438,
    };
    G.pots = [
      { x: .335, y: .79, r: .015, dead: false, wobble: 0, seed: 1 },
      { x: .67, y: .735, r: .015, dead: false, wobble: 0, seed: 2 },
      { x: .83, y: .72, r: .014, dead: false, wobble: 0, seed: 3 },
      { x: .77, y: .87, r: .013, dead: false, wobble: 0, seed: 4 },
    ];
    G.braziers = [
      { x: .285, y: .105, h: .9, seed: 0.4 },
      { x: .715, y: .105, h: .9, seed: 2.1 },
    ];
    G.torches = [
      { x: .17, y: .045, side: 'top', seed: 1.2 },
      { x: .83, y: .045, side: 'top', seed: 3.7 },
      { x: .028, y: .43, side: 'left', seed: 2.4 },
      { x: .972, y: .43, side: 'right', seed: 5.1 },
      { x: .04, y: .83, side: 'left', seed: 4.4 },
      { x: .96, y: .83, side: 'right', seed: .8 },
    ];
    // spawn ghosts in wisps? no
    updateHUD();
    dom.bossUI.classList.remove('show');
    dom.bossUI.setAttribute('aria-hidden', 'true');
    dom.keySlot.classList.remove('has-key');
    dom.keyLabel.textContent = 'Empty';
    dom.keySlot.setAttribute('aria-label', 'No key');
    dom.prompt.classList.remove('show');
    dom.useBtn.classList.remove('show');
    dom.damage.classList.remove('on');
    setObjective('Find the reliquary');
  }

  function seedAmbient() {
    G.ambient.length = 0;
    G.motes.length = 0;
    for (let i = 0; i < 46; i++) {
      G.ambient.push({
        x: rand(1), y: rand(1),
        vx: rand(.012, -.012), vy: rand(-.006, -.026),
        size: rand(2.6, .8), ph: rand(TAU), life: rand(1),
      });
    }
    for (let i = 0; i < 34; i++) {
      G.motes.push({
        x: rand(1), y: rand(1),
        vx: rand(.009, -.009), vy: rand(.006, -.008),
        size: rand(1.7, .5), ph: rand(TAU),
      });
    }
  }
  function reflowAmbient() {
    G.ambient.forEach(a => { a.x = clamp(a.x, 0, 1); a.y = clamp(a.y, 0, 1); });
    G.motes.forEach(a => { a.x = clamp(a.x, 0, 1); a.y = clamp(a.y, 0, 1); });
  }
  function positionEntitiesAfterResize() {
    if (!G.player) return;
    clampEnt(G.player, base * .017);
    clampEnt(G.boss, base * .08, .02);
  }

  // ------------------------------------------------------------
  // UI helpers
  // ------------------------------------------------------------
  function buildHearts() {
    dom.hearts.innerHTML = Array.from({ length: 6 }, () => `<span class="heart">${heartSVG()}</span>`).join('');
  }
  function updateHUD() {
    if (!G.player) return;
    const hearts = [...dom.hearts.querySelectorAll('.heart')];
    hearts.forEach((el, i) => {
      const wasLost = el.classList.contains('lost');
      el.classList.toggle('lost', i >= G.player.hp);
      if (wasLost && i < G.player.hp) {
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
      }
    });
  }
  function setObjective(text) {
    if (dom.objectiveText.textContent === text) return;
    dom.objectiveText.textContent = text;
    dom.objective.classList.remove('swap');
    void dom.objective.offsetWidth;
    dom.objective.classList.add('swap');
  }
  let toastTimeout = 0;
  function toast(kicker, text, seconds = 2.8) {
    dom.toastKicker.textContent = kicker;
    dom.toastText.textContent = text;
    dom.toast.classList.add('show');
    G.toastT = seconds;
  }
  function setPrompt(text, key = 'E') {
    if (!text) {
      dom.prompt.classList.remove('show');
      dom.useBtn.classList.remove('show');
      return;
    }
    if (dom.promptText.textContent !== text) dom.promptText.textContent = text;
    dom.promptKey.textContent = touchMode ? '✦' : key;
    dom.prompt.classList.add('show');
    if (touchMode) dom.useBtn.classList.add('show');
  }
  function updateBossUI() {
    const pct = clamp(G.boss.hp / G.boss.maxHp, 0, 1);
    dom.bossFill.style.transform = `scaleX(${pct})`;
    dom.bossFill.classList.toggle('hurt', G.boss.flash > .02);
    dom.bossPips.forEach((p, i) => p.classList.toggle('active', i < G.boss.phase));
  }
  function showEnd(victory) {
    if (G.endShown) return;
    G.endShown = true;
    dom.end.classList.remove('hidden');
    dom.end.setAttribute('aria-hidden', 'false');
    if (victory) {
      dom.endKicker.textContent = 'The vault falls silent';
      dom.endTitle.textContent = 'The Warden Falls';
      dom.endTitle.classList.remove('fallen');
      dom.endCopy.textContent = 'The ember key is yours, and the dark has no keeper. The vault remembers your name.';
      audio.victory();
    } else {
      dom.endKicker.textContent = 'The vault keeps you';
      dom.endTitle.textContent = 'Ashes to Ashes';
      dom.endTitle.classList.add('fallen');
      dom.endCopy.textContent = 'The warden remains. The key remains. The dark is patient. Rise, and try again.';
      audio.death();
    }
    const mm = Math.floor(G.runTime / 60);
    const ss = Math.floor(G.runTime % 60);
    dom.endStats.innerHTML = `
      <div class="end-stat"><b>${mm}:${String(ss).padStart(2, '0')}</b><span>Time in the vault</span></div>
      <div class="end-stat"><b>${victory ? Math.max(0, G.player.hp) : 0} / ${G.player.maxHp}</b><span>Vitality</span></div>
      <div class="end-stat"><b>${victory ? 'III' : '—'}</b><span>Warden phase</span></div>`;
    dom.end.classList.remove('hidden');
    setTimeout(() => dom.replayBtn.focus({ preventScroll: true }), 400);
  }

  // ------------------------------------------------------------
  // input
  // ------------------------------------------------------------
  const keys = new Set();
  const stick = { active: false, id: null, vx: 0, vy: 0, dx: 0, dy: 0, cx: 0, cy: 0 };
  let actionPressed = false;

  function keyMoveVector() {
    let x = 0, y = 0;
    if (keys.has('left')) x -= 1;
    if (keys.has('right')) x += 1;
    if (keys.has('up')) y -= 1;
    if (keys.has('down')) y += 1;
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len, len: 1 } : { x: 0, y: 0, len: 0 };
  }
  function moveVector() {
    let x = stick.vx, y = stick.vy;
    const len = Math.hypot(x, y);
    if (len > .12) {
      const m = Math.min(1, len);
      return { x: x / len * m, y: y / len * m, len: m };
    }
    return keyMoveVector();
  }

  function startAttack() {
    if (G.state !== 'playing' || !G.player || !G.player.alive) return;
    const p = G.player;
    if (p.attackCd > 0 || p.rollT > 0) return;
    p.attackT = .3;
    p.attackCd = .36;
    p.attackHit = false;
    p.attackSide *= -1;
    // generous aim assist toward the closest threat
    let target = null, best = base * .62;
    if (G.boss && ['chase', 'slamWindup', 'slamRecover', 'chargeWindup', 'chargeRecover', 'volleyWindup', 'volleyRecover', 'fissureWindup', 'fissureRecover'].includes(G.boss.state)) {
      const d = distEnt(p, G.boss);
      if (d < best) { best = d; target = G.boss; }
    }
    for (const w of G.wisps) {
      const d = distEnt(p, w);
      if (d < best) { best = d; target = w; }
    }
    if (target) p.facing = angleTo(p, target);
    audio.swing();
  }

  function startRoll() {
    if (G.state !== 'playing' || !G.player || !G.player.alive) return;
    const p = G.player;
    if (p.rollCd > 0 || p.rollT > 0) return;
    const mv = moveVector();
    p.rollAng = mv.len ? Math.atan2(mv.y, mv.x) : p.facing;
    p.rollT = .3;
    p.rollCd = .82;
    p.inv = Math.max(p.inv, .34);
    p.facing = p.rollAng;
    audio.dodge();
    spawnParticles(p.x, p.y + .002, 10, {
      color: '#a9956e', speed: base * .34, life: .35, size: 1.6, gravity: -base * .03, alpha: .5,
    });
  }

  function tryInteract() {
    if (G.state !== 'playing') return;
    if (G.progress === 'seek' && !G.chest.opening) {
      const p = G.player;
      if (distEnt(p, G.chest) < base * .14) {
        G.chest.opening = true;
        G.chest.openT = 0;
        G.progress = 'opening';
        setObjective('Claim the ember key');
        setPrompt(null);
        audio.chest();
        G.shake = Math.max(G.shake, 5);
        spawnParticles(G.chest.x, G.chest.y - .04, 20, {
          color: '#ffd477', speed: base * .34, life: 1.1, size: 2.2, glow: true, gravity: -base * .1,
        });
      }
    } else if (G.progress === 'unlock') {
      const p = G.player;
      if (p.y < G.gate.y + .14 && p.y > G.gate.y - .02) {
        startUnlock();
      }
    }
  }

  function startUnlock() {
    if (G.gate.unlocking) return;
    G.gate.unlocking = true;
    G.gate.t = 0;
    G.progress = 'unlocking';
    setObjective('The seal breaks');
    setPrompt(null);
    audio.unlock();
    G.shake = Math.max(G.shake, 9);
    spawnParticles(.5, G.gate.y, 42, {
      color: '#ffc86b', speed: base * .48, life: 1.4, size: 2.5, glow: true, gravity: base * .08,
    });
  }

  function grantKey() {
    if (G.chest.keyTaken) return;
    G.chest.keyTaken = true;
    G.keyDrop = null;
    G.progress = 'unlock';
    dom.keySlot.classList.add('has-key');
    dom.keyLabel.textContent = 'Ember Key';
    dom.keySlot.setAttribute('aria-label', 'Ember key acquired');
    setObjective('Unlock the sealed gate');
    toast('Relic acquired', 'The Ember Key', 3);
    audio.pickup();
    G.shake = Math.max(G.shake, 4);
    spawnParticles(G.player.x, G.player.y - .08, 14, {
      color: '#ffe49a', speed: base * .42, life: 1.2, size: 2.2, glow: true, gravity: -base * .02,
    });
  }

  function breakPot(i, silent = false) {
    const pot = G.pots[i];
    if (!pot || pot.dead) return;
    pot.dead = true;
    G.decals.push({ x: pot.x, y: pot.y, type: 'pot', life: 12, max: 12, seed: Math.random() * 10 });
    spawnParticles(pot.x, pot.y - .01, 16, {
      color: choose(['#8b5e3d', '#b0764b', '#5a3b28']), speed: base * .38, life: .9,
      size: 2.2, gravity: base * .8, alpha: .9,
    });
    if (!silent) audio.shatter();
    if (Math.random() < .34 || pot.seed === 2) {
      G.pickups.push({ x: pot.x, y: pot.y - .02, type: 'heart', t: rand(TAU), vy: -.12, vx: rand(.05, -.05), life: 16 });
    }
  }

  function damageBoss(amount, source = 'sword') {
    const b = G.boss;
    if (!b || G.progress === 'won') return;
    if (!['chase', 'slamWindup', 'slamRecover', 'chargeWindup', 'charge', 'chargeRecover', 'volleyWindup', 'volleyRecover', 'fissureWindup', 'fissureRecover'].includes(b.state)) return;
    b.hp = Math.max(0, b.hp - amount);
    b.flash = .14;
    b.hurtKick = 1;
    G.hitStop = Math.max(G.hitStop, .033);
    G.shake = Math.max(G.shake, 6);
    updateBossUI();
    const hit = { x: b.x, y: b.y - .09 };
    spawnParticles(hit.x, hit.y, 16, {
      color: choose(['#ffbf5e', '#ff7d32', '#ffe6a0']), speed: base * .46, life: .55,
      size: 2.1, glow: true, gravity: base * .25, streak: true,
    });
    spawnParticles(hit.x, hit.y, 6, {
      color: '#2c2119', speed: base * .18, life: .9, size: 5.5, glow: false, alpha: .3, gravity: -base * .06,
    });
    audio.hit();
    if (b.hp <= 0) {
      beginBossDeath();
      return;
    }
    const pct = b.hp / b.maxHp;
    if (pct <= .666 && b.phase === 1) beginPhase(2);
    else if (pct <= .333 && b.phase === 2) beginPhase(3);
  }

  function hurtPlayer(amount = 1) {
    const p = G.player;
    if (!p || G.state !== 'playing' || p.inv > 0 || !p.alive || G.progress === 'won') return;
    p.hp -= amount;
    p.inv = 1.25;
    p.hurtT = .2;
    G.shake = Math.max(G.shake, 10);
    G.hitStop = Math.max(G.hitStop, .045);
    audio.hurt();
    updateHUD();
    dom.damage.classList.add('on');
    clearTimeout(G.damageTimer);
    G.damageTimer = setTimeout(() => dom.damage.classList.remove('on'), 130);
    spawnParticles(p.x, p.y - .035, 18, {
      color: choose(['#d94c38', '#ff9e65', '#7e1f1c']), speed: base * .5, life: .75,
      size: 2.4, glow: false, gravity: base * .6, streak: true,
    });
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      G.state = 'falling';
      G.deathT = 0;
      G.shake = 15;
      spawnParticles(p.x, p.y - .03, 40, {
        color: choose(['#b32d25', '#e78455', '#f6c177']), speed: base * .6, life: 1.5,
        size: 2.8, glow: true, gravity: base * .5,
      });
    }
  }

  // ------------------------------------------------------------
  // particles and effects
  // ------------------------------------------------------------
  function spawnParticles(nxPos, nyPos, count, opts = {}) {
    const speed = opts.speed || base * .3;
    for (let i = 0; i < count; i++) {
      const a = opts.angle != null ? opts.angle + rand(.65, -.65) : rand(TAU);
      const sp = speed * rand(1.1, .18);
      const life = (opts.life || .8) * rand(1.2, .55);
      G.particles.push({
        x: nxPos, y: nyPos,
        vx: Math.cos(a) * sp / room.w,
        vy: Math.sin(a) * sp / room.h,
        life, max: life,
        size: (opts.size || 2) * rand(1.4, .6),
        color: opts.color || '#ffbd66',
        glow: !!opts.glow,
        gravity: (opts.gravity || 0) / room.h,
        drag: opts.drag == null ? .985 : opts.drag,
        alpha: opts.alpha == null ? 1 : opts.alpha,
        streak: !!opts.streak,
      });
    }
  }
  function spawnDust(nxPos, nyPos, count = 8) {
    spawnParticles(nxPos, nyPos, count, {
      color: '#8e7d63', speed: base * .18, life: .9, size: 6, gravity: -base * .04, alpha: .16, drag: .94,
    });
  }
  function screenShake(amount) { G.shake = Math.max(G.shake, amount); }

  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = G.decals.length - 1; i >= 0; i--) {
      G.decals[i].life -= dt;
      if (G.decals[i].life <= 0) G.decals.splice(i, 1);
    }
    for (let i = G.afterimages.length - 1; i >= 0; i--) {
      G.afterimages[i].life -= dt;
      if (G.afterimages[i].life <= 0) G.afterimages.splice(i, 1);
    }
    for (let i = G.slashes.length - 1; i >= 0; i--) {
      G.slashes[i].life -= dt;
      if (G.slashes[i].life <= 0) G.slashes.splice(i, 1);
    }
    for (const a of G.ambient) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.ph += dt * 2;
      if (a.y < -.02) { a.y = 1.02; a.x = rand(1); }
      if (a.x < -.02) a.x = 1.02;
      if (a.x > 1.02) a.x = -.02;
    }
    for (const m of G.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.ph += dt;
      if (m.y > 1.02) { m.y = -.02; m.x = rand(1); }
      if (m.x < -.02) m.x = 1.02;
      if (m.x > 1.02) m.x = -.02;
    }
  }

  // ------------------------------------------------------------
  // player update
  // ------------------------------------------------------------
  function playerRadius() { return base * .023; }

  function updatePlayer(dt) {
    const p = G.player;
    if (!p || !p.alive) return;
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.rollCd = Math.max(0, p.rollCd - dt);
    p.inv = Math.max(0, p.inv - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    const mv = moveVector();
    p.moving = mv.len > .02;

    if (p.rollT > 0) {
      p.rollT -= dt;
      const speed = base * 1.02;
      moveEnt(p, p.rollAng, speed, dt);
      if (Math.random() < dt * 28) {
        G.afterimages.push({ x: p.x, y: p.y, facing: p.facing, life: .2, max: .2, alpha: .35 });
      }
      spawnParticles(p.x, p.y, 1, {
        color: '#b9a47c', speed: base * .12, life: .35, size: 3, gravity: 0, alpha: .18,
      });
    } else {
      let speed = base * .34;
      if (p.attackT > 0) speed *= .42;
      if (p.moving) {
        moveEnt(p, Math.atan2(mv.y, mv.x), speed, dt);
        p.facing = Math.atan2(mv.y, mv.x);
        p.walk += dt * 10;
        p.footT -= dt;
        if (p.footT <= 0) {
          p.footT = .24;
          spawnParticles(p.x, p.y + .002, 2, {
            color: '#9b8a6b', speed: base * .06, life: .45, size: 2.6, gravity: -base * .04, alpha: .14,
          });
        }
      } else {
        p.walk += dt * 2.5;
        if (G.boss && G.progress === 'boss' && G.boss.state !== 'dormant' && p.attackT <= 0) {
          const targetAng = angleTo(p, G.boss);
          p.facing = p.facing + angleDiff(targetAng, p.facing) * Math.min(1, dt * 2);
        }
      }
    }

    if (p.attackT > 0) {
      p.attackT -= dt;
      if (!p.attackHit && p.attackT < .2) {
        p.attackHit = true;
        performSwordHit();
      }
      if (p.attackT <= 0) p.attackT = 0;
    }

    // collision with pots & chest
    const pr = playerRadius();
    for (const pot of G.pots) {
      if (pot.dead) continue;
      const d = distEnt(p, pot);
      const rr = pr + base * .025;
      if (d < rr && d > .001) {
        const a = angleTo(pot, p);
        p.x = pot.x + Math.cos(a) * rr / room.w;
        p.y = pot.y + Math.sin(a) * rr / room.h;
      }
    }
    if (!G.chest.keyTaken || true) {
      const d = distEnt(p, G.chest);
      const rr = pr + base * .045;
      if (d < rr && d > .001) {
        const a = angleTo(G.chest, p);
        p.x = G.chest.x + Math.cos(a) * rr / room.w;
        p.y = G.chest.y + Math.sin(a) * rr / room.h;
      }
    }
    // boss body collision
    if (G.boss && G.boss.state !== 'dormant' && G.boss.state !== 'dying' && G.boss.state !== 'awaken') {
      const d = distEnt(p, G.boss);
      const bR = base * .068;
      const rr = pr + bR;
      if (d < rr && d > .001) {
        const a = angleTo(G.boss, p);
        p.x = G.boss.x + Math.cos(a) * rr / room.w;
        p.y = G.boss.y + Math.sin(a) * rr / room.h;
      }
    }
    // barrier collision
    if (!G.gate.open) {
      const band = pr / room.h + .012;
      if (p.y < G.gate.y + band) {
        p.y = G.gate.y + band;
      }
    }
    clampEnt(p, pr);
  }

  function performSwordHit() {
    const p = G.player;
    const reach = base * .115;
    const arc = 1.15;
    let hitSomething = false;

    for (let i = 0; i < G.pots.length; i++) {
      const pot = G.pots[i];
      if (pot.dead) continue;
      const d = distEnt(p, pot);
      const a = angleTo(p, pot);
      if (d < reach + base * .03 && Math.abs(angleDiff(a, p.facing)) < arc) {
        breakPot(i);
        hitSomething = true;
      }
    }

    for (let i = G.wisps.length - 1; i >= 0; i--) {
      const w = G.wisps[i];
      if (w.dying) continue;
      const d = distEnt(p, w);
      const a = angleTo(p, w);
      if (d < reach + base * .04 && Math.abs(angleDiff(a, p.facing)) < arc + .2) {
        w.hp -= 1;
        w.flash = .12;
        hitSomething = true;
        spawnParticles(w.x, w.y - .02, 12, {
          color: choose(['#ffb75d', '#ff6d30', '#ffe5a0']), speed: base * .42, life: .5,
          size: 2, glow: true, gravity: base * .1,
        });
        if (w.hp <= 0) {
          w.dying = .5;
          w.life = .5;
          spawnParticles(w.x, w.y - .02, 24, {
            color: choose(['#ffbf5f', '#b53e1f', '#ffe9ad']), speed: base * .55, life: .85,
            size: 2.4, glow: true, gravity: base * .1,
          });
          audio.shatter();
          G.shake = Math.max(G.shake, 3);
          if (Math.random() < .5) {
            G.pickups.push({ x: w.x, y: w.y, type: 'heart', t: 0, vy: -.1, vx: 0, life: 13 });
          }
        }
      }
    }

    if (G.boss) {
      const b = G.boss;
      const d = distEnt(p, b);
      const a = angleTo(p, b);
      if (d < reach + base * .075 && Math.abs(angleDiff(a, p.facing)) < arc + .35) {
        if (['chase', 'slamWindup', 'slamRecover', 'chargeWindup', 'charge', 'chargeRecover', 'volleyWindup', 'volleyRecover', 'fissureWindup', 'fissureRecover'].includes(b.state)) {
          damageBoss(4.1 + Math.random() * .55, 'sword');
          hitSomething = true;
        }
      }
    }

    if (hitSomething) {
      G.slashes.push({
        x: p.x, y: p.y, facing: p.facing, side: p.attackSide,
        life: .18, max: .18, hit: true,
      });
    } else {
      G.slashes.push({
        x: p.x, y: p.y, facing: p.facing, side: p.attackSide,
        life: .22, max: .22, hit: false,
      });
    }
  }

  // ------------------------------------------------------------
  // boss & enemies
  // ------------------------------------------------------------
  function bossRadius() { return base * .068; }

  function beginBossAwake() {
    const b = G.boss;
    if (b.state !== 'dormant') return;
    b.state = 'awaken';
    b.t = 0;
    dom.bossUI.classList.add('show');
    dom.bossUI.setAttribute('aria-hidden', 'false');
    updateBossUI();
    audio.bossRoar();
    G.shake = Math.max(G.shake, 14);
    spawnParticles(b.x, b.y - .1, 30, {
      color: choose(['#ff8b3c', '#ffcf70', '#c54524']), speed: base * .55, life: 1.2,
      size: 2.5, glow: true, gravity: -base * .08,
    });
  }

  function beginPhase(n) {
    const b = G.boss;
    b.phase = n;
    b.state = 'phaseTransition';
    b.t = 0;
    b.flash = .25;
    G.shake = 13;
    audio.phase();
    updateBossUI();
    spawnShockwave(b.x, b.y, base * .62, base * .85, false);
    spawnParticles(b.x, b.y - .1, 34, {
      color: choose(['#ff7a32', '#ffd278', '#ad361e']), speed: base * .68, life: 1.3,
      size: 2.8, glow: true, gravity: base * .06,
    });
    spawnWisps(n === 2 ? 2 : 3);
    G.pickups.push({ x: b.x + (Math.random() < .5 ? -.08 : .08), y: b.y + .07, type: 'heart', t: 0, vy: -.12, vx: 0, life: 18 });
    toast(n === 2 ? 'The warden burns brighter' : 'The warden is unbound', n === 2 ? 'Second phase' : 'Final phase', 2.8);
  }

  function beginBossDeath() {
    const b = G.boss;
    b.hp = 0;
    b.state = 'dying';
    b.t = 0;
    G.progress = 'won';
    G.state = 'playing';
    G.shake = 16;
    G.hitStop = .12;
    G.projectiles.length = 0;
    G.hazards.length = 0;
    G.shockwaves.length = 0;
    dom.bossUI.classList.remove('show');
    dom.bossUI.setAttribute('aria-hidden', 'true');
    setObjective('The vault is silent');
    audio.phase();
    spawnParticles(b.x, b.y - .12, 70, {
      color: choose(['#ffd274', '#ff7b32', '#f6f0d0', '#d74428']), speed: base * .8, life: 2,
      size: 3.2, glow: true, gravity: base * .2,
    });
    updateBossUI();
  }

  function spawnWisp(angleOffset = 0) {
    const b = G.boss;
    const a = angleOffset || rand(TAU);
    const w = {
      x: clamp(b.x + Math.cos(a) * .06, .1, .9),
      y: clamp(b.y + Math.sin(a) * .04, .1, .9),
      hp: 1, r: base * .026, flash: 0, dying: 0, life: 1,
      phase: rand(TAU), speed: base * (.16 + Math.random() * .04), facing: 0,
    };
    G.wisps.push(w);
    spawnParticles(w.x, w.y - .02, 14, {
      color: choose(['#ffc46b', '#ff6c2d']), speed: base * .28, life: .6, size: 1.8, glow: true,
    });
  }
  function spawnWisps(count) {
    if (G.wisps.length > 5) return;
    for (let i = 0; i < count; i++) spawnWisp(rand(TAU));
  }

  function spawnShockwave(x, y, maxR, speed, damaging = true) {
    G.shockwaves.push({ x, y, r: base * .08, maxR, speed, hit: false, damaging, life: 0 });
  }

  function spawnProjectile(angle, speed, offset = 0) {
    const b = G.boss;
    G.projectiles.push({
      x: b.x + Math.cos(angle) * (base * .05) / room.w,
      y: b.y - .05 + Math.sin(angle) * (base * .05) / room.h,
      ang: angle, speed: speed + offset, r: base * .022, life: 3.4, hit: false,
      trail: [], phase: rand(TAU),
    });
    audio.tone(330, .16, .025, 'triangle', 220);
  }

  function updateBoss(dt) {
    const b = G.boss;
    if (!b) return;
    b.flash = Math.max(0, b.flash - dt);
    b.hurtKick = Math.max(0, (b.hurtKick || 0) - dt * 5);
    b.t += dt;

    if (G.progress === 'won' || b.state === 'dying') {
      b.dying += dt;
      if (b.state !== 'dying') b.state = 'dying';
      b.bob += dt;
      if (b.dying > .18 && Math.random() < dt * 22) {
        spawnParticles(b.x + rand(.05, -.05), b.y - rand(.15, .02), 1, {
          color: choose(['#ffb75b', '#d24d26', '#ffe7a6']), speed: base * .25, life: .9,
          size: rand(2.8, 1.2), glow: true, gravity: -base * .04,
        });
      }
      if (b.dying > 1.1 && !b.burst) {
        b.burst = true;
        G.shake = 14;
        spawnParticles(b.x, b.y - .09, 64, {
          color: choose(['#ffd77c', '#ff7c32', '#eae2c8', '#9f2e1b']), speed: base * .72,
          life: 1.7, size: 3, glow: true, gravity: base * .13,
        });
        audio.slam();
      }
      if (b.dying > 2.6 && G.state === 'playing') {
        G.state = 'victory';
        showEnd(true);
      }
      return;
    }

    if (b.state === 'dormant') {
      b.weapon = lerp(b.weapon, -.5, Math.min(1, dt * 2));
      return;
    }

    if (b.state === 'awaken') {
      b.roar = Math.min(1, b.roar + dt * 2);
      b.weapon = lerp(b.weapon, -1.7, Math.min(1, dt * 5));
      G.shake = Math.max(G.shake, 8 * (1 - b.t / 2.2));
      if (b.t > 1.9) {
        b.state = 'chase';
        b.t = 0;
        b.cd = 1.0;
        b.roar = 0;
        G.progress = 'boss';
        setObjective('Defeat the Cinder Warden');
      }
      return;
    }

    if (b.state === 'phaseTransition') {
      b.weapon = lerp(b.weapon, -1.9, Math.min(1, dt * 6));
      if (b.t > 1.2) {
        b.state = 'chase';
        b.t = 0;
        b.cd = .6;
      }
      return;
    }

    if (b.stun > 0) {
      b.stun -= dt;
      b.weapon = lerp(b.weapon, 1.35, Math.min(1, dt * 7));
      if (b.stun <= 0) {
        b.state = 'chase';
        b.t = 0;
        b.cd = .4;
      }
      return;
    }

    const p = G.player;
    const dist = distEnt(b, p);
    const ang = angleTo(b, p);
    const speed = base * (.13 + b.phase * .013);

    switch (b.state) {
      case 'chase': {
        b.face = p.x < b.x ? -1 : 1;
        b.cd -= dt;
        const strafe = Math.sin(G.time * 1.7) * .33;
        if (dist > base * .205) {
          moveEnt(b, ang + strafe * .22, speed, dt);
        } else if (dist < base * .13) {
          moveEnt(b, ang + Math.PI + strafe * .15, speed * .7, dt);
        } else {
          moveEnt(b, ang + Math.PI / 2 * Math.sign(Math.sin(G.time * .9)) * .3, speed * .4, dt);
        }
        b.weapon = lerp(b.weapon, -.5 + Math.sin(G.time * 2) * .07, Math.min(1, dt * 4));
        if (b.cd <= 0 && b.t > .35) {
          chooseBossAttack(dist);
        }
        break;
      }
      case 'slamWindup': {
        if (b.t < .48) b.face = p.x < b.x ? -1 : 1;
        b.weapon = lerp(b.weapon, -2.15, Math.min(1, dt * 8));
        if (b.t > .78) doSlam();
        break;
      }
      case 'slamRecover': {
        b.weapon = lerp(b.weapon, 1.05, Math.min(1, dt * 9));
        if (b.t > .6) { b.state = 'chase'; b.t = 0; b.cd = b.phase > 2 ? .55 : .9; }
        break;
      }
      case 'chargeWindup': {
        if (b.t < .5) { b.ang = ang; b.face = p.x < b.x ? -1 : 1; }
        b.weapon = lerp(b.weapon, .3, Math.min(1, dt * 5));
        if (b.t > .72) {
          b.state = 'charge';
          b.t = 0;
          b.chargeAng = b.ang;
          audio.charge();
          G.shake = 5;
        }
        break;
      }
      case 'charge': {
        moveEnt(b, b.chargeAng, base * (1.12 + b.phase * .08), dt);
        b.weapon = .55;
        spawnDust(b.x, b.y, 1);
        if (dist < bossRadius() + playerRadius() + 4) hurtPlayer(1);
        const bx = b.x, by = b.y;
        clampEnt(b, bossRadius(), .02);
        if (b.t > .7 || Math.abs(bx - b.x) < .0001 && Math.abs(by - b.y) < .0001) {
          b.state = 'chargeRecover';
          b.stun = .95;
          b.t = 0;
          G.shake = 11;
          audio.slam();
          spawnParticles(b.x, b.y, 26, {
            color: '#8b7658', speed: base * .5, life: .9, size: 3.2, gravity: base * .4, alpha: .5,
          });
          for (let i = 0; i < G.pots.length; i++) {
            if (!G.pots[i].dead && distEnt(b, G.pots[i]) < base * .12) breakPot(i);
          }
        }
        break;
      }
      case 'chargeRecover': {
        if (b.t > .25) { b.state = 'chase'; b.t = 0; b.cd = .55; }
        break;
      }
      case 'volleyWindup': {
        b.face = p.x < b.x ? -1 : 1;
        b.weapon = lerp(b.weapon, -.9, Math.min(1, dt * 6));
        if (b.t > .72) doVolley();
        break;
      }
      case 'volleyRecover': {
        b.weapon = lerp(b.weapon, -.4, Math.min(1, dt * 5));
        if (b.t > .55) { b.state = 'chase'; b.t = 0; b.cd = 1.0; }
        break;
      }
      case 'fissureWindup': {
        b.weapon = lerp(b.weapon, -1.55, Math.min(1, dt * 5));
        b.targetX = p.x; b.targetY = p.y;
        if (b.t > .8) doFissure();
        break;
      }
      case 'fissureRecover': {
        b.weapon = lerp(b.weapon, -.5, Math.min(1, dt * 5));
        if (b.t > .75) { b.state = 'chase'; b.t = 0; b.cd = 1.0; }
        break;
      }
    }
    b.bob += dt * (b.state === 'chase' ? 4 : 1.5);
    clampEnt(b, bossRadius(), .025);
  }

  function chooseBossAttack(dist) {
    const b = G.boss;
    b.t = 0;
    const r = Math.random();
    if (b.phase >= 3 && dist > base * .18 && r < .34) {
      b.state = 'fissureWindup';
      b.weapon = -1.4;
    } else if (b.phase >= 2 && dist > base * .25 && r < .65) {
      b.state = 'volleyWindup';
    } else if (dist > base * .27) {
      b.state = 'chargeWindup';
      b.ang = angleTo(b, G.player);
    } else {
      b.state = 'slamWindup';
    }
  }

  function doSlam() {
    const b = G.boss;
    const p = G.player;
    b.state = 'slamRecover';
    b.t = 0;
    b.weapon = 1.1;
    G.shake = 15;
    audio.slam();
    spawnShockwave(b.x, b.y, base * (.48 + b.phase * .035), base * .72 + b.phase * 20, true);
    if (b.phase >= 3) setTimeout(() => { if (G.state === 'playing') spawnShockwave(b.x, b.y, base * .68, base * .62, true); }, 220);
    if (distEnt(b, p) < bossRadius() + playerRadius() + base * .045) hurtPlayer(1);
    spawnParticles(b.x, b.y, 34, {
      color: choose(['#9d8766', '#5d4b38', '#d47d3e']), speed: base * .58, life: .95,
      size: 3.2, gravity: base * .55, alpha: .62,
    });
    for (let i = 0; i < G.pots.length; i++) {
      if (distEnt(b, G.pots[i]) < base * .17) breakPot(i);
    }
  }

  function doVolley() {
    const b = G.boss;
    const p = G.player;
    const aim = angleTo(b, p);
    const n = 3 + b.phase;
    const spread = .12;
    for (let i = 0; i < n; i++) {
      const a = aim + (i - (n - 1) / 2) * spread;
      spawnProjectile(a, base * (.32 + b.phase * .04), i % 2 ? base * .02 : 0);
    }
    b.state = 'volleyRecover';
    b.t = 0;
    G.shake = Math.max(G.shake, 4);
    spawnParticles(b.x, b.y - .11, 20, {
      color: '#ffae55', speed: base * .4, life: .5, size: 2.1, glow: true,
    });
  }

  function doFissure() {
    const b = G.boss;
    const p = G.player;
    const spots = [{ x: p.x, y: p.y }];
    if (b.phase >= 3) {
      spots.push({ x: clamp(p.x + .13, .08, .92), y: clamp(p.y + .02, .1, .9) });
      spots.push({ x: clamp(p.x - .13, .08, .92), y: clamp(p.y + .04, .1, .9) });
    }
    for (const s of spots) {
      G.hazards.push({ x: s.x, y: s.y, t: 0, armAt: .62, activeAt: .9, life: 2.4, r: base * .075, hit: false, seed: rand(10) });
    }
    b.state = 'fissureRecover';
    b.t = 0;
    audio.tone(63, .8, .08, 'sawtooth', 40);
  }

  function updateWisps(dt) {
    const p = G.player;
    for (let i = G.wisps.length - 1; i >= 0; i--) {
      const w = G.wisps[i];
      w.phase += dt * 3;
      w.flash = Math.max(0, w.flash - dt);
      if (w.dying > 0) {
        w.dying -= dt;
        if (w.dying <= 0) G.wisps.splice(i, 1);
        continue;
      }
      if (G.progress === 'won') {
        w.dying = .4;
        continue;
      }
      const d = distEnt(w, p);
      w.facing = Math.atan2(dyScreen(w, p), dxScreen(w, p));
      if (d > base * .045) {
        const a = angleTo(w, p) + Math.sin(w.phase) * .3;
        moveEnt(w, a, w.speed, dt);
      }
      w.x += Math.sin(w.phase * 1.3) * .0004;
      w.y += Math.cos(w.phase) * .0005;
      clampEnt(w, w.r);
      if (d < w.r + playerRadius() + 3 && w.attackCd == null || (d < w.r + playerRadius() + 3 && (w.attackCd || 0) <= 0)) {
        hurtPlayer(1);
        w.attackCd = 1.1;
      }
      if (w.attackCd != null) w.attackCd -= dt;
      if (Math.random() < dt * 8) {
        spawnParticles(w.x, w.y - .02, 1, {
          color: choose(['#ffb055', '#ff6f2d']), speed: base * .09, life: .55,
          size: rand(2.2, 1), glow: true, gravity: -base * .06,
        });
      }
    }
  }

  function updateShockwaves(dt) {
    const p = G.player;
    for (let i = G.shockwaves.length - 1; i >= 0; i--) {
      const s = G.shockwaves[i];
      s.r += s.speed * dt;
      s.life += dt;
      if (s.damaging && !s.hit && p.alive) {
        const d = Math.hypot(px(p.x) - px(s.x), py(p.y) - py(s.y));
        if (Math.abs(d - s.r) < playerRadius() + 7) {
          s.hit = true;
          hurtPlayer(1);
        }
      }
      if (s.r > s.maxR) G.shockwaves.splice(i, 1);
    }
  }

  function updateProjectiles(dt) {
    const p = G.player;
    for (let i = G.projectiles.length - 1; i >= 0; i--) {
      const o = G.projectiles[i];
      o.life -= dt;
      o.phase += dt * 10;
      o.trail.unshift({ x: o.x, y: o.y });
      if (o.trail.length > 9) o.trail.pop();
      moveEnt(o, o.ang, o.speed, dt);
      if (o.x < .02 || o.x > .98 || o.y < .02 || o.y > .98) {
        spawnParticles(o.x, o.y, 8, { color: '#ff8840', speed: base * .25, life: .4, size: 1.8, glow: true });
        G.projectiles.splice(i, 1);
        continue;
      }
      if (!o.hit && distEnt(o, p) < o.r + playerRadius() + 2) {
        o.hit = true;
        hurtPlayer(1);
        spawnParticles(o.x, o.y, 14, { color: '#ffb25e', speed: base * .36, life: .5, size: 2, glow: true });
        G.projectiles.splice(i, 1);
        continue;
      }
      if (o.life <= 0) G.projectiles.splice(i, 1);
    }
  }

  function updateHazards(dt) {
    const p = G.player;
    for (let i = G.hazards.length - 1; i >= 0; i--) {
      const h = G.hazards[i];
      h.t += dt;
      if (h.t > h.armAt && !h.armed) {
        h.armed = true;
        audio.tone(52, .5, .07, 'sawtooth', 34);
        G.shake = Math.max(G.shake, 6);
        spawnParticles(h.x, h.y, 30, {
          color: choose(['#ff8f3b', '#ffd175', '#9a2918']), speed: base * .52, life: .9,
          size: 2.6, glow: true, gravity: base * .08,
        });
        spawnShockwave(h.x, h.y, h.r * 1.25, base * .45, false);
      }
      if (h.armed && h.t < h.activeAt) {
        if (!h.hit && distToPoint(p, px(h.x), py(h.y)) < h.r + playerRadius() * .5) {
          h.hit = true;
          hurtPlayer(1);
        }
      }
      if (h.t > h.life) G.hazards.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const p = G.player;
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const u = G.pickups[i];
      u.t += dt;
      u.life -= dt;
      u.x += (u.vx || 0) * dt / Math.max(.001, room.w) * base;
      u.y += (u.vy || 0) * dt / Math.max(.001, room.h) * base;
      u.vy = (u.vy || 0) + dt * .55;
      if (u.y > .9) { u.y = .9; u.vy *= -.3; }
      const d = distEnt(u, p);
      if (d < base * .09) {
        const a = angleTo(u, p);
        moveEnt(u, a, base * .4, dt);
      }
      if (d < playerRadius() + base * .018) {
        if (u.type === 'heart') {
          if (p.hp < p.maxHp) {
            p.hp++;
            updateHUD();
            audio.pickup();
            toast('Recovered', 'A heart of ember', 1.2);
            spawnParticles(u.x, u.y, 18, {
              color: '#ffd67f', speed: base * .32, life: .8, size: 2.1, glow: true, gravity: -base * .08,
            });
            G.pickups.splice(i, 1);
          }
        } else {
          G.pickups.splice(i, 1);
        }
        continue;
      }
      if (u.life <= 0) G.pickups.splice(i, 1);
    }
  }

  // ------------------------------------------------------------
  // progression / world update
  // ------------------------------------------------------------
  function updateKeyAndGate(dt) {
    const c = G.chest;
    if (c.opening) {
      c.openT += dt;
      if (c.openT > .45 && !G.keyDrop && !c.keyTaken) {
        G.keyDrop = { x: c.x, y: c.y - .09, t: 0, collected: false };
        G.shake = Math.max(G.shake, 3);
        spawnParticles(c.x, c.y - .09, 20, {
          color: '#ffe08c', speed: base * .26, life: 1.1, size: 2.2, glow: true, gravity: -base * .04,
        });
      }
      if (c.openT > .55) c.open = true;
      if (G.keyDrop) {
        const k = G.keyDrop;
        k.t += dt;
        const p = G.player;
        if (k.t < .8) {
          k.y = c.y - .09 - Math.sin((k.t / .8) * Math.PI) * .03;
          if (Math.random() < dt * 12) {
            spawnParticles(k.x + rand(.01, -.01), k.y, 1, {
              color: '#fff0b6', speed: base * .08, life: .6, size: 1.2, glow: true,
            });
          }
        } else {
          const a = angleTo(k, p);
          moveEnt(k, a, base * .55, dt);
          if (distEnt(k, p) < base * .04) grantKey();
        }
      }
    }

    const g = G.gate;
    if (g.unlocking) {
      g.t += dt;
      g.flash = Math.min(1, g.flash + dt * 3);
      if (Math.random() < dt * 24) {
        spawnParticles(.5 + rand(.4, -.4), g.y + rand(.01, -.01), 1, {
          color: choose(['#ffd079', '#ff8a3d', '#f6ebc5']), speed: base * .2, life: .7,
          size: 2, glow: true, gravity: -base * .03,
        });
      }
      if (g.t > .9 && g.flash > .9) {
        g.flash = .99;
      }
      if (g.t > 1.02 && !g.open) {
        g.open = true;
        beginBossAwake();
      }
      if (g.t > 1.55 && G.progress === 'unlocking') {
        G.progress = 'boss';
        setObjective('Defeat the Cinder Warden');
      }
    }
  }

  function updatePrompt() {
    if (G.state !== 'playing') { setPrompt(null); return; }
    const p = G.player;
    if (!p) return;
    let showing = false;
    if (G.progress === 'seek' && !G.chest.opening && !G.chest.keyTaken &&
        distEnt(p, G.chest) < base * .14) {
      setPrompt('Open the reliquary');
      showing = true;
    }
    if (G.progress === 'unlock' && !G.gate.unlocking &&
        p.y < G.gate.y + .14) {
      setPrompt('Break the seal');
      showing = true;
    }
    if (!showing) setPrompt(null);
    if (showing && G.toastT > 0) {
      G.toastT = 0;
      dom.toast.classList.remove('show');
    }
  }

  function update(dt) {
    G.time += dt;
    updateParticles(dt);
    if (G.shake > 0) {
      G.shake = Math.max(0, G.shake - dt * 32);
      G.shakeX = rand(1, -1) * G.shake;
      G.shakeY = rand(1, -1) * G.shake;
    } else {
      G.shakeX = 0;
      G.shakeY = 0;
    }
    if (G.toastT > 0) {
      G.toastT -= dt;
      if (G.toastT <= 0) dom.toast.classList.remove('show');
    }

    if (G.state === 'falling') {
      G.deathT += dt;
      updateWisps(dt);
      updateProjectiles(dt);
      if (G.deathT > 1.8) {
        G.state = 'dead';
        showEnd(false);
      }
      return;
    }
    if (G.state === 'victory') {
      if (G.player) G.player.inv = 1;
      return;
    }
    if (G.state !== 'playing') return;

    G.intro = Math.min(1, G.intro + dt);
    G.runTime += dt;
    updateKeyAndGate(dt);
    updatePlayer(dt);
    if (G.progress === 'boss' || G.progress === 'won') updateBoss(dt);
    else if (G.boss && G.boss.state !== 'dormant') updateBoss(dt);
    updateWisps(dt);
    updateShockwaves(dt);
    updateProjectiles(dt);
    updateHazards(dt);
    updatePickups(dt);
    updatePrompt();
    updateBossUI();
    // keep player alive while the warden dies
    if (G.progress === 'won' && G.player) G.player.inv = Math.max(G.player.inv, .1);
  }

  function updateTitle(dt) {
    G.time += dt;
    updateParticles(dt);
    if (G.boss) {
      G.boss.bob += dt * 1.1;
      G.boss.flash = Math.max(0, G.boss.flash - dt);
    }
    if (G.chest) G.chest.glow = .85 + Math.sin(G.time * 1.8) * .15;
    if (G.shake > 0) {
      G.shake = Math.max(0, G.shake - dt * 32);
      G.shakeX = rand(1, -1) * G.shake;
      G.shakeY = rand(1, -1) * G.shake;
    }
    updateKeyAndGate(dt);
  }

  function startGame() {
    audio.init();
    audio.startAmbient();
    document.body.classList.add('playing');
    resetRun();
    dom.title.classList.add('hidden');
    dom.title.setAttribute('aria-hidden', 'true');
    dom.end.classList.add('hidden');
    dom.end.setAttribute('aria-hidden', 'true');
    G.intro = 0;
    toast('The vault wakes', 'Seek the reliquary', 2.6);
  }

  function replay() {
    audio.init();
    audio.startAmbient();
    document.body.classList.add('playing');
    resetRun();
    dom.end.classList.add('hidden');
    dom.end.setAttribute('aria-hidden', 'true');
    G.intro = 0;
    toast('Again, into the dark', 'Seek the reliquary', 3);
  }

  // ------------------------------------------------------------
  // events
  // ------------------------------------------------------------
  dom.startBtn.addEventListener('click', startGame);
  dom.replayBtn.addEventListener('click', replay);
  dom.attackBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); startAttack(); });
  dom.rollBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); startRoll(); });
  dom.useBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); tryInteract(); });

  const keyMap = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
  };
  addEventListener('keydown', (e) => {
    if (keyMap[e.code]) {
      keys.add(keyMap[e.code]);
      e.preventDefault();
    }
    if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyK') {
      if (e.code === 'Space') startRoll();
      else startAttack();
      e.preventDefault();
    }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
      startRoll();
      e.preventDefault();
    }
    if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) {
      if (G.state === 'title') startGame();
      else if (G.state === 'dead' || G.state === 'victory') replay();
      else tryInteract();
      e.preventDefault();
    }
    if (e.code === 'KeyM' && !e.repeat) audio.toggle();
  });
  addEventListener('keyup', (e) => {
    if (keyMap[e.code]) {
      keys.delete(keyMap[e.code]);
      e.preventDefault();
    }
  });
  addEventListener('blur', () => { keys.clear(); stick.active = false; stick.vx = stick.vy = 0; dom.stickKnob.style.transform = 'translate(-50%, -50%)'; });

  function updateStickFromEvent(e) {
    const rect = dom.stickZone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    stick.cx = cx; stick.cy = cy;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = rect.width * .31;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    dom.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    stick.vx = dx / max;
    stick.vy = dy / max;
    stick.dx = dx; stick.dy = dy;
  }
  dom.stickZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stick.active = true;
    stick.id = e.pointerId;
    try { dom.stickZone.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers */ }
    updateStickFromEvent(e);
  });
  dom.stickZone.addEventListener('pointermove', (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    e.preventDefault();
    updateStickFromEvent(e);
  });
  function releaseStick(e) {
    if (e.pointerId != null && e.pointerId !== stick.id) return;
    stick.active = false;
    stick.id = null;
    stick.vx = stick.vy = 0;
    dom.stickKnob.style.transform = 'translate(-50%, -50%)';
  }
  dom.stickZone.addEventListener('pointerup', releaseStick);
  dom.stickZone.addEventListener('pointercancel', releaseStick);
  dom.stickZone.addEventListener('lostpointercapture', releaseStick);

  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 80));

  // prevent iOS double-tap zoom / gestures on the play surface
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#game-shell')) e.preventDefault();
  });

  // ============================================================
  // RENDERING
  // ============================================================
  function buildFloorCache() {
    const s = Math.min(DPR, 1.6);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(room.w * s));
    c.height = Math.max(1, Math.round(room.h * s));
    const f = c.getContext('2d');
    f.scale(s, s);
    const rng = mulberry32(8471 + Math.round(room.w * 13) + Math.round(room.h * 7));
    const w = room.w, h = room.h;
    const sc = base;

    // deep floor base
    const bg = f.createRadialGradient(w * .5, h * .4, 0, w * .5, h * .5, Math.max(w, h) * .75);
    bg.addColorStop(0, '#333229');
    bg.addColorStop(.55, '#25251f');
    bg.addColorStop(1, '#141512');
    f.fillStyle = bg;
    f.fillRect(0, 0, w, h);

    // hand-laid flagstones
    const tileW = clamp(sc * .064, 27, 57);
    const tileH = tileW * .84;
    for (let row = -1; row < h / tileH + 2; row++) {
      for (let col = -1; col < w / tileW + 2; col++) {
        const jx = (rng() - .5) * 1.8;
        const jy = (rng() - .5) * 1.8;
        const x = col * tileW + (row % 2) * 0 + jx;
        const y = row * tileH + jy;
        const n = rng();
        const shade = 22 + n * 9;
        f.fillStyle = `hsl(${37 + rng() * 12} ${6 + rng() * 6}% ${shade}%)`;
        roundedRect(f, x + 2.4, y + 2.4, tileW - 4.8, tileH - 4.8, 1.8 + rng() * 1.4);
        f.fill();
        // bevels: light catches the upper edge, grime settles below
        f.strokeStyle = `rgba(199,180,139,${.025 + n * .045})`;
        f.lineWidth = 1;
        f.beginPath(); f.moveTo(x + 5, y + 3.3); f.lineTo(x + tileW - 5, y + 3.3); f.stroke();
        f.strokeStyle = 'rgba(0,0,0,.34)';
        f.beginPath(); f.moveTo(x + 5, y + tileH - 3.4); f.lineTo(x + tileW - 5, y + tileH - 3.4); f.stroke();
        // worn center
        if (n < .55) {
          const wg = f.createRadialGradient(x + tileW * (.5 + (rng() - .5) * .4), y + tileH * .48, 1, x + tileW / 2, y + tileH / 2, tileW * .48);
          wg.addColorStop(0, `rgba(137,122,92,${.02 + n * .035})`);
          wg.addColorStop(1, 'rgba(0,0,0,0)');
          f.fillStyle = wg;
          f.fillRect(x + 3, y + 3, tileW - 6, tileH - 6);
        }
        // cracks and chipped corners
        if (rng() < .2) {
          f.strokeStyle = 'rgba(4,4,3,.35)';
          f.lineWidth = .75;
          const sx = x + tileW * (.18 + rng() * .55);
          const sy = y + tileH * (.2 + rng() * .35);
          f.beginPath();
          f.moveTo(sx, sy);
          f.lineTo(sx + (rng() - .5) * 15, sy + 4 + rng() * 7);
          f.lineTo(sx + (rng() - .5) * 22, sy + 10 + rng() * 8);
          f.stroke();
        }
        if (rng() < .16) {
          f.fillStyle = 'rgba(6,6,5,.3)';
          f.beginPath();
          const corner = Math.floor(rng() * 4);
          const cx = x + (corner % 2 ? tileW - 5 : 5);
          const cy = y + (corner > 1 ? tileH - 5 : 5);
          f.moveTo(cx, cy);
          f.lineTo(cx + (rng() - .5) * 7, cy + 4);
          f.lineTo(cx + 4, cy + (rng() - .5) * 7);
          f.fill();
        }
        // dusty pits
        if (rng() < .22) {
          f.fillStyle = `rgba(10,9,7,${.1 + rng() * .12})`;
          ellipse(f, x + tileW * rng(), y + tileH * rng(), rng() * 3 + .6, rng() * 2 + .4, rng() * 3);
          f.fill();
        }
      }
    }

    // outer border course
    f.strokeStyle = 'rgba(6,6,5,.44)';
    f.lineWidth = 12;
    f.strokeRect(7, 7, w - 14, h - 14);
    f.strokeStyle = 'rgba(192,150,78,.18)';
    f.lineWidth = 1;
    f.strokeRect(14, 14, w - 28, h - 28);

    // central ceremonial runner
    const runX = w * .438, runW = w * .124;
    const runTop = h * .46, runBot = h * .995;
    f.save();
    f.beginPath();
    f.moveTo(runX, runTop);
    f.lineTo(runX + runW, runTop);
    f.lineTo(runX + runW - 2, runBot);
    f.lineTo(runX + 2, runBot);
    f.closePath();
    const rg = f.createLinearGradient(runX, 0, runX + runW, 0);
    rg.addColorStop(0, '#321817');
    rg.addColorStop(.18, '#522422');
    rg.addColorStop(.5, '#5b2824');
    rg.addColorStop(.82, '#4b211f');
    rg.addColorStop(1, '#2c1514');
    f.fillStyle = rg;
    f.fill();
    f.clip();
    for (let i = 0; i < 42; i++) {
      f.fillStyle = `rgba(17,8,7,${.05 + rng() * .09})`;
      f.fillRect(runX + rng() * runW, runTop + rng() * (runBot - runTop), rng() * 25 + 3, rng() * 2 + .5);
    }
    f.restore();
    f.strokeStyle = 'rgba(167,126,67,.38)';
    f.lineWidth = 1.2;
    f.beginPath(); f.moveTo(runX + 3, runTop); f.lineTo(runX + 5, runBot); f.stroke();
    f.beginPath(); f.moveTo(runX + runW - 3, runTop); f.lineTo(runX + runW - 5, runBot); f.stroke();
    f.strokeStyle = 'rgba(16,9,7,.64)';
    f.lineWidth = 2;
    f.beginPath(); f.moveTo(runX + 8, runTop); f.lineTo(runX + 10, runBot); f.stroke();
    f.beginPath(); f.moveTo(runX + runW - 8, runTop); f.lineTo(runX + runW - 10, runBot); f.stroke();
    // tattered runner edge
    for (let y = runTop + 10; y < runBot; y += 15) {
      if (rng() < .45) {
        f.fillStyle = '#13100d';
        f.beginPath(); f.moveTo(runX + 2, y); f.lineTo(runX + 2 - 4 - rng() * 4, y + 5); f.lineTo(runX + 2, y + 9); f.fill();
      }
    }

    // raised warden dais
    const dcx = w * .5, dcy = h * .255;
    for (let i = 2; i >= 0; i--) {
      const rx = w * (.286 + i * .024);
      const ry = h * (.155 + i * .014);
      f.fillStyle = i === 2 ? '#181814' : i === 1 ? '#25231d' : '#343128';
      f.beginPath(); f.ellipse(dcx, dcy + i * 4, rx, ry, 0, 0, TAU); f.fill();
      f.strokeStyle = i === 0 ? 'rgba(209,164,88,.38)' : 'rgba(5,5,4,.5)';
      f.lineWidth = i === 0 ? 1.6 : 2;
      f.stroke();
    }
    const dg = f.createRadialGradient(dcx, dcy - h * .02, 6, dcx, dcy, w * .25);
    dg.addColorStop(0, '#4e4738');
    dg.addColorStop(.52, '#3d382e');
    dg.addColorStop(.82, '#2c2922');
    dg.addColorStop(1, '#201e19');
    f.fillStyle = dg;
    f.beginPath(); f.ellipse(dcx, dcy, w * .252, h * .142, 0, 0, TAU); f.fill();
    f.strokeStyle = 'rgba(209,160,83,.34)';
    f.lineWidth = 1;
    f.beginPath(); f.ellipse(dcx, dcy, w * .232, h * .128, 0, 0, TAU); f.stroke();
    // radial dais joints and worn gold inlay
    f.strokeStyle = 'rgba(8,7,6,.3)';
    f.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + .12;
      f.beginPath();
      f.moveTo(dcx + Math.cos(a) * w * .07, dcy + Math.sin(a) * h * .038);
      f.lineTo(dcx + Math.cos(a) * w * .235, dcy + Math.sin(a) * h * .13);
      f.stroke();
    }
    f.strokeStyle = 'rgba(219,173,93,.17)';
    f.lineWidth = 2.4;
    f.beginPath(); f.ellipse(dcx, dcy, w * .205, h * .113, 0, 0, TAU); f.stroke();
    // hairline cracks across the dais
    f.strokeStyle = 'rgba(4,4,3,.42)';
    f.lineWidth = 1.1;
    for (let i = 0; i < 4; i++) {
      const a0 = rng() * TAU;
      const rr = w * (.12 + rng() * .1);
      f.beginPath();
      f.moveTo(dcx + Math.cos(a0) * rr, dcy + Math.sin(a0) * rr * .54);
      f.lineTo(dcx + Math.cos(a0 + .12) * rr * 1.15, dcy + Math.sin(a0 + .12) * rr * .66);
      f.lineTo(dcx + Math.cos(a0 + .05) * rr * 1.34, dcy + Math.sin(a0 + .05) * rr * .78);
      f.stroke();
    }

    // large northern warding sigil
    const cx = w * .5, cy = h * .225;
    const R = Math.min(w, h) * .183;
    f.save();
    f.translate(cx, cy);
    f.strokeStyle = 'rgba(189,142,73,.18)';
    f.lineWidth = 1.3;
    [1, .86, .5, .34].forEach((k, i) => {
      f.beginPath(); f.arc(0, 0, R * k, 0, TAU); f.stroke();
    });
    f.strokeStyle = 'rgba(224,174,86,.13)';
    f.setLineDash([2, 11]);
    f.beginPath(); f.arc(0, 0, R * .69, 0, TAU); f.stroke();
    f.setLineDash([]);
    for (let i = 0; i < 12; i++) {
      f.save();
      f.rotate(i / 12 * TAU);
      f.translate(0, -R * .78);
      f.rotate(Math.PI / 2);
      f.strokeStyle = 'rgba(212,162,80,.18)';
      f.lineWidth = 1;
      f.beginPath();
      f.moveTo(-4, -6); f.lineTo(4, -3); f.lineTo(-2, 3); f.lineTo(5, 7);
      f.stroke();
      f.restore();
    }
    // eight-point star / compass
    f.strokeStyle = 'rgba(217,165,82,.17)';
    f.beginPath();
    f.moveTo(0, -R * .4); f.lineTo(R * .08, -R * .08); f.lineTo(R * .4, 0); f.lineTo(R * .08, R * .08);
    f.lineTo(0, R * .4); f.lineTo(-R * .08, R * .08); f.lineTo(-R * .4, 0); f.lineTo(-R * .08, -R * .08);
    f.closePath();
    f.stroke();
    f.restore();

    // southern entry medallion
    f.save();
    f.translate(w * .5, h * .845);
    f.strokeStyle = 'rgba(207,161,86,.15)';
    f.lineWidth = 1;
    f.beginPath(); f.arc(0, 0, Math.min(w, h) * .105, 0, TAU); f.stroke();
    f.beginPath(); f.arc(0, 0, Math.min(w, h) * .083, 0, TAU); f.stroke();
    for (let i = 0; i < 8; i++) {
      f.save(); f.rotate(i / 8 * TAU); f.translate(0, -Math.min(w, h) * .094);
      f.fillStyle = 'rgba(213,168,92,.18)';
      f.beginPath(); f.moveTo(0, -4); f.lineTo(3, 0); f.lineTo(0, 4); f.lineTo(-3, 0); f.fill();
      f.restore();
    }
    f.restore();

    // gate threshold
    const gy = h * G.gate.y;
    const grad = f.createLinearGradient(0, gy - 15, 0, gy + 15);
    grad.addColorStop(0, 'rgba(13,11,9,.65)');
    grad.addColorStop(.5, 'rgba(71,62,47,.72)');
    grad.addColorStop(1, 'rgba(7,7,6,.7)');
    f.fillStyle = grad;
    f.fillRect(w * .06, gy - 13, w * .88, 26);
    f.strokeStyle = 'rgba(204,156,78,.3)';
    f.lineWidth = 1;
    f.beginPath(); f.moveTo(w * .08, gy - 13); f.lineTo(w * .92, gy - 13); f.stroke();
    f.beginPath(); f.moveTo(w * .08, gy + 13); f.lineTo(w * .92, gy + 13); f.stroke();
    for (let i = 0; i < 15; i++) {
      const gx = w * .1 + i * w * .057;
      f.fillStyle = 'rgba(223,177,96,.17)';
      f.save(); f.translate(gx, gy); f.rotate(Math.PI / 4); f.fillRect(-2, -2, 4, 4); f.restore();
    }

    // edge damp, moss, and deep shadow
    const edgeG = f.createLinearGradient(0, 0, 0, h);
    edgeG.addColorStop(0, 'rgba(5,7,5,.42)');
    edgeG.addColorStop(.14, 'rgba(5,7,5,0)');
    edgeG.addColorStop(.88, 'rgba(4,4,3,0)');
    edgeG.addColorStop(1, 'rgba(4,4,3,.32)');
    f.fillStyle = edgeG; f.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const edge = rng();
      let x, y;
      if (edge < .34) { x = rng() * w; y = rng() * h * .04; }
      else if (edge < .68) { x = rng() * w * .035; y = rng() * h; }
      else { x = w - rng() * w * .035; y = rng() * h; }
      f.fillStyle = `rgba(60,80,43,${.04 + rng() * .06})`;
      ellipse(f, x, y, rng() * 20 + 5, rng() * 10 + 3, rng() * 3);
      f.fill();
    }
    // broad grime, soot, and old damp
    for (let i = 0; i < 46; i++) {
      const gx = rng() * w, gy = rng() * h;
      const rr = (rng() * 60 + 10);
      const sg = f.createRadialGradient(gx, gy, 0, gx, gy, rr);
      const dark = rng() < .58;
      sg.addColorStop(0, dark ? `rgba(6,6,5,${.08 + rng() * .1})` : `rgba(74,86,49,${.018 + rng() * .035})`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = sg;
      f.beginPath(); f.ellipse(gx, gy, rr, rr * (.35 + rng() * .4), rng() * 3, 0, TAU); f.fill();
    }
    // pooled shadow and warm center
    const ao = f.createRadialGradient(w * .5, h * .46, Math.min(w, h) * .16, w * .5, h * .5, Math.max(w, h) * .76);
    ao.addColorStop(0, 'rgba(4,4,3,0)');
    ao.addColorStop(.6, 'rgba(4,4,3,.05)');
    ao.addColorStop(1, 'rgba(3,3,2,.28)');
    f.fillStyle = ao; f.fillRect(0, 0, w, h);
    // little ash drifts near the walls
    for (let i = 0; i < 14; i++) {
      const ax = rng() < .5 ? rng() * w * .12 : w - rng() * w * .12;
      const ay = h * (.18 + rng() * .72);
      const ag = f.createRadialGradient(ax, ay, 0, ax, ay, 22 + rng() * 24);
      ag.addColorStop(0, 'rgba(133,124,105,.08)');
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = ag;
      f.beginPath(); f.ellipse(ax, ay, 24 + rng() * 20, 6 + rng() * 7, rng() * 3, 0, TAU); f.fill();
    }
    // dust / ash specks
    for (let i = 0; i < 160; i++) {
      f.fillStyle = `rgba(${170 + rng() * 30},${150 + rng() * 20},${110 + rng() * 20},${.03 + rng() * .08})`;
      f.fillRect(rng() * w, rng() * h, rng() * 1.4 + .3, rng() * 1.2 + .3);
    }
    floorCache = c;
  }

  function drawBackdrop() {
    const g = ctx.createRadialGradient(W * .5, H * .38, 0, W * .5, H * .5, Math.max(W, H) * .72);
    g.addColorStop(0, '#211b14');
    g.addColorStop(.48, '#0c0b09');
    g.addColorStop(1, '#040404');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // faint distant stonework outside the room
    ctx.save();
    ctx.globalAlpha = .2;
    ctx.strokeStyle = '#3d3528';
    ctx.lineWidth = 1;
    const step = Math.max(48, base * .1);
    for (let y = 0; y < H; y += step * 1.2) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      for (let x = ((y / step) % 2) * step * .5; x < W; x += step) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + step * 1.2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawWalls() {
    const wall = room.wall;
    const x = room.x, y = room.y, w = room.w, h = room.h;
    const rng = mulberry32(981);

    // outer mass (a ring, so the floor remains visible below)
    ctx.fillStyle = '#070706';
    ctx.fillRect(x - wall * 1.45, y - wall * 1.45, w + wall * 2.9, wall * 1.45);
    ctx.fillRect(x - wall * 1.45, y + h, w + wall * 2.9, wall * 1.7);
    ctx.fillRect(x - wall * 1.45, y, wall * 1.45, h);
    ctx.fillRect(x + w, y, wall * 1.45, h);

    // top wall face
    const tg = ctx.createLinearGradient(0, y - wall, 0, y);
    tg.addColorStop(0, '#171611');
    tg.addColorStop(.45, '#302d24');
    tg.addColorStop(1, '#1a1914');
    ctx.fillStyle = tg;
    ctx.fillRect(x - wall, y - wall, w + wall * 2, wall);
    // top wall bricks
    const bh = wall / 3.1;
    for (let r = 0; r < 4; r++) {
      const by = y - wall + r * bh;
      const off = (r % 2) * 24;
      for (let bx = x - wall + off; bx < x + w + wall; bx += 48) {
        if (bx + 46 < x - wall || bx > x + w + wall) continue;
        ctx.fillStyle = `rgba(${58 + rng() * 20},${53 + rng() * 17},${42 + rng() * 14},${.18 + rng() * .2})`;
        ctx.fillRect(bx + 1, by + 1, 45, bh - 2);
        ctx.strokeStyle = 'rgba(0,0,0,.34)';
        ctx.strokeRect(bx + 1.5, by + 1.5, 44, bh - 3);
      }
    }
    const topShadow = ctx.createLinearGradient(0, y - wall, 0, y + 18);
    topShadow.addColorStop(0, 'rgba(0,0,0,.72)');
    topShadow.addColorStop(.55, 'rgba(0,0,0,.15)');
    topShadow.addColorStop(1, 'rgba(0,0,0,.34)');
    ctx.fillStyle = topShadow;
    ctx.fillRect(x - wall, y - wall, w + wall * 2, wall + 18);

    // top edge highlight
    ctx.fillStyle = 'rgba(173,148,108,.2)';
    ctx.fillRect(x - wall, y - wall - 1, w + wall * 2, 1.5);
    ctx.fillStyle = 'rgba(0,0,0,.68)';
    ctx.fillRect(x - wall, y - wall - 4, w + wall * 2, 3);

    // side walls
    const sg = ctx.createLinearGradient(x - wall, 0, x, 0);
    sg.addColorStop(0, '#0a0907');
    sg.addColorStop(.72, '#1d1b15');
    sg.addColorStop(1, '#2b281f');
    ctx.fillStyle = sg;
    ctx.fillRect(x - wall, y, wall, h);
    const sg2 = ctx.createLinearGradient(x + w, 0, x + w + wall, 0);
    sg2.addColorStop(0, '#2b281f');
    sg2.addColorStop(.3, '#1d1b15');
    sg2.addColorStop(1, '#080806');
    ctx.fillStyle = sg2;
    ctx.fillRect(x + w, y, wall, h);

    // side block seams
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.lineWidth = 1;
    for (let sy = y; sy < y + h; sy += wall * .62) {
      ctx.beginPath(); ctx.moveTo(x - wall, sy); ctx.lineTo(x, sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w, sy + wall * .31); ctx.lineTo(x + w + wall, sy + wall * .31); ctx.stroke();
    }
    for (let sy = y; sy < y + h; sy += wall * 1.24) {
      ctx.beginPath(); ctx.moveTo(x - wall * .43, sy); ctx.lineTo(x - wall * .43, sy + wall * .62); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w + wall * .5, sy + wall * .2); ctx.lineTo(x + w + wall * .5, sy + wall * .82); ctx.stroke();
    }

    // bottom wall lip
    const bg = ctx.createLinearGradient(0, y + h, 0, y + h + wall * .55);
    bg.addColorStop(0, '#27241c');
    bg.addColorStop(1, '#070706');
    ctx.fillStyle = bg;
    ctx.fillRect(x - wall, y + h, w + wall * 2, wall * .55);
    ctx.fillStyle = 'rgba(177,149,102,.18)';
    ctx.fillRect(x - wall, y + h, w + wall * 2, 1.3);

    // inner lip lighting
    const inner = ctx.createLinearGradient(0, y, 0, y + 34);
    inner.addColorStop(0, 'rgba(0,0,0,.66)');
    inner.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = inner;
    ctx.fillRect(x, y, w, 34);
    const innerL = ctx.createLinearGradient(x, 0, x + 28, 0);
    innerL.addColorStop(0, 'rgba(0,0,0,.5)');
    innerL.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = innerL;
    ctx.fillRect(x, y, 28, h);
    const innerR = ctx.createLinearGradient(x + w, 0, x + w - 28, 0);
    innerR.addColorStop(0, 'rgba(0,0,0,.5)');
    innerR.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = innerR;
    ctx.fillRect(x + w - 28, y, 28, h);

    // gold trim line along floor
    ctx.strokeStyle = 'rgba(187,145,75,.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);

    // rear wall crest
    const cx = x + w / 2;
    const cy = y - wall * .52;
    ctx.save();
    ctx.translate(cx, cy);
    glow(ctx, 0, 0, wall * 1.9, 'rgba(221,119,49,.14)', 1);
    ctx.strokeStyle = 'rgba(213,168,94,.34)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, wall * .36, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, wall * .27, 0, TAU); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i / 8 * TAU); ctx.translate(0, -wall * .31);
      ctx.fillStyle = 'rgba(225,174,90,.38)';
      ctx.beginPath(); ctx.moveTo(0, -wall * .07); ctx.lineTo(wall * .035, 0); ctx.lineTo(0, wall * .07); ctx.lineTo(-wall * .035, 0); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(40,28,18,.9)';
    ctx.beginPath(); ctx.arc(0, 0, wall * .16, 0, TAU); ctx.fill();
    glow(ctx, 0, 0, wall * .14, 'rgba(255,143,53,.6)', 1);
    ctx.restore();

    // banners are drawn live so they keep swaying over the cached walls
    if (!wallCaching) drawBanners();

    // chains
    ctx.strokeStyle = 'rgba(139,119,82,.21)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const chx = x + w * (.2 + i * .075);
      const len = 16 + (i % 3) * 9;
      ctx.beginPath(); ctx.moveTo(chx, y - wall); ctx.lineTo(chx, y - wall + len); ctx.stroke();
    }
  }

  function drawBanner(x, top, w, bottom, flip) {
    ctx.save();
    ctx.translate(x, top);
    const sway = Math.sin(G.time * .6 + x * .01) * 2.5;
    const h = bottom - top;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.quadraticCurveTo(w / 2 + sway, h * .48, w * .38 + sway, h * .88);
    ctx.lineTo(w * .12 + sway, h);
    ctx.lineTo(0, h * .86);
    ctx.lineTo(-w * .12 + sway, h);
    ctx.lineTo(-w * .38 + sway, h * .88);
    ctx.quadraticCurveTo(-w / 2 + sway, h * .48, -w / 2, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, '#251b19');
    g.addColorStop(.25, '#4f2624');
    g.addColorStop(.55, '#642e29');
    g.addColorStop(.8, '#35201e');
    g.addColorStop(1, '#1c1513');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(177,132,67,.29)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // emblem
    ctx.translate(sway * .3, h * .32);
    ctx.strokeStyle = 'rgba(214,167,86,.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, w * .19, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -w * .19); ctx.lineTo(w * .08, 0); ctx.lineTo(0, w * .19); ctx.lineTo(-w * .08, 0); ctx.closePath();
    ctx.stroke();
    // wear
    ctx.fillStyle = 'rgba(20,10,8,.3)';
    for (let i = 0; i < 11; i++) {
      ctx.fillRect(-w / 2 + (i * 31 % w), h * ((i * .173) % .95), 2, 10 + i * 3);
    }
    ctx.restore();
  }

  function drawBanners() {
    const x = room.x, y = room.y, w = room.w, h = room.h, wall = room.wall;
    const bannerW = Math.min(w * .085, 76);
    drawBanner(x + w * .14, y - wall * .8, bannerW, y + h * .19, false);
    drawBanner(x + w * .86, y - wall * .8, bannerW, y + h * .19, true);
  }

  function buildWallCache() {
    if (W < 2 || H < 2) { wallCache = null; return; }
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * DPR));
    c.height = Math.max(1, Math.round(H * DPR));
    const g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const prev = ctx;
    ctx = g;
    wallCaching = true;
    try { drawWalls(); } finally { wallCaching = false; ctx = prev; }
    wallCache = c;
  }

  function drawFloor() {
    if (!floorCache) return;
    ctx.drawImage(floorCache, room.x, room.y, room.w, room.h);
    // pulsing dust motes on the stone
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of G.motes) {
      const a = .018 + .04 * (0.5 + Math.sin(G.time * 1.2 + m.ph) * .5);
      ctx.fillStyle = `rgba(236,206,151,${a})`;
      ctx.beginPath(); ctx.arc(px(m.x), py(m.y), m.size, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawRubble() {
    const clusters = [
      { x: .095, y: .905, s: 1.2, seed: 4 },
      { x: .89, y: .865, s: 1.05, seed: 11 },
      { x: .055, y: .61, s: .9, seed: 19 },
      { x: .945, y: .57, s: .8, seed: 23 },
      { x: .235, y: .585, s: .6, seed: 31 },
    ];
    const sBase = clamp(base / 690, .55, 1.06);
    for (const cl of clusters) {
      const pos = { x: px(cl.x), y: py(cl.y) };
      const rng = mulberry32(600 + cl.seed * 17);
      const s = sBase * cl.s;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ellipse(ctx, 0, 1, 25 * s, 7 * s); ctx.fill();
      for (let i = 0; i < 8; i++) {
        const rx = (rng() - .5) * 37 * s;
        const ry = (rng() - .5) * 12 * s;
        const rw = (6 + rng() * 11) * s;
        const rh = (4 + rng() * 7) * s;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(rng() * 3);
        const g = ctx.createLinearGradient(0, -rh, 0, rh);
        g.addColorStop(0, '#555043');
        g.addColorStop(.5, '#3a352c');
        g.addColorStop(1, '#1a1814');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-rw * .5, -rh * .3);
        ctx.lineTo(-rw * .2, -rh * .7);
        ctx.lineTo(rw * .42, -rh * .42);
        ctx.lineTo(rw * .52, rh * .25);
        ctx.lineTo(-rw * .15, rh * .55);
        ctx.lineTo(-rw * .55, rh * .15);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(180,158,119,.12)'; ctx.lineWidth = .7; ctx.stroke();
        ctx.restore();
      }
      // old bones curled among the stones
      if (cl.seed % 2) {
        ctx.strokeStyle = 'rgba(181,168,137,.27)';
        ctx.lineWidth = 2.1 * s;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(8 * s, -3 * s); ctx.quadraticCurveTo(19 * s, -9 * s, 26 * s, -2 * s); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = 'rgba(185,171,139,.25)';
          ctx.beginPath(); ctx.arc((14 + i * 3) * s, (-7 + Math.sin(i) * 1.5) * s, 2.1 * s, 0, TAU); ctx.fill();
        }
      }
      // deep green creeping moss
      ctx.fillStyle = 'rgba(55,73,41,.2)';
      for (let i = 0; i < 4; i++) {
        ellipse(ctx, (rng() - .5) * 38 * s, (rng() - .3) * 8 * s, 7 * s, 3 * s, rng() * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawChains() {
    const s = clamp(base / 700, .55, 1.08);
    for (const c of [{ x: .245, y: .065, len: .16 }, { x: .755, y: .065, len: .18 }, { x: .13, y: .065, len: .1 }]) {
      const x = px(c.x);
      const yTop = py(c.y) - room.wall * .5;
      const len = room.h * c.len;
      ctx.save();
      ctx.strokeStyle = 'rgba(111,98,76,.33)';
      ctx.lineWidth = 1.2;
      let swing = Math.sin(G.time * .7 + c.x * 20) * 2.5;
      for (let i = 0; i < len / (9 * s); i++) {
        const yy = yTop + i * 9 * s;
        const xx = x + Math.sin(i * .5) * swing * .35;
        ctx.beginPath();
        ctx.ellipse(xx, yy, 2.1 * s, 3.9 * s, 0, 0, TAU);
        ctx.stroke();
      }
      // hook at the end
      ctx.beginPath();
      ctx.arc(x + swing * .3, yTop + len, 4 * s, 1.2, 4.4);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawAtmosphere() {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const t = G.time * .07;
    // low creeping mist
    for (let i = 0; i < 3; i++) {
      const x = px(.2 + i * .3 + Math.sin(t + i * 2) * .06);
      const y = py(.83 - i * .035);
      const rx = room.w * .44;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
      g.addColorStop(0, 'rgba(114,107,90,.018)');
      g.addColorStop(.55, 'rgba(88,82,69,.014)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, rx, room.h * .12, 0, 0, TAU); ctx.fill();
    }
    // fire-lit haze in the north
    const hg = ctx.createLinearGradient(0, py(.08), 0, py(.44));
    hg.addColorStop(0, 'rgba(124,68,33,.04)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(room.x, py(.08), room.w, room.h * .36);
    ctx.restore();
  }

  function drawChest() {

    const c = G.chest;
    if (!c) return;
    const pos = entPos(c);
    const s = clamp(base / 580, .62, 1.25);
    const open = c.openT > 0 ? clamp(c.openT / .58, 0, 1) : 0;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ellipse(ctx, 2, 1, 33 * s, 11 * s, 0);
    ctx.fill();
    // base
    const g = ctx.createLinearGradient(0, -40 * s, 0, 5 * s);
    g.addColorStop(0, '#b48a4b');
    g.addColorStop(.38, '#7a542d');
    g.addColorStop(1, '#3c2a17');
    ctx.fillStyle = g;
    roundedRect(ctx, -30 * s, -28 * s, 60 * s, 32 * s, 3 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(238,200,124,.44)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // stone front plate
    ctx.fillStyle = '#2a241a';
    roundedRect(ctx, -24 * s, -17 * s, 48 * s, 19 * s, 2 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(213,165,84,.28)';
    ctx.stroke();
    // gold bands
    ctx.fillStyle = '#c79a52';
    for (const bx of [-20, 17]) {
      ctx.fillRect(bx * s, -28 * s, 3.5 * s, 32 * s);
      ctx.fillStyle = 'rgba(255,226,157,.3)';
      ctx.fillRect(bx * s, -28 * s, 1 * s, 32 * s);
      ctx.fillStyle = '#c79a52';
    }
    // lock
    const pulse = .65 + Math.sin(G.time * 2.3) * .2;
    glow(ctx, 0, -10 * s, 17 * s, `rgba(255,159,59,${.27 * pulse})`, 1);
    ctx.fillStyle = '#d8b36e';
    ctx.beginPath(); ctx.arc(0, -10 * s, 5.4 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3f2511';
    ctx.beginPath(); ctx.arc(0, -10 * s, 2.2 * s, 0, TAU); ctx.fill();
    ctx.fillRect(-.7 * s, -10 * s, 1.4 * s, 5 * s);
    // lid, hinged at back
    ctx.save();
    ctx.translate(0, -28 * s);
    ctx.rotate(-open * .86);
    const lg = ctx.createLinearGradient(0, -17 * s, 0, 4 * s);
    lg.addColorStop(0, '#c59a51');
    lg.addColorStop(.5, '#7d552a');
    lg.addColorStop(1, '#4e341b');
    ctx.fillStyle = lg;
    roundedRect(ctx, -31 * s, -15 * s, 62 * s, 17 * s, 3 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250,215,139,.52)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,232,166,.16)';
    roundedRect(ctx, -27 * s, -13 * s, 54 * s, 5 * s, 2 * s); ctx.fill();
    // crest
    ctx.strokeStyle = 'rgba(241,200,113,.55)';
    ctx.beginPath(); ctx.arc(0, -5 * s, 5 * s, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -9 * s); ctx.lineTo(3 * s, -5 * s); ctx.lineTo(0, -1 * s); ctx.lineTo(-3 * s, -5 * s); ctx.closePath(); ctx.stroke();
    ctx.restore();
    // inner glow
    if (open > .05) {
      glow(ctx, 0, -28 * s, 33 * s, 'rgba(255,184,83,.35)', 1);
    }
    // key floating
    if (G.keyDrop) {
      drawKey(G.keyDrop, s);
    }
    // little candles flanking
    drawCandle(-39 * s, -4 * s, s, .5);
    drawCandle(39 * s, -5 * s, s, 1.8);
    ctx.restore();
  }

  function drawCandle(x, y, s, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#3d372b';
    ctx.fillRect(-2.6 * s, -9 * s, 5.2 * s, 9 * s);
    ctx.fillStyle = '#cdbb8a';
    ctx.fillRect(-1.5 * s, -14 * s, 3 * s, 6 * s);
    const flick = 1 + Math.sin(G.time * 9 + seed) * .14;
    glow(ctx, 0, -18 * s, 10 * s * flick, 'rgba(255,167,70,.42)', 1);
    ctx.fillStyle = '#ffd072';
    ctx.beginPath(); ctx.ellipse(0, -17 * s, 1.8 * s, 4.2 * s * flick, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff3c2';
    ctx.beginPath(); ctx.ellipse(0, -16 * s, .75 * s, 2 * s, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawKey(k, s) {
    const pos = entPos(k);
    const bob = Math.sin(G.time * 3.2) * 3 * s;
    ctx.save();
    ctx.translate(pos.x, pos.y + bob);
    glow(ctx, 0, 0, 34 * s, 'rgba(255,191,83,.36)', 1);
    ctx.rotate(-.32 + Math.sin(G.time * 1.3) * .06);
    ctx.scale(s, s);
    ctx.strokeStyle = '#f7d987';
    ctx.lineWidth = 3.1;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-8, 0, 6.2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#b77e30';
    ctx.lineWidth = 4.3;
    ctx.beginPath(); ctx.arc(-8, 0, 6.2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffe49a';
    ctx.lineWidth = 2.1;
    ctx.beginPath(); ctx.arc(-8, 0, 6.2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#d7a84f';
    ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(16, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(10, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(15, 4); ctx.stroke();
    ctx.strokeStyle = '#fff2c6';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-1, -1.2); ctx.lineTo(14, -1.2); ctx.stroke();
    ctx.restore();
    // twinkles
    for (let i = 0; i < 3; i++) {
      const a = G.time * 1.7 + i * 2.1;
      const r = 17 + Math.sin(a * 1.3) * 5;
      ctx.fillStyle = `rgba(255,247,204,${.22 + .3 * (0.5 + Math.sin(a * 2) * .5)})`;
      ctx.beginPath(); ctx.arc(pos.x + Math.cos(a) * r * s, pos.y + Math.sin(a) * r * s, 1.2 * s, 0, TAU); ctx.fill();
    }
  }

  function drawPot(pot) {
    if (!pot || pot.dead) return;
    const pos = entPos(pot);
    const s = clamp(base / 550, .6, 1.16);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ellipse(ctx, 1, 1, 13 * s, 4.6 * s); ctx.fill();
    const g = ctx.createLinearGradient(-10 * s, 0, 11 * s, 0);
    g.addColorStop(0, '#4b3327');
    g.addColorStop(.38, '#866040');
    g.addColorStop(.65, '#6f4b32');
    g.addColorStop(1, '#33241b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-7 * s, -1 * s);
    ctx.bezierCurveTo(-13 * s, -10 * s, -11 * s, -26 * s, -4.5 * s, -30 * s);
    ctx.lineTo(4.5 * s, -30 * s);
    ctx.bezierCurveTo(11 * s, -26 * s, 13 * s, -10 * s, 7 * s, -1 * s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,9,.52)'; ctx.lineWidth = 1; ctx.stroke();
    // rim
    ctx.fillStyle = '#896746';
    ctx.beginPath(); ctx.ellipse(0, -29 * s, 6.5 * s, 2.3 * s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(216,180,123,.27)'; ctx.stroke();
    // handles
    ctx.strokeStyle = '#66452e'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.arc(-8 * s, -22 * s, 6 * s, 1.3, 4.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(8 * s, -22 * s, 6 * s, -1.6, 1.7); ctx.stroke();
    // painted band
    ctx.strokeStyle = 'rgba(205,157,78,.28)'; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.ellipse(0, -8 * s, 7.2 * s, 2.6 * s, 0, 0, TAU); ctx.stroke();
    // painted mark
    ctx.strokeStyle = 'rgba(217,171,92,.25)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -22 * s); ctx.lineTo(4 * s, -16 * s); ctx.lineTo(0, -10 * s); ctx.lineTo(-4 * s, -16 * s); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,225,164,.14)';
    ctx.beginPath(); ctx.ellipse(-3.5 * s, -20 * s, 1.6 * s, 6 * s, -.3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBrazier(b) {
    const pos = entPos(b);
    const s = clamp(base / 700, .55, 1.08);
    const f = 1 + Math.sin(G.time * 7 + b.seed) * .1 + Math.sin(G.time * 13 + b.seed * 2) * .05;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = 'rgba(0,0,0,.33)';
    ellipse(ctx, 0, 1, 16 * s, 5 * s); ctx.fill();
    // pedestal
    const g = ctx.createLinearGradient(-11 * s, 0, 11 * s, 0);
    g.addColorStop(0, '#17140f');
    g.addColorStop(.38, '#57503e');
    g.addColorStop(.63, '#3a3428');
    g.addColorStop(1, '#12100d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-7 * s, 0); ctx.lineTo(7 * s, 0); ctx.lineTo(5 * s, -20 * s); ctx.lineTo(-5 * s, -20 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3b3529';
    ctx.beginPath(); ctx.ellipse(0, -21 * s, 11 * s, 3.8 * s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(202,160,92,.28)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#17130e';
    ctx.beginPath(); ctx.ellipse(0, -22 * s, 7.5 * s, 2.2 * s, 0, 0, TAU); ctx.fill();
    // flame
    ctx.save();
    ctx.translate(0, -25 * s);
    for (let i = 0; i < 3; i++) {
      const w = (8 - i * 2) * s;
      const h = (23 - i * 3) * s * f;
      const g2 = ctx.createLinearGradient(0, -h, 0, 0);
      g2.addColorStop(0, 'rgba(255,240,181,.95)');
      g2.addColorStop(.35, 'rgba(255,183,70,.9)');
      g2.addColorStop(.75, 'rgba(220,81,31,.56)');
      g2.addColorStop(1, 'rgba(110,30,16,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.bezierCurveTo(w, -h * .56, w * 1.15, -h * .15, 0, 0);
      ctx.bezierCurveTo(-w * 1.1, -h * .18, -w * .9, -h * .58, 0, -h);
      ctx.fill();
      ctx.translate(Math.sin(G.time * 4 + i) * 1.2, 1);
    }
    ctx.restore();
    glow(ctx, 0, -35 * s, 35 * s, 'rgba(255,137,52,.34)', 1);
    ctx.restore();
  }

  function drawWallTorches() {
    const s = clamp(base / 700, .58, 1.1);
    for (const t of G.torches) {
      const pos = entPos(t);
      const flick = 1 + Math.sin(G.time * 10 + t.seed) * .12 + Math.sin(G.time * 17 + t.seed * 2) * .06;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      if (t.side === 'top') {
        // bracket
        ctx.strokeStyle = '#554a36'; ctx.lineWidth = 2.1;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 7); ctx.stroke();
        ctx.fillStyle = '#725d3d';
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(3, 7); ctx.lineTo(-3, 7); ctx.closePath(); ctx.fill();
      } else {
        const dir = t.side === 'left' ? 1 : -1;
        ctx.scale(dir, 1);
        ctx.strokeStyle = '#554a36'; ctx.lineWidth = 2.1;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, 0); ctx.stroke();
        ctx.fillStyle = '#725d3d';
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.lineTo(-7, 3); ctx.lineTo(-7, -3); ctx.closePath(); ctx.fill();
      }
      // flame
      const h = 17 * s * flick;
      ctx.save();
      ctx.translate(0, 3);
      const fg = ctx.createLinearGradient(0, -h, 0, 3);
      fg.addColorStop(0, 'rgba(255,241,190,.95)');
      fg.addColorStop(.4, 'rgba(255,170,60,.85)');
      fg.addColorStop(1, 'rgba(120,34,16,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.bezierCurveTo(6 * s, -h * .55, 5 * s, -h * .1, 0, 2);
      ctx.bezierCurveTo(-5 * s, -h * .1, -6 * s, -h * .55, 0, -h);
      ctx.fill();
      ctx.restore();
      glow(ctx, 0, 0, 26 * s, 'rgba(255,128,43,.28)', 1);
      ctx.restore();
    }
  }

  function drawGatePylons() {
    const pyy = py(G.gate.y);
    const s = clamp(base / 700, .58, 1.08);
    for (const gx of [.085, .915]) {
      const x = px(gx);
      ctx.save();
      ctx.translate(x, pyy);
      ctx.fillStyle = 'rgba(0,0,0,.36)';
      ellipse(ctx, 0, 3 * s, 16 * s, 5 * s); ctx.fill();
      const g = ctx.createLinearGradient(-12 * s, 0, 12 * s, 0);
      g.addColorStop(0, '#312c22');
      g.addColorStop(.45, '#746548');
      g.addColorStop(.65, '#4b4230');
      g.addColorStop(1, '#1c1913');
      ctx.fillStyle = g;
      roundedRect(ctx, -10 * s, -44 * s, 20 * s, 47 * s, 2 * s); ctx.fill();
      ctx.strokeStyle = 'rgba(216,170,90,.26)'; ctx.lineWidth = 1; ctx.stroke();
      // cap
      ctx.fillStyle = '#5d513a';
      roundedRect(ctx, -13 * s, -50 * s, 26 * s, 8 * s, 2 * s); ctx.fill();
      ctx.strokeStyle = 'rgba(235,196,120,.35)'; ctx.stroke();
      // rune
      glow(ctx, 0, -20 * s, 16 * s, 'rgba(255,156,57,.25)', 1);
      ctx.strokeStyle = 'rgba(255,197,94,.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -29 * s); ctx.lineTo(4 * s, -20 * s); ctx.lineTo(0, -12 * s); ctx.lineTo(-4 * s, -20 * s); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  }

  function drawBarrier() {
    const gate = G.gate;
    if (gate.open && !gate.unlocking) return;
    let opacity = 1;
    if (gate.unlocking) opacity = clamp(1 - gate.t / 1.3, 0, 1);
    if (opacity <= 0) return;
    const y = py(gate.y);
    const x0 = px(.105), x1 = px(.895);
    const hh = clamp(base * .165, 62, 120);
    const t = G.time;
    const width = x1 - x0;
    ctx.save();
    ctx.globalAlpha = opacity;

    // the floor is scorched where the seal touches it
    const scorch = ctx.createRadialGradient((x0 + x1) / 2, y, width * .1, (x0 + x1) / 2, y, width * .62);
    scorch.addColorStop(0, 'rgba(255,129,43,.13)');
    scorch.addColorStop(.55, 'rgba(115,52,24,.08)');
    scorch.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = scorch;
    ctx.fillRect(x0 - 20, y - 8, width + 40, 34);

    // a faint veil
    const veil = ctx.createLinearGradient(0, y - hh, 0, y + 2);
    veil.addColorStop(0, 'rgba(255,213,130,0)');
    veil.addColorStop(.35, 'rgba(255,187,82,.045)');
    veil.addColorStop(.72, 'rgba(255,132,43,.11)');
    veil.addColorStop(.95, 'rgba(255,183,84,.24)');
    veil.addColorStop(1, 'rgba(255,110,35,.04)');
    ctx.fillStyle = veil;
    ctx.fillRect(x0, y - hh, width, hh + 4);

    // a tangible sheet of old fire, with a breathing upper edge
    ctx.globalCompositeOperation = 'source-over';
    const sheet = ctx.createLinearGradient(0, y - hh, 0, y);
    sheet.addColorStop(0, 'rgba(255,205,118,.025)');
    sheet.addColorStop(.28, 'rgba(255,173,69,.06)');
    sheet.addColorStop(.68, 'rgba(255,130,42,.13)');
    sheet.addColorStop(.94, 'rgba(255,188,82,.23)');
    sheet.addColorStop(1, 'rgba(255,104,36,.07)');
    ctx.fillStyle = sheet;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    for (let xx = x0; xx <= x1; xx += 11) {
      const top = y - hh * (.78 + Math.sin(xx * .035 + t * 2.2) * .055 + Math.sin(xx * .11 - t * 3) * .025);
      if (xx === x0) ctx.lineTo(xx, top); else ctx.lineTo(xx, top);
    }
    ctx.lineTo(x1, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,212,127,.23)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let xx = x0; xx <= x1; xx += 10) {
      const top = y - hh * (.78 + Math.sin(xx * .035 + t * 2.2) * .055 + Math.sin(xx * .11 - t * 3) * .025);
      if (xx === x0) ctx.moveTo(xx, top); else ctx.lineTo(xx, top);
    }
    ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';
    // rising tongues of flame, evenly spaced but alive
    const tongues = 22;
    for (let i = 0; i < tongues; i++) {
      const xx = x0 + ((i + .5) / tongues) * width;
      const ph = t * (1.3 + (i % 4) * .19) + i * 1.83;
      const h = hh * (.3 + .5 * (0.5 + Math.sin(ph * 1.21 + i) * .5));
      const sway = Math.sin(ph) * 7;
      const fg = ctx.createLinearGradient(xx, y - h, xx, y);
      fg.addColorStop(0, 'rgba(255,234,167,0)');
      fg.addColorStop(.42, `rgba(255,169,64,${.055 + .04 * (0.5 + Math.sin(ph) * .5)})`);
      fg.addColorStop(.92, 'rgba(255,223,156,.27)');
      fg.addColorStop(1, 'rgba(255,128,44,.04)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(xx - 5, y);
      ctx.bezierCurveTo(xx - 9 + sway, y - h * .42, xx + sway * .4, y - h * .78, xx + sway * 1.2, y - h);
      ctx.bezierCurveTo(xx + 8 + sway * .2, y - h * .58, xx + 8, y - h * .24, xx + 5, y);
      ctx.closePath();
      ctx.fill();
    }

    // thin veil threads
    for (let i = 0; i < 13; i++) {
      const xx = x0 + ((i * 79 + 23) % width);
      const ph = t * (1.1 + (i % 3) * .22) + i * 2.1;
      const off = Math.sin(ph) * 6;
      ctx.strokeStyle = `rgba(255,205,119,${.035 + .05 * (0.5 + Math.sin(ph * 1.8) * .5)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xx + off * .2, y - hh * .22);
      ctx.bezierCurveTo(xx + off, y - hh * .5, xx - off, y - hh * .76, xx + off * .3, y);
      ctx.stroke();
    }

    // warding bands with glyphs
    for (let b = 0; b < 3; b++) {
      const yy = y - hh * (.42 + b * .16);
      ctx.strokeStyle = `rgba(255,209,124,${.22 - b * .04})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let xx = x0; xx <= x1; xx += 14) {
        const wave = Math.sin(xx * .035 + t * 1.6 + b * 2) * (2.5 + b);
        if (xx === x0) ctx.moveTo(xx, yy + wave); else ctx.lineTo(xx, yy + wave);
      }
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const xx = x0 + ((i + .5) / 8) * width;
        const wave = Math.sin(xx * .035 + t * 1.6 + b * 2) * (2.5 + b);
        ctx.save();
        ctx.translate(xx, yy + wave);
        ctx.rotate(Math.PI / 4 + Math.sin(t * 1.2 + i + b) * .09);
        ctx.strokeStyle = `rgba(255,221,145,${.28 - b * .05})`;
        ctx.lineWidth = 1;
        const sz = 2.5 + b * .7;
        ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
        ctx.restore();
      }
    }

    // rising motes
    for (let i = 0; i < 18; i++) {
      const ph = t * (.55 + (i % 5) * .1) + i * 3.2;
      const xx = x0 + ((i + .3) / 18) * width + Math.sin(ph) * 10;
      const yy = y - ((t * (30 + (i % 4) * 9) + i * 17) % hh);
      const a = .16 + .22 * (0.5 + Math.sin(ph * 2) * .5);
      ctx.fillStyle = `rgba(255,188,92,${a})`;
      ctx.beginPath(); ctx.arc(xx, yy, .9 + (i % 2) * .8, 0, TAU); ctx.fill();
    }

    // the bright hem where the spell bites the stone
    const baseG = ctx.createLinearGradient(0, y - 6, 0, y + 8);
    baseG.addColorStop(0, 'rgba(255,243,199,.5)');
    baseG.addColorStop(.3, 'rgba(255,190,92,.47)');
    baseG.addColorStop(1, 'rgba(255,92,31,0)');
    ctx.fillStyle = baseG;
    ctx.fillRect(x0, y - 6, width, 14);
    ctx.strokeStyle = 'rgba(255,241,188,.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let xx = x0; xx <= x1; xx += 10) {
      const wave = Math.sin(xx * .06 + t * 3) * 1.1;
      if (xx === x0) ctx.moveTo(xx, y + wave); else ctx.lineTo(xx, y + wave);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------
  // actors
  // ------------------------------------------------------------
  function drawPlayer(p, ghost = false, forceAlpha = 1) {
    if (!p) return;
    const pos = entPos(p);
    const PS = clamp(base / 565, .68, 1.3);
    const t = G.time;
    let alpha = forceAlpha;
    if (!ghost && p.inv > 0 && Math.floor(t * 22) % 2 === 0) alpha *= .42;
    if (!p.alive) alpha *= .8;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pos.x, pos.y);

    // shadow
    if (!ghost) {
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ellipse(ctx, 0, 0, 14 * PS, 4.5 * PS); ctx.fill();
    }

    if (p.rollT > 0) {
      const rp = 1 - p.rollT / .3;
      ctx.save();
      ctx.rotate(rp * 7 + p.rollAng);
      ctx.scale(PS, PS);
      const cg = ctx.createRadialGradient(0, -16, 2, 0, -16, 20);
      cg.addColorStop(0, '#3d8980');
      cg.addColorStop(.7, '#1e4b4a');
      cg.addColorStop(1, 'rgba(12,32,32,0)');
      ctx.fillStyle = cg;
      ellipse(ctx, 0, -14, 20, 15); ctx.fill();
      ctx.strokeStyle = 'rgba(206,174,111,.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -14, 12, .3, 3.8); ctx.stroke();
      ctx.fillStyle = '#e4c37e';
      ctx.beginPath(); ctx.arc(7, -17, 2.2, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.restore();
      return;
    }

    const bob = p.moving ? Math.sin(p.walk * 2) * 1.4 : Math.sin(t * 2.1) * .7;
    ctx.translate(0, bob);
    const faceDir = Math.cos(p.facing) >= 0 ? 1 : -1;

    // cloak / cape
    const sway = Math.sin(t * 5.2) * 1.3 + (p.moving ? Math.sin(p.walk * 2) * 1.4 : 0);
    ctx.save();
    ctx.scale(faceDir, 1);
    const cloak = ctx.createLinearGradient(0, -44 * PS, 0, -2 * PS);
    cloak.addColorStop(0, '#2b6f69');
    cloak.addColorStop(.5, '#1e4e4d');
    cloak.addColorStop(1, '#102c2d');
    ctx.fillStyle = cloak;
    ctx.beginPath();
    ctx.moveTo(-9 * PS, -43 * PS);
    ctx.quadraticCurveTo(-20 * PS, -30 * PS, -17 * PS + sway, -8 * PS);
    ctx.lineTo(-13 * PS + sway, -2 * PS);
    ctx.lineTo(-6 * PS, -5 * PS);
    ctx.lineTo(0, -1 * PS);
    ctx.lineTo(7 * PS, -5 * PS);
    ctx.lineTo(14 * PS + sway, -2 * PS);
    ctx.lineTo(18 * PS + sway, -10 * PS);
    ctx.quadraticCurveTo(19 * PS, -31 * PS, 9 * PS, -43 * PS);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(118,177,158,.27)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // legs
    const step = p.moving ? Math.sin(p.walk * 2) : 0;
    for (const side of [-1, 1]) {
      const lx = side * 5.2 * PS;
      const ly = -10 * PS + (side * step * 2.2 * PS);
      ctx.fillStyle = side === -1 ? '#231f19' : '#2c261f';
      roundedRect(ctx, lx - 2.9 * PS, ly, 5.8 * PS, 11 * PS, 2.4 * PS); ctx.fill();
      ctx.fillStyle = '#4d4436';
      roundedRect(ctx, lx - 3.8 * PS, ly + 8.2 * PS, 7.8 * PS, 3.2 * PS, 1.5 * PS); ctx.fill();
    }

    // tunic
    ctx.fillStyle = '#d5c192';
    ctx.beginPath();
    ctx.moveTo(-8.5 * PS, -42 * PS);
    ctx.lineTo(8.5 * PS, -42 * PS);
    ctx.lineTo(10 * PS, -18 * PS);
    ctx.quadraticCurveTo(0, -14 * PS, -10 * PS, -18 * PS);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(120,93,55,.24)';
    ctx.beginPath(); ctx.moveTo(-2 * PS, -40 * PS); ctx.lineTo(2 * PS, -40 * PS); ctx.lineTo(1 * PS, -16 * PS); ctx.lineTo(-1 * PS, -16 * PS); ctx.closePath(); ctx.fill();

    // leather chest / belt
    ctx.fillStyle = '#493a28';
    ctx.beginPath();
    ctx.moveTo(-8 * PS, -37 * PS);
    ctx.quadraticCurveTo(0, -33 * PS, 8 * PS, -37 * PS);
    ctx.lineTo(7 * PS, -27 * PS);
    ctx.quadraticCurveTo(0, -24 * PS, -7 * PS, -27 * PS);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(211,178,116,.33)'; ctx.lineWidth = .9; ctx.stroke();
    ctx.fillStyle = '#33251a';
    ctx.fillRect(-10.5 * PS, -22 * PS, 21 * PS, 3.2 * PS);
    ctx.fillStyle = '#c0944e';
    ctx.fillRect(-1.6 * PS, -22.5 * PS, 3.2 * PS, 4 * PS);

    // scarf
    const scarfWave = Math.sin(t * 4.8) * 2.3;
    ctx.fillStyle = '#b95232';
    ctx.beginPath();
    ctx.moveTo(-7 * PS, -42 * PS);
    ctx.lineTo(7 * PS, -42 * PS);
    ctx.lineTo(5 * PS, -37 * PS);
    ctx.lineTo(-5 * PS, -37 * PS);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4 * PS, -39 * PS);
    ctx.quadraticCurveTo(13 * PS + scarfWave, -37 * PS, 17 * PS + scarfWave, -30 * PS);
    ctx.lineTo(14 * PS + scarfWave, -34 * PS);
    ctx.quadraticCurveTo(10 * PS, -35 * PS, 4 * PS, -35 * PS);
    ctx.closePath(); ctx.fill();

    // shoulder
    ctx.save();
    ctx.scale(faceDir, 1);
    ctx.fillStyle = '#b9965d';
    ctx.beginPath(); ctx.arc(-8.6 * PS, -38 * PS, 4 * PS, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,168,.4)'; ctx.lineWidth = .8; ctx.stroke();
    ctx.fillStyle = '#6b5737';
    ctx.beginPath(); ctx.arc(8.6 * PS, -38 * PS, 3.2 * PS, 0, TAU); ctx.fill();
    ctx.restore();

    // head / hood
    const hx = Math.cos(p.facing) * 1.2 * PS;
    const hy = Math.sin(p.facing) * .8 * PS;
    ctx.save();
    ctx.translate(hx, hy);
    const hood = ctx.createRadialGradient(-2 * PS, -51 * PS, 1, 0, -48 * PS, 10 * PS);
    hood.addColorStop(0, '#337d73');
    hood.addColorStop(.55, '#205650');
    hood.addColorStop(1, '#132f2e');
    ctx.fillStyle = hood;
    ctx.beginPath();
    ctx.moveTo(-8.5 * PS, -51 * PS);
    ctx.quadraticCurveTo(-8 * PS, -61 * PS, 0, -62 * PS);
    ctx.quadraticCurveTo(8 * PS, -61 * PS, 8.5 * PS, -51 * PS);
    ctx.lineTo(6 * PS, -41 * PS);
    ctx.quadraticCurveTo(0, -38 * PS, -6 * PS, -41 * PS);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(135,199,177,.25)'; ctx.lineWidth = .9; ctx.stroke();
    // face in shadow
    ctx.fillStyle = '#a77857';
    ctx.beginPath();
    ctx.ellipse(Math.cos(p.facing) * 2.2 * PS, -48 * PS, 4.8 * PS, 5.1 * PS, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(25,17,14,.56)';
    ctx.beginPath(); ctx.ellipse(Math.cos(p.facing) * 2.2 * PS, -49.5 * PS, 4.8 * PS, 2.4 * PS, 0, 0, TAU); ctx.fill();
    // eyes glint
    if (Math.cos(p.facing) >= -.2) {
      ctx.fillStyle = '#8fe2c9';
      ctx.beginPath(); ctx.arc(1.2 * PS + Math.cos(p.facing) * 1.6 * PS, -48.5 * PS, .75 * PS, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(4.5 * PS + Math.cos(p.facing) * 1.2 * PS, -48.3 * PS, .65 * PS, 0, TAU); ctx.fill();
    }
    // hood point
    ctx.fillStyle = '#152f2e';
    ctx.beginPath(); ctx.moveTo(-1 * PS, -62 * PS); ctx.lineTo(2 * PS, -67 * PS); ctx.lineTo(4 * PS, -61 * PS); ctx.closePath(); ctx.fill();
    ctx.restore();

    // sword arm + blade
    const swing = p.attackT > 0 ? (1 - p.attackT / .3) : 0;
    let bladeAng = p.facing;
    if (p.attackT > 0) {
      const side = p.attackSide;
      bladeAng = p.facing + side * lerp(1.45, -1.42, easeOut(swing));
      // afterimage arc
      const arcR = base * .105;
      const start = p.facing - side * 1.42 + (side > 0 ? 0 : 0);
      const end = bladeAng;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = k === 0 ? 'rgba(255,191,90,.1)' : k === 1 ? 'rgba(255,224,151,.25)' : 'rgba(255,252,231,.55)';
        ctx.lineWidth = (k === 0 ? 17 : k === 1 ? 8 : 2.2) * PS;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - 29 * PS, arcR, Math.min(start, end), Math.max(start, end));
        ctx.stroke();
      }
      ctx.restore();
      // spark flecks
      for (let i = 0; i < 3; i++) {
        const aa = bladeAng + rand(.2, -.2);
        const rr = base * rand(.12, .08);
        ctx.fillStyle = 'rgba(255,235,178,.6)';
        ctx.beginPath(); ctx.arc(pos.x + Math.cos(aa) * rr, pos.y - 29 * PS + Math.sin(aa) * rr, 1.1 * PS, 0, TAU); ctx.fill();
      }
    }
    const handx = pos.x + Math.cos(p.facing) * 5 * PS;
    const handy = pos.y - 27 * PS + Math.sin(p.facing) * 4 * PS;
    ctx.strokeStyle = '#8a6e46';
    ctx.lineWidth = 3.2 * PS;
    ctx.beginPath();
    ctx.moveTo(pos.x + Math.cos(p.facing + 1.2) * 2 * PS, pos.y - 35 * PS);
    ctx.lineTo(handx, handy);
    ctx.stroke();
    // sword
    ctx.save();
    ctx.translate(handx, handy);
    ctx.rotate(bladeAng);
    ctx.scale(PS, PS);
    // hilt
    ctx.strokeStyle = '#6f5026'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(-2, 5); ctx.stroke();
    ctx.fillStyle = '#d9b067';
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.fill();
    // blade
    const bg = ctx.createLinearGradient(3, -3, 38, 0);
    bg.addColorStop(0, '#f2efe3');
    bg.addColorStop(.55, '#c6c9c4');
    bg.addColorStop(1, '#eef1e8');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(3, -3.2);
    ctx.lineTo(34, -2.2);
    ctx.lineTo(42, 0);
    ctx.lineTo(34, 2.2);
    ctx.lineTo(3, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(84,84,72,.55)'; ctx.lineWidth = .8; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,248,.8)'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(7, -1.7); ctx.lineTo(34, -1.1); ctx.stroke();
    ctx.fillStyle = '#d6ad64';
    ctx.fillRect(2.2, -4.2, 2.2, 8.4);
    ctx.restore();

    ctx.restore();
  }

  function drawBoss(b, ghost = false) {
    if (!b) return;
    const pos = entPos(b);
    const BS = clamp(base / 660, .56, 1.08);
    const t = G.time;
    let alpha = 1;
    if (b.state === 'dying') alpha = clamp(1 - (b.dying - .9) / 1.3, 0, 1);
    if (b.state === 'dormant') alpha = .84;
    if (ghost) alpha *= .2;
    const bob = Math.sin(b.bob) * 2.3;
    const roar = b.state === 'awaken' ? Math.sin(clamp(b.t / 1.8, 0, 1) * Math.PI) : 0;
    const deathTilt = b.state === 'dying' ? Math.min(1, b.dying / 1.6) : 0;

    ctx.save();
    ctx.globalAlpha = alpha;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ellipse(ctx, pos.x + 4, pos.y + 2, 57 * BS, 17 * BS); ctx.fill();

    // aura
    const auraSize = base * (.13 + b.phase * .015);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, pos.x, pos.y - 75 * BS, auraSize, b.phase >= 3 ? 'rgba(255,74,31,.2)' : 'rgba(231,92,44,.13)', 1);
    ctx.restore();

    ctx.translate(pos.x, pos.y + bob);
    ctx.rotate(deathTilt * .13);
    ctx.scale(BS * (b.face || 1) * .97, BS * 1.07);
    if (b.state === 'dying') ctx.scale(1, 1 - deathTilt * .25);

    // tattered cape
    const capeSway = Math.sin(t * 2.1) * 3;
    const cape = ctx.createLinearGradient(0, -165, 0, 2);
    cape.addColorStop(0, '#2b1415');
    cape.addColorStop(.36, '#4b1f1d');
    cape.addColorStop(.72, '#2b1514');
    cape.addColorStop(1, '#100b0a');
    ctx.fillStyle = cape;
    ctx.beginPath();
    ctx.moveTo(-48, -160);
    ctx.quadraticCurveTo(-75, -112, -69 + capeSway, -32);
    ctx.lineTo(-59 + capeSway, -2);
    ctx.lineTo(-40, -24);
    ctx.lineTo(-23, -3);
    ctx.lineTo(-4, -25);
    ctx.lineTo(16, -2);
    ctx.lineTo(34, -22);
    ctx.lineTo(54, -1);
    ctx.lineTo(67 + capeSway, -17);
    ctx.quadraticCurveTo(76, -107, 48, -160);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(207,134,65,.2)'; ctx.lineWidth = 1.1; ctx.stroke();
    // ragged ember-eaten hem
    ctx.strokeStyle = 'rgba(255,113,44,.26)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-58 + capeSway, -5); ctx.lineTo(-42, -20); ctx.lineTo(-25, -4); ctx.lineTo(-3, -21); ctx.lineTo(17, -3); ctx.lineTo(34, -19); ctx.lineTo(52, -2); ctx.stroke();

    // legs
    for (const side of [-1, 1]) {
      const lx = side * 24;
      ctx.fillStyle = '#181615';
      roundedRect(ctx, lx - 14, -55, 28, 54, 5); ctx.fill();
      const legG = ctx.createLinearGradient(lx - 14, 0, lx + 14, 0);
      legG.addColorStop(0, '#201d19');
      legG.addColorStop(.42, '#575044');
      legG.addColorStop(.62, '#3a342d');
      legG.addColorStop(1, '#141211');
      ctx.fillStyle = legG;
      roundedRect(ctx, lx - 12, -57, 24, 46, 4); ctx.fill();
      // knee plate
      ctx.fillStyle = '#5e5546';
      roundedRect(ctx, lx - 10, -42, 20, 14, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(213,164,83,.35)'; ctx.lineWidth = 1; ctx.stroke();
      // sabaton
      ctx.fillStyle = '#25221d';
      roundedRect(ctx, lx - 15, -12, 30, 13, 4); ctx.fill();
      ctx.fillStyle = 'rgba(214,163,85,.2)';
      ctx.fillRect(lx - 8, -5, 16, 1.4);
    }

    // long tattered fauld, hiding the legs down to the boots
    ctx.fillStyle = '#211d18';
    ctx.beginPath();
    ctx.moveTo(-38, -80); ctx.lineTo(38, -80); ctx.lineTo(34, -18); ctx.lineTo(0, -8); ctx.lineTo(-34, -18); ctx.closePath();
    ctx.fill();
    for (let i = -2; i <= 2; i++) {
      ctx.save(); ctx.translate(i * 13, -74); ctx.rotate(i * .05);
      const plateG = ctx.createLinearGradient(-8, 0, 8, 0);
      plateG.addColorStop(0, i % 2 ? '#29241d' : '#332d24');
      plateG.addColorStop(.45, i % 2 ? '#4a4235' : '#554b3c');
      plateG.addColorStop(1, '#211e19');
      ctx.fillStyle = plateG;
      ctx.beginPath();
      ctx.moveTo(-7.5, 0); ctx.lineTo(7.5, 0); ctx.lineTo(9, 52); ctx.lineTo(0, 62); ctx.lineTo(-9, 52); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(208,156,77,.22)'; ctx.lineWidth = .8; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,111,40,.16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-5, 50); ctx.lineTo(0, 60); ctx.lineTo(5, 50); ctx.stroke();
      ctx.restore();
    }

    // torso
    const bodyG = ctx.createLinearGradient(-48, -160, 48, -60);
    bodyG.addColorStop(0, '#12100e');
    bodyG.addColorStop(.26, '#332f28');
    bodyG.addColorStop(.52, '#4b4539');
    bodyG.addColorStop(.74, '#28241f');
    bodyG.addColorStop(1, '#0e0d0c');
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.moveTo(-45, -161);
    ctx.quadraticCurveTo(-56, -140, -36, -73);
    ctx.quadraticCurveTo(0, -61, 36, -73);
    ctx.quadraticCurveTo(56, -140, 45, -161);
    ctx.quadraticCurveTo(0, -175, -45, -161);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,7,6,.7)'; ctx.lineWidth = 1.2; ctx.stroke();

    // chest plates
    ctx.fillStyle = '#37322a';
    ctx.beginPath(); ctx.moveTo(-38, -156); ctx.quadraticCurveTo(-20, -166, -3, -158); ctx.lineTo(-8, -104); ctx.quadraticCurveTo(-27, -111, -36, -124); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(38, -156); ctx.quadraticCurveTo(20, -166, 3, -158); ctx.lineTo(8, -104); ctx.quadraticCurveTo(27, -111, 36, -124); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(217,169,87,.4)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-37, -153); ctx.quadraticCurveTo(-22, -161, -5, -155); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(37, -153); ctx.quadraticCurveTo(22, -161, 5, -155); ctx.stroke();
    // ember rim light along the shoulders
    ctx.strokeStyle = 'rgba(255,126,47,.34)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-44, -158); ctx.quadraticCurveTo(-53, -140, -40, -95); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(44, -158); ctx.quadraticCurveTo(53, -140, 40, -95); ctx.stroke();

    // furnace maw set into the breastplate
    const corePulse = .84 + Math.sin(t * 3.3) * .16 + (b.phase - 1) * .1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -123, 44 * corePulse, b.phase >= 3 ? 'rgba(255,72,29,.6)' : 'rgba(255,114,37,.46)', 1);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-16, -144); ctx.lineTo(16, -144); ctx.lineTo(12, -103); ctx.lineTo(-12, -103);
    ctx.closePath();
    ctx.fillStyle = '#17120d'; ctx.fill();
    ctx.strokeStyle = '#6c5638'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.save();
    ctx.clip();
    const mawG = ctx.createLinearGradient(0, -144, 0, -103);
    mawG.addColorStop(0, '#fff5ca');
    mawG.addColorStop(.3, '#ffd173');
    mawG.addColorStop(.72, '#ef6426');
    mawG.addColorStop(1, '#6d180f');
    ctx.fillStyle = mawG;
    ctx.fillRect(-16, -144, 32, 41);
    ctx.fillStyle = 'rgba(18,11,7,.88)';
    for (let i = 0; i < 4; i++) ctx.fillRect(-16, -139 + i * 9.4, 32, 4.2);
    ctx.fillRect(-2.4, -144, 4.8, 41);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,175,78,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-14, -142); ctx.lineTo(-11, -104); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, -142); ctx.lineTo(11, -104); ctx.stroke();
    // rivets
    ctx.fillStyle = '#8a7249';
    for (const [rx, ry] of [[-13.5, -147], [13.5, -147], [-11.5, -100], [11.5, -100]]) {
      ctx.beginPath(); ctx.arc(rx, ry, 2.1, 0, TAU); ctx.fill();
    }

    // lava cracks
    const crackAlpha = b.phase >= 3 ? .85 : b.phase >= 2 ? .55 : .28;
    ctx.strokeStyle = `rgba(255,104,37,${crackAlpha})`;
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-13, -113); ctx.lineTo(-2, -105); ctx.lineTo(-17, -91); ctx.lineTo(-7, -81);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, -147); ctx.lineTo(6, -136); ctx.lineTo(20, -126); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(33, -100); ctx.lineTo(25, -91); ctx.lineTo(34, -82); ctx.stroke();
    if (b.flash > 0) {
      ctx.fillStyle = `rgba(255,245,215,${b.flash * 2.7})`;
      ctx.beginPath();
      ctx.moveTo(-45, -161); ctx.quadraticCurveTo(-56, -140, -36, -73);
      ctx.quadraticCurveTo(0, -61, 36, -73); ctx.quadraticCurveTo(56, -140, 45, -161);
      ctx.quadraticCurveTo(0, -175, -45, -161); ctx.closePath(); ctx.fill();
    }

    // left arm
    ctx.save();
    ctx.translate(-49, -145);
    ctx.rotate(.35 + (roar ? .6 : 0));
    const armG = ctx.createLinearGradient(-13, 0, 13, 0);
    armG.addColorStop(0, '#171412'); armG.addColorStop(.45, '#5b5345'); armG.addColorStop(1, '#201c18');
    ctx.fillStyle = armG;
    roundedRect(ctx, -12, 0, 24, 62, 9); ctx.fill();
    ctx.fillStyle = '#3a342b';
    roundedRect(ctx, -13, 46, 26, 25, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(206,156,79,.3)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    // weapon arm
    ctx.save();
    ctx.translate(48, -143);
    const wRot = b.weapon;
    ctx.rotate(wRot);
    // arm
    const armG2 = ctx.createLinearGradient(-12, 0, 12, 0);
    armG2.addColorStop(0, '#171412'); armG2.addColorStop(.45, '#615849'); armG2.addColorStop(1, '#201c18');
    ctx.fillStyle = armG2;
    roundedRect(ctx, -11, 0, 22, 55, 9); ctx.fill();
    ctx.fillStyle = '#463e31';
    roundedRect(ctx, -12, 42, 24, 22, 6); ctx.fill();
    // weapon
    ctx.translate(0, 48);
    ctx.rotate(.12);
    ctx.strokeStyle = '#261a10'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 88); ctx.stroke();
    ctx.strokeStyle = '#6a4828'; ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 88); ctx.stroke();
    ctx.strokeStyle = 'rgba(226,177,94,.4)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-1.6, 4); ctx.lineTo(-1.6, 82); ctx.stroke();
    ctx.strokeStyle = '#8d764d'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-4.5, 22); ctx.lineTo(4.5, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4.5, 58); ctx.lineTo(4.5, 58); ctx.stroke();
    ctx.translate(0, 88);
    // single-bladed great axe, blade turned outward
    ctx.save();
    ctx.scale(-1, 1);
    const axeG = ctx.createLinearGradient(0, 0, -58, 0);
    axeG.addColorStop(0, '#1a1712');
    axeG.addColorStop(.4, '#4a4336');
    axeG.addColorStop(.78, '#746a56');
    axeG.addColorStop(1, '#8f846d');
    ctx.fillStyle = axeG;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(-26, -37);
    ctx.quadraticCurveTo(-58, -49, -78, -34);
    ctx.quadraticCurveTo(-61, -14, -48, 6);
    ctx.quadraticCurveTo(-59, 34, -64, 50);
    ctx.quadraticCurveTo(-40, 53, -18, 34);
    ctx.lineTo(0, 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,204,129,.45)'; ctx.lineWidth = 1.2; ctx.stroke();
    // bright crescent cutting edge, top horn to bottom beard
    ctx.strokeStyle = 'rgba(255,206,118,.9)'; ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-78, -34);
    ctx.quadraticCurveTo(-61, -14, -48, 6);
    ctx.quadraticCurveTo(-59, 34, -64, 50);
    ctx.stroke();
    // chipped edge
    ctx.strokeStyle = 'rgba(20,15,11,.5)'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-71, -30); ctx.lineTo(-64, -25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-55, -8); ctx.lineTo(-49, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-56, 28); ctx.lineTo(-49, 32); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,104,35,.65)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-44, -26); ctx.lineTo(-34, 0); ctx.lineTo(-42, 26); ctx.stroke();
    // dark socket wedge where the haft enters
    ctx.fillStyle = '#171310';
    ctx.beginPath();
    ctx.moveTo(-12, -12); ctx.lineTo(3, -5); ctx.lineTo(3, 6); ctx.lineTo(-12, 13); ctx.closePath();
    ctx.fill();
    // serrated spine along the top
    ctx.fillStyle = '#2b251e';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-24 + i * 8, -32 + i * 3);
      ctx.lineTo(-30 + i * 8, -41 + i * 4);
      ctx.lineTo(-18 + i * 8, -36 + i * 3);
      ctx.fill();
    }
    // haft butt below the head
    ctx.strokeStyle = '#2b2016'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, 24); ctx.stroke();
    ctx.strokeStyle = '#8d764d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-3, 10); ctx.lineTo(3, 10); ctx.stroke();
    // socket and haft spikes
    ctx.fillStyle = '#8d764d';
    ctx.beginPath(); ctx.moveTo(-6, -13); ctx.lineTo(6, -21); ctx.lineTo(7, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,173,74,.7)';
    ctx.beginPath(); ctx.arc(-3, 6, 4, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();

    // pauldrons
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 49, -153);
      const pg = ctx.createLinearGradient(0, -21, 0, 18);
      pg.addColorStop(0, '#7b705c');
      pg.addColorStop(.45, '#494339');
      pg.addColorStop(1, '#171513');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(-21 * side, -6);
      ctx.quadraticCurveTo(-10 * side, -22, 9 * side, -16);
      ctx.quadraticCurveTo(23 * side, -9, 19 * side, 6);
      ctx.quadraticCurveTo(8 * side, 21, -10 * side, 15);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(228,183,101,.32)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,104,39,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-12 * side, -5); ctx.lineTo(8 * side, 2); ctx.stroke();
      // curved iron spikes
      ctx.fillStyle = '#5c5346';
      ctx.beginPath();
      ctx.moveTo(12 * side, -12);
      ctx.quadraticCurveTo(31 * side, -40, 42 * side, -49);
      ctx.quadraticCurveTo(33 * side, -25, 26 * side, -8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(12,9,7,.7)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,130,52,.3)';
      ctx.beginPath();
      ctx.moveTo(16 * side, -16);
      ctx.quadraticCurveTo(28 * side, -34, 37 * side, -44);
      ctx.quadraticCurveTo(30 * side, -24, 24 * side, -11);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // collar spikes framing the helm
    ctx.fillStyle = '#6f5e46';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 20, -173);
      ctx.lineTo(side * 27, -183);
      ctx.lineTo(side * 31, -169);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(20,15,10,.5)'; ctx.lineWidth = 1; ctx.stroke();
    }

    // helmet / head
    const headTilt = roar * -.08;
    ctx.save();
    ctx.translate(0, -171 + (b.state === 'slamRecover' ? 3 : 0));
    ctx.rotate(headTilt);
    ctx.scale(1.16, 1.12);
    // horns: dark iron, swept up like a broken crown
    ctx.strokeStyle = '#0d0a08'; ctx.lineWidth = 1.3;
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#4d4538';
      ctx.beginPath();
      ctx.moveTo(side * 10, -3);
      ctx.quadraticCurveTo(side * 26, -38, side * 32, -61);
      ctx.quadraticCurveTo(side * 36, -26, side * 24, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,143,60,.26)';
      ctx.beginPath();
      ctx.moveTo(side * 13, -6);
      ctx.quadraticCurveTo(side * 25, -32, side * 29, -52);
      ctx.quadraticCurveTo(side * 31, -23, side * 22, -1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffb060';
      ctx.beginPath(); ctx.arc(side * 31, -56, 1.3, 0, TAU); ctx.fill();
    }
    // helm
    const helmG = ctx.createLinearGradient(-18, -17, 18, 18);
    helmG.addColorStop(0, '#1b1714');
    helmG.addColorStop(.32, '#655b4b');
    helmG.addColorStop(.55, '#8b806a');
    helmG.addColorStop(.8, '#393329');
    helmG.addColorStop(1, '#141211');
    ctx.fillStyle = helmG;
    ctx.beginPath();
    ctx.moveTo(-16, 3);
    ctx.quadraticCurveTo(-19, -15, -9, -22);
    ctx.quadraticCurveTo(0, -28, 9, -22);
    ctx.quadraticCurveTo(19, -15, 16, 3);
    ctx.quadraticCurveTo(10, 15, 0, 18);
    ctx.quadraticCurveTo(-10, 15, -16, 3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(234,194,112,.28)'; ctx.lineWidth = 1.1; ctx.stroke();
    // wide furnace visor, barred like a grate
    ctx.fillStyle = '#060403';
    ctx.beginPath();
    ctx.moveTo(-14, -12.5); ctx.lineTo(14, -12.5); ctx.lineTo(11, -3.5); ctx.lineTo(-11, -3.5);
    ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -8, 15, 'rgba(255,96,30,.34)', 1);
    ctx.restore();
    const visorG = ctx.createLinearGradient(0, -11.5, 0, -4.5);
    visorG.addColorStop(0, '#ffe3a0');
    visorG.addColorStop(.45, '#ff9b45');
    visorG.addColorStop(1, '#a83216');
    ctx.fillStyle = visorG;
    ctx.beginPath();
    ctx.moveTo(-11.5, -11.3); ctx.lineTo(11.5, -11.3); ctx.lineTo(9.3, -4.8); ctx.lineTo(-9.3, -4.8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(10,6,4,.9)';
    for (const bx of [-6.5, -2.2, 2.2, 6.5]) {
      ctx.fillRect(bx - .7, -12, 1.4, 8.5);
    }
    ctx.fillStyle = 'rgba(12,8,5,.55)';
    ctx.fillRect(-10, -6.4, 20, 1.4);
    // crown ridge
    ctx.strokeStyle = 'rgba(231,191,108,.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(0, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-13, -19); ctx.lineTo(0, -24); ctx.lineTo(13, -19); ctx.stroke();
    ctx.restore();

    // ember exhaust
    if (b.state !== 'dormant' && b.state !== 'dying') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const a = t * (1.2 + i * .13) + i * 1.9;
        const ex = Math.cos(a) * (28 + i * 8);
        const ey = -155 - ((t * (16 + i * 4) + i * 17) % 65);
        const al = .12 + .18 * (0.5 + Math.sin(t * 3 + i) * .5);
        glow(ctx, ex, ey, 5 + i, `rgba(255,135,45,${al})`, 1);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWisp(w) {
    const pos = entPos(w);
    const s = clamp(base / 640, .58, 1.16);
    const a = 1 - (w.dying > 0 ? clamp(1 - w.dying / .5, 0, 1) : 0);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(pos.x, pos.y - 13 * s + Math.sin(w.phase) * 2.4 * s);
    ctx.scale(s, s);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, 26, 'rgba(255,109,38,.48)', 1);
    glow(ctx, 0, 0, 12, 'rgba(255,219,121,.62)', 1);
    ctx.restore();
    // trailing flame ribbons
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const wave = Math.sin(w.phase + i * 1.7) * 4;
      const g = ctx.createLinearGradient(0, 0, 0, 22 + i * 4);
      g.addColorStop(0, 'rgba(255,183,81,.28)');
      g.addColorStop(1, 'rgba(255,70,26,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 5 - i;
      ctx.beginPath();
      ctx.moveTo(-4 + i * 3, 2);
      ctx.quadraticCurveTo(-2 + wave, 12, 2 + i * 2, 22 + i * 4);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // ember body
    const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, 11);
    g.addColorStop(0, '#fff5ca');
    g.addColorStop(.35, '#ffd075');
    g.addColorStop(.75, '#e56829');
    g.addColorStop(1, '#7a1d12');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(10, -8, 8, 0);
    ctx.quadraticCurveTo(7, 8, 0, 9);
    ctx.quadraticCurveTo(-7, 8, -8, 0);
    ctx.quadraticCurveTo(-10, -8, 0, -11);
    ctx.fill();
    // eye sockets
    ctx.fillStyle = 'rgba(47,17,10,.8)';
    ctx.beginPath(); ctx.ellipse(-3, -2, 1.7, 2.5, -.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3, -2, 1.7, 2.5, .2, 0, TAU); ctx.fill();
    if (w.flash > 0) {
      ctx.fillStyle = `rgba(255,250,224,${w.flash * 6})`;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------
  // effects & ground details
  // ------------------------------------------------------------
  function drawDecals() {
    for (const d of G.decals) {
      const a = clamp(d.life / d.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      if (d.type === 'pot') {
        const pos = entPos(d);
        const s = clamp(base / 690, .55, 1.05);
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = 'rgba(20,12,9,.3)';
        ellipse(ctx, 0, 0, 16 * s, 5 * s); ctx.fill();
        const rng = mulberry32(1000 + d.seed * 99);
        for (let i = 0; i < 9; i++) {
          const x = (rng() - .5) * 27 * s;
          const y = (rng() - .5) * 8 * s;
          ctx.save(); ctx.translate(x, y); ctx.rotate(rng() * TAU);
          ctx.fillStyle = i % 3 === 0 ? '#8a6242' : i % 3 === 1 ? '#5c3e2b' : '#3a281e';
          ctx.beginPath(); ctx.moveTo(-3 * s, -2 * s); ctx.lineTo(4 * s, -1.2 * s); ctx.lineTo(1 * s, 2.5 * s); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  function drawHazards() {
    for (const h of G.hazards) {
      const pos = entPos(h);
      const r = h.r;
      const active = h.armed;
      const t = clamp((h.t - h.armAt) / (h.life - h.armAt), 0, 1);
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.globalCompositeOperation = 'lighter';
      // glowing fissure
      if (active) {
        const fa = (1 - t) * .65;
        glow(ctx, 0, 0, r * 1.75, `rgba(255,88,31,${.16 * (1 - t)})`, 1);
        ctx.strokeStyle = `rgba(255,114,41,${fa})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * TAU + h.seed;
          const rr = r * (.4 + .58 * Math.sin(i * 2.3 + h.seed));
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr * .5;
          if (i === 0) ctx.moveTo(0, 0); else ctx.lineTo(x, y);
          ctx.lineTo(Math.cos(a + .16) * rr * .6, Math.sin(a + .16) * rr * .35);
        }
        ctx.stroke();
        // fire pillars
        for (let i = 0; i < 5; i++) {
          const a = h.seed + i * 1.31;
          const rr = r * (.28 + (i % 3) * .2);
          const flameH = r * (1.1 + .6 * Math.sin(G.time * 8 + i));
          const fg = ctx.createLinearGradient(0, -flameH, 0, 0);
          fg.addColorStop(0, 'rgba(255,238,174,.46)');
          fg.addColorStop(.45, 'rgba(255,137,45,.32)');
          fg.addColorStop(1, 'rgba(255,60,20,0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          const bx = Math.cos(a) * rr, by = Math.sin(a) * rr * .5;
          ctx.moveTo(bx, by);
          ctx.bezierCurveTo(bx + 7, by - flameH * .5, bx - 6, by - flameH * .7, bx, by - flameH);
          ctx.bezierCurveTo(bx + 6, by - flameH * .6, bx - 1, by - flameH * .25, bx, by);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      // warning ring
      const warnA = active ? .34 * (1 - t) : .42 + .15 * Math.sin(G.time * 8);
      ctx.strokeStyle = active ? `rgba(255,144,62,${warnA})` : `rgba(255,114,55,${warnA})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(active ? [] : [5, 7]);
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * .48, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (!active) {
        ctx.strokeStyle = 'rgba(255,135,55,.18)';
        ctx.beginPath(); ctx.ellipse(0, 0, r * .7, r * .33, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,191,103,.28)';
        ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawShockwaves() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of G.shockwaves) {
      const pos = entPos(s);
      const pct = clamp(s.r / s.maxR, 0, 1);
      const alpha = (1 - pct) * (s.damaging ? .72 : .34);
      ctx.strokeStyle = s.damaging ? `rgba(255,191,104,${alpha})` : `rgba(255,126,55,${alpha * .8})`;
      ctx.lineWidth = s.damaging ? clamp(base * .012 * (1 - pct), 1.2, 7) : 2;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, s.r, s.r * .48, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = s.damaging ? `rgba(255,97,37,${alpha * .34})` : `rgba(255,92,39,${alpha * .3})`;
      ctx.lineWidth = s.damaging ? clamp(base * .035 * (1 - pct), 3, 18) : 8;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, s.r * .96, s.r * .46, 0, 0, TAU);
      ctx.stroke();
      // dust ring on floor
      if (s.damaging) {
        ctx.strokeStyle = `rgba(164,135,101,${alpha * .2})`;
        ctx.lineWidth = 12 * (1 - pct);
        ctx.beginPath(); ctx.ellipse(pos.x, pos.y, s.r * 1.02, s.r * .5, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawProjectiles() {
    for (const o of G.projectiles) {
      const pos = entPos(o);
      const sr = clamp(base / 700, .55, 1.12);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // trail
      for (let i = o.trail.length - 1; i >= 0; i--) {
        const tr = o.trail[i];
        const tp = entPos(tr);
        const a = (1 - i / o.trail.length) * .2;
        glow(ctx, tp.x, tp.y, 13 * sr * (1 - i / o.trail.length), `rgba(255,103,36,${a})`, 1);
      }
      glow(ctx, pos.x, pos.y, 31 * sr, 'rgba(255,91,31,.3)', 1);
      glow(ctx, pos.x, pos.y, 13 * sr, 'rgba(255,208,116,.7)', 1);
      ctx.fillStyle = '#fff5c8';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 3.4 * sr, 0, TAU); ctx.fill();
      // orbiting sparks
      for (let i = 0; i < 3; i++) {
        const a = G.time * 7 + o.phase + i * TAU / 3;
        ctx.fillStyle = 'rgba(255,171,70,.65)';
        ctx.beginPath();
        ctx.arc(pos.x + Math.cos(a) * 10 * sr, pos.y + Math.sin(a) * 7 * sr, 1.25 * sr, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPickups() {
    for (const u of G.pickups) {
      const pos = entPos(u);
      const s = clamp(base / 680, .56, 1.08);
      const bob = Math.sin(G.time * 3 + u.t) * 3 * s;
      const fade = clamp(u.life / 2, 0, 1);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(pos.x, pos.y + bob);
      glow(ctx, 0, 0, 24 * s, 'rgba(255,104,46,.28)', 1);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ellipse(ctx, 0, 7, 11, 3.5); ctx.fill();
      if (u.type === 'heart') {
        const hg = ctx.createLinearGradient(0, -15, 0, 10);
        hg.addColorStop(0, '#ffbf78');
        hg.addColorStop(.4, '#e34b36');
        hg.addColorStop(1, '#7b1a17');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.moveTo(0, 9);
        ctx.bezierCurveTo(-2, 6, -14, -1, -12, -7);
        ctx.bezierCurveTo(-10, -14, -2, -14, 0, -8);
        ctx.bezierCurveTo(2, -14, 10, -14, 12, -7);
        ctx.bezierCurveTo(14, -1, 2, 6, 0, 9);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,225,161,.55)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = 'rgba(255,239,197,.5)';
        ctx.beginPath(); ctx.ellipse(-5, -8, 2.1, 3.2, -.5, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    ctx.save();
    for (const p of G.particles) {
      const a = clamp(p.life / p.max, 0, 1) * p.alpha;
      const x = px(p.x), y = py(p.y);
      if (p.glow) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * .55;
        glow(ctx, x, y, p.size * 3.4, p.color, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(x, y, p.size * .75, 0, TAU); ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        if (p.streak) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * .65;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - p.vx * room.w * .025, y - p.vy * room.h * .025);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(x, y, p.size * .6, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    // ambient embers
    for (const e of G.ambient) {
      const a = .15 + .32 * (0.5 + Math.sin(e.ph) * .5);
      const x = px(e.x), y = py(e.y);
      ctx.globalAlpha = a;
      ctx.fillStyle = e.size > 1.6 ? '#ffc06b' : '#ff8d42';
      ctx.beginPath(); ctx.arc(x, y, e.size * .6, 0, TAU); ctx.fill();
      if (e.size > 1.5) {
        ctx.globalAlpha = a * .2;
        glow(ctx, x, y, e.size * 4, '#ff7b32', 1);
      }
    }
    ctx.restore();
  }

  function drawLights() {
    const s = clamp(base / 700, .55, 1.1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // wall torch pools
    for (const t of G.torches) {
      const pos = entPos(t);
      const fl = .78 + .22 * Math.sin(G.time * 8 + t.seed);
      const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 125 * s * fl);
      g.addColorStop(0, 'rgba(255,146,52,.16)');
      g.addColorStop(.35, 'rgba(255,109,38,.07)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 125 * s * fl, 0, TAU); ctx.fill();
    }
    // braziers
    for (const b of G.braziers) {
      const pos = entPos(b);
      const fl = .82 + .18 * Math.sin(G.time * 6.3 + b.seed);
      const g = ctx.createRadialGradient(pos.x, pos.y - 20 * s, 0, pos.x, pos.y - 20 * s, 180 * s * fl);
      g.addColorStop(0, 'rgba(255,169,66,.18)');
      g.addColorStop(.4, 'rgba(255,104,39,.07)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pos.x, pos.y - 20 * s, 180 * s * fl, 0, TAU); ctx.fill();
    }
    // chest
    if (G.chest) {
      const pos = entPos(G.chest);
      const pulse = .8 + .2 * Math.sin(G.time * 2.2);
      const g = ctx.createRadialGradient(pos.x, pos.y - 18 * s, 0, pos.x, pos.y - 18 * s, 80 * s * pulse);
      g.addColorStop(0, 'rgba(255,149,56,.1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pos.x, pos.y - 18 * s, 80 * s * pulse, 0, TAU); ctx.fill();
    }
    // boss core
    if (G.boss && G.boss.state !== 'dying') {
      const pos = entPos(G.boss);
      const intensity = G.boss.state === 'dormant' ? .12 : .3;
      const g = ctx.createRadialGradient(pos.x, pos.y - 80 * s, 0, pos.x, pos.y - 80 * s, 150 * s);
      g.addColorStop(0, `rgba(255,101,36,${intensity})`);
      g.addColorStop(.4, `rgba(255,73,26,${intensity * .4})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pos.x, pos.y - 80 * s, 150 * s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawLowHealth() {
    if (!G.player || G.player.hp > 2 || G.state === 'title') return;
    const p = G.player;
    const a = (1 - p.hp / 3) * .18 + Math.sin(G.time * 4) * .025;
    ctx.save();
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .2, W / 2, H / 2, Math.max(W, H) * .68);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(.68, 'rgba(80,7,5,0)');
    g.addColorStop(1, `rgba(109,12,8,${clamp(a, 0, .3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawIntroFade() {
    if (G.state !== 'playing' || G.intro >= 1) return;
    const a = 1 - easeOut(G.intro);
    ctx.fillStyle = `rgba(3,3,3,${a * .82})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------
  // render main
  // ------------------------------------------------------------
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(G.shakeX, G.shakeY);

    const T00 = performance.now();
    drawBackdrop(); const T01 = performance.now();
    if (!SKIP.has('floor')) drawFloor(); const T02 = performance.now();
    if (!SKIP.has('walls')) {
      if (wallCache) { ctx.drawImage(wallCache, 0, 0, W, H); drawBanners(); }
      else drawWalls();
    }
    const T03 = performance.now();
    if (SKIP.has('particles')) { /* limited */ }
    if (!SKIP.has('decor')) { drawDecals(); drawHazards(); drawShockwaves(); drawWallTorches(); drawGatePylons(); drawBrazierScene(); drawPickups(); drawRubble(); drawChains(); }
    const T04 = performance.now();
    if (window.__prof) {
      const stats = window.__prof;
      stats.backdrop = (stats.backdrop || 0) + (T01 - T00);
      stats.walls = (stats.walls || 0) + (T02 - T01);
      stats.floor = (stats.floor || 0) + (T03 - T02);
      stats.static = (stats.static || 0) + (T04 - T03);
      stats.frames = (stats.frames || 0) + 1;
    }

    // ghosts / afterimages
    for (const a of G.afterimages) {
      ctx.save();
      ctx.globalAlpha = (a.life / a.max) * .26;
      drawPlayerAtGhost(a);
      ctx.restore();
    }

    // y-sorted foreground props and actors
    const drawList = [];
    for (const pot of G.pots) if (!pot.dead) drawList.push({ y: pot.y, fn: () => drawPot(pot) });
    if (!G.chest.open || G.keyDrop) drawList.push({ y: G.chest.y, fn: drawChest });
    for (const w of G.wisps) drawList.push({ y: w.y + .002, fn: () => drawWisp(w) });
    if (G.boss) drawList.push({ y: G.boss.y + .003, fn: () => drawBoss(G.boss) });
    if (G.player) drawList.push({ y: G.player.y + .004, fn: () => drawPlayer(G.player) });
    drawList.sort((a, b) => a.y - b.y);
    if (!SKIP.has('actors')) for (const item of drawList) item.fn();

    const T10 = performance.now();
    if (!SKIP.has('barrier')) drawBarrier();
    if (!SKIP.has('projectiles')) drawProjectiles();
    if (!SKIP.has('particles')) drawParticles();
    if (!SKIP.has('lights')) drawLights();
    if (!SKIP.has('lights')) drawAtmosphere();
    drawLowHealth();
    drawIntroFade();
    ctx.restore();
    const T11 = performance.now();
    if (window.__prof) {
      const stats = window.__prof;
      stats.effects = (stats.effects || 0) + (T11 - T10);
      stats.actors = (stats.actors || 0) + (T10 - T04);
    }
    if (window.__prof && window.__prof.frames > 30) {
      const f = window.__prof.frames;
      console.log('PROF', JSON.stringify({frames:f, total: performance.now() - window.__prof.start,
        backdrop:(window.__prof.backdrop/f).toFixed(2), walls:(window.__prof.walls/f).toFixed(2),
        floor:(window.__prof.floor/f).toFixed(2), static:(window.__prof.static/f).toFixed(2),
        actors:(window.__prof.actors/f).toFixed(2), effects:(window.__prof.effects/f).toFixed(2)}));
      window.__prof = null;
    }
  }

  function drawPlayerAtGhost(a) {
    const saved = G.player;
    const fake = {
      x: a.x, y: a.y, facing: a.facing, inv: 0, rollT: 0, rollAng: 0,
      attackT: 0, attackSide: 1, walk: 0, moving: false,
    };
    drawPlayer(fake, true, a.life / a.max * .42);
  }

  function drawBrazierScene() {
    for (const b of G.braziers) drawBrazier(b);
  }

  // ------------------------------------------------------------
  // main loop + init
  // ------------------------------------------------------------
  let lastFrame = performance.now();
  function frame(now) {
    const elapsed = Math.max(0, now - lastFrame);
    const raw = Math.min(.05, elapsed / 1000);
    lastFrame = now;
    // adaptive resolution: quietly step render density down on devices that
    // cannot hold a playable frame rate, never below 1x.
    if (G.state === 'playing' && !document.hidden) {
      perfAccum += Math.min(160, elapsed);
      perfSamples++;
      if (perfSamples >= 150) {
        if (perfAccum / perfSamples > 42 && maxDpr > 1.05) {
          maxDpr = Math.max(1, maxDpr - .35);
          resize();
        }
        perfAccum = 0;
        perfSamples = 0;
      }
    }
    if (G.hitStop > 0) {
      G.hitStop -= raw;
    } else if (G.state === 'title') {
      updateTitle(raw);
    } else if (G.state === 'playing' || G.state === 'falling' || G.state === 'victory' || G.state === 'dead') {
      update(raw);
    }
    render();
    requestAnimationFrame(frame);
  }

  if (QS.has('debug')) {
    window.__emberfall = {
      G, startGame, resetRun, startUnlock, grantKey, beginBossAwake, beginPhase,
      damageBoss, hurtPlayer, tryInteract, showEnd, spawnWisp, render,
      step(dt = 1 / 60, count = 1) {
        for (let i = 0; i < count; i++) {
          if (G.hitStop > 0) G.hitStop = Math.max(0, G.hitStop - dt);
          else if (G.state !== 'title') update(dt);
        }
        render();
        return { state: G.state, progress: G.progress, hp: G.player && G.player.hp, phase: G.boss && G.boss.phase };
      },
    };
  }
  buildHearts();
  resetRun();
  G.state = 'title';
  dom.end.classList.add('hidden');
  dom.end.setAttribute('aria-hidden', 'true');
  resize();
  G.particles.length = 0;
  G.ambient.length = 0;
  G.motes.length = 0;
  seedAmbient();
  // pre-warm title scene with a little drifting ash
  for (let i = 0; i < 30; i++) {
    G.particles.push({
      x: rand(1), y: rand(1), vx: rand(.006, -.006), vy: rand(-.006, -.02),
      life: rand(5, 1), max: 5, size: rand(1.8, .5), color: '#ffb058', glow: true,
      gravity: 0, drag: 1, alpha: .5, streak: false,
    });
  }
  requestAnimationFrame(frame);
})();
