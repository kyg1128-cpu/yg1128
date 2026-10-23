/* Original 16-bar miniature: felt piano, soft marimba and warm bass. No downloads. */
(() => {
  let enabled=true, volume=.18, scene='home', bus=null, ticker=null, beat=0, next=0;
  const nodes=new Set();
  try {enabled=localStorage.getItem('rummi-music')!=='off';const v=localStorage.getItem('rummi-music-volume');if(v!==null&&Number.isFinite(+v))volume=Math.max(0,Math.min(.6,+v));}catch{}
  const note=n=>440*Math.pow(2,(n-69)/12), step=60/78;
  const chords=[[48,55,60,64,67,74],[45,52,57,60,64,67],[41,48,53,57,60,67],[43,50,55,59,62,69]];
  const tune=[[76,-1,74,72,67,-1,69,72],[76,74,72,-1,69,-1,67,-1],[69,-1,72,76,74,-1,72,69],[67,-1,69,71,74,-1,72,-1],
    [79,-1,76,74,72,-1,74,76],[76,-1,72,69,67,-1,69,-1],[72,74,76,-1,74,72,69,-1],[71,-1,69,67,62,-1,67,-1]];
  function voice(midi,time,length,level,kind='piano') {
    const c=bus.context, gain=c.createGain(), f=note(midi);
    gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(level,time+.006);
    gain.gain.exponentialRampToValueAtTime(.0001,time+length);
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=kind==='bass'?620:3400;filter.Q.value=.4;
    gain.connect(filter);filter.connect(bus.gain);
    const oscillators=[];
    const partials=kind==='piano'?[[1,1],[2,.22],[3,.055]]:kind==='marimba'?[[1,1],[4,.085]]:[[1,1],[2,.12]];
    for(const [ratio,weight]of partials) {
      const o=c.createOscillator(), part=c.createGain();o.type='sine';o.frequency.value=f*ratio;part.gain.value=weight;
      o.connect(part);part.connect(gain);o.start(time);o.stop(time+length+.04);oscillators.push(o);
      o.onended=()=>{o.disconnect();part.disconnect();};
    }
    const entry={gain,oscillators};nodes.add(entry);
    oscillators[0].addEventListener('ended',()=>{nodes.delete(entry);gain.disconnect();filter.disconnect();});
  }
  function schedule() {
    if(!bus || document.hidden)return;
    const c=bus.context;
    if(next<c.currentTime-.15)next=c.currentTime+.035;
    while(next<c.currentTime+.3) {
      const bar=Math.floor(beat/8)%16, at=beat%8, chord=chords[bar%4];
      if(at===0||at===4)voice(chord[0],next,.7,.16,'bass');
      const arpeggio=[2,4,3,5,2,3,4,5][at];
      voice(chord[arpeggio]+(bar>=8?12:0),next,scene==='game'?.85:1.15,.11,'piano');
      const melody=tune[bar%8][at];
      if(melody>0 && (bar<8||at%2===0))voice(melody,next+.012,.55,scene==='game'?.07:.10,'marimba');
      next+=step/2;beat++;
    }
  }
  function stop() {
    clearInterval(ticker);ticker=null;
    if(!bus)return;const now=bus.context.currentTime;
    bus.gain.gain.cancelScheduledValues(now);bus.gain.gain.setTargetAtTime(0,now,.025);
    for(const entry of nodes){for(const o of entry.oscillators)try{o.stop(now+.08);}catch{}}
    nodes.clear();
  }
  function labels() {
    const t=k=>window.I18N?I18N.t(k):k;
    for(const id of ['btnMusic','btnMusicQuick']){const b=document.getElementById(id);if(b)b.setAttribute('aria-checked',String(enabled));}
    const muted=enabled&&window.Sfx&&Sfx.mode!=='on';
    const s=document.getElementById('musicState');if(s)s.textContent=t(muted?'music.muted':enabled?'music.on':'music.off');
    const q=document.getElementById('musicQuickLabel');if(q)q.textContent=t(muted?'music.muted':enabled?'music.quickOn':'music.quickOff');
    const slider=document.getElementById('musicVolume'), out=document.getElementById('musicVolumeValue');
    if(slider)slider.value=Math.round(volume*100);if(out)out.textContent=Math.round(volume*100)+'%';
  }
  function sync(gesture=false) {
    labels();
    if(!enabled || volume===0 || document.hidden || !window.Sfx || Sfx.mode!=='on'){stop();return;}
    if(!bus) {
      bus=Sfx.musicBus(gesture);
      if(bus)bus.context.addEventListener('statechange',()=>{if(bus.context.state==='running')sync(false);else stop();});
    }
    if(!bus)return;
    if(bus.context.state!=='running')return;
    bus.gain.gain.setTargetAtTime(volume*.62,bus.context.currentTime,.15);
    if(ticker!==null)return;
    next=bus.context.currentTime+.04;schedule();ticker=setInterval(schedule,120);
  }
  function setEnabled(value) {enabled=!!value;try{localStorage.setItem('rummi-music',enabled?'on':'off');}catch{}sync(true);return enabled;}
  function setVolume(value) {if(!Number.isFinite(value))return volume;volume=Math.max(0,Math.min(.6,value));try{localStorage.setItem('rummi-music-volume',String(volume));}catch{}sync(true);return volume;}
  function setScene(value) {
    scene=value;const quick=document.getElementById('btnMusicQuick');if(!quick)return;
    quick.classList.toggle('hidden',scene==='game');
    if(scene==='lobby')document.querySelector('.lobby-intro')?.append(quick);
    else if(scene==='home'){const lang=document.querySelector('#home .lang-switch');if(lang)lang.before(quick);}
  }
  for(const id of ['btnMusic','btnMusicQuick'])document.getElementById(id)?.addEventListener('click',()=>setEnabled(!enabled));
  document.getElementById('musicVolume')?.addEventListener('input',e=>setVolume(Number(e.target.value)/100));
  for(const event of ['pointerup','touchend','keydown'])addEventListener(event,()=>sync(true),{passive:true});
  document.addEventListener('visibilitychange',()=>sync(false));
  addEventListener('pagehide',stop);addEventListener('pageshow',()=>sync(false));addEventListener('rummi-audio',()=>sync(false));
  if(window.I18N)I18N.on(labels);
  window.TableMusic={setEnabled,setVolume,setScene,get enabled(){return enabled;},get volume(){return volume;},get playing(){return ticker!==null;}};
  labels();setScene('home');
})();
