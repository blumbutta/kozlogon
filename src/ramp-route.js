import {center,sampleGroundHeight} from './terrain.js';
import {localBoostPosition,rampSurfaceAt} from './boosts.js';

// Call this ramp branch BEFORE ai.js discards hazards with ds < 2.
export function rampRouteCost(g,h,target,horizon,pathX){
 if(!h.profile?.length||!h.width)return 0;
 const radius=1.15,half=h.width/2,front=h.profile[0].z,back=h.profile.at(-1).z;
 const current=localBoostPosition(h,g.body.position);
 if(current.z<back-radius||current.z>front+horizon+4)return 0;
 const rootY=h.body?.position.y??(sampleGroundHeight(center(h.s)+h.x,h.s)+(h.groundLift||0));
 const deckY=rootY+rampSurfaceAt(h,current.z).y;
 // A racer already supported above the deck can continue its valid ramp run.
 if(current.z<=front+radius&&current.z>=back-radius&&Math.abs(current.x)<half-radius&&g.body.position.y>=deckY+.55)return 0;
 const projected=ds=>localBoostPosition(h,{x:center(g.s+ds)+pathX(target,ds),z:-(g.s+ds)});
 let previous=current,validFrontEntry=false,value=0;
 for(let ds=0;ds<=horizon;ds+=1.5){
  const p=ds===0?current:projected(ds);
  if(previous.z>front&&p.z<=front){
   const t=(front-previous.z)/(p.z-previous.z),entryX=previous.x+(p.x-previous.x)*t;
   validFrontEntry=current.z>front&&Math.abs(entryX)<half-radius;
  }
  // Entering the solid footprint sideways or below the deck never earns a boost reward.
  if(!validFrontEntry&&p.z<=front+radius&&p.z>=back-radius&&Math.abs(p.x)<half+radius)value+=10*(1-ds/(horizon+1));
  previous=p;
 }
 // Do not penalize the apron: a predicted safe front crossing wins over low ground beneath it.
 return validFrontEntry?-2.2:value;
}

