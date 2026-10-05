import test from 'node:test';
import assert from 'node:assert/strict';
import {createNetworkVisuals} from '../src/network-visuals.js';
const point=x=>({x,y:2,z:-x*.5}),speed={x:20,y:0,z:-10};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('15 Hz snapshots produce continuous render positions and headings without changing authoritative actors',()=>{
 const motion=createNetworkVisuals(),actor={position:point(0)},positions=[];
 const immutable=[];
 for(let frame=0;frame<=90;frame++){
  const seconds=frame/60,now=seconds*1000;
  if(frame%4===0){actor.position=point(seconds*20);immutable.push(actor.position);motion.setTime(seconds,now);motion.record(actor,actor.position,seconds,speed,now);}
  const visible=motion.position(actor,actor.position,now);positions.push(visible.x);
  if(seconds>.08){near(visible.x,(seconds-.075)*20);near(motion.velocity(actor,speed).x,20);}
 }
 for(let index=7;index<positions.length;index++)near(positions[index]-positions[index-1],20/60);
 for(let index=0;index<immutable.length;index++)assert.deepEqual(immutable[index],point(index*4/60*20));
 assert.equal(Object.keys(actor).join(','),'position','render metadata never enters the actor or its network state');
 assert.equal(motion.position(actor,actor.position,1500),motion.position(actor,actor.position,1500),'render output is reused');
});

test('arrival jitter and stale timestamps never rewind render time or replace newer samples',()=>{
 const motion=createNetworkVisuals(),actor={},fallback=point(100),timeline=[];
 for(const [seconds,receivedAt]of [[0,0],[.1,110],[.2,260],[.3,270],[.4,430]]){
  motion.setTime(seconds,receivedAt);motion.record(actor,point(seconds*20),seconds,speed,receivedAt);
  timeline.push(motion.time(seconds,receivedAt));
  timeline.push(motion.time(seconds,receivedAt+30));
 }
 for(let i=1;i<timeline.length;i++)assert.ok(timeline[i]>=timeline[i-1]);
 const before={...motion.position(actor,fallback,460)};
 motion.record(actor,point(-999),.1,speed,470);motion.setTime(.1,470);
 assert.deepEqual(motion.position(actor,fallback,460),before);
});

test('lost updates extrapolate at most 75 ms then hold instead of sending hazards far ahead',()=>{
 const motion=createNetworkVisuals(),actor={};motion.setTime(1,1000);motion.record(actor,point(20),1,speed,1000);
 near(motion.position(actor,point(0),1075).x,20);
 near(motion.position(actor,point(0),1150).x,21.5);
 near(motion.position(actor,point(0),10000).x,21.5);
});

test('teleports and route wraps snap immediately while fast projectiles remain smooth',()=>{
 const motion=createNetworkVisuals(),skier={},rocket={};
 motion.setTime(1,1000);motion.record(skier,point(0),1,undefined,1000);motion.record(rocket,point(0),1,{x:400,y:0,z:-200},1000);
 motion.setTime(1.1,1100);motion.record(skier,point(100),1.1,undefined,1100);motion.record(rocket,point(40),1.1,{x:400,y:0,z:-200},1100);
 near(motion.position(skier,point(0),1100).x,100);near(motion.position(rocket,point(0),1100).x,10);
});

test('many samples stay bounded in time and a new race discards all earlier motion',()=>{
 const motion=createNetworkVisuals(),actor={};
 for(let i=0;i<1000;i++){const seconds=i/15;motion.setTime(seconds,i/15*1000);motion.record(actor,point(seconds*20),seconds,undefined,i/15*1000);}
 const seconds=999/15;near(motion.position(actor,point(0),seconds*1000).x,(seconds-.075)*20);
 near(motion.velocity(actor,speed).x,20);motion.reset();const fallback=point(7);
 assert.equal(motion.position(actor,fallback,100000),fallback);assert.equal(motion.velocity(actor,speed),speed);assert.equal(motion.time(0,100000),0);
 motion.setTime(0,100000);motion.record(actor,point(0),0,undefined,100000);near(motion.position(actor,fallback,100000).x,0);
});
