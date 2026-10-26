// 규칙 + 서버 통합 테스트:  node test.js
const assert = require('assert');
const R = require('./public/rules.js');
const randomPool = count => {
  const pool=Array.from({length:count},(_,i)=>i);
  for(let i=pool.length-1;i>0;i--){const j=require('node:crypto').randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
  return pool;
};

// 타일 id 만들기: color 0~3, num 1~13, copy 0/1
const T = (color, num, copy = 0) => color * 26 + (num - 1) * 2 + copy;
const J1 = 104, J2 = 105;

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

console.log('규칙');
ok('타일 해석', () => {
  assert.deepStrictEqual(R.tile(T(2, 7, 1)), { id: T(2, 7, 1), joker: false, color: 2, num: 7 });
  assert.ok(R.tile(J2).joker);
});
ok('5~6인 확장: 숫자 3벌·조커 4개, 기존 106개 ID 보존', () => {
  assert.strictEqual(R.MAX_PLAYERS, 6);
  assert.deepStrictEqual([2,3,4,5,6].map(R.deckSize), [106,106,106,160,160]);
  const all = Array.from({length:R.TILE_COUNT}, (_,i)=>R.tile(i));
  assert.strictEqual(all.filter(t=>t.joker).length, 4);
  for (let c=0;c<4;c++) for (let n=1;n<=13;n++)
    assert.strictEqual(all.filter(t=>!t.joker && t.color===c && t.num===n).length, 3);
  assert.deepStrictEqual(R.tile(106), {id:106,joker:false,color:0,num:1});
  assert.deepStrictEqual(R.tile(157), {id:157,joker:false,color:3,num:13});
  assert.strictEqual(R.penalty([106,157,158,159]), 74);
  assert.ok(R.analyze([157,104,158,159]).ok, '실제 타일 1개와 조커 3개');
  assert.ok(!R.checkPlay([], [106,107,108], [[106,107,108],[106,107,108]], true).ok, '확장 타일도 중복 사용 금지');
  assert.strictEqual(R.checkPlay([], [T(0,1),T(0,2),T(0,3)], [[106,107,108]], true).code, 'notYours');
});
ok('그룹', () => {
  assert.strictEqual(R.analyze([T(0, 5), T(1, 5), T(3, 5)]).value, 15);
  assert.ok(!R.analyze([T(0, 5), T(0, 5, 1), T(3, 5)]).ok, '같은 색 중복 불가');
  assert.ok(!R.analyze([T(0, 5), T(1, 5), T(2, 5), T(3, 5), J1]).ok, '5개 그룹 불가');
});
ok('런', () => {
  const a = R.analyze([T(1, 4), T(1, 2), T(1, 3)]);
  assert.ok(a.ok); assert.strictEqual(a.kind, 'run'); assert.strictEqual(a.value, 9);
  assert.deepStrictEqual(a.order, [T(1, 2), T(1, 3), T(1, 4)]);
  assert.ok(!R.analyze([T(1, 12), T(1, 13), T(1, 1)]).ok, '13→1 연결 불가');
  assert.ok(!R.analyze([T(1, 2), T(1, 3)]).ok, '2개 불가');
  assert.ok(!R.analyze([T(1, 2), T(1, 3), T(2, 4)]).ok, '색 섞기 불가');
});
ok('조커', () => {
  const a = R.analyze([T(0, 3), J1, T(0, 5)]);
  assert.ok(a.ok); assert.strictEqual(a.jokerAs[J1], 4); assert.deepStrictEqual(a.order, [T(0, 3), J1, T(0, 5)]);
  const b = R.analyze([T(0, 12), T(0, 13), J1]);
  assert.strictEqual(b.jokerAs[J1], 11);
  assert.ok(R.analyze([T(0, 9), J1, J2]).ok);
  assert.ok(!R.analyze([J1, J2]).ok);
});
ok('첫 등록 30점', () => {
  const rack = [T(0, 10), T(1, 10), T(2, 10), T(3, 1)];
  assert.ok(R.checkPlay([], rack, [[T(0, 10), T(1, 10), T(2, 10)]], false).ok);
  const low = [T(0, 1), T(0, 2), T(0, 3)];
  assert.match(R.checkPlay([], low, [low], false).reason, /30점/);
  assert.ok(R.checkPlay([], low, [low], true).ok, '등록 후엔 점수 제한 없음');
});
ok('첫 등록 전 테이블 변경 금지 / 등록 후 재배치 허용', () => {
  const table = [[T(1, 3), T(1, 4), T(1, 5), T(1, 6)]];
  const rack = [T(1, 7), T(0, 11), T(1, 11), T(2, 11)];
  const extend = [[T(1, 3), T(1, 4), T(1, 5), T(1, 6), T(1, 7)], [T(0, 11), T(1, 11), T(2, 11)]];
  assert.match(R.checkPlay(table, rack, extend, false).reason, /첫 등록 전/);
  assert.ok(R.checkPlay(table, rack, extend, true).ok);
  // 쪼개기: 3456 + 7 → 345 / 67? (67은 2개라 불가)
  assert.ok(!R.checkPlay(table, rack, [[T(1, 3), T(1, 4), T(1, 5)], [T(1, 6), T(1, 7)]], true).ok);
});
ok('부정 방지', () => {
  const table = [[T(1, 3), T(1, 4), T(1, 5)]];
  assert.match(R.checkPlay(table, [T(1, 6)], [[T(1, 3), T(1, 4), T(1, 6)]], true).reason, /손패로/);
  assert.match(R.checkPlay(table, [T(1, 6)], [[T(1, 3), T(1, 4), T(1, 5), T(1, 6), T(1, 7)]], true).reason, /내 타일이 아닌/);
  assert.match(R.checkPlay(table, [T(1, 6)], table, true).reason, /하나 이상/);
  assert.ok(!R.checkPlay(table, [T(1, 6)], [[T(1, 3), T(1, 4), T(1, 5), T(1, 6), T(1, 6)]], true).ok, '중복 id');
  assert.ok(!R.checkPlay(table, [], 'x', true).ok);
});
ok('벌점', () => assert.strictEqual(R.penalty([T(0, 5), J1, T(3, 13)]), 48));
// ---- 여러 언어: 실패 이유를 code + params로도 (한국어 reason은 그대로) ----
ok('analyze 실패 code·params', () => {
  const cp = r => [r.ok, r.code, r.params];
  assert.deepStrictEqual(cp(R.analyze([T(0, 1), T(0, 2)])), [false, 'tooFew', { n: 2, min: 3 }]);
  assert.deepStrictEqual(cp(R.analyze([])), [false, 'tooFew', { n: 0, min: 3 }]);
  assert.deepStrictEqual(cp(R.analyze([J1, J2])), [false, 'tooFew', { n: 2, min: 3 }], '3장 미만이 먼저');
  assert.deepStrictEqual(cp(R.analyze([J1, J2, J1])), [false, 'jokersOnly', {}]);
  assert.strictEqual(R.analyze([J1, J2, J1]).reason, '조커만으로는 묶음을 만들 수 없어요');
  assert.deepStrictEqual(cp(R.analyze([T(0, 5), T(1, 6), T(2, 7)])), [false, 'notSet', {}]);
  assert.deepStrictEqual(cp(R.analyze([T(0, 5), T(0, 5, 1), T(3, 5)])), [false, 'notSet', {}]);
  const good = R.analyze([T(0, 5), T(1, 5), T(2, 5)]);
  assert.ok(good.ok && good.code === undefined && good.params === undefined, '맞는 묶음엔 code 없음');
});
ok('checkPlay 실패 code·params (reason 문장은 그대로)', () => {
  const table = [[T(1, 3), T(1, 4), T(1, 5)]];
  const cp = (...a) => { const r = R.checkPlay(...a); assert.strictEqual(r.ok, false); return [r.code, r.params, r.reason]; };
  assert.deepStrictEqual(cp(table, [], 'x', true), ['badRequest', {}, '잘못된 요청']);
  assert.deepStrictEqual(cp(table, [T(1, 6)], [[]], true), ['badRequest', {}, '잘못된 요청']);
  assert.deepStrictEqual(cp(table, [T(1, 6)], [[T(1, 3), T(1, 4), T(1, 5), T(1, 6), T(1, 6)]], true)[0], 'badRequest');
  assert.deepStrictEqual(cp(table, [T(1, 6)], [[T(1, 3), T(1, 4), T(1, 6)]], true), ['tableToRack', {}, '테이블의 타일은 손패로 가져올 수 없어요']);
  assert.deepStrictEqual(cp(table, [T(1, 6)], [[T(1, 3), T(1, 4), T(1, 5), T(1, 6), T(1, 7)]], true), ['notYours', {}, '내 타일이 아닌 타일이 있어요']);
  assert.deepStrictEqual(cp(table, [T(1, 6)], table, true), ['playOne', {}, '손패에서 타일을 하나 이상 내려놓아야 해요']);
  assert.deepStrictEqual(cp(table, [T(1, 6), T(2, 9)], [...table, [T(1, 6), T(2, 9)]], true),
    ['setInvalid', { index: 2, sub: 'tooFew' }, '2번째 묶음: 묶음은 3개 이상이어야 해요']);
  assert.deepStrictEqual(cp([], [T(0, 5), T(1, 6), T(2, 7)], [[T(0, 5), T(1, 6), T(2, 7)]], true),
    ['setInvalid', { index: 1, sub: 'notSet' }, '1번째 묶음: 같은 숫자 다른 색(그룹) 또는 같은 색 연속 숫자(런)가 아니에요']);
  const rack = [T(1, 6), T(0, 11), T(1, 11), T(2, 11)];
  assert.deepStrictEqual(cp(table, rack, [[T(1, 3), T(1, 4), T(1, 5), T(1, 6)], [T(0, 11), T(1, 11), T(2, 11)]], false),
    ['meldLocked', {}, '첫 등록 전에는 테이블의 묶음을 바꿀 수 없어요']);
  const low = [T(0, 1), T(0, 2), T(0, 3)];
  assert.deepStrictEqual(cp([], low, [low], false), ['meldLow', { need: 30, have: 6 }, '첫 등록은 내 타일만으로 30점 이상이어야 해요 (지금 6점)']);
  const good = R.checkPlay([], low, [low], true);
  assert.ok(good.ok && good.code === undefined);
});
// ---- 손맛(클라이언트): 묶음 안내 문구 · 테이블 비교 · 소리 키트 ----
ok('explain: 장수 부족·조커만', () => {
  assert.strictEqual(R.explain([T(0, 5)]), '2장 더 필요해요');
  assert.strictEqual(R.explain([T(0, 5), T(1, 5)]), '1장 더 필요해요');
  assert.strictEqual(R.explain([J1, J2, J1]), '조커만으로는 안 돼요');
});
ok('explain: 그룹 4장 초과·같은 색 겹침', () => {
  assert.strictEqual(R.explain([T(0, 5), T(1, 5), T(2, 5), T(3, 5), J1]), '그룹은 4장까지예요');
  assert.strictEqual(R.explain([T(0, 5), T(0, 5, 1), T(3, 5)]), '같은 색이 겹쳐요 (빨강 5)');
  assert.strictEqual(R.explain([T(2, 9), T(1, 9), J1, T(2, 9, 1)]), '같은 색이 겹쳐요 (노랑 9)');
});
ok('explain: 런 숫자 중복(이/가)·사이 빔', () => {
  assert.strictEqual(R.explain([T(1, 6), T(1, 6, 1), T(1, 7)]), '파랑 6이 두 장이에요');
  assert.strictEqual(R.explain([T(1, 5), T(1, 5, 1), T(1, 6)]), '파랑 5가 두 장이에요');
  assert.strictEqual(R.explain([T(1, 8), T(1, 5), T(1, 6)]), '파랑 5-6-8 사이가 비어요');
  assert.strictEqual(R.explain([T(3, 2), T(3, 9), J1, T(3, 3)]), '검정 2-3-9 사이가 비어요');
  assert.strictEqual(R.explain([T(0, 12), T(0, 13), T(0, 1)]), '빨강 1-12-13 사이가 비어요');
});
ok('explain: 섞임·맞는 묶음은 null·analyze 이유는 그대로', () => {
  assert.strictEqual(R.explain([T(0, 5), T(1, 6), T(2, 7)]), '같은 숫자(다른 색)나 같은 색 연속 숫자여야 해요');
  assert.strictEqual(R.explain([T(1, 5), T(1, 6), J1]), null);
  assert.strictEqual(R.explain([T(1, 5), T(1, 6), T(1, 8), J1]), null, '조커가 빈칸을 채움');
  assert.strictEqual(R.explain([T(0, 7), T(1, 7), T(3, 7)]), null);
  // 서버·기존 테스트가 쓰는 analyze() 이유 문구는 바뀌지 않음
  assert.strictEqual(R.analyze([T(0, 1), T(0, 2)]).reason, '묶음은 3개 이상이어야 해요');
  assert.strictEqual(R.analyze([J1, J2]).reason, '묶음은 3개 이상이어야 해요');
  assert.strictEqual(R.analyze([T(0, 5), T(1, 6), T(2, 7)]).reason, '같은 숫자 다른 색(그룹) 또는 같은 색 연속 숫자(런)가 아니에요');
});
ok('explainCode: 이유별 code·params (타일은 {color, num}으로)', () => {
  const E = R.explainCode;
  assert.deepStrictEqual(E([T(0, 5)]), { code: 'needMore', params: { n: 2 } });
  assert.deepStrictEqual(E([T(0, 5), T(1, 5)]), { code: 'needMore', params: { n: 1 } });
  assert.deepStrictEqual(E([J1, J2, J1]), { code: 'jokersOnly', params: {} });
  assert.deepStrictEqual(E([T(0, 5), T(1, 5), T(2, 5), T(3, 5), J1]), { code: 'groupMax4', params: {} });
  assert.deepStrictEqual(E([T(0, 5), T(0, 5, 1), T(3, 5)]), { code: 'sameColor', params: { tile: { color: 0, num: 5 } } });
  assert.deepStrictEqual(E([T(2, 9), T(1, 9), J1, T(2, 9, 1)]), { code: 'sameColor', params: { tile: { color: 2, num: 9 } } });
  assert.deepStrictEqual(E([T(1, 6), T(1, 6, 1), T(1, 7)]), { code: 'dupNum', params: { tile: { color: 1, num: 6 } } });
  assert.deepStrictEqual(E([T(3, 2), T(3, 9), J1, T(3, 3)]), { code: 'gap', params: { color: 3, nums: [2, 3, 9] } });
  assert.deepStrictEqual(E([T(0, 12), T(0, 13), T(0, 1)]), { code: 'gap', params: { color: 0, nums: [1, 12, 13] } });
  const run14 = Array.from({ length: 13 }, (_, i) => T(2, i + 1)).concat(J1);
  assert.deepStrictEqual(E(run14), { code: 'runMax13', params: {} });
  assert.strictEqual(R.explain(run14), '런은 13까지만 이어져요');
  assert.deepStrictEqual(E([T(0, 5), T(1, 6), T(2, 7)]), { code: 'mixed', params: {} });
  assert.strictEqual(E([T(1, 5), T(1, 6), J1]), null);
  assert.strictEqual(E([T(0, 7), T(1, 7), T(3, 7)]), null);
});
ok('explain·explainCode·analyze: 무작위 묶음 3000개에서 같은 판단', () => {
  const codes = new Set();
  for (let k = 0; k < 3000; k++) {
    const size = 1 + Math.floor(Math.random() * 7);
    // 판정이 갈리는 경우가 고루 나오게: 절반은 한 색에서, 나머지는 아무 타일이나
    const color = Math.floor(Math.random() * 4);
    const from = k % 2 ? [...Array(26).keys()].map(i => color * 26 + i).concat(J1, J2) : [...Array(106).keys()];
    const ids = [...new Set(Array.from({ length: size }, () => from[Math.floor(Math.random() * from.length)]))];
    const e = R.explainCode(ids), s = R.explain(ids), a = R.analyze(ids);
    assert.strictEqual(e === null, a.ok, `explainCode ↔ analyze ${ids}`);
    assert.strictEqual(s === null, e === null, `explain ↔ explainCode ${ids}`);
    if (e) { assert.strictEqual(typeof s, 'string'); codes.add(e.code); }
  }
  for (const c of ['needMore', 'dupNum', 'gap', 'mixed']) assert.ok(codes.has(c), c);
});
ok('tableDiff: 새 묶음·사라진 옛 묶음·새로 놓인 타일', () => {
  const run = [T(1, 3), T(1, 4), T(1, 5)], grp = [T(0, 9), T(1, 9), T(2, 9)], grp2 = [T(0, 9, 1), T(1, 9, 1), T(3, 9)];
  const d1 = R.tableDiff([run, grp], [grp.slice().reverse(), run]);
  assert.deepStrictEqual([d1.added, d1.removed, d1.placed], [[], 0, []], '순서만 바뀌면 변화 없음');
  const d2 = R.tableDiff([run, grp], [grp, [...run, T(1, 6)], grp2]);
  assert.deepStrictEqual(d2.added, [1, 2]);
  assert.strictEqual(d2.removed, 1);
  assert.deepStrictEqual(d2.placed.sort((a, b) => a - b), [T(1, 6), ...grp2].sort((a, b) => a - b));
  const d3 = R.tableDiff([grp, grp2], [grp2, grp]);   // 같은 묶음 두 벌도 여러 벌 집합으로
  assert.deepStrictEqual([d3.added, d3.removed], [[], 0]);
});
{
  // sfx.js를 브라우저 흉내 환경(vm)에서 불러 확인: 오디오 없음·저장소 오류에도 안전, 모드 저장, 모든 음이 5음계
  const fs = require('fs'), vm = require('vm');
  const SRC = fs.readFileSync(require('path').join(__dirname, 'public', 'sfx.js'), 'utf8');
  function fakeAudio(freqs) {
    const param = rec => ({ value: 0, setValueAtTime(v) { if (rec) rec(v); this.value = v; }, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
    const node = extra => Object.assign({ connect() {}, disconnect() {} }, extra);
    return class {
      constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); }
      resume() { return Promise.resolve(); }
      createGain() { return node({ gain: param() }); }
      createOscillator() { return node({ type: 'sine', frequency: param(v => freqs.push(v)), start() {}, stop() {} }); }
      createBiquadFilter() { return node({ type: '', frequency: param(), Q: param() }); }
      createBufferSource() { return node({ start() {}, stop() {} }); }
      createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
      createDynamicsCompressor() { return node(); }
    };
  }
  const memStore = init => { const m = new Map(Object.entries(init || {})); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  const load = env => {
    const g = vm.createContext(Object.assign({ setTimeout: () => 0, clearTimeout() {}, console }, env));
    g.window = g;
    vm.runInContext(SRC, g);
    return g.Sfx;
  };
  ok('sfx: 오디오가 없고 저장소가 막혀도 오류 없음', () => {
    const throwing = { getItem() { throw new Error('private'); }, setItem() { throw new Error('private'); } };
    const Sfx = load({ localStorage: throwing });
    assert.strictEqual(Sfx.mode, 'on');
    for (const name of Sfx.SOUNDS) assert.strictEqual(Sfx.play(name, { step: 3 }), false);
    assert.strictEqual(Sfx.setMode('buzz'), 'buzz');
    assert.strictEqual(Sfx.cycle(), 'off');
    assert.strictEqual(Sfx.cycle(), 'on');
    assert.strictEqual(Sfx.setMode('loud'), 'on', '모르는 모드는 무시');
  });
  ok('sfx: 소리·진동 / 진동만 / 끔 — 저장되고 다시 불러와짐 (옛 off 값도)', () => {
    const store = memStore();
    const vib = [];
    const nav = { vibrate: p => { vib.push(p); return true; }, userActivation: { hasBeenActive: true } };
    let Sfx = load({ localStorage: store, navigator: nav });
    Sfx.setMode('buzz');
    assert.strictEqual(store.m.get('rummi-sound'), 'buzz');
    Sfx = load({ localStorage: store, navigator: nav });
    assert.strictEqual(Sfx.mode, 'buzz');
    assert.strictEqual(Sfx.label(), '📳 진동만');
    vib.length = 0;
    Sfx.play('place');
    assert.deepStrictEqual(vib, [12], '진동만: 진동은 울림');
    assert.strictEqual(load({ localStorage: memStore({ 'rummi-sound': 'off' }), navigator: nav }).mode, 'off');
    const off = load({ localStorage: memStore({ 'rummi-sound': 'off' }), navigator: nav });
    vib.length = 0;
    off.play('turn'); off.buzz([20, 40, 20]);
    assert.deepStrictEqual(vib, [], '끔: 진동도 없음');
    const quiet = load({ localStorage: memStore(), navigator: { vibrate: p => vib.push(p), userActivation: { hasBeenActive: false } } });
    quiet.play('pick');
    assert.deepStrictEqual(vib, [], '아직 화면을 누르기 전엔 진동을 부르지 않음(브라우저 경고 방지)');
  });
  ok('sfx: 모든 음 높이가 C장조 5음계 (배음·옥타브 반짝임 포함), 같은 소리 30ms 안 반복 안 함', () => {
    const freqs = [];
    const AC = fakeAudio(freqs);
    const Sfx = load({ localStorage: memStore(), AudioContext: AC, navigator: { vibrate() { return true; } } });
    for (const name of Sfx.SOUNDS) assert.ok(Sfx.play(name, { step: 2 }), name);
    assert.ok(Sfx.play('pick') === false || Sfx.play('pick') === false, '30ms 안 같은 소리는 건너뜀');
    // 단계별 음: 같은 이름은 30ms 안에 다시 안 남 → 단계마다 새로 불러 확인
    for (const name of ['valid', 'commit', 'award']) for (let step = 0; step < 9; step++) {
      const f2 = [];
      const S2 = load({ localStorage: memStore(), AudioContext: fakeAudio(f2), navigator: {} });
      assert.ok(S2.play(name, { step }));
      freqs.push(...f2);
    }
    assert.ok(freqs.length > 40, `음 ${freqs.length}개`);
    const base = [...Sfx.PENTA, ...Object.values(Sfx.LOW)];
    const near = (f, g) => Math.abs(f - g) < 0.05;
    const okFreq = f => base.some(b => near(f, b) || near(f, b * 2.76) || near(f, b * 5.4) || near(f, b * 2 * 1.006) || near(f, b * 2 * 0.994));
    const bad = freqs.filter(f => !okFreq(f));
    assert.deepStrictEqual(bad, [], '5음계 밖의 음');
    assert.ok(Sfx.SOUNDS.length >= 15);
  });
  ok('sfx: 진동이 없는 기기(아이폰)는 소리 켜짐 ↔ 꺼짐 두 가지, 저장된 진동만은 끔으로', () => {
    const Sfx = load({ localStorage: memStore(), navigator: {} });
    assert.strictEqual(Sfx.canBuzz, false);
    assert.strictEqual(Sfx.cycle(), 'off');
    assert.strictEqual(Sfx.cycle(), 'on', '진동만을 건너뜀');
    assert.strictEqual(Sfx.label(), '🔔 소리 켜짐');
    assert.strictEqual(load({ localStorage: memStore({ 'rummi-sound': 'buzz' }), navigator: {} }).mode, 'off');
    assert.strictEqual(load({ localStorage: memStore({ 'rummi-sound': 'buzz' }), navigator: { vibrate() { return true; } } }).mode, 'buzz');
  });
  ok('sfx: 진동만 따로 끄기·저장·복구, 전체 끔과 숨긴 화면의 진동 억제', () => {
    const store=memStore(),calls=[],doc={hidden:false};
    const env={localStorage:store,document:doc,navigator:{vibrate:p=>{calls.push(p);return true;}}};
    const sound=load(env);sound.setHaptics(false);calls.length=0;
    assert.strictEqual(sound.mode,'on','진동을 꺼도 소리 모드 유지');
    assert.strictEqual(sound.buzz('place'),false);assert.deepStrictEqual(calls,[]);
    assert.strictEqual(load(env).hapticsEnabled,false,'다시 열어도 선호 유지');
    sound.setHaptics(true);assert.strictEqual(sound.buzz('place'),true);assert.deepStrictEqual(calls,[12]);
    doc.hidden=true;assert.strictEqual(sound.buzz('place'),false);assert.deepStrictEqual(calls,[12]);
    doc.hidden=false;sound.setMode('off');calls.length=0;assert.strictEqual(sound.buzz('valid'),false);assert.deepStrictEqual(calls,[]);
  });
}
{
  // public/i18n.js 사전 ↔ 서버·규칙 코드 짝 맞추기: 하나라도 어긋나면 영어 화면에 한국어 대비 문장이 조용히 섞여 나옴
  const fs = require('fs'), vm = require('vm'), path = require('path');
  const SRC = fs.readFileSync(path.join(__dirname, 'public', 'i18n.js'), 'utf8');
  const SERVER = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const RULES = fs.readFileSync(path.join(__dirname, 'public', 'rules.js'), 'utf8');
  const load = lang => {
    const store = { 'rummi-lang': lang };
    const doc = { querySelectorAll: () => [], documentElement: {}, title: '' };
    const g = vm.createContext({ console, document: doc, navigator: { language: lang }, localStorage: { getItem: k => (k in store ? store[k] : null), setItem() {} } });
    g.window = g;
    vm.runInContext(SRC, g);
    return g.I18N;
  };
  const KO = load('ko'), EN = load('en');
  const HANGUL = /[가-힣ㄱ-ㆎ]/;
  // 값이 함수면 흔한 값들을 넣어 봄
  const P = { n: 2, round: 1, who: 'Grace', meld: 31, why: 'timeout', level: 'easy', what: 'bot', need: 30, have: 12, index: 2, sub: 'x',
    tile: { color: 1, num: 5 }, color: 2, nums: [1, 4, 5], value: 33, from: 14, to: 3, name: 'Grace', v: 30, s: 5, room: 'ABCD', code: 'ABCD', rule: 'playOne' };
  const both = (key, what) => {
    assert.ok(KO.has(key), `한국어 사전에 ${key} 없음 (${what})`);
    const en = EN.t(key, P);
    assert.notStrictEqual(en, key, `영어 사전에 ${key} 없음 (${what})`);
    assert.ok(!HANGUL.test(JSON.stringify(en)), `영어 ${key}에 한국어가 섞임: ${JSON.stringify(en)}`);
  };
  const { BOT_LINES, ERR } = (() => {   // server.js를 불러오지 않고(포트 열지 않음) 표만 읽음
    const lines = {};
    const m = SERVER.match(/const BOT_LINES = (\{[\s\S]*?\n\});/);
    assert.ok(m, 'server.js BOT_LINES 표');
    Object.assign(lines, JSON.parse(JSON.stringify(vm.runInNewContext('(' + m[1] + ')'))));
    const e = SERVER.match(/const ERR = \{([\s\S]*?)\n\};/);
    assert.ok(e, 'server.js ERR 표');
    return { BOT_LINES: lines, ERR: [...e[1].matchAll(/^\s+(\w+):/gm)].map(x => x[1]) };
  })();
  ok('i18n: 봇 말 줄 수·한국어 문장이 서버 BOT_LINES와 같음 (줄 번호 i로 고름)', () => {
    for (const [k, list] of Object.entries(BOT_LINES)) {
      assert.deepStrictEqual(Array.from(KO.ko('botline.' + k)), list, `botline.${k} 한국어`);
      const en = EN.t('botline.' + k);
      assert.ok(Array.isArray(en) && en.length === list.length, `botline.${k} 영어 ${en && en.length}/${list.length}줄`);
      assert.ok(!en.some(x => HANGUL.test(x)));
    }
  });
  ok('i18n: 서버 오류 code마다 err.* (영어에 한국어 없음)', () => {
    assert.ok(ERR.length >= 15, `ERR ${ERR.length}개`);
    for (const c of ERR) both('err.' + c, 'ERR');
    for (const what of ['bot', 'change', 'remove', 'start']) assert.ok(!HANGUL.test(EN.t('err.hostOnly', { what })));
    for (const c of ['generic', 'network', 'server', 'unknown']) both('err.' + c, '화면 오류');
  });
  ok('i18n: 진행 기록 k·시상 key/dk·규칙 code·explainCode가 모두 사전에', () => {
    const logKs = [...new Set([...SERVER.matchAll(/\blog\(room, '(\w+)'/g)].map(x => x[1]))];
    assert.ok(logKs.length >= 8, `log 종류 ${logKs}`);
    for (const k of logKs) both('log.' + k, 'server log');
    for (const k of ['timeout', 'offline']) both('log.why.' + k, 'log why');
    const awards = [...SERVER.matchAll(/\{ key: '(\w+)', emoji:/g)].map(x => x[1]);
    assert.ok(awards.includes('win') && awards.includes('together') && awards.length >= 8, `시상 ${awards}`);
    const dks = { win: ['out', 'fewest'], together: ['played', 'stayed'] };
    for (const a of awards) {
      both(`award.${a}.title`, '시상');
      for (const dk of dks[a] || ['d']) both(`award.${a}.${dk}`, '시상 설명');
    }
    const ruleCodes = [...new Set([...RULES.matchAll(/\bno\('(\w+)'/g)].map(x => x[1]))];
    const analyzeCodes = ['tooFew', 'jokersOnly', 'notSet'];
    for (const c of analyzeCodes) { assert.ok(ruleCodes.includes(c), c); both('analyze.' + c, 'analyze'); }
    for (const c of ruleCodes.filter(c => !analyzeCodes.includes(c))) both('rule.' + c, 'checkPlay');
    const explainCodes = [...new Set([...RULES.matchAll(/\{ code: '(\w+)'/g)].map(x => x[1]))];
    assert.strictEqual(explainCodes.length, 8, `explainCode ${explainCodes}`);
    for (const c of explainCodes) both('explain.' + c, 'explainCode');
  });
  ok('i18n: 한국어·영어 사전 키가 같고, 영어 화면 글자에 한국어가 섞이지 않음', () => {
    const keys = [...SRC.matchAll(/'([a-zA-Z0-9]+\.[\w.]+)'\s*:/g)].map(x => x[1]);
    const uniq = [...new Set(keys)];
    assert.ok(uniq.length > 200, `사전 키 ${uniq.length}개`);
    const once = uniq.filter(k => keys.indexOf(k) === keys.lastIndexOf(k));
    assert.deepStrictEqual(once, [], '한쪽 사전에만 있는 키');
    for (const k of uniq) both(k, '사전');
  });
}

console.log('봇');
const Bot = require('./bot.js');
ok('첫 등록: 30점 넘으면 내고, 모자라면 뽑기', () => {
  const t = Bot.plan([], [T(0, 11), T(1, 11), T(2, 11), T(3, 2)], false);
  assert.ok(R.checkPlay([], [T(0, 11), T(1, 11), T(2, 11), T(3, 2)], t, false).ok);
  assert.strictEqual(Bot.plan([], [T(0, 1), T(1, 1), T(2, 1), T(3, 9)], false), null);
});
ok('붙이기·런 쪼개기·빌려오기', () => {
  const run = [T(1, 3), T(1, 4), T(1, 5), T(1, 6), T(1, 7)];
  const add = Bot.plan([run], [T(1, 8)], true, 'normal');
  assert.deepStrictEqual(add, [[...run, T(1, 8)]]);
  const split = Bot.plan([run], [T(1, 5, 1)], true, 'normal');
  assert.strictEqual(split.length, 2);
  assert.ok(R.checkPlay([run], [T(1, 5, 1)], split, true).ok);
  const grp = [T(0, 9), T(1, 9), T(2, 9), T(3, 9)];
  const borrow = Bot.plan([grp], [T(0, 10), T(0, 11)], true, 'normal');
  assert.ok(R.checkPlay([grp], [T(0, 10), T(0, 11)], borrow, true).ok);
  assert.strictEqual(Bot.plan([run], [T(2, 1)], true, 'normal'), null);
});
ok('어려움: 테이블 전체 재배치 (기본 전략으론 못 냄)', () => {
  // 빨1-3, 파1-3, 주1-3 + 손패 검1·검2 → 1·2·3 그룹 셋으로 다시 짜야만 낼 수 있음
  const table = [[T(0, 1), T(0, 2), T(0, 3)], [T(1, 1), T(1, 2), T(1, 3)], [T(2, 1), T(2, 2), T(2, 3)]];
  const hand = [T(3, 1), T(3, 2), T(1, 9)];
  assert.strictEqual(Bot.plan(table, hand, true, 'normal'), null);
  const hard = Bot.plan(table, hand, true, 'hard');
  const r = R.checkPlay(table, hand, hard, true);
  assert.ok(r.ok, r.reason);
  assert.deepStrictEqual(r.played.sort((a, b) => a - b), [T(3, 1), T(3, 2)]);
});
ok('어려움: 조커 다루기·다 털기', () => {
  const t1 = [[T(0, 12), T(0, 13), J1]];
  const p1 = Bot.plan(t1, [T(0, 11)], true, 'hard');
  assert.ok(R.checkPlay(t1, [T(0, 11)], p1, true).ok, '테이블 조커는 꼭 남겨야 함');
  const t2 = [[T(1, 4), T(1, 5), T(1, 6)]];
  const p2 = Bot.plan(t2, [T(1, 7), T(1, 3)], true, 'hard');
  assert.deepStrictEqual(p2.flat().sort((a, b) => a - b), [T(1, 3), T(1, 4), T(1, 5), T(1, 6), T(1, 7)].sort((a, b) => a - b));
  // 손패 조커 하나만 붙일 수 있을 땐 아껴 둠(뽑기)
  assert.strictEqual(Bot.plan(t2, [J1, T(2, 9)], true, 'hard'), null);
  // 그 조커로 손패를 다 털 수 있으면 냄
  assert.ok(Bot.plan(t2, [J1], true, 'hard'));
});
ok('어려움: 같은 숫자 그룹 3개로 나누기 (13 두 벌 + 조커로 승리)', () => {
  const g = k => [0, 1, 2, 3].map(c => T(c, 13, k));
  const table = [g(0), g(1)];
  const plan = Bot.plan(table, [J1], true, 'hard');
  assert.ok(plan, '이길 수 있는데 뽑으면 안 됨');
  assert.ok(R.checkPlay(table, [J1], plan, true).ok);
  assert.strictEqual(plan.length, 3);
  const t2 = [[T(0, 10), T(1, 10), T(2, 10), T(3, 10)], [T(0, 10, 1), T(2, 10, 1), T(3, 10, 1), J1]];
  const p2 = Bot.plan(t2, [T(1, 10, 1)], true, 'hard');
  assert.ok(p2 && R.checkPlay(t2, [T(1, 10, 1)], p2, true).ok);
});
ok('쉬움: 실수하지 않을 때 단순 묶음·붙이기, 단순 승리는 항상 실행', () => {
  const hand = [T(0, 1), T(0, 2), T(0, 3), T(1, 7), T(2, 7), T(3, 7)];
  const t = Bot.plan([], hand, true, 'easy', { rng: () => { throw Error('계산에 난수 사용 금지'); } });
  assert.strictEqual(t.length, 2);
  assert.ok(R.checkPlay([], hand, t, true).ok);
  const run = [[T(0, 1), T(0, 2), T(0, 3)]];
  const added=Bot.plan(run,[T(0,4)],true,'easy',{rng:()=>{throw Error('임의로 붙이기 건너뛰기 금지');}});
  assert.ok(added && R.checkPlay(run,[T(0,4)],added,true).ok);
});
ok('쉬움도 조커로 단순 첫 등록 가능·중간은 여러 묶음 탐색', () => {
  const initial=[T(0,10),T(0,11),J1];
  assert.ok(R.checkPlay([],initial,Bot.plan([],initial,false,'easy'),false).ok);
  const hand=[1,2,3,4,5,6,7].map(n=>T(0,n)).concat([1,2].flatMap(c=>[2,4,6].map(n=>T(c,n))));
  assert.strictEqual(Bot.plan([],hand,true,'easy',{rng:()=>0.99}).flat().length,7);
  assert.strictEqual(Bot.plan([],hand,true,'normal').flat().length,9);
  assert.strictEqual(Bot.plan([],hand,false,'easy'),null,'한 줄 28점만 찾고 겹치는 그룹을 되짚지 못함');
  assert.ok(R.checkPlay([],hand,Bot.plan([],hand,false,'normal'),false).ok,'같은 손패로 그룹 세 개 36점 등록 가능');
  assert.deepStrictEqual(Bot.LEVELS,['easy','normal','hard']);
});
ok('쉬움만 수를 놓칠 수 있음: 찾은 첫 등록·승리 수는 보호, 중간·어려움에는 실수 없음', () => {
  const run=[[T(0,1),T(0,2),T(0,3)]],hand=[T(0,4),T(2,11)];
  assert.strictEqual(Bot.plan(run,hand,true,'easy',{rng:()=>0}),null,'붙일 수 있어도 놓쳐서 뽑기');
  assert.ok(R.checkPlay(run,hand,Bot.plan(run,hand,true,'easy',{rng:()=>0.99}),true).ok);
  const noMistakes=()=>{throw Error('이 상황에서는 실수를 굴리지 않아야 함');};
  assert.ok(Bot.plan(run,[T(0,4)],true,'easy',{rng:noMistakes}),'찾은 승리 수를 버리지 않음');
  const opening=[T(0,10),T(0,11),T(0,12),T(2,1)];
  assert.ok(R.checkPlay([],opening,Bot.plan([],opening,false,'easy',{rng:noMistakes}),false).ok);
  for(const level of ['normal','hard'])assert.ok(R.checkPlay(run,hand,Bot.plan(run,hand,true,level,{rng:noMistakes}),true).ok);
});
ok('봇 입력은 읽기 전용: 난이도별 계획이 공개 테이블·자기 손패를 바꾸지 않음', () => {
  const table=Object.freeze([Object.freeze([T(0,3),T(0,4),T(0,5),T(0,6),T(0,7)])]);
  const hand=Object.freeze([T(0,5,1),T(1,9),T(2,9),T(3,9)]);
  for(const level of Bot.LEVELS){const plan=Bot.plan(table,hand,true,level);if(plan)assert.ok(R.checkPlay(table,hand,plan,true).ok);}
});
// levels: 각 판의 참가자 난이도. 이긴 자리 번호를 돌려줌
function selfPlay(levels) {
  const pool = randomPool(R.deckSize(levels.length));
  const ps = levels.map(level => ({ level, rack: pool.splice(0, 14), melded: false }));
  let table = [], turn = 0, passes = 0;
  for (let step = 0; step < 3000; step++) {
    const all=pool.concat(table.flat(),ps.flatMap(p=>p.rack));
    assert.strictEqual(all.length,R.deckSize(levels.length));
    assert.strictEqual(new Set(all).size,all.length,'타일이 사라지거나 중복되지 않음');
    const p = ps[turn];
    const plan = Bot.plan(table, p.rack, p.melded, p.level);
    if (plan) {
      const r = R.checkPlay(table, p.rack, plan, p.melded);
      assert.ok(r.ok, `${p.level}: ${r.reason}`);
      table = r.normalized; p.rack = p.rack.filter(id => !r.played.includes(id)); p.melded = true; passes = 0;
      if (!p.rack.length) return { winner: turn, emptied: true };
    } else if (pool.length) { p.rack.push(pool.pop()); passes = 0; }
    else if (++passes >= ps.length) {
      const pens = ps.map(q => R.penalty(q.rack));
      return { winner: pens.indexOf(Math.min(...pens)), emptied: false };
    }
    turn = (turn + 1) % ps.length;
  }
  throw new Error('판이 끝나지 않음');
}
ok('쉬움·어려움 섞어 40판: 모든 수가 규칙 통과, 모든 판이 끝남', () => {
  const combos = [['easy', 'hard'], ['hard', 'hard', 'easy'], ['easy', 'easy', 'hard', 'hard'], ['hard', 'hard', 'hard', 'hard']];
  for (let g = 0; g < 40; g++) selfPlay(combos[g % combos.length]);
});
ok('확장 어려움: 세 번째 벌을 보존하며 새 조커로 재배치', () => {
  const third=c=>106+c*13+12;
  const table=[0,1].map(k=>[0,1,2,3].map(c=>T(c,13,k))).concat([[0,1,2,3].map(third)]);
  const hand=[158,159];
  const move=Bot.plan(table,hand,true,'hard');
  const result=R.checkPlay(table,hand,move,true);
  assert.ok(result.ok,result.reason);
  assert.strictEqual(result.played.length,2,'조커 두 개를 모두 사용해 승리');
  const fourJ=[157,104,105,158,159];
  const initial=Bot.plan([],fourJ,false,'hard');
  assert.ok(initial && R.checkPlay([],fourJ,initial,false).ok,'조커 4개를 포함한 첫 등록');
});
ok('확장판 5~6인 봇 12판: 타일 보존·합법 수·종료', () => {
  for (let g=0;g<12;g++) selfPlay(Array.from({length:5+g%2},(_,i)=>i%2?'hard':'easy'));
});
ok('어려움이 쉬움보다 확실히 강함 (1:1 30판)', () => {
  let hardWins = 0;
  for (let g = 0; g < 30; g++) {
    const hardFirst = g % 2 === 0;
    const { winner } = selfPlay(hardFirst ? ['hard', 'easy'] : ['easy', 'hard']);
    if ((winner === 0) === hardFirst) hardWins++;
  }
  console.log(`    (어려움 ${hardWins}승 / 30판)`);
  assert.ok(hardWins >= 20, `어려움 승리 ${hardWins}/30`);
});
ok('기본 전략끼리 300판: 모든 수가 규칙 통과, 모든 판이 끝남', () => {
  let finished = 0, emptied = 0;
  for (let g = 0; g < 300; g++) {
    const pool = randomPool(106);
    const ps = Array.from({ length: 2 + (g % 3) }, () => ({ rack: pool.splice(0, 14), melded: false }));
    let table = [], turn = 0, passes = 0;
    for (let step = 0; step < 2000; step++) {
      const p = ps[turn];
      const plan = Bot.plan(table, p.rack, p.melded, 'normal');
      if (plan) {
        const r = R.checkPlay(table, p.rack, plan, p.melded);
        assert.ok(r.ok, r.reason);
        table = r.normalized; p.rack = p.rack.filter(id => !r.played.includes(id)); p.melded = true; passes = 0;
        if (!p.rack.length) { finished++; emptied++; break; }
      } else if (pool.length) { p.rack.push(pool.pop()); passes = 0; }
      else if (++passes >= ps.length) { finished++; break; }
      turn = (turn + 1) % ps.length;
    }
  }
  assert.strictEqual(finished, 300);
  console.log(`    (손패를 다 비워서 끝난 판 ${emptied}/300)`);
});

// ---------- 서버 통합 ----------
async function integration() {
  console.log('서버');
  const { server, rooms } = require('./server.js');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (p, body) => {
    const r = await fetch(`${base}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  };
  // 실패 응답 = 400 { error: 한국어, code, params }
  const failed = (r, code, params = {}, error) => {
    assert.strictEqual(r.status, 400, `${code}: status ${r.status}`);
    assert.strictEqual(r.code, code, `code ${r.code} (${r.error})`);
    assert.deepStrictEqual(r.params, params, `${code} params`);
    assert.ok(typeof r.error === 'string' && r.error, '한국어 문장도 같이');
    if (error !== undefined) assert.strictEqual(r.error, error);
  };
  const human = name => ({ name, botKey: null });   // 기록의 who
  // SSE 구독해서 마지막 상태 저장
  async function listen(s) {
    const res = await fetch(`${base}/api/events?room=${s.room}&token=${s.token}`);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    (async () => {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          let ev = 'message', data = null;
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: ')) ev = line.slice(7);
            else if (line.startsWith('data: ')) data = JSON.parse(line.slice(6));
          }
          if (data == null) continue;
          if (ev === 'chatlog') s.chat = data;
          else if (ev === 'chat') (s.chat = s.chat || []).push(data);
          else if (ev === 'message') s.state = data;
        }
      }
    })().catch(() => {});
    s.close = () => reader.cancel();
  }
  const until = async (fn) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 20)); } throw new Error('timeout'); };

  const page = await fetch(base + '/'); assert.strictEqual(page.status, 200);
  assert.strictEqual((await fetch(base + '/..%2fserver.js')).status, 403);
  {
    const info = await (await fetch(base + '/api/info')).json();
    assert.ok(Array.isArray(info.lan), 'lan 목록');
    for (const u of info.lan) assert.match(u, new RegExp(`^http://\\d+\\.\\d+\\.\\d+\\.\\d+:${server.address().port}$`));
    assert.strictEqual((await fetch(base + '/api/info', { method: 'POST' })).status, 404, 'info는 GET만');
    const QR = require('./public/qr.js');
    const m = QR.matrix('http://192.168.0.31:3000/?r=ABCD');
    assert.strictEqual(m.size, 29, '32글자 주소는 버전 3');
    assert.ok(m.modules[0][0] && !m.modules[1][1] && m.modules[3][3], '찾기 패턴');
    assert.deepStrictEqual(QR._rs([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23], '리드-솔로몬');
    assert.ok(/^<svg[^>]+viewBox="0 0 37 37"/.test(QR.svg('http://192.168.0.31:3000/?r=ABCD')), '여백 4칸');
    ok('GET /api/info (같은 와이파이 주소)·QR 만들기', () => {});
  }

  {
    const practice = await post('create', { name: '연습', mode: 'practice' });
    await listen(practice);
    await until(() => practice.state);
    assert.strictEqual(practice.state.mode, 'practice');
    assert.strictEqual(practice.state.state, 'lobby', '연습도 준비 후에만 시작');
    assert.strictEqual(practice.state.settings.timer, 0);
    const guest = await post('join', { room: practice.room, name: '친구' });
    await listen(guest);
    await until(() => guest.state);
    assert.strictEqual(guest.state.mode, 'practice', '참가자·재접속에도 준비 모드 유지');
    await post('leave', { room: practice.room, token: guest.token });
    guest.close();
    await post('leave', { room: practice.room, token: practice.token });
    practice.close();
    ok('연습 준비 모드·시간 제한 없음·참가자에게 모드 전달', () => {});
  }
  for (const seats of [5,6]) {
    const host = await post('create', { name: '확장 방장' });
    const people = [host];
    for (let i=1;i<seats;i++) people.push(await post('join', {room:host.room,name:'참가자'+i}));
    assert.ok(people.every(p=>p.status===200));
    if (seats===6) {
      failed(await post('join', {room:host.room,name:'일곱째'}), 'roomFull');
      failed(await post('addBot', {room:host.room,token:host.token,level:'hard'}), 'roomFull', {}, '방이 가득 찼어요 (최대 6명)');
    }
    await listen(host);
    await post('start', {room:host.room,token:host.token});
    await until(()=>host.state && host.state.state==='playing');
    assert.strictEqual(host.state.deckSize,160);
    assert.strictEqual(host.state.maxPlayers,6);
    assert.strictEqual(host.state.pool,160-seats*14);
    assert.ok(host.state.players.every(p=>p.count===14 && !('rack' in p) && !('token' in p)));
    const room=rooms.get(host.room);
    const all=room.pool.concat(room.players.flatMap(p=>p.rack));
    assert.strictEqual(all.length,160);
    assert.strictEqual(new Set(all).size,160);
    const seen=new Set();
    for(let i=0;i<seats;i++) {
      const id=host.state.turnId; seen.add(id);
      const p=room.players.find(p=>p.id===id);
      assert.strictEqual((await post('draw',{room:host.room,token:p.token})).status,200);
      await until(()=>host.state.turnId!==id);
    }
    assert.strictEqual(seen.size,seats,'끝자리까지 차례가 한 번씩 돌아옴');
    for(const p of people) await post('leave',{room:host.room,token:p.token});
    assert.ok(rooms.has(host.room) && room.emptySince, '모두 나가도 재입장할 방 보존');
    clearTimeout(room.botTimer); rooms.delete(host.room);
    host.close();
    ok(`${seats}명 온라인: 확장 160개·각 14개·차례 순환·손패 비공개`,()=>{});
  }
  const a = await post('create', { name: '앨리스' });
  const b = await post('join', { room: a.room.toLowerCase(), name: '<b>밥</b>' });
  assert.strictEqual(b.status, 200);
  failed(await post('join', { room: 'ZZZZ', name: 'x' }), 'badCode', {}, '방 코드를 확인해 주세요');
  await listen(a); await listen(b);
  await until(() => a.state && a.state.players.length === 2 && a.state.players.every(p => p.connected));
  assert.strictEqual(a.state.mode, 'friends', '기본은 친구 대기실');
  assert.ok(!a.state.players[1].name.includes('<'), '이름 태그 제거');
  ok('방 만들기·참가·실시간 상태', () => {});
  {
    const old=rooms.get(a.room).settings.timer;
    for(const timer of [null,'37',[],{},-1,4,1801,37.5]){
      const result=await post('settings',{room:a.room,token:a.token,timer});
      assert.strictEqual(result.code,'badTimer');assert.strictEqual(rooms.get(a.room).settings.timer,old);
    }
    for(const timer of [5,37,1800,0]){
      const result=await post('settings',{room:a.room,token:a.token,timer});
      assert.strictEqual(result.status,200);assert.strictEqual(rooms.get(a.room).settings.timer,timer);
    }
    ok('방장 직접 시간: 5~1800초 정수·무제한, 잘못된 입력은 변경 없이 거절',()=>{});
  }
  {
    const bn = a.state.players[1].name;
    assert.deepStrictEqual(a.state.log, [{ k: 'join', p: { who: human(bn) }, t: `${bn}님 입장` }]);
    assert.deepStrictEqual(a.state.players.map(p => p.botKey), [null, null], '사람은 botKey null');
    ok('기록 항목은 {k,p,t} (입장)·players[].botKey', () => {});
  }
  {
    // 오류 code·params (한국어 문장은 예전 그대로)
    failed(await post('hello', { room: 'IIII', token: 'x' }), 'roomNotFound', {}, '방을 찾을 수 없어요');
    failed(await post('hello', { room: a.room, token: 'x' }), 'notMember', {}, '이 방의 참가자가 아니에요');
    failed(await post('addBot', { room: a.room, token: b.token }), 'hostOnly', { what: 'bot' }, '방장만 봇을 넣을 수 있어요');
    failed(await post('settings', { room: a.room, token: b.token, timer: 60 }), 'hostOnly', { what: 'change' }, '방장만 바꿀 수 있어요');
    failed(await post('setBotLevel', { room: a.room, token: b.token, botId: 'x', level: 'hard' }), 'hostOnly', { what: 'change' });
    failed(await post('removeBot', { room: a.room, token: b.token, botId: 'x' }), 'hostOnly', { what: 'remove' }, '방장만 뺄 수 있어요');
    failed(await post('removeBot', { room: a.room, token: a.token, botId: 'x' }), 'botNotFound', {}, '봇을 찾을 수 없어요');
    failed(await post('draw', { room: a.room, token: a.token }), 'notPlaying', {}, '게임 중이 아니에요');
    const fake = { state: 'lobby', players: [], lastActivity: Date.now() };
    const fakes = Array.from({ length: 501 }, (_, i) => `FAKE${i}`);
    for (const k of fakes) rooms.set(k, fake);
    try { failed(await post('create', { name: 'x' }), 'serverBusy', {}, '서버에 방이 너무 많아요'); }
    finally { for (const k of fakes) rooms.delete(k); }
    ok('오류 응답 code·params: 방·참가자·방장만·봇 없음·게임 중 아님·서버 가득', () => {});
  }

  // 채팅
  assert.deepStrictEqual(a.chat, [], '처음 접속하면 빈 대화 기록');
  const say = (who, text) => post('chat', { room: a.room, token: who.token, text });
  assert.strictEqual((await say(a, '안녕하세요 <b>반가워요</b>')).status, 200);
  await until(() => b.chat.length === 1 && a.chat.length === 1);
  assert.strictEqual(b.chat[0].text, '안녕하세요 <b>반가워요</b>', '글자는 그대로 (화면에서 textContent로 표시)');
  assert.strictEqual(b.chat[0].name, '앨리스');
  assert.strictEqual(b.chat[0].from, a.state.me.id);
  assert.ok(b.chat[0].botKey === null && b.chat[0].key === undefined && b.chat[0].i === undefined, '사람 말에는 봇 줄 표시 없음');
  failed(await say(b, '   '), 'emptyMessage', {}, '메시지를 입력해 주세요');
  failed(await post('chat', { room: a.room, token: 'nope', text: 'x' }), 'notMember');
  const long = await say(b, 'ㄱ'.repeat(300) + '\u2028\n끝');
  assert.strictEqual(long.status, 200);
  await until(() => a.chat.length === 2);
  assert.strictEqual(a.chat[1].text.length, 100, '100자로 자름');
  assert.ok(!/[\n\u2028]/.test(a.chat[1].text), '줄바꿈·제어 문자 제거');
  let limited = 0;
  for (let i = 0; i < 8; i++) {
    const r = await say(a, `도배 ${i}`);
    if (r.status === 400) { limited++; failed(r, 'tooFast', {}, '너무 빨라요. 잠시 후 다시 보내 주세요'); }
  }
  assert.ok(limited > 0, '너무 빨리 보내면 막힘');
  ok('채팅 보내기·받기·길이 제한·도배 방지', () => {});
  // 새로 접속(새로고침)하면 대화 기록을 한 번에 받음
  const a2 = { room: a.room, token: a.token };
  await listen(a2);
  await until(() => a2.chat && a2.chat.length === a.chat.length);
  a2.close();
  ok('새로고침해도 대화 기록 유지', () => {});

  failed(await post('start', { room: a.room, token: b.token }), 'hostOnly', { what: 'start' }, '방장만 시작할 수 있어요');
  await post('start', { room: a.room, token: a.token });
  await until(() => a.state.state === 'playing' && b.state.state === 'playing');
  assert.strictEqual(a.state.me.rack.length, 14);
  assert.strictEqual(a.state.pool, 106 - 28);
  assert.ok(!JSON.stringify(a.state).includes('"rack":' + JSON.stringify(b.state.me.rack)), '남의 손패는 안 보임');
  ok('게임 시작·14장 분배·손패 비공개', () => {});
  const nameOf = id => a.state.players.find(p => p.id === id).name;
  {
    const fn = nameOf(a.state.turnId);
    assert.deepStrictEqual(a.state.log, [{ k: 'start', p: { round: 1, who: human(fn) }, t: `1번째 게임 시작! ${fn}님부터` }], '새 판은 기록을 새로');
    failed(await post('start', { room: a.room, token: a.token }), 'alreadyPlaying', {}, '이미 진행 중이에요');
    failed(await post('join', { room: a.room, name: '셋' }), 'alreadyPlaying', {}, '이미 게임이 진행 중이에요');
    failed(await post('settings', { room: a.room, token: a.token, timer: 60 }), 'notDuringGame', { what: 'change' }, '게임 중에는 바꿀 수 없어요');
    failed(await post('setBotLevel', { room: a.room, token: a.token, botId: 'x', level: 'hard' }), 'notDuringGame', { what: 'change' });
    failed(await post('addBot', { room: a.room, token: a.token }), 'notDuringGame', { what: 'bot' }, '게임 중에는 넣을 수 없어요');
    failed(await post('removeBot', { room: a.room, token: a.token, botId: 'x' }), 'notDuringGame', { what: 'remove' }, '게임 중에는 뺄 수 없어요');
    ok('기록: 게임 시작 {k,p,t} · 게임 중 오류 code·params', () => {});
  }

  const room = rooms.get(a.room);
  const who = () => (a.state.turnId === a.state.me.id ? [a, b] : [b, a]);
  let [cur, other] = who();
  failed(await post('draw', { room: a.room, token: other.token }), 'notYourTurn', {}, '내 차례가 아니에요');

  // 서버 상태를 직접 조작해 승리 장면 재현: 현재 플레이어 손패를 10·10·10 그룹 하나로
  const curP = room.players.find(p => p.token === cur.token);
  const all = new Set(room.players.flatMap(p => p.rack).concat(room.pool));
  const pick = [T(0, 10), T(1, 10), T(2, 10)];
  for (const id of pick) assert.ok(all.has(id));
  for (const p of room.players) p.rack = p.rack.filter(id => !pick.includes(id));
  room.pool = room.pool.filter(id => !pick.includes(id));
  curP.rack.push(...pick);
  const bad = await post('play', { room: a.room, token: cur.token, table: [[T(0, 10), T(1, 10)]] });
  failed(bad, 'rule', { rule: 'setInvalid', index: 1, sub: 'tooFew' }, '1번째 묶음: 묶음은 3개 이상이어야 해요');
  failed(await post('play', { room: a.room, token: cur.token, table: [[T(0, 10), T(1, 10), T(2, 10), T(3, 10), T(3, 10)]] }), 'rule', { rule: 'badRequest' }, '잘못된 요청');
  ok('규칙 위반 응답: code rule + checkPlay code·params', () => {});
  const extra = curP.rack.filter(id => !pick.includes(id));
  const curName = nameOf(cur.state.me.id), otherName = nameOf(other.state.me.id);
  // 손패가 남은 상태에서 첫 등록
  const r1 = await post('play', { room: a.room, token: cur.token, table: [pick] });
  assert.strictEqual(r1.status, 200, r1.error);
  await until(() => cur.state.turnId === other.state.me.id);
  assert.strictEqual(cur.state.me.rack.length, extra.length);
  assert.deepStrictEqual(cur.state.log.at(-1), { k: 'play', p: { who: human(curName), n: 3, meld: 30 }, t: `${curName}님이 3개를 내려놓았어요 (첫 등록 30점)` });
  ok('첫 등록 성공·차례 넘어감 (기록 play·meld)', () => {});

  // 상대는 뽑기
  const before = other.state.me.rack.length;
  await post('draw', { room: a.room, token: other.token });
  await until(() => other.state.me.rack.length === before + 1 && other.state.turnId === cur.state.me.id);
  assert.deepStrictEqual(other.state.log.at(-1), { k: 'draw', p: { who: human(otherName), why: null }, t: `${otherName}님이 타일을 뽑았어요` });
  ok('뽑기 (기록 draw)', () => {});

  // 현재 플레이어 손패를 테이블에 붙일 수 있는 1장(빨강 10의 다른 색=검정 10)만 남기기
  const last = T(3, 10);
  for (const p of room.players) p.rack = p.rack.filter(id => id !== last);
  room.pool = room.pool.filter(id => id !== last);
  curP.rack = [last];
  const win = await post('play', { room: a.room, token: cur.token, table: [[...pick, last]] });
  assert.strictEqual(win.status, 200, win.error);
  await until(() => a.state.state === 'ended' && b.state.state === 'ended');
  assert.strictEqual(a.state.result[0].id, cur.state.me.id);
  assert.ok(a.state.result[0].delta > 0);
  assert.deepStrictEqual(a.state.log.slice(-2), [
    { k: 'play', p: { who: human(curName), n: 1, meld: null }, t: `${curName}님이 1개를 내려놓았어요` },
    { k: 'win', p: { who: human(curName) }, t: `🏆 ${curName}님 승리!` },
  ]);
  assert.deepStrictEqual(a.state.log.map(e => e.k), ['start', 'play', 'draw', 'play', 'win']);
  assert.ok(a.state.result.every(r => r.botKey === null));
  failed(await post('draw', { room: a.room, token: cur.token }), 'notPlaying');
  ok('승리·점수 계산 (기록 play·win)', () => {});

  // 기록·시상식·판 기록
  {
    const st = curP.stats, ot = room.players.find(p => p !== curP).stats;
    assert.deepStrictEqual([st.played, st.turnsPlayed, st.best, st.rearranged, st.firstMeldValue], [4, 2, 3, 0, 30], '끝에 붙여 늘린 건 재건축이 아님');
    assert.ok(st.firstMeldTurn >= 1);
    assert.deepStrictEqual([ot.draws, ot.maxRack, ot.firstMeldTurn], [1, Math.max(14, before + 1), null]);
    const aw = a.state.awards;
    assert.strictEqual(aw.length, a.state.players.length, '한 사람에 하나씩');
    assert.deepStrictEqual(aw.map(x => [x.id, x.key]), [[cur.state.me.id, 'win'], [other.state.me.id, 'together']]);
    assert.strictEqual(aw[0].title, '승리');
    assert.deepStrictEqual(aw.map(x => [x.key, x.dk, x.params, x.detail, x.botKey]), [
      ['win', 'out', {}, '손패를 모두 내려놓았어요', null],
      ['together', 'stayed', {}, '끝까지 함께했어요', null],
    ], '시상 key·dk·params + 한국어 설명');
    assert.deepStrictEqual(a.state.history[0].botKeys, {});
    assert.strictEqual(a.state.result.reduce((s, r) => s + r.delta, 0), 0, '점수 합 0');
    assert.strictEqual(a.state.history.length, 1);
    assert.deepStrictEqual(a.state.history[0].deltas, Object.fromEntries(a.state.result.map(r => [r.id, r.delta])));
    assert.ok(a.state.players.every(p => p.offFor === 0 && p.graceLeft === null));
  }
  ok('한 판 기록·시상식(한 사람에 하나)·판 기록', () => {});

  // 타이머 설정 + 한 판 더
  await post('settings', { room: a.room, token: a.token, timer: 60 });
  await post('start', { room: a.room, token: a.token });
  await until(() => a.state.state === 'playing' && a.state.round === 2 && a.state.deadline > 0);
  assert.strictEqual(a.state.awards, null, '게임 중엔 시상식 없음');
  assert.strictEqual(a.state.history.length, 1, '판 기록은 한 판 더에도 유지');
  ok('한 판 더·턴 타이머', () => {});
  {
    // 시간 초과 → 자동 뽑기 (why 'timeout'), 더미가 비면 패스
    const r2 = rooms.get(a.room);
    const p0 = r2.players[r2.turn];
    r2.deadline = Date.now() - 1;
    const isTimeout = e => e.k === 'draw' && e.p.why === 'timeout';
    await until(() => a.state.log.some(isTimeout));
    assert.deepStrictEqual(a.state.log.find(isTimeout), { k: 'draw', p: { who: human(p0.name), why: 'timeout' }, t: `${p0.name}님이 타일을 뽑았어요 (시간 초과)` });
    const keep = r2.pool;
    r2.pool = [];
    const p1 = r2.players[r2.turn];
    assert.notStrictEqual(p1, p0);
    assert.strictEqual((await post('draw', { room: a.room, token: p1.token })).status, 200);
    await until(() => a.state.log.some(e => e.k === 'pass'));
    assert.deepStrictEqual(a.state.log.find(e => e.k === 'pass'), { k: 'pass', p: { who: human(p1.name), why: null }, t: `${p1.name}님 패스` });
    r2.pool = keep;
    ok('기록: 시간 초과 뽑기(why timeout)·더미가 비면 패스', () => {});
  }

  // 진행 중 나가기 → 자리를 유지하고 대타 봇이 이어받음
  const bName = nameOf(b.state.me.id);
  const bSeat = rooms.get(a.room).players.find(p => p.id === b.state.me.id);
  const bRack = bSeat.rack.slice(), oldPool = rooms.get(a.room).pool.slice();
  const takeoverBot = require('./server.js').BOT, oldThink = takeoverBot.think;
  takeoverBot.think = 60000;
  await post('leave', { room: a.room, token: b.token });
  await until(() => a.state.players.some(p => p.id === bSeat.id && p.takeover === 'left'));
  assert.strictEqual(a.state.state, 'playing');
  assert.strictEqual(a.state.players.length, 2);
  assert.deepStrictEqual(bSeat.rack, bRack);
  assert.deepStrictEqual(rooms.get(a.room).pool, oldPool);
  assert.deepStrictEqual(a.state.log.find(e => e.k === 'botTakeover'), { k: 'botTakeover', p: { who: human(bName), why: 'left' }, t: `${bName}님의 자리를 대타 봇이 이어받았어요` });
  assert.strictEqual((await post('hello', { room:a.room, token:b.token })).status, 200);
  failed(await post('draw', { room:a.room, token:b.token }), 'notMember');
  const resumed = await post('join', { room:a.room.toLowerCase(), token:b.token });
  assert.strictEqual(resumed.status, 200); assert.strictEqual(resumed.resumed, true);
  assert.ok(bSeat.bot, '참가 확인만으로 봇을 멈추지 않음');
  await listen(b);
  await until(() => bSeat.connected && !bSeat.bot);
  assert.strictEqual(b.state.me.id, bSeat.id);
  assert.deepStrictEqual(b.state.me.rack, bRack);
  await post('leave', { room:a.room, token:b.token });
  ok('나간 뒤 방 코드·저장된 참가 정보로 원래 자리와 손패 복귀', () => {});
  await post('leave', { room: a.room, token: a.token });
  assert.ok(rooms.has(a.room) && rooms.get(a.room).emptySince);
  clearTimeout(rooms.get(a.room).botTimer); rooms.delete(a.room);
  takeoverBot.think = oldThink;
  ok('나가기 처리: 손패를 보존하고 대타 봇으로 전환', () => {});

  a.close(); b.close();

  // 연결 끊김: offFor / graceLeft (타이머 없는 판에서 끊긴 현재 차례 사람)
  {
    const g1 = await post('create', { name: '하나' });
    const g2 = await post('join', { room: g1.room, name: '둘' });
    await listen(g1); await listen(g2);
    await until(() => g1.state && g1.state.players.length === 2 && g1.state.players.every(p => p.connected));
    await post('start', { room: g1.room, token: g1.token });
    await until(() => g1.state.state === 'playing' && g2.state.state === 'playing');
    const [gc, go] = g1.state.turnId === g1.state.me.id ? [g1, g2] : [g2, g1];
    const curId = gc.state.me.id;
    gc.close();
    await until(() => go.state.players.find(p => p.id === curId).connected === false);
    const cp = go.state.players.find(p => p.id === curId), op = go.state.players.find(p => p.id !== curId);
    assert.ok(cp.graceLeft >= 43 && cp.graceLeft <= 45, `graceLeft ${cp.graceLeft}`);
    assert.strictEqual(op.graceLeft, null);
    assert.ok(cp.offFor >= 0 && cp.offFor <= 1 && op.offFor === 0);
    const gr = rooms.get(g1.room), gp = gr.players.find(p => p.id === curId);
    gp.disconnectedAt -= 10000; gr.turnStartedAt -= 10000;   // 10초 전에 끊긴 것으로
    await until(() => { const q = go.state.players.find(p => p.id === curId); return q.offFor >= 10 && q.graceLeft <= 35; });   // 1초마다 다시 보냄
    ok('연결 끊김: offFor·graceLeft가 자동 진행까지 줄어듦', () => {});
    const graceBot = require('./server.js').BOT, savedThink = graceBot.think;
    graceBot.think = 60000;
    gp.disconnectedAt -= 40000; gr.turnStartedAt -= 40000;   // 50초 전 → 대타 봇으로 전환
    const isOff = e => e.k === 'botTakeover' && e.p.why === 'offline';
    await until(() => go.state.log.some(isOff));
    assert.deepStrictEqual(go.state.log.find(isOff), { k: 'botTakeover', p: { who: human(gp.name), why: 'offline' }, t: `${gp.name}님의 자리를 대타 봇이 이어받았어요` });
    await listen(gc);
    await until(() => !gp.bot && gp.connected);
    graceBot.think = savedThink;
    await post('leave', { room: g1.room, token: go.token });
    await post('leave', { room: g1.room, token: gc.token });
    clearTimeout(gr.botTimer); rooms.delete(g1.room);
    go.close();
    gc.close();
    ok('연결 끊김 45초 뒤 대타 봇 전환·재접속 복귀', () => {});
  }

  // 봇과 한 판: 사람은 계속 뽑기만 해도 게임이 끝까지 진행되어야 함
  const { BOT, planBot, BOT_LINES, makeAwards, newStats } = require('./server.js');
  {
    // 시상: 모든 상의 key·dk·params와 한국어 설명 (가짜 방으로 바로 계산)
    const mk = (id, extra, rackLen = 10, botKey) => ({ id, name: id, bot: !!botKey, botKey, rack: Array(rackLen).fill(0), stats: Object.assign(newStats(), extra) });
    const players = [
      mk('W', {}, 0), mk('A', { rearranged: 3 }), mk('B', { best: 6 }), mk('C', { firstMeldTurn: 2, firstMeldValue: 35 }), mk('D', { jokers: 2 }),
      mk('E', { maxRack: 20 }), mk('F', { draws: 5 }), mk('G', { played: 4 }), mk('H', {}, 10, 'cube'),
    ];
    const aw = makeAwards({ players }, players[0]);
    assert.deepStrictEqual(aw.map(x => [x.name, x.key, x.dk, x.params, x.detail]), [
      ['W', 'win', 'out', {}, '손패를 모두 내려놓았어요'],
      ['A', 'rebuild', 'd', { n: 3 }, '테이블 묶음 3개를 다시 짰어요'],
      ['B', 'bigHand', 'd', { n: 6 }, '한 번에 6장!'],
      ['C', 'firstFruit', 'd', { value: 35 }, '가장 먼저 첫 등록 (35점)'],
      ['D', 'joker', 'd', { n: 2 }, '조커 2장을 멋지게 썼어요'],
      ['E', 'comeback', 'd', { from: 20, to: 10 }, '손패 20장에서 10장까지 줄였어요'],
      ['F', 'endure', 'd', { n: 5 }, '5번 뽑으며 버텼어요'],
      ['G', 'together', 'played', { n: 4 }, '타일 4장을 내려놓았어요'],
      ['H', 'together', 'stayed', {}, '끝까지 함께했어요'],
    ]);
    assert.deepStrictEqual(aw.map(x => x.title), ['승리', '재건축왕', '한 방의 손', '첫 열매', '조커의 달인', '부활의 손', '끈기상', '함께해서 기뻐요', '함께해서 기뻐요']);
    assert.deepStrictEqual(aw.map(x => x.botKey), [null, null, null, null, null, null, null, null, 'cube']);
    const aw2 = makeAwards({ players: players.slice(1, 3) }, players[1]);
    assert.deepStrictEqual([aw2[0].key, aw2[0].dk, aw2[0].params, aw2[0].detail], ['win', 'fewest', {}, '남은 타일이 가장 적었어요']);
    ok('시상 key·dk·params (모든 상) + 한국어 설명 그대로', () => {});
  }
  {
    // 작업 스레드가 실제로 어려움 전략을 쓰는지: 기본 전략(대체 경로)은 이 판에서 null을 냄
    const table = [[T(0, 1), T(0, 2), T(0, 3)], [T(1, 1), T(1, 2), T(1, 3)], [T(2, 1), T(2, 2), T(2, 3)]];
    const hand = [T(3, 1), T(3, 2), T(1, 9)];
    const viaWorker = await planBot({ table, rack: hand, melded: true, level: 'hard' });
    assert.ok(viaWorker && R.checkPlay(table, hand, viaWorker, true).ok, '작업 스레드 결과');
    ok('봇 작업 스레드가 어려움 전략으로 계산', () => {});
  }
  BOT.think = 5; BOT.show = 5; BOT.chat = 5;
  {
    const six=await post('create',{name:'6인 연습'});
    for(const level of ['easy','hard','easy','hard','easy']) await post('addBot',{room:six.room,token:six.token,level});
    await listen(six);
    await until(()=>six.state && six.state.players.length===6);
    await post('start',{room:six.room,token:six.token});
    await until(()=>six.state.state==='playing');
    for(let i=0;i<5000 && six.state.state!=='ended';i++) {
      if(six.state.turnId===six.state.me.id) await post('draw',{room:six.room,token:six.token});
      await new Promise(r=>setTimeout(r,5));
    }
    assert.strictEqual(six.state.state,'ended','6인 봇 서버 게임 종료');
    assert.strictEqual(six.state.result.length,6);
    assert.strictEqual(six.state.awards.length,6);
    assert.strictEqual(six.state.deckSize,160);
    await post('leave',{room:six.room,token:six.token}); six.close();
    assert.ok(!rooms.has(six.room));
    ok('5명 봇+사람: 작업 스레드로 실제 6인 판 종료·결과·시상·방 정리',()=>{});
  }
  const h = await post('create', { name: '혼자' });
  failed(await post('start', { room: h.room, token: h.token }), 'needTwo', {}, '2명 이상이어야 시작할 수 있어요');
  for (const level of ['easy', 'normal', 'hard']) assert.strictEqual((await post('addBot', { room: h.room, token: h.token, level })).status, 200);
  await listen(h);
  await until(() => h.state && h.state.players.length === 4 && h.state.players.filter(p => p.bot).length === 3);
  await until(() => (h.chat || []).filter(m => m.bot).length === 3);
  ok('봇이 들어오며 인사', () => {});
  {
    const hello = h.chat.filter(m => m.bot);
    for (const m of hello) {
      assert.strictEqual(m.key, 'hello');
      assert.ok(Number.isInteger(m.i) && m.i >= 0 && m.i < BOT_LINES.hello.length, `i ${m.i}`);
      assert.strictEqual(m.text, BOT_LINES.hello[m.i], '한국어 대비 문장 = 같은 줄');
    }
    assert.deepStrictEqual(hello.map(m => m.botKey).sort(), ['cube', 'rumi', 'tile']);
    assert.deepStrictEqual(h.state.players.map(p => p.botKey), [null, 'rumi', 'cube', 'tile']);
    assert.deepStrictEqual(h.state.players.map(p => p.name), ['혼자', '로봇 루미', '로봇 큐브', '로봇 타일'], '한국어 이름은 그대로');
    const bj = h.state.log.filter(e => e.k === 'botJoin');
    assert.deepStrictEqual(bj.map(e => [e.p.who, e.p.level]), [
      [{ name: '로봇 루미', botKey: 'rumi' }, 'easy'], [{ name: '로봇 큐브', botKey: 'cube' }, 'normal'], [{ name: '로봇 타일', botKey: 'tile' }, 'hard'],
    ]);
    assert.deepStrictEqual(bj.map(e => e.t), ['로봇 루미 참가 (쉬움)', '로봇 큐브 참가 (중간)', '로봇 타일 참가 (어려움)']);
    ok('봇 botKey·인사 줄 key/i·봇 참가 기록(botJoin)', () => {});
  }
  assert.deepStrictEqual(h.state.players.slice(1).map(p => p.level), ['easy', 'normal', 'hard']);
  const bot3 = h.state.players[3].id, bot1 = h.state.players[1].id;
  await post('removeBot', { room: h.room, token: h.token, botId: bot3 });
  await until(() => h.state.players.length === 3);
  await post('setBotLevel', { room: h.room, token: h.token, botId: bot1, level: 'hard' });
  await until(() => h.state.players[1].level === 'hard');
  for (const level of ['god', 'toString', '__proto__', ['hard']])
    failed(await post('setBotLevel', { room: h.room, token: h.token, botId: bot1, level }), 'badLevel', {}, '난이도를 확인해 주세요');
  failed(await post('setBotLevel', { room: h.room, token: h.token, botId: 'nope', level: 'hard' }), 'botNotFound');
  await post('addBot', { room: h.room, token: h.token, level: 'toString' });
  await until(() => h.state.players.length === 4);
  assert.strictEqual(h.state.players[3].level, 'easy', '이상한 난이도는 쉬움으로');
  assert.deepStrictEqual([h.state.players[3].name, h.state.players[3].botKey], ['로봇 타일', 'tile'], '빈 이름을 다시 씀');
  await post('removeBot', { room: h.room, token: h.token, botId: h.state.players[3].id });
  await until(() => h.state.players.length === 3);
  ok('봇 추가(난이도별)·난이도 바꾸기·빼기', () => {});
  await post('start', { room: h.room, token: h.token });
  for (let i = 0; i < 3000 && (!h.state || h.state.state !== 'ended'); i++) {
    if (h.state.state === 'playing' && h.state.turnId === h.state.me.id) await post('draw', { room: h.room, token: h.token });
    await new Promise(r => setTimeout(r, 5));
  }
  assert.strictEqual(h.state.state, 'ended', '봇 게임이 끝나지 않음');
  ok(`어려움 봇 둘과 한 판 끝까지, 작업 스레드 사용 (승자: ${h.state.result[0].name})`, () => {});
  {
    // 끝나면 봇이 한마디 (이긴 봇: win / 사람이 이기면 다른 봇: congrats)
    const endKey = h.state.result[0].botKey ? 'win' : 'congrats';
    await until(() => h.chat.some(m => m.key === endKey));
    const m = h.chat.find(x => x.key === endKey);
    assert.ok(m.bot && Number.isInteger(m.i) && m.text === BOT_LINES[endKey][m.i]);
    if (endKey === 'win') assert.strictEqual(m.from, h.state.result[0].id, '이긴 봇이 말함');
    const winLog = h.state.log.at(-1);
    assert.deepStrictEqual([winLog.k, winLog.p.who], ['win', { name: h.state.result[0].name, botKey: h.state.result[0].botKey }]);
    assert.ok(h.state.result.every(r => r.botKey === h.state.players.find(p => p.id === r.id).botKey), 'result에도 botKey');
    assert.deepStrictEqual(h.state.history[0].botKeys, Object.fromEntries(h.state.players.filter(p => p.bot).map(p => [p.id, p.botKey])));
    ok(`게임 끝 봇 한마디 key/i (${endKey})·승리 기록 who.botKey`, () => {});
  }
  {
    const AWARD_KO = {   // 화면 사전 키 award.<key>.<dk>
      'win.out': () => '손패를 모두 내려놓았어요', 'win.fewest': () => '남은 타일이 가장 적었어요',
      'together.played': q => `타일 ${q.n}장을 내려놓았어요`, 'together.stayed': () => '끝까지 함께했어요',
      'rebuild.d': q => `테이블 묶음 ${q.n}개를 다시 짰어요`, 'bigHand.d': q => `한 번에 ${q.n}장!`, 'firstFruit.d': q => `가장 먼저 첫 등록 (${q.value}점)`,
      'joker.d': q => `조커 ${q.n}장을 멋지게 썼어요`, 'comeback.d': q => `손패 ${q.from}장에서 ${q.to}장까지 줄였어요`, 'endure.d': q => `${q.n}번 뽑으며 버텼어요`,
    };
    const checkAwards = st => {
      for (const x of st.awards) {
        assert.strictEqual(x.botKey, st.players.find(p => p.id === x.id).botKey, 'award botKey');
        const dks = { win: [st.result[0].rack.length ? 'fewest' : 'out'], together: ['played', 'stayed'] }[x.key] || ['d'];
        assert.ok(dks.includes(x.dk), `${x.key} dk ${x.dk}`);
        assert.ok(x.params && typeof x.params === 'object');
        assert.strictEqual(x.detail, AWARD_KO[`${x.key}.${x.dk}`](x.params), `${x.key}: params로 만든 문장 = 한국어 설명`);
      }
      assert.strictEqual(st.awards.length, st.players.length, '한 사람에 하나씩');
      assert.deepStrictEqual([...st.awards.map(x => x.id)].sort(), st.players.map(p => p.id).sort(), '모두 받음');
      assert.strictEqual(st.awards[0].key, 'win'); assert.strictEqual(st.awards[0].id, st.result[0].id);
      const special = st.awards.filter(x => x.key !== 'together').map(x => x.title);
      assert.strictEqual(new Set(special).size, special.length, '같은 상은 한 번만 (함께해서 기뻐요 빼고)');
      assert.ok(st.awards.every(x => x.emoji && x.title && x.detail && x.name));
      assert.strictEqual(st.result.reduce((s, r) => s + r.delta, 0), 0, '점수 합 0');
    };
    checkAwards(h.state);
    assert.strictEqual(h.state.history.length, 1);
    // 한 판 더: 사람 차례가 오면 손패를 이길 수 있게 바꿔서 빨리 끝냄
    const hr = rooms.get(h.room);
    await post('start', { room: h.room, token: h.token });
    await until(() => h.state.state === 'playing' && h.state.round === 2);
    for (let i = 0; i < 3000 && h.state.turnId !== h.state.me.id; i++) await new Promise(r => setTimeout(r, 5));
    const hp = hr.players.find(p => p.token === h.token);
    const onTable = new Set(hr.table.flat());
    let win = null;
    for (const num of [13, 12, 11, 10]) {
      const ids = [0, 1, 2, 3].map(c => [T(c, num), T(c, num, 1)].find(id => !onTable.has(id))).filter(id => id != null).slice(0, 3);
      if (ids.length === 3) { win = ids; break; }
    }
    for (const p of hr.players) p.rack = p.rack.filter(id => !win.includes(id));
    hr.pool = hr.pool.filter(id => !win.includes(id));
    hp.rack = win.slice();
    const rw = await post('play', { room: h.room, token: h.token, table: [...hr.table, win] });
    assert.strictEqual(rw.status, 200, rw.error);
    await until(() => h.state.state === 'ended' && h.state.round === 2);
    checkAwards(h.state);
    assert.strictEqual(h.state.awards[0].id, h.state.me.id);
    assert.strictEqual(h.state.history.length, 2, '한 판 더 하면 판 기록이 늘어남');
    assert.deepStrictEqual(h.state.history.map(x => x.round), [1, 2]);
    ok('봇 판 시상식·한 판 더 후 판 기록 누적', () => {});
  }
  await post('leave', { room: h.room, token: h.token });
  assert.ok(!rooms.has(h.room), '사람이 다 나가면 방 삭제');
  ok('사람이 다 나가면 봇 방 정리', () => {});
  h.close();
  {
    const r = await post('create', { name: '로봇 루미' });
    assert.strictEqual((await post('addBot', { room: r.room, token: r.token, level: 'hard' })).status, 200);
    await listen(r);
    await until(() => r.state && r.state.players.length === 2);
    assert.deepStrictEqual(r.state.players.map(p => [p.name, p.bot, p.botKey]), [['로봇 루미', false, null], ['로봇 큐브', true, 'cube']]);
    assert.deepStrictEqual(r.state.log.map(e => [e.k, e.p.who]), [['botJoin', { name: '로봇 큐브', botKey: 'cube' }]]);
    await post('leave', { room: r.room, token: r.token });
    r.close();
    ok('사람 이름이 봇 이름과 같아도 botKey는 봇에게만', () => {});
  }
  server.close(); server.closeAllConnections();
}

integration().then(() => { console.log(`\n모두 통과 (${n}개)`); process.exit(0); })
  .catch(e => { console.error('\n실패:', e); process.exit(1); });
