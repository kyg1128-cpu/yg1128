// 루미큐브 규칙 판정 — 서버(node)와 브라우저가 같은 파일을 씁니다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RummiRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STANDARD_TILE_COUNT = 106;
  const TILE_COUNT = 160;          // 확장: 3벌 + 조커 4 (기존 0~105 ID는 그대로)
  const MAX_PLAYERS = 6;
  const deckSize = players => players >= 5 ? TILE_COUNT : STANDARD_TILE_COUNT;
  const JOKER_PENALTY = 30;
  const INITIAL_MELD = 30;
  const COLOR_NAMES = ['빨강', '파랑', '노랑', '검정'];

  function tile(id) {
    if (id === 104 || id === 105 || id >= 158) return { id, joker: true, color: -1, num: 0 };
    if (id >= 106) return { id, joker: false, color: Math.floor((id - 106) / 13), num: (id - 106) % 13 + 1 };
    return { id, joker: false, color: Math.floor(id / 26), num: (Math.floor(id / 2) % 13) + 1 };
  }

  // 실패 이유는 code + params로도 줌 (화면이 자기 언어로 그림). reason은 예전 한국어 문장 그대로(서버·테스트가 씀).
  // analyze 실패 code: 'tooFew' {n, min} | 'jokersOnly' | 'notSet'
  // checkPlay 실패 code: 'badRequest' | 'tableToRack' | 'notYours' | 'playOne' | 'setInvalid' {index(1부터), sub: analyze code}
  //                      | 'meldLocked' | 'meldLow' {need, have}
  // (봇이 analyze를 아주 많이 부르므로 빈 params는 얼린 객체 하나를 같이 씀)
  const NOPARAMS = Object.freeze({});
  const TOO_FEW = [0, 1, 2].map(n => Object.freeze({ n, min: 3 }));
  const no = (code, reason, params) => ({ ok: false, reason, code, params: params || NOPARAMS });

  // 한 묶음(set)이 유효한지 판정. 유효하면 정렬 순서와 점수(조커는 대신하는 숫자)를 돌려줌.
  function analyze(ids) {
    const n = ids.length;
    if (n < 3) return no('tooFew', '묶음은 3개 이상이어야 해요', TOO_FEW[n]);
    const tiles = ids.map(tile);
    const reg = tiles.filter(t => !t.joker);
    const jokers = tiles.filter(t => t.joker);
    if (reg.length === 0) return no('jokersOnly', '조커만으로는 묶음을 만들 수 없어요');
    let best = null;

    // 그룹: 같은 숫자, 서로 다른 색, 3~4개
    const num = reg[0].num;
    if (n <= 4 && reg.every(t => t.num === num) && new Set(reg.map(t => t.color)).size === reg.length) {
      const order = reg.slice().sort((a, b) => a.color - b.color).map(t => t.id).concat(jokers.map(t => t.id));
      const jokerAs = {};
      jokers.forEach(j => { jokerAs[j.id] = num; });
      best = { ok: true, kind: 'group', value: num * n, order, jokerAs };
    }

    // 런: 같은 색, 연속 숫자(1~13, 13→1 연결 없음)
    const color = reg[0].color;
    const nums = reg.map(t => t.num);
    if (n <= 13 && reg.every(t => t.color === color) && new Set(nums).size === nums.length) {
      const min = Math.min(...nums), max = Math.max(...nums);
      if (max - min + 1 <= n) {
        const start = Math.min(min, 14 - n);
        const byNum = new Map(reg.map(t => [t.num, t.id]));
        const js = jokers.map(t => t.id);
        const order = [], jokerAs = {};
        let value = 0;
        for (let v = start; v < start + n; v++) {
          value += v;
          if (byNum.has(v)) order.push(byNum.get(v));
          else { const j = js.shift(); jokerAs[j] = v; order.push(j); }
        }
        if (!best || value > best.value) best = { ok: true, kind: 'run', value, order, jokerAs };
      }
    }
    return best || no('notSet', '같은 숫자 다른 색(그룹) 또는 같은 색 연속 숫자(런)가 아니에요');
  }

  const setKey = s => s.slice().sort((a, b) => a - b).join(',');

  // 묶음이 왜 아직 안 맞는지 (화면 안내용 — analyze()의 reason은 서버·테스트가 쓰므로 그대로 둠). 맞는 묶음이면 null.
  // explainCode(ids) → null | { code, params }  — 화면이 자기 언어로 그림
  //   needMore {n} | jokersOnly | groupMax4 | sameColor {tile} | dupNum {tile} | gap {color, nums} | runMax13 | mixed
  //   tile = { color: 0~3, num }   (타일 이름은 화면이 언어별로: '빨강 5' / 'red 5')
  // explain(ids) → 위 결과를 한국어 문장으로 (예전과 같은 문장)
  function explainCode(ids) {
    const n = ids.length;
    if (n < 3) return { code: 'needMore', params: { n: 3 - n } };
    const reg = ids.map(tile).filter(t => !t.joker);
    if (!reg.length) return { code: 'jokersOnly', params: {} };
    if (analyze(ids).ok) return null;
    const sameNum = reg.every(t => t.num === reg[0].num);
    const sameColor = reg.every(t => t.color === reg[0].color);
    const tp = t => ({ tile: { color: t.color, num: t.num } });
    if (sameNum) {
      if (n > 4) return { code: 'groupMax4', params: {} };
      const seen = new Set();
      for (const t of reg) { if (seen.has(t.color)) return { code: 'sameColor', params: tp(t) }; seen.add(t.color); }
    }
    if (sameColor) {
      const seen = new Set();
      for (const t of reg) {
        if (seen.has(t.num)) return { code: 'dupNum', params: tp(t) };
        seen.add(t.num);
      }
      const nums = reg.map(t => t.num).sort((a, b) => a - b);
      if (nums[nums.length - 1] - nums[0] + 1 > n) return { code: 'gap', params: { color: reg[0].color, nums } };
      return { code: 'runMax13', params: {} };
    }
    return { code: 'mixed', params: {} };
  }
  const BATCHIM = new Set([1, 3, 6, 7, 8, 10, 11, 13]);   // 일 삼 육 칠 팔 십 십일 십삼 → '이', 나머지 → '가'
  const tname = t => `${COLOR_NAMES[t.color]} ${t.num}`;
  const EXPLAIN_KO = {
    needMore: p => `${p.n}장 더 필요해요`,
    jokersOnly: () => '조커만으로는 안 돼요',
    groupMax4: () => '그룹은 4장까지예요',
    sameColor: p => `같은 색이 겹쳐요 (${tname(p.tile)})`,
    dupNum: p => `${tname(p.tile)}${BATCHIM.has(p.tile.num) ? '이' : '가'} 두 장이에요`,
    gap: p => `${COLOR_NAMES[p.color]} ${p.nums.join('-')} 사이가 비어요`,
    runMax13: () => '런은 13까지만 이어져요',
    mixed: () => '같은 숫자(다른 색)나 같은 색 연속 숫자여야 해요',
  };
  function explain(ids) {
    const e = explainCode(ids);
    return e && EXPLAIN_KO[e.code](e.params);
  }

  // 두 테이블 비교(묶음을 여러 벌 집합으로): 새로 생기거나 바뀐 묶음 자리, 사라진 옛 묶음 수, 새로 놓인 타일
  function tableDiff(prev, next) {
    const remain = new Map();
    for (const s of prev) { const k = setKey(s); remain.set(k, (remain.get(k) || 0) + 1); }
    const added = [];
    next.forEach((s, i) => {
      const k = setKey(s);
      if (remain.get(k) > 0) remain.set(k, remain.get(k) - 1);
      else added.push(i);
    });
    let removed = 0;
    for (const c of remain.values()) removed += c;
    const before = new Set(prev.flat());
    const placed = next.flat().filter(id => !before.has(id));
    return { added, removed, placed };
  }

  // 한 턴의 결과(newTable)가 규칙에 맞는지 서버가 최종 판정
  function checkPlay(prevTable, rack, newTable, melded) {
    const badRequest = () => no('badRequest', '잘못된 요청');
    if (!Array.isArray(newTable) || newTable.length > 60) return badRequest();
    const seen = new Set();
    for (const s of newTable) {
      if (!Array.isArray(s) || s.length === 0 || s.length > 13) return badRequest();
      for (const id of s) {
        if (!Number.isInteger(id) || id < 0 || id >= TILE_COUNT || seen.has(id)) return badRequest();
        seen.add(id);
      }
    }
    const prevIds = new Set(prevTable.flat());
    const rackIds = new Set(rack);
    for (const id of prevIds) if (!seen.has(id)) return no('tableToRack', '테이블의 타일은 손패로 가져올 수 없어요');
    const played = [];
    for (const id of seen) {
      if (prevIds.has(id)) continue;
      if (!rackIds.has(id)) return no('notYours', '내 타일이 아닌 타일이 있어요');
      played.push(id);
    }
    if (played.length === 0) return no('playOne', '손패에서 타일을 하나 이상 내려놓아야 해요');

    const results = newTable.map(analyze);
    const bad = results.findIndex(r => !r.ok);
    if (bad >= 0) return no('setInvalid', `${bad + 1}번째 묶음: ${results[bad].reason}`, { index: bad + 1, sub: results[bad].code });

    let meldValue = 0;
    if (!melded) {
      // 첫 등록: 기존 묶음은 건드릴 수 없고, 새 묶음은 내 타일만으로 30점 이상
      const remain = new Map();
      for (const s of prevTable) remain.set(setKey(s), (remain.get(setKey(s)) || 0) + 1);
      newTable.forEach((s, i) => {
        const k = setKey(s);
        if (remain.get(k) > 0) remain.set(k, remain.get(k) - 1);
        else meldValue += results[i].value;
      });
      for (const c of remain.values()) if (c > 0) return no('meldLocked', '첫 등록 전에는 테이블의 묶음을 바꿀 수 없어요');
      if (meldValue < INITIAL_MELD) {
        return no('meldLow', `첫 등록은 내 타일만으로 ${INITIAL_MELD}점 이상이어야 해요 (지금 ${meldValue}점)`, { need: INITIAL_MELD, have: meldValue });
      }
    }
    return { ok: true, played, meldValue, normalized: results.map(r => r.order) };
  }

  function penalty(rack) {
    return rack.reduce((sum, id) => sum + (tile(id).joker ? JOKER_PENALTY : tile(id).num), 0);
  }

  return { TILE_COUNT, STANDARD_TILE_COUNT, MAX_PLAYERS, deckSize, JOKER_PENALTY, INITIAL_MELD, COLOR_NAMES, tile, analyze, checkPlay, penalty, setKey, explain, explainCode, tableDiff };
});
