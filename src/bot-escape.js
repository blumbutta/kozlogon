import * as CANNON from 'cannon-es';
import {center} from './terrain.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Call once at the start of botControls, before ai.timer is decremented.
export function updateBotEscape(engine,g,dt){
 const ai=g.ai;
 ai.escapeCooldown=Math.max(0,(ai.escapeCooldown||0)-dt);
 ai.escapeTime=Math.max(0,(ai.escapeTime||0)-dt);
 if(ai.escapeTime>0){ai.target=ai.escapeTarget;ai.timer=Math.max(ai.timer,ai.escapeTime);}
 if(ai.progressS===undefined||g.s<ai.progressS-5||g.s>ai.progressS+1.4){ai.progressS=g.s;ai.progressTime=0;}
 else ai.progressTime=(ai.progressTime||0)+dt;
 if(ai.progressTime<2.1||ai.escapeCooldown>0||!g.grounded||g.dead||g.finishTime!==null)return false;
 const obstacles=engine.hazards.filter(h=>!h.destroyed&&['tree','house','rock','hay'].includes(h.kind)&&Math.abs(h.s-g.s)<8)
  .sort((a,b)=>Math.hypot(a.s-g.s,a.x-g.x)-Math.hypot(b.s-g.s,b.x-g.x));
 const blocker=obstacles[0],offset=blocker?g.body.position.x-(blocker.body?.position.x??center(blocker.s)+blocker.x):0;
 const side=Math.sign(Math.abs(offset)>.05?offset:ai.target-(blocker?.x??g.x))||(g.id%2?1:-1);
 ai.escapeTarget=clamp(g.x+side*6,-15,15);ai.target=ai.escapeTarget;ai.escapeTime=2.2;ai.timer=2.2;
 ai.escapeCooldown=2.8;ai.progressTime=0;ai.progressS=g.s;ai.bombTarget=null;
 const heading=Math.atan((center(g.s+.2)-center(g.s-.2))/.4),mass=g.body.mass;
 g.body.applyImpulse(new CANNON.Vec3(Math.cos(heading)*side*mass*3.6,mass*7.8,Math.sin(heading)*side*mass*3.6));
 if(g.cd.spring===0)engine.ability(g,'spring');
 g.cd.jump=Math.max(g.cd.jump,1.5);engine.event('jump',g);
 return true;
}
