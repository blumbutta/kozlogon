import {skiRouteX} from './world-layout.js';
import {center,sampleGroundHeight} from './terrain.js';

export function wildlifePosition(animal,time){
 if(animal.kind==='skier'){const route=animal.route,range=route.end-route.start,s=route.start+(animal.phase*range+time*animal.speed)%range,x=center(s)+skiRouteX(route,s)+Math.sin(time*1.3+animal.phase)*1.6;return {x,y:sampleGroundHeight(x,s)+animal.centerHeight,z:-s};}
 const angle=animal.phase+time*animal.speed/animal.span;
 const x=center(animal.s0)+animal.x0+Math.sin(angle)*animal.span;
 const s=animal.s0+Math.cos(angle)*1.3;
 return {x,y:sampleGroundHeight(x,s)+animal.centerHeight,z:-s};
}

// Relative swept spheres catch animals crossing between physics steps.
export function sweptSphereContact(g0,g1,a0,a1,radius){
 const rx=g0.x-a0.x,ry=g0.y-a0.y,rz=g0.z-a0.z;
 const vx=g1.x-g0.x-a1.x+a0.x,vy=g1.y-g0.y-a1.y+a0.y,vz=g1.z-g0.z-a1.z+a0.z;
 const c=rx*rx+ry*ry+rz*rz-radius*radius;if(c<=0)return 0;
 const a=vx*vx+vy*vy+vz*vz;if(a<1e-12)return null;
 const b=2*(rx*vx+ry*vy+rz*vz),disc=b*b-4*a*c;if(disc<0)return null;
 const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
}

export function resetWildlife(animals){for(const animal of animals){animal.consumed=false;animal.position=wildlifePosition(animal,0);animal.previous={...animal.position};}}

export function updateWildlife(animals,goats,time,dt,event){
 for(const animal of animals){
  if(animal.consumed)continue;
  animal.previous=animal.position||wildlifePosition(animal,time-dt);
  animal.position=wildlifePosition(animal,time);
  let winner=null,first=Infinity;
  for(const goat of goats){
   if(goat.dead||goat.finishTime!==null||goat.respawnedThisStep||!goat.previousPosition)continue;
   const p=goat.body.position;if(Math.abs(p.z-animal.position.z)>Math.abs(p.z-goat.previousPosition.z)+3)continue;
   if(animal.kind==='skier'&&Math.hypot(animal.position.x-animal.previous.x,animal.position.z-animal.previous.z)>20)continue;
   const t=sweptSphereContact(goat.previousPosition,p,animal.previous,animal.position,1.05+animal.radius);
   if(t!==null&&(t<first||(t===first&&goat.id<winner.id))){winner=goat;first=t;}
  }
  if(!winner)continue;
  animal.consumed=true;
  winner.score=(winner.score||0)+animal.points;if(animal.kind!=='skier')winner.wildlifeHits=(winner.wildlifeHits||0)+1;
  const position={x:animal.previous.x+(animal.position.x-animal.previous.x)*first,y:animal.previous.y+(animal.position.y-animal.previous.y)*first,z:animal.previous.z+(animal.position.z-animal.previous.z)*first};
  event(animal.kind==='skier'?'skierHit':'wildlifeHit',{animal,goat:winner,points:animal.points,position});
 }
}
