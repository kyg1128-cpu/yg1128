/* Tile travel: visual copies only. Never delays a move or changes game state. */
(() => {
  const active = new Set();
  let round = null;
  const calm = () => document.body.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clear() { for (const stop of [...active]) stop(); if(window.TableFeel)TableFeel.clear(); }
  const visible = r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  function before(nextRound) {
    clear();
    const old = new Map();
    if (round === nextRound && !document.querySelector('#game').classList.contains('hidden')) {
      document.querySelectorAll('#table .tile[data-id], #rack .tile[data-id]').forEach(t => {
        const r = t.getBoundingClientRect();
        if (visible(r)) old.set(t.dataset.id, { r, zone: t.closest('#rack') ? 'rack' : 'table' });
      });
    }
    round = nextRound;
    return old;
  }
  function after(old) {
    if (!old.size) return Promise.resolve(true);
    const landings=[];let contacts=0;
    const moves = [];
    document.querySelectorAll('#table .tile[data-id], #rack .tile[data-id]').forEach(t => {
      const from = old.get(t.dataset.id), r = t.getBoundingClientRect();
      if (!from || !visible(r)) return;
      const zone = t.closest('#rack') ? 'rack' : 'table';
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
      g.removeAttribute('data-id');g.removeAttribute('id');g.removeAttribute('tabindex');g.removeAttribute('role');
      g.setAttribute('aria-hidden','true');g.draggable=false;
      g.className='tile motion-ghost ' + [...t.classList].filter(c=>/^c[0-3]$|^joker$/.test(c)).join(' ');
      Object.assign(g.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',fontSize:getComputedStyle(t).fontSize});
      document.body.append(g);
      const prior = t.style.visibility;t.style.visibility='hidden';
      const crossing=zone!==from.zone,duration=crossing?280:210,delay=Math.min(i*9,54);
      const contact=zone==='table' && from.zone==='rack';
      const impact=contact && contacts++<4;
      const buzz=contact && contacts===1;
      let arrived;
      if(zone==='table')landings.push(new Promise(resolve=>{arrived=resolve;}));
      const dx=from.r.left-r.left,dy=from.r.top-r.top;
      const a=g.animate([
        {transform:`translate(${dx}px,${dy}px) scale(1)`,offset:0},
        {transform:`translate(${dx*.2}px,${dy*.2-(crossing?12:3)}px) scale(${crossing?1.04:1.01})`,offset:.6},
        {transform:'translate(0,-2px) scale(1.01)',offset:.85},
        {transform:'translate(0,0) scale(1)',offset:1}
      ],{duration,delay,easing:'cubic-bezier(.22,.68,.26,1)',fill:'both'});
      let done=false, watchdog;
      const stop=(landed=false)=>{
        if(done)return;done=true;clearTimeout(watchdog);a.cancel();g.remove();t.style.visibility=prior;active.delete(stop);
        if(landed && zone==='table') {
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
    return Promise.all(landings).then(results=>results.every(Boolean));
  }
  addEventListener('resize',clear);
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  if(preference.addEventListener)preference.addEventListener('change',clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  // Moving tiles remain interactive at their final location throughout the effect.
  document.addEventListener('pointerdown',clear,true);
  document.addEventListener('scroll',clear,true);
  window.TileMotion={before,after,clear};
})();
