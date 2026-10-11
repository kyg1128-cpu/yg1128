// 루미큐브 온라인 서버 — 외부 패키지 없이 Node만으로 동작합니다.
// 실행: node server.js   (포트 바꾸기: PORT=8080 node server.js)
//
// 여러 언어: 서버는 code + params를 보내고 각 화면이 자기 언어로 그립니다. 한국어 문장은 대비용으로 그대로 같이 보냄.
//
// ---------- LOG KEYS ----------
// room.log 항목 = { k, p, t }   k: 종류, p: 값, t: 예전 한국어 문장(대비용)
//   who = { name, botKey }   botKey: 봇이면 'rumi' | 'cube' | 'tile' | 'joker' | 'robot', 사람이면 null
//   'start'   { round, who }       n번째 게임 시작! (who부터)
//   'play'    { who, n, meld }     who가 n개를 내려놓음. meld = 첫 등록 점수(첫 등록일 때만), 아니면 null
//   'draw'    { who, why }         who가 타일을 뽑음. why = null | 'timeout'(시간 초과) | 'offline'(연결 끊김)
//   'pass'    { who, why }         더미가 비어 뽑지 못하고 넘어감. why는 draw와 같음
//   'win'     { who }              who 승리
//   'leave'   { who }              게임 중에 who가 나감
//   'join'    { who }              대기실에 who 입장
//   'botJoin' { who, level }       봇 참가. level = 'easy' | 'hard'
//
// ---------- 오류 ----------
// 실패한 요청 → HTTP 400 { error: 한국어 문장, code, params }   (code 목록은 아래 ERR 표, 규칙 위반은 code 'rule')
// 'rule' params = { rule: checkPlay code, ...checkPlay params }   (rules.js 위쪽 설명 참고)
//
// ---------- 그 밖에 화면이 쓰는 값 ----------
// players[i].botKey, 채팅 봇 메시지 { key: 'hello'|'nice'|'congrats'|'win', i: 줄 번호 }, 시상 { key, dk, params } (makeAwards 위 설명)
// (result·awards·chat 항목에도 botKey, history 항목에 botKeys {id: botKey}를 같이 둠 — 봇 이름을 각 언어로 그리게)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const R = require('./public/rules.js');
const Bot = require('./bot.js');

const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, 'public');
const MAX_PLAYERS = R.MAX_PLAYERS;
const CHAT = { keep: 60, maxLen: 100, burst: 5, burstMs: 10000, gapMs: 400 };   // 채팅: 보관 개수, 글자 수, 10초에 5개, 최소 간격
const TIMER_CHOICES = [0, 60, 90, 120, 180];
const DISCONNECT_GRACE_MS = 45000;   // 타이머가 없을 때 연결 끊긴 사람 차례를 넘기기까지
const ROOM_IDLE_MS = 3 * 3600 * 1000;
const BOT = { think: 900, show: 1100, chat: 700 };   // 봇이 생각하는 시간 / 놓는 모습 보여 주는 시간 / 말하기 전 뜸(ms)
// 봇 이름: key는 화면이 각 언어로 그릴 때 씀(players[].botKey), name은 한국어 대비용
const BOT_NAMES = [{ key: 'rumi', name: '로봇 루미' }, { key: 'cube', name: '로봇 큐브' }, { key: 'tile', name: '로봇 타일' }, { key: 'joker', name: '로봇 조커' }, { key: 'robot', name: '로봇' }, { key: 'peace', name: '로봇 평화' }];
const BOT_FALLBACK = { key: 'robot', name: '로봇' };

const rooms = new Map();

// ---------- 방/플레이어 ----------
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(code));
  return code;
}
function cleanName(name) {
  const s = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return s || '플레이어';
}
function newPlayer(room, name) {
  let n = cleanName(name), base = n, i = 2;
  while (room.players.some(p => p.name === n)) n = `${base}${i++}`;
  return {
    id: crypto.randomBytes(4).toString('hex'),
    token: crypto.randomBytes(16).toString('hex'),
    name: n, rack: [], melded: false, score: 0,
    clients: new Set(), connected: false, disconnectedAt: Date.now(),
  };
}
const BOT_LEVELS = { easy: '쉬움', hard: '어려움' };
const isLevel = l => typeof l === 'string' && Object.hasOwn(BOT_LEVELS, l);   // 'toString'·배열 같은 값 막기
function newBot(room, level) {
  const b = BOT_NAMES.find(x => !room.players.some(p => p.name === x.name)) || BOT_FALLBACK;
  return {
    id: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(16).toString('hex'),
    name: b.name, botKey: b.key, bot: true, level, rack: [], melded: false, score: 0, clients: new Set(), connected: true, disconnectedAt: 0,
  };
}
const botKeyOf = p => (p.bot ? p.botKey || BOT_FALLBACK.key : null);
const whoOf = p => ({ name: p.name, botKey: botKeyOf(p) });   // 기록·시상 등에서 '누구'

// 봇 계산은 작업 스레드에서 (어려움 봇이 오래 생각해도 서버가 멈추지 않게). 스레드가 죽으면 기본 전략으로 대신함.
let worker = null, reqId = 0;
function getWorker() {
  if (worker) return worker;
  const w = new Worker(path.join(__dirname, 'bot-worker.js'));
  w.pending = new Map();
  w.unref();
  w.on('message', m => {
    const done = w.pending.get(m.id);
    w.pending.delete(m.id);
    if (m.error) console.error('봇 계산 오류:', m.error);
    if (done) done(m.error ? undefined : m.result);
  });
  const fail = e => {
    if (e) console.error('봇 작업 스레드 오류:', e);
    if (worker === w) worker = null;
    for (const done of w.pending.values()) done(undefined);
    w.pending.clear();
  };
  w.on('error', fail);
  w.on('exit', () => fail());
  return (worker = w);
}
const PLAN_TIMEOUT_MS = 10000;   // 작업 스레드가 멈추면(응답 없음) 갈아 치우고 대신 계산
function planBot(args) {
  return new Promise(resolve => {
    let settled = false;
    const finish = r => { if (!settled) { settled = true; resolve(r); } };
    const fallback = () => {   // 쉬움 봇은 대신 계산해도 쉬움 그대로, 어려움은 기본 전략으로
      try { finish(Bot.plan(args.table, args.rack, args.melded, args.level === 'easy' ? 'easy' : 'normal')); }
      catch (e) { console.error(e); finish(null); }
    };
    try {
      const w = getWorker(), id = ++reqId;
      const timer = setTimeout(() => {
        console.error('봇 작업 스레드 응답 없음 — 새로 시작합니다');
        w.pending.delete(id);
        if (worker === w) worker = null;
        w.terminate();
        fallback();
      }, PLAN_TIMEOUT_MS);
      timer.unref();
      w.pending.set(id, r => { clearTimeout(timer); r === undefined ? fallback() : finish(r); });
      w.postMessage({ id, ...args });
    } catch (e) { console.error(e); fallback(); }
  });
}
const humans = room => room.players.filter(p => !p.bot);
// 기록 한 줄 = { k, p, t } (맨 위 LOG KEYS 참고)
function log(room, k, p, t) {
  room.log.push({ k, p, t });
  if (room.log.length > 30) room.log.shift();
}
const DRAW_WHY = { timeout: '시간 초과', offline: '연결 끊김' };   // doDraw의 why → 한국어 (대비용)
const current = room => room.players[room.turn];

// ---------- 게임 진행 ----------
function startGame(room) {
  room.deckSize = R.deckSize(room.players.length);
  const pool = Array.from({ length: room.deckSize }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const p of room.players) { p.rack = pool.splice(0, 14); p.melded = false; p.stats = newStats(); }
  Object.assign(room, {
    state: 'playing', pool, table: [], turn: crypto.randomInt(room.players.length),
    passes: 0, result: null, preview: null, log: [], awards: null, turnNo: 0,
  });
  room.round = (room.round || 0) + 1;
  log(room, 'start', { round: room.round, who: whoOf(current(room)) }, `${room.round}번째 게임 시작! ${current(room).name}님부터`);
  beginTurn(room);
}
// 한 판 기록 (시상식용 — 점수에는 영향 없음)
const newStats = () => ({ played: 0, turnsPlayed: 0, best: 0, draws: 0, rearranged: 0, jokers: 0, firstMeldTurn: null, firstMeldValue: 0, maxRack: 14 });
const statsOf = p => p.stats || (p.stats = newStats());
function beginTurn(room) {
  room.turnSeq = (room.turnSeq || 0) + 1;
  room.turnNo = (room.turnNo || 0) + 1;
  room.preview = null;
  room.turnStartedAt = Date.now();
  room.deadline = room.settings.timer ? Date.now() + room.settings.timer * 1000 : 0;
  clearTimeout(room.botTimer);
  if (current(room).bot) { const seq = room.turnSeq; room.botTimer = setTimeout(() => botAct(room, seq), 0); }
}
// 봇 차례: 바로 계산 시작 → (생각하는 척) 최소 시간 채우기 → 놓는 모습 미리 보여 주기 → 확정
async function botAct(room, seq) {
  const alive = () => room.state === 'playing' && room.turnSeq === seq && rooms.get(room.code) === room;   // 같은 코드로 새 방이 생겨도 옛 방은 멈춤
  if (!alive()) return;
  const p = current(room);
  const until = Date.now() + BOT.think + crypto.randomInt(600);
  const table = await planBot({ table: room.table, rack: p.rack, melded: p.melded, level: p.level });
  if (!alive()) return;
  room.botTimer = setTimeout(() => {
    if (!alive()) return;
    const check = table && R.checkPlay(room.table, p.rack, table, p.melded);
    if (!check || !check.ok) { doDraw(room, p); return broadcast(room); }
    room.preview = check.normalized;
    broadcast(room);
    room.botTimer = setTimeout(() => {
      if (!alive()) return;
      applyPlay(room, p, check);
      broadcast(room);
    }, BOT.show);
  }, Math.max(0, until - Date.now()));
}
// ---------- 채팅 ----------
// 채팅은 게임 상태와 따로 'chat' 이벤트로 보냄 (판이 바뀔 때마다 대화 전체를 다시 보내지 않게)
// extra: 봇 말이면 { key, i } — 화면이 자기 언어의 같은 줄(botline.key[i])로 그림. text는 한국어 대비용.
function pushChat(room, p, text, extra) {
  room.chatSeq = (room.chatSeq || 0) + 1;
  const msg = { id: room.chatSeq, from: p.id, name: p.name, bot: !!p.bot, botKey: botKeyOf(p), text, at: Date.now(), ...extra };
  room.chat.push(msg);
  if (room.chat.length > CHAT.keep) room.chat.shift();
  const line = `event: chat\ndata: ${JSON.stringify(msg)}\n\n`;
  for (const q of room.players) for (const res of q.clients) res.write(line);
  room.lastActivity = Date.now();
  return msg;
}
const pick = list => list[crypto.randomInt(list.length)];
// 봇이 가끔 한마디 (너무 수다스럽지 않게 방마다 8초에 한 번까지). key = BOT_LINES의 종류
function botSay(room, bot, key, { chance = 1, force = false } = {}) {
  if (!bot || !bot.bot || Math.random() >= chance) return;
  if (!force && Date.now() - (room.lastBotChat || 0) < 8000) return;
  room.lastBotChat = Date.now();
  setTimeout(() => {
    if (rooms.get(room.code) !== room || !room.players.includes(bot)) return;
    const lines = BOT_LINES[key], i = crypto.randomInt(lines.length);
    pushChat(room, bot, lines[i], { key, i });
  }, BOT.chat + crypto.randomInt(900));
}
const anyBot = (room, except) => { const bs = room.players.filter(q => q.bot && q !== except); return bs.length ? pick(bs) : null; };
// 순서가 중요: 화면은 i(줄 번호)로 자기 언어의 같은 줄(public/i18n.js botline.*)을 고름. 줄을 바꾸면 그쪽도 같이.
const BOT_LINES = {
  hello: ['안녕하세요! 잘 부탁드려요 🙂', '반가워요! 즐겁게 해요 😊', '샬롬! 오늘도 은혜로운 한 판 🙏'],
  nice: ['와, 대단해요! 👏', '멋진 수예요!', '오~ 잘하시네요 👍', '할렐루야 🙌'],
  congrats: ['축하해요 🎉', '잘하셨어요! 👏', '다음 판엔 저도 힘낼게요 💪'],
  win: ['좋은 게임이었어요! 🙏', '감사합니다! 한 판 더 할까요? 😊'],
};

function applyPlay(room, p, r) {
  // 기록: 다시 짠 묶음 수 = 이전 테이블 묶음 중 새 테이블에서 쪼개지거나 섞인 것
  // (그대로 남았거나 끝에 붙여 늘리기만 한 묶음 = 타일이 전부 한 묶음 안에 그대로 있으면 세지 않음)
  const st = statsOf(p);
  const whereIs = new Map();
  r.normalized.forEach((s, i) => s.forEach(id => whereIs.set(id, i)));
  for (const s of room.table) if (new Set(s.map(id => whereIs.get(id))).size > 1) st.rearranged++;
  st.played += r.played.length;
  st.turnsPlayed++;
  st.best = Math.max(st.best, r.played.length);
  st.jokers += r.played.filter(id => R.tile(id).joker).length;
  if (!p.melded) { st.firstMeldTurn = room.turnNo || 0; st.firstMeldValue = r.meldValue; }
  room.table = r.normalized;
  const played = new Set(r.played);
  p.rack = p.rack.filter(id => !played.has(id));
  const first = !p.melded;
  p.melded = true;
  room.passes = 0;
  log(room, 'play', { who: whoOf(p), n: r.played.length, meld: first ? r.meldValue : null },
    `${p.name}님이 ${r.played.length}개를 내려놓았어요${first ? ` (첫 등록 ${r.meldValue}점)` : ''}`);
  if (!p.bot && r.played.length >= 4 && p.rack.length) botSay(room, anyBot(room), 'nice', { chance: 0.6 });
  if (!p.rack.length) endGame(room, p);
  else nextTurn(room);
}
function nextTurn(room) {
  room.turn = (room.turn + 1) % room.players.length;
  beginTurn(room);
}
// why: 없음(직접 뽑음) | 'timeout' | 'offline'
function doDraw(room, p, why = null) {
  const whyKo = why ? ` (${DRAW_WHY[why]})` : '';
  if (room.pool.length) {
    p.rack.push(room.pool.pop());
    const st = statsOf(p);
    st.draws++;
    st.maxRack = Math.max(st.maxRack, p.rack.length);
    room.passes = 0;
    log(room, 'draw', { who: whoOf(p), why }, `${p.name}님이 타일을 뽑았어요${whyKo}`);
  } else {
    room.passes++;
    log(room, 'pass', { who: whoOf(p), why }, `${p.name}님 패스${whyKo}`);
  }
  if (room.passes >= room.players.length) return endGame(room, null);
  nextTurn(room);
}
function endGame(room, winner) {
  const pens = room.players.map(p => ({ p, pen: R.penalty(p.rack) }));
  if (!winner) winner = pens.reduce((a, b) => (b.pen < a.pen ? b : a)).p;
  let gain = 0;
  const result = pens.map(({ p, pen }) => {
    if (p === winner) return null;
    p.score -= pen; gain += pen;
    return { id: p.id, name: p.name, botKey: botKeyOf(p), penalty: pen, delta: -pen, rack: p.rack.slice() };
  }).filter(Boolean);
  winner.score += gain;
  result.unshift({ id: winner.id, name: winner.name, botKey: botKeyOf(winner), penalty: R.penalty(winner.rack), delta: gain, rack: winner.rack.slice() });
  room.result = result;
  room.awards = makeAwards(room, winner);
  room.history = room.history || [];
  room.history.push({
    round: room.round, winnerId: winner.id,
    names: Object.fromEntries(room.players.map(p => [p.id, p.name])),
    botKeys: Object.fromEntries(room.players.filter(p => p.bot).map(p => [p.id, botKeyOf(p)])),
    deltas: Object.fromEntries(result.map(r => [r.id, r.delta])),
  });
  if (room.history.length > 20) room.history.shift();
  room.state = 'ended';
  room.deadline = 0;
  clearTimeout(room.botTimer);
  room.preview = null;
  log(room, 'win', { who: whoOf(winner) }, `🏆 ${winner.name}님 승리!`);
  if (winner.bot) botSay(room, winner, 'win', { force: true });
  else botSay(room, anyBot(room), 'congrats', { force: true });
}
// 오늘의 시상식: 한 사람에 하나씩, 점수와 상관없는 명예상. 위에서부터 아직 상이 없는 사람 중 가장 잘한 사람에게
// (동점이면 앞자리). 남은 사람은 모두 '함께해서 기뻐요'.
// 각 상 = { key, dk(설명 종류), params } + 한국어 title/detail(대비용). 화면 사전 키 = award.<key>.<dk>
//   win: dk 'out'(손패를 다 냄) | 'fewest'(남은 타일이 가장 적음)   together: dk 'played' {n} | 'stayed'
//   설명이 하나뿐인 상은 dk 'd': rebuild {n}  bigHand {n}  firstFruit {value}  joker {n}  comeback {from, to}  endure {n}
const AWARDS = [
  { key: 'rebuild', emoji: '🧱', title: '재건축왕', ok: s => s.rearranged >= 2, score: s => s.rearranged, params: s => ({ n: s.rearranged }) },
  { key: 'bigHand', emoji: '✋', title: '한 방의 손', ok: s => s.best >= 5, score: s => s.best, params: s => ({ n: s.best }) },
  { key: 'firstFruit', emoji: '🌱', title: '첫 열매', ok: s => s.firstMeldTurn != null, score: s => -s.firstMeldTurn, params: s => ({ value: s.firstMeldValue }) },
  { key: 'joker', emoji: '🃏', title: '조커의 달인', ok: s => s.jokers >= 1, score: s => s.jokers, params: s => ({ n: s.jokers }) },
  { key: 'comeback', emoji: '🔥', title: '부활의 손', ok: (s, p) => s.maxRack - p.rack.length >= 6, score: (s, p) => s.maxRack - p.rack.length, params: (s, p) => ({ from: s.maxRack, to: p.rack.length }) },
  { key: 'endure', emoji: '🙏', title: '끈기상', ok: s => s.draws >= 3, score: s => s.draws, params: s => ({ n: s.draws }) },
];
const AWARD_WIN = { key: 'win', emoji: '🏆', title: '승리' };
const AWARD_TOGETHER = { key: 'together', emoji: '🕊️', title: '함께해서 기뻐요' };
const AWARD_DETAIL = {   // 'key.dk' → 한국어 설명
  'win.out': () => '손패를 모두 내려놓았어요',
  'win.fewest': () => '남은 타일이 가장 적었어요',
  'together.played': q => `타일 ${q.n}장을 내려놓았어요`,
  'together.stayed': () => '끝까지 함께했어요',
  'rebuild.d': q => `테이블 묶음 ${q.n}개를 다시 짰어요`,
  'bigHand.d': q => `한 번에 ${q.n}장!`,
  'firstFruit.d': q => `가장 먼저 첫 등록 (${q.value}점)`,
  'joker.d': q => `조커 ${q.n}장을 멋지게 썼어요`,
  'comeback.d': q => `손패 ${q.from}장에서 ${q.to}장까지 줄였어요`,
  'endure.d': q => `${q.n}번 뽑으며 버텼어요`,
};
function makeAwards(room, winner) {
  const award = (p, a, dk, params) => ({
    id: p.id, name: p.name, bot: !!p.bot, botKey: botKeyOf(p),
    key: a.key, dk, params, emoji: a.emoji, title: a.title, detail: AWARD_DETAIL[`${a.key}.${dk}`](params),
  });
  const out = [award(winner, AWARD_WIN, winner.rack.length ? 'fewest' : 'out', {})];
  const has = new Set([winner.id]);
  for (const a of AWARDS) {
    let best = null;
    for (const p of room.players) {   // 자리 순서대로 보며 더 클 때만 바꿈 → 동점이면 앞자리
      const s = statsOf(p);
      if (has.has(p.id) || !a.ok(s, p)) continue;
      if (!best || a.score(s, p) > a.score(statsOf(best), best)) best = p;
    }
    if (best) { out.push(award(best, a, 'd', a.params(statsOf(best), best))); has.add(best.id); }
  }
  for (const p of room.players) {
    if (has.has(p.id)) continue;
    const s = statsOf(p);
    out.push(s.played ? award(p, AWARD_TOGETHER, 'played', { n: s.played }) : award(p, AWARD_TOGETHER, 'stayed', {}));
  }
  return out;
}
function removePlayer(room, p) {
  const idx = room.players.indexOf(p);
  if (idx < 0) return;
  for (const res of p.clients) res.end();
  room.players.splice(idx, 1);
  if (room.state === 'playing') {
    room.pool.push(...p.rack);
    log(room, 'leave', { who: whoOf(p) }, `${p.name}님이 나갔어요`);
    if (room.players.length < 2) {
      if (room.players.length === 1) endGame(room, room.players[0]);
    } else {
      if (idx < room.turn) room.turn--;
      else if (idx === room.turn) { room.turn = room.turn % room.players.length; beginTurn(room); }
    }
  }
  if (room.hostId === p.id && humans(room).length) room.hostId = humans(room)[0].id;
  if (!humans(room).length) { clearTimeout(room.botTimer); rooms.delete(room.code); }
}

// ---------- 상태 전송 (각자 자기 손패만 보임) ----------
// 연결 끊긴 지 몇 초 (게임 중일 때만) / 타이머 없는 판에서 끊긴 현재 차례 사람이 자동으로 넘어가기까지 남은 초
function offFor(room, p, now) {
  return room.state === 'playing' && !p.bot && !p.connected ? Math.max(0, Math.floor((now - p.disconnectedAt) / 1000)) : 0;
}
function graceLeft(room, p, now) {
  if (room.state !== 'playing' || room.deadline || p.bot || p.connected || current(room) !== p) return null;
  return Math.max(0, Math.ceil((Math.max(p.disconnectedAt, room.turnStartedAt) + DISCONNECT_GRACE_MS - now) / 1000));
}
function view(room, me) {
  const now = Date.now();
  return {
    now,
    code: room.code, state: room.state, mode: room.mode || 'friends', maxPlayers: MAX_PLAYERS, deckSize: room.state === 'lobby' ? R.deckSize(room.players.length) : room.deckSize || R.STANDARD_TILE_COUNT, hostId: room.hostId, settings: room.settings,
    me: { id: me.id, rack: me.rack, melded: me.melded },
    players: room.players.map(p => ({
      id: p.id, name: p.name, bot: !!p.bot, botKey: botKeyOf(p), level: p.bot ? p.level : undefined, count: p.rack.length, melded: p.melded, score: p.score, connected: p.connected,
      offFor: offFor(room, p, now), graceLeft: graceLeft(room, p, now),
    })),
    table: room.table, turnId: room.state === 'playing' ? current(room).id : null,
    turnSeq: room.turnSeq || 0, deadline: room.deadline || 0,
    pool: room.pool ? room.pool.length : 0, preview: room.preview, log: room.log.slice(-8),
    result: room.result, round: room.round || 0,
    awards: room.state === 'ended' ? room.awards || null : null, history: room.history || [],
  };
}
function broadcast(room) {
  room.lastActivity = Date.now();
  for (const p of room.players) {
    if (!p.clients.size) continue;
    const msg = `data: ${JSON.stringify(view(room, p))}\n\n`;
    for (const res of p.clients) res.write(msg);
  }
}

// ---------- HTTP ----------
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 65536) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
// 실패 → 400 { error: 한국어 문장, code, params }. 화면은 code·params로 자기 언어 문장을 만들고, 모르면 error를 그대로 보여 줌.
const ERR = {
  roomNotFound: () => '방을 찾을 수 없어요',
  notMember: () => '이 방의 참가자가 아니에요',
  notPlaying: () => '게임 중이 아니에요',
  notYourTurn: () => '내 차례가 아니에요',
  serverBusy: () => '서버에 방이 너무 많아요',
  badCode: () => '방 코드를 확인해 주세요',
  alreadyPlaying: () => '이미 게임이 진행 중이에요',
  roomFull: () => '방이 가득 찼어요 (최대 6명)',
  hostOnly: q => ({ bot: '방장만 봇을 넣을 수 있어요', change: '방장만 바꿀 수 있어요', remove: '방장만 뺄 수 있어요', start: '방장만 시작할 수 있어요' })[q.what],   // what: 'bot'|'change'|'remove'|'start'
  notDuringGame: q => ({ bot: '게임 중에는 넣을 수 없어요', change: '게임 중에는 바꿀 수 없어요', remove: '게임 중에는 뺄 수 없어요' })[q.what],   // what: 'bot'|'change'|'remove'
  emptyMessage: () => '메시지를 입력해 주세요',
  tooFast: () => '너무 빨라요. 잠시 후 다시 보내 주세요',
  botNotFound: () => '봇을 찾을 수 없어요',
  badLevel: () => '난이도를 확인해 주세요',
  needTwo: () => '2명 이상이어야 시작할 수 있어요',
  // 'rule': 규칙 위반 — 한국어 문장은 checkPlay의 reason, params = { rule: checkPlay code, ...checkPlay params }
};
class Fail extends Error {
  constructor(message, code, params) { super(message); this.code = code; this.params = params; }
}
// ko: 예전 문장이 표와 조금 다른 곳에서만 넘김
const fail = (code, params = {}, ko) => { throw new Fail(ko || ERR[code](params), code, params); };

function auth(body) {
  const room = rooms.get(String(body.room || '').toUpperCase());
  if (!room) fail('roomNotFound');
  const p = room.players.find(x => !x.bot && x.token === body.token);
  if (!p) fail('notMember');
  return { room, p };
}
function myTurn(room, p) {
  if (room.state !== 'playing') fail('notPlaying');
  if (current(room) !== p) fail('notYourTurn');
}

const api = {
  create(b) {
    if (rooms.size > 500) fail('serverBusy');
    const code = newCode();
    const room = { code, players: [], state: 'lobby', mode: b.mode === 'practice' ? 'practice' : 'friends', settings: { timer: 0 }, log: [], table: [], chat: [], lastActivity: Date.now() };
    const p = newPlayer(room, b.name);
    room.players.push(p);
    room.hostId = p.id;
    rooms.set(code, room);
    return { room: code, token: p.token };
  },
  join(b) {
    const room = rooms.get(String(b.room || '').toUpperCase().trim());
    if (!room) fail('badCode');
    if (room.state === 'playing') fail('alreadyPlaying');
    if (room.players.length >= MAX_PLAYERS) fail('roomFull');
    const p = newPlayer(room, b.name);
    room.players.push(p);
    log(room, 'join', { who: whoOf(p) }, `${p.name}님 입장`);
    broadcast(room);
    return { room: room.code, token: p.token };
  },
  hello(b) { auth(b); return {}; },
  addBot(b) {
    const { room, p } = auth(b);
    if (room.hostId !== p.id) fail('hostOnly', { what: 'bot' });
    if (room.state === 'playing') fail('notDuringGame', { what: 'bot' });
    if (room.players.length >= MAX_PLAYERS) fail('roomFull');
    const bot = newBot(room, isLevel(b.level) ? b.level : 'easy');
    room.players.push(bot);
    log(room, 'botJoin', { who: whoOf(bot), level: bot.level }, `${bot.name} 참가 (${BOT_LEVELS[bot.level]})`);
    botSay(room, bot, 'hello', { force: true });
    broadcast(room);
    return {};
  },
  chat(b) {
    const { room, p } = auth(b);
    const text = String(b.text == null ? '' : b.text).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').trim().slice(0, CHAT.maxLen);
    if (!text) fail('emptyMessage');
    const now = Date.now();
    p.chatTimes = (p.chatTimes || []).filter(t => now - t < CHAT.burstMs);
    if (p.chatTimes.length >= CHAT.burst || (p.chatTimes.length && now - p.chatTimes[p.chatTimes.length - 1] < CHAT.gapMs)) {
      fail('tooFast');
    }
    p.chatTimes.push(now);
    const msg = pushChat(room, p, text);
    return { id: msg.id };
  },
  setBotLevel(b) {
    const { room, p } = auth(b);
    if (room.hostId !== p.id) fail('hostOnly', { what: 'change' });
    if (room.state === 'playing') fail('notDuringGame', { what: 'change' });
    const bot = room.players.find(x => x.bot && x.id === b.botId);
    if (!bot) fail('botNotFound');
    if (!isLevel(b.level)) fail('badLevel');
    bot.level = b.level;
    broadcast(room);
    return {};
  },
  removeBot(b) {
    const { room, p } = auth(b);
    if (room.hostId !== p.id) fail('hostOnly', { what: 'remove' });
    if (room.state === 'playing') fail('notDuringGame', { what: 'remove' });
    const bot = room.players.find(x => x.bot && x.id === b.botId);
    if (!bot) fail('botNotFound');
    room.players.splice(room.players.indexOf(bot), 1);
    broadcast(room);
    return {};
  },
  settings(b) {
    const { room, p } = auth(b);
    if (room.hostId !== p.id) fail('hostOnly', { what: 'change' });
    if (room.state === 'playing') fail('notDuringGame', { what: 'change' });
    if (TIMER_CHOICES.includes(b.timer)) room.settings.timer = b.timer;
    broadcast(room);
    return {};
  },
  start(b) {
    const { room, p } = auth(b);
    if (room.hostId !== p.id) fail('hostOnly', { what: 'start' });
    if (room.state === 'playing') fail('alreadyPlaying', {}, '이미 진행 중이에요');
    if (room.players.length < 2) fail('needTwo');
    startGame(room);
    broadcast(room);
    return {};
  },
  draw(b) {
    const { room, p } = auth(b);
    myTurn(room, p);
    doDraw(room, p);
    broadcast(room);
    return {};
  },
  play(b) {
    const { room, p } = auth(b);
    myTurn(room, p);
    const r = R.checkPlay(room.table, p.rack, b.table, p.melded);
    if (!r.ok) fail('rule', { rule: r.code, ...r.params }, r.reason);
    applyPlay(room, p, r);
    broadcast(room);
    return {};
  },
  preview(b) {
    const { room, p } = auth(b);
    if (room.state !== 'playing' || current(room) !== p) return {};
    const t = b.table;
    if (!Array.isArray(t) || t.length > 60) return {};
    const ok = t.every(s => Array.isArray(s) && s.length <= 13 && s.every(id => Number.isInteger(id) && id >= 0 && id < R.TILE_COUNT));
    if (!ok) return {};
    room.preview = t;
    broadcast(room);
    return {};
  },
  leave(b) {
    const { room, p } = auth(b);
    removePlayer(room, p);
    if (rooms.has(room.code)) broadcast(room);
    return {};
  },
};

function events(req, res, q) {
  const room = rooms.get(String(q.get('room') || '').toUpperCase());
  const p = room && room.players.find(x => !x.bot && x.token === q.get('token'));
  if (!p) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  res.write(`event: chatlog\ndata: ${JSON.stringify(room.chat)}\n\n`);
  p.clients.add(res);
  p.connected = true;
  broadcast(room);
  req.on('close', () => {
    p.clients.delete(res);
    if (!p.clients.size) { p.connected = false; p.disconnectedAt = Date.now(); }
    if (rooms.has(room.code)) broadcast(room);
  });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { rel = '/'; }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': (MIME[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// 같은 와이파이 친구가 들어올 주소들: 사설 대역(192.168 → 10 → 172.16~31) 먼저, 가상 어댑터(VirtualBox·Hyper-V 등)는 뒤로
function lanUrls(port = PORT) {
  const rank = ip => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) {
        const virtual = /virtual|vbox|vmware|hyper-v|vethernet|wsl|docker|loopback|tailscale|zerotier/i.test(name) ? 1 : 0;
        list.push({ ip: a.address, virtual, rank: rank(a.address), i: list.length });
      }
    }
  }
  list.sort((x, y) => x.virtual - y.virtual || x.rank - y.rank || x.i - y.i);
  return [...new Set(list.map(x => `http://${x.ip}:${port}`))];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/events' && req.method === 'GET') return events(req, res, url.searchParams);
  if (url.pathname === '/api/info' && req.method === 'GET') {
    const addr = server.address();
    return sendJSON(res, 200, { lan: lanUrls(addr && addr.port ? addr.port : PORT) });
  }
  if (url.pathname.startsWith('/api/')) {
    const fn = api[url.pathname.slice(5)];
    if (!fn || req.method !== 'POST') return sendJSON(res, 404, { error: '없는 요청' });
    try {
      sendJSON(res, 200, fn(await readBody(req)));
    } catch (e) {
      if (e instanceof Fail) sendJSON(res, 400, { error: e.message, code: e.code, params: e.params });
      else { console.error(e); sendJSON(res, 500, { error: '서버 오류' }); }
    }
    return;
  }
  serveStatic(req, res, url.pathname);
});

// 타이머·연결 끊김 처리, SSE 유지 신호, 오래된 방 정리
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.state !== 'playing') continue;
    const p = current(room);
    if (room.deadline && now > room.deadline) { doDraw(room, p, 'timeout'); broadcast(room); }
    else if (!room.deadline && !p.connected && now - Math.max(p.disconnectedAt, room.turnStartedAt) > DISCONNECT_GRACE_MS) {
      doDraw(room, p, 'offline'); broadcast(room);
    } else if (graceLeft(room, p, now) != null) broadcast(room);   // 자동 진행까지 남은 초를 다들 보도록 1초마다

  }
}, 1000);
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const p of room.players) for (const res of p.clients) res.write(': ping\n\n');
    if (now - room.lastActivity > ROOM_IDLE_MS && !room.players.some(p => !p.bot && p.connected)) { clearTimeout(room.botTimer); rooms.delete(room.code); }
  }
}, 20000);

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  루미큐브 서버가 켜졌어요!  (끄려면 이 창을 닫거나 Ctrl+C)\n`);
    console.log(`  이 컴퓨터에서:        http://localhost:${PORT}`);
    for (const u of lanUrls(PORT)) console.log(`  같은 와이파이 친구:   ${u}`);
    console.log('  (대기실의 QR 코드를 폰 카메라로 찍어도 바로 들어와요)');
    console.log('');
  });
}
module.exports = { server, rooms, BOT, planBot, BOT_LINES, BOT_NAMES, ERR, makeAwards, newStats };
