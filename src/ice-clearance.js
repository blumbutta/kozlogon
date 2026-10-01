// Copy into src/ and normalize imports. Run after generating world-layout obstacles.
import {center} from './terrain.js';
import {courseBoosts,localBoostPosition} from './boosts.js';
export function clearCourseIce(obstacles,zones=courseBoosts()){
 for(const item of obstacles){
  if(item.kind==='ramp')continue;
  const radius=(item.r||1.5)+1.2;
  const clear=x=>zones.every(zone=>{
   const p=localBoostPosition(zone,{x:center(item.s)+x,z:-item.s});
   return Math.hypot(Math.max(0,Math.abs(p.x)-zone.width/2),Math.max(0,Math.abs(p.z)-zone.length/2))>=radius;
  });
  if(clear(item.x))continue;
  const original=item.x,side=original<0?-1:1;
  search:for(let step=1;step<=200;step++)for(const direction of [side,-side]){
   const x=original+direction*step*.5;
   if(Math.abs(x)<=100&&clear(x)){item.x=x;break search;}
  }
 }
 return obstacles;
}
