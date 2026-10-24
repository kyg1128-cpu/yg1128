/* Server Web Push, enabled only by a deliberate tap. No application shell is cached. */
(() => {
  const get=k=>{try{return localStorage.getItem(k);}catch{return null;}};
  const put=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
  const text=(k,p)=>I18N.t(k,p);
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.platform||'') && navigator.maxTouchPoints>1);
  const standalone=()=>matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  const supported=()=>window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let registration=null,subscription=null,info=null,busy=false,desired=get('rummi-turn-desktop')==='on',lastAttach='',acked='',installEvent=null,syncing=false;
  const button=document.getElementById('btnTurnDesktop'),testButton=document.getElementById('btnPushTest'),installButton=document.getElementById('btnInstall');
  function keyBytes(value){const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
  const sound=()=>((window.TurnAlerts?.soundEnabled ?? get('rummi-turn-sound')!=='off') && (!window.Sfx || (Sfx.mode==='on' && Sfx.volume>0)));
  function labels(){
    const installed=!(ios && !standalone()),allowed=supported() && installed;
    button.disabled=busy || !allowed;
    button.setAttribute('aria-checked',String(desired && !!subscription));
    button.textContent=text(busy?'turn.asking':!installed?'push.iosButton':desired&&subscription?'push.on':'push.enable');
    document.getElementById('turnPermissionHint').textContent=text(!installed?'push.iosInstall':!supported()?'push.unsupported':info && !info.available?'push.serverMissing':Notification.permission==='denied'?'turn.blockedHint':'push.hint');
    testButton.classList.toggle('hidden',!desired || !subscription);testButton.disabled=busy || !S;
    installButton.classList.toggle('hidden',standalone() || (!installEvent && !ios));
  }
  const ready=(async()=>{
    if(!window.isSecureContext || !('serviceWorker' in navigator)){labels();return;}
    try{
      registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      if(supported())subscription=await registration.pushManager.getSubscription();
      const response=await fetch('/api/push-info',{cache:'no-store'});if(response.ok)info=await response.json();
    }catch{}
    labels();if(S)onState(S);
  })();
  async function ack(){
    if(!desired || !subscription || !S || !session || document.hidden || !document.hasFocus() || S.state!=='playing' || S.turnId!==S.me.id)return;
    const key=`${S.code}:${S.round}:${S.turnSeq}:${session.token}`;
    if(key===acked)return;
    const owner={...session},turn=`${S.round}:${S.turnSeq}`;
    try{await api('pushAck',{...owner,endpoint:subscription.endpoint,turn});if(session?.token===owner.token)acked=key;}catch{}
  }
  async function onState(state){
    if(!state || !session || !desired || !subscription || !info?.available || syncing)return;
    const owner={...session},key=`${owner.room}:${owner.token}:${I18N.lang}:${sound()}:${subscription.endpoint}`;
    if(lastAttach!==key){
      syncing=true;
      try{await api('pushSubscribe',{...owner,subscription:subscription.toJSON(),lang:I18N.lang,sound:sound()});if(session?.token===owner.token){lastAttach=key;acked='';}}
      catch{}
      finally{syncing=false;labels();}
    }
    await ack();
  }
  async function toggle(){
    if(busy)return;
    if(ios && !standalone()){toast(text('push.iosInstall'),7000);return;}
    if(!supported()){toast(text('push.unsupported'),5000);return;}
    if(info && !info.available){toast(text('push.serverMissing'),6000);return;}
    busy=true;labels();
    try{
      // Keep this permission request directly in the user's gesture, before any network await.
      if(!desired || !subscription){
        const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
        if(permission!=='granted'){toast(text('turn.blockedHint'),5000);return;}
      }
      await ready;
      if(desired && subscription){
        if(session)await api('pushUnsubscribe',{endpoint:subscription.endpoint}).catch(()=>{});
        await subscription.unsubscribe();subscription=null;desired=false;lastAttach='';put('rummi-turn-desktop','off');
      }else{
        if(!registration || !info?.available)throw Error('serverMissing');
        const old=await registration.pushManager.getSubscription();
        if(old){const expected=keyBytes(info.publicKey),actual=old.options?.applicationServerKey;if(actual && (actual.byteLength!==expected.byteLength || !new Uint8Array(actual).every((n,i)=>n===expected[i])))await old.unsubscribe();}
        subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(info.publicKey)});
        desired=true;lastAttach='';put('rummi-turn-desktop','on');await onState(S);toast(text('push.ready'),5000);
      }
    }catch(e){toast(text(e.message==='serverMissing'?'push.serverMissing':'push.failed'),6000);}
    finally{busy=false;labels();}
  }
  testButton.addEventListener('click',async()=>{
    if(!subscription || !session)return;
    try{await api('pushTest',{endpoint:subscription.endpoint});toast(text('push.testSent'),5500);}catch(err){toast(err.message);}
  });
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;labels();});
  window.addEventListener('appinstalled',()=>{installEvent=null;labels();});
  installButton.addEventListener('click',async()=>{if(installEvent){const prompt=installEvent;installEvent=null;await prompt.prompt();await prompt.userChoice;labels();}else toast(text('push.iosInstall'),8000);});
  navigator.serviceWorker?.addEventListener('message',async event=>{
    if(event.data?.type!=='push-return' || !/^[A-Z]{4}$/.test(event.data.room||''))return;
    const room=event.data.room;
    if(session?.room===room){connect();return;}
    if(session)return;
    const saved=savedRoom(room) || (window.SeatStore?await SeatStore.find(room):null);
    if(saved){rememberRoom(saved);await enter(api('join',saved),saved);}
    else{$('#code').value=room;toast(text('push.enterCode'),5000);}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void ack();if(S)void onState(S);}});
  window.addEventListener('focus',()=>{void ack();});
  window.addEventListener('online',()=>{lastAttach='';if(S)void onState(S);});
  window.addEventListener('rummi-audio',()=>{lastAttach='';if(S)void onState(S);});
  document.getElementById('effectVolume')?.addEventListener('change',()=>{lastAttach='';if(S)void onState(S);});
  I18N.on(()=>{lastAttach='';labels();if(S)void onState(S);});
  window.PushBridge={onState,toggle,labels,refreshPreferences(){lastAttach='';if(S)void onState(S);},get subscribed(){return desired&&!!subscription;},get ready(){return ready;}};
  labels();
})();
