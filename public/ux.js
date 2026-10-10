/* Small, explicit helpers for the play loop. No game rules live here. */
(() => {
  let link = session ? (S ? 'ready' : 'connecting') : 'idle';
  let sort = '';
  const summary=$('#rackSummary'),guide=$('#rackGuide'),tools=$('#selectionTools');
  const sending=()=>typeof turnRequest!=='undefined' && turnRequest;
  const canSend=()=>link==='ready' && navigator.onLine!==false;
  function sync() {
    document.querySelectorAll('[data-connection]').forEach(e=>{
      const key=navigator.onLine===false && session ? 'offline' : link;
      e.classList.toggle('hidden',key==='ready'||key==='idle');
      e.textContent=tx('ux.'+key);
    });
    if (!S || lastScreen!=='game') return;
    const mine=isMyTurn(),selected=mine && W ? W.sel.size : 0;
    const onTable=new Set(mine&&W ? W.table.flat() : []);
    const hand=S.me.rack.filter(id=>!onTable.has(id)).length;
    const pending=sending();
    summary.textContent=tx(selected?'ux.selected':'ux.hand',{n:selected||hand});
    summary.classList.toggle('selected',!!selected);
    guide.textContent=tx(mine ? (hand===0 ? 'ux.remaining' : keyboardPlay() ? 'ux.keys' : 'ux.pick') : 'ux.watch');
    guide.classList.toggle('hidden',!!selected);
    tools.classList.toggle('hidden',!selected);
    $('#btnPlaceSelected').textContent=tx('ux.place');
    $('#btnReturnSelected').textContent=tx('ux.return');
    $('#btnClearSelected').textContent=tx('ux.clear');
    $('#btnClearSelected').title=tx('ux.clear')+' (Esc)';
    const canReturn=mine&&W&&[...W.sel].some(id=>S.me.rack.includes(id)&&onTable.has(id));
    $('#btnReturnSelected').classList.toggle('hidden',!canReturn);
    tools.querySelectorAll('button').forEach(b=>b.disabled=pending);
    $('#btnDraw').disabled=!mine||pending||!canSend();
    const changed=mine&&W&&R.setKeyTable(W.table)!==R.setKeyTable(S.table);
    $('#btnDone').disabled=!mine||!changed||pending||!canSend();
    $('#btnDone').setAttribute('aria-busy',String(pending));
    $('#btnDraw').setAttribute('aria-busy',String(pending));
    if(pending) { $('#btnDraw').textContent=tx('ux.sending'); $('#btnUndo').disabled=true;$('#btnReset').disabled=true; }
    else $('#btnReset').disabled=!mine;
    if (sort) {
      const key = id => { const t=R.tile(id); return t.joker ? [9,99,id] : sort==='num' ? [t.num,t.color,id] : [t.color,t.num,id]; };
      const cmp = (a,b) => { const x=key(a),y=key(b); return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]; };
      if (rackOrder.some((id,i)=>i>0&&cmp(rackOrder[i-1],id)>0)) sort='';
    }
    for(const [id,key] of [['#btnSortNum','num'],['#btnSortColor','color']]) {
      $(id).setAttribute('aria-pressed',String(sort===key));
    }
  }
  function connection(next) { link=next;sync(); }
  function place(event) {
    const fromKeyboard=event && event.detail===0;
    if (!isMyTurn()||!W||sending()) return;
    moveSelected('new');
    {
      const sets=$('#table').querySelectorAll('.set:not(.newset)');
      const last=sets[sets.length-1];
      if(last){last.scrollIntoView({block:'nearest',inline:'nearest',behavior:isCalm()?'auto':'smooth'});
      if(fromKeyboard){const tile=last.querySelector('.tile[tabindex]');if(tile)tile.focus({preventScroll:true});}}
    }
  }
  $('#btnPlaceSelected').onclick=place;
  $('#btnReturnSelected').onclick=()=>moveSelected('rack');
  $('#btnClearSelected').onclick=()=>{if(W&&!sending()){W.sel.clear();render();}};
  for(const [id,key] of [['#btnSortNum','num'],['#btnSortColor','color']]) {
    $(id).addEventListener('click',()=>{sort=key;sync();});
  }
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||e.defaultPrevented||!W||!W.sel.size||sending())return;
    if(document.querySelector('#menu:not(.hidden),#rulesSheet:not(.hidden),#tv:not(.hidden),#overlay:not(.hidden)')||chatOpen)return;
    if(e.target.matches('input,textarea,select')||e.target.isContentEditable)return;
    e.preventDefault();W.sel.clear();render();
  });
  // Arrow navigation avoids tabbing through every tile in a large hand.
  $('#game').addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)||e.ctrlKey||e.metaKey||e.altKey)return;
    const tile=e.target.closest('.tile[tabindex]');
    if(!tile||!isMyTurn())return;
    const zone=tile.closest('#rack')||tile.closest('#table');
    const items=[...zone.querySelectorAll('.tile[tabindex]')];
    const index=items.indexOf(tile);let next=null;
    if(e.key==='Home')next=items[0];else if(e.key==='End')next=items[items.length-1];
    else if(e.key==='ArrowLeft'||e.key==='ArrowRight')next=items[index+(e.key==='ArrowLeft'?-1:1)];
    else {
      const r=tile.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      const down=e.key==='ArrowDown';
      const candidates=items.filter(t=>t!==tile).map(t=>{const q=t.getBoundingClientRect();return {t,x:q.left+q.width/2,y:q.top+q.height/2};}).filter(q=>down?q.y>y+10:q.y<y-10);
      candidates.sort((a,b)=>(Math.abs(a.y-y)*4+Math.abs(a.x-x))-(Math.abs(b.y-y)*4+Math.abs(b.x-x)));
      if(candidates.length)next=candidates[0].t;
    }
    e.preventDefault();if(next){next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',inline:'nearest'});}
  });
  // The rules and result sheets also keep keyboard focus inside their visible controls.
  document.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const root=!$('#rulesSheet').classList.contains('hidden')?$('#rulesSheet'):
      !$('#menu').classList.contains('hidden')?null:
      chatOpen?null:!$('#overlay').classList.contains('hidden')?$('#overlay'):null;
    if(!root)return;
    const items=[...root.querySelectorAll('button,input,select,[href],[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.getClientRects().length);
    if(!items.length)return;
    const first=items[0],last=items[items.length-1],active=document.activeElement;
    if(!root.contains(active)||(!e.shiftKey&&active===last)){e.preventDefault();first.focus();}
    else if(e.shiftKey&&(active===first||!items.includes(active))){e.preventDefault();last.focus();}
  });
  addEventListener('offline',()=>{if(session)connection('offline');});
  addEventListener('online',()=>{if(session)connection('reconnecting');});
  I18N.on(sync);
  window.UX={sync,connection,canSend};sync();
})();
