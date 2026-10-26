/* Table inspection is read-only. Its tiles never carry the interactive table's IDs. */
(() => {
  'use strict';
  const q = s => document.querySelector(s), tr = (k,p) => I18N.t(k,p);
  const timerForm=q('#customTimerForm'), timerInput=q('#customTimer'), timerError=q('#customTimerError');
  let timerRoom='', editing=false, dirty=false;
  function syncTimer() {
    if (!S) return;
    const host=S.hostId===S.me.id, value=S.settings.timer;
    if (timerRoom!==S.code || !host) { editing=false;dirty=false;timerRoom=S.code;timerError.textContent=''; }
    const custom=editing || ![0,60,90,120,180].includes(value);
    q('#timer').value=custom?'custom':String(value);
    timerForm.classList.toggle('hidden',!custom);
    if (!dirty) timerInput.value=String(value || 90);
    timerInput.disabled=!host || lobbyRequest;
    q('#btnTimerApply').classList.toggle('hidden',!host);
    q('#btnTimerApply').disabled=lobbyRequest;
    timerForm.setAttribute('aria-busy',String(lobbyRequest));
  }
  async function chooseTimer(value) {
    if (!S || S.hostId!==S.me.id || lobbyRequest) return;
    timerError.textContent='';timerInput.removeAttribute('aria-invalid');
    if (value==='custom') { editing=true;syncTimer();timerInput.focus();timerInput.select();return; }
    editing=false;dirty=false;
    await editLobby('settings',{timer:Number(value)});syncTimer();
  }
  timerInput.addEventListener('input',()=>{dirty=true;editing=true;timerError.textContent='';timerInput.removeAttribute('aria-invalid');});
  timerForm.addEventListener('submit',async e=>{
    e.preventDefault();if (!S || S.hostId!==S.me.id || lobbyRequest) return;
    const raw=timerInput.value.trim(), value=Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value<5 || value>1800) {
      timerError.textContent=tr('err.badTimer');timerInput.setAttribute('aria-invalid','true');timerInput.focus();return;
    }
    const result=await editLobby('settings',{timer:value});
    if (result) { editing=false;dirty=false;timerError.textContent=tr('timer.saved',{seconds:value}); }
    syncTimer();
  });
  window.TableCraft={syncTimer,chooseTimer,beforeStart(){
    if (S?.state==='lobby' && S.hostId===S.me.id && (editing || dirty)) {
      timerError.textContent=tr('timer.beforeStart');timerInput.focus();return false;
    }return true;
  }};

  const panel=document.createElement('section');
  panel.id='boardView';panel.className='board-view overlay hidden';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','boardViewH');
  panel.innerHTML=`<div class="board-frame"><header class="board-head"><div><small data-i18n="board.kicker"></small><h2 id="boardViewH" data-i18n="board.open"></h2></div><button id="btnBoardClose" type="button" data-i18n="board.close"></button></header><div class="board-summary"><span id="boardViewCount" role="status"></span><span data-i18n="board.readOnly"></span></div><div id="boardPan" class="board-pan" tabindex="0" data-i18n-aria="board.pan"><div id="boardSpace" class="board-space"><div id="boardCanvas" class="board-canvas"></div></div><p id="boardEmpty" class="board-empty" data-i18n="board.empty"></p></div><footer class="board-tools"><button id="btnBoardFit" type="button" data-i18n="board.fit"></button><button id="btnBoardReadable" type="button" data-i18n="board.readable"></button><div class="board-zoom"><button id="btnBoardOut" type="button" data-i18n-aria="board.out">−</button><output id="boardZoom" aria-live="polite">100%</output><button id="btnBoardIn" type="button" data-i18n-aria="board.in">+</button></div><small data-i18n="board.hint"></small></footer></div>`;
  document.body.append(panel);I18N.apply(panel);
  const live=document.createElement('span');live.className='board-live';panel.querySelector('.board-summary').append(live);
  const canvas=q('#boardCanvas'),pan=q('#boardPan'),space=q('#boardSpace');
  let openRoom='', zoom=1, fitMode=true, boardKey='', returnFocus=null, resizeFrame=0, clockTimer=0;
  const isOpen=()=>!panel.classList.contains('hidden');
  function updateClock() {
    if(!S || !isOpen())return;
    const who=S.players.find(p=>p.id===S.turnId),mine=S.turnId===S.me.id;
    const seconds=S.deadline?Math.max(0,Math.ceil((S.deadline-Date.now()-skew)/1000)):null;
    live.textContent=tr(mine?'board.myTurn':'board.theirTurn',{name:who?displayName(who):''})+(seconds===null?'':' · '+tr('board.time',{seconds}));
  }
  function measure() {
    canvas.style.width=Math.max(340,pan.clientWidth-24)+'px';
    return {width:Math.max(canvas.offsetWidth,canvas.scrollWidth),height:Math.max(canvas.offsetHeight,1)};
  }
  function layout(center=false) {
    if (!isOpen()) return;
    const size=measure(),cx=(pan.scrollLeft+pan.clientWidth/2)/(Number(canvas.dataset.zoom)||zoom),cy=(pan.scrollTop+pan.clientHeight/2)/(Number(canvas.dataset.zoom)||zoom);
    if (fitMode) zoom=Math.max(.28,Math.min(1,(pan.clientWidth-24)/size.width,(pan.clientHeight-24)/size.height));
    canvas.style.transform=`scale(${zoom})`;canvas.dataset.zoom=String(zoom);
    space.style.width=Math.max(pan.clientWidth-2,Math.ceil(size.width*zoom)+24)+'px';
    space.style.height=Math.max(pan.clientHeight-2,Math.ceil(size.height*zoom)+24)+'px';
    q('#boardZoom').value=Math.round(zoom*100)+'%';
    q('#btnBoardOut').disabled=zoom<=.28;q('#btnBoardIn').disabled=zoom>=1.6;
    q('#btnBoardFit').setAttribute('aria-pressed',String(fitMode));
    if (fitMode) { pan.scrollLeft=0;pan.scrollTop=0; }
    else if (center) { pan.scrollLeft=cx*zoom-pan.clientWidth/2;pan.scrollTop=cy*zoom-pan.clientHeight/2; }
  }
  function close(restore=true) {
    if (!isOpen()) return;
    clearInterval(clockTimer);clockTimer=0;panel.classList.add('hidden');document.body.classList.remove('board-inspecting');openRoom='';boardKey='';canvas.replaceChildren();
    for(const node of document.querySelectorAll('[data-board-inert]')){node.inert=false;node.removeAttribute('data-board-inert');}
    if (restore && returnFocus?.isConnected && !q('#game').classList.contains('hidden'))returnFocus.focus({preventScroll:true});
  }
  function sync() {
    if (!isOpen()) return;
    if (!S || S.state!=='playing' || S.code!==openRoom) { close(false);return; }
    updateClock();
    const mine=S.turnId===S.me.id;
    const table=mine && W ? W.table : (S.preview || S.table);
    // Include raw order and language/preferences, but never any opponent's rack.
    const key=JSON.stringify([table,I18N.lang,document.body.classList.contains('marks'),jokerStyle]);
    if (key===boardKey)return;
    boardKey=key;const x=pan.scrollLeft,y=pan.scrollTop;
    const fragment=document.createDocumentFragment();let count=0;
    for (const ids of table) {
      if (!ids.length)continue;
      const info=R.analyze(ids),set=document.createElement('div');set.className='board-set'+(info.ok?'':' board-invalid');
      set.setAttribute('role','group');set.setAttribute('aria-label',tr(info.ok?'board.set':'board.unfinished'));
      for (const id of ids) {
        const tile=tileEl(id,{jokerAs:info.jokerAs?.[id]});
        tile.removeAttribute('data-id');tile.setAttribute('role','img');tile.setAttribute('aria-label',tileLabel(id));set.append(tile);count++;
      }
      fragment.append(set);
    }
    canvas.replaceChildren(fragment);q('#boardEmpty').classList.toggle('hidden',count>0);
    q('#boardViewCount').textContent=tr('board.count',{sets:canvas.children.length,tiles:count});
    layout();if(!fitMode){pan.scrollLeft=x;pan.scrollTop=y;}
  }
  function open() {
    if (!S || S.state!=='playing')return;
    returnFocus=document.activeElement;openRoom=S.code;boardKey='';fitMode=true;
    panel.classList.remove('hidden');document.body.classList.add('board-inspecting');
    // Keep the background out of the keyboard/assistive-technology focus order.
    for(const node of document.body.children)if(node!==panel && !node.inert && node.tagName!=='SCRIPT' && node.tagName!=='SVG'){node.inert=true;node.dataset.boardInert='';}
    sync();clearInterval(clockTimer);clockTimer=setInterval(updateClock,500);q('#btnBoardClose').focus({preventScroll:true});
  }
  q('#btnBoardView').onclick=open;q('#btnBoardClose').onclick=()=>close();
  q('#btnBoardFit').onclick=()=>{fitMode=true;layout();};
  q('#btnBoardReadable').onclick=()=>{fitMode=false;zoom=1;layout(true);};
  for (const [id,delta] of [['#btnBoardOut',-.15],['#btnBoardIn',.15]])q(id).onclick=()=>{fitMode=false;zoom=Math.max(.28,Math.min(1.6,Math.round((zoom+delta)*100)/100));layout(true);};
  panel.addEventListener('click',e=>{if(e.target===panel)close();});
  document.addEventListener('keydown',e=>{
    if(!isOpen())return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}
    if(e.key==='Tab'){
      e.stopImmediatePropagation();
      const nodes=[...panel.querySelectorAll('button:not(:disabled),[tabindex="0"]')],i=nodes.indexOf(document.activeElement);
      if(e.shiftKey && i<=0){e.preventDefault();nodes.at(-1)?.focus();}
      else if(!e.shiftKey && (i<0 || i===nodes.length-1)){e.preventDefault();nodes[0]?.focus();}
    }
  },true);
  const resize=()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>layout());};
  if(window.ResizeObserver)new ResizeObserver(resize).observe(pan);else window.addEventListener('resize',resize);
  // Ended/lobby broadcasts do not call renderGame; close the inspector then too.
  new MutationObserver(()=>{if(isOpen() && (!S || S.state!=='playing' || q('#game').classList.contains('hidden')))close(false);}).observe(q('#game'),{attributes:true,attributeFilter:['class']});
  window.BoardView={open,close,sync};

  function syncHaptics() {
    const supported=Sfx.canBuzz,enabled=Sfx.hapticsEnabled;
    q('#btnHaptics').textContent=tr(enabled?'haptic.on':'haptic.off');q('#btnHaptics').setAttribute('aria-checked',String(enabled));q('#btnHaptics').disabled=!supported;
    q('#btnHapticTest').disabled=!supported || !enabled || Sfx.mode==='off';
    q('#hapticHint').textContent=tr(!supported?'haptic.unsupported':Sfx.mode==='off'?'haptic.muted':'haptic.hint');
    q('#btnSound').textContent=Sfx.label();
  }
  q('#btnHaptics').onclick=()=>{Sfx.setHaptics(!Sfx.hapticsEnabled);syncHaptics();};
  q('#btnHapticTest').onclick=()=>Sfx.buzz([12,65,22]);
  window.addEventListener('rummi-audio',syncHaptics);
  I18N.on(()=>{I18N.apply(panel);boardKey='';sync();syncHaptics();syncTimer();});
  syncHaptics();if(typeof S!=='undefined' && S)syncTimer();
})();
