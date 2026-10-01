// Copy into src/ and change this import to './terrain.js'.
import {center,sampleGroundHeight} from './terrain.js';

// Target identity stays fixed for 1.4..3 seconds; projectiles keep their launch trajectory.
export function chooseHazardTarget(engine,hazard,range){
 const now=engine.elapsed||0,s=hazard.position?-hazard.position.z:hazard.s;
 const origin=hazard.position||{x:center(s)+(hazard.x||0),y:sampleGroundHeight(center(s)+(hazard.x||0),s)+1.65,z:-s};
 const candidates=engine.goats.filter(g=>!g.dead&&g.finishTime==null&&g.body&&
  (hazard.kind!=='yeti'||g.s<=s+10)&&
  Math.hypot(g.body.position.x-origin.x,g.body.position.y-origin.y,g.body.position.z-origin.z)<=range);
 const held=candidates.find(g=>g.id===hazard.targetId);
 if(held&&hazard.targetUntil>now)return held;
 if(!candidates.length){hazard.targetId=null;hazard.targetUntil=0;return null;}
 const counts=new Map(candidates.map(g=>[g.id,0]));
 for(const other of [...engine.hazards,...engine.entities]){
  if(!['yeti','hunter','gunner'].includes(other.kind)||other===hazard||other.destroyed||other.life<=0||other.targetUntil<=now||other.targetId==null)continue;
  if(counts.has(other.targetId))counts.set(other.targetId,counts.get(other.targetId)+1);
 }
 const least=Math.min(...counts.values()),pool=candidates.filter(g=>counts.get(g.id)===least);
 const target=pool[Math.min(pool.length-1,Math.floor(engine.envRandom()*pool.length))];
 hazard.targetId=target.id;hazard.targetUntil=now+1.4+engine.envRandom()*1.6;
 return target;
}

