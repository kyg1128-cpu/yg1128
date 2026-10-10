/* Tile travel: visual copies only. Never delays a move or changes game state. */
(() => {
  const active = new Set();
  let round = null;
  const calm = () => document.body.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clear() { for (const stop of [...active]) stop(); }
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
    if (!old.size) return;
    const moves = [];
    document.querySelectorAll('#table .tile[data-id], #rack .tile[data-id]').forEach(t => {
      const from = old.get(t.dataset.id), r = t.getBoundingClientRect();
      if (!from || !visible(r)) return;
      const zone = t.closest('#rack') ? 'rack' : 'table';
      if (Math.hypot(from.r.left - r.left, from.r.top - r.top) < 12 && from.zone === zone) return;
      moves.push({t,from,r,zone});
    });
    // Limit transient layers on phones; other tiles immediately appear in their final places.
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
      const duration=zone===from.zone?220:280;
      const dx=from.r.left-r.left,dy=from.r.top-r.top;
      const a=g.animate([
        {transform:`translate(${dx}px,${dy}px) scale(1)`,offset:0},
        {transform:'translate(0,-2px) scale(1.025)',offset:.83},
        {transform:'translate(0,0) scale(1)',offset:1}
      ],{duration,delay:Math.min(i*7,70),easing:'cubic-bezier(.2,.75,.25,1)',fill:'both'});
      let done=false, watchdog;
      const stop=()=>{if(done)return;done=true;clearTimeout(watchdog);a.cancel();g.remove();t.style.visibility=prior;active.delete(stop);};
      active.add(stop);
      watchdog=setTimeout(stop,duration+Math.min(i*7,70)+100);
      a.onfinish=()=>{stop();if(zone==='table'){t.classList.add('motion-arrived');setTimeout(()=>t.classList.remove('motion-arrived'),350);}};
      a.oncancel=()=>{if(!done)stop();};
    });
  }
  addEventListener('resize',clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  // Moving tiles remain interactive at their final location throughout the effect.
  document.addEventListener('pointerdown',clear,true);
  window.TileMotion={before,after,clear};
})();
