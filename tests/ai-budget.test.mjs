import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceEngine} from '../src/physics.js';
import {botControls} from '../src/ai.js';
import {createNetworkWorld} from '../src/network-world.js';
import {withWorld} from '../src/worlds.js';
import {center,sampleGroundHeight} from '../src/terrain.js';
function cases(){
 const results=[];
 for(const worldId of ['alps','hell','moon'])withWorld(worldId,()=>{
  const layout=createNetworkWorld(worldId),events=[],engine=new RaceEngine(layout.goats,layout.hazards,(type,data)=>events.push(type),{...layout,network:true}),g=engine.goats[3],ramp=engine.hazards.find(h=>h.kind==='ramp'),bear=engine.hazards.find(h=>h.kind==='bear');
  const positions=[20,245,ramp.s-18,ramp.s,ramp.s+12,bear.s-12,920,1710];
  for(let scenario=0;scenario<positions.length;scenario++)for(const lane of [-10,0,10]){
   engine.start();engine.phase='racing';engine.elapsed=12;engine.planeTimer=engine.yetiTimer=Infinity;events.length=0;
   g.s=positions[scenario];g.x=lane;engine.resetBody(g);g.body.position.y+=scenario===3?8:0;g.body.velocity.set(scenario%2?3:-2,0,-(scenario%3?28:65));
   g.grounded=true;g.invulnerable=0;g.cd={jump:0,bomb:scenario%2?0:1,trap:0};g.ai={target:scenario%3===0?g.x:scenario%3===1?0:5,timer:0,progressS:g.s,progressTime:scenario===7?2.09:0};
   engine.entities.push({kind:'trap',position:{x:center(g.s+20)+(scenario%3-1)*6,y:sampleGroundHeight(center(g.s+20),g.s+20),z:-g.s-20},radius:3.4,life:18,owner:1});
   engine.entities.push({kind:'yeti',position:{x:center(g.s+35),y:sampleGroundHeight(center(g.s+35),g.s+35)+2.2,z:-g.s-35},radius:2.5,life:28,speed:7,baseX:0});
   const control=botControls(engine,g,1/60),target=g.ai.bombTarget;
   results.push({worldId,scenario,lane,control,target:g.ai.target,timer:g.ai.timer,escape:g.ai.escapeTime||0,bomb:target?{kind:target.kind,id:target.target.id??target.target.netId}:null,events:[...events],seed:engine.seed});
  }
 });
 return results;
}

// Captured before the optimization: lane choice, steering, escape and random
// consumption must stay identical across terrain, ramp and combat scenarios.
const EXPECTED=[["alps",0,-10,-0.2514001432559967,-13,0,"",1504495655],["alps",0,0,0.6225938775589788,9,0,"",1504495655],["alps",0,10,-0.01488423477263463,10,0,"",1504495655],["alps",1,-10,1,13,0,"",1504495655],["alps",1,0,0.8041427706821223,9,0,"",1504495655],["alps",1,10,-0.09258167091224778,9,0,"",1504495655],["alps",2,-10,1,5,0,"",1504495655],["alps",2,0,-1,-13,0,"",1504495655],["alps",2,10,0.2754394605607193,13,0,"",1504495655],["alps",3,-10,-0.24769355642709906,-13,0,"",1504495655],["alps",3,0,0.6894392568945872,9,0,"",1504495655],["alps",3,10,-0.008999566697633894,10,0,"",1504495655],["alps",4,-10,1,13,0,"",1504495655],["alps",4,0,-0.7995025666537556,-9,0,"",1504495655],["alps",4,10,-0.46585229420195245,5,0,"",1504495655],["alps",5,-10,0.06607522853940351,-9,0,"",1504495655],["alps",5,0,-1,-13,0,"",1504495655],["alps",5,10,-1,-5,0,"",1504495655],["alps",6,-10,-0.24738509680381776,-13,0,"",1504495655],["alps",6,0,0.674093431674478,9,0,"jump",1504495655],["alps",6,10,0.23003944657596287,13,0,"",1504495655],["alps",7,-10,-0.4524593704879295,-15,2.2,"jump",1504495655],["alps",7,0,-0.5348248261420312,-6,2.2,"jump",1504495655],["alps",7,10,0.44655659485681143,15,2.2,"jump",1504495655],["hell",0,-10,-0.2514001432559967,-13,0,"",1504495655],["hell",0,0,0.6225938775589788,9,0,"",1504495655],["hell",0,10,-0.01488423477263463,10,0,"",1504495655],["hell",1,-10,1,13,0,"jump",1504495655],["hell",1,0,0.8041427706821223,9,0,"",1504495655],["hell",1,10,-0.09258167091224778,9,0,"",1504495655],["hell",2,-10,1,5,0,"",1504495655],["hell",2,0,-1,-13,0,"",1504495655],["hell",2,10,0.2754394605607193,13,0,"",1504495655],["hell",3,-10,-0.24769355642709906,-13,0,"",1504495655],["hell",3,0,0.6894392568945872,9,0,"",1504495655],["hell",3,10,-0.008999566697633894,10,0,"",1504495655],["hell",4,-10,1,13,0,"",1504495655],["hell",4,0,-0.7995025666537556,-9,0,"",1504495655],["hell",4,10,-0.46585229420195245,5,0,"",1504495655],["hell",5,-10,0.06607522853940351,-9,0,"",1504495655],["hell",5,0,-1,-13,0,"",1504495655],["hell",5,10,-1,-5,0,"",1504495655],["hell",6,-10,-0.24738509680381776,-13,0,"",1504495655],["hell",6,0,0.674093431674478,9,0,"",1504495655],["hell",6,10,0.23003944657596287,13,0,"",1504495655],["hell",7,-10,-0.4524593704879295,-15,2.2,"jump",1504495655],["hell",7,0,-0.5348248261420312,-6,2.2,"jump",1504495655],["hell",7,10,0.44655659485681143,15,2.2,"jump",1504495655],["moon",0,-10,-0.2514001432559967,-13,0,"",1504495655],["moon",0,0,0.6225938775589788,9,0,"",1504495655],["moon",0,10,-0.01488423477263463,10,0,"",1504495655],["moon",1,-10,1,13,0,"",1504495655],["moon",1,0,0.8041427706821223,9,0,"",1504495655],["moon",1,10,-0.09258167091224778,9,0,"",1504495655],["moon",2,-10,1,5,0,"",1504495655],["moon",2,0,-1,-13,0,"",1504495655],["moon",2,10,0.2754394605607193,13,0,"",1504495655],["moon",3,-10,-0.24769355642709906,-13,0,"",1504495655],["moon",3,0,0.6894392568945872,9,0,"",1504495655],["moon",3,10,-0.008999566697633894,10,0,"",1504495655],["moon",4,-10,1,13,0,"",1504495655],["moon",4,0,-0.7995025666537556,-9,0,"",1504495655],["moon",4,10,-0.46585229420195245,5,0,"",1504495655],["moon",5,-10,0.06607522853940351,-9,0,"",1504495655],["moon",5,0,-1,-13,0,"",1504495655],["moon",5,10,-1,-5,0,"",1504495655],["moon",6,-10,-0.24738509680381776,-13,0,"",1504495655],["moon",6,0,0.674093431674478,9,0,"jump",1504495655],["moon",6,10,0.23003944657596287,13,0,"",1504495655],["moon",7,-10,-0.4524593704879295,-15,2.2,"jump",1504495655],["moon",7,0,-0.5348248261420312,-6,2.2,"jump",1504495655],["moon",7,10,0.44655659485681143,15,2.2,"jump",1504495655]];

test('cached bot route inputs preserve every recorded lane decision and action',()=>{
 const actual=cases();
 assert.ok(actual.every(a=>a.control.drive===1));
 assert.deepEqual(actual.map(a=>[a.worldId,a.scenario,a.lane,a.control.input,a.target,a.escape,a.events.join(','),a.seed]),EXPECTED);
});

test('bot decisions inspect distant hazard positions once instead of once per lane',()=>withWorld('alps',()=>{
 const layout=createNetworkWorld('alps'),engine=new RaceEngine(layout.goats,layout.hazards,()=>{},{...layout,network:true});
 engine.start();engine.phase='racing';let positionReads=0;
 engine.hazards=engine.hazards.map(h=>new Proxy(h,{get(target,key){if(key==='s')positionReads++;return target[key];}}));
 const g=engine.goats[3];g.cd.bomb=1;g.ai.timer=0;
 botControls(engine,g,1/60);
 assert.ok(positionReads<1500,`Hazard position inspected ${positionReads} times`);
}));
