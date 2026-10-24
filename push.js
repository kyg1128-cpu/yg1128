const crypto = require('node:crypto');
const webpush = require('web-push');

// Push endpoints are capability URLs, kept only on their authenticated player's seat.
function subscriptionOf(value) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) return null;
  try {
    const u = new URL(value.endpoint), host = u.hostname.toLowerCase();
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
      host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !allowed) return null;
    const keys = value.keys;
    if (!keys || !/^[\w-]{80,100}$/.test(keys.p256dh) || !/^[\w-]{20,30}$/.test(keys.auth)) return null;
    const key = Buffer.from(keys.p256dh, 'base64url'), auth = Buffer.from(keys.auth, 'base64url');
    if (key.length !== 65 || key[0] !== 4 || auth.length !== 16) return null;
    crypto.ECDH.convertKey(key, 'prime256v1');
    return { endpoint:u.href, keys:{p256dh:keys.p256dh,auth:keys.auth} };
  } catch { return null; }
}
function createPushService({ config, send = webpush.sendNotification.bind(webpush), delay = 1300 } = {}) {
  let vapid;
  try {
    vapid = config || JSON.parse(process.env.WEB_PUSH_VAPID || '{}');
    webpush.getVapidHeaders('https://example.com', vapid.subject, vapid.publicKey, vapid.privateKey, 'aes128gcm');
  } catch { vapid = null; }
  const available = !!vapid;
  const jobs = new Set();
  const turnKey = room => `${room.round}:${room.turnSeq}`;
  function attach(p, subscription, lang, sound) {
    const clean = subscriptionOf(subscription); if (!available || !clean) return false;
    if (!p.push) p.push = new Map();
    const old = p.push.get(clean.endpoint);
    if (!old && p.push.size >= 3) p.push.delete(p.push.keys().next().value);
    p.push.set(clean.endpoint, {subscription:clean,lang:lang==='en'?'en':'ko',sound:sound!==false,ack:old?.ack || '',lastSent:old?.lastSent || ''});
    return true;
  }
  function ack(room,p,endpoint,key) { const device=p.push?.get(endpoint); if(device && key===turnKey(room))device.ack=key; }
  function payload(room,device,test=false) {
    const en=device.lang==='en';
    return {title:en?(test?'Turn alerts are ready':'Your turn!'):(test?'내 차례 알림이 준비됐어요':'내 차례예요!'),
      body:en?`Room ${room.code} · Tap to return to the table.`:`방 ${room.code} · 알림을 누르면 테이블로 돌아가요.`,
      room:room.code,url:`/?r=${room.code}`,tag:`rummikub-${room.code}`,silent:!device.sound,expiresAt:Date.now()+30000};
  }
  async function deliver(room,p,endpoint,device,test=false) {
    if (!available) return false;
    try {
      const result=await send(device.subscription,JSON.stringify(payload(room,device,test)),{vapidDetails:vapid,TTL:30,urgency:'high',topic:crypto.createHash('sha256').update(room.code+':'+p.id).digest('base64url').slice(0,32),timeout:7000});
      device.lastStatus=result.statusCode; return true;
    } catch (e) {
      device.lastStatus=Number(e.statusCode)||0;
      if(e.statusCode===404 || e.statusCode===410) { if(p.push?.get(endpoint)===device)p.push.delete(endpoint); }
      return false;
    }
  }
  function notifyTurn(room,valid) {
    if(!available || room.state!=='playing')return;
    const p=room.players[room.turn],key=turnKey(room);
    if(!p || (p.bot && p.takeover!=='offline') || !p.push?.size)return;
    for(const [endpoint,device]of p.push) {
      const timer=setTimeout(()=>{
        jobs.delete(timer);
        if(!valid() || room.state!=='playing' || room.players[room.turn]!==p || turnKey(room)!==key || p.takeover==='left' || p.push?.get(endpoint)!==device || device.ack===key || device.lastSent===key)return;
        device.lastSent=key;void deliver(room,p,endpoint,device);
      },p.takeover==='offline'?0:delay);timer.unref();jobs.add(timer);
    }
  }
  return {available,publicKey:vapid?.publicKey || null,attach,ack,notifyTurn,
    detach:(p,endpoint)=>p.push?.delete(endpoint),
    async test(room,p,endpoint) {const d=p.push?.get(endpoint);return d?deliver(room,p,endpoint,d,true):false;},
    close(){for(const timer of jobs)clearTimeout(timer);jobs.clear();}};
}
module.exports={createPushService,subscriptionOf};
