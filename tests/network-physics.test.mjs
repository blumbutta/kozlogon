import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceEngine,LENGTH} from '../src/physics.js';
import {createNetworkWorld} from '../src/network-world.js';
import {withWorld} from '../src/worlds.js';
import {center,sampleGroundHeight} from '../src/terrain.js';

function fixture(network=true){
 return withWorld('alps',()=>{
  const world=createNetworkWorld('alps'),goats=[world.goats[0],world.goats[5],world.goats[7]];
  goats[0].isBot=false;goats[1].isBot=false;
  const events=[],engine=new RaceEngine(goats,[],(type,data)=>events.push({type,data}),{network,boosts:[],wildlife:[],skiers:[],snowmobiles:[]});
  engine.start();engine.phase='racing';engine.planeTimer=engine.yetiTimer=Infinity;
  return {engine,goats,events};
 });
}

test('network human slots above zero receive their own steer and drive while bots accelerate',()=>withWorld('alps',()=>{
 const {engine,goats}=fixture();
 const calls=new Map(),steerAndDrive=engine.steerAndDrive.bind(engine);
 engine.steerAndDrive=(goat,dt,steer,drive)=>{calls.set(goat.id,{steer,drive});steerAndDrive(goat,dt,steer,drive);};
 engine.step(1/90,0,0,new Map([[0,{steer:-1,drive:1,seq:11}],[5,{steer:1,drive:0,seq:22}]]));
 assert.deepEqual(calls.get(0),{steer:-1,drive:1});assert.deepEqual(calls.get(5),{steer:1,drive:0});
 assert.ok(goats[0].turnAngle<0);assert.ok(goats[1].turnAngle>0);
 assert.equal(goats[0].lastInputSeq,11);assert.equal(goats[1].lastInputSeq,22);
 assert.equal(calls.get(7).drive,1);assert.ok(goats[2].ai.timer>0);
 const oldTurn=goats[1].turnAngle;
 engine.step(1/90,0,0,new Map([[0,{steer:-9,drive:4,seq:12}]]));
 assert.deepEqual(calls.get(0),{steer:-1,drive:1});
 assert.deepEqual(calls.get(5),{steer:0,drive:0});
 assert.ok(goats[1].turnAngle<oldTurn);assert.equal(goats[1].lastInputSeq,22);
}));

test('the first network finisher freezes only that racer and leaves the shared race running',()=>withWorld('alps',()=>{
 const {engine,goats,events}=fixture();
 goats[0].s=LENGTH+.3;goats[0].x=0;engine.resetBody(goats[0]);
 engine.step(1/90,0,0,new Map([[5,{steer:0,drive:1}]]));
 assert.equal(engine.phase,'racing');assert.notEqual(goats[0].finishTime,null);assert.equal(goats[0].finishPlace,1);
 assert.equal(goats[0].body.collisionFilterMask,0);assert.equal(goats[0].body.velocity.length(),0);
 assert.equal(goats[1].finishTime,null);assert.equal(goats[2].finishTime,null);
 const elapsed=engine.elapsed,secondBefore=goats[1].body.position.z;
 engine.step(1/90,0,0,new Map([[5,{steer:0,drive:1}]]));
 assert.ok(engine.elapsed>elapsed);assert.notEqual(goats[1].body.position.z,secondBefore);
 goats[1].s=LENGTH+.3;goats[1].x=3;engine.resetBody(goats[1]);engine.step(1/90,0,0,new Map());
 assert.equal(engine.phase,'racing');assert.equal(goats[1].finishPlace,2);
 assert.deepEqual(events.filter(e=>e.type==='finishCrossed').map(e=>[e.data.goat.id,e.data.place]),[[0,1],[5,2]]);
 assert.equal(events.some(e=>e.type==='finish'),false);
}));

test('a ramp jump releases exactly five forward rockets with pauses between launches',()=>withWorld('alps',()=>{
 const {engine,goats,events}=fixture(),goat=goats[1];
 engine.elapsed=12;goat.touchingGround=false;goat.airTime=.07;goat.trickArmedUntil=13;
 goat.body.velocity.set(2,7,-22);
 engine.updateLanding(goat,.02);assert.equal(goat.trickActive,true);
 const launches=[],add=engine.add.bind(engine);
 engine.add=e=>{if(e.kind==='rocket')launches.push({time:engine.elapsed,position:{...e.position},velocity:{...e.velocity},owner:e.owner});return add(e);};
 engine.updateRocketSalvos();engine.elapsed+=.1;engine.updateRocketSalvos();assert.equal(launches.length,1);
 for(let i=0;i<5;i++){engine.elapsed+=.25;engine.updateRocketSalvos();}
 assert.equal(launches.length,5);assert.equal(goat.rocketSalvo,null);
 assert.equal(events.filter(e=>e.type==='rocketFired').length,5);
 for(let i=0;i<launches.length;i++){
  const rocket=launches[i];assert.equal(rocket.owner,goat.id);assert.ok(rocket.velocity.z<0);assert.ok(rocket.position.z<goat.body.position.z);
  if(i)assert.ok(rocket.time-launches[i-1].time>=.24);
 }
 assert.ok(new Set(launches.map(e=>e.velocity.x)).size>1,'directions vary');
}));

test('rocket explosions spare the owner and kill nearby opponents with credited kills',()=>withWorld('alps',()=>{
 const {engine,goats,events}=fixture(),owner=goats[1],victim=goats[0];
 owner.nickname='Ракетчик';owner.invulnerable=victim.invulnerable=0;
 owner.body.position.set(0,700,-100);victim.body.position.set(1,700,-100);
 const rocket=engine.add({kind:'rocket',owner:owner.id,position:{x:0,y:700,z:-100},velocity:{x:0,y:0,z:-48},radius:3.5,life:3.4});
 assert.equal(engine.explode(rocket),true);assert.equal(owner.dead,0);assert.ok(victim.dead>0);
 assert.equal(owner.stats.kills.goat,1);assert.equal(owner.kills,1);assert.equal(victim.lastDeath.reason,'Ракета · Ракетчик');
 assert.equal(events.filter(e=>e.type==='explosion').length,1);assert.equal(engine.explode(rocket),false);
 assert.equal(events.filter(e=>e.type==='explosion').length,1);
}));

test('death cancels an unfinished rocket volley and a new race clears it',()=>withWorld('alps',()=>{
 const {engine,goats}=fixture(),goat=goats[1];
 goat.rocketSalvo={remaining:4,next:engine.elapsed};goat.invulnerable=0;
 engine.kill(goat,'Проверка');assert.equal(goat.rocketSalvo,null);
 goat.rocketSalvo={remaining:3,next:engine.elapsed};engine.start();assert.equal(goat.rocketSalvo,null);
}));

test('collision pruning retains a hazard crossed between widely separated frame endpoints',()=>withWorld('alps',()=>{
 const {engine,goats}=fixture(),goat=goats[0],dt=1/60;
 const hazard={kind:'bear',s:105,x:0,baseX:0,r:1.6,hit:new Set(),sourceName:'Медведь'};
 engine.hazards.push(hazard);
 const lane=Math.sin(dt*1.3+hazard.s)*1.8,x=center(hazard.s)+lane,y=sampleGroundHeight(x,hazard.s)+1.2;
 goat.s=98;goat.x=x-center(goat.s);goat.invulnerable=0;goat.body.position.set(x,y,-98);
 // A fast swept segment crosses the bear even though the final position is
 // 23 metres past it. Isolate broad-phase pruning from contact impulses here.
 engine.world.step=()=>goat.body.position.set(x,y,-128);
 engine.step(dt,0,0,new Map());
 assert.ok(goat.dead>0);assert.equal(goat.lastDeath.reason,'Медведь');
}));
