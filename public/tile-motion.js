/* Tile travel: visual copies only. Never delays a move or changes game state. */
(() => {
  const active = new Set();
  const ghosts=new Map();let moved=new Set(),settled=Promise.resolve(true);
  const tiles=()=>document.querySelectorAll(document.body.classList.contains('board-inspecting')?'#boardView .tile[data-board-id]':'#table .tile[data-id], #rack .tile[data-id]');
  const idOf=t=>t.dataset.boardId??t.dataset.id;
  const zoneOf=t=>t.closest('#rack,#boardHand')?'rack':'table';
  let round = null;
  const calm = () => document.body.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clear() { for (const stop of [...active]) stop(); if(window.TableFeel)TableFeel.clear(); }
  const visible = r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  function before(nextRound) {
    const old = new Map();
    if (round === nextRound && !document.querySelector('#game').classList.contains('hidden')) {
      tiles().forEach(t => {
        const r = (ghosts.get(idOf(t))||t).getBoundingClientRect();
        if (visible(r)) old.set(idOf(t), { r, zone: zoneOf(t) });
      });
    }
    clear();
    round = nextRound;
    return old;
  }
  function after(old) {
    if (!old.size){moved.clear();return settled=Promise.resolve(true);}
    const landings=[];let contacts=0;
    const moves = [];
    tiles().forEach(t => {
      const r=t.getBoundingClientRect();let from=old.get(idOf(t));
      if(!from && typeof S!=='undefined' && S?.botAction?.phase==='place' && String(S.botAction.tile)===idOf(t)){
        const source=document.querySelector(document.body.classList.contains('board-inspecting')?'#boardView .bot-stage-mini':'#game .bot-stage')||document.querySelector('#players .pchip.turn');
        if(source){const b=source.getBoundingClientRect();if(visible(b))from={zone:'bot',r:{left:b.left+b.width/2-r.width/2,top:b.top,width:r.width,height:r.height}};}
      }
      if (!from || !visible(r)) return;
      const zone = zoneOf(t);
      if (Math.hypot(from.r.left - r.left, from.r.top - r.top) < 12 && from.zone === zone) return;
      moves.push({t,from,r,zone});
    });
    // Limit transient layers on phones; other tiles immediately appear in their final places.
    moves.sort((a,b)=>Number(b.zone!==b.from.zone)-Number(a.zone!==a.from.zone));
    moves.slice(0,28).forEach(({t,from,r,zone},i) => {
      if (calm() || !t.animate) {
        if (zone === 'table') { t.classList.add('motion-arrived'); setTimeout(()=>t.classList.remove('motion-arrived'),350); }
        return;
      }
      const g = t.cloneNode(true);
      g.removeAttribute('data-id');g.removeAttribute('data-board-id');g.removeAttribute('id');g.removeAttribute('tabindex');g.removeAttribute('role');
      g.setAttribute('aria-hidden','true');g.draggable=false;
      g.className='tile motion-ghost ' + [...t.classList].filter(c=>/^c[0-3]$|^joker$/.test(c)).join(' ');
      Object.assign(g.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',fontSize:(parseFloat(getComputedStyle(t).fontSize)*r.width/t.offsetWidth)+'px',transformOrigin:'top left'});
      document.body.append(g);
      ghosts.set(idOf(t),g);
      const prior = t.style.visibility;t.style.visibility='hidden';
      const crossing=zone!==from.zone,duration=from.zone==='bot'?240:crossing?330:250,delay=Math.min(i*32,128);
      const contact=zone==='table' && (from.zone==='rack'||from.zone==='bot'||moved.has(Number(idOf(t)))||(typeof S!=='undefined'&&S?.botAction?.phase==='place'&&String(S.botAction.tile)===idOf(t)));
      const impact=contact && contacts++<4;
      const buzz=contact && contacts===1;
      let arrived;
      if(zone==='table')landings.push(new Promise(resolve=>{arrived=resolve;}));
      const dx=from.r.left-r.left,dy=from.r.top-r.top;
      const sx=from.r.width/r.width,sy=from.r.height/r.height;
      const a=g.animate([
        {transform:`translate(${dx}px,${dy}px) rotate(${crossing?-2:0}deg) scale(${sx},${sy})`,offset:0},
        {transform:`translate(${dx*.32}px,${dy*.32-(crossing?18:5)}px) rotate(.8deg) scale(${crossing?1.055:1.01})`,offset:.54},
        {transform:'translate(0,-3px) rotate(-.25deg) scale(1.01)',offset:.86},
        {transform:'translate(0,0) scale(1)',offset:1}
      ],{duration,delay,easing:'cubic-bezier(.22,.68,.26,1)',fill:'both'});
      let done=false, watchdog;
      const stop=(landed=false)=>{
        if(done)return;done=true;clearTimeout(watchdog);a.cancel();g.remove();ghosts.delete(idOf(t));t.style.visibility=prior;active.delete(stop);
        if(landed && zone==='table' && t.isConnected && !document.hidden) {
          t.classList.add('motion-arrived');setTimeout(()=>t.classList.remove('motion-arrived'),350);
          if(window.TableFeel)TableFeel.land(t,{impact});
          if(contact && window.Sfx) {
            Sfx.play('settle',{step:i,quiet:!buzz,buzz:false});
            if(buzz)Sfx.buzz('place');
          }
        }
        if(arrived)arrived(landed);
      };
      active.add(stop);
      // 느린 프레임에서 finish 이벤트가 밀려도 타일 복원과 접촉음을 함께 완료.
      watchdog=setTimeout(()=>stop(true),duration+delay+100);
      a.onfinish=()=>stop(true);
      a.oncancel=()=>{if(!done)stop();};
    });
    moved.clear();return settled=Promise.all(landings).then(results=>results.every(Boolean));
  }
  addEventListener('resize',clear);
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  if(preference.addEventListener)preference.addEventListener('change',clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  // Moving tiles remain interactive at their final location throughout the effect.
  document.addEventListener('scroll',e=>{if(document.body.classList.contains('board-inspecting') && !e.target.closest?.('#boardView'))return;clear();},true);
  window.TileMotion={before,after,clear,mark:ids=>{moved=new Set(ids);},get settled(){return settled;}};
})();
