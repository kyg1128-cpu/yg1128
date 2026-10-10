// QR 코드 만들기 — 외부 라이브러리·인터넷 없이 (바이트 모드/UTF-8, 오류 정정 M, 버전 1~10)
// 브라우저: window.QR.svg(text) → SVG 문자열.  node: require('./public/qr.js')
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 오류 정정 M: [블록당 정정 코드어 수, 그룹1 블록 수, 그룹1 데이터 코드어, 그룹2 블록 수, 그룹2 데이터 코드어]
  const ECC_M = [null,
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const MAX_VERSION = 10;

  // ---------- GF(256), 원시 다항식 x^8+x^4+x^3+x^2+1 ----------
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function generator(deg) {   // (x - α^0)(x - α^1)…(x - α^(deg-1)), 최고차항 계수 1은 생략하지 않음
    let g = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
      g = next;
    }
    return g;
  }
  function rsEncode(data, deg) {
    const g = generator(deg), rem = new Array(deg).fill(0);
    for (const d of data) {
      const f = d ^ rem.shift();
      rem.push(0);
      for (let j = 0; j < deg; j++) rem[j] ^= mul(g[j + 1], f);
    }
    return rem;
  }

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    return Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0));
  }
  const dataCount = v => { const e = ECC_M[v]; return e[1] * e[2] + e[3] * e[4]; };

  // ---------- 비트열 → 코드어(블록 나누기·정정 코드·섞기) ----------
  function codewords(bytes) {
    let v = 1;
    for (; v <= MAX_VERSION; v++) {
      const ccBits = v < 10 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= dataCount(v) * 8) break;
    }
    if (v > MAX_VERSION) throw new Error('QR: 글자가 너무 길어요');
    const cap = dataCount(v) * 8, bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4);
    put(bytes.length, v < 10 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }

    const [ecLen, n1, d1, n2, d2] = ECC_M[v];
    const blocks = [];
    let k = 0;
    for (let i = 0; i < n1 + n2; i++) {
      const len = i < n1 ? d1 : d2;
      const d = data.slice(k, k + len); k += len;
      blocks.push({ d, e: rsEncode(d, ecLen) });
    }
    const out = [];
    const maxD = Math.max(d1, d2);
    for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
    return { version: v, cw: out };
  }

  // ---------- 모듈 배치 ----------
  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  function bch(data, gen, genDeg) {
    let rem = data << genDeg;
    for (let i = 31 - Math.clz32(rem); i >= genDeg; i--) if ((rem >>> i) & 1) rem ^= gen << (i - genDeg);
    return (data << genDeg) | rem;
  }
  const formatBits = mask => bch((0b00 << 3) | mask, 0x537, 10) ^ 0x5412;   // M = 00
  const versionBits = v => bch(v, 0x1f25, 12);

  function build(version, cw, mask) {
    const size = version * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };

    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {   // 찾기 패턴 + 흰 테두리
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }   // 타이밍
    const al = ALIGN[version];
    for (const ay of al) for (const ax of al) {   // 정렬 패턴 (찾기 패턴과 겹치는 자리는 건너뜀)
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    // 형식 정보 자리 예약 (마스크 정한 뒤에 채움) + 늘 검은 모듈
    const fmt = f => {
      const bit = i => ((f >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    fmt(0);
    if (version >= 7) {
      const vb = versionBits(version);
      for (let i = 0; i < 18; i++) {
        const dark = ((vb >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, dark); set(b, a, dark);
      }
    }
    // 데이터: 오른쪽 아래부터 두 칸씩 지그재그
    let i = 0;
    const total = cw.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const upward = ((right + 1) & 2) === 0;
      for (let vert = 0; vert < size; vert++) {
        const y = upward ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          if (fn[y][x]) continue;
          if (i < total) m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
    const f = MASKS[mask];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && f(x, y)) m[y][x] = !m[y][x];
    fmt(formatBits(mask));
    return m;
  }

  // ---------- 마스크 점수 (표준 벌점 규칙 4가지) ----------
  function penalty(m) {
    const n = m.length;
    let score = 0, dark = 0;
    const line = get => {   // 규칙 1: 같은 색 5개 이상 연속, 규칙 3: 1:1:3:1:1 찾기 패턴 닮은꼴
      let run = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && get(i) === get(i - 1)) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      for (let i = 0; i + 11 <= n; i++) {
        const p = [];
        for (let k = 0; k < 11; k++) p.push(get(i + k) ? 1 : 0);
        const s = p.join('');
        if (s === '10111010000' || s === '00001011101') score += 40;
      }
    };
    for (let y = 0; y < n; y++) line(x => m[y][x]);
    for (let x = 0; x < n; x++) line(y => m[y][x]);
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {   // 규칙 2: 2×2 같은 색
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
    for (const row of m) for (const c of row) if (c) dark++;
    score += 10 * Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5);   // 규칙 4: 검은 비율
    return score;
  }

  function matrix(text) {
    const { version, cw } = codewords(utf8(String(text)));
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const m = build(version, cw, mask);
      const s = penalty(m);
      if (!best || s < best.score) best = { modules: m, mask, score: s };
    }
    return { version, size: best.modules.length, mask: best.mask, modules: best.modules };
  }

  // 남색 모듈, 상아색 바탕, 가장자리 여백 4칸
  function svg(text, opts = {}) {
    const { modules, size } = matrix(text);
    const q = 4, n = size + q * 2;
    const fg = opts.fg || '#16213e', bg = opts.bg || '#fffaf0';
    let d = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!modules[y][x]) continue;
        let w = 1;
        while (x + w < size && modules[y][x + w]) w++;
        d += `M${x + q} ${y + q}h${w}v1h-${w}z`;
        x += w - 1;
      }
    }
    const label = String(opts.label || 'QR 코드').replace(/[<>&"]/g, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${label}">` +
      `<rect width="${n}" height="${n}" fill="${bg}"/><path fill="${fg}" d="${d}"/></svg>`;
  }

  return { svg, matrix, _rs: rsEncode, _format: formatBits, _version: versionBits };
});
