import {center,sampleGroundHeight,lavaPathX} from './terrain.js';
import {chooseBombTarget} from './bomb-targets.js';
import {updateBotEscape} from './bot-escape.js';
import {rampRouteCost} from './ramp-route.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function botControls(engine,g,dt){
 const ai=g.ai,v=g.body.velocity,horizon=clamp(Math.max(12,-v.z)*1.45,28,65);
 updateBotEscape(engine,g,dt);
 ai.timer-=dt;
 if(ai.timer<=0){
  ai.timer=.22+(g.id%4)*.025;
  const candidates=[-13,-9,-5,0,5,9,13,ai.target,g.x].filter(x=>Math.abs(x)<=16);
  const pathX=(target,ds)=>g.x+(target-g.x)*clamp(ds/(horizon*.75),0,1);
  // All candidate lanes share the same look-ahead interval. Filter once per
  // decision, retaining source order and every ramp's existing entry checks.
  const routeHazards=[];
  for(const source of [engine.hazards,engine.pits])for(const h of source){
   if(h.destroyed||h.kind==='hunter')continue;
   const ds=h.s-g.s;if(h.kind==='ramp'||(ds>=2&&ds<=horizon))routeHazards.push(h);
  }
  const routeLava=engine.lava.filter(flow=>flow.s+flow.r+2>=g.s+4&&flow.s-flow.r-2<=g.s+horizon);
  const routeEntities=engine.entities.filter(e=>['yeti','trap','strike'].includes(e.kind)&&e.life>0&&-e.position.z-g.s>=0&&-e.position.z-g.s<=horizon);
  const routeBoosts=engine.boosts.filter(zone=>zone.s-g.s>5&&zone.s-g.s<horizon);
  const initialHeight=sampleGroundHeight(center(g.s)+g.x,g.s),groundSamples=[];
  for(let ds=8;ds<=horizon;ds+=8){const s=g.s+ds;groundSamples.push({ds,s,x:center(s)});}
  const cost=target=>{
   let value=Math.abs(target-g.x)*.06+Math.abs(target-ai.target)*.09+Math.abs(target)*.025;
   for(const h of routeHazards){
    if(h.kind==='ramp'){value+=rampRouteCost(g,h,target,horizon,pathX);continue;}
    const ds=h.s-g.s;
    const x=pathX(target,ds),r=h.r||1.5,gap=Math.abs(x-h.x);
    const dangerous=!h.kind||h.kind==='bear',padding=dangerous?2.6:1.7;
    if(gap<r+padding)value+=(dangerous?90:35)*(1-ds/(horizon*1.7))*(1-gap/(r+padding));
   }
   for(const flow of routeLava){for(let ds=4;ds<=horizon;ds+=6){const s=g.s+ds;if(Math.abs(s-flow.s)>flow.r+2)continue;const gap=Math.abs(pathX(target,ds)-lavaPathX(flow,s));if(gap<flow.halfWidth+2)value+=65*(1-gap/(flow.halfWidth+2))*(1-ds/(horizon*1.7));}}
   for(const e of routeEntities){
    const ds=-e.position.z-g.s;
    const gap=Math.abs(center(g.s+ds)+pathX(target,ds)-e.position.x);
    if(gap<(e.radius||3)+2)value+=55*(1-gap/((e.radius||3)+2));
   }
   for(const zone of routeBoosts){const ds=zone.s-g.s;if(Math.abs(pathX(target,ds)-zone.x)<zone.width*.45)value-=3.5;}
   let last=initialHeight;
   for(const sample of groundSamples){const height=sampleGroundHeight(sample.x+pathX(target,sample.ds),sample.s),slope=(height-last)/8;value+=Math.max(0,slope+.05)*1.1;last=height;}
   return value;
  };
  const scores=candidates.map(x=>({x,cost:cost(x)})).sort((a,b)=>a.cost-b.cost);
  const currentCost=scores.find(score=>score.x===ai.target)?.cost??cost(ai.target);
  if(scores[0].cost<currentCost-.35)ai.target=scores[0].x;
  ai.bombTarget=g.cd.bomb===0?chooseBombTarget(engine,g):null;
 }
 const look=clamp(Math.max(10,-v.z)*.8,12,26),course=Math.atan((center(g.s+.2)-center(g.s-.2))/.4);
 const desired=Math.atan2(center(g.s+look)+ai.target-g.body.position.x,look);
 const turn=clamp((desired-course)/engine.maxSteerAngle,-1,1);
 const frontPit=engine.pits.find(p=>p.s>g.s+2&&p.s<g.s+Math.max(9,-v.z*.45)&&Math.abs(g.x-p.x)<p.r+1.5);
 const lavaAhead=engine.lava.some(flow=>{const s=g.s+Math.max(4,-v.z*.25);return Math.abs(s-flow.s)<flow.r+1&&Math.abs(g.x-lavaPathX(flow,s))<flow.halfWidth+1;});
 if((frontPit||lavaAhead)&&g.grounded&&g.cd.jump===0)engine.ability(g,'jump');
 const aim=ai.bombTarget,target=aim?.target;
 const targetAlive=target&&!target.destroyed&&!target.dead&&target.finishTime==null&&(aim.kind!=='yeti'||target.life>0);
 if(g.cd.bomb===0&&targetAlive&&engine.random()<dt*.3)engine.ability(g,'bomb');
 if(g.id%4===0&&engine.random()<dt*.03)engine.ability(g,'trap');
 return {input:turn,drive:1};
}
