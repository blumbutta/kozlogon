import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import {RaceEngine,SlopeBroadphase,BoundedHeightfield} from '../src/physics.js';
import {createNetworkWorld} from '../src/network-world.js';
import {withWorld} from '../src/worlds.js';
import {center,sampleGroundHeight} from '../src/terrain.js';

function fixture(id='alps'){
 const layout=createNetworkWorld(id);
 const engine=new RaceEngine(layout.goats,layout.hazards,()=>{},{...layout,network:true});
 engine.start();engine.phase='racing';engine.planeTimer=engine.yetiTimer=Infinity;
 return engine;
}
function pairs(broadphase,world){
 const a=[],b=[];broadphase.dirty=true;broadphase.collisionPairs(world,a,b);
 return new Set(a.map((body,i)=>[body.id,b[i].id].sort((x,y)=>x-y).join(':')));
}
function move(body,x,y,z){body.position.set(x,y,z);body.aabbNeedsUpdate=true;}

test('slope sweep preserves every AABB candidate for offset scenery and projectiles in all mountains',()=>{
 for(const id of ['alps','hell','moon'])withWorld(id,()=>{
  const engine=fixture(id),world=engine.world,reference=new CANNON.NaiveBroadphase();
  reference.useBoundingBoxes=true;
  const staticHazards=engine.hazards.filter(h=>h.body),ramps=staticHazards.filter(h=>h.kind==='ramp');
  for(let stage=0;stage<7;stage++){
   for(let i=0;i<engine.goats.length;i++){
    const g=engine.goats[i],hazard=stage===0?ramps[i%ramps.length]:staticHazards[(stage*71+i*23)%staticHazards.length];
    const bounds=hazard.body;bounds.updateAABB();
    const x=(bounds.aabb.lowerBound.x+bounds.aabb.upperBound.x)/2;
    const z=(bounds.aabb.lowerBound.z+bounds.aabb.upperBound.z)/2;
    const y=(bounds.aabb.lowerBound.y+bounds.aabb.upperBound.y)/2;
    move(g.body,x+(i%3-1)*.6,y,z+(i%4-2)*.8);
    // Exercise sleeping, respawning, finished and actively controlled bodies.
    g.body.collisionFilterMask=i%9===0?0:7;
    g.body.type=i%7===0?CANNON.Body.KINEMATIC:CANNON.Body.DYNAMIC;
   }
   if(stage===0)for(let i=0;i<48;i++){
    const ramp=ramps[i%ramps.length],p=ramp.body.position;
    engine.add({kind:i%2?'rocket':'bomblet',owner:i%20,position:{x:p.x+(i%5-2),y:p.y+1+(i%3),z:p.z+(i%7-3)},velocity:{x:0,y:-80,z:-150},life:8});
   }
   if(stage>0)for(let i=0;i<engine.entities.length;i++){
    const body=engine.entities[i].body,s=(stage*250+i*31)%2200,x=center(s)+(i%7-3)*1.2;
    move(body,x,sampleGroundHeight(x,s)+.3,-s);
   }
   assert.deepEqual(pairs(world.broadphase,world),pairs(reference,world),`${id}, stage ${stage}`);
  }
 });
});

test('slope sweep refreshes movement bounds and tracks added and removed projectiles',()=>withWorld('alps',()=>{
 const engine=fixture(),world=engine.world,reference=new CANNON.NaiveBroadphase();reference.useBoundingBoxes=true;
 const goat=engine.goats[0],hazard=engine.hazards.find(h=>h.kind==='house'),p=hazard.body.position;
 move(goat.body,p.x,p.y+2,p.z);
 const projectile=engine.add({kind:'rocket',owner:3,position:{x:p.x,y:p.y+1,z:p.z},velocity:{x:0,y:0,z:-80},life:8});
 assert.deepEqual(pairs(world.broadphase,world),pairs(reference,world));
 move(goat.body,p.x,p.y+2,p.z-600);move(projectile.body,p.x,p.y+1,p.z-600);
 assert.deepEqual(pairs(world.broadphase,world),pairs(reference,world));
 world.removeBody(projectile.body);
 assert.equal(world.broadphase.axisList.includes(projectile.body),false);
 assert.deepEqual(pairs(world.broadphase,world),pairs(reference,world));
}));

test('first-frame body additions invalidate sorted bounds after collision collection',()=>{
 const world=new CANNON.World();world.broadphase=new SlopeBroadphase(world);
 const ground=new CANNON.Body({mass:0,shape:new CANNON.Sphere(2)});world.addBody(ground);
 const distant=new CANNON.Body({mass:1,shape:new CANNON.Sphere(1),position:new CANNON.Vec3(0,0,1000)});world.addBody(distant);
 const initialA=[],initialB=[];world.broadphase.collisionPairs(world,initialA,initialB);
 assert.equal(world.broadphase.dirty,false);assert.equal(initialA.length,0);
 const projectile=new CANNON.Body({mass:.8,shape:new CANNON.Sphere(.25)});
 // Direct placement happens after Cannon has computed constructor bounds.
 projectile.position.set(0,0,0);world.addBody(projectile);
 const a=[],b=[];world.broadphase.collisionPairs(world,a,b);
 assert.equal(a.length,1);assert.ok([a[0],b[0]].includes(projectile));assert.ok([a[0],b[0]].includes(ground));
 world.removeBody(projectile);const emptyA=[],emptyB=[];world.broadphase.collisionPairs(world,emptyA,emptyB);assert.equal(emptyA.length,0);
});

test('initial raised scenery, launched rockets and respawn positions have current shape bounds',()=>withWorld('alps',()=>{
 const engine=fixture(),world=engine.world,reference=new CANNON.NaiveBroadphase();reference.useBoundingBoxes=true;
 const a=[],b=[];world.broadphase.collisionPairs(world,a,b);
 for(const h of engine.hazards.filter(h=>h.body&&['rock','hay'].includes(h.kind))){
  assert.equal(h.body.aabbNeedsUpdate,false);
  assert.equal(h.body.aabb.lowerBound.y,h.body.position.y-h.r);
  assert.equal(h.body.aabb.upperBound.y,h.body.position.y+h.r);
 }
 const goat=engine.goats[0];engine.respawn(goat);assert.equal(goat.body.aabbNeedsUpdate,true);
 const rocket=engine.add({kind:'rocket',owner:4,position:{x:80,y:100,z:-900},velocity:{x:0,y:0,z:-100},life:8});
 assert.equal(rocket.body.aabbNeedsUpdate,true);assert.equal(world.broadphase.dirty,true);
 const actualA=[],actualB=[];world.broadphase.collisionPairs(world,actualA,actualB);
 assert.deepEqual(new Set(actualA.map((body,i)=>[body.id,actualB[i].id].sort((x,y)=>x-y).join(':'))),pairs(reference,world));
 assert.ok(rocket.body.aabb.lowerBound.z<-900);assert.ok(rocket.body.aabb.upperBound.z>-900);
}));

test('broadphase avoids scanning distant static pairs without reducing solver precision or geometry',()=>withWorld('alps',()=>{
 const engine=fixture(),world=engine.world,original=new CANNON.SAPBroadphase(world);
 let originalChecks=0,newChecks=0;
 const oldNeed=original.needBroadphaseCollision.bind(original),newNeed=world.broadphase.needBroadphaseCollision.bind(world.broadphase);
 original.needBroadphaseCollision=(a,b)=>{originalChecks++;return oldNeed(a,b);};
 world.broadphase.needBroadphaseCollision=(a,b)=>{newChecks++;return newNeed(a,b);};
 pairs(original,world);pairs(world.broadphase,world);
 assert.ok(newChecks<originalChecks/8,`${newChecks} checks instead of ${originalChecks}`);
 assert.equal(world.solver.iterations,10);
 assert.equal(engine.hazards.length,495);
 assert.ok(engine.hazards.every(h=>!['rock','hay','house','tree','ramp'].includes(h.kind)||h.body));
 assert.ok(world.broadphase instanceof SlopeBroadphase);
}));

const pillarGeometry=field=>({
 offset:field.pillarOffset.toArray(),vertices:field.pillarConvex.vertices.map(v=>v.toArray()),
 faces:field.pillarConvex.faces.map(f=>[...f]),normals:field.pillarConvex.faceNormals.map(v=>v.toArray()),
 radius:field.pillarConvex.boundingSphereRadius
});
test('bounded heightfield evicts old pillars and regenerates identical triangle geometry',()=>{
 const data=Array.from({length:18},(_,x)=>Array.from({length:18},(_,s)=>Math.sin(x*.5)*3-s*.4+Math.cos(s*.25))),
  field=new BoundedHeightfield(data,{elementSize:3},8),reference=new CANNON.Heightfield(data,{elementSize:3});
 field.getConvexTrianglePillar(0,0,false);const firstPillar=field.pillarConvex;
 for(let x=0;x<17;x++)for(let s=0;s<17;s++)for(const upper of [false,true]){
  field.getConvexTrianglePillar(x,s,upper);reference.getConvexTrianglePillar(x,s,upper);
  assert.deepEqual(pillarGeometry(field),pillarGeometry(reference));
  assert.ok(Object.keys(field._cachedPillars).length<=8);assert.ok(field.pillarCacheKeys.length<=8);
 }
 assert.equal(field.getCachedConvexTrianglePillar(0,0,false),undefined);
 field.getConvexTrianglePillar(0,0,false);reference.getConvexTrianglePillar(0,0,false);
 assert.notEqual(field.pillarConvex,firstPillar);assert.deepEqual(pillarGeometry(field),pillarGeometry(reference));
 data[0][0]+=2;field.update();reference.update();
 assert.equal(Object.keys(field._cachedPillars).length,0);assert.equal(field.pillarCacheKeys.length,0);
 field.getConvexTrianglePillar(0,0,false);reference.getConvexTrianglePillar(0,0,false);
 assert.deepEqual(pillarGeometry(field),pillarGeometry(reference));
});

test('sparse contact matrices retain collision and contact events after body removal and respawn',()=>withWorld('alps',()=>{
 const engine=fixture(),world=engine.world;
 world.defaultContactMaterial.restitution=0;
 assert.ok(world.collisionMatrix instanceof CANNON.ObjectCollisionMatrix);
 assert.ok(world.collisionMatrixPrevious instanceof CANNON.ObjectCollisionMatrix);
 // Isolate matrix semantics using a flat floor and two widely spaced bodies.
 for(const body of [...world.bodies])world.removeBody(body);
 const removable=new CANNON.Body({mass:0,shape:new CANNON.Sphere(1)});removable.position.set(100,100,100);world.addBody(removable);
 const ground=new CANNON.Body({mass:0,shape:new CANNON.Box(new CANNON.Vec3(50,1,50))});ground.position.y=-1;world.addBody(ground);
 const racer=new CANNON.Body({mass:1,shape:new CANNON.Sphere(1)});racer.position.set(0,1.01,0);world.addBody(racer);
 const events={collide:0,begin:0,end:0};
 racer.addEventListener('collide',e=>{if(e.body===ground)events.collide++;});
 world.addEventListener('beginContact',e=>{if((e.bodyA===racer&&e.bodyB===ground)||(e.bodyB===racer&&e.bodyA===ground))events.begin++;});
 world.addEventListener('endContact',e=>{if((e.bodyA===racer&&e.bodyB===ground)||(e.bodyB===racer&&e.bodyA===ground))events.end++;});
 for(let i=0;i<30;i++)world.step(1/60);
 assert.deepEqual(events,{collide:1,begin:1,end:0});
 world.removeBody(removable); // Changes the indices of the still-touching pair.
 const projectile=new CANNON.Body({mass:.8,shape:new CANNON.Sphere(.25)});projectile.position.set(10,.3,0);world.addBody(projectile);
 let hits=0;projectile.addEventListener('collide',e=>{if(e.body===ground)hits++;});
 for(let i=0;i<15;i++)world.step(1/60);
 assert.equal(hits,1);assert.deepEqual(events,{collide:1,begin:1,end:0});world.removeBody(projectile);
 // A respawn clears its old contact and creates a new one on landing.
 move(racer,0,4,0);racer.velocity.set(0,0,0);world.step(1/60);
 assert.deepEqual(events,{collide:1,begin:1,end:1});
 for(let i=0;i<90;i++)world.step(1/60);
 assert.deepEqual(events,{collide:2,begin:2,end:1});
 assert.ok(Object.keys(world.collisionMatrix.matrix).length<=1);
}));
