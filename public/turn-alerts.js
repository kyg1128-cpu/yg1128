/* Turn reminders use confirmed state only. No permissions are requested until a click. */
(() => {
  'use strict';
  const banner = document.getElementById('turnAlert');
  const soundButton = document.getElementById('btnTurnSound');
  const desktopButton = document.getElementById('btnTurnDesktop');
  if (!banner || !soundButton || !desktopButton) return;
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  const text = (key, params) => I18N.t(key, params);
  let soundEnabled = read('rummi-turn-sound') !== 'off';
  let desktopEnabled = read('rummi-turn-desktop') === 'on';
  let currentKey = '', heardKey = '', nativeKey = '', pendingSound = false, engaged = false;
  let bannerTimer, foregroundTimer, notification = null, requesting = false, nativeFailed = false;
  const keyOf = s => s ? `${s.code}:${s.round}:${s.turnSeq}:${s.me.id}` : '';
  const mine = () => !!(S && S.state === 'playing' && S.turnId === S.me.id &&
    !S.players.find(p => p.id === S.me.id)?.bot && navigator.onLine !== false &&
    (!window.UX || UX.canSend()));
  const supported = () => !nativeFailed && window.isSecureContext &&
    typeof window.Notification === 'function' && typeof Notification.requestPermission === 'function';
  function closeNotification() {
    if (notification) { try { notification.close(); } catch {} notification = null; }
  }
  function hideBanner() { clearTimeout(bannerTimer); banner.classList.add('hidden'); document.body.classList.remove('turn-notice'); }
  function position() {
    if (banner.classList.contains('hidden')) return;
    const status = document.querySelector('.turn-line') || document.querySelector('.status');
    const top = Math.ceil(status?.getBoundingClientRect().bottom || 60) + 10;
    banner.style.top = Math.max(8, Math.min(top, innerHeight - banner.offsetHeight - 12)) + 'px';
  }
  function showBanner() {
    if (!mine() || document.hidden || engaged || !banner.classList.contains('hidden')) return;
    document.getElementById('turnAlertTitle').textContent = text('turn.title');
    banner.classList.remove('hidden'); document.body.classList.add('turn-notice'); position();
    bannerTimer = setTimeout(hideBanner, 5500);
  }
  function trySound() {
    if (!mine() || !currentKey || heardKey === currentKey || !soundEnabled || !window.Sfx) return;
    if (read('rummi-turn-heard') === currentKey) { heardKey = currentKey; pendingSound = false; return; }
    const played = Sfx.play('turnAlert');
    if (played || Sfx.mode !== 'on' || Sfx.volume === 0) {
      heardKey = currentKey; pendingSound = false;
      if (played && Sfx.volume > 0) write('rummi-turn-heard', currentKey);
    } else pendingSound = !!(window.AudioContext || window.webkitAudioContext);
  }
  function notify() {
    if (!desktopEnabled || !supported() || Notification.permission !== 'granted' || nativeKey === currentKey) return;
    if (!document.hidden && document.hasFocus()) return;
    try {
      closeNotification();
      notification = new Notification(text('turn.title'), {
        body:text('turn.notification', { code:S.code }), tag:'rummikub-turn', icon:'brand.svg', silent:true,
      });
      nativeKey = currentKey;
      notification.onclick = () => { window.focus(); closeNotification(); if (mine()) showBanner(); };
    } catch { nativeFailed = true; labels(); } // Some mobile browsers require an installed PWA/service worker.
  }
  function clear() {
    currentKey = ''; pendingSound = false; engaged = false;
    clearTimeout(foregroundTimer); hideBanner(); closeNotification();
  }
  function sync(state) {
    if (!state || !mine()) { clear(); return; }
    const key = keyOf(state);
    if (key === currentKey) return;
    hideBanner(); closeNotification();
    currentKey = key; engaged = false; pendingSound = false;
    showBanner(); trySound(); notify();
    if (!document.hidden && typeof glowDock === 'function') glowDock();
  }
  function labels() {
    soundButton.setAttribute('aria-checked', String(soundEnabled));
    document.getElementById('turnSoundState').textContent = text(soundEnabled ? 'turn.on' : 'turn.off');
    const canNotify = supported(), permission = canNotify ? Notification.permission : 'unsupported';
    desktopButton.disabled = !canNotify || requesting;
    desktopButton.setAttribute('aria-checked', String(desktopEnabled && permission === 'granted'));
    desktopButton.textContent = text(requesting ? 'turn.asking' : permission === 'denied' ? 'turn.blocked' :
      desktopEnabled && permission === 'granted' ? 'turn.desktopOn' : 'turn.desktopOff');
    document.getElementById('turnPermissionHint').textContent = text(!canNotify ? 'turn.unsupported' : permission === 'denied' ? 'turn.blockedHint' : 'turn.desktopHint');
    const audioKey = !(window.AudioContext || window.webkitAudioContext) ? 'turn.noAudio' :
      window.Sfx && (Sfx.mode !== 'on' || Sfx.volume === 0) ? 'turn.mutedHint' : 'turn.audioHint';
    document.getElementById('turnAudioHint').textContent = text(audioKey);
  }
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled; write('rummi-turn-sound', soundEnabled ? 'on' : 'off');
    pendingSound = false; labels();
  });
  document.getElementById('btnTurnPreview').addEventListener('click', () => {
    const key = !(window.AudioContext || window.webkitAudioContext) ? 'turn.noAudio' :
      !window.Sfx || Sfx.mode !== 'on' || Sfx.volume === 0 ? 'turn.mutedHint' : null;
    if (key) { toast(text(key), 5000); return; }
    if (!Sfx.play('turnAlert', { buzz:false })) toast(text('turn.touchHint'), 4000);
  });
  desktopButton.addEventListener('click', async () => {
    if (!supported() || requesting) return;
    if (desktopEnabled && Notification.permission === 'granted') {
      desktopEnabled = false; write('rummi-turn-desktop', 'off'); closeNotification(); labels(); return;
    }
    if (Notification.permission === 'denied') { toast(text('turn.blockedHint'), 5000); return; }
    requesting = true; labels();
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      desktopEnabled = permission === 'granted'; write('rummi-turn-desktop', desktopEnabled ? 'on' : 'off');
      if (desktopEnabled) toast(text('turn.desktopReady'), 4000);
    } catch { toast(text('turn.unsupported'), 5000); }
    finally { requesting = false; labels(); }
  });
  function foreground() {
    clearTimeout(foregroundTimer);
    foregroundTimer = setTimeout(() => {
      if (document.hidden || !mine()) return;
      closeNotification(); showBanner(); if (pendingSound) trySound(); labels();
    }, 160);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) hideBanner(); else foreground(); });
  window.addEventListener('focus', foreground);
  window.addEventListener('resize', position);
  window.addEventListener('pagehide', clear);
  window.addEventListener('pageshow', () => sync(S));
  window.addEventListener('offline', () => { hideBanner(); closeNotification(); });
  window.addEventListener('rummi-audio', labels);
  document.getElementById('effectVolume')?.addEventListener('input', labels);
  for (const event of ['pointerup', 'keydown']) window.addEventListener(event, e => {
    if (pendingSound) trySound();
    if (mine() && e.target instanceof Element && e.target.closest('#game .dock,#table')) { engaged = true; hideBanner(); }
  }, { passive:true });
  I18N.on(() => { labels(); if (!banner.classList.contains('hidden')) position(); });
  window.TurnAlerts = { sync, clear, get activeKey() { return currentKey; } };
  labels(); if (S) sync(S);
})();
