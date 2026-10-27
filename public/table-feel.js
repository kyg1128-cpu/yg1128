/* Presentation only. All effects cancel on the next interaction or render. */
(() => {
  const active=new Set(), LIMIT=36;let epoch=0;
  const calm=()=>document.body.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visible=r=>r.width>0 && r.height>0 && r.top<innerHeight && r.bottom>0 && r.left<innerWidth && r.right>0;
  function clear() { epoch++;for(const stop of [...active]) stop(); }
  function later(ms,fn) {
    let timer;
    const stop=()=>{clearTimeout(timer);active.delete(stop);};
    timer=setTimeout(()=>{stop();fn();},ms);active.add(stop);
  }
  function animate(node,frames,options,remove=false) {
    if(active.size>=LIMIT || !node.animate) { if(remove)node.remove();return; }
    let done=false,timer;
    const a=node.animate(frames,{...options,fill:'none'});
    const stop=()=>{if(done)return;done=true;clearTimeout(timer);a.cancel();if(remove)node.remove();active.delete(stop);};
    active.add(stop);a.onfinish=stop;a.oncancel=stop;
    timer=setTimeout(stop,(options.duration||0)+(options.delay||0)+100);
  }
  function layer(cls,r) {
    const d=document.createElement('div');d.className=cls;d.setAttribute('aria-hidden','true');
    Object.assign(d.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});document.body.append(d);return d;
  }
  function land(tile,{impact=false}={}) {
    if(calm() || !tile.isConnected)return;
    animate(tile,[{transform:'translateY(1.5px) scale(.985,1.02)'},{transform:'translateY(-1.8px) scale(1.01,.99)',offset:.4},{transform:'none'}],{duration:210,easing:'cubic-bezier(.2,.7,.3,1)'});
    if(!impact)return;
    const r=tile.getBoundingClientRect();if(!visible(r))return;
    const ring=layer('feel-impact',{left:r.left-8,top:r.bottom-9,width:r.width+16,height:16});
    animate(ring,[{opacity:.65,transform:'scale(.55)'},{opacity:0,transform:'scale(1.35)'}],{duration:260,easing:'ease-out'},true);
  }
  function shine(set,{confirmed=false,big=false,joker=false}={}) {
    if(document.body.classList.contains('board-inspecting') && set?.dataset.set!==undefined)set=document.querySelector(`#boardCanvas [data-board-set="${set.dataset.set}"]`)||set;
    if(calm() || !set.isConnected)return;
    const raw=set.getBoundingClientRect(),table=document.querySelector(set.closest('#boardCanvas')?'#boardPan':'#table').getBoundingClientRect();
    const r={left:Math.max(raw.left,table.left,0),top:Math.max(raw.top,table.top,0),right:Math.min(raw.right,table.right,innerWidth),bottom:Math.min(raw.bottom,table.bottom,innerHeight)};
    r.width=r.right-r.left;r.height=r.bottom-r.top;if(!visible(r))return;
    const suffix=(confirmed?' confirmed':'')+(big?' big':'')+(joker?' joker':'');
    const glint=layer('feel-glint'+suffix,r);
    animate(glint,[{opacity:0,transform:'scale(.99)'},{opacity:.9,transform:'scale(1)',offset:.2},{opacity:0,transform:'scale(1.025)'}],{duration:460,easing:'ease-out'},true);
    const count=big?6:confirmed?4:3;
    for(let i=0;i<count && active.size<LIMIT;i++) {
      const dot=layer('feel-spark'+suffix,{left:r.left+r.width*(.15+i*.7/(count-1)),top:r.top+6,width:4,height:4});
      animate(dot,[{opacity:0,transform:'translate(0,0) scale(.7)'},{opacity:.85,offset:.15},{opacity:0,transform:`translate(${(i-1)*9}px,${-12-(i%2)*7}px) scale(.3)`}],{duration:400,delay:i*24,easing:'ease-out'},true);
    }
    if(confirmed) [...set.querySelectorAll('.tile')].slice(0,8).forEach((t,i)=>{
      if(t.style.visibility==='hidden')return;
      animate(t,[{transform:'none'},{transform:big?'translateY(-3px) scale(1.035)':'translateY(-2px) scale(1.025)',offset:.35},{transform:'none'}],{duration:230,delay:i*18,easing:'ease-out'});
    });
  }
  function complete(sets,{settled=null,sound='valid',step=0}={}) {
    if(!sets.length && !sound)return;
    const current=epoch;
    const show=()=>{
      if(current!==epoch)return;
      const live=sets.filter(d=>d.isConnected);if(sets.length && !live.length)return;
      live.slice(0,4).forEach(d=>{
        const badge=document.createElement('span');badge.className='feel-ready';badge.setAttribute('aria-hidden','true');
        badge.textContent='✓ '+I18N.t(d.dataset.kind==='run'?'feel.run':'feel.group');d.append(badge);
        const stop=()=>{badge.remove();active.delete(stop);};active.add(stop);later(1000,stop);shine(d);
      });
      if(sound && window.Sfx)Sfx.play(sound,{step});
    };
    if(settled && !calm())settled.then(ok=>{if(ok && current===epoch)later(35,show);});else show();
  }
  function confirm(set,options={}) { if(set)shine(set,{...options,confirmed:true}); }
  function pick(tile,selected) {
    if(!tile || calm())return;
    animate(tile,selected?[{transform:'translateY(0) rotate(-.8deg)'},{transform:'translateY(-5px) rotate(.4deg)',offset:.7},{transform:'translateY(-4px)'}]:[{transform:'translateY(-4px)'},{transform:'translateY(0)'}],{duration:selected?160:110,easing:'cubic-bezier(.2,.7,.3,1)'});
  }
  // Only the owner receives these IDs. A draw never exposes another player's tile.
  function draw(ids) {
    const inspecting=document.body.classList.contains('board-inspecting');
    const rack=document.querySelector(inspecting?'#boardHand':'#rack'),source=document.querySelector(inspecting?'#boardView .board-stock':'.stock');
    if(!rack || !source || document.hidden)return;
    ids.slice(0,3).forEach((id,i)=>{
      const tile=rack.querySelector(`.tile[${inspecting?'data-board-id':'data-id'}="${id}"]`);if(!tile)return;
      const r=tile.getBoundingClientRect(),rr=rack.getBoundingClientRect();
      if(r.top<rr.top || r.bottom>rr.bottom || !visible(r)) {
        // Large hands: reveal the tile in the rack without a flight across clipped content.
        tile.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
        if(window.Sfx)Sfx.play('rack',{quiet:true});return;
      }
      if(calm() || !tile.animate || active.size>=LIMIT) { if(window.Sfx)Sfx.play('rack',{quiet:true});return; }
      const from=source.getBoundingClientRect();if(!visible(from))return;
      const ghost=tile.cloneNode(true);ghost.removeAttribute('data-id');ghost.removeAttribute('data-board-id');ghost.removeAttribute('id');ghost.removeAttribute('role');ghost.removeAttribute('tabindex');ghost.draggable=false;
      ghost.className='tile motion-ghost draw-ghost '+[...tile.classList].filter(c=>/^c[0-3]$|^joker$/.test(c)).join(' ');ghost.setAttribute('aria-hidden','true');
      Object.assign(ghost.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',fontSize:getComputedStyle(tile).fontSize});document.body.append(ghost);
      const prior=tile.style.visibility;tile.style.visibility='hidden';
      const dx=from.left-r.left,dy=from.top-r.top,duration=390,delay=i*35;
      const a=ghost.animate([{transform:`translate(${dx}px,${dy}px) rotate(-9deg) scale(.62)`,opacity:.35},{transform:`translate(${dx*.35}px,${dy*.35-16}px) rotate(3deg) scale(1.04)`,opacity:1,offset:.58},{transform:'translate(0,-2px) rotate(-.5deg) scale(1.01)',offset:.9},{transform:'none'}],{duration,delay,easing:'cubic-bezier(.25,.72,.3,1)',fill:'both'});
      let done=false,timer;
      const stop=(landed=false)=>{if(done)return;done=true;clearTimeout(timer);a.cancel();ghost.remove();tile.style.visibility=prior;active.delete(stop);
        if(landed && tile.isConnected && !document.hidden){land(tile);if(window.Sfx)Sfx.play('rack',{quiet:true});}
      };
      active.add(stop);a.onfinish=()=>stop(true);a.oncancel=()=>stop();timer=setTimeout(()=>stop(true),duration+delay+100);
    });
  }
  const slider=document.querySelector('#effectVolume'),output=document.querySelector('#effectVolumeValue');
  if(slider && window.Sfx) {
    slider.value=Math.round(Sfx.volume*100);output.value=slider.value+'%';
    slider.addEventListener('input',()=>{Sfx.setVolume(Number(slider.value)/100);output.value=slider.value+'%';});
    slider.addEventListener('change',()=>Sfx.play('settle',{buzz:false}));
  }
  window.TableFeel={clear,land,complete,confirm,pick,draw};
})();
