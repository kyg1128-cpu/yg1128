/* 루미큐브 — 입장·결과·안내 흐름 (app.js 다음에 읽힘)
   대기실 QR·TV로 보기, 오늘의 시상식·결과 공유, 규칙 한눈에, 처음 오신 분 안내, 혼자 연습하기.
   app.js의 S, session, api, toast, el, $, tileEl, render, isMyTurn, turnInfo, lastScreen 등을 그대로 씀 */
(function () {
  const T = (c, n, k = 0) => c * 26 + (n - 1) * 2 + k;   // 타일 id: 색 0~3, 숫자 1~13, 벌 0/1
  const has = c => document.body.classList.contains(c);
  const isMobileUA = () => /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) || (/Mac/.test(navigator.platform || '') && navigator.maxTouchPoints > 1);
  const signed = d => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d);
  const meTag = (id, name) => (S && id === S.me.id && !isSelfName(name) ? ' ' + tx('me.tag') : '');   // 혼자 연습(이름 '나')이면 '나 (나)'가 되지 않게
  const nameOf = (id, name, bot, botKey) => displayName({ id, name, bot, botKey });   // 봇 이름은 내 말로 (app.js)
  const playSfx = (name, opts) => { try { if (window.Sfx && typeof Sfx.play === 'function') Sfx.play(name, opts); } catch {} };

  // ---------- 복사 (http 주소에서는 clipboard API가 없으니 예전 방식으로) ----------
  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
      document.body.append(ta);
      ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  // ---------- 초대 주소 + QR ----------
  // 이 컴퓨터(localhost)에서 열었으면 친구 폰이 들어올 수 있는 같은 와이파이 주소로, 아니면(터널·호스팅·LAN 주소) 지금 주소 그대로
  let lan = null, lanLoading = null, lanIdx = 0, qrUrl = '';
  const localHost = () => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
  function loadLan() {
    if (lan) return Promise.resolve(lan);
    return lanLoading || (lanLoading = fetch('/api/info', { cache: 'no-store' })
      .then(r => r.json()).then(j => (lan = Array.isArray(j.lan) ? j.lan : []))
      .catch(() => (lan = [])));
  }
  function inviteUrl(code) {
    if (localHost() && lan && lan.length) return `${lan[lanIdx % lan.length]}/?r=${code}`;
    return `${location.origin}${location.pathname}?r=${code}`;
  }
  async function inviteUrlReady(code) { if (localHost()) await loadLan(); return inviteUrl(code); }
  const shortUrl = u => u.replace(/^https?:\/\//, '');
  const qrSvg = url => (window.QR ? QR.svg(url, { label: tx('qr.label') }) : '');
  function lobbyInvite() {
    if (!S) return;
    if (localHost() && !lan) { loadLan().then(() => { if (S && S.state === 'lobby') lobbyInvite(); }); return; }
    const url = inviteUrl(S.code);
    if (url !== qrUrl) {
      qrUrl = url;
      $('#lobbyQr').innerHTML = qrSvg(url);
      $('#lobbyUrl').textContent = shortUrl(url);
    }
    $('#btnNextUrl').classList.toggle('hidden', !(localHost() && lan && lan.length > 1));
    if (!$('#tv').classList.contains('hidden')) fillTv();
  }
  function fillTv() {
    const url = qrUrl || inviteUrl(S.code);
    $('#tvCode').textContent = S.code;
    $('#tvQr').innerHTML = qrSvg(url);
    $('#tvUrl').textContent = shortUrl(url);
  }
  $('#lobbyQr').onclick = () => { if (!S) return; fillTv(); const tv = $('#tv'); tv.classList.remove('hidden'); tv.focus(); };
  $('#btnNextUrl').onclick = () => { lanIdx++; lobbyInvite(); };

  // ---------- 결과 창은 마지막 수 연출(body.revealing, A 담당)이 끝난 뒤에 ----------
  let holdSince = 0, holdTimer = 0;
  function revealHold() {
    if (!has('revealing')) { holdSince = 0; return false; }
    const now = Date.now();
    if (!holdSince) holdSince = now;
    if (now - holdSince > 4500) return false;   // 연출이 멈춰 버려도 결과는 꼭 보이게
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { if (S) render(); }, 4600 - (now - holdSince));
    return true;
  }
  // 연출이 끝나면(클래스가 빠지면) 기다리던 결과 창·안내를 바로 띄움
  new MutationObserver(() => {
    if (has('revealing') || !S) return;
    if (S.state === 'ended' && S.result && $('#overlay').classList.contains('hidden')) render();
    else coach();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ---------- 오늘의 시상식 ----------
  // ① 제목 + 점수(0부터 올라감) → ② 사람마다 스테인드글라스 창 하나씩 차례로 불이 켜짐 → ③ 말씀 + 오늘 판 기록
  let cer = { key: '', timers: [], raf: 0, panes: [], nums: [], done: true };
  function stopCeremony() { cer.timers.forEach(clearTimeout); cer.timers = []; cancelAnimationFrame(cer.raf); }
  function ceremony() {
    const key = `${S.code}:${S.round}`;
    if (cer.key !== key) buildCeremony(key);
    const host = S.hostId === S.me.id;
    $('#btnAgain').classList.toggle('hidden', !host);
    $('#btnAgain').disabled = S.players.length < 2;
    $('#ovHint').textContent = !host ? tx('ov.waitHost')
      : S.players.length < 2 ? tx('ov.needTwo') : '';
    renderHistory();
    requestAnimationFrame(stuck);
  }
  // 상 이름·설명: key·dk·params가 있으면 내 말로, 없으면 서버가 준 한국어
  function awardTitle(a) { return a.key && I18N.has(`award.${a.key}.title`) ? tx(`award.${a.key}.title`) : (a.title || ''); }
  const AWARD_NUMS = { rebuild: ['n'], bigHand: ['n'], firstFruit: ['value'], joker: ['n'], comeback: ['from', 'to'], endure: ['n'], together: ['n'] };
  function awardDetail(a) {
    let dk = a.dk, params = a.params;
    if (!params && !dk && a.key && I18N.lang !== 'ko') {   // 옛 서버(코드 없음): 한국어 설명의 숫자로 대신
      const nums = (String(a.detail || '').match(/\d+/g) || []).map(Number), names = AWARD_NUMS[a.key];
      if (a.key === 'win') dk = /모두/.test(a.detail || '') ? 'out' : 'fewest';
      else if (a.key === 'together') { dk = nums.length ? 'played' : 'stayed'; params = { n: nums[0] }; }
      else if (names && nums.length >= names.length) params = Object.fromEntries(names.map((k, i) => [k, nums[i]]));
    }
    const k = `award.${a.key}.${dk || 'd'}`;
    if (a.key && I18N.has(k) && (params || dk)) return tx(k, params || {});
    return a.detail || '';
  }
  // instant: 말을 바꿔 다시 그릴 때 — 연출 없이 바로 다 보임
  function buildCeremony(key, instant) {
    stopCeremony();
    cer = { key, timers: [], raf: 0, panes: [], nums: [], done: false, user: false };
    const later = (fn, ms) => cer.timers.push(setTimeout(fn, ms));
    const me = S.me.id, win = S.result[0];
    $('#ovTitle').textContent = win.id === me ? tx('ov.winMe') : tx('ov.win', { name: nameOf(win.id, win.name, false, win.botKey) });
    const tbl = $('#ovTable'); tbl.replaceChildren();
    for (const r of S.result.slice().sort((a, b) => b.delta - a.delta)) {
      const total = (S.players.find(p => p.id === r.id) || {}).score;
      const tr = el('tr', r.id === me ? 'me' : '');
      const name = el('td'); name.append(el('div', 'nm', nameOf(r.id, r.name, false, r.botKey) + meTag(r.id, r.name)));
      const mini = el('div', 'mini'); r.rack.forEach(id => mini.append(tileEl(id))); name.append(mini);
      const d = el('td', 'num ' + (r.delta >= 0 ? 'plus' : 'minus'), signed(r.delta));
      cer.nums.push([d, r.delta]);
      tr.append(name, d, el('td', 'num tot', total != null ? tx('ov.total', { v: signed(total) }) : ''));
      tbl.append(tr);
    }
    const aw = Array.isArray(S.awards) ? S.awards : [];
    const ol = $('#ovPanes'); ol.replaceChildren();
    $('#ovAwards').classList.toggle('hidden', !aw.length);
    aw.forEach((a, i) => {
      const li = el('li', `pane g${i % 5}` + (a.id === me ? ' mine' : ''));
      li.append(el('span', 'pe', a.emoji || '🕊'), el('b', 'pt', awardTitle(a)),
        el('span', 'pn', (a.bot ? '🤖 ' : '') + nameOf(a.id, a.name, a.bot, a.botKey) + meTag(a.id, a.name)), el('small', 'pd', awardDetail(a)));
      ol.append(li);
      cer.panes.push(li);
    });
    const story = $('#ovStory');
    if (instant) { cer.panes.forEach(p => { p.style.animation = 'none'; }); revealAll(); return; }   // 말만 바뀜: 반짝임 다시 안 함
    $('#ovCard').scrollTop = 0;
    if (has('calm')) {   // 효과 줄이기: 한 번에 다 보여 줌
      revealAll();
      if (aw.length) playSfx('award', { step: 0 });
      return;
    }
    story.classList.add('later');
    // ① 점수 올라가기 600ms
    const t0 = performance.now();
    cer.nums.forEach(([e]) => { e.textContent = '0'; });
    const step = now => {
      const k = Math.min(1, (now - t0) / 600), ease = 1 - Math.pow(1 - k, 3);
      cer.nums.forEach(([e, v]) => { e.textContent = signed(Math.round(v * ease)); });
      if (k < 1) cer.raf = requestAnimationFrame(step);
    };
    cer.raf = requestAnimationFrame(step);
    // ② 시상식 창 450ms 간격, ③ 말씀·기록
    const start = 900;
    cer.panes.forEach((p, i) => later(() => light(p, i), start + i * 450));
    later(() => { story.classList.remove('later'); cer.done = true; }, start + cer.panes.length * 450 + 250);
  }
  function light(p, i) {
    if (p.classList.contains('lit')) return;
    p.classList.add('lit');
    playSfx('award', { step: i });
    if (!cer.user) { try { p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {} }
  }
  function revealAll() {   // 카드를 누르면 기다리지 않고 다 보임
    if (cer.done) return;
    stopCeremony();
    cer.nums.forEach(([e, v]) => { e.textContent = signed(v); });
    cer.panes.forEach(p => p.classList.add('lit'));
    $('#ovStory').classList.remove('later');
    cer.done = true;
  }
  const card = $('#ovCard');
  card.addEventListener('click', revealAll);
  // 버튼 줄이 카드 아래에 붙어 있는지(아래에 내용이 더 있는지) — 붙어 있을 때만 아랫금선을 그림
  const stuck = () => { const a = card.querySelector('.ov-actions'); if (a) a.classList.toggle('stuck', card.scrollTop + card.clientHeight < card.scrollHeight - 4); };
  card.addEventListener('scroll', stuck, { passive: true });
  window.addEventListener('resize', stuck);
  new ResizeObserver(stuck).observe(card);
  for (const ev of ['wheel', 'touchstart']) card.addEventListener(ev, () => { cer.user = true; }, { passive: true });

  function renderHistory() {   // 오늘 n판: 누적 점수 + 이긴 판마다 ★
    const box = $('#ovHistory'); box.replaceChildren();
    const hist = Array.isArray(S.history) ? S.history : [];
    if (!hist.length) return;
    const wins = id => hist.filter(h => h.winnerId === id).length;
    box.append(el('h4', '', tx('ov.today', { n: S.round || hist.length })));
    const ol = el('ol', 'hist');
    for (const p of S.players.slice().sort((a, b) => b.score - a.score)) {
      const w = wins(p.id);
      const li = el('li', p.id === S.me.id ? 'me' : '');
      li.append(el('span', 'hn', (p.bot ? '🤖 ' : '') + displayName(p) + meTag(p.id, p.name)),
        el('span', 'hs', w > 4 ? `★×${w}` : '★'.repeat(w)), el('b', 'hv', signed(p.score)));
      if (w) li.querySelector('.hs').setAttribute('aria-label', tx('ov.wins', { n: w }));
      ol.append(li);
    }
    box.append(ol);
  }

  // ---------- 단톡방 결과 공유: 6줄 이하, 주소·손패 없음, 이번 판 점수 순 ----------
  function resultText() {
    const rows = S.result.slice().sort((a, b) => b.delta - a.delta);
    const total = id => (S.players.find(p => p.id === id) || {}).score;
    const lines = [tx('shareText.head', { n: S.round || 1 })];
    const w = rows[0], wt = total(w.id);
    lines.push(`🥇 ${nameOf(w.id, w.name, false, w.botKey)} ${signed(w.delta)}` + (S.round > 1 && wt != null ? tx('shareText.total', { v: signed(wt) }) : ''));
    const medal = ['🥈', '🥉', tx('shareText.fourth')];
    if (rows.length > 1) lines.push(rows.slice(1).map((r, i) => `${medal[i] || ''} ${nameOf(r.id, r.name, false, r.botKey)} ${signed(r.delta)}`.trim()).join(' · '));
    const special = (S.awards || []).filter(a => a.key !== 'win' && a.key !== 'together').slice(0, 3);
    if (special.length) lines.push(special.map(a => `${a.emoji} ${awardTitle(a)} ${nameOf(a.id, a.name, a.bot, a.botKey)}`).join(' · '));
    lines.push(tx('shareText.verse'));
    return lines.join('\n');
  }
  $('#btnShareResult').onclick = async () => {
    if (!S || !S.result) return;
    const text = resultText();
    if (navigator.share && isMobileUA()) {
      try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (await copyText(text)) toast(tx('toast.resultCopied'));
    else toast(text);
  };

  // ---------- 규칙 한눈에 (진짜 타일: 조커 모양·색 구분 기호가 그대로 보임) ----------
  function rulesCard() {
    const box = el('div', 'rulecard');
    const rule = (title, desc, tiles) => {
      const r = el('div', 'rule'), h = el('div', 'rule-h'), t = el('div', 'rule-tiles');
      h.append(el('b', '', title), el('span', '', desc));
      for (const [id, as] of tiles) t.append(tileEl(id, as ? { jokerAs: as } : {}));
      r.append(h, t);
      return r;
    };
    // 조커 감점은 늘 '조커'로만 (내가 고른 모양 이름은 쓰지 않음)
    const jokerLine = el('p', 'note');
    jokerLine.append(tx('rules.jokerPre'), jokerSvg(), tx('rules.jokerPost'));
    jokerLine.querySelector('svg').classList.add('inline');
    const note = (b, rest) => { const p = el('p', 'note'); p.append(el('b', '', b), rest); return p; };
    box.append(
      el('p', 'goal', tx('rules.goal')),
      rule(tx('rules.group'), tx('rules.groupDesc'), [[T(0, 7)], [T(1, 7)], [T(3, 7)]]),
      rule(tx('rules.run'), tx('rules.runDesc'), [[T(1, 4)], [T(1, 5)], [T(1, 6)], [T(1, 7)]]),
      rule(tx('rules.joker'), tx('rules.jokerDesc'), [[T(2, 9)], [104, 10], [T(2, 11)]]),
      jokerLine,
      note(tx('rules.meldB'), tx('rules.meld')),
      note(tx('rules.drawB'), tx('rules.draw')),
      note(tx('rules.endB'), tx('rules.end')),
    );
    return box;
  }
  function mountRules() {   // 처음 화면 + 규칙 창 (말을 바꾸면 다시)
    for (const box of [$('#homeRules'), $('#rulesBody')]) {
      const old = box.querySelector('.rulecard');
      if (old) old.remove();
      box.append(rulesCard());
    }
  }
  mountRules();
  // 규칙 창은 늘 맨 위(제목·그룹·런 예시)부터 — 닫기 단추로 초점을 옮기면 짧은 화면에선 맨 아래로 스크롤되어 버림
  let rulesFrom = null;
  const openRules = () => {
    rulesFrom = $('#menu').classList.contains('hidden') ? document.activeElement : $('#btnMenu');
    $('#menu').classList.add('hidden');
    $('#rulesSheet').classList.remove('hidden');
    $('#rulesSheet .card').scrollTop = 0;
    try { $('#rulesH').focus({ preventScroll: true }); } catch {}
  };
  const closeRules = () => {
    if ($('#rulesSheet').classList.contains('hidden')) return;
    $('#rulesSheet').classList.add('hidden');
    const b = rulesFrom; rulesFrom = null;
    if (b && b.focus && b.offsetParent) { try { b.focus({ preventScroll: true }); } catch {} }
  };
  $('#btnRules').onclick = openRules;
  $('#btnRules2').onclick = openRules;
  $('#btnRulesClose').onclick = closeRules;
  $('#rulesSheet').addEventListener('click', e => { if (e.target.id === 'rulesSheet') closeRules(); });
  $('#menu').addEventListener('click', e => { if (e.target.id === 'menu') closeMenu(); });
  const closeTv = () => { $('#tv').classList.add('hidden'); if (lastScreen === 'lobby') $('#lobbyQr').focus(); };
  $('#tv').onclick = closeTv;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#tv').classList.contains('hidden')) return closeTv();
    if (!$('#rulesSheet').classList.contains('hidden')) return closeRules();
    if (!$('#menu').classList.contains('hidden')) return closeMenu();
  });

  // ---------- 처음 오신 분 안내: 기기마다 한 번씩 (localStorage 'rummi-tips' 비트) ----------
  const TIPS = [   // 글은 사전 'coach.<bit>'
    { bit: 1, when: () => true },
    { bit: 2, when: () => { const m = meldNow(); return !S.me.melded && m >= 1 && m <= 29; } },
    { bit: 4, when: () => S.me.melded },
  ];
  const ALL_TIPS = 7;
  let tipsSeen = 0, tipShown = null;
  try { tipsSeen = Number(localStorage.getItem('rummi-tips')) || 0; } catch {}
  const saveTips = () => { try { localStorage.setItem('rummi-tips', String(tipsSeen)); } catch {} };
  function meldNow() { try { const i = turnInfo(); return (i && Number(i.meld)) || 0; } catch { return 0; } }
  let tipTimer = 0;
  // 폰 가로: 안내가 테이블 첫 줄 위에 떠 있으므로 탭은 아래로 통과시키고(flow.css) 7초 뒤 저절로 닫음
  const floatTip = () => { try { return matchMedia('(orientation: landscape) and (max-height: 520px)').matches; } catch { return false; } };
  function hideTip() { clearTimeout(tipTimer); $('#coach').classList.add('hidden'); tipShown = null; }
  // 안내 위치: 폰 가로에선 자리를 차지하지 않고 상태줄 바로 아래에 떠 있음 (flow.css --status-bottom)
  function placeTip() {
    const box = $('#coach');
    if (box.classList.contains('hidden')) return;
    document.body.style.setProperty('--status-bottom', Math.round($('#status').getBoundingClientRect().bottom) + 'px');
    document.body.style.setProperty('--coach-h', box.offsetHeight + 'px');   // 채팅 말풍선은 이 안내 아래로 (flow.css)
  }
  window.addEventListener('resize', placeTip);
  function coach() {
    const mine = !!S && S.state === 'playing' && lastScreen === 'game' && isMyTurn();
    if (tipShown) { if (!mine) hideTip(); else placeTip(); return; }
    if (!mine || has('revealing') || (tipsSeen & ALL_TIPS) === ALL_TIPS) return;
    const tip = TIPS.find(t => !(tipsSeen & t.bit) && t.when());
    if (!tip) return;
    tipsSeen |= tip.bit; saveTips();
    tipShown = tip;
    showTip(tip);
  }
  function showTip(tip) {
    const box = $('#coach'), never = el('button', '', tx('coach.never'));
    never.type = 'button';
    never.onclick = e => { e.stopPropagation(); tipsSeen = ALL_TIPS | 8; saveTips(); hideTip(); };
    box.replaceChildren(el('span', 'ct', tx('coach.' + tip.bit)), never);
    box.title = tx('coach.close');
    box.classList.remove('hidden');
    placeTip();
    clearTimeout(tipTimer);
    if (floatTip()) tipTimer = setTimeout(() => { if (tipShown === tip) hideTip(); }, 7000);
  }
  $('#coach').onclick = hideTip;   // 누르면 닫힘 (다음 안내는 다음 화면 갱신 때)

  // ---------- 혼자 연습하기: 방 만들기 → 쉬운 봇 → 바로 시작 (시간 제한 없음) ----------
  $('#btnPractice').onclick = async () => {
    const btn = $('#btnPractice');
    if (btn.disabled) return;
    btn.disabled = true;
    const typed = nameInput.value.trim();
    if (typed) getName();
    try {
      const r = await api('create', { name: typed || tx('practice.name') });
      session = { room: r.room, token: r.token };
      saveSession();
      history.replaceState(null, '', '?r=' + r.room);
      try { await api('addBot', { level: 'easy' }); await api('start'); } catch (err) { toast(err.message); }
      $('#btnRejoin').classList.add('hidden');
      connect();
    } catch (err) { toast(err.message); }
    finally { btn.disabled = false; }
  };

  // ---------- 말 바꾸기: 규칙 카드·QR 이름표·안내 말풍선·시상식을 그 자리에서 다시 (app.js의 render() 다음에 불림) ----------
  if (window.I18N) I18N.on(() => {
    mountRules();
    qrUrl = '';   // QR 이름표(aria)도 새 말로
    if (S && S.state === 'lobby') lobbyInvite();
    if (S && !$('#tv').classList.contains('hidden')) fillTv();
    if (tipShown && !$('#coach').classList.contains('hidden')) showTip(tipShown);
    if (S && S.state === 'ended' && S.result && !$('#overlay').classList.contains('hidden')) {
      const top = $('#ovCard').scrollTop;
      buildCeremony(`${S.code}:${S.round}`, true);
      $('#ovCard').scrollTop = top;
    }
  });

  Object.assign(window, { lobbyInvite, inviteUrlReady, copyText, isMobileUA, revealHold, ceremony, stopCeremony, coach });
})();
