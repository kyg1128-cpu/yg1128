/* Both table views edit the same draft and use the same server actions. */
(() => {
  'use strict';
  const q=s=>document.querySelector(s),tr=(k,p)=>I18N.t(k,p),view=window.BoardView,panel=q('#boardView'),canvas=q('#boardCanvas'),hand=q('#boardHand');
  const stock=document.createElement('span');stock.className='board-stock';q('.board-summary').append(stock);
  const toolbar=document.createElement('div');toolbar.className='board-play';
  toolbar.innerHTML='<div id="boardActionNote" class="board-action-note" role="status"></div><div class="board-play-row"><button id="boardUndo" type="button" data-i18n-aria="game.undoAria">↶</button><button id="boardPlace" type="button" data-i18n="ux.place"></button><button id="boardDraw" type="button" data-i18n="game.draw"></button><button id="boardDone" class="primary" type="button" data-i18n="game.done"></button></div><div id="boardDrawConfirm" class="board-draw-confirm hidden"><span data-i18n="confirm.draw"></span><button id="boardDrawYes" type="button" data-i18n="board.discardDraw"></button><button id="boardDrawNo" type="button" data-i18n="lobby.nameCancel"></button></div>';
  q('.board-hand').after(toolbar);
  const extras=document.createElement('div');extras.className='board-hand-tools';
  extras.innerHTML='<button id="boardClear" type="button" data-i18n="ux.clear"></button><button id="boardReturn" type="button" data-i18n="ux.return"></button><button id="boardSortNum" type="button" data-i18n-aria="game.sortNum">123</button><button id="boardSortColor" type="button" data-i18n-aria="game.sortColor">●●</button>';
  q('.board-hand>header').append(extras);I18N.apply(panel);
  let confirmation='',dragged=null;
  const local=()=>!!(view.isOpen() && isMyTurn() && W && !turnRequest);
  function controls(){
    if(!view.isOpen() || !S)return;
    stock.textContent=tr('game.pool',{n:S.pool});
    const mine=isMyTurn(),can=local(),selected=can?W.sel.size:0,changed=mine && W && R.setKeyTable(W.table)!==R.setKeyTable(S.table),send=can && (!window.UX || UX.canSend());
    q('#boardUndo').disabled=!can || !W.hist.length;q('#boardPlace').disabled=!can || !selected;
    q('#boardDraw').disabled=!send;q('#boardDone').disabled=!send || !changed;
    q('#boardDraw').textContent=tr(turnRequest?'ux.sending':S.pool?'game.draw':'game.pass');
    q('#boardDone').textContent=tr(turnRequest?'ux.sending':'game.done');
    for(const id of ['#boardSortNum','#boardSortColor'])q(id).disabled=!!turnRequest;
    q('#boardClear').classList.toggle('hidden',!selected);q('#boardClear').disabled=!can;
    const back=selected && [...W.sel].some(id=>S.me.rack.includes(id)&&W.table.flat().includes(id));
    q('#boardReturn').classList.toggle('hidden',!back);q('#boardReturn').disabled=!can;
    const block=changed?blockInfo(turnInfo()):null;
    q('#boardDone').classList.toggle('blocked',!!block);q('#boardDone').title=block?.msg||'';
    const note=q('#boardActionNote');note.classList.toggle('invalid',!!block);
    note.textContent=!mine?tr('ux.watch'):turnRequest?tr('ux.sending'):block?block.msg:tr(selected?'board.chooseTarget':changed?'board.ready':'board.playHint',{n:selected});
    q('#boardView [data-i18n="board.readOnly"]').textContent=tr(mine?'board.canPlay':'board.watching');
    const key=S.code+':'+S.round+':'+S.turnSeq;
    if(confirmation!==key || !mine || turnRequest){confirmation='';q('#boardDrawConfirm').classList.add('hidden');}
    q('#boardDrawYes').disabled=!send;
  }
  function decorate(){
    if(!view.isOpen() || !S)return;
    const can=local(),mine=isMyTurn(),table=mine && W?W.table:S.preview||S.table,selected=mine && W?W.sel:new Set();
    canvas.querySelectorAll('.board-new-set').forEach(n=>n.remove());
    [...canvas.querySelectorAll('.board-set')].forEach((set,i)=>{
      set.dataset.boardSet=String(i);set.classList.toggle('board-target',can && selected.size>0);set.classList.toggle('board-oops',mine && !!W?.oops?.has(i));
      [...set.querySelectorAll('.tile')].forEach((tile,j)=>prepare(tile,table[i]?.[j],can,selected));
      set.querySelectorAll('.board-append').forEach(n=>n.remove());
      if(can && selected.size){const add=document.createElement('button');add.type='button';add.className='board-append';add.textContent='＋';add.setAttribute('aria-label',tr('board.append',{n:i+1}));add.dataset.append=String(i);set.append(add);}
    });
    const placed=mine && W?new Set(W.table.flat()):new Set(),own=new Set(S.me.rack),ids=rackOrder.filter(id=>own.has(id)&&!placed.has(id));
    [...hand.querySelectorAll('.tile')].forEach((tile,i)=>prepare(tile,ids[i],can,selected));
    for(const zone of [canvas,hand]){const tiles=[...zone.querySelectorAll('.tile')];tiles.forEach((t,i)=>t.tabIndex=can && i===0?0:-1);}
    if(can){const add=document.createElement('button');add.type='button';add.className='board-new-set';add.dataset.append='new';add.textContent=tr('table.newSet');add.disabled=!selected.size;canvas.append(add);}
    controls();
    view.layout();
  }
  function prepare(tile,id,can,selected){
    if(id===undefined)return;
    tile.dataset.boardId=String(id);tile.classList.toggle('sel',selected.has(id));tile.draggable=can && matchMedia('(pointer:fine)').matches;
    tile.setAttribute('role',can?'button':'img');if(can)tile.setAttribute('aria-pressed',String(selected.has(id)));else tile.removeAttribute('aria-pressed');
  }
  const sync=view.sync;
  view.sync=()=>{
    const active=document.activeElement?.closest?.('#boardView .tile'),focusId=active?.dataset.boardId;
    sync();decorate();
    if(focusId && view.isOpen())panel.querySelector(`.tile[data-board-id="${focusId}"]`)?.focus({preventScroll:true});
  };
  view.controls=controls;
  function select(id){
    if(!local())return;
    W.sel.has(id)?W.sel.delete(id):W.sel.add(id);sfx('pick');render();
    const tile=panel.querySelector(`.tile[data-board-id="${id}"]`);if(tile)window.TableFeel?.pick(tile,W.sel.has(id));
  }
  panel.addEventListener('click',e=>{
    if(!local())return;
    const add=e.target.closest('[data-append]');if(add){moveSelected(add.dataset.append==='new'?'new':Number(add.dataset.append));return;}
    const tile=e.target.closest('.tile[data-board-id]');if(tile){select(Number(tile.dataset.boardId));return;}
    const set=e.target.closest('.board-set');if(set && W.sel.size){moveSelected(Number(set.dataset.boardSet));return;}
    if(e.target===hand && W.sel.size)moveSelected('rack');
  });
  panel.addEventListener('keydown',e=>{
    const tile=e.target.closest('.tile[data-board-id]');if(!tile || !local())return;
    if(e.key==='Enter'||e.key===' '){e.preventDefault();select(Number(tile.dataset.boardId));return;}
    if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
      e.preventDefault();const zone=tile.closest('#boardHand')||canvas,tiles=[...zone.querySelectorAll('.tile')],i=tiles.indexOf(tile),next=e.key==='Home'?0:e.key==='End'?tiles.length-1:Math.max(0,Math.min(tiles.length-1,i+(e.key==='ArrowLeft'?-1:1)));
      tiles.forEach((t,j)=>t.tabIndex=j===next?0:-1);tiles[next]?.focus();
    }
  });
  panel.addEventListener('dragstart',e=>{
    const tile=e.target.closest('.tile[data-board-id]');if(!tile || !local())return;
    const id=Number(tile.dataset.boardId);dragged=new Set(W.sel);if(!W.sel.has(id)){W.sel.clear();W.sel.add(id);}
    e.dataTransfer.setData('text/plain',String(id));e.dataTransfer.effectAllowed='move';sfx('pick');
    const target=canvas.querySelector('.board-new-set');if(target)target.disabled=false;
  });
  panel.addEventListener('dragover',e=>{if(local() && e.target.closest('.board-set,#boardHand,#boardPan'))e.preventDefault();});
  panel.addEventListener('drop',e=>{
    if(!local() || !dragged)return;e.preventDefault();e.stopPropagation();
    const set=e.target.closest('.board-set');dragged=null;moveSelected(set?Number(set.dataset.boardSet):e.target.closest('#boardHand')?'rack':'new');
  });
  panel.addEventListener('dragend',()=>{if(dragged && W){W.sel=dragged;dragged=null;render();}});
  q('#boardUndo').onclick=undoStep;q('#boardPlace').onclick=()=>{if(local())moveSelected('new');};q('#boardReturn').onclick=()=>{if(local())moveSelected('rack');};
  q('#boardClear').onclick=()=>{if(local()){W.sel.clear();render();}};
  for(const [id,by]of[['#boardSortNum','num'],['#boardSortColor','color']])q(id).onclick=()=>{if(!turnRequest){sortRack(by);sfx('sort');render();}};
  q('#boardDone').onclick=()=>commitTurn();
  q('#boardDraw').onclick=()=>{
    if(!local())return;
    if(R.setKeyTable(W.table)!==R.setKeyTable(S.table)){confirmation=S.code+':'+S.round+':'+S.turnSeq;q('#boardDrawConfirm').classList.remove('hidden');q('#boardDrawYes').focus();}
    else drawTile();
  };
  q('#boardDrawNo').onclick=()=>{confirmation='';q('#boardDrawConfirm').classList.add('hidden');q('#boardDraw').focus();};
  q('#boardDrawYes').onclick=()=>{if(local()){confirmation='';q('#boardDrawConfirm').classList.add('hidden');undoAll();drawTile();}};
  new MutationObserver(()=>{if(view.isOpen()){decorate();view.layout();}else{confirmation='';dragged=null;q('#boardDrawConfirm').classList.add('hidden');window.TileMotion?.clear();}}).observe(panel,{attributes:true,attributeFilter:['class']});
  I18N.on(()=>{I18N.apply(toolbar);I18N.apply(extras);view.sync();botSync();});

  const band=document.createElement('div');band.className='bot-stage hidden';q('.turn-line').after(band);
  const mini=document.createElement('span');mini.className='bot-stage-mini hidden';q('.board-summary').append(mini);
  const handSvg='<svg viewBox="0 0 32 36" aria-hidden="true"><path d="M9 19V6q0-4 4-3 2 0 2 3v8-9q0-4 4-3 2 0 2 3v10-7q0-3 3-3t3 3v14q0 8-7 11h-6l-9-9q-3-4 1-6 2-1 5 3" fill="#f7e9c5" stroke="#806d47" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const cue=document.createElement('div');cue.className='bot-hand-cue hidden';cue.innerHTML=handSvg;document.body.append(cue);let last='';
  function botSync(){
    const action=S?.botAction||{phase:'thinking',step:0,total:0,tile:null},bot=S?.players.find(p=>p.id===S.turnId && p.bot),active=!!(S?.state==='playing' && bot);
    band.classList.toggle('hidden',!active);mini.classList.toggle('hidden',!active);cue.classList.add('hidden');
    document.querySelectorAll('.bot-picked,.bot-touched').forEach(t=>t.classList.remove('bot-picked','bot-touched'));
    if(!active){last='';return;}
    const label=action.phase==='thinking'?displayName(bot)+' · '+tr('chip.thinking'):tr('botStage.'+action.phase,{name:displayName(bot),step:action.step,total:action.total});band.innerHTML=handSvg;band.append(document.createTextNode(label));mini.textContent=label.replace(displayName(bot)+' · ','');
    const source=view.isOpen()?mini:band;source.dataset.botSource='';
    const zone=view.isOpen()?panel:q('#table'),attr=view.isOpen()?'data-board-id':'data-id',tile=action.tile===null?null:zone.querySelector(`.tile[${attr}="${action.tile}"]`);
    if(tile){tile.classList.add(action.phase==='pick'?'bot-picked':'bot-touched');const r=tile.getBoundingClientRect(),clip=view.isOpen()?q('#boardPan').getBoundingClientRect():q('#table').getBoundingClientRect();if(r.bottom>clip.top && r.top<clip.bottom && r.right>clip.left && r.left<clip.right){cue.style.left=(r.left+r.width/2-12)+'px';cue.style.top=(Math.max(clip.top,r.top-25))+'px';cue.classList.remove('hidden');}}
    const key=S.code+':'+S.round+':'+S.turnSeq+':'+action.phase+':'+action.step;
    if(key!==last){
      last=key;
      if(action.phase==='pick')Sfx.play('pick',{quiet:true,buzz:false});
      if(action.phase==='place' && isCalm())Sfx.play('settle',{quiet:true,buzz:false});
      if(action.phase==='complete'){
        const done=()=>{if(last!==key || document.hidden)return;Sfx.play('valid',{quiet:true,buzz:false});const root=view.isOpen()?canvas:q('#table');root.querySelectorAll(view.isOpen()?'.board-set':'.set:not(.newset)').forEach((set,i)=>{if(i<3)window.TableFeel?.confirm(set);});};
        if(window.TileMotion?.settled)TileMotion.settled.then(ok=>{if(ok)done();});else done();
      }
    }
  }
  window.BotStage={sync:botSync};
  addEventListener('resize',()=>{cue.classList.add('hidden');});document.addEventListener('visibilitychange',()=>{if(document.hidden)cue.classList.add('hidden');});
})();
