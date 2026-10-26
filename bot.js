// 컴퓨터 상대(봇)의 한 턴 계획. 서버(작업 스레드)에서만 씁니다.
//
// 쉬움  : 눈앞의 손패 묶음을 순서대로 고르고 단순히 붙이기. 후보를 되짚거나 테이블을 재배치하지 않음.
// 중간  : 손패 묶음 조합 탐색 → 테이블 끝에 붙이기 → 런 가운데 끼워 쪼개기 → 한 장 빌려 새 묶음.
// 어려움: 중간 + 테이블 전체를 새로 짜는 탐색(모든 테이블 타일 + 손패로 가장 많이 내려놓는 배치).
// 입력은 자기 손패와 공개 테이블뿐. 더미·다른 사람 손패·뽑기 확률을 읽거나 바꾸지 않음.
//         조커는 다른 타일을 내려놓는 데 필요할 때만 쓰고, 높은 숫자부터 털어냄.
const R = require('./public/rules.js');

const J = 'J';
const kindOf = id => { const t = R.tile(id); return t.joker ? J : t.color * 13 + t.num - 1; };
const NODE_LIMIT = 40000;
const SOLVE_MS = 3000;   // 안전장치 (보통 수 ms, 큰 테이블에서 드물게 1~2초). 넘으면 기본 전략으로 대신함

function countKinds(ids) {
  const c = new Map();
  for (const id of ids) c.set(kindOf(id), (c.get(kindOf(id)) || 0) + 1);
  return c;
}

// ---------- 손패만으로 만드는 묶음 ----------
function candidates(rack, useJokers = true) {
  const cnt = countKinds(rack);
  const jokers = useJokers ? cnt.get(J) || 0 : 0;
  const has = k => (cnt.get(k) || 0) > 0;
  const out = [];
  for (let c = 0; c < 4; c++) {
    for (let s = 1; s <= 11; s++) {
      const kinds = [];
      let missing = 0, value = 0;
      for (let v = s; v <= 13; v++) {
        const k = c * 13 + v - 1;
        if (has(k)) kinds.push(k); else { kinds.push(J); missing++; }
        value += v;
        if (missing > jokers) break;
        if (kinds.length >= 3 && missing < kinds.length) out.push({ kinds: kinds.slice(), value, jokers: missing });
      }
    }
  }
  for (let n = 1; n <= 13; n++) {
    const colors = [0, 1, 2, 3].filter(c => has(c * 13 + n - 1));
    for (let mask = 1; mask < 1 << colors.length; mask++) {
      const real = colors.filter((_, i) => mask & (1 << i)).map(c => c * 13 + n - 1);
      for (let j = 0; j <= Math.min(jokers, 3); j++) {
        const size = real.length + j;
        if (size >= 3 && size <= 4) out.push({ kinds: real.concat(Array(j).fill(J)), value: n * size, jokers: j });
      }
    }
  }
  return out;
}

function toIds(rack, picks) {
  const byKind = new Map();
  for (const id of rack) { const k = kindOf(id); if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(id); }
  return picks.map(c => {
    const ids = c.kinds.map(k => byKind.get(k).pop());
    const a = R.analyze(ids);
    return { ids: a.ok ? a.order : ids, value: a.ok ? a.value : 0 };
  }).filter(s => R.analyze(s.ids).ok);
}

const fits = (cnt, c) => {
  const need = new Map();
  for (const k of c.kinds) need.set(k, (need.get(k) || 0) + 1);
  for (const [k, v] of need) if ((cnt.get(k) || 0) < v) return null;
  return need;
};

// 서로 겹치지 않는 묶음 조합 중 점수가 가장 높은 것 (mode: 'meld' = 점수 합, 'play' = 내려놓는 장 수)
function bestSets(rack, mode) {
  const score = c => (mode === 'meld' ? c.value : c.kinds.length * 100 - c.jokers * 60 + c.value);
  const cands = candidates(rack).map(c => ({ ...c, score: score(c) })).filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);
  const cnt = countKinds(rack);
  let best = { score: 0, pick: [] }, nodes = 0;
  const pick = [];
  (function dfs(start, total) {
    if (total > best.score) best = { score: total, pick: pick.slice() };
    for (let i = start; i < cands.length && nodes < NODE_LIMIT; i++) {
      nodes++;
      const need = fits(cnt, cands[i]);
      if (!need) continue;
      for (const [k, v] of need) cnt.set(k, cnt.get(k) - v);
      pick.push(cands[i]);
      dfs(i, total + cands[i].score);              // 같은 후보를 한 번 더 (두 번째 벌) 쓸 수도 있음
      pick.pop();
      for (const [k, v] of need) cnt.set(k, cnt.get(k) + v);
    }
  })(0, 0);
  return toIds(rack, best.pick);
}

// 쉬움용: 눈에 보이는 후보부터 고르기. 조커도 쓰지만 겹치는 후보를 되짚어 비교하지 않음.
function greedySets(rack) {
  const cands = candidates(rack).sort((a, b) => b.kinds.length - a.kinds.length || a.jokers - b.jokers || b.value - a.value);
  const cnt = countKinds(rack);
  const pick = [];
  for (const c of cands) {
    const need = fits(cnt, c);
    if (!need) continue;
    for (const [k, v] of need) cnt.set(k, cnt.get(k) - v);
    pick.push(c);
  }
  return toIds(rack, pick);
}

// ---------- 테이블 활용 ----------
function tryAppend(table, id) {
  for (let i = 0; i < table.length; i++) {
    const a = R.analyze(table[i].concat(id));
    if (a.ok) { table[i] = a.order; return true; }
  }
  return false;
}

// 테이블에 한 장 붙이기 (끝에 붙이기, 또는 런 가운데 끼워 쪼개기)
function tryPlace(table, id) {
  if (tryAppend(table, id)) return true;
  const t = R.tile(id);
  if (t.joker) return false;
  for (let i = 0; i < table.length; i++) {
    const a = R.analyze(table[i]);
    if (!a.ok || a.kind !== 'run') continue;
    const vals = a.order.map(x => (R.tile(x).joker ? a.jokerAs[x] : R.tile(x).num));
    const k = vals.indexOf(t.num);
    if (k < 2 || k > vals.length - 3) continue;
    const left = a.order.slice(0, k + 1), right = [id].concat(a.order.slice(k + 1));
    const l = R.analyze(left), r = R.analyze(right);
    if (l.ok && r.ok) { table.splice(i, 1, l.order, r.order); return true; }
  }
  return false;
}

// 테이블에서 한 장 빌려 손패 두 장과 새 묶음 만들기
function tryBorrow(table, hand) {
  const real = hand.filter(id => !R.tile(id).joker);
  for (let x = 0; x < real.length; x++) {
    for (let y = x + 1; y < real.length; y++) {
      for (let i = 0; i < table.length; i++) {
        for (const t of table[i]) {
          const rest = R.analyze(table[i].filter(z => z !== t));
          if (!rest.ok) continue;
          const made = R.analyze([real[x], real[y], t]);
          if (!made.ok) continue;
          table[i] = rest.order;
          table.push(made.order);
          hand.splice(hand.indexOf(real[x]), 1);
          hand.splice(hand.indexOf(real[y]), 1);
          return true;
        }
      }
    }
  }
  return false;
}

// ---------- 어려움: 테이블 전체 다시 짜기 ----------
// 테이블 타일(반드시 다 써야 함) + 손패(쓰고 싶은 만큼)를 숫자 1→13 순서로 훑는 동적 계획법.
// 상태 = 색마다 '이어지는 중인 런' 2칸의 길이(0,1,2,3+) + 쓴 조커 수 + 손패를 남겼는지 (+ 그 숫자에서 그룹에 들어간 색 수).
// 같은 색 런은 동시에 2줄까지만 봄(타일이 2벌이라 사실상 충분). 정확하고, 보통 수십 ms 안에 끝남.
const LEFT_COST = n => 100 + n;          // 손에 남는 숫자 n 타일의 손해 (높은 숫자일수록 큼)
const JOKER_KEEP = 5;                    // 조커는 아껴 두면 약간 이득
const WIN = 1e6;
const PAIRS = [], PAIR_IDX = [];
for (let a = 0; a < 4; a++) for (let b = a; b < 4; b++) { PAIR_IDX[a * 4 + b] = PAIRS.length; PAIRS.push([a, b]); }
const pairOf = (x, y) => (x <= y ? PAIR_IDX[x * 4 + y] : PAIR_IDX[y * 4 + x]);
const enc = (slots, ju, left, g1, g2) => slots | (ju << 16) | (left << 18) | (g1 << 19) | (g2 << 22);
// 한 숫자에서 그룹에 들어간 타일: 1장 낸 색 g1개, 2장 낸 색 g2개, 조커 gj개 → 3~4장 그룹 1~3개로 나눌 수 있나
// (9~10장 = 같은 숫자 7~8장 + 조커 → 그룹 3개. 예: 빨파주 / 빨파검 / 주검J)
function groupOk(g1, g2, gj) {
  const t = g1 + 2 * g2 + gj;
  return t === 0 || (g2 === 0 && t >= 3 && t <= 4) || (t >= 6 && t <= 10);
}
const MAX_STATES = 300000;

// 확장판은 같은 타일 3장·조커 4장이다. 기존 DP의 2장 한도를 넘는
// 묶음은 온전히 보존하고, 남은 묶음과 손패에서 2장까지 골라 재배치한다.
// 전체 손패를 쓰는 planNormal과 비교하므로 확장 타일도 계속 사용할 수 있다.
function solveExpanded(table, hand, ms) {
  let used = new Map();
  const mutable = [], frozen = [], rack = [];
  const fits = ids => {
    const next = new Map(used);
    for (const id of ids) {
      const k = kindOf(id), n = (next.get(k) || 0) + 1;
      if (n > 2) return null;
      next.set(k, n);
    }
    return next;
  };
  for (const set of table) {
    const next = fits(set);
    if (next) { mutable.push(set); used = next; }
    else frozen.push(set);
  }
  for (const id of hand) {
    const next = fits([id]);
    if (next) { rack.push(id); used = next; }
  }
  const solved = solveTable(mutable, rack, ms);
  return solved ? frozen.concat(solved) : null;
}

function solveTable(table, hand, ms = SOLVE_MS) {
  if ([...countKinds(table.flat().concat(hand)).values()].some(n => n > 2)) return solveExpanded(table, hand, ms);
  const deadline = Date.now() + ms;
  const must = [0, 1, 2, 3].map(() => new Array(14).fill(0)), opt = [0, 1, 2, 3].map(() => new Array(14).fill(0));
  let mustJ = 0, optJ = 0;
  for (const id of table.flat()) { const t = R.tile(id); if (t.joker) mustJ++; else must[t.color][t.num]++; }
  for (const id of hand) { const t = R.tile(id); if (t.joker) optJ++; else opt[t.color][t.num]++; }
  const JT = mustJ + optJ;

  // 층(layer) = { idx: Map(state→번호), st: 상태[], s: 점수[], p: 이전 상태[], c: 선택[] }
  const layer = () => ({ idx: new Map(), st: [], s: [], p: [], c: [] });
  const keep = (Lr, st, s, p, c) => {
    const i = Lr.idx.get(st);
    if (i === undefined) { Lr.idx.set(st, Lr.st.length); Lr.st.push(st); Lr.s.push(s); Lr.p.push(p); Lr.c.push(c); }
    else if (s > Lr.s[i]) { Lr.s[i] = s; Lr.p[i] = p; Lr.c[i] = c; }
  };
  const layers = [];
  let cur = layer();
  keep(cur, 0, 0, -1, 0);

  for (let n = 1; n <= 13; n++) {
    for (let c = 0; c < 4; c++) {
      const next = layer();
      const m = must[c][n], o = opt[c][n], a = m + o, gainEach = LEFT_COST(n), sh = c * 4;
      for (let i = 0; i < cur.st.length; i++) {
        const st = cur.st[i], vs = cur.s[i];
        const slots = st & 0xffff, ju = (st >> 16) & 3, left = (st >> 18) & 1, g1 = (st >> 19) & 7, g2 = (st >> 22) & 7;
        const [s1, s2] = PAIRS[(slots >> sh) & 15];
        for (let eA = (s1 === 1 || s1 === 2) ? 1 : 0; eA <= 1; eA++) {          // 길이 1~2인 런은 반드시 이어야 함
          for (let eB = (s2 === 1 || s2 === 2) ? 1 : 0; eB <= 1; eB++) {
            const ext = eA + eB;
            const nslots = (slots & ~(15 << sh)) | (pairOf(eA ? Math.min(s1 + 1, 3) : 0, eB ? Math.min(s2 + 1, 3) : 0) << sh);
            for (let rx = 0; rx <= Math.min(ext, a); rx++) {
              const jx = ext - rx;
              if (ju + jx > JT) continue;
              for (let grp = 0; grp <= Math.min(2, a - rx); grp++) {
                const l = a - rx - grp;
                if (l > o) continue;                                         // 테이블 타일은 남길 수 없음
                const nst = enc(nslots, ju + jx, left | (l > 0 ? 1 : 0), g1 + (grp === 1 ? 1 : 0), g2 + (grp === 2 ? 1 : 0));
                keep(next, nst, vs + (rx + grp - m) * gainEach, st, eA | (eB << 1) | (rx << 2) | (grp << 4));
              }
            }
          }
        }
      }
      if (next.st.length > MAX_STATES || Date.now() > deadline) return null;
      layers.push(next); cur = next;
    }
    const next = layer();                                                    // 이 숫자의 그룹 확정
    for (let i = 0; i < cur.st.length; i++) {
      const st = cur.st[i], vs = cur.s[i];
      const slots = st & 0xffff, ju = (st >> 16) & 3, left = (st >> 18) & 1, g1 = (st >> 19) & 7, g2 = (st >> 22) & 7;
      for (let gj = 0; ju + gj <= JT; gj++) {
        if (groupOk(g1, g2, gj)) keep(next, enc(slots, ju + gj, left, 0, 0), vs, st, gj);
      }
    }
    layers.push(next); cur = next;
  }

  // 끝: 모든 런은 길이 0 또는 3 이상, 테이블 조커는 다 써야 함
  let bestSt = -1, bestScore = -Infinity;
  for (let i = 0; i < cur.st.length; i++) {
    const st = cur.st[i];
    const slots = st & 0xffff, ju = (st >> 16) & 3, left = (st >> 18) & 1;
    if (ju < mustJ) continue;
    let ok = true;
    for (let c = 0; c < 4 && ok; c++) { const [x, y] = PAIRS[(slots >> (c * 4)) & 15]; ok = (x === 0 || x === 3) && (y === 0 || y === 3); }
    if (!ok) continue;
    const score = cur.s[i] - JOKER_KEEP * (ju - mustJ) + (!left && ju === JT ? WIN : 0);
    if (score > bestScore) { bestScore = score; bestSt = st; }
  }
  if (bestSt < 0) return null;

  // 선택 복원
  const choice = new Array(layers.length);
  for (let L = layers.length - 1, st = bestSt; L >= 0; L--) { const i = layers[L].idx.get(st); choice[L] = layers[L].c[i]; st = layers[L].p[i]; }

  // 앞에서부터 실제 묶음 만들기 (토큰: kind 숫자 또는 J)
  const sets = [], runs = [0, 1, 2, 3].map(() => [[], []]);
  const stateOf = list => Math.min(list.length, 3);
  let L = 0;
  for (let n = 1; n <= 13; n++) {
    const inGroup = [];                     // 이 숫자에서 그룹으로 가는 색 (1장 또는 2장)
    for (let c = 0; c < 4; c++) {
      const code = choice[L++];
      const eA = code & 1, eB = (code >> 1) & 1, rx = (code >> 2) & 3, grp = (code >> 4) & 3;
      const [x, y] = runs[c];
      const [A, B] = stateOf(x) <= stateOf(y) ? [x, y] : [y, x];             // A = 짧은 쪽 (DP의 s1)
      let realLeft = rx;
      const kind = c * 13 + n - 1;
      for (const [list, e] of [[A, eA], [B, eB]]) {
        if (e) { list.push(realLeft > 0 ? kind : J); if (realLeft > 0) realLeft--; }
        else if (list.length) { sets.push(list.splice(0)); }
      }
      if (grp) inGroup.push({ kind, k: grp });
    }
    const gj = choice[L++];
    const t = inGroup.reduce((s, g) => s + g.k, 0) + gj;
    if (t) {
      const g2 = inGroup.filter(g => g.k === 2).length;
      if (g2 === 0 && t <= 4) {
        sets.push(inGroup.map(g => g.kind).concat(Array(gj).fill(J)));
      } else if (t >= 9) {                  // 그룹 3개: 2장 낸 색은 가장 짧은 두 그룹에, 나머지는 가장 짧은 그룹에
        const gs = [[], [], []];
        const by = () => gs.slice().sort((a, b) => a.length - b.length);
        for (const g of inGroup.filter(g => g.k === 2)) { const [a, b] = by(); a.push(g.kind); b.push(g.kind); }
        for (const g of inGroup.filter(g => g.k === 1)) by()[0].push(g.kind);
        for (let j = 0; j < gj; j++) by()[0].push(J);
        sets.push(...gs);
      } else {
        const ga = [], gb = [];
        for (const g of inGroup.filter(g => g.k === 2)) { ga.push(g.kind); gb.push(g.kind); }
        for (const g of inGroup.filter(g => g.k === 1)) (ga.length <= gb.length ? ga : gb).push(g.kind);
        for (let j = 0; j < gj; j++) (ga.length <= gb.length ? ga : gb).push(J);
        sets.push(ga, gb);
      }
    }
  }
  for (const pair of runs) for (const list of pair) if (list.length) sets.push(list);

  // kind → 실제 id (테이블 타일 먼저 써서 테이블 타일이 손패로 가지 않게)
  const pools = new Map();
  const push = id => { const k = kindOf(id); if (!pools.has(k)) pools.set(k, []); pools.get(k).push(id); };
  table.flat().forEach(push);
  hand.forEach(push);
  return sets.map(set => {
    const ids = set.map(k => pools.get(k).shift());
    const a = R.analyze(ids);
    return a.ok ? a.order : ids;
  });
}

// ---------- 레벨별 계획 ----------
function playedOf(table, newTable) {
  const before = new Set(table.flat());
  return newTable.flat().filter(id => !before.has(id));
}
// 한 수의 가치: 내려놓은 타일(높은 숫자일수록 좋음), 조커는 아껴 두는 편, 다 털면 승리
function worth(rack, played) {
  const set = new Set(played);
  let v = 0;
  for (const id of played) v += R.tile(id).joker ? -JOKER_KEEP : LEFT_COST(R.tile(id).num);
  if (rack.every(id => set.has(id))) v += WIN;
  return v;
}

function planMeld(table, rack, sets) {
  const total = sets.reduce((s, x) => s + x.value, 0);
  return total >= R.INITIAL_MELD ? table.concat(sets.map(s => s.ids)) : null;
}

function planEasy(table, rack, melded) {
  if (!melded) return planMeld(table, rack, greedySets(rack));
  const T = table.map(s => s.slice());
  const hand = rack.slice();
  for (const s of greedySets(hand)) {
    T.push(s.ids);
    for (const id of s.ids) hand.splice(hand.indexOf(id), 1);
  }
  const onlyJokers = hand.every(id => R.tile(id).joker);
  for (const id of hand.slice()) {
    if (R.tile(id).joker && !onlyJokers) continue;
    if (tryAppend(T, id)) hand.splice(hand.indexOf(id), 1);
  }
  return hand.length < rack.length ? T : null;
}

function planNormal(table, rack, melded) {
  if (!melded) return planMeld(table, rack, bestSets(rack, 'meld'));
  const T = table.map(s => s.slice());
  const hand = rack.slice();
  for (const s of bestSets(hand, 'play')) {
    T.push(s.ids);
    for (const id of s.ids) hand.splice(hand.indexOf(id), 1);
  }
  for (let guard = 0; guard < 40; guard++) {
    let changed = false;
    const onlyJokers = hand.every(id => R.tile(id).joker);
    for (const id of hand.slice()) {
      if (R.tile(id).joker && !onlyJokers) continue;   // 조커는 아껴 두기
      if (tryPlace(T, id)) { hand.splice(hand.indexOf(id), 1); changed = true; }
    }
    if (!changed && tryBorrow(T, hand)) changed = true;
    if (!changed) break;
  }
  return hand.length < rack.length ? T : null;
}

function planHard(table, rack, melded, ms) {
  const base = planNormal(table, rack, melded);
  if (!melded) return base;                      // 첫 등록 턴에는 테이블을 못 건드리므로 기본과 같음
  let solved = null;
  try { solved = solveTable(table, rack, ms); } catch (e) { solved = null; }
  const ok = t => t && R.checkPlay(table, rack, t, true).ok;
  const cands = [base, solved].filter(ok);
  if (!cands.length) return null;
  const scored = cands.map(t => ({ t, v: worth(rack, playedOf(table, t)) }));
  scored.sort((a, b) => b.v - a.v);
  return scored[0].v > 0 ? scored[0].t : null;
}

// 이번 턴에 낼 테이블을 돌려줌. 낼 게 없으면 null (→ 뽑기)
function plan(table, rack, melded, level = 'hard', opts = {}) {
  if (level === 'easy') return planEasy(table, rack, melded);
  if (level === 'normal') return planNormal(table, rack, melded);
  return planHard(table, rack, melded, opts.ms || SOLVE_MS);
}

module.exports = { plan, bestSets, candidates, solveTable, LEVELS: ['easy', 'normal', 'hard'] };
