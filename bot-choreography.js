/* Public presentation of an already validated plan. Never chooses or draws tiles. */
'use strict';
const R=require('./public/rules');
function sequence(before,after){
  const groups=before.map(g=>g.slice()),available=new Set(groups.map((_,i)=>i)),dest=[];
  for(let i=0;i<after.length;i++){
    const exact=[...available].find(j=>R.setKey(groups[j])===R.setKey(after[i]));
    if(exact!==undefined){dest[i]=exact;available.delete(exact);}
  }
  for(let i=0;i<after.length;i++)if(dest[i]===undefined){
    let best=-1,score=0;
    for(const j of available){const overlap=groups[j].filter(id=>after[i].includes(id)).length;if(overlap>score){best=j;score=overlap;}}
    dest[i]=best<0?groups.push([])-1:best;if(best>=0)available.delete(best);
  }
  const steps=[];
  for(let i=0;i<after.length;i++)for(const id of after[i]){
    const target=dest[i];if(groups[target].includes(id))continue;
    const source=groups.findIndex(g=>g.includes(id)),wasPublic=source>=0;
    if(wasPublic)groups[source]=groups[source].filter(t=>t!==id);
    groups[target].push(id);
    const table=groups.filter(g=>g.length).map(g=>{const a=R.analyze(g);return a.ok?a.order.slice():g.slice();});
    steps.push({id,wasPublic,table});
  }
  const table=groups.filter(g=>g.length).map(g=>{const a=R.analyze(g);return a.ok?a.order.slice():g.slice();});
  return{steps,table};
}
const SPEED={easy:{pick:230,place:440},normal:{pick:170,place:350},hard:{pick:120,place:280}};
function timing(level,count,show=1100,budget=14000){
  const base=SPEED[level]||SPEED.easy,scale=Math.max(0,show)/1100;
  const hold=650*scale,desired=count*(base.pick+base.place)*scale+hold;
  const fit=desired>0?Math.min(1,Math.max(0,budget)/desired):1;
  return{pick:Math.round(base.pick*scale*fit),place:Math.round(base.place*scale*fit),hold:Math.round(hold*fit)};
}
module.exports={sequence,timing,SPEED};
