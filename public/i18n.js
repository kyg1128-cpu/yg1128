/* 루미큐브 — 화면 글자 사전 (한국어 / English). app.js보다 먼저 읽힘.
   말은 보는 사람마다 따로 고름: localStorage 'rummi-lang' = 'ko' | 'en'
   (처음엔 기기 언어가 한국어면 'ko', 아니면 'en'). 서버는 코드+값만 보내고 글자는 각자 자기 말로 그림.
   window.I18N = { lang, locale, t(key, params), has(key), setLang(l), on(fn), apply(root), tileName({color, num}) }
   - 값은 글자('{n}' 자리 채움) · 함수(params → 글자) · 배열(봇 말·자주 쓰는 말) 중 하나
   - 없는 말은 한국어로, 그것도 없으면 키 그대로
   - apply(root): [data-i18n] 글자, [data-i18n-html] 사전 HTML(<br>만), [data-i18n-ph] placeholder,
     [data-i18n-title] title, [data-i18n-aria] aria-label을 채움
   주의: 조커 감점 문구에는 조커 모양(별·십자가·비둘기) 이름을 절대 넣지 않음 — 늘 '조커'/'Joker'로만 */
(function () {
  'use strict';
  const KEY = 'rummi-lang';
  const s = n => (Number(n) === 1 ? '' : 's');   // English plural
  const BATCHIM = new Set([1, 3, 6, 7, 8, 10, 11, 13]);   // 일 삼 육 칠 팔 십 십일 십삼 → '이', 나머지 → '가'
  const COLORS = { ko: ['빨강', '파랑', '주황', '검정'], en: ['red', 'blue', 'orange', 'black'] };
  const pick = (map, k, d) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : d);
  const cap = w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);   // English: 문장 첫 글자

  const KO = {
    'lobby.nickname': '내 닉네임', 'lobby.nameEdit': '수정', 'lobby.nameSave': '저장', 'lobby.nameCancel': '취소',
    'lobby.nameSaved': '닉네임을 바꿨어요: {name}',
    'err.badName': '닉네임을 입력해 주세요 (최대 12자)', 'err.renameLobbyOnly': '닉네임은 시작 전 대기실에서 바꿀 수 있어요',
    'log.rename': '{from} → {to} · 닉네임 변경',
    'move.recent': '지난 수', 'move.close': '지난 수 닫기', 'move.prev': '이전 수', 'move.next': '다음 수',
    'move.gold': '금빛 테두리 = 이번에 낸 타일', 'move.played': '{n}장 내려놓음',
    'move.first': '첫 등록 · {v}점', 'move.group': '그룹', 'move.run': '런', 'move.count': '{n}개 조합',
    'music.title': '테이블 BGM', 'music.volume': 'BGM 크기', 'music.on': '켜짐', 'music.off': '꺼짐',
    'music.quickOn': 'BGM 켜짐', 'music.quickOff': 'BGM 꺼짐',
    'music.hint': '잔잔한 피아노와 마림바 · 이 기기에만 저장돼요',
    'music.muted': '음소거 중',
    'ux.keys': '방향키 이동 · Enter 선택 · Esc 해제',
    'ux.rack': '내 타일',
    'ux.hand': "내 타일 {n}장",
    'ux.selected': "{n}장 선택",
    'ux.pick': '타일 선택 → 묶음에 놓기',
    'ux.watch': "다음 수를 생각해 보세요",
    'ux.place': '새 묶음에 놓기',
    'ux.return': '손패로',
    'ux.clear': '선택 해제',
    'ux.connecting': '방에 연결하는 중…',
    'ux.reconnecting': '연결이 끊겼어요. 자동으로 다시 연결하고 있습니다.',
    'ux.offline': '인터넷 연결을 확인해 주세요. 연결이 45초 넘게 끊기면 봇이 대신 플레이해요.',
    'ux.sending': '전송 중…',
    'ux.sortNum': '숫자순',
    'ux.sortColor': '색깔순',
    'ux.remaining': '손패가 비었어요. 완료를 눌러 차례를 마치세요.',

    'polish.title': '같이 놓는 즐거움.',
    'polish.sub': "차근차근 맞추는 재미, 함께 웃는 한 판. 어디서든 같은 테이블에 모여요.",
    'polish.players': '2–6명 · 친구 또는 컴퓨터',
    'polish.devices': 'PC & 모바일',
    'doc.title': '루미큐브 온라인',
    'doc.myTurn': '▶ 내 차례 — 루미큐브',
    'lang.label': '언어',
    'credits.creator': '제작자',
    'credits.name': '곰국',
    'credits.contact': '문의',
    'credits.aria': '제작자 및 문의',
    'menu.takeoverHint': '게임 중 나가면 대타 봇이 내 타일로 이어서 플레이해요.',

    // 처음 화면
    'home.title': '루미큐브 온라인',
    'home.sub': "친구와 함께, 혼자서도 즐겁게. 2~6명이 즐기는 타일 게임.",
    'verse.html': '보라 형제가 연합하여 동거함이<br>어찌 그리 선하고 아름다운고',
    'verse.ref': '시편 133:1',
    'home.name': '내 이름',
    'home.namePh': '이름',
    'home.create': "친구와 하기",
    'home.createSub': "방을 만들고 링크로 초대하세요",
    'home.practice': '혼자 연습하기',
    'home.practiceSub': '컴퓨터 1~5명 · 난이도 선택',
    'home.or': '또는',
    'home.codePh': '방 코드',
    'home.join': '참가',
    'home.rejoin': p => `▶ 하던 게임으로 돌아가기 (방 ${p.room})`,
    'practice.name': '나',

    // 대기실
    'lobby.practiceTitle': '연습 준비',
    'lobby.friendsTitle': '친구와 하기',
    'lobby.practiceSub': "컴퓨터 상대와 난이도를 고르세요. 시간 제한 없이 연습할 수 있어요.",
    'lobby.friendsSub': '친구와 컴퓨터를 섞어 최대 6명까지 함께할 수 있어요.',
    'lobby.deckStandard': "기본판 · 타일 106개 · 각자 14장으로 시작",
    'lobby.deckExpanded': "5~6인 확장판 · 타일 160개 · 각자 14장으로 시작",
    'lobby.bots': '컴퓨터 상대',
    'lobby.inviteShow': '친구도 초대하기 · QR 보기',
    'lobby.inviteHide': '초대 QR 접기',
    'lobby.botCount': p => `${p.n}명 참가 중`,
    'lobby.botHelp': p => `${p.n}자리 남았어요. 난이도를 누르면 바뀌고, ✕를 누르면 상대가 빠져요.`,
    'lobby.botFull': "자리가 모두 찼어요. 다른 상대를 넣으려면 봇을 빼 주세요. 난이도는 바꿀 수 있어요.",
    'lobby.botHostOnly': '컴퓨터 추가·삭제와 난이도 변경은 방장이 할 수 있어요.',
    'lobby.levelAria': p => `${p.name} 난이도: ${p.level}. 눌러서 바꾸기`,
    'lobby.code': '방 코드',
    'lobby.qrAria': 'QR 코드 크게 보기 (TV로 보기)',
    'lobby.qrCap': '폰 카메라로 찍으면 바로 들어와요',
    'lobby.nextUrl': '다른 주소',
    'lobby.share': '초대 링크 복사',
    'lobby.players': '참가자',
    'lobby.addEasy': '🤖 쉬움 봇 추가',
    'lobby.addHard': '🤖 어려움 봇 추가',
    'lobby.timer': "차례당 제한 시간",
    'timer.0': '없음', 'timer.60': '60초', 'timer.90': '90초', 'timer.120': '2분', 'timer.180': '3분',
    'lobby.start': '게임 시작',
    'lobby.leave': '방 나가기',
    'lobby.host': '방장',
    'lobby.lvTitle': '눌러서 난이도 바꾸기',
    'lobby.removeBot': '봇 빼기',
    'lobby.hintFew': "친구를 초대하거나 컴퓨터 상대를 추가해 주세요",
    'lobby.hintReady': "준비됐다면 시작해 볼까요?",
    'lobby.hintWait': '방장이 시작하기를 기다리는 중…',
    'me.tag': '(나)',
    'chip.me': '(나)',
    'me.self': '나',
    'level.easy': '쉬움', 'level.hard': '어려움',

    // 봇 이름 (긴 이름 / 자리표용 짧은 이름)
    'bot.rumi': '로봇 루미', 'bot.cube': '로봇 큐브', 'bot.tile': '로봇 타일', 'bot.joker': '로봇 조커', 'bot.robot': '로봇', 'bot.peace': '로봇 평화',
    'botShort.rumi': '루미', 'botShort.cube': '큐브', 'botShort.tile': '타일', 'botShort.joker': '조커', 'botShort.robot': '로봇', 'botShort.peace': '평화',

    // 게임 화면
    'game.chat': '채팅',
    'game.chatUnread': p => `채팅 (안 읽은 메시지 ${p.n}개)`,
    'game.rules': '규칙 한눈에',
    'game.menu': '메뉴',
    'game.undo': "취소",
    'game.undoTitle': '한 수 되돌리기 (Ctrl+Z)',
    'game.undoAria': '한 수 되돌리기',
    'game.reset': '처음',
    'game.resetTitle': '이번 턴 처음 상태로',
    'game.sortNum': '숫자순 정렬',
    'game.sortColor': '색깔순 정렬',
    'game.draw': '뽑기',
    'game.pass': '패스',
    'game.done': '완료',
    'game.pool': p => `더미 ${p.n}`,
    'game.clock': p => `⏱ ${p.s}초`,
    'chip.botTip': p => `컴퓨터 상대 · ${p.level}`,
    'chip.preTip': '아직 첫 등록 전',
    'chip.offTip': '연결 끊김',
    'chip.danger': p => `${p.n}장!`,
    'chip.pre': '등록 전',
    'chip.next': '다음',
    'chip.grace': p => `${p.s}초 후 봇 전환`,
    'chip.substitute': '대타 봇',
    'chip.substituteThinking': '대타 봇 · 생각 중',
    'chip.substitutePlacing': '대타 봇 · 놓는 중…',
    'chip.substituteTip.left': '퇴장한 사람의 타일과 점수를 이어받은 쉬운 봇',
    'chip.substituteTip.offline': '연결이 끊겨 쉬운 봇이 대신 플레이해요. 돌아오면 자리를 돌려드려요.',
    'chip.placing': '놓는 중…',
    'chip.thinking': '생각 중',
    'chip.thinkingAria': '생각 중…',
    'table.newSet': '＋ 새 묶음 만들기',
    'table.pickHere': "새 묶음 놓는 곳",
    'table.empty': '아직 테이블이 비어 있어요',
    'table.more': p => `${p.n}장 더`,
    'status.over': '게임 종료',
    'status.meldReady': "첫 등록 준비 끝! 완료를 누르세요",
    'status.meld': p => `첫 등록 ${p.have}/${p.need}`,
    'status.myTurnPre': '내 차례 · ',
    'status.ownOnly': '· 내 타일만으로',
    'status.mine': p => `내 차례 · ${p.n ? p.n + '장 놓았어요' : '타일을 놓거나 한 장 뽑으세요'}`,
    'status.theirs': p => `${p.name}님 차례`,
    'status.placing': ' · 놓는 중…',
    'status.soon': '곧 내 차례예요',
    'block.check': p => `묶음 ${p.n}개 확인`,
    'block.keepOld': "첫 등록부터",
    'block.playOne': "1장 이상 놓기",
    'block.morePts': p => `${p.n}점 더`,

    // 턴 확정 연출
    'reveal.chip': p => `+${p.n}장 · ${p.who}`,
    'reveal.me': '나',
    'reveal.firstMeldMe': p => `첫 등록 성공! ${p.v}점`,
    'reveal.firstMeld': p => `${p.name}님 첫 등록! ${p.v}점`,
    'reveal.rebuild': p => `멋진 재배치! 묶음 ${p.n}개를 새로 맞췄어요`,
    'reveal.big': p => `와! 한 번에 ${p.n}장`,
    'reveal.tag.big': '멋진 한 수',
    'reveal.tag.first': '첫 등록',
    'reveal.tag.rebuild': '테이블 재배치',
    'reveal.tag.win': '완벽한 마무리',
    'reveal.title.first': '첫 등록 성공!',
    'reveal.title.rebuild': '멋진 재배치!',
    'reveal.title.win': '승리!',
    'reveal.rebuildDetail': p => `${p.n}개 묶음을 새로 맞췄어요`,
    'reveal.winDetail': '손패를 모두 비웠어요',
    'reveal.firstDetail': p => `${p.v}점으로 시작했어요`,
    'feel.run': '런 완성',
    'feel.group': '그룹 완성',

    // 알림·확인 창
    'toast.noBack': '테이블에 원래 있던 타일은 손패로 가져올 수 없어요',
    'toast.reset': '이번 턴 처음 상태로 돌렸어요',
    'toast.needName': '이름을 입력해 주세요',
    'toast.needCode': '방 코드 4글자를 입력해 주세요',
    'toast.linkCopied': '초대 링크를 복사했어요',
    'toast.resultCopied': '결과를 복사했어요',
    'share.title': '루미큐브 같이 해요 🙌',
    'share.text': p => `방 코드 ${p.code}`,
    'confirm.leave': '나가면 대타 봇이 내 타일과 점수를 이어받아요. 이 자리로 다시 들어올 수는 없어요. 나갈까요?',
    'confirm.draw': '놓은 타일을 되돌리고 뽑을까요?',

    // 서버 오류 (서버가 보낸 code → 내 말로)
    'err.network': '연결에 문제가 있어요',
    'err.generic': '문제가 생겼어요. 다시 시도해 주세요',
    'err.server': '서버 오류',
    'err.unknown': '없는 요청',
    'err.roomNotFound': '방을 찾을 수 없어요',
    'err.notMember': '이 방의 참가자가 아니에요',
    'err.notPlaying': '게임 중이 아니에요',
    'err.notYourTurn': '내 차례가 아니에요',
    'err.serverBusy': '서버에 방이 너무 많아요',
    'err.badCode': '방 코드를 확인해 주세요',
    'err.alreadyPlaying': '이미 게임이 진행 중이에요',
    'err.roomFull': '방이 가득 찼어요 (최대 6명)',
    'err.hostOnly': p => pick({ bot: '방장만 봇을 넣을 수 있어요', change: '방장만 바꿀 수 있어요', remove: '방장만 뺄 수 있어요', start: '방장만 시작할 수 있어요' }, p.what, '방장만 할 수 있어요'),
    'err.notDuringGame': p => pick({ bot: '게임 중에는 넣을 수 없어요', change: '게임 중에는 바꿀 수 없어요', remove: '게임 중에는 뺄 수 없어요' }, p.what, '게임 중에는 할 수 없어요'),
    'err.emptyMessage': '메시지를 입력해 주세요',
    'err.tooFast': '너무 빨라요. 잠시 후 다시 보내 주세요',
    'err.botNotFound': '봇을 찾을 수 없어요',
    'err.badLevel': '난이도를 확인해 주세요',
    'err.needTwo': '2명 이상이어야 시작할 수 있어요',
    // 규칙 판정 (rules.js checkPlay / analyze 코드)
    'rule.badRequest': '잘못된 요청',
    'rule.tableToRack': '테이블의 타일은 손패로 가져올 수 없어요',
    'rule.notYours': '내 타일이 아닌 타일이 있어요',
    'rule.playOne': '손패에서 타일을 하나 이상 내려놓아야 해요',
    'rule.setInvalid': p => `${p.index}번째 묶음: ${p.sub}`,
    'rule.meldLocked': '첫 등록 전에는 테이블의 묶음을 바꿀 수 없어요',
    'rule.meldLow': p => `첫 등록은 내 타일만으로 ${p.need}점 이상이어야 해요 (지금 ${p.have}점)`,
    'analyze.tooFew': "한 묶음에는 타일이 3장 이상 필요해요",
    'analyze.jokersOnly': '조커만으로는 묶음을 만들 수 없어요',
    'analyze.notSet': '같은 숫자 다른 색(그룹) 또는 같은 색 연속 숫자(런)가 아니에요',
    // 만드는 중인 묶음이 왜 아직 안 맞는지 (rules.js explainCode)
    'explain.needMore': p => `${p.n}장 더 필요해요`,
    'explain.jokersOnly': '조커만으로는 안 돼요',
    'explain.groupMax4': '그룹은 4장까지예요',
    'explain.sameColor': p => `같은 색이 겹쳐요 (${tileName(p.tile)})`,
    'explain.dupNum': p => `${tileName(p.tile)}${BATCHIM.has(Number(p.tile && p.tile.num)) ? '이' : '가'} 두 장이에요`,
    'explain.gap': p => `${COLORS.ko[p.color] || ''} ${(p.nums || []).join('·')} 사이에 빠진 숫자가 있어요`,
    'explain.runMax13': '런은 13까지만 이어져요',
    'explain.mixed': '같은 숫자(다른 색)나 같은 색 연속 숫자여야 해요',

    // 진행 기록 (room.log의 k)
    'log.start': p => `${p.round}판째 시작! ${p.who}님부터`,
    'log.play': p => `${p.who}님이 ${p.n}장을 내려놓았어요${p.meld ? ` (첫 등록 ${p.meld}점)` : ''}`,
    'log.draw': p => `${p.who}님이 타일을 뽑았어요${p.why ? ` (${t('log.why.' + p.why)})` : ''}`,
    'log.pass': p => `${p.who}님 패스${p.why ? ` (${t('log.why.' + p.why)})` : ''}`,
    'log.win': p => `🏆 ${p.who}님 승리!`,
    'log.leave': p => `${p.who}님이 나갔어요`,
    'log.join': p => `${p.who}님 입장`,
    'log.botJoin': p => `${p.who} 참가 (${t('level.' + p.level)})`,
    'log.botTakeover': p => p.why === 'offline' ? `${p.who}님의 연결이 끊겨 대타 봇이 이어서 플레이해요` : `${p.who}님이 나가 대타 봇이 이어서 플레이해요`,
    'log.playerReturn': p => `${p.who}님이 돌아와 직접 플레이해요`,
    'log.why.timeout': '시간 초과',
    'log.why.offline': '연결 끊김',
    // 이름 없이 혼자 연습할 때(이름이 '나')는 '나님…' 대신
    'log.start.me': p => `${p.round}판째 시작! 내가 먼저`,
    'log.play.me': p => `${p.n}장을 내려놓았어요${p.meld ? ` (첫 등록 ${p.meld}점)` : ''}`,
    'log.draw.me': p => `내가 타일을 뽑았어요${p.why ? ` (${t('log.why.' + p.why)})` : ''}`,
    'log.pass.me': p => `내 차례 패스${p.why ? ` (${t('log.why.' + p.why)})` : ''}`,
    'log.win.me': '🏆 내가 이겼어요!',

    // 화면 읽기(키보드로 놓기)
    'a11y.placeSet': p => `${p.n}번째 묶음에 놓기 (${p.tiles})`,
    'a11y.toRack': '손패로 돌려놓기',

    // 채팅
    'chat.title': '💬 이야기 나누기',
    'chat.aria': '채팅',
    'chat.close': '닫기',
    'chat.closeAria': '채팅 닫기',
    'chat.ph': '메시지 입력…',
    'chat.inputAria': '메시지',
    'chat.send': '보내기',
    'chat.empty': '아직 대화가 없어요. 먼저 인사해 보세요 🙂',
    'chat.quick': ['아멘 🙏', '👍 좋아요', '와! 👏', '할렐루야 🙌', '잠깐만요 ⏳', '축하해요 🎉', 'ㅋㅋㅋ'],
    // 봇이 하는 말 (서버 BOT_LINES와 같은 순서)
    'botline.hello': ['안녕하세요! 잘 부탁드려요 🙂', '반가워요! 즐겁게 해요 😊', '샬롬! 오늘도 은혜로운 한 판 🙏'],
    'botline.nice': ['와, 대단해요! 👏', '멋진 수예요!', '오~ 잘하시네요 👍', '할렐루야 🙌'],
    'botline.congrats': ['축하해요 🎉', '잘하셨어요! 👏', '다음 판엔 저도 힘낼게요 💪'],
    'botline.win': ['좋은 게임이었어요! 🙏', '감사합니다! 한 판 더 할까요? 😊'],

    // 결과 · 오늘의 시상식
    'ov.awards': '오늘의 시상식',
    'ov.again': '한 판 더',
    'ov.share': '📋 결과 공유',
    'ov.chat': '💬 이야기 나누기',
    'ov.winMe': "🎉 이겼어요!",
    'ov.win': p => `👏 ${p.name}님이 이겼어요!`,
    'ov.total': p => `누적 ${p.v}`,
    'ov.waitHost': '방장이 다음 판을 시작하기를 기다리는 중…',
    'ov.needTwo': '2명 이상이어야 다시 시작할 수 있어요',
    'ov.today': p => `오늘 ${p.n}판`,
    'ov.wins': p => `${p.n}번 승리`,
    'award.win.title': '승리',
    'award.win.out': '손패를 모두 내려놓았어요',
    'award.win.fewest': "남은 타일 점수가 가장 낮았어요",
    'award.together.title': "함께한 한 판",
    'award.together.played': p => `타일 ${p.n}장을 내려놓았어요`,
    'award.together.stayed': '끝까지 함께했어요',
    'award.rebuild.title': "재배치의 달인",
    'award.rebuild.d': p => `테이블 묶음 ${p.n}개를 다시 짰어요`,
    'award.bigHand.title': "시원한 한 수",
    'award.bigHand.d': p => `한 번에 ${p.n}장!`,
    'award.firstFruit.title': "첫 등록의 주인공",
    'award.firstFruit.d': p => `가장 먼저 등록했어요 (${p.value}점)`,
    'award.joker.title': '조커의 달인',
    'award.joker.d': p => `조커 ${p.n}장을 멋지게 썼어요`,
    'award.comeback.title': "추격의 달인",
    'award.comeback.d': p => `손패 ${p.from}장에서 ${p.to}장까지 줄였어요`,
    'award.endure.title': '끈기상',
    'award.endure.d': p => `${p.n}번 뽑으며 버텼어요`,
    // 단톡방 결과 공유
    'shareText.head': p => `🕊 루미큐브 · ${p.n}판째`,
    'shareText.total': p => ` (누적 ${p.v})`,
    'shareText.fourth': '4위',
    'shareText.verse': '“보라 형제가 연합하여 동거함이 어찌 그리 선하고 아름다운고” (시 133:1)',

    // ⋯ 메뉴 · 내 화면 설정
    'menu.code': '방 코드',
    'pref.volume': '효과음 크기',
    'menu.prefs': '내 화면 설정',
    'menu.leaveGame': '게임에서 나가기',
    'menu.close': '닫기',
    'pref.marks': '색 구분 기호', 'pref.marksSub': '네 가지 색을 모양으로도 알려 줘요',
    'pref.big': '큰 타일', 'pref.bigSub': '타일과 글씨를 크게',
    'pref.calm': '효과 줄이기', 'pref.calmSub': "타일 이동과 반짝임을 꺼요. 소리는 따로 설정해요.",
    'joker.cap': '조커 모양', 'joker.capSub': '(내 화면에만 보여요)',
    'joker.star': '별', 'joker.cross': '십자가', 'joker.dove': '비둘기',
    'joker.aria': p => `조커 모양 ${p.name}`,
    'sfx.on': '🔔 소리·진동', 'sfx.buzz': '📳 진동만', 'sfx.off': '🔕 끔',
    'sfx.plainOn': '🔔 소리 켜짐', 'sfx.plainOff': '🔕 소리 꺼짐',

    // TV로 보기 · QR
    'tv.aria': 'TV로 보기 — 누르면 닫혀요',
    'tv.code': '방 코드',
    'tv.hint': '폰 카메라로 찍거나, 주소를 열고 방 코드를 넣으세요 · 화면을 누르면 닫혀요',
    'qr.label': '초대 QR 코드',

    // 규칙 한눈에
    'rules.title': '📖 규칙 한눈에',
    'rules.close': '알겠어요',
    'rules.goal': "내 타일을 먼저 다 내려놓으면 이겨요. 처음에는 14장씩 받아요.",
    'rules.group': '그룹', 'rules.groupDesc': '같은 숫자 · 다른 색 3~4장',
    'rules.run': '런', 'rules.runDesc': '같은 색 · 이어지는 숫자 3장 이상',
    'rules.joker': '조커', 'rules.jokerDesc': '빈 자리를 채워요 (여기선 10)',
    'rules.jokerPre': '조커(', 'rules.jokerPost': ')는 아무 타일이나 대신해요. 끝날 때 손에 남으면 −30점',
    'rules.meldB': '첫 등록: ', 'rules.meld': '내 타일만으로 30점 이상 → 그다음부터 테이블 묶음을 쪼개고 합칠 수 있어요',
    'rules.drawB': '낼 게 없으면: ', 'rules.draw': "타일을 한 장 뽑고 차례를 넘겨요",
    'rules.endB': '끝날 때: ', 'rules.end': '남은 타일은 감점 (조커 −30)',

    // 처음 오신 분 안내
    'coach.1': '타일을 눌러 고른 뒤, 테이블의 묶음이나 ＋새 묶음을 누르세요',
    'coach.2': '첫 등록은 내 타일만으로 30점 이상이어야 해요',
    'coach.4': "이제 테이블의 묶음도 바꿀 수 있어요. 잘못 놓았다면 ↶ 취소를 누르세요.",
    'coach.never': '다시 보지 않기',
    'coach.close': '누르면 닫혀요',
  };

  const EN = {
    'lobby.nickname': 'Your nickname', 'lobby.nameEdit': 'Edit', 'lobby.nameSave': 'Save', 'lobby.nameCancel': 'Cancel',
    'lobby.nameSaved': 'Nickname changed to {name}',
    'err.badName': 'Enter a nickname (up to 12 characters)', 'err.renameLobbyOnly': 'Change your nickname in the lobby before the game starts',
    'log.rename': '{from} → {to} · nickname changed',
    'move.recent': 'Last plays', 'move.close': 'Close last play', 'move.prev': 'Previous play', 'move.next': 'Next play',
    'move.gold': 'Gold border = newly played tile', 'move.played': '{n} tiles played',
    'move.first': 'First meld · {v} points', 'move.group': 'Group', 'move.run': 'Run', 'move.count': '{n} sets',
    'music.title': 'Table music', 'music.volume': 'Music volume', 'music.on': 'On', 'music.off': 'Off',
    'music.quickOn': 'Music on', 'music.quickOff': 'Music off',
    'music.hint': 'Soft piano and marimba · saved on this device',
    'music.muted': 'Sound muted',
    'ux.keys': 'Arrow keys to move · Enter to select · Esc to clear',
    'ux.rack': 'Your tiles',
    'ux.hand': '{n} tiles in hand',
    'ux.selected': '{n} selected',
    'ux.pick': 'Select tiles, then tap a set',
    'ux.watch': 'Plan your next move',
    'ux.place': 'Place in new set',
    'ux.return': "Return to rack",
    'ux.clear': "Deselect",
    'ux.connecting': 'Connecting to the room…',
    'ux.reconnecting': 'Connection lost. Reconnecting automatically…',
    'ux.offline': 'Check your connection. A bot will fill in if you stay disconnected for 45 seconds.',
    'ux.sending': 'Sending…',
    'ux.sortNum': 'By number',
    'ux.sortColor': 'By color',
    'ux.remaining': 'Your rack is empty. Press Done to finish your turn.',

    'polish.title': 'Good moves. Better company.',
    'polish.sub': "Make your move. Share a laugh. There’s always room at the table.",
    'polish.players': '2–6 players · Friends or bots',
    'polish.devices': 'Desktop & mobile',
    'doc.title': 'Rummikub Online',
    'doc.myTurn': '▶ Your turn — Rummikub',
    'lang.label': 'Language',
    'credits.creator': 'Created by',
    'credits.name': 'Gomguk',
    'credits.contact': 'Contact',
    'credits.aria': 'Creator and contact',
    'menu.takeoverHint': 'If you leave during a game, a stand-in bot will play your tiles.',

    'home.title': 'Rummikub Online',
    'home.sub': "Play with friends or sharpen your skills solo. For 2–6 players.",
    'verse.html': 'Behold, how good and how pleasant it is<br>for brethren to dwell together in unity!',
    'verse.ref': 'Psalm 133:1',
    'home.name': 'Your name',
    'home.namePh': 'Name',
    'home.create': "Play with friends",
    'home.createSub': "Create a room and share the invite link",
    'home.practice': 'Practice solo',
    'home.practiceSub': '1–5 bots · choose difficulty',
    'home.or': 'or',
    'home.codePh': 'Room code',
    'home.join': 'Join',
    'home.rejoin': p => `▶ Back to your game (room ${p.room})`,
    'practice.name': 'Me',

    'lobby.practiceTitle': 'Practice setup',
    'lobby.friendsTitle': 'Play with friends',
    'lobby.practiceSub': "Choose your bots and their difficulty. Take your time — the timer is off by default.",
    'lobby.friendsSub': "Invite friends, add bots, or mix both. Up to 6 players can join.",
    'lobby.deckStandard': 'Standard · 106 tiles · 14 tiles each to start',
    'lobby.deckExpanded': '5–6 player edition · 160 tiles · 14 tiles each to start',
    'lobby.bots': 'Computer opponents',
    'lobby.inviteShow': 'Invite a friend · Show QR',
    'lobby.inviteHide': 'Hide invite QR',
    'lobby.botCount': p => `${p.n} bot${s(p.n)}`,
    'lobby.botHelp': p => `${p.n} more can join. Tap a bot’s difficulty to change it, or ✕ to remove it.`,
    'lobby.botFull': 'All 6 seats are taken. Remove a bot to make room. You can still change difficulty.',
    'lobby.botHostOnly': 'The host can add or remove bots and change their difficulty.',
    'lobby.levelAria': p => `${p.name}: ${p.level} difficulty. Press to change.`,
    'lobby.code': 'Room code',
    'lobby.qrAria': 'Show the QR code full screen (TV view)',
    'lobby.qrCap': 'Scan with a phone camera to join',
    'lobby.nextUrl': 'Try another address',
    'lobby.share': 'Copy invite link',
    'lobby.players': 'Players',
    'lobby.addEasy': '🤖 Add easy bot',
    'lobby.addHard': '🤖 Add hard bot',
    'lobby.timer': 'Turn timer',
    'timer.0': 'Off', 'timer.60': '60 sec', 'timer.90': '90 sec', 'timer.120': '2 min', 'timer.180': '3 min',
    'lobby.start': 'Start game',
    'lobby.leave': 'Leave room',
    'lobby.host': 'Host',
    'lobby.lvTitle': 'Click to change difficulty',
    'lobby.removeBot': 'Remove bot',
    'lobby.hintFew': "Invite a friend or add a bot to get started",
    'lobby.hintReady': "Ready when you are!",
    'lobby.hintWait': 'Waiting for the host to start…',
    'me.tag': '(you)',
    'chip.me': '(you)',
    'me.self': 'Me',
    'level.easy': 'Easy', 'level.hard': 'Hard',

    'bot.rumi': 'Robot Rumi', 'bot.cube': 'Robot Cube', 'bot.tile': 'Robot Tile', 'bot.joker': 'Robot Joker', 'bot.robot': 'Robot', 'bot.peace': 'Robot Peace',
    'botShort.rumi': 'Rumi', 'botShort.cube': 'Cube', 'botShort.tile': 'Tile', 'botShort.joker': 'Joker', 'botShort.robot': 'Robot', 'botShort.peace': 'Peace',

    'game.chat': 'Chat',
    'game.chatUnread': p => `Chat (${p.n} unread)`,
    'game.rules': 'Quick rules',
    'game.menu': 'Menu',
    'game.undo': 'Undo',
    'game.undoTitle': 'Undo last move (Ctrl+Z)',
    'game.undoAria': 'Undo last move',
    'game.reset': 'Reset',
    'game.resetTitle': 'Reset this turn',
    'game.sortNum': 'Sort by number',
    'game.sortColor': 'Sort by color',
    'game.draw': 'Draw',
    'game.pass': 'Pass',
    'game.done': 'Done',
    'game.pool': p => `Pool ${p.n}`,
    'game.clock': p => `⏱ ${p.s}s`,
    'chip.botTip': p => `Computer player · ${p.level}`,
    'chip.preTip': "Hasn’t made an initial meld yet",
    'chip.offTip': 'Disconnected',
    'chip.danger': p => `${p.n}!`,
    'chip.pre': "not opened",
    'chip.next': 'next',
    'chip.grace': p => `Bot takes over in ${p.s}s`,
    'chip.substitute': 'Stand-in bot',
    'chip.substituteThinking': 'Stand-in · thinking',
    'chip.substitutePlacing': 'Stand-in · playing…',
    'chip.substituteTip.left': 'An easy bot has taken over this player’s tiles and score.',
    'chip.substituteTip.offline': 'An easy bot is filling in while this player is disconnected. They can return to their seat.',
    'chip.placing': 'placing…',
    'chip.thinking': 'thinking',
    'chip.thinkingAria': 'Thinking…',
    'table.newSet': '＋ New set',
    'table.pickHere': "Start a new set here",
    'table.empty': 'The table is still empty',
    'table.more': p => `${p.n} more`,
    'status.over': 'Game over',
    'status.meldReady': 'First meld ready! Press Done',
    'status.meld': p => `First meld ${p.have}/${p.need}`,
    'status.myTurnPre': 'Your turn · ',
    'status.ownOnly': '· your tiles only',
    'status.mine': p => `Your turn · ${p.n ? `${p.n} tile${s(p.n)} placed` : 'play tiles or draw one'}`,
    'status.theirs': p => `${p.name}’s turn`,
    'status.placing': ' · placing…',
    'status.soon': 'You’re up next',
    'block.check': p => `check ${p.n} set${s(p.n)}`,
    'block.keepOld': 'table locked',
    'block.playOne': 'play 1+ tile',
    'block.morePts': p => `${p.n} more pt${s(p.n)}`,

    'reveal.chip': p => `+${p.n} tile${s(p.n)} · ${p.who}`,
    'reveal.me': 'You',
    'reveal.firstMeldMe': p => `You’re on the board! First meld: ${p.v} pts`,
    'reveal.firstMeld': p => `${p.name} is on the board! ${p.v} pts`,
    'reveal.rebuild': p => `Nice rearrangement! ${p.n} sets rebuilt`,
    'reveal.big': p => `Wow! ${p.n} tiles at once`,
    'reveal.tag.big': 'NICE PLAY',
    'reveal.tag.first': 'FIRST MELD',
    'reveal.tag.rebuild': 'BRILLIANT',
    'reveal.tag.win': 'VICTORY',
    'reveal.title.first': 'First meld!',
    'reveal.title.rebuild': 'Brilliant move!',
    'reveal.title.win': 'Victory!',
    'reveal.rebuildDetail': p => `${p.n} sets rebuilt`,
    'reveal.winDetail': 'Every tile played.',
    'reveal.firstDetail': p => `${p.v} points on the board`,
    'feel.run': 'Run ready',
    'feel.group': 'Group ready',

    'toast.noBack': 'Tiles that were already on the table can’t go back to your rack',
    'toast.reset': 'Back to the start of your turn',
    'toast.needName': 'Please enter your name',
    'toast.needCode': 'Please enter the 4-letter room code',
    'toast.linkCopied': 'Invite link copied',
    'toast.resultCopied': 'Results copied',
    'share.title': 'Let’s play Rummikub 🙌',
    'share.text': p => `Room code ${p.code}`,
    'confirm.leave': 'A stand-in bot will take over your tiles and score. You won’t be able to return to this seat. Leave?',
    'confirm.draw': 'Take back the tiles you placed and draw?',

    'err.network': 'Connection problem — please try again',
    'err.generic': 'Something went wrong — please try again',
    'err.server': 'Server error — please try again',
    'err.unknown': 'Unknown request',
    'err.roomNotFound': 'Can’t find that room',
    'err.notMember': 'You’re not in this room',
    'err.notPlaying': 'No game is in progress',
    'err.notYourTurn': 'It’s not your turn',
    'err.serverBusy': 'The server has too many rooms right now',
    'err.badCode': 'Please check the room code',
    'err.alreadyPlaying': 'A game is already in progress',
    'err.roomFull': 'The room is full (max 6)',
    'err.hostOnly': p => pick({ bot: 'Only the host can add bots', change: 'Only the host can change this', remove: 'Only the host can remove bots', start: 'Only the host can start the game' }, p.what, 'Only the host can do that'),
    'err.notDuringGame': p => pick({ bot: 'Can’t add bots during a game', change: 'Can’t change this during a game', remove: 'Can’t remove bots during a game' }, p.what, 'Not during a game'),
    'err.emptyMessage': 'Please type a message',
    'err.tooFast': 'A little too fast — try again in a moment',
    'err.botNotFound': 'Can’t find that bot',
    'err.badLevel': 'Please check the difficulty',
    'err.needTwo': 'You need at least 2 players to start',
    'rule.badRequest': 'Invalid move',
    'rule.tableToRack': 'Tiles on the table can’t go back to your rack',
    'rule.notYours': 'Some of those tiles aren’t yours',
    'rule.playOne': 'Play at least one tile from your rack',
    'rule.setInvalid': p => `Set ${p.index}: ${p.sub}`,
    'rule.meldLocked': 'You can’t change sets on the table before your first meld',
    'rule.meldLow': p => `Your first meld needs at least ${p.need} points from your own tiles. You have ${p.have}.`,
    'analyze.tooFew': 'A set needs at least 3 tiles',
    'analyze.jokersOnly': 'Jokers alone can’t make a set',
    'analyze.notSet': 'Not a group (same number, different colors) or a run (same color, in a row)',
    'explain.needMore': p => `Add ${p.n} more tile${s(p.n)}`,
    'explain.jokersOnly': 'Jokers alone won’t work',
    'explain.groupMax4': 'A group is 4 tiles max',
    'explain.sameColor': p => `Same color twice (${tileName(p.tile)})`,
    'explain.dupNum': p => `Duplicate tile: ${tileName(p.tile)}`,
    'explain.gap': p => `${cap(COLORS.en[p.color] || '')} ${(p.nums || []).join(', ')} aren’t in a row`,
    'explain.runMax13': 'A run stops at 13',
    'explain.mixed': 'Make a group (same number) or a run (same color)',

    'log.start': p => `Round ${p.round} started! ${p.who} goes first`,
    'log.play': p => `${p.who} played ${p.n} tile${s(p.n)}${p.meld ? ` (first meld: ${p.meld} pts)` : ''}`,
    'log.draw': p => `${p.who} drew a tile${p.why ? ` (${t('log.why.' + p.why)})` : ''}`,
    'log.pass': p => `${p.who} passed${p.why ? ` (${t('log.why.' + p.why)})` : ''}`,
    'log.win': p => `🏆 ${p.who} wins!`,
    'log.leave': p => `${p.who} left`,
    'log.join': p => `${p.who} joined`,
    'log.botJoin': p => `${p.who} joined (${t('level.' + p.level)})`,
    'log.botTakeover': p => p.why === 'offline' ? `${p.who} disconnected. A stand-in bot is filling in.` : `${p.who} left. A stand-in bot is taking over.`,
    'log.playerReturn': p => `${p.who} is back and playing again.`,
    'log.why.timeout': 'time’s up',
    'log.why.offline': 'disconnected',
    'log.start.me': p => `Round ${p.round} started! You go first`,
    'log.play.me': p => `You played ${p.n} tile${s(p.n)}${p.meld ? ` (first meld: ${p.meld} pts)` : ''}`,
    'log.draw.me': p => `You drew a tile${p.why ? ` (${t('log.why.' + p.why)})` : ''}`,
    'log.pass.me': p => `You passed${p.why ? ` (${t('log.why.' + p.why)})` : ''}`,
    'log.win.me': '🏆 You win!',

    'a11y.placeSet': p => `Place in set ${p.n} (${p.tiles})`,
    'a11y.toRack': 'Back to your rack',

    'chat.title': '💬 Chat',
    'chat.aria': 'Chat',
    'chat.close': 'Close',
    'chat.closeAria': 'Close chat',
    'chat.ph': 'Type a message…',
    'chat.inputAria': 'Message',
    'chat.send': 'Send',
    'chat.empty': 'No messages yet — say hello 🙂',
    'chat.quick': ['Amen 🙏', '👍 Nice', 'Wow! 👏', 'Hallelujah 🙌', 'One sec ⏳', 'Congrats 🎉', 'Haha 😄'],
    'botline.hello': ['Hi! Ready for a game? 🙂', 'Good to see you! Let’s play 😊', 'Shalom! Glad you’re here 🙏'],
    'botline.nice': ['Wow, amazing! 👏', 'What a move!', 'Ooh, you’re good at this 👍', 'Hallelujah 🙌'],
    'botline.congrats': ['Congratulations! 🎉', 'Well played! 👏', 'Rematch? I’ll get you next time 💪'],
    'botline.win': ['Good game, everyone! 🙏', 'Thank you! One more round? 😊'],

    'ov.awards': 'Today’s awards',
    'ov.again': 'Play again',
    'ov.share': '📋 Share',
    'ov.chat': '💬 Chat',
    'ov.winMe': "🎉 You win!",
    'ov.win': p => `👏 ${p.name} wins!`,
    'ov.total': p => `Total ${p.v}`,
    'ov.waitHost': 'Waiting for the host to start the next round…',
    'ov.needTwo': 'You need at least 2 players to play again',
    'ov.today': p => `Today · ${p.n} round${s(p.n)}`,
    'ov.wins': p => `${p.n} win${s(p.n)}`,
    'award.win.title': 'Victory',
    'award.win.out': 'Played every tile',
    'award.win.fewest': "Lowest remaining tile total",
    'award.together.title': "Good Company",
    'award.together.played': p => `Played ${p.n} tile${s(p.n)}`,
    'award.together.stayed': 'Stayed to the very end',
    'award.rebuild.title': 'Master Builder',
    'award.rebuild.d': p => `Rearranged ${p.n} table set${s(p.n)}`,
    'award.bigHand.title': 'Big Play',
    'award.bigHand.d': p => `${p.n} tiles in one turn!`,
    'award.firstFruit.title': "First to Meld",
    'award.firstFruit.d': p => `First to meld (${p.value} pts)`,
    'award.joker.title': 'Joker Master',
    'award.joker.d': p => `Put ${p.n} joker${s(p.n)} to good use`,
    'award.comeback.title': "Back in the Game",
    'award.comeback.d': p => `Went from ${p.from} tiles down to ${p.to}`,
    'award.endure.title': 'Perseverance',
    'award.endure.d': p => `Hung in there through ${p.n} draws`,
    'shareText.head': p => `🕊 Rummikub · Round ${p.n}`,
    'shareText.total': p => ` (total ${p.v})`,
    'shareText.fourth': '4th',
    'shareText.verse': '“Behold, how good and how pleasant it is for brethren to dwell together in unity!” (Psalm 133:1)',

    'menu.code': 'Room',
    'pref.volume': 'Sound effect volume',
    'menu.prefs': 'Display settings',
    'menu.leaveGame': 'Leave game',
    'menu.close': 'Close',
    'pref.marks': 'Color symbols', 'pref.marksSub': "Tell colors apart by shape, too",
    'pref.big': 'Big tiles', 'pref.bigSub': 'Larger tiles and numbers',
    'pref.calm': "Reduce motion", 'pref.calmSub': "Turn off tile movement and sparkles. Sound is a separate setting.",
    'joker.cap': 'Joker symbol', 'joker.capSub': '(only on your screen)',
    'joker.star': 'Star', 'joker.cross': 'Cross', 'joker.dove': 'Dove',
    'joker.aria': p => `Joker symbol: ${p.name}`,
    'sfx.on': '🔔 Sound & vibration', 'sfx.buzz': '📳 Vibration only', 'sfx.off': '🔕 Off',
    'sfx.plainOn': '🔔 Sound on', 'sfx.plainOff': '🔕 Sound off',

    'tv.aria': 'TV view — click or tap to close',
    'tv.code': 'Room code',
    'tv.hint': 'Scan with a phone camera, or open the address and enter the room code · Click or tap anywhere to close',
    'qr.label': 'Invite QR code',

    'rules.title': '📖 Quick rules',
    'rules.close': 'Got it',
    'rules.goal': 'Be the first to play all your tiles — everyone starts with 14',
    'rules.group': 'Group', 'rules.groupDesc': 'Same number · different colors · 3–4 tiles',
    'rules.run': 'Run', 'rules.runDesc': 'Same color · numbers in a row · 3+ tiles',
    'rules.joker': 'Joker', 'rules.jokerDesc': 'Fills any gap (here it’s a 10)',
    'rules.jokerPre': 'The Joker (', 'rules.jokerPost': ') can stand in for any tile. Left on your rack at the end: −30',
    'rules.meldB': 'First meld: ', 'rules.meld': '30+ points from your own tiles → after that you can split and combine sets on the table',
    'rules.drawB': 'Nothing to play? ', 'rules.draw': 'Draw one tile (your turn ends)',
    'rules.endB': 'At the end: ', 'rules.end': 'Tiles left on your rack count against you (Joker −30)',

    'coach.1': 'Pick tiles, then choose a set or ＋ New set',
    'coach.2': 'Your first meld needs 30+ points from your own tiles',
    'coach.4': 'Now you can split and combine sets on the table. Stuck? Use ↶ Undo!',
    'coach.never': 'Don’t show again',
    'coach.close': 'Click to close',   // 마우스를 올렸을 때만 보이는 풍선 도움말
  };

  const DICT = { ko: KO, en: EN };
  const valid = l => l === 'ko' || l === 'en';
  function detect() {
    try { const v = localStorage.getItem(KEY); if (valid(v)) return v; } catch (e) {}
    try {
      const nav = window.navigator || {};
      const list = [].concat(nav.languages && nav.languages.length ? Array.from(nav.languages) : [], nav.language || '');
      return list.some(l => /^ko\b/i.test(String(l || ''))) ? 'ko' : 'en';
    } catch (e) { return 'ko'; }
  }
  let lang = detect();
  const listeners = [];

  function has(key) { return Object.prototype.hasOwnProperty.call(KO, key); }
  function t(key, params) {
    let v = Object.prototype.hasOwnProperty.call(DICT[lang], key) ? DICT[lang][key] : undefined;
    if (v === undefined && has(key)) v = KO[key];
    if (v === undefined) return key;
    if (typeof v === 'function') {
      try { return v(params || {}); } catch (e) { return key; }
    }
    if (typeof v === 'string' && params) return v.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
    return v;
  }
  function tileName(tl) {
    if (!tl) return '';
    const c = (COLORS[lang] || COLORS.ko)[tl.color];
    return c ? `${c} ${tl.num}` : String(tl.num == null ? '' : tl.num);
  }

  // 한국어 | English 단추 (처음 화면·대기실·⋯ 메뉴의 .lang-switch 자리에)
  function buildSwitches(root) {
    (root || document).querySelectorAll('.lang-switch').forEach(box => {
      if (!box.querySelector('button')) {
        box.setAttribute('role', 'group');
        for (const [l, label] of [['ko', '한국어'], ['en', 'English']]) {
          const b = document.createElement('button');
          b.type = 'button'; b.dataset.lang = l; b.lang = l; b.textContent = label;
          b.addEventListener('click', e => { e.stopPropagation(); setLang(l); });
          box.append(b);
        }
      }
      box.querySelectorAll('button[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    });
  }
  function apply(root) {
    root = root || document;
    const each = (attr, fn) => root.querySelectorAll('[' + attr + ']').forEach(e => { try { fn(e, e.getAttribute(attr)); } catch (err) {} });
    each('data-i18n', (e, k) => { e.textContent = t(k); });
    each('data-i18n-html', (e, k) => { e.innerHTML = String(t(k)).replace(/<(?!br>)/g, '&lt;'); });   // 사전 글만, <br> 말고는 태그 없음
    each('data-i18n-ph', (e, k) => e.setAttribute('placeholder', t(k)));
    each('data-i18n-title', (e, k) => e.setAttribute('title', t(k)));
    each('data-i18n-aria', (e, k) => e.setAttribute('aria-label', t(k)));
    if (root === document || root === document.documentElement || root === document.body) {
      document.documentElement.lang = lang;
      buildSwitches(document);
    } else buildSwitches(root);
  }
  function setLang(l) {
    if (!valid(l)) return lang;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    if (l === lang) { buildSwitches(document); return lang; }
    lang = l;
    apply(document);
    document.title = t('doc.title');
    for (const fn of listeners.slice()) { try { fn(lang); } catch (e) { console.error(e); } }
    return lang;
  }
  function on(fn) { if (typeof fn === 'function') listeners.push(fn); }

  const I18N = {
    get lang() { return lang; },
    get locale() { return lang === 'ko' ? 'ko-KR' : 'en-US'; },
    t, has, setLang, on, apply, tileName,
    ko: key => (has(key) ? KO[key] : undefined),   // 한국어 원문 (옛 서버가 보낸 한국어 문장을 찾아 볼 때)
  };
  window.I18N = I18N;
  // 이 파일은 body 맨 끝(app.js 앞)에서 읽히므로 화면 요소가 이미 있음 → 바로 내 말로
  try { apply(document); document.title = t('doc.title'); } catch (e) {}
})();
