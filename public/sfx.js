/* 손끝 소리·진동 — 모든 소리를 WebAudio로 그 자리에서 합성합니다 (소리 파일 없음, 인터넷 없이도 동작).
   음 높이는 모두 C장조 5음계(도 레 미 솔 라)에서만 골라, 빠르게 이어 놓아도 서로 부딪히지 않아요.
   Sfx.play(이름, {step}) · Sfx.buzz(패턴) · Sfx.mode · Sfx.setMode('on'|'buzz'|'off') · Sfx.cycle() · Sfx.label() */
(function (root, factory) {
  const Sfx = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Sfx;
  if (root) root.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];   // C5 D5 E5 G5 A5 C6 D6 E6
  const LOW = { A3: 220, E3: 164.81, D3: 146.83 };                                   // 둔탁한 소리도 같은 음계에서
  const HAPTIC = {
    pick: 8, place: 12, back: 8, valid: 15, draw: 10, invalid: 18, joker: 15,
    turn: [30, 60, 30], big: [20, 40, 20], firstMeld: [20, 40, 20], win: [40, 60, 40, 60, 80],
  };
  const MODES = ['on', 'buzz', 'off'];
  const LABEL = { on: '🔔 소리·진동', buzz: '📳 진동만', off: '🔕 끔' };
  const PLAIN = { on: '🔔 소리 켜짐', off: '🔕 소리 꺼짐' };   // 진동이 없는 기기(아이폰 Safari 등)
  const KEY = 'rummi-sound';
  const MAX_VOICES = 6, THROTTLE_MS = 30;

  const AC = root.AudioContext || root.webkitAudioContext || null;
  const nav = root.navigator || null;
  // 진동을 못 하는 기기(아이폰 Safari)에선 '진동만'을 고를 수 없게: 소리 켜짐 ↔ 꺼짐 두 가지만
  const CAN_BUZZ = !!nav && typeof nav.vibrate === 'function';

  const store = (() => { try { return root.localStorage; } catch (e) { return null; } })();
  let mode = 'on';
  let volume=0.5;
  try {
    const v = store && store.getItem(KEY);
    if (MODES.includes(v)) mode = v === 'buzz' && !CAN_BUZZ ? 'off' : v;   // 진동이 없으면 '진동만'은 사실상 조용히 → 끔
  } catch (e) {}
  try {
    const saved=store && store.getItem('rummi-volume');
    if(saved!=null && Number.isFinite(Number(saved)))volume=Math.max(0,Math.min(1,Number(saved)));
  } catch(e) {}
  const clock = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
  let ctx = null, master = null, destination = null, noiseBuf = null, gestureAt = -1e9;
  const voices = [];                      // { g, end }
  const lastAt = Object.create(null);     // 이름별 마지막 재생 시각(같은 소리 30ms 안에 두 번 안 냄)

  function audio(fromGesture) {
    if (!AC) return null;
    if (!ctx) {
      // 아직 한 번도 누르지 않은 화면에서는 만들지 않음 (어차피 잠긴 채로 생기고, 만드는 데 시간이 걸려 연출이 끊김)
      if (!fromGesture && nav && nav.userActivation && !nav.userActivation.hasBeenActive) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = volume;
        let out = master;
        if (ctx.createDynamicsCompressor) {     // 여러 소리가 겹쳐도 찢어지지 않게
          const comp = ctx.createDynamicsCompressor();
          master.connect(comp); out = comp;
        }
        out.connect(ctx.destination);
        destination = out;
      } catch (e) { ctx = null; return null; }
    }
    // iOS는 전화·Siri·화면 잠금 뒤에 'interrupted' 상태가 되므로 그때도 다시 깨움
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    }
    return ctx;
  }
  // iOS는 손가락이 닿은 순간에만 소리를 열어 줌 → 첫 터치·키 입력 때 깨워 둠
  function unlock() {
    gestureAt = clock();
    if (mode !== 'on') return;
    const c = audio(true);
    if (!c || (c.state === 'running' && unlock.done)) return;
    unlock.done = c.state === 'running';
    try {   // 무음 한 조각을 재생해 iOS 오디오를 엶
      const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) {}
  }
  if (root.addEventListener) {
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) {
      root.addEventListener(ev, unlock, { capture: true, passive: true });
    }
  }

  function noise() {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  // 목소리 하나(최대 6개) — 넘치면 가장 오래된 소리를 살짝 줄이며 끔
  function voice(dur) {
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) voices.splice(i, 1);
    while (voices.length >= MAX_VOICES) {
      const old = voices.shift();
      try { old.g.gain.cancelScheduledValues(now); old.g.gain.setTargetAtTime(0, now, 0.012); } catch (e) {}
    }
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(master);
    voices.push({ g, end: now + dur });
    setTimeout(() => { try { g.disconnect(); } catch (e) {} }, (dur + 0.4) * 1000);
    return g;
  }
  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(out, f, t, dur, vol, attack = 0.005, type = 'sine') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    env(g, t, vol, attack, dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.03);
  }
  // 종소리: 기본음 + 2.76배(×0.3) + 5.4배(×0.1) 배음, 지수 감쇠
  function bell(out, f, t, dur = 0.8, vol = 0.2) {
    tone(out, f, t, dur, vol, 0.004);
    tone(out, f * 2.76, t, dur * 0.55, vol * 0.3, 0.003);
    tone(out, f * 5.4, t, dur * 0.3, vol * 0.1, 0.002);
  }
  function hiss(out, t, dur, freq, q, vol, sweepTo) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise();
    f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    env(g, t, vol, Math.min(0.004, dur / 4), dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }
  // 나무 탁자에 놓는 듯한 둔탁한 소리 (음이 살짝 내려감)
  function thump(out, f, t, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.75, t + dur);
    lp.type = 'lowpass'; lp.frequency.value = 900;
    env(g, t, vol, 0.004, dur);
    o.connect(lp); lp.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const P = i => PENTA[Math.max(0, Math.min(PENTA.length - 1, Math.round(Number(i) || 0)))];
  // Dry ceramic contact: sharp edge, a tiny secondary contact and a short wooden body.
  // The high-frequency transient stays audible on phone speakers without a long metallic ring.
  function clack(out,t,step=0,strength=1) {
    hiss(out,t,.006,3300+(step%3)*130,1.1,1.35*strength);
    hiss(out,t+.009,.009,2050,1.8,.67*strength);
    thump(out,LOW.A3,t,.048,.58*strength);
    tone(out,P(5)*2.76,t+.001,.038,.085*strength,.001);
    hiss(out,t+.025,.014,900,.8,.15*strength);
  }

  // 소리 사전 — 각 함수는 길이(초)를 돌려줌
  const SOUNDS = {
    pick(o, t) { hiss(o, t, 0.015, 2150, 1.2, 0.36); thump(o, LOW.A3, t, 0.045, 0.18); tone(o, P(0), t, 0.065, 0.025, 0.002); return 0.09; },
    place(o, t) { hiss(o, t, 0.045, 1200, 0.8, 0.12, 2200); return 0.07; },
    // 착지 시의 짧은 타일 접촉음. 이동 시작음·화음보다 작고 건조하게.
    settle(o, t, s) { clack(o,t,s);return .11; },
    rack(o,t) { clack(o,t,0,.72);thump(o,LOW.E3,t+.004,.075,.32);return .12; },
    back(o, t) { thump(o, LOW.E3, t, 0.14, 0.45); return 0.17; },
    sort(o, t) {
      for (let i = 0; i < 4; i++) {
        const ti = t + i * 0.045;
        hiss(o, ti, 0.025, 1400 + i * 170, 1.1, 0.3, 950);
        thump(o, LOW.A3, ti + .014, .035, .13);
      }
      return 0.24;
    },
    valid(o, t, s) { tone(o, P(1 + Math.max(1,s)), t, 0.22, 0.14, 0.003); tone(o, P(3 + Math.max(1,s)), t + 0.055, 0.32, 0.11, 0.003); return 0.4; },
    invalid(o, t) { thump(o, LOW.D3, t, 0.18, 0.42); return 0.2; },
    draw(o, t) { hiss(o,t,.09,850,.8,.3,1650);hiss(o,t+.05,.015,2600,1.4,.32);thump(o,LOW.A3,t+.045,.05,.16);return .14; },
    turn(o, t) { bell(o, P(1), t, 0.65, 0.13); bell(o, P(3), t + 0.1, .75, 0.11); return .9; },
    next(o, t) { bell(o, P(2), t, 0.6, 0.1); return 0.65; },
    commit(o, t, s) { clack(o,t,s,.9);tone(o,P(s),t+.06,.28,.095,.004);tone(o,P(s+2),t+.10,.35,.045,.004);return .48; },
    joker(o, t) {   // 종소리 + 살짝 어긋난 한 옥타브 위 두 음이 반짝이며 맥놀이
      bell(o, P(5), t, 0.9, 0.17);
      tone(o, P(5) * 2 * 1.006, t + 0.03, 0.85, 0.045, 0.02);
      tone(o, P(5) * 2 * 0.994, t + 0.03, 0.85, 0.045, 0.02);
      return 1.0;
    },
    firstMeld(o, t) { [0, 2, 3, 5].forEach((n, i) => bell(o, P(n), t + i * 0.09, 0.85, 0.16)); return 1.2; },
    win(o, t) {
      [0, 1, 2, 3, 5].forEach((n, i) => bell(o, P(n), t + i * 0.11, 0.6, 0.15));
      const c = t + 0.58;
      [0, 2, 3, 5].forEach(n => tone(o, P(n), c, 1.5, 0.06, 0.08));   // 은은하게 머무는 화음
      return 2.2;
    },
    award(o, t, s) { bell(o, P(s % PENTA.length), t, 0.85, 0.13); return 0.9; },
    chat(o, t) { tone(o, P(5), t, 0.2, 0.07, 0.004); return 0.22; },
  };

  function buzz(pattern) {
    if (mode === 'off' || !nav || typeof nav.vibrate !== 'function') return false;
    const p = typeof pattern === 'string' ? HAPTIC[pattern] : pattern;
    if (p == null) return false;
    // 아직 한 번도 화면을 누르지 않았으면 브라우저가 막고 경고를 띄우므로 건너뜀
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return false;
    try { return nav.vibrate(p); } catch (e) { return false; }
  }

  function play(name, opts) {
    const fn = SOUNDS[name];
    if (!fn || mode === 'off') return false;
    const now = clock();
    if (lastAt[name] != null && now - lastAt[name] < THROTTLE_MS) return false;
    lastAt[name] = now;
    if (!(opts && opts.buzz === false) && HAPTIC[name] != null) buzz(HAPTIC[name]);
    if (mode !== 'on') return false;
    const c = audio();
    if (!c) return false;
    // 아직 잠겨 있는 오디오에 소리를 쌓아 두면 풀리는 순간 한꺼번에 터지므로, 방금 터치한 경우만 예약
    if (c.state !== 'running' && now - gestureAt > 1000) return false;
    try {
      const step = opts && Number.isFinite(opts.step) ? opts.step : 0;
      const t = c.currentTime + 0.005;
      // 길이를 미리 알기 위해 임시 출력에 먼저 연결하지 않고, 넉넉한 길이로 목소리를 잡음
      const g = voice(2.4);
      if (opts && opts.quiet) g.gain.value = name==='settle'||name==='rack' ? 0.78 : 0.45;
      const dur = fn(g, t, step);
      voices[voices.length - 1].end = c.currentTime + dur;
      return true;
    } catch (e) { return false; }
  }

  function setMode(m) {
    if (!MODES.includes(m)) return mode;
    mode = m;
    if(master && ctx)master.gain.setTargetAtTime(m==='on'?volume:0,ctx.currentTime,0.015);
    try { if (store) store.setItem(KEY, m); } catch (e) {}
    if (m === 'on') { audio(); play('next', { buzz: false }); }
    else if (m === 'buzz') buzz(HAPTIC.turn);
    try { if(root.dispatchEvent && root.Event)root.dispatchEvent(new root.Event('rummi-audio')); } catch {}
    return mode;
  }
  const cycle = () => {   // 진동이 없는 기기에선 '진동만'을 건너뜀
    let next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    if (next === 'buzz' && !CAN_BUZZ) next = 'off';
    return setMode(next);
  };

  function setVolume(v) {
    if(!Number.isFinite(v))return volume;
    volume=Math.max(0,Math.min(1,v));
    try { if(store)store.setItem('rummi-volume',String(volume)); } catch(e) {}
    if(master && ctx)master.gain.setTargetAtTime(mode==='on'?volume:0,ctx.currentTime,0.015);
    return volume;
  }

  return {
    play, buzz, setMode, cycle, setVolume,
    musicBus(fromGesture=false) {
      const c=audio(fromGesture);if(!c || !destination)return null;
      const gain=c.createGain();gain.gain.value=0;gain.connect(destination);return {context:c,gain};
    },
    get volume() { return volume; },
    get mode() { return mode; },
    get canBuzz() { return CAN_BUZZ; },
    label: m => {   // 화면 말(i18n.js)이 있으면 그 말로, 없으면 한국어. 진동이 없는 기기는 '소리 켜짐/꺼짐'
      const k = MODES.includes(m) ? m : mode;
      const key = CAN_BUZZ ? 'sfx.' + k : k === 'on' ? 'sfx.plainOn' : 'sfx.plainOff';
      try {
        const I = root.I18N;
        if (I && typeof I.t === 'function') { const s = I.t(key); if (typeof s === 'string' && s !== key) return s; }
      } catch (e) {}
      return CAN_BUZZ ? LABEL[k] : PLAIN[k === 'on' ? 'on' : 'off'];
    },
    PENTA, LOW, HAPTIC, SOUNDS: Object.keys(SOUNDS),
  };
});
