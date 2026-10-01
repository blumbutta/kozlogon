import * as CANNON from 'cannon-es';
import {LENGTH,CELL,MIN_X,MIN_S,center,terrainData,sampleGroundHeight,baseTerrainHeight,spikePits,lavaFlows,lavaContact} from './terrain.js';
import {resetWildlife,updateWildlife,sweptSphereContact} from './wildlife.js';
import {spawnPosition} from './racers.js';
import {courseBoosts,localBoostPosition,rampSurfaceAt} from './boosts.js';
import {botControls} from './ai.js';
import {chooseHazardTarget} from './combat-targets.js';
import {getActiveWorld} from './worlds.js';
export {LENGTH};
export const MAX_STEER_ANGLE=.48;
export const WEATHER=getActiveWorld().weather;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const point=p=>({x:p.x,y:p.y,z:p.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const roadDerivative=s=>(center(s+.2)-center(s-.2))/.4;
const newStats=()=>({kills:{},bombs:0,traps:0,deaths:0,snowmobiles:0,deathReasons:{}});
function groundNormal(x,s){
 const nx=-(sampleGroundHeight(x+.3,s)-sampleGroundHeight(x-.3,s))/.6;
 const nz=(sampleGroundHeight(x,s+.3)-sampleGroundHeight(x,s-.3))/.6;
 const n=new CANNON.Vec3(clamp(nx,-.5,.5),1,clamp(nz,-1.2,1.2));n.normalize();return n;
}
export class RaceEngine {
 constructor(goats,hazards,event=()=>{},options={}){
  this.maxSteerAngle=MAX_STEER_ANGLE;this.mountain=getActiveWorld();this.pits=spikePits();this.lava=lavaFlows();
  this.goats=goats;this.hazards=hazards;this.event=event;this.wildlife=options.wildlife||[];this.skiers=options.skiers||[];
  this.boosts=options.boosts||courseBoosts();
  this.snowmobiles=options.snowmobiles||[];
  this.phase='intro';this.entities=[];this.elapsed=0;this.counter=3.2;this.weatherIndex=0;this.serial=0;this.seed=42;
  this.environmentSeed=912;this.planeTimer=14;this.lightningTimer=2;this.yetiTimer=9;this.celebrateRemaining=0;
  resetWildlife(this.wildlife);resetWildlife(this.skiers);
  for(const g of goats)Object.assign(g,{score:0,kills:0,rage:0,wildlifeHits:0,stuckTime:0,boostTime:0,boostRampId:null,boostSeen:new Set(),stats:newStats(),rideTime:0});
  this.setupPhysics();
 }
 setupPhysics(){
  this.world=new CANNON.World({gravity:new CANNON.Vec3(0,-24*this.mountain.gravityScale,0),allowSleep:false});
  this.world.broadphase=new CANNON.SAPBroadphase(this.world);this.world.solver.iterations=10;
  this.world.defaultContactMaterial.friction=.4;this.world.defaultContactMaterial.restitution=.23;
  const material=this.groundMaterial=new CANNON.Material({friction:1,restitution:1});
  const ground=this.groundBody=new CANNON.Body({mass:0,material});
  ground.addShape(new CANNON.Heightfield(terrainData(),{elementSize:CELL}));
  ground.quaternion.setFromEuler(-Math.PI/2,0,0);ground.position.set(MIN_X,0,-MIN_S);this.world.addBody(ground);
  for(const g of this.goats){
   const b=new CANNON.Body({mass:7,shape:new CANNON.Sphere(1.05),material:new CANNON.Material({friction:.5,restitution:.23}),linearDamping:.035,angularDamping:.055,collisionFilterGroup:4,collisionFilterMask:7});
   b.userData=g;g.body=b;this.resetBody(g);this.world.addBody(b);
  }
  for(const h of this.hazards){
   h.destroyed=false;
   if(!['rock','hay','house','tree','ramp'].includes(h.kind))continue;
   const b=new CANNON.Body({mass:0,material});
   const x=center(h.s)+h.x;
   b.position.set(x,sampleGroundHeight(x,h.s)+(h.groundLift||0),-h.s);
   b.quaternion.setFromEuler(0,h.yaw||0,0);
   if(h.kind==='ramp'&&h.profile){
    for(let i=1;i<h.profile.length;i++){
     const a=h.profile[i-1],c=h.profile[i],dy=c.y-a.y,dz=c.z-a.z,len=Math.hypot(dy,dz);
     const q=new CANNON.Quaternion();q.setFromEuler(Math.atan2(dy,-dz),0,0);
     b.addShape(new CANNON.Box(new CANNON.Vec3(h.width/2,.14,len/2)),new CANNON.Vec3(0,(a.y+c.y)/2-.12,(a.z+c.z)/2),q);
    }
    if(h.grounding){b.addShape(new CANNON.Trimesh(h.grounding.apronPositions,h.grounding.apronIndices));b.addShape(new CANNON.Trimesh(h.grounding.positions,h.grounding.collisionIndices||h.grounding.indices));}
   }else if(h.collider){
    b.addShape(new CANNON.Box(new CANNON.Vec3(...h.collider.halfExtents)),new CANNON.Vec3(...(h.collider.offset||[0,h.collider.offsetY,0])));
   }else{b.addShape(new CANNON.Sphere(h.r));b.position.y+=h.r*.7;}
   b.userData={hazard:h};h.body=b;this.world.addBody(b);
  }
 }
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 envRandom(){this.environmentSeed=(Math.imul(this.environmentSeed,1664525)+1013904223)>>>0;return this.environmentSeed/4294967296;}
 get weather(){return this.mountain.weather[this.weatherIndex];}
 sync(g){
  const b=g.body,p=b.position;g.s=-p.z;g.x=p.x-center(g.s);g.jump=Math.max(0,p.y-sampleGroundHeight(p.x,g.s)-1.05);
  g.vx=b.velocity.x;g.speed=b.velocity.length();g.grounded=g.jump<.7;g.touchingGround=false;g.supportNormal=groundNormal(p.x,g.s);g.roadHeading=roadDerivative(g.s);
  for(const c of this.world.contacts){
   if(c.bi!==b&&c.bj!==b)continue;
   const other=c.bi===b?c.bj:c.bi;if(other.mass!==0)continue;
   const n=c.ni.scale(c.bi===b?-1:1);if(n.y>.25){g.grounded=true;g.touchingGround=true;g.supportNormal=n;break;}
  }
 }
 resetBody(g){
  const b=g.body,x=center(g.s)+g.x;
  b.position.set(x,sampleGroundHeight(x,g.s)+1.22,-g.s);b.velocity.set(0,0,-1.5);b.angularVelocity.set(-1.5,0,0);
  b.quaternion.set(0,0,0,1);g.previousAxle=null;g.wheelSpin=0;g.wheelHeading=undefined;g.wheelLastPosition=null;g.turnAngle=0;g.motionTime=0;g.airTime=0;g.touchingGround=false;g.trickActive=false;g.trickAirborne=false;g.trickArmedUntil=-1;b.type=CANNON.Body.DYNAMIC;b.updateMassProperties();b.collisionFilterMask=7;
  b.material.friction=.5;b.material.restitution=.24;b.wakeUp();this.sync(g);
 }
 start(){
  this.seed=42;this.environmentSeed=912;this.elapsed=0;this.counter=3.2;this.weatherIndex=0;this.phase='countdown';this.serial=0;
  this.planeTimer=12+this.envRandom()*7;this.lightningTimer=2;this.yetiTimer=8;this.celebrateRemaining=0;
  for(const e of this.entities)if(e.body)this.world.removeBody(e.body);this.entities=[];
  this.goats.forEach((g,i)=>{
   const spawn=spawnPosition(i);
   Object.assign(g,{...spawn,speed:0,vx:0,jump:0,dead:0,invulnerable:1.5,spring:0,slow:0,bumpCd:0,finishTime:null,score:0,kills:0,rage:0,wildlifeHits:0,stuckTime:0,boostTime:0,boostRampId:null,boostSeen:new Set(),lastVocal:-10,previousPosition:null,respawnedThisStep:false,rideTime:0,stats:newStats(),lastDeath:null,cd:{jump:0,bomb:10,spring:0,trap:10},ai:{target:spawn.x,timer:0}});
   this.resetBody(g);
  });
  for(const h of this.hazards){h.hit=new Set();h.x=h.baseX??h.x;h.destroyed=false;h.fire=.7+this.random();h.warning=0;h.aim=null;h.targetId=null;h.targetUntil=0;h.burstRemaining=0;}
  for(const pickup of this.snowmobiles)pickup.consumed=false;
  resetWildlife(this.wildlife);resetWildlife(this.skiers);this.event('reset');this.event('weather',this.weather);
 }
 pause(value){if(value&&['racing','countdown','celebrating'].includes(this.phase)){this.beforePause=this.phase;this.phase='paused';return true;}if(!value&&this.phase==='paused'){this.phase=this.beforePause;return true;}return false;}
 add(e){
  e.id=++this.serial;e.age=0;
  if(['bomb','bomblet','canister'].includes(e.kind)){
   const owner=this.goats.find(g=>g.id===e.owner);
   let p=e.position,v=e.velocity;
   if(!p){const b=owner.body;p={x:b.position.x,y:b.position.y+1.2,z:b.position.z-2.6};v={x:b.velocity.x,y:Math.max(7,b.velocity.y+8),z:b.velocity.z-13};}
   const b=new CANNON.Body({mass:.8,shape:new CANNON.Sphere(e.kind==='bomblet'?.25:.42),material:new CANNON.Material({friction:.6,restitution:0}),linearDamping:.035,collisionFilterGroup:2,collisionFilterMask:5});
   b.position.set(p.x,p.y,p.z);b.velocity.set(v.x,v.y,v.z);b.angularVelocity.set(5,1,0);
   b.addEventListener('collide',ev=>{
    const target=ev.body.userData;
    if(ev.body.mass===0||(target?.id!==undefined&&target.id!==e.owner))e.pendingExplosion=true;
   });
   this.world.addBody(b);e.body=b;e.position=point(b.position);e.radius=e.radius||5.8;e.life=e.life||12;
  }
  this.entities.push(e);this.event('spawn',e);return e;
 }
 ability(g,kind){
  if(this.phase!=='racing'||g.dead||g.finishTime!==null||g.cd[kind]>0)return false;
  if(['bomb','trap'].includes(kind)&&this.elapsed<10)return false;
  if(kind==='recover')return this.kill(g,'Самоуничтожение · R',-1,true);
  if(kind==='jump'){if(!g.grounded)return false;g.body.applyImpulse(new CANNON.Vec3(0,7*(g.spring>0?12:8.2),-7*1.5));g.cd.jump=1.5;this.event('jump',g);}
  else if(kind==='spring'){g.spring=3;g.cd.spring=10;this.event('spring',g);}
  else if(kind==='bomb'){g.cd.bomb=4.8;g.stats.bombs++;this.add({kind:'bomb',owner:g.id});this.event('bomb',g);}
  else if(kind==='trap'){g.cd.trap=7;g.stats.traps++;const s=Math.max(0,g.s-4),x=center(s)+g.x;this.add({kind:'trap',owner:g.id,position:{x,y:sampleGroundHeight(x,s)+.12,z:-s},life:18,radius:3.4,armedAt:.35,charges:3,hit:new Set(),snap:0});this.event('trap',g);}
  else return false;return true;
 }
 award(goat,points,reason,position,alreadyScored=false){
  if(!goat||goat.finishTime!==null)return;
  if(!alreadyScored)goat.score+=points;
  goat.kills=(goat.kills||0)+1;goat.rage=clamp(goat.score/2000,0,1);
  goat.stats.kills[reason]=(goat.stats.kills[reason]||0)+1;
  this.event('score',{goat,points,reason,position});
 }
 kill(g,reason,killerId=-1,bypassInvulnerability=false){
  if(g.dead||(!bypassInvulnerability&&g.invulnerable>0)||g.finishTime!==null)return false;
  g.dead=.85;g.speed=0;g.vx=0;g.body.collisionFilterMask=0;g.body.type=CANNON.Body.KINEMATIC;
  g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);
  const wasRiding=g.rideTime>0;g.trickActive=false;
  g.rideTime=0;g.lastDeath={reason,killerId,time:this.elapsed};g.stats.deaths++;g.stats.deathReasons[reason]=(g.stats.deathReasons[reason]||0)+1;
  if(killerId>=0&&killerId!==g.id)this.award(this.goats.find(a=>a.id===killerId),500,g.character?.species||'racer',point(g.body.position));
  this.event('death',{goat:g,reason,position:point(g.body.position),wasRiding,killerId});
  return true;
 }
 respawn(g){
  g.respawnedThisStep=true;g.s=Math.max(0,g.s-35);g.x=clamp(g.x,-9,9);g.invulnerable=3;g.spring=0;g.stuckTime=0;g.boostTime=0;g.boostRampId=null;
  this.resetBody(g);g.body.position.y+=2;g.body.velocity.z=-5;this.event('respawn',g);
 }
 ranking(){return [...this.goats].sort((a,b)=>a.finishTime!==null&&b.finishTime!==null?a.finishTime-b.finishTime:a.finishTime!==null?-1:b.finishTime!==null?1:b.s-a.s);}
 applyBoosts(g,dt){
  const b=g.body;
  g.onIce=false;
  for(const zone of this.boosts){
   if(Math.abs(g.s-zone.s)>zone.length+3)continue;
   const p=localBoostPosition(zone,b.position);
   if(Math.abs(p.x)>zone.width/2||Math.abs(p.z)>zone.length/2||!g.grounded||g.jump>1.6)continue;
   g.boostTime=1.2;g.onIce=true;
   if(!g.boostSeen.has(zone.id)){g.boostSeen.add(zone.id);this.event('boost',{goat:g,ramp:false});}
  }
  let onRamp=null;
  for(const h of this.hazards){
   if(h.kind!=='ramp'||!h.profile||Math.abs(g.s-h.s)>25)continue;
   const p=localBoostPosition(h,b.position),front=h.profile[0],back=h.profile.at(-1);
   if(Math.abs(p.x)>h.width/2+.25||p.z>front.z+4||p.z<back.z-1.3)continue;
   const deck=rampSurfaceAt(h,Math.min(front.z,Math.max(back.z,p.z)));
   const deckY=h.body.position.y+deck.y;
   const terrainY=sampleGroundHeight(b.position.x,g.s);
   const surfaceY=p.z>front.z?terrainY:deckY;
   if(b.position.y<surfaceY-.1||b.position.y>surfaceY+2.3)continue;
   onRamp=h;g.boostTime=1.2;g.onIce=true;g.trickArmedUntil=this.elapsed+1.2;
   const yaw=h.yaw||0,slope=p.z>front.z?Math.max(.2,g.supportNormal.z/g.supportNormal.y):deck.slope;
   const direction=new CANNON.Vec3(-Math.sin(yaw),Math.min(.55,Math.max(0,slope)),-Math.cos(yaw));direction.normalize();
   const speed=b.velocity.dot(direction),gain=Math.min(Math.max(0,23-speed),45*dt);
   b.velocity.vadd(direction.scale(gain),b.velocity);
   if(g.boostRampId!==h.s){this.event('boost',{goat:g,ramp:true});g.boostRampId=h.s;}
   // A short extra push over the lip prevents a slow racer from hanging on an edge.
   if(p.z<=back.z+.7&&!h.hit.has(g.id)){h.hit.add(g.id);b.applyImpulse(new CANNON.Vec3(direction.x*7*5,7*2.3,direction.z*7*5));g.trickArmedUntil=this.elapsed+1.2;}
  }
  if(!onRamp)g.boostRampId=null;
  if(g.onIce)b.material.friction=.16;
 }
 steerAndDrive(g,dt,input,drive){
  const b=g.body,normal=g.supportNormal||groundNormal(b.position.x,g.s);
  const steerResponse=(g.grounded?9:7)*this.weather.steer;
  g.turnAngle=(g.turnAngle||0)+(clamp(input,-1,1)*this.maxSteerAngle-(g.turnAngle||0))*(1-Math.exp(-dt*steerResponse));
  const heading=Math.atan(roadDerivative(g.s))+g.turnAngle;
  const forward=new CANNON.Vec3(Math.sin(heading),0,-Math.cos(heading));
  forward.vsub(normal.scale(forward.dot(normal)),forward);forward.normalize();
  const v=b.velocity,speed=v.length(),rageFactor=1+.18*g.rage,ride=g.rideTime>0?3:1,drag=this.weather.drag*(g.slow>0?3:1)/(rageFactor*ride);
  const forwardSpeed=v.dot(forward),driveStrength=clamp(drive,0,1)*23*rageFactor*ride*clamp(1-forwardSpeed/(43*rageFactor*ride),0,1);
  const acceleration=driveStrength*(g.grounded?1:.16);
  const lateral=new CANNON.Vec3(Math.cos(heading),0,Math.sin(heading));
  // Redirect momentum toward the turned wheel, rather than shifting its position.
  // Authority grows with speed so wind and a 3x vehicle cannot erase the input.
  const traction=this.weather.lateralGrip*2.2*(g.grounded?1:.6)*(g.onIce?.78:1);
  const sideLimit=(18+speed*.85)*(g.grounded?1:.75)*(g.onIce?.85:1);
  const sideDrag=clamp(v.dot(lateral)*traction,-sideLimit,sideLimit);
  const boost=g.boostTime>0?26*ride*clamp(1-forwardSpeed/(43*ride),0,1)*(g.grounded?1:.25):0;
  const gust=(Math.sin(this.elapsed*1.12+g.s*.012)*.8+Math.sin(this.elapsed*2.37+.9)*.35)*this.weather.wind;
  b.applyForce(new CANNON.Vec3(-v.x*speed*drag+gust*7+forward.x*7*(acceleration+boost)-lateral.x*7*sideDrag,-v.y*speed*drag*.35+forward.y*7*(acceleration+boost),-v.z*speed*drag+forward.z*7*(acceleration+boost)-lateral.z*7*sideDrag));
  // Align the axle, preserving spin along it and allowing some lean and drift.
  const desired=forward.cross(new CANNON.Vec3(clamp(normal.x,-.3,.3),Math.max(.7,normal.y),normal.z));
  desired.normalize();const axle=b.quaternion.vmult(new CANNON.Vec3(1,0,0));
  if(axle.dot(desired)<0)desired.negate(desired);
  if(g.previousAxle){const transport=new CANNON.Quaternion();transport.setFromVectors(g.previousAxle,axle);transport.vmult(b.angularVelocity,b.angularVelocity);}g.previousAxle=axle.clone();
  const error=axle.cross(desired),spin=axle.scale(b.angularVelocity.dot(axle)),crossSpin=b.angularVelocity.vsub(spin);
  const strength=g.grounded?1:.3;
  b.torque.x+=strength*(error.x*65-crossSpin.x*14);
  b.torque.y+=strength*(error.y*65-crossSpin.y*14);
  b.torque.z+=strength*(error.z*65-crossSpin.z*14);
  g.stuckTime=drive>.1&&forwardSpeed<2&&g.grounded?g.stuckTime+dt:0;
  if(g.stuckTime>1.1){b.applyImpulse(new CANNON.Vec3(0,7*4.3,-7*2.6));g.stuckTime=0;this.event('unstuck',g);}
 }
 step(dt,steer=0,drive=0){
  if(this.phase==='countdown'){this.counter-=dt;if(this.counter<=0){this.phase='racing';this.event('go');}return;}
  if(!['racing','celebrating'].includes(this.phase))return;
  if(this.phase==='celebrating'){this.celebrateRemaining=Math.max(0,this.celebrateRemaining-dt);if(this.celebrateRemaining===0){this.phase='finished';this.event('finish');return;}}
  this.elapsed+=dt;const wi=this.phase==='celebrating'?this.weatherIndex:Math.floor(this.elapsed/18)%this.mountain.weather.length;
  if(wi!==this.weatherIndex){this.weatherIndex=wi;this.event('weather',this.weather);}
  if(this.phase==='racing')this.updateEnvironment(dt);
  for(const h of this.hazards){if(h.destroyed)continue;if(h.kind==='bear')h.x=h.baseX+Math.sin(this.elapsed*1.3+h.s)*1.8;if(['hunter','gunner'].includes(h.kind))this.updateHunter(h,dt);}
  for(const g of this.goats){
   g.respawnedThisStep=false;g.previousPosition=null;
   for(const k of Object.keys(g.cd))g.cd[k]=Math.max(0,g.cd[k]-dt);
   for(const k of ['invulnerable','spring','slow','bumpCd','boostTime'])g[k]=Math.max(0,(g[k]||0)-dt);
   if(g.finishTime!==null)continue;
   if(g.rideTime>0){g.rideTime=Math.max(0,g.rideTime-dt);if(g.rideTime===0){g.body.velocity.scale(1/3,g.body.velocity);this.event('rideEnd',g);}}
   if(g.dead>0){g.dead=Math.max(0,g.dead-dt);if(g.dead===0)this.respawn(g);continue;}
   let input=steer,push=drive;g.motionTime=this.elapsed;
   if(g.id>0){
    const control=botControls(this,g,dt);input=control.input;push=control.drive;
   }
   g.lastS=g.s;g.lastX=g.x;g.previousPosition=point(g.body.position);g.wasTouching=g.touchingGround;g.preImpactSpeed=Math.max(0,-g.body.velocity.y);
   g.body.material.friction=this.weather.grip;g.body.material.restitution=g.rideTime>0?.08:g.spring>0?.88:.24;
   this.applyBoosts(g,dt);
   this.steerAndDrive(g,dt,input,push);
   if(Math.abs(g.x)>125||g.body.position.y<sampleGroundHeight(g.body.position.x,g.s)-12)this.kill(g,'Слетел с горы');
  }
  this.world.step(dt);
  for(const g of this.goats)if(!g.dead&&g.finishTime===null){this.sync(g);this.updateLanding(g,dt);}
  for(const pickup of this.snowmobiles){if(pickup.consumed)continue;const x=center(pickup.s)+pickup.x,position={x,y:sampleGroundHeight(x,pickup.s)+1,z:-pickup.s};for(const g of this.goats){if(g.dead||g.finishTime!==null||g.rideTime>0||g.respawnedThisStep)continue;if(sweptSphereContact(g.previousPosition||g.body.position,g.body.position,position,position,2.2)!==null){pickup.consumed=true;g.rideTime=10;g.trickActive=false;g.trickAirborne=false;g.stats.snowmobiles++;g.body.velocity.scale(3,g.body.velocity);this.event('ride',{goat:g,pickup,position});break;}}}
  const npcEvent=(type,data)=>{this.award(data.goat,data.points,data.animal.kind, data.position,true);this.event(type,data);};
  updateWildlife(this.wildlife,this.goats,this.elapsed,dt,npcEvent);
  updateWildlife(this.skiers,this.goats,this.elapsed,dt,npcEvent);
  this.updateEntities(dt);
  for(const g of this.goats){
   if(g.dead||g.finishTime!==null||g.respawnedThisStep)continue;
   for(const flow of this.lava){
    if(lavaContact(g.previousPosition||g.body.position,g.body.position,flow)!==null)this.kill(g,this.mountain.hazardNames.lava+' · поток №'+(flow.id+1),-1);
   }
   if(g.dead)continue;
   for(const pit of this.pits){
    if(Math.hypot(g.body.position.x-center(pit.s)-pit.x,g.s-pit.s)<pit.r*.77&&g.body.position.y<baseTerrainHeight(g.body.position.x,g.s)-1.1)this.kill(g,this.mountain.hazardNames.spikes,-1);
   }
   for(const h of this.hazards){
    if(h.destroyed||h.kind==='hunter'||h.kind==='ramp')continue;
    if(Math.abs(h.s-g.s)>8)h.hit.delete(g.id);
    if(h.hit.has(g.id))continue;
    const from=g.previousPosition,to=g.body.position,a={x:center(h.s)+h.x,y:sampleGroundHeight(center(h.s)+h.x,h.s)+(h.kind==='bear'?1.2:h.r*.7),z:-h.s};
    if(!from||sweptSphereContact(from,to,a,a,h.r+1.05)===null)continue;
    h.hit.add(g.id);
    if(h.kind==='bear'){if(g.spring>0){g.body.applyImpulse(new CANNON.Vec3((g.x>h.x?1:-1)*7*9,7*3,0));this.event('bounce',g);}else this.kill(g,h.sourceName||this.mountain.hazardNames.bear+'!');}
    else if(g.invulnerable<=0)this.event('obstacle',{goat:g,kind:h.kind});
   }
   if(g.s>=LENGTH&&!g.dead){
    g.s=LENGTH;g.finishTime=this.elapsed;g.speed=0;g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);
    g.body.collisionFilterMask=0;g.body.type=CANNON.Body.KINEMATIC;
    if(g.id===0){this.phase='celebrating';this.celebrateRemaining=5;g.finishPlace=this.ranking().findIndex(a=>a.id===0)+1;this.event('finishCrossed',{goat:g,place:g.finishPlace});}
   }
  }
  for(let i=0;i<this.goats.length;i++)for(let j=i+1;j<this.goats.length;j++){
   const a=this.goats[i],b=this.goats[j];
   if(a.dead||b.dead||a.invulnerable>0||b.invulnerable>0||a.bumpCd||b.bumpCd||a.finishTime!==null||b.finishTime!==null)continue;
   if(distance(a.body.position,b.body.position)<2.2){const dir=a.x>=b.x?1:-1,power=a.spring>0||b.spring>0?11:4;a.body.applyImpulse(new CANNON.Vec3(dir*power*7,a.spring>0?14:0,0));b.body.applyImpulse(new CANNON.Vec3(-dir*power*7,b.spring>0?14:0,0));a.bumpCd=.4;b.bumpCd=.4;if(a.spring>0||b.spring>0)this.event('bounce',a.id===0?a:b);}
  }
 }
 updateLanding(g,dt){
  if(!g.touchingGround){g.airTime=(g.airTime||0)+dt;if(!g.trickActive&&g.rideTime<=0&&g.trickArmedUntil>=this.elapsed&&g.airTime>.08){g.trickActive=true;g.trickStart=this.elapsed;this.event('ramp',g);}if(g.trickActive)g.trickAirborne=true;return;}
  if(g.trickActive&&g.trickAirborne){g.trickActive=false;this.event('trickEnd',g);}
  if(!g.wasTouching&&((g.airTime||0)>.15||g.preImpactSpeed>2)&&this.elapsed-(g.lastVocal??-10)>=5){g.lastVocal=this.elapsed;this.event('landing',{goat:g,position:point(g.body.position),impact:g.preImpactSpeed});}
  g.airTime=0;
 }
 updateHunter(h,dt){
  if(h.destroyed)return;
  const target=chooseHazardTarget(this,h,h.kind==='gunner'?135:100);
  if(!target){h.warning=0;return;}
  h.fire-=dt;
  if(h.warning>0){
   h.warning-=dt;
   if(h.warning<=0){
    this.fireBullet(h);h.fire=.85+this.random()*.7;if(h.kind==='gunner'){h.burstRemaining--;h.burstTimer=.11;}
   }
  }else if(h.fire<=0){
   const b=target.body;
   const from=h.fireFrom||{x:center(h.s)+h.x,y:sampleGroundHeight(center(h.s)+h.x,h.s)+1.65,z:-h.s};
   const to={x:b.position.x+b.velocity.x*.2+(this.random()-.5)*(h.kind==='gunner'?8:5),y:b.position.y+(this.random()-.5)*1.2,z:b.position.z+b.velocity.z*.2};
   const d=new CANNON.Vec3(to.x-from.x,to.y-from.y,to.z-from.z);d.normalize();d.scale(68,d);
   h.aim={from,to,velocity:point(d)};h.warning=h.kind==='gunner'?.45:.35;if(h.kind==='gunner')h.burstRemaining=5;
  }
  if(h.kind==='gunner'&&h.warning<=0&&h.burstRemaining>0){h.burstTimer=(h.burstTimer||0)-dt;if(h.burstTimer<=0){this.fireBullet(h);h.burstRemaining--;h.burstTimer=.11;h.fire=2.3+this.random();}}
 }
 fireBullet(h){
  const aim=h.aim,e=this.add({kind:'bullet',owner:-1,position:{...aim.from},velocity:{x:aim.velocity.x+(h.kind==='gunner'?(this.random()-.5)*3:0),y:aim.velocity.y,z:aim.velocity.z+(h.kind==='gunner'?(this.random()-.5)*3:0)},history:[{...aim.from}],sourceName:h.sourceName||this.mountain.hazardNames[h.kind],sourceKind:h.kind,life:2.8});
  h.lastShot=this.elapsed;this.event('shot',{hunter:h,bullet:e});
 }
 destroyNpc(target,owner,position,type){
  if(type==='yeti'){
   if(target.destroyed)return false;target.destroyed=true;target.life=0;this.event('yetiKill',{entity:target,position,owner});
  }else if(type==='hazard'){
   if(target.destroyed||target.kind==='gunner')return false;target.destroyed=true;target.warning=0;
   this.event('hazardKill',{hazard:target,position,owner});
  }else{
   if(target.consumed)return false;target.consumed=true;
   this.event(target.kind==='skier'?'skierHit':'wildlifeHit',{animal:target,goat:owner,points:target.points,position});
  }
  if(owner)this.award(owner,type==='yeti'?800:type==='hazard'?(target.kind==='bear'?350:450):target.points,target.kind,position);
  return true;
 }
 explode(e){
  if(e.detonated)return false;e.detonated=true;e.life=0;
  const p=e.body?point(e.body.position):e.position,r=e.radius||5.8,owner=this.goats.find(g=>g.id===e.owner);
  this.event('explosion',{position:p,radius:r,owner:e.owner,kind:e.kind});
  for(const g of this.goats)if(g.id!==e.owner&&distance(g.body.position,p)<r+1)this.kill(g,e.owner<0?this.mountain.hazardNames.cluster:'Бомба · '+(owner?.character?.name||owner?.name||'соперник'),e.owner);
  for(const h of this.hazards)if(['bear','hunter'].includes(h.kind)&&!h.destroyed){
   const a={x:center(h.s)+h.x,y:sampleGroundHeight(center(h.s)+h.x,h.s)+1,z:-h.s};
   if(distance(a,p)<r+1.5)this.destroyNpc(h,owner,a,'hazard');
  }
  for(const a of [...this.wildlife,...this.skiers])if(!a.consumed&&distance(a.position,p)<r+a.radius)this.destroyNpc(a,owner,a.position,'moving');
  for(const a of this.entities)if(a.kind==='yeti'&&!a.destroyed&&distance(a.position,p)<r+a.radius)this.destroyNpc(a,owner,a.position,'yeti');
  return true;
 }
 updateEnvironment(dt){
  this.planeTimer-=dt;
  if(this.planeTimer<=0){
   const g=this.goats[0],s=clamp(g.s+235+this.envRandom()*45,230,LENGTH+80);
   const headingOffset=(this.envRandom()-.5)*Math.PI/6,heading=Math.atan(roadDerivative(s))+headingOffset;
   this.add({kind:'bomber',owner:-1,position:{x:center(s)+g.x+(this.envRandom()-.5)*12,y:sampleGroundHeight(center(s),s)+48,z:-s},velocity:{x:-Math.sin(heading)*42,y:0,z:Math.cos(heading)*42},headingOffset,life:12,dropTimer:2.25,drops:0});
   this.planeTimer=23+this.envRandom()*15;this.event('airRaid');
  }
  this.yetiTimer-=dt;
  if(this.yetiTimer<=0){
   const player=this.goats[0],nearby=this.goats.filter(g=>!g.dead&&g.finishTime===null&&Math.abs(g.s-player.s)<180),anchor=nearby[Math.floor(this.envRandom()*nearby.length)]||player;
   if(player.s<LENGTH-180){for(let i=0;i<2;i++){const s=Math.min(LENGTH-25,anchor.s+145+i*22),x=center(s)+(i?6:-6)+(this.envRandom()-.5)*5;this.add({kind:'yeti',owner:-1,position:{x,y:sampleGroundHeight(x,s)+2.2,z:-s},radius:2.5,life:28,speed:6.5+this.envRandom()*1.5,baseX:x-center(s),previousPosition:null,destroyed:false});}}
   this.yetiTimer=15+this.envRandom()*9;
  }
  if(this.weather.kind==='storm'){
   this.lightningTimer-=dt;
   if(this.lightningTimer<=0){
    const strikes=2+(this.envRandom()<.35?1:0);
    for(let i=0;i<strikes;i++){
     const g=this.envRandom()<.55?this.goats[0]:this.goats[Math.floor(this.envRandom()*this.goats.length)],s=clamp(g.s+6+this.envRandom()*45,0,LENGTH),x=center(s)+g.x+(this.envRandom()-.5)*34;
     this.add({kind:'strike',owner:-1,position:{x,y:sampleGroundHeight(x,s),z:-s},warning:.75+i*.12,struck:false,radius:5.5+this.envRandom(),life:1.6});
    }
    this.lightningTimer=.7+this.envRandom()*.65;
   }
  }else this.lightningTimer=Math.min(this.lightningTimer,1.4);
 }
 splitCluster(e){
  e.life=0;e.detonated=true;const p=point(e.body.position);
  this.event('clusterSplit',{position:p,radius:3.3,kind:'canister'});
  for(let i=0;i<8;i++)this.add({kind:'bomblet',owner:-1,position:{x:p.x+(this.envRandom()-.5)*1.8,y:p.y,z:p.z+(this.envRandom()-.5)*1.8},velocity:{x:e.body.velocity.x*.4+(this.envRandom()-.5)*16,y:-6-this.envRandom()*4,z:e.body.velocity.z*.4+(this.envRandom()-.5)*20},radius:4.2,life:8});
 }
 updateEntities(dt){
  // A snapshot prevents new bomblets from being integrated a second time in this step.
  for(const e of [...this.entities]){
   e.age+=dt;e.life-=dt;
   if(e.body){
    e.position=point(e.body.position);
    const s=-e.position.z;e.s=s;e.x=e.position.x-center(s);e.jump=Math.max(0,e.position.y-sampleGroundHeight(e.position.x,s));
    if(e.kind==='canister'&&(e.age>.65||e.jump<24)){this.splitCluster(e);continue;}
    if(e.pendingExplosion||e.life<=0){this.explode(e);continue;}
   }else if(e.kind==='bullet'){
    const previous={...e.position},v=e.velocity;e.position.x+=v.x*dt;e.position.y+=v.y*dt;e.position.z+=v.z*dt;
    if(distance(e.position,e.history.at(-1))>.6){e.history.push({...e.position});if(e.history.length>220)e.history.shift();}
    for(const g of this.goats){
     if(g.dead||g.invulnerable>0||g.finishTime!==null||g.respawnedThisStep)continue;
     const t=sweptSphereContact(previous,e.position,g.previousPosition||g.body.position,g.body.position,1.22);
     if(t!==null){if(g.spring>0)this.event('bounce',g);else this.kill(g,'Выстрел · '+(e.sourceName||'Охотник'));e.life=0;break;}
    }
    if(e.position.y<=sampleGroundHeight(e.position.x,-e.position.z)+.12)e.life=0;
   }else if(e.kind==='trap'){
    e.snap=Math.max(0,(e.snap||0)-dt);e.hit ||= new Set();e.charges??=3;
    if(e.charges<=0)continue;
    if(e.age<(e.armedAt||.35))continue;
    for(const g of this.goats){
     if(g.id===e.owner||g.dead||g.finishTime!==null||g.invulnerable>0||e.hit.has(g.id))continue;
     const contact=sweptSphereContact(g.previousPosition||g.body.position,g.body.position,e.position,e.position,(e.radius||3.4)+.8);
     if(contact===null||Math.abs(g.body.position.y-e.position.y)>3.3)continue;
     e.hit.add(g.id);e.charges--;e.snap=.85;
     this.event('trapSnap',{trap:e,goat:g,position:point(g.body.position)});const owner=this.goats.find(a=>a.id===e.owner);this.kill(g,'Капкан · '+(owner?.character?.name||owner?.name||'соперник'),e.owner);if(e.charges<=0){e.life=Math.min(e.life,.85);break;}
    }
   }else if(e.kind==='yeti'){
    if(e.destroyed){e.life=0;continue;}
    e.previousPosition={...e.position};const before=-e.position.z,s=before-e.speed*dt,target=chooseHazardTarget(this,e,170);
    e.position.x+=center(s)-center(before);const lane=e.baseX+(target?clamp(target.x-e.baseX,-3,3):0);e.position.x+=clamp(center(s)+lane-e.position.x,-dt*.9,dt*.9);e.position.z=-s;e.position.y=sampleGroundHeight(e.position.x,s)+2.2;
    for(const g of this.goats){if(g.dead||g.finishTime!==null||g.respawnedThisStep)continue;const contact=sweptSphereContact(g.previousPosition||g.body.position,g.body.position,e.previousPosition,e.position,e.radius+1.05);if(contact!==null)this.kill(g,e.sourceName||this.mountain.hazardNames.yeti+' №'+e.id);}
    if(s<this.goats[0].s-90)e.life=0;
   }else if(e.kind==='bomber'){
    const v=e.velocity,s=-e.position.z,heading=Math.atan(roadDerivative(s))+(e.headingOffset||0);v.x=-Math.sin(heading)*42;v.z=Math.cos(heading)*42;
    e.position.x+=v.x*dt;e.position.z+=v.z*dt;e.position.y=sampleGroundHeight(e.position.x,-e.position.z)+48;e.dropTimer-=dt;
    if(e.dropTimer<=0&&e.drops<3){
     this.add({kind:'canister',owner:-1,position:{...e.position,y:e.position.y-1},velocity:{x:v.x*.6,y:-3,z:v.z*.6},radius:4.5});
     e.drops++;e.dropTimer=.8;this.event('bombDrop',{position:{...e.position}});
    }
   }else if(e.kind==='strike'){
    e.warning-=dt;
    if(e.warning<=0&&!e.struck){
     e.struck=true;this.event('lightning',{position:e.position,radius:e.radius});
     for(const g of this.goats)if(Math.hypot(g.body.position.x-e.position.x,g.body.position.z-e.position.z)<e.radius)this.kill(g,this.mountain.hazardNames.lightning);
    }
   }
  }
  this.entities=this.entities.filter(e=>{
   if(e.life>0)return true;
   if(e.body)this.world.removeBody(e.body);this.event('remove',e);return false;
  });
 }
 state(){
  return {mountain:this.mountain.title,mountainId:this.mountain.id,phase:this.phase,seconds:Math.round(this.elapsed*10)/10,weather:this.weather.name,place:this.ranking().findIndex(g=>g.id===0)+1,remaining:Math.round(Math.max(0,LENGTH-this.goats[0].s)),racers:this.ranking().map(g=>({name:g.name,distance:Math.round(g.s),speed:Math.round(g.speed*3.6),airborne:g.jump>.5,respawning:g.dead>0,finishTime:g.finishTime,bonusPoints:g.score,kills:g.kills,rage:g.rage,snowmobileSeconds:g.rideTime,stats:g.stats})),bonusPoints:this.goats[0].score,rage:this.goats[0].rage,wildlifeRemaining:this.wildlife.filter(a=>!a.consumed).length,skiersRemaining:this.skiers.filter(a=>!a.consumed).length,abilities:{...this.goats[0].cd},stats:this.goats[0].stats,lastDeath:this.goats[0].lastDeath,entities:this.entities.map(e=>({kind:e.kind,owner:e.owner}))};
 }
}
