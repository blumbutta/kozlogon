import {center,sampleGroundHeight} from './terrain.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

export function predictBombImpact(g){
 const b=g.body,p={x:b.position.x,y:b.position.y+1.2,z:b.position.z-2.6};
 const v={x:b.velocity.x,y:Math.max(7,b.velocity.y+8),z:b.velocity.z-13};
 const dt=.025,damping=Math.pow(1-.035,dt);
 let clearance=p.y-sampleGroundHeight(p.x,-p.z)-.42;
 for(let time=dt;time<=6;time+=dt){
  const before={...p},oldClearance=clearance;
  v.x*=damping;v.y=v.y*damping-24*dt;v.z*=damping;
  p.x+=v.x*dt;p.y+=v.y*dt;p.z+=v.z*dt;
  clearance=p.y-sampleGroundHeight(p.x,-p.z)-.42;
  if(clearance<=0){
   const f=clamp(oldClearance/(oldClearance-clearance),0,1);
   return {time:time-dt+dt*f,position:{x:before.x+(p.x-before.x)*f,y:before.y+(p.y-before.y)*f,z:before.z+(p.z-before.z)*f}};
  }
 }
 return null;
}

export function chooseBombTarget(engine,g){
 const impact=predictBombImpact(g);if(!impact)return null;
 const t=impact.time,targets=[];
 for(const e of engine.entities){
  if(e.kind!=='yeti'||e.destroyed||e.life<=t)continue;
  const s=-e.position.z-e.speed*t;
  const chase=engine.goats.filter(a=>!a.dead&&a.finishTime===null&&a.s<-e.position.z+30).sort((a,b)=>Math.abs(a.s+e.position.z)-Math.abs(b.s+e.position.z))[0];
  const desiredX=center(s)+(chase?clamp(chase.x,-13,13):e.baseX);
  const x=e.position.x+clamp(desiredX-e.position.x,-2.8*t,2.8*t);
  targets.push({kind:'yeti',target:e,radius:e.radius||2.5,priority:3,position:{x,y:sampleGroundHeight(x,s)+2.2,z:-s}});
 }
 for(const a of engine.goats){
  if(a.id===g.id||a.dead||a.finishTime!==null||a.invulnerable>t)continue;
  const b=a.body,x=b.position.x+b.velocity.x*t,z=b.position.z+b.velocity.z*t;
  const y=Math.max(sampleGroundHeight(x,-z)+1.05,b.position.y+b.velocity.y*t-12*t*t);
  targets.push({kind:'racer',target:a,radius:1,priority:2,position:{x,y,z}});
 }
 for(const h of engine.hazards){
  if(h.destroyed||!['bear','hunter'].includes(h.kind))continue;
  const lane=h.kind==='bear'?(h.baseX??h.x)+Math.sin((engine.elapsed+t)*1.3+h.s)*1.8:h.x;
  const x=center(h.s)+lane;
  targets.push({kind:h.kind,target:h,radius:1.5,priority:1,position:{x,y:sampleGroundHeight(x,h.s)+1,z:-h.s}});
 }
 return targets.map(a=>({...a,distance:distance(impact.position,a.position),impact}))
  .filter(a=>a.distance<5.8+a.radius-.8)
  .sort((a,b)=>b.priority-a.priority||a.distance-b.distance)[0]||null;
}
