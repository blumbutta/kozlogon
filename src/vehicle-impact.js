import {sweptSphereContact} from './wildlife.js';

const at=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});

// The bumper follows the travel direction before Cannon resolves the impact.
// Checking both moving paths keeps fast vehicles from tunnelling through victims.
export function vehicleImpact(rider,targetFrom,targetTo,targetRadius,dt=1/90,frontOnly=false,targetVelocity=null){
 const from=rider.previousPosition||rider.body.position,to=rider.body.position;
 const velocity=rider.previousVelocity||rider.body.velocity;
 let dx=velocity.x,dz=velocity.z,speed=Math.hypot(dx,dz);
 if(speed<.25){dx=(to.x-from.x)/dt;dz=(to.z-from.z)/dt;speed=Math.hypot(dx,dz);}
 const forward=speed>.001?{x:dx/speed,z:dz/speed}:{x:0,z:-1};
 if(frontOnly){
  if(speed<2)return null;
  const targetV=targetVelocity||{x:(targetTo.x-targetFrom.x)/dt,z:(targetTo.z-targetFrom.z)/dt};
  if((dx-targetV.x)*forward.x+(dz-targetV.z)*forward.z<.5)return null;
 }
 const contacts=[];
 for(const [offset,radius] of [[0,1.4],[1.55,1.15]]){
  const a={x:from.x+forward.x*offset,y:from.y,z:from.z+forward.z*offset};
  const b={x:to.x+forward.x*offset,y:to.y,z:to.z+forward.z*offset};
  const time=sweptSphereContact(a,b,targetFrom,targetTo,radius+targetRadius);
  if(time===null)continue;
  const body=at(from,to,time),position=at(targetFrom,targetTo,time);
  if(frontOnly){
   const tx=position.x-body.x,tz=position.z-body.z,length=Math.hypot(tx,tz);
   if(length<.001||(tx*forward.x+tz*forward.z)/length<.65)continue;
  }
  contacts.push({time,position});
 }
 return contacts.sort((a,b)=>a.time-b.time)[0]||null;
}
