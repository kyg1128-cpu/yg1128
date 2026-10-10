/* 루미큐브 온라인 — 브라우저 쪽 */
const R = window.RummiRules;
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const owns = (o, k) => Object.prototype.hasOwnProperty.call(o, k);   // Object.hasOwn은 iOS 15.4부터라 옛 아이폰을 위해

let session = null;   // { room, token }
let S = null;         // 서버가 보낸 내 시점의 상태
let es = null;
let skew = 0;
let rackOrder = [];   // 내 손패 표시 순서
let newDraw = new Set();
let W = null;         // 내 차례 작업 중 상태 { seq, table, sel:Set }
let sound = true;     // 소리 설정은 sfx.js(Sfx.mode)가 맡음 — 이 값은 Sfx가 없을 때만 씀
try { sound = localStorage.getItem('rummi-sound') !== 'off'; } catch {}
let lastTurnSeq = -1, lastScreen = '';
let chat = [], chatOpen = false, chatSeen = 0, bubbleTimer;   // 채팅 기록 / 창 열림 / 읽은 마지막 번호

// ---------- 말 (i18n.js) — 서버는 코드+값만, 글자는 보는 사람의 말로. 코드가 없으면 서버가 준 한국어 그대로 ----------
const tx = (k, p) => (window.I18N ? I18N.t(k, p) : k);
const levelName = l => (l === 'easy' || l === 'hard' ? tx('level.' + l) : '');
const BOT_KEYS = { '로봇 루미': 'rumi', '로봇 큐브': 'cube', '로봇 타일': 'tile', '로봇 조커': 'joker', '로봇': 'robot' };   // 옛 서버(botKey 없음)용
const isSelfName = n => n === '나' || n === 'Me';   // 이름 없이 혼자 연습할 때 쓰는 이름
function botKeyOf(x) {
  if (!x) return null;
  if (x.botKey) return x.botKey;
  const p = x.id && S && S.players ? S.players.find(q => q.id === x.id) : null;
  if (p && p.botKey) return p.botKey;
  return (x.bot || (p && p.bot)) && owns(BOT_KEYS, String(x.name)) ? BOT_KEYS[x.name] : null;
}
// 사람 이름은 그대로, 봇은 내 말로 ('로봇 루미' / 'Robot Rumi', 자리표는 짧게 '루미' / 'Rumi')
function displayName(x, short) {
  if (!x) return '';
  const k = botKeyOf(x);
  if (k) return tx((short ? 'botShort.' : 'bot.') + k);
  if (S && S.me && x.id === S.me.id && isSelfName(x.name)) return tx('me.self');
  return String(x.name == null ? '' : x.name);
}
// 서버 오류 → 내 말 (code가 없으면 서버가 보낸 한국어)
function errText(j, status) {
  j = j || {};
  const p = j.params && typeof j.params === 'object' ? j.params : {};
  if (j.code === 'rule') {
    if (p.rule === 'setInvalid') {
      if (I18N.has('analyze.' + p.sub)) return tx('rule.setInvalid', { index: p.index, sub: tx('analyze.' + p.sub) });
    } else if (p.rule && I18N.has('rule.' + p.rule)) return tx('rule.' + p.rule, p);
  } else if (j.code && I18N.has('err.' + j.code)) return tx('err.' + j.code, p);
  // 코드 없는 한국어 오류(옛 서버·없는 요청): 한국어 화면에선 그대로, 다른 말이면 일반 문구로 (한국어가 섞이지 않게)
  if (j.error) return I18N.lang === 'ko' ? j.error : tx(status === 404 ? 'err.unknown' : status >= 500 ? 'err.server' : 'err.generic');
  return tx(status === 404 ? 'err.unknown' : status >= 500 ? 'err.server' : 'err.network');
}
// 방이 사라졌거나 내가 더는 참가자가 아님 (code가 없으면 옛 한국어 문구로 판단)
const goneErr = err => !!err && (err.code ? err.code === 'roomNotFound' || err.code === 'notMember' : /방|참가자/.test(err.ko || err.message || ''));
// 진행 기록 한 줄: { k, p, t } → 내 말 (옛 서버는 한국어 문자열)
function logText(e) {
  if (!e) return '';
  if (typeof e === 'string') return e;
  if (e.k && I18N.has('log.' + e.k)) {
    const p = Object.assign({}, e.p);
    // 이름 없이 혼자 연습할 때(이름 '나'/'Me')는 '나님 승리!' 대신 '내가 이겼어요!'
    const selfLine = p.who && typeof p.who === 'object' && !p.who.botKey && isSelfName(p.who.name) && S && meName() === p.who.name && I18N.has(`log.${e.k}.me`);
    if (p.who && typeof p.who === 'object') p.who = displayName(p.who);
    if (p.why && !I18N.has('log.why.' + p.why)) delete p.why;
    return tx(selfLine ? `log.${e.k}.me` : 'log.' + e.k, p);
  }
  return String(e.t || '');
}
// 봇 말: { key, i } → 내 말 (옛 서버는 한국어 문장을 사전에서 찾아 봄). 사람 말은 번역하지 않음
function chatText(m) {
  if (!m || !m.bot) return m ? m.text : '';
  let key = m.key, i = m.i;
  if (!key) {
    for (const k of ['hello', 'nice', 'congrats', 'win']) {
      const at = [].concat(I18N.ko('botline.' + k) || []).indexOf(m.text);
      if (at >= 0) { key = k; i = at; break; }
    }
  }
  const list = key ? tx('botline.' + key) : null;
  return Array.isArray(list) && list[i] != null ? list[i] : m.text;
}

// ---------- 서버 통신 ----------
async function api(path, body = {}) {
  let r;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try { r = await fetch('/api/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
    body: JSON.stringify(Object.assign({}, session, body)),
  }); } catch (cause) { const err = new Error(tx('err.network')); err.cause = cause; throw err; } finally { clearTimeout(timeout); }
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    const err = new Error(errText(j, r.status));
    err.code = j.code || null; err.params = j.params || null; err.ko = j.error || '';
    throw err;
  }
  return j;
}
// 세션은 같은 탭(sessionStorage)과 이 기기(localStorage) 둘 다에 — 탭을 닫았다가 초대 링크로 다시 와도 내 자리로.
// 사생활 보호 모드처럼 저장소가 막혀 있으면 조용히 넘어감
function saveSession() {
  const v = session ? JSON.stringify(session) : null;
  for (const k of ['sessionStorage', 'localStorage']) {
    try { if (v) window[k].setItem('rummi-session', v); else window[k].removeItem('rummi-session'); } catch {}
  }
}
function loadSession(k) {
  try {
    const s = JSON.parse(window[k].getItem('rummi-session') || 'null');
    return s && typeof s.room === 'string' && typeof s.token === 'string' ? { room: s.room, token: s.token } : null;
  } catch { return null; }
}
function dropSession(s) {   // 이 방이 사라졌을 때 그 방 기록만 지움 (다른 방 기록은 남김)
  for (const k of ['sessionStorage', 'localStorage']) {
    try { const cur = loadSession(k); if (cur && cur.token === s.token) window[k].removeItem('rummi-session'); } catch {}
  }
}
function connect() {
  if (window.UX) UX.connection('connecting');
  if (es) es.close();
  es = new EventSource(`/api/events?room=${encodeURIComponent(session.room)}&token=${encodeURIComponent(session.token)}`);
  es.onmessage = e => { if (window.UX) UX.connection('ready'); onState(JSON.parse(e.data)); };
  es.addEventListener('chatlog', e => { chat = JSON.parse(e.data); try { loadSeen(); } catch {} renderChat(); mountChat(); });   // 저장소가 막힌 사생활 보호 모드에서도 대화 기록은 보이게
  es.addEventListener('chat', e => onChat(JSON.parse(e.data)));
  const mine = es;
  es.onerror = async () => {
    // 방이 사라졌으면 처음 화면으로 (내가 나가는 중이거나 다른 방으로 옮긴 뒤면 조용히)
    if (es !== mine || !session) return;
    if (window.UX) UX.connection(navigator.onLine ? 'reconnecting' : 'offline');
    try { await api('hello'); } catch (err) {
      if (es === mine && goneErr(err)) { toast(err.message); leaveLocal(); }
    }
  };
}
function leaveLocal() {
  if (window.UX) UX.connection('idle');
  if (window.TileMotion) TileMotion.clear();
  finishReveal(false);   // 연출 중에 방이 사라져도 칩·배너가 처음 화면에 남지 않게
  if (es) es.close();
  es = null; session = null; S = null; W = null; rackOrder = [];
  chat = []; chatOpen = false; renderChat();
  saveSession();
  history.replaceState(null, '', location.pathname);
  $('#btnRejoin').classList.add('hidden');
  for (const id of ['#tv', '#rulesSheet', '#coach']) $(id).classList.add('hidden');
  show('home');
  mountChat();
}

// ---------- 화면 ----------
function show(id) {
  for (const s of ['home', 'lobby', 'game']) $('#' + s).classList.toggle('hidden', s !== id);
  lastScreen = id;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}
// 내 차례 알림: 종소리 솔→도 + 진동 (sfx.js)
function beep() { sfx('turn'); }
// ---------- 손맛 도우미 (소리·진동·연출) ----------
const sfx = (name, opts) => { try { if (window.Sfx) Sfx.play(name, opts); } catch {} };
const isCalm = () => document.body.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastMove = new Set();   // 지난 확정 때 놓인 타일 — 다음 확정 전까지 금빛 받침선
let alerted = new Set();    // '1장!' 알림을 이미 울린 상대 (판마다)
let chipPulse = null;       // { id, at } 뽑은 사람 칩 위 +1
let shownIds = new Set();   // 남의 미리보기에서 이미 보여 준 타일 (새로 나타난 것만 서서히)
let graceAt = null;         // { id, until } 연결 끊긴 사람 차례가 자동으로 넘어가는 시각
let RV = null;              // 진행 중인 턴 확정 연출
let drawSoundAt = 0;
function drawSound() { if (Date.now() - drawSoundAt > 1500) { drawSoundAt = Date.now(); sfx('draw'); } }
const newWork = () => ({
  seq: S.turnSeq, table: S.table.map(x => x.slice()), sel: new Set(),
  hist: [],                                   // 한 수 취소용 (최대 60)
  validKeys: new Set(S.table.map(R.setKey)),  // 이미 '맞음' 소리를 낸 묶음
  meldReady: false, oops: null, oopsAt: 0,
});
function nextSeatId() {
  if (!S || S.state !== 'playing') return null;
  const i = S.players.findIndex(p => p.id === S.turnId);
  return i < 0 ? null : S.players[(i + 1) % S.players.length].id;
}
const amNext = () => S.players.length > 2 && nextSeatId() === S.me.id;   // 둘이 할 땐 늘 다음이라 알리지 않음
function glowDock() {
  if (isCalm()) return;
  const d = $('.dock');
  d.classList.remove('glow'); void d.offsetWidth; d.classList.add('glow');
  setTimeout(() => d.classList.remove('glow'), 700);
}
// 알림(toast)이 아래 받침의 버튼을 가리지 않도록 받침 높이를 CSS에 알려 줌 (손패가 두세 줄이 되면 받침이 높아짐)
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    const h = $('.dock').getBoundingClientRect().height;
    if (h) document.documentElement.style.setProperty('--dock-h', Math.round(h) + 'px');
  }).observe($('.dock'));
}

// 바로 전 상태와 비교해 '방금 무슨 일이 있었나' 계산 (서버 도움 없이)
function whatChanged(a, b) {
  if (a.state !== 'playing' || (b.state !== 'playing' && b.state !== 'ended')) return null;
  if (a.turnSeq === b.turnSeq && a.state === b.state) return null;   // 이긴 수는 turnSeq가 안 바뀌고 ended가 됨
  // 딱 한 사람의 한 수만: 연결이 잠깐 끊겨 여러 턴을 건너뛰었으면 누구 수인지 모르므로 연출하지 않음
  if (b.state === 'ended' ? b.turnSeq !== a.turnSeq : b.turnSeq !== a.turnSeq + 1) return null;
  const pa = a.players.find(p => p.id === a.turnId);
  if (!pa) return null;
  const pb = b.players.find(p => p.id === a.turnId);
  const d = R.tableDiff(a.table, b.table);
  const c = { actor: pa.id, name: displayName(pa), me: pa.id === b.me.id, added: d.added, touchedOld: d.removed, placed: d.placed,
    drew: false, firstMeld: false, jokerPlayed: false, wentOut: false, meldValue: 0 };
  if (!d.added.length && !d.removed) { c.placed = []; c.drew = !!pb && pb.count > pa.count; return c; }
  c.firstMeld = !!pb && !pa.melded && pb.melded;
  c.jokerPlayed = d.placed.some(id => id >= 104);
  c.wentOut = b.state === 'ended' && !!pb && pb.count === 0;
  if (c.firstMeld) c.meldValue = d.added.reduce((s, i) => { const x = R.analyze(b.table[i]); return s + (x.ok ? x.value : 0); }, 0);
  return c;
}
const afterReveal = fn => { if (RV) RV.after.push(fn); else fn(); };
function startReveal(c) {
  if (RV) finishReveal(false);
  lastMove = new Set(c.placed);
  const n = c.placed.length;
  const tier = c.wentOut ? 4 : (n >= 6 || c.touchedOld >= 3) ? 3 : (n >= 3 || c.firstMeld) ? 2 : 1;
  RV = { c, tier, calm: isCalm(), lit: new Set(), litAt: {}, shimmer: new Set(), timers: [], after: [], layers: [], started: false };
  document.body.classList.add('revealing');   // 결과 창(renderOverlay)은 이 동안 기다림
}
function revealLayer(cls, rect, text) {
  const L = el('div', 'rv-layer ' + cls, text);
  if (/rv-shaft|rv-burst/.test(cls)) Object.assign(L.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
  document.body.append(L);
  RV.layers.push(L);
  return L;
}
// 새로 생기거나 바뀐 묶음이 테이블 순서대로 140ms 간격으로 빛나며 음이 올라감 (전체 1.5초 안, 아무 데나 누르면 건너뜀)
function runReveal() {
  const r = RV;
  if (!r || r.started) return;
  r.started = true;
  const c = r.c, calm = r.calm, k = c.added.length;
  const at = (ms, fn) => r.timers.push(setTimeout(() => { if (RV === r) fn(); }, calm ? ms / 2 : ms));
  let step = 140;
  if (k * step > 840) step = Math.max(50, Math.floor(840 / k));
  const rect = $('#table').getBoundingClientRect();
  const who = c.me ? tx('reveal.me') : c.name;
  const tableNow = S.table, placed = new Set(c.placed);
  // '+N장 · 이름'은 차례 안내줄 위에, 큰 문구는 테이블 아래쪽에 (위쪽 묶음들이 빛나는 걸 가리지 않게)
  // 처음 글자는 첫 묶음의 장수로 ('+0장'이 잠깐 보이지 않게)
  const firstN = k ? (tableNow[c.added[0]] || []).filter(id => placed.has(id)).length : c.placed.length;
  const chip = revealLayer('rv-chip' + (r.tier === 1 ? ' soft' : ''), rect, tx('reveal.chip', { n: firstN, who }));
  const sr = $('#status').getBoundingClientRect();
  chip.style.top = Math.round(Math.max(4, sr.top + (sr.height - chip.offsetHeight) / 2)) + 'px';
  let count = 0;
  if (r.tier === 3 && !calm) revealLayer('rv-shaft', rect);
  if (r.tier === 3 && window.Sfx) Sfx.buzz('big');
  const lines = [];
  if (c.firstMeld) lines.push(c.me ? tx('reveal.firstMeldMe', { v: c.meldValue }) : tx('reveal.firstMeld', { name: c.name, v: c.meldValue }));
  if (r.tier === 3) lines.push(c.touchedOld >= 3 ? tx('reveal.rebuild', { n: c.touchedOld }) : tx('reveal.big', { n: c.placed.length }));
  if (lines.length && r.tier >= 2) {
    at(Math.min(step, 160), () => {
      const b = revealLayer('rv-banner', rect, lines[0]);
      if (lines[1]) b.append(el('small', '', lines[1]));
      b.style.top = Math.round(Math.max(rect.top + 8, rect.bottom - b.offsetHeight - 14)) + 'px';
    });
  }
  c.added.forEach((idx, i) => at(i * step, () => {
    r.lit.add(idx); r.litAt[idx] = Date.now();
    const d = document.querySelector(`#table .set[data-set="${idx}"]`);
    if (d) { d.classList.add('rv'); if (!calm) d.classList.add('sweep'); }
    const ids = tableNow[idx] || [];
    count += ids.filter(id => placed.has(id)).length;
    chip.textContent = tx('reveal.chip', { n: count, who });
    const joker = ids.some(id => id >= 104 && placed.has(id));
    if (joker) ids.forEach(id => { if (id >= 104 && placed.has(id)) r.shimmer.add(id); });
    if (joker && d) d.querySelectorAll('.tile.joker').forEach(t => { if (r.shimmer.has(Number(t.dataset.id))) t.classList.add('shimmer'); });
    sfx(joker ? 'joker' : 'commit', { step: i + 1 });
  }));
  const lightsEnd = k * step;
  if (c.wentOut) {
    at(lightsEnd + 80, () => { if (!calm) revealLayer('rv-burst', rect); else revealLayer('rv-burst calmburst', rect); sfx('win'); });
    at(lightsEnd + 80 + 1200, () => finishReveal(true));
  } else {
    at(Math.min(1500, Math.max(900, lightsEnd + 520)), () => finishReveal(true));
  }
  document.addEventListener('pointerdown', skipReveal, true);
  document.addEventListener('keydown', skipReveal, true);
}
// 누르면 건너뜀. 이때 화면을 통째로 다시 그리면 누른 타일이 사라져 그 탭(클릭)이 먹히지 않으므로, 연출 표시만 걷어 냄
function skipReveal() {
  if (!RV) return;
  finishReveal(false);
  document.querySelectorAll('#table .set.rv').forEach(d => d.classList.remove('rv', 'sweep'));
  document.querySelectorAll('#table .tile.shimmer').forEach(t => t.classList.remove('shimmer'));
}
function finishReveal(doRender) {
  const r = RV;
  if (!r) return;
  RV = null;
  r.timers.forEach(clearTimeout);
  document.removeEventListener('pointerdown', skipReveal, true);
  document.removeEventListener('keydown', skipReveal, true);
  for (const L of r.layers) {
    if (L.classList.contains('rv-chip') || L.classList.contains('rv-banner')) { L.classList.add('out'); setTimeout(() => L.remove(), 400); }
    else L.remove();
  }
  document.body.classList.remove('revealing');
  if (doRender) render();
  for (const fn of r.after) { try { fn(); } catch (e) { console.error(e); } }
}
// 상대가 처음으로 1장이 되면 나머지 사람에게 부드러운 알림 두 번 (판마다 사람당 한 번)
function watchSeats(firstState) {
  if (S.state !== 'playing') return;
  for (const p of S.players) {
    if (p.id === S.me.id || p.count !== 1 || alerted.has(p.id)) continue;
    alerted.add(p.id);
    if (!firstState) afterReveal(() => { sfx('next'); setTimeout(() => sfx('next'), 280); });
  }
}

const isMyTurn = () => S && S.state === 'playing' && S.turnId === S.me.id;
const meName = () => (S.players.find(p => p.id === S.me.id) || {}).name;

function onState(s) {
  skew = s.now - Date.now();
  const prevS = S;
  const firstState = !S;
  const newRound = !S || S.round !== s.round;
  const prevRack = new Set(S && !newRound ? S.me.rack : []);
  if (newRound) { rackOrder = []; lastMove = new Set(); alerted = new Set(); if (RV) finishReveal(false); }
  S = s;
  // 손패 순서 유지 + 새로 뽑은 타일 표시
  const now = new Set(S.me.rack);
  rackOrder = rackOrder.filter(id => now.has(id));
  const added = S.me.rack.filter(id => !rackOrder.includes(id));
  newDraw = new Set(prevRack.size ? added : []);
  rackOrder.push(...added);
  if (!prevRack.size && added.length) sortRack('num');

  // 방금 일어난 일: 누가 몇 장을 냈나(연출) / 뽑았나(+1)
  const change = !newRound && prevS ? whatChanged(prevS, S) : null;
  if (change && change.placed.length) startReveal(change);
  else if (prevS && !newRound && S.turnSeq > prevS.turnSeq + 1) lastMove = new Set();   // 건너뛴 턴들: 옛 받침선은 지움
  if (S.turnSeq !== lastTurnSeq) {
    lastTurnSeq = S.turnSeq;
    W = null;   // 턴이 바뀌면 한 수 취소 기록도 새로
    if (isMyTurn()) afterReveal(() => { beep(); glowDock(); });
    else if (!firstState && amNext()) afterReveal(() => sfx('next'));
  }
  if (isMyTurn() && !W) W = newWork();
  if (!isMyTurn()) W = null;
  if (change && change.drew) {
    chipPulse = { id: change.actor, at: Date.now() };
    if (change.me) drawSound(); else sfx('draw', { quiet: true, buzz: false });
  }
  watchSeats(firstState);
  const cur = S.state === 'playing' && S.players.find(p => p.id === S.turnId);
  graceAt = cur && !cur.connected && !S.deadline && Number.isFinite(cur.graceLeft) ? { id: cur.id, until: Date.now() + cur.graceLeft * 1000 } : null;
  if (firstState) renderChat();   // 내 메시지 표시(오른쪽 정렬)는 내 id를 안 다음에야 가능
  render();
  if (RV && !RV.started) runReveal();
}

function render() {
  if (!S) return;
  document.title = tx(isMyTurn() ? 'doc.myTurn' : 'doc.title');
  if (S.state === 'lobby') renderLobby();
  else { show('game'); renderGame(); renderOverlay(); }
  mountChat();
  coach();   // 처음 오신 분 안내 (flow.js)
}

// ---------- 채팅 ----------
const chatPanel = $('#chatPanel');
const seenKey = () => 'rummi-chatseen-' + (session ? session.room : '');
function loadSeen() { try { chatSeen = Number(sessionStorage.getItem(seenKey()) || 0); } catch { chatSeen = 0; } }
const chatVisible = () => lastScreen === 'lobby' || chatOpen;
const unreadCount = () => chat.filter(m => m.id > chatSeen && !(S && m.from === S.me.id)).length;
function markSeen() {
  const last = chat.length ? chat[chat.length - 1].id : 0;
  if (last > chatSeen) { chatSeen = last; try { sessionStorage.setItem(seenKey(), String(last)); } catch {} }
}
function updateBadge() {
  const n = unreadCount();
  for (const id of ['#chatBadge', '#chatBadge2']) {
    const b = $(id);
    b.textContent = n > 9 ? '9+' : String(n);
    b.classList.toggle('hidden', n === 0);
  }
  $('#btnChat').setAttribute('aria-label', n ? tx('game.chatUnread', { n }) : tx('game.chat'));
}
const chatName = m => displayName({ id: m.from, name: m.name, bot: m.bot, botKey: m.botKey });
function msgEl(m) {
  const li = el('li', 'msg' + (S && m.from === S.me.id ? ' mine' : '') + (m.bot ? ' bot' : ''));
  li.append(el('div', 'who', (m.bot ? '🤖 ' : '') + chatName(m)), el('div', 'txt', chatText(m)));
  try { li.title = new Date(m.at).toLocaleTimeString(I18N.locale, { hour: 'numeric', minute: '2-digit' }); } catch {}
  return li;
}
// 맨 아래를 보고 있었는지 기억 → 키보드가 올라와 목록이 줄어도 마지막 메시지가 계속 보이게
let chatAtBottom = true;
$('#chatList').addEventListener('scroll', e => {
  const l = e.currentTarget;
  chatAtBottom = l.scrollHeight - l.scrollTop - l.clientHeight < 40;
}, { passive: true });
try {
  new ResizeObserver(() => { const l = $('#chatList'); if (chatAtBottom) l.scrollTop = l.scrollHeight; }).observe($('#chatList'));
} catch {}
function renderChat() {
  const list = $('#chatList');
  list.replaceChildren(...(chat.length ? chat.map(msgEl) : [el('li', 'chat-empty', tx('chat.empty'))]));
  list.scrollTop = list.scrollHeight;
}
// 대기실이면 카드 안으로, 게임 중이면 화면 아래 창으로 옮김 (입력 중인 글자는 그대로 유지)
function mountChat() {
  if (lastScreen === 'lobby') {
    const slot = $('#lobbyChatSlot');
    if (chatPanel.parentElement !== slot) slot.append(chatPanel);
    chatPanel.className = 'chat inline';
  } else {
    if (chatPanel.parentElement !== document.body) document.body.insertBefore(chatPanel, $('#chatBubble'));
    chatPanel.className = 'chat sheet' + (chatOpen && lastScreen === 'game' ? '' : ' hidden');
  }
  document.body.classList.toggle('chat-open', chatOpen && lastScreen === 'game');   // 넓은 화면: 테이블이 채팅 창 옆으로 비켜 섬 (style.css)
  if (chatVisible()) { markSeen(); $('#chatBubble').classList.add('hidden'); }
  updateBadge();
}
function openChat(open, focusBack) {
  const wasOpen = chatOpen;
  chatOpen = open;
  mountChat();
  if (open) {
    const list = $('#chatList');
    list.scrollTop = list.scrollHeight;
    if (!matchMedia('(pointer: coarse)').matches) $('#chatInput').focus();   // 휴대폰은 키보드가 화면을 가리지 않게 바로 띄우지 않음
  } else if (wasOpen && focusBack) {
    // 닫으면 초점은 채팅을 연 단추로 (결과 창이면 '이야기 나누기', 아니면 💬)
    const b = !$('#overlay').classList.contains('hidden') ? $('#btnChat2') : $('#btnChat');
    if (b && b.offsetParent) b.focus({ preventScroll: true });
  }
}
// 폰의 아래 창(받침을 덮는 창)은 바깥을 누르면 닫힘 — 그 탭은 아래 게임판에 전해지지 않게 삼킴
let swallowClickUntil = 0;
document.addEventListener('pointerdown', e => {
  if (!chatOpen || lastScreen !== 'game' || chatPanel.classList.contains('hidden') || chatPanel.classList.contains('inline')) return;
  const t = e.target;
  if (!(t instanceof Element) || chatPanel.contains(t) || t.closest('#btnChat, #btnChat2, #chatBubble, #menu, #rulesSheet, #toast')) return;
  const dock = $('.dock').getBoundingClientRect();
  if (chatPanel.getBoundingClientRect().bottom <= dock.top + 1) return;   // 넓은 화면의 옆 창은 열어 둔 채 게임 가능
  openChat(false);
  swallowClickUntil = Date.now() + 700;
}, true);
document.addEventListener('click', e => {
  if (Date.now() < swallowClickUntil) { swallowClickUntil = 0; e.preventDefault(); e.stopPropagation(); }
}, true);
function onChat(m) {
  if (chat.some(x => x.id === m.id)) return;
  chat.push(m);
  if (chat.length > 60) chat.shift();
  const list = $('#chatList');
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const empty = list.querySelector('.chat-empty');
  if (empty) empty.remove();
  list.append(msgEl(m));
  while (list.children.length > 60) list.firstChild.remove();
  const mine = S && m.from === S.me.id;
  if (nearBottom || mine) list.scrollTop = list.scrollHeight;
  if (chatVisible()) markSeen();
  else if (!mine) { showBubble(m); chime(); }
  updateBadge();
}
function showBubble(m) {
  if (lastScreen !== 'game') return;
  const b = $('#chatBubble');
  b.replaceChildren(el('b', '', (m.bot ? '🤖' : '') + chatName(m)), document.createTextNode(chatText(m)));
  b.style.top = Math.round($('#status').getBoundingClientRect().bottom + 8) + 'px';   // 차례 안내줄을 가리지 않게 그 아래에
  b.classList.toggle('pass', isMyTurn());   // 내 차례: 말풍선 아래 '＋새 묶음'을 누르려던 탭이 채팅으로 새지 않게
  b.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => b.classList.add('hidden'), 4000);
}
function chime() {
  if (window.Sfx) return Sfx.play('chat');   // 소리 모드(소리·진동/진동만/끔)를 따름
  if (!sound) return;
  try {
    const ctx = beep.ctx || (beep.ctx = new AudioContext());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 1046; g.gain.value = 0.035;
    o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18); o.stop(ctx.currentTime + 0.2);
  } catch {}
}
let chatPosting = false;
async function sendChat(text) {
  text = String(text || '').trim();
  if (!text || !session || chatPosting) return false;
  chatPosting = true;
  const buttons = [...document.querySelectorAll('#chatQuick button, #chatSend')];
  buttons.forEach(b => b.disabled = true);
  $('#chatSend').setAttribute('aria-busy', 'true');
  try { await api('chat', { text }); return true; } catch (err) { toast(err.message); return false; }
  finally { chatPosting = false; buttons.forEach(b => b.disabled = false); $('#chatSend').setAttribute('aria-busy', 'false'); }
}
// 자주 쓰는 말: 보내는 사람의 말로 (받는 사람에게는 그대로 감 — 사람 말은 번역하지 않음)
function buildQuick() {
  const box = $('#chatQuick');
  box.replaceChildren();
  for (const q of [].concat(tx('chat.quick'))) {
    const b = el('button', '', q);
    b.type = 'button';
    b.onclick = () => sendChat(q);
    box.append(b);
  }
}
buildQuick();
$('#chatForm').onsubmit = async e => {
  e.preventDefault();
  const input = $('#chatInput');
  const submitted = input.value;
  if (await sendChat(submitted) && input.value === submitted) input.value = '';
};
$('#btnChat').onclick = () => openChat(!chatOpen);
$('#btnChat2').onclick = () => openChat(true);   // 결과 창 위로 채팅 창이 뜸
$('#btnChatClose').onclick = () => openChat(false, true);
$('#chatBubble').onclick = () => openChat(true);
// Esc: 메뉴·규칙·TV가 위에 떠 있으면 그것부터 닫고(flow.js), 채팅은 그다음 Esc에
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !chatOpen) return;
  if (document.querySelector('#menu:not(.hidden), #rulesSheet:not(.hidden), #tv:not(.hidden)')) return;
  openChat(false, true);
});

function renderLobby() {
  show('lobby');
  $('#lobbyCode').textContent = S.code;
  $('#lobbyCount').textContent = `(${S.players.length}/4)`;
  const ul = $('#lobbyPlayers'); ul.replaceChildren();
  for (const p of S.players) {
    const li = el('li', p.connected ? '' : 'off');
    li.append(el('span', '', (p.bot ? '🤖 ' : '') + displayName(p)));
    if (p.id === S.hostId) li.append(el('span', 'tag', tx('lobby.host')));
    if (p.id === S.me.id && !isSelfName(p.name)) li.append(el('span', 'muted', tx('me.tag')));
    li.append(el('span', 'grow'));
    if (p.bot) {
      const lv = el('button', 'lv ' + p.level, levelName(p.level));
      if (S.hostId === S.me.id) {
        lv.title = tx('lobby.lvTitle');
        lv.onclick = () => api('setBotLevel', { botId: p.id, level: p.level === 'hard' ? 'easy' : 'hard' }).catch(err => toast(err.message));
      } else lv.disabled = true;
      li.append(lv);
    }
    if (p.bot && S.hostId === S.me.id) {
      const x = el('button', 'x', '✕'); x.title = tx('lobby.removeBot'); x.setAttribute('aria-label', `${tx('lobby.removeBot')}: ${displayName(p)}`);
      x.onclick = () => api('removeBot', { botId: p.id }).catch(err => toast(err.message));
      li.append(x);
    }
    ul.append(li);
  }
  const host = S.hostId === S.me.id;
  for (const b of ['#btnAddEasy', '#btnAddHard']) {
    const btn = $(b);
    if (!btn) continue;
    btn.classList.toggle('hidden', !host);
    btn.disabled = S.players.length >= 4;
  }
  $('#timer').value = String(S.settings.timer);
  $('#timer').disabled = !host;
  $('#btnStart').classList.toggle('hidden', !host);
  $('#btnStart').disabled = S.players.length < 2;
  $('#lobbyHint').textContent = tx(host ? (S.players.length < 2 ? 'lobby.hintFew' : 'lobby.hintReady') : 'lobby.hintWait');
  lobbyInvite();   // QR·같은 와이파이 주소 (flow.js)
  if (window.UX) UX.sync();
}

// 조커는 글자 대신 SVG 문양(<use>)으로 — 기기·글꼴마다 그림 문자로 바뀌지 않게. opts.style이 있으면 그 모양으로 고정(조커 고르기 미리보기)
function setUseHref(u, style) {   // 옛 iOS Safari를 위해 xlink:href도 같이
  u.setAttribute('href', '#jk-' + style);
  u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#jk-' + style);
}
function jokerSvg(style) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', 'jkg' + (style ? ' fixed' : ''));
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  const u = document.createElementNS(NS, 'use');
  setUseHref(u, style || jokerStyle);
  s.append(u);
  return s;
}
function tileEl(id, opts = {}) {
  const t = R.tile(id);
  const e = el('div', 'tile ' + (t.joker ? 'joker' : 'c' + t.color), t.joker ? null : String(t.num));
  if (t.joker) e.append(jokerSvg(opts.style));
  e.dataset.id = id;
  if (opts.jokerAs) e.dataset.as = opts.jokerAs;
  return e;
}
// 게임판 타일: 화면 읽기 이름 ('빨강 5' / 'red 5', 조커) + 내 차례면 키보드로도 고를 수 있게 (Tab → Enter/Space)
const tileLabel = id => { const t = R.tile(id); return t.joker ? tx('rules.joker') : I18N.tileName({ color: t.color, num: t.num }); };
// 키보드로 고르기는 마우스·키보드 기기에서만 — 터치 화면에서 타일을 '누를 수 있는 단추'로 만들면
// 브라우저가 묶음 빈틈을 누른 손가락도 옆 타일로 끌어당겨, 묶음에 놓으려던 탭이 타일 고르기가 됨
const keyboardPlay = () => { try { return !matchMedia('(pointer: coarse)').matches; } catch { return true; } };
function gameTile(t, id, mine, selected, kb) {
  t.setAttribute('aria-label', tileLabel(id));
  if (mine) { t.setAttribute('role', 'button'); t.setAttribute('aria-pressed', String(!!selected)); if (kb) t.tabIndex = 0; }
  return t;
}
// 다시 그리기 전에 키보드 초점이 어디 있었는지 → 다시 그린 뒤 같은 타일·묶음으로
function focusKey() {
  const a = document.activeElement;
  if (!a || !a.closest || !a.closest('#table, #rack')) return null;
  if (a.matches('.tile')) return { tile: a.dataset.id };
  if (a.matches('#table .set')) return { set: a.dataset.set };
  return { rack: true };
}
function restoreFocus(k) {
  if (!k) return;
  const t = k.tile != null ? document.querySelector(`#table .tile[data-id="${k.tile}"], #rack .tile[data-id="${k.tile}"]`)
    : k.set != null ? document.querySelector(`#table .set[data-set="${k.set}"]`) || document.querySelector('#table .newset')
    : $('#rack .rack-slot') || $('#rack .tile');
  if (t && t.tabIndex >= 0) { try { t.focus({ preventScroll: true }); } catch {} }
}

let boardScrollKey = '';
function renderGame() {
  const scrollKey = S.code + ':' + S.round;
  const keepScroll = boardScrollKey === scrollKey;
  boardScrollKey = scrollKey;
  const tableScroll = keepScroll ? { top: $('#table').scrollTop, left: $('#table').scrollLeft } : { top: 0, left: 0 };
  const rackScroll = keepScroll ? $('#rack').scrollTop : 0;
  const setScroll = new Map();
  const tileKey = d => [...d.querySelectorAll('.tile[data-id]')].map(t => t.dataset.id).sort().join(',');
  if (keepScroll) $('#table').querySelectorAll('.set').forEach(d => { if (d.scrollLeft) setScroll.set(tileKey(d), d.scrollLeft); });
  const motionBefore = window.TileMotion ? TileMotion.before(S.code + ":" + S.round) : null;
  const mine = isMyTurn();
  const playing = S.state === 'playing';
  const refocus = focusKey(), kb = keyboardPlay();
  $('#chatBubble').classList.toggle('pass', mine);
  // 상단 자리표: 이름 · 남은 장수 · 첫 등록 전 · 다음 차례 · 생각 중 · 연결 끊김
  const pl = $('#players'); pl.replaceChildren();
  pl.classList.toggle('p4', S.players.length >= 4);
  const nextId = nextSeatId();
  for (const p of S.players) {
    const turn = p.id === S.turnId;
    const danger = playing && p.count <= 2;
    const c = el('div', 'pchip' + (turn ? ' turn' : '') + (p.connected ? '' : ' off') + (danger ? ' danger' : ''));
    if (!p.connected) c.append(el('span', 'offi', '📵'));
    const l1 = el('span', 'l1');   // 첫 줄: 이름 · 장수 · 등록 전 · 다음 (둘째 줄 .sub는 이 폭에 맞춰짐)
    c.append(l1);
    const b = el('b');
    b.append(el('span', 'nm', p.bot ? '🤖' + displayName(p, true) : displayName(p)));
    if (p.id === S.me.id && !isSelfName(p.name)) b.append(el('span', 'me', tx('chip.me')));   // 이름 없이 연습하면 이름이 '나' → '나(나)'가 되지 않게
    if (p.id === S.me.id) c.classList.add('self');
    l1.append(b);
    const tips = [];
    if (p.bot) tips.push(tx('chip.botTip', { level: levelName(p.level) }));
    l1.append(el('span', 'cnt', danger ? tx('chip.danger', { n: p.count }) : String(p.count)));
    if (!p.melded && playing) {
      tips.push(tx('chip.preTip'));
      const pre = el('span', 'pre');
      pre.append(el('span', 'w', tx('chip.pre')), el('span', 'o'));
      l1.append(pre);
    }
    if (p.id === nextId) l1.append(el('span', 'nx', tx('chip.next')));
    if (playing && turn) {
      if (graceAt && graceAt.id === p.id) c.append(el('span', 'sub grace', tx('chip.grace', { s: Math.max(0, Math.ceil((graceAt.until - Date.now()) / 1000)) })));
      else if (p.bot && S.preview) c.append(el('span', 'sub', tx('chip.placing')));
      else if (p.bot) {
        const s = el('span', 'sub', tx('chip.thinking'));
        const dots = el('span', 'dots');
        dots.append(el('i', '', '.'), el('i', '', '.'), el('i', '', '.'));
        s.append(dots);
        s.setAttribute('aria-label', tx('chip.thinkingAria'));
        c.append(s);
      }
    }
    if (!p.connected) tips.push(tx('chip.offTip'));
    if (chipPulse && chipPulse.id === p.id && Date.now() - chipPulse.at < 900) {
      const plus = el('span', 'plus1', '+1');
      plus.style.animationDelay = (chipPulse.at - Date.now()) + 'ms';   // 다시 그려도 이어서
      c.append(plus);
      setTimeout(() => plus.remove(), 900 - (Date.now() - chipPulse.at));
    }
    tips.unshift(displayName(p));   // 잘린 긴 이름도 마우스를 올리면 전체가 보이게
    c.title = tips.join(' · ');
    pl.append(c);
  }
  // 칩은 그릴 때마다 새로 만들어짐(남이 놓는 동안 계속) → 2장! 후광·생각 중 점이 처음부터 다시 뛰지 않게 같은 시계에 맞춤
  if (pl.getAnimations) for (const a of pl.getAnimations({ subtree: true })) if (a.animationName === 'halo' || a.animationName === 'dot') a.startTime = 0;
  $('#poolCount').textContent = tx('game.pool', { n: S.pool });
  $('#menuCode').textContent = S.code;

  // 테이블
  const table = mine ? W.table : (S.preview || S.table);
  const base = new Set(S.table.flat());
  const myRack = new Set(S.me.rack);
  const tb = $('#table'); tb.replaceChildren();
  tb.classList.toggle('mine', mine);
  const hasSel = mine && W.sel.size > 0;
  const info = mine ? turnInfo() : null;
  const watching = !mine && !!S.preview;
  const watchFit = watching ? new Set(R.tableDiff(S.table, S.preview).added) : null;   // 남이 만드는 중: 맞는 새 묶음만 금테
  const justfit = [];
  table.forEach((set, i) => {
    const a = R.analyze(set);
    let cls = 'set';
    if (mine) {
      if (!a.ok) cls += ' pending';
      else if (info.changed.has(i)) cls += ' fit';
      if (W.oops && W.oops.has(i)) cls += ' oops' + (Date.now() - W.oopsAt < 300 ? ' shake' : '');
    } else if (watchFit && watchFit.has(i) && a.ok) cls += ' fit';
    if (hasSel) cls += ' target';
    const lit = RV && RV.lit.has(i) && (mine || !S.preview);
    const ago = lit ? Date.now() - RV.litAt[i] : 1e9;   // 연출 중에 다시 그려져도 금빛 쓸림이 뚝 끊기지 않고 이어지게
    if (lit) cls += ' rv' + (!RV.calm && ago < 600 ? ' sweep' : '');
    const d = el('div', cls);
    if (ago < 600) d.style.animationDelay = -ago + 'ms';
    d.dataset.set = i;
    if (hasSel) { if (kb) d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-label', tx('a11y.placeSet', { n: i + 1, tiles: set.map(tileLabel).join(', ') })); }
    const row = mine && !a.ok ? el('div', 'tiles') : d;   // 만드는 중인 묶음: 타일 줄 아래에 이유 한 줄
    if (row !== d) d.append(row);
    for (const id of set) {
      const t = tileEl(id, { jokerAs: a.ok && a.jokerAs[id] });
      if (!base.has(id)) t.classList.add('fresh');
      else if (lastMove.has(id)) t.classList.add('lastmove');
      if (RV && RV.shimmer.has(id)) t.classList.add('shimmer');
      if (watching && !base.has(id) && !shownIds.has(id)) t.classList.add('fadein');
      if (mine && W.sel.has(id)) t.classList.add('sel');
      if (mine) t.draggable = true;
      row.append(gameTile(t, id, mine, mine && W.sel.has(id), kb));
    }
    if (hasSel) row.append(el('div', 'slot', '+'));
    if (mine && !a.ok) {   // 왜 아직 안 맞는지 한 줄 (1~2장은 'n장 더')
      const why = el('div', 'why' + (set.length < 3 ? ' short' : ''));
      why.append(el('span', '', set.length < 3 ? tx('table.more', { n: 3 - set.length }) : explainText(set).replace(/([\uAC00-\uD7A3A-Za-z]+) (\d)/g, '$1\u00a0$2')));   // '파랑 10'·'red 10'은 한 덩이로
      d.append(why);
    }
    if (mine && a.ok && info.changed.has(i)) {
      d.append(el('span', 'val', String(a.value)));
      const k = R.setKey(set);
      if (!W.validKeys.has(k)) { W.validKeys.add(k); justfit.push(d); }   // 맞는 순간 한 번만
    }
    tb.append(d);
  });
  shownIds = watching ? new Set(table.flat()) : new Set();
  let meldNow = false;
  if (mine && !S.me.melded && !W.meldReady && meldReady(info)) { W.meldReady = true; meldNow = true; }
  if (justfit.length) {
    justfit.forEach(d => d.classList.add('justfit'));
    if (!meldNow) sfx('valid', { step: [...info.changed].filter(i => R.analyze(W.table[i]).ok).length });
  }
  if (meldNow) sfx('firstMeld');
  if (mine) {
    const n = el('div', 'set newset' + (hasSel ? ' target' : ''), tx(hasSel ? 'table.newSet' : 'table.pickHere'));
    n.dataset.set = 'new';
    if (hasSel) { if (kb) n.tabIndex = 0; n.setAttribute('role', 'button'); }
    tb.append(n);
  } else if (!table.length) {
    tb.append(el('div', 'empty-hint', tx('table.empty')));
  }

  // 손패
  const rk = $('#rack'); rk.replaceChildren();
  const onTable = mine ? new Set(W.table.flat()) : new Set();
  for (const id of rackOrder) {
    if (onTable.has(id)) continue;
    const t = tileEl(id);
    if (mine && W.sel.has(id)) t.classList.add('sel');
    if (newDraw.has(id)) t.classList.add('newdraw', 'fresh');
    t.draggable = mine;
    rk.append(gameTile(t, id, mine, mine && W.sel.has(id), kb));
  }
  const toRack = mine && [...W.sel].some(id => myRack.has(id) && onTable.has(id));
  rk.classList.toggle('target', toRack);
  rk.classList.toggle('armed', hasSel);   // 고른 타일이 있으면 손패도 누를 곳 (돌려놓기 / 못 가져오면 안내)
  if (toRack) {   // 손패가 꽉 차 있어도 누를 수 있는 '돌려놓기' 자리
    const back = el('div', 'slot rack-slot', '↩');
    if (kb) back.tabIndex = 0; back.setAttribute('role', 'button'); back.setAttribute('aria-label', tx('a11y.toRack')); back.title = tx('a11y.toRack');
    rk.append(back);
  }
  restoreFocus(refocus);

  // 상태줄 + 버튼
  const st = $('#status');
  const turnName = displayName(S.players.find(p => p.id === S.turnId));
  st.classList.toggle('mine', mine);
  st.classList.toggle('ready', mine && W.meldReady && meldReady(info));
  if (S.state !== 'playing') st.textContent = tx('status.over');
  else if (mine && !S.me.melded) {
    // 첫 등록 계량기: 23/30 + 가는 막대 → 30 이상이고 묶음이 다 맞으면 금빛
    const ready = meldReady(info);
    const m = el('span', 'meter');
    const bar = el('span', 'bar'), fill = el('i');
    fill.style.width = Math.min(100, Math.round(info.meld / R.INITIAL_MELD * 100)) + '%';
    bar.append(fill);
    m.append(el('span', '', ready ? tx('status.meldReady') : tx('status.meld', { have: info.meld, need: R.INITIAL_MELD })), bar);
    st.replaceChildren(el('span', 'st-main', ready ? '' : tx('status.myTurnPre')), m);
    if (!info.played) st.append(' ', el('span', 'hint', tx('status.ownOnly')));
  } else if (mine) {
    st.textContent = tx('status.mine', { n: info.played });
  } else {
    st.replaceChildren(el('span', 'st-main', tx('status.theirs', { name: turnName }) + (S.preview ? tx('status.placing') : '')));
    if (amNext()) st.append(' · ', el('span', 'soon', tx('status.soon')));
  }

  const changed = mine && R.setKeyTable(W.table) !== R.setKeyTable(S.table);
  $('#btnUndo').disabled = !mine || !W.hist.length;
  $('#btnReset').classList.toggle('hidden', !mine || W.hist.length < 2);
  // 완료: 아직 못 내면 이유를 버튼에 (누르면 서버에 보내지 않고 어디를 고칠지 보여 줌)
  const done = $('#btnDone'), block = changed ? blockInfo(info) : null;
  done.disabled = !mine || !changed;
  done.classList.toggle('blocked', !!block);
  done.querySelector('.why').textContent = block ? block.sub : '';
  done.querySelector('.why').classList.toggle('hidden', !block);
  done.title = block ? block.msg : '';
  $('#btnDraw').disabled = !mine;
  $('#btnDraw').textContent = tx(S.pool ? 'game.draw' : 'game.pass');
  $('#log').textContent = logText(S.log.slice(-1)[0]);
  tick();
  $('#table').scrollTop = tableScroll.top;
  $('#table').scrollLeft = tableScroll.left;
  $('#rack').scrollTop = rackScroll;
  $('#table').querySelectorAll('.set').forEach(d => { const x = setScroll.get(tileKey(d)); if (x) d.scrollLeft = x; });
  if (motionBefore) TileMotion.after(motionBefore);
  if (window.UX) UX.sync();
}

R.setKeyTable = t => t.map(R.setKey).sort().join('|');

// 이번 턴 작업 요약: 놓은 장수, 첫 등록 점수(맞는 새 묶음 합), 안 맞는 묶음, 새로 생기거나 바뀐 묶음, 건드린 옛 묶음 수
function turnInfo() {
  const d = R.tableDiff(S.table, W.table);
  const changed = new Set(d.added), bad = [];
  let meld = 0;
  W.table.forEach((s, i) => {
    const a = R.analyze(s);
    if (!a.ok) bad.push(i);
    else if (changed.has(i)) meld += a.value;
  });
  return { played: d.placed.length, meld, bad, changed, touchedOld: d.removed };
}
const meldReady = info => info.played > 0 && !info.bad.length && !info.touchedOld && info.meld >= R.INITIAL_MELD;
// 완료를 아직 못 누르는 이유 (없으면 null): 버튼에 붙는 짧은 말 · 고칠 묶음 · 안내 문구
function blockInfo(info) {
  if (info.bad.length) {
    return { sub: tx('block.check', { n: info.bad.length }), sets: info.bad, msg: explainText(W.table[info.bad[0]]) };
  }
  if (!S.me.melded && info.touchedOld) {
    const base = new Set(S.table.flat());
    return { sub: tx('block.keepOld'), sets: [...info.changed].filter(i => W.table[i].some(id => base.has(id))), msg: tx('rule.meldLocked') };
  }
  if (!info.played) return { sub: tx('block.playOne'), sets: [], msg: tx('rule.playOne') };
  if (!S.me.melded && info.meld < R.INITIAL_MELD) {
    return { sub: tx('block.morePts', { n: R.INITIAL_MELD - info.meld }), sets: [], msg: tx('rule.meldLow', { need: R.INITIAL_MELD, have: info.meld }) };
  }
  return null;
}
// 묶음이 왜 아직 안 맞는지 → 내 말. rules.js의 explainCode(코드+값)를 쓰고, 아직 없으면 같은 판단을 여기서
function explainCodeLocal(ids) {
  const n = ids.length;
  if (n < 3) return { code: 'needMore', params: { n: 3 - n } };
  const reg = ids.map(R.tile).filter(x => !x.joker);
  if (!reg.length) return { code: 'jokersOnly', params: {} };
  if (R.analyze(ids).ok) return null;
  const tl = x => ({ color: x.color, num: x.num });
  if (reg.every(x => x.num === reg[0].num)) {
    if (n > 4) return { code: 'groupMax4', params: {} };
    const seen = new Set();
    for (const x of reg) { if (seen.has(x.color)) return { code: 'sameColor', params: { tile: tl(x) } }; seen.add(x.color); }
  }
  if (reg.every(x => x.color === reg[0].color)) {
    const seen = new Set();
    for (const x of reg) { if (seen.has(x.num)) return { code: 'dupNum', params: { tile: tl(x) } }; seen.add(x.num); }
    const nums = reg.map(x => x.num).sort((a, b) => a - b);
    if (nums[nums.length - 1] - nums[0] + 1 > n) return { code: 'gap', params: { color: reg[0].color, nums } };
    return { code: 'runMax13', params: {} };
  }
  return { code: 'mixed', params: {} };
}
function explainText(ids) {
  let c = null;
  try { c = typeof R.explainCode === 'function' ? R.explainCode(ids) : explainCodeLocal(ids); } catch { c = null; }
  if (c && c.code && I18N.has('explain.' + c.code)) return tx('explain.' + c.code, c.params || {});
  return R.explain(ids) || '';
}

// 결과 창 + 오늘의 시상식. 마지막 수 연출(body.revealing)이 끝나거나 건너뛴 뒤에만 보임. 내용은 flow.js의 ceremony()
function renderOverlay() {
  const ov = $('#overlay');
  $('#tv').classList.add('hidden');   // 게임이 시작되면 'TV로 보기'(대기실 QR)는 닫음 — 다른 기기에서 띄워 둔 화면도
  if (S.state !== 'ended' || !S.result || revealHold()) {
    ov.classList.add('hidden');
    if (S.state !== 'ended') stopCeremony();
    return;
  }
  ov.classList.remove('hidden');
  ceremony();
}

// ---------- 타일 옮기기 ----------
function moveSelected(target) {
  if (turnRequest || !W || !W.sel.size) return;
  const ids = [...W.sel];
  const myRack = new Set(S.me.rack);
  const before = W.table.map(s => s.slice()), beforeKey = R.setKeyTable(W.table);   // 한 수 취소용
  if (target === 'rack') {
    const back = ids.filter(id => myRack.has(id));
    if (back.length < ids.length) toast(tx('toast.noBack'));
    W.table = W.table.map(s => s.filter(id => !back.includes(id))).filter(s => s.length);
    back.forEach(id => W.sel.delete(id));
  } else {
    let dest = target === 'new' ? null : W.table[target];
    W.table = W.table.map(s => (s === dest ? s : s.filter(id => !W.sel.has(id))));
    if (dest) dest.push(...ids.filter(id => !dest.includes(id)));
    else W.table.push(ids);
    W.table = W.table.filter(s => s.length).map(s => { const a = R.analyze(s); return a.ok ? a.order.slice() : s; });
    W.sel.clear();
  }
  if (R.setKeyTable(W.table) !== beforeKey) {   // 실제로 바뀐 경우만 기록 (제자리 놓기는 기록 안 함)
    W.hist.push(before);
    if (W.hist.length > 60) W.hist.shift();
    W.oops = null;
    sfx(target === 'rack' ? 'back' : 'place');
  }
  sendPreview();
  render();
}
// 한 수 취소 / 이번 턴 처음으로
function undoStep() {
  if (turnRequest || !isMyTurn() || !W || !W.hist.length) return;
  W.table = W.hist.pop();
  W.sel.clear(); W.oops = null;
  sfx('back');
  sendPreview();
  render();
}
function undoAll() {
  if (turnRequest || !isMyTurn() || !W || !W.hist.length) return;
  W.table = S.table.map(s => s.slice());
  W.hist = []; W.sel.clear(); W.oops = null;
  sfx('back');
  toast(tx('toast.reset'));
  sendPreview();
  render();
}
let previewTimer;
function sendPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { if (isMyTurn() && W) api('preview', { table: W.table }).catch(() => {}); }, 150);
}

function sortRack(by) {
  const key = id => { const t = R.tile(id); return t.joker ? [9, 99, id] : by === 'num' ? [t.num, t.color, id] : [t.color, t.num, id]; };
  rackOrder.sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
}

// 클릭: 타일 선택 / 묶음·손패에 놓기
// 게임 화면(#game)에 직접 붙임 — 아이폰은 document에만 붙은 클릭은 타일·손패 같은 보통 div에서 클릭을 만들지 않음
$('#game').addEventListener('click', e => {
  if (!isMyTurn() || !W) return;
  const tile = e.target.closest('#game .tile');
  const set = e.target.closest('#table .set');
  const rack = e.target.closest('#rack');
  if (tile) {
    const id = Number(tile.dataset.id);
    W.sel.has(id) ? W.sel.delete(id) : W.sel.add(id);
    sfx('pick');
    return render();
  }
  if (set && W.sel.size) return moveSelected(set.dataset.set === 'new' ? 'new' : Number(set.dataset.set));
  if (rack && W.sel.size) return moveSelected('rack');
});
// 키보드: 타일·묶음·손패에서 Enter/Space = 누르기
$('#game').addEventListener('keydown', e => {
  if ((e.key !== 'Enter' && e.key !== ' ') || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (!(t instanceof Element) || !t.matches('#game .tile, #table .set, #rack .rack-slot')) return;
  e.preventDefault();
  t.click();
});

// 끌어다 놓기(컴퓨터). 다시 그리면 끌던 타일이 사라져 끌기가 끊기므로, 끄는 동안엔 표시만 바로 붙였다 뗌
let drag = null, dragOver = null;   // drag = { id, prev } — 놓지 못하고 끝나면 끌기 전 선택(prev)으로 되돌림
function markOver(z) {
  if (dragOver === z) return;
  if (dragOver) dragOver.classList.remove('over');
  dragOver = z;
  if (z) z.classList.add('over');
}
document.addEventListener('dragstart', e => {
  const t = e.target.closest && e.target.closest('#game .tile');
  if (!t || !isMyTurn() || !W) return;
  const id = Number(t.dataset.id);
  drag = { id, prev: new Set(W.sel) };
  if (!W.sel.has(id)) { W.sel.clear(); W.sel.add(id); }
  sfx('pick');
  e.dataTransfer.setData('text/plain', String(id));
  e.dataTransfer.effectAllowed = 'move';
  // 지금 고른 타일과 놓을 수 있는 곳(묶음·＋새 묶음·손패) 점선
  document.querySelectorAll('#game .tile.sel').forEach(x => { if (!W.sel.has(Number(x.dataset.id))) x.classList.remove('sel'); });
  t.classList.add('sel');
  document.querySelectorAll('#table .set').forEach(s => s.classList.add('target'));
  const ns = $('#table .newset');
  if (ns) ns.textContent = tx('table.newSet');
  const myRack = new Set(S.me.rack), onTable = new Set(W.table.flat());
  $('#rack').classList.toggle('target', [...W.sel].some(x => myRack.has(x) && onTable.has(x)));
});
document.addEventListener('dragover', e => {
  if (!isMyTurn()) return;
  const zone = e.target.closest && (e.target.closest('#table .set') || e.target.closest('#rack') || e.target.closest('#table'));
  if (zone) { e.preventDefault(); }
  if (drag) markOver(!zone ? null : zone.id === 'table' ? $('#table .newset') : zone);   // 빈 테이블에 놓으면 새 묶음
});
document.addEventListener('drop', e => {
  markOver(null);
  drag = null;
  if (!isMyTurn() || !W || !W.sel.size) return;
  const set = e.target.closest('#table .set');
  e.preventDefault();
  if (set) moveSelected(set.dataset.set === 'new' ? 'new' : Number(set.dataset.set));
  else if (e.target.closest('#rack')) moveSelected('rack');
  else if (e.target.closest('#table')) moveSelected('new');
});
document.addEventListener('dragend', e => {
  markOver(null);
  const d = drag;
  drag = null;
  if (!d || !W || !isMyTurn()) return;
  // 위쪽 막대·창 밖에 놓았거나 Esc로 취소: 보이지 않게 골라진 채 남지 않도록 끌기 전 선택으로
  if (!e.dataTransfer || e.dataTransfer.dropEffect === 'none') W.sel = d.prev;
  render();
});

// ---------- 버튼 ----------
const nameInput = $('#name');
try { nameInput.value = localStorage.getItem('rummi-name') || ''; } catch {}
const getName = () => { const n = nameInput.value.trim(); try { localStorage.setItem('rummi-name', n); } catch {} return n; };

async function enter(promise) {
  try {
    const r = await promise;
    session = { room: r.room, token: r.token };
    saveSession();
    history.replaceState(null, '', '?r=' + r.room);
    connect();
  } catch (err) { toast(err.message); }
}
$('#btnCreate').onclick = () => { if (!getName()) return nameInput.focus(), toast(tx('toast.needName')); enter(api('create', { name: getName() })); };
$('#btnJoin').onclick = () => {
  if (!getName()) return nameInput.focus(), toast(tx('toast.needName'));
  const code = $('#code').value.trim().toUpperCase();
  if (code.length !== 4) return toast(tx('toast.needCode'));
  enter(api('join', { room: code, name: getName() }));
};
$('#code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnJoin').click(); });
// 이름 칸에서 Enter: 방 코드가 있으면 참가, 없으면 새 방
nameInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  ($('#code').value.trim() ? $('#btnJoin') : $('#btnCreate')).click();
});

// 초대 링크: 이 컴퓨터(localhost)에서 열었으면 친구 폰이 들어올 수 있는 같은 와이파이 주소로 (inviteUrl은 flow.js)
async function share() {
  const url = await inviteUrlReady(S.code);
  if (navigator.share && isMobileUA()) {
    try { await navigator.share({ title: tx('share.title'), text: tx('share.text', { code: S.code }), url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  if (await copyText(url)) toast(tx('toast.linkCopied'));
  else toast(url);
}
$('#btnShare').onclick = share;
for (const [sel, level] of [['#btnAddEasy', 'easy'], ['#btnAddHard', 'hard']]) {
  const btn = $(sel);
  if (btn) btn.onclick = () => api('addBot', { level }).catch(err => toast(err.message));
}
$('#btnShare2').onclick = share;
$('#timer').onchange = e => api('settings', { timer: Number(e.target.value) }).catch(err => toast(err.message));
const doStart = () => api('start').catch(err => toast(err.message));
$('#btnStart').onclick = doStart;
$('#btnAgain').onclick = doStart;
const doLeave = async () => {
  if (S && S.state === 'playing' && !confirm(tx('confirm.leave'))) return;
  if (es) { es.close(); es = null; }   // 스트림이 끊기며 '방을 찾을 수 없어요'가 뜨지 않게 먼저 닫음
  try { await api('leave'); } catch {}
  $('#menu').classList.add('hidden'); $('#overlay').classList.add('hidden');
  leaveLocal();
};
$('#btnLeave').onclick = doLeave; $('#btnLeave2').onclick = doLeave; $('#btnLeave3').onclick = doLeave;
// ⋯ 메뉴: 열면 초점을 메뉴 안으로, 닫으면 ⋯ 단추로 (키보드로 쓸 때 뒤의 게임 버튼을 헤매지 않게)
function openMenu() {
  $('#menu').classList.remove('hidden');
  const c = $('#menu .card'); if (c) c.scrollTop = 0;
  try { $('#btnRules2').focus({ preventScroll: true }); } catch {}
}
function closeMenu(focusBack = true) {
  if ($('#menu').classList.contains('hidden')) return;
  $('#menu').classList.add('hidden');
  if (focusBack && lastScreen === 'game') { try { $('#btnMenu').focus({ preventScroll: true }); } catch {} }
}
$('#btnMenu').onclick = openMenu;
$('#btnMenuClose').onclick = () => closeMenu();
// 메뉴가 열려 있으면 Tab은 메뉴 안에서만 돎 (마지막 다음엔 처음으로, Shift+Tab은 거꾸로)
$('#menu').addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const items = [...$('#menu').querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])')]
    .filter(x => !x.disabled && x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
// 조커 모양 — 사람마다 고름 (기본 ✦ 베들레헴의 별). 이 기기에만 저장하고 서버로 보내지 않음 → 다른 사람 화면은 그대로
const JOKERS = { star: {}, cross: {}, dove: {} };   // 이름은 사전에서 ('joker.star' …)
let jokerStyle = 'star';
try { const j = localStorage.getItem('rummi-joker'); if (owns(JOKERS, String(j))) jokerStyle = j; } catch {}
function applyJoker() {
  document.body.dataset.joker = jokerStyle;
  document.querySelectorAll('svg.jkg:not(.fixed) use').forEach(u => setUseHref(u, jokerStyle));
  document.querySelectorAll('#jokerPick [role=radio]').forEach(b => {
    const on = b.dataset.j === jokerStyle;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}
function setJoker(j) {
  if (!owns(JOKERS, j)) return;
  jokerStyle = j;
  try { localStorage.setItem('rummi-joker', j); } catch {}
  applyJoker();
}
function jokerLabels() {   // 말을 바꾸면 이름만 다시
  document.querySelectorAll('#jokerPick [role=radio]').forEach(b => {
    const name = tx('joker.' + b.dataset.j);
    b.setAttribute('aria-label', tx('joker.aria', { name }));
    b.querySelector('span.jk-n').textContent = name;
  });
}
{ // 고르기: 진짜 타일 미리보기 3개 (라디오 그룹, ←→로도 바꿈)
  const pick = $('#jokerPick');
  for (const k of Object.keys(JOKERS)) {
    const b = el('button', 'jk-opt');
    b.type = 'button'; b.dataset.j = k;
    b.setAttribute('role', 'radio');
    b.append(tileEl(104, { style: k }), el('span', 'jk-n'));
    b.onclick = () => setJoker(k);
    pick.append(b);
  }
  jokerLabels();
  pick.addEventListener('keydown', e => {
    const keys = Object.keys(JOKERS), d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    setJoker(keys[(keys.indexOf(jokerStyle) + d + keys.length) % keys.length]);
    pick.querySelector('[aria-checked=true]').focus();
  });
}
applyJoker();

// 내 화면 설정 (이 기기에만): 색 구분 기호(기본 켬) / 큰 타일 / 효과 줄이기(기기에서 '동작 줄이기'를 켰으면 기본 켬) → body 클래스
const PREFS = ['marks', 'big', 'calm'];
let prefSaved = {};
try { const p = JSON.parse(localStorage.getItem('rummi-prefs') || '{}'); if (p && typeof p === 'object') prefSaved = p; } catch {}
function prefOn(k) {
  if (typeof prefSaved[k] === 'boolean') return prefSaved[k];
  if (k === 'marks') return true;
  if (k === 'calm') { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
  return false;
}
function applyPrefs() {
  for (const k of PREFS) document.body.classList.toggle(k, prefOn(k));
  document.querySelectorAll('[data-pref]').forEach(b => b.setAttribute('aria-checked', String(prefOn(b.dataset.pref))));
}
document.querySelectorAll('[data-pref]').forEach(b => {
  b.onclick = () => {
    const k = b.dataset.pref;
    prefSaved = Object.assign({}, prefSaved, { [k]: !prefOn(k) });
    try { localStorage.setItem('rummi-prefs', JSON.stringify(prefSaved)); } catch {}
    applyPrefs();
    if (S) render();
  };
});
applyPrefs();
// 소리: 🔔 소리·진동 → 📳 진동만(조용한 예배실) → 🔕 끔  (저장은 sfx.js가 'rummi-sound'에)
const soundLabel = () => { $('#btnSound').textContent = window.Sfx ? Sfx.label() : tx(sound ? 'sfx.plainOn' : 'sfx.plainOff'); };
$('#btnSound').onclick = () => {
  if (window.Sfx) Sfx.cycle();
  else { sound = !sound; try { localStorage.setItem('rummi-sound', sound ? 'on' : 'off'); } catch {} }
  soundLabel();
};
soundLabel();

$('#btnSortNum').onclick = () => { sortRack('num'); sfx('sort'); render(); };
$('#btnSortColor').onclick = () => { sortRack('color'); sfx('sort'); render(); };
$('#btnUndo').onclick = undoStep;
$('#btnReset').onclick = undoAll;
// 컴퓨터: Ctrl/Cmd+Z = 한 수 취소 (글자 입력 중엔 그대로 둠)
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
  if (e.code !== 'KeyZ' && String(e.key).toLowerCase() !== 'z') return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (turnRequest || !isMyTurn() || !W || !W.hist.length) return;
  e.preventDefault();
  undoStep();
});
let turnRequest = false;
$('#btnDraw').onclick = async () => {
  if (turnRequest || !isMyTurn() || (window.UX && !UX.canSend())) return;
  if (W && R.setKeyTable(W.table) !== R.setKeyTable(S.table) && !confirm(tx('confirm.draw'))) return;
  turnRequest = true; if (window.UX) UX.sync();
  try { await api('draw'); drawSound(); } catch (err) { toast(err.message); }
  finally { turnRequest = false; if (S) render(); }
};
$('#btnDone').onclick = async () => {
  if (turnRequest || !W || !isMyTurn() || (window.UX && !UX.canSend())) return;
  const block = blockInfo(turnInfo());
  if (block) {   // 서버에 보내지 않고: 고칠 묶음만 와인색으로 살짝 흔들고, 이유를 알려 줌
    W.oops = new Set(block.sets); W.oopsAt = Date.now();
    sfx('invalid');
    toast(block.msg);
    render();
    const first = block.sets.length && document.querySelector(`#table .set[data-set="${block.sets[0]}"]`);
    if (first) first.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: isCalm() ? 'auto' : 'smooth' });
    else {
      const st = $('#status');
      st.classList.remove('nudge'); void st.offsetWidth; st.classList.add('nudge');
      setTimeout(() => st.classList.remove('nudge'), 350);
    }
    return;
  }
  sfx('commit', { step: 0 });
  const submitted = W.table.map(set => set.slice());
  turnRequest = true; if (window.UX) UX.sync();
  try { await api('play', { table: submitted }); } catch (err) { toast(err.message); }
  finally { turnRequest = false; if (S) render(); }
};

// 남은 시간 + 연결 끊긴 사람 자동 진행까지 남은 초
function tick() {
  const g = document.querySelector('#players .grace');
  if (g && graceAt) g.textContent = tx('chip.grace', { s: Math.max(0, Math.ceil((graceAt.until - Date.now()) / 1000)) });
  const c = $('#clock');
  if (!S || !S.deadline || S.state !== 'playing') { c.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((S.deadline - (Date.now() + skew)) / 1000));
  c.textContent = tx('game.clock', { s: left });
  c.classList.toggle('warn', left <= 10);
}
setInterval(tick, 500);

// ---------- 말 바꾸기 (한국어 | English): 다시 불러오지 않고 그 자리에서 다시 그림 ----------
// 고정 글자·aria·placeholder는 i18n.js가 [data-i18n…]로 이미 바꿈 → 여기선 코드로 만든 글자만
if (window.I18N) I18N.on(() => {
  buildQuick();
  jokerLabels();
  soundLabel();
  renderChat();
  updateBadge();
  if (rejoinRoom) $('#btnRejoin').textContent = tx('home.rejoin', { room: rejoinRoom });
  if (S) render(); else document.title = tx('doc.title');
});

// ---------- 시작 ----------
// 다시 들어오기: 같은 탭 새로고침이면 바로, 탭을 닫았다가 같은 방 초대 링크로 오면(카톡 안 브라우저 등) 바로 내 자리로.
// 그 밖에 이 기기에 하던 게임이 살아 있으면 처음 화면에 '돌아가기' 버튼
let rejoinRoom = '';   // '돌아가기' 버튼의 방 (말을 바꾸면 글자만 다시)
async function offerRejoin(saved) {
  try { await api('hello', saved); } catch (err) { if (goneErr(err)) dropSession(saved); return; }
  if (session) return;
  const b = $('#btnRejoin');
  rejoinRoom = saved.room;
  b.textContent = tx('home.rejoin', { room: saved.room });
  b.classList.remove('hidden');
  b.onclick = () => { b.classList.add('hidden'); enter(Promise.resolve(saved)); };
}
(async function boot() {
  const q = (new URLSearchParams(location.search).get('r') || '').trim().toUpperCase();
  if (q) $('#code').value = q;
  const tab = loadSession('sessionStorage'), dev = loadSession('localStorage');
  for (const saved of [tab, dev]) {
    if (!saved || (q ? saved.room !== q : saved !== tab)) continue;
    session = saved;
    try { await api('hello'); saveSession(); connect(); return; }
    catch (err) { session = null; if (goneErr(err)) dropSession(saved); }
  }
  show('home');
  if (dev && dev.room !== q) offerRejoin(dev);
  // 이름 칸에 바로 초점: 마우스가 있는 컴퓨터에서만 (폰은 키보드가 튀어나오고 가로 화면에선 제목이 위로 밀려 가려짐)
  if (!nameInput.value && !matchMedia('(pointer: coarse)').matches) nameInput.focus({ preventScroll: true });
})();
