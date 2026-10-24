/* A second, transactional copy of seat credentials survives tab/browser crashes. */
(() => {
  const valid=s=>s && /^[A-Z]{4}$/.test(s.room) && typeof s.token==='string' && s.token.length>0 && s.token.length<=128;
  const database=new Promise(resolve=>{
    try {
      const request=indexedDB.open('rummikub-seats',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('seats',{keyPath:'room'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);
    } catch {resolve(null);}
  });
  async function transaction(mode,action) {
    const db=await database;if(!db)return null;
    return new Promise(resolve=>{try{const tx=db.transaction('seats',mode),store=tx.objectStore('seats');let result=null;action(store,value=>result=value);tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>resolve(null);}catch{resolve(null);}});
  }
  async function list(){return(await transaction('readonly',(s,done)=>{const q=s.getAll();q.onsuccess=()=>done(q.result);})||[]).filter(valid).sort((a,b)=>b.at-a.at);}
  async function put(value){if(!valid(value))return;await transaction('readwrite',s=>s.put({room:value.room,token:value.token,at:Date.now()}));const rows=await list();for(const row of rows.slice(10))await remove(row);}
  async function remove(value){if(!valid(value))return;await transaction('readwrite',s=>{const q=s.get(value.room);q.onsuccess=()=>{if(q.result?.token===value.token)s.delete(value.room);};});}
  window.SeatStore={put,remove,list,async find(room){return(await list()).find(s=>s.room===room)||null;}};
})();
