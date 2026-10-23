/* Public move cards and lobby identity. No private hands enter the cards. */
(() => {
  const peek=$('#movePeek'), trigger=$('#btnLastPlay');
  let key='', latest=0, plays=[], selected=0, timer, automatic=false;
  function close() { clearTimeout(timer); peek.classList.add('hidden'); trigger.setAttribute('aria-expanded','false'); }
  function clear() { close(); plays=[]; latest=0; key=''; trigger.classList.add('hidden'); }
  function position() {
    if(peek.classList.contains('hidden')) return;
    const table=$('#table').getBoundingClientRect(), short=table.height<170;
    peek.classList.toggle('compact',short);
    peek.style.maxHeight=(short?Math.max(100,innerHeight-40):Math.min(300,table.height-16))+'px';
    peek.style.bottom=(short?8:Math.max(8,innerHeight-table.bottom+8))+'px';
    peek.style.right=Math.max(8,innerWidth-table.right+8)+'px';
  }
  function draw() {
    const move=plays[selected]; if(!move) return close();
    $('#movePeekKicker').textContent=move.firstMeld?tx('move.first',{v:move.meldValue}):tx('move.played',{n:move.placed.length});
    $('#movePeekWho').textContent=displayName({id:move.actor,name:move.name,botKey:move.botKey,takeover:move.takeover});
    const box=$('#movePeekSets'); box.replaceChildren(); const fresh=new Set(move.placed);
    for(const set of move.sets) {
      const row=el('div','move-row'), analysis=R.analyze(set);
      row.append(el('small','move-kind',tx(analysis.kind==='run'?'move.run':'move.group')));
      const tiles=el('div','move-tiles');
      for(const id of set) {
        const tile=tileEl(id,{jokerAs:analysis.jokerAs?.[id]}); tile.removeAttribute('data-id'); tile.classList.toggle('played-now',fresh.has(id));
        tile.setAttribute('aria-label',tileLabel(id)); tiles.append(tile);
      }
      row.append(tiles); box.append(row);
    }
    $('#movePeekPage').textContent=`${selected+1} / ${plays.length}`;
    $('#btnPeekPrev').disabled=selected===0; $('#btnPeekNext').disabled=selected===plays.length-1;
    position();
  }
  function open(auto=false) {
    if(!plays.length || lastScreen!=='game' || document.hidden) return;
    clearTimeout(timer); automatic=auto; selected=plays.length-1;
    // A short landscape table keeps its playing space; the button still opens full details.
    if(auto && ($('#table').getBoundingClientRect().height<170 || !$('#menu').classList.contains('hidden') || !$('#overlay').classList.contains('hidden'))) return;
    peek.classList.remove('hidden'); trigger.setAttribute('aria-expanded','true'); draw();
    if(auto) timer=setTimeout(close,5200);
  }
  function sync(state,silent=false) {
    const nextKey=state.code+':'+state.round;
    if(key!==nextKey) {clear(); key=nextKey;}
    if(state.state==='lobby') {close();trigger.classList.add('hidden');return;}
    const move=state.lastPlay;
    if(!move || move.id===latest) return;
    const pinned=!peek.classList.contains('hidden')&&!automatic;
    latest=move.id; plays.push(JSON.parse(JSON.stringify(move))); if(plays.length>6){plays.shift();selected=Math.max(0,selected-1);}
    trigger.classList.remove('hidden'); trigger.classList.remove('fresh'); void trigger.offsetWidth; trigger.classList.add('fresh');
    if(pinned)draw();
    else if(!silent && move.actor!==state.me.id) { const roundKey=key,id=move.id;afterReveal(()=>{if(key===roundKey&&latest===id)open(true);}); }
  }
  trigger.setAttribute('aria-controls','movePeek');trigger.setAttribute('aria-expanded','false');
  trigger.onclick=()=>peek.classList.contains('hidden')?open(false):close();
  $('#btnPeekClose').onclick=close;
  for(const [id,dir]of[['#btnPeekPrev',-1],['#btnPeekNext',1]]) $(id).onclick=()=>{clearTimeout(timer);automatic=false;selected=Math.max(0,Math.min(plays.length-1,selected+dir));draw();};
  peek.addEventListener('pointerdown',()=>{clearTimeout(timer);automatic=false;});
  document.addEventListener('pointerdown',e=>{if(automatic && e.target instanceof Element && e.target.closest('#table,#rack,.dock,#btnMenu,#btnChat'))close();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!peek.classList.contains('hidden')){close();trigger.focus({preventScroll:true});}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
  addEventListener('resize',()=>{close();$('#chatBubble').classList.add('hidden');});
  I18N.on(()=>{close();});

  const form=$('#nicknameForm'), input=$('#lobbyNickname'), error=$('#nicknameError'); let renaming=false;
  $('#btnNicknameCancel').onclick=()=>{form.classList.add('hidden');$('#lobbyPlayers .name-edit')?.focus();};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.isComposing)e.preventDefault();if(e.key==='Escape')$('#btnNicknameCancel').click();});
  form.onsubmit=async e=>{
    e.preventDefault(); if(renaming||lobbyRequest||!S||S.state!=='lobby') return;
    if(!input.value.trim()){error.textContent=tx('err.badName');input.focus();return;}
    const owner=session, room=S.code; renaming=true;lobbyRequest=true;error.textContent='';
    input.disabled=true;for(const b of form.querySelectorAll('button'))b.disabled=true;renderLobby();
    try {
      const result=await api('rename',{name:input.value});
      if(session!==owner||S?.code!==room)return;
      nameInput.value=result.name;try{localStorage.setItem('rummi-name',result.name);}catch{}
      form.classList.add('hidden');toast(tx('lobby.nameSaved',{name:result.name}));
    } catch(err){error.textContent=err.message;}
    finally {renaming=false;lobbyRequest=false;input.disabled=false;for(const b of form.querySelectorAll('button'))b.disabled=false;if(S?.state==='lobby'){renderLobby();if(form.classList.contains('hidden'))$('#lobbyPlayers .name-edit')?.focus({preventScroll:true});}}
  };
  window.TableSocial={sync,clear,close};
  if(S)sync(S,true);
})();
