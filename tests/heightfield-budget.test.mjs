import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import {BoundedHeightfield,installHeightfieldBoundsFilter} from '../src/physics.js';
import {terrainData,CELL} from '../src/terrain.js';
import {withWorld} from '../src/worlds.js';

function fixture(data,filtered,limit=4096){
 const world=new CANNON.World(),field=new BoundedHeightfield(data.map(row=>[...row]),{elementSize:CELL},limit);
 const floor=new CANNON.Body({mass:0,shape:field}),sphere=new CANNON.Body({mass:7,shape:new CANNON.Sphere(1.05)});
 floor.position.set(7,-9,13);floor.quaternion.setFromEuler(-Math.PI/2,0,0);
 world.addBody(floor);world.addBody(sphere);
 let checks=0;const native=world.narrowphase.sphereConvex;
 world.narrowphase.sphereConvex=function(...args){checks++;return native.apply(this,args);};
 if(filtered)installHeightfieldBoundsFilter(world);
 const overlaps=[];world.bodyOverlapKeeper.set=(a,b)=>overlaps.push(a===sphere.id&&b===floor.id||a===floor.id&&b===sphere.id);
 return {world,field,floor,sphere,get checks(){return checks;},contacts(local,radius=1.05,justTest=false){
  const contacts=[],friction=[];overlaps.length=0;
  sphere.shapes[0].radius=radius;sphere.shapes[0].updateBoundingSphereRadius();sphere.updateBoundingRadius();
  sphere.type=justTest?CANNON.Body.KINEMATIC:CANNON.Body.DYNAMIC;
  floor.quaternion.vmult(local,sphere.position);sphere.position.vadd(floor.position,sphere.position);
  world.narrowphase.getContacts([sphere],[floor],world,contacts,[],friction,[]);
  return {contacts:contacts.map(c=>({normal:c.ni.toArray(),sphere:c.ri.toArray(),floor:c.rj.toArray(),restitution:c.restitution})),overlaps:[...overlaps]};
 }};
}
function height(data,x,y){
 const ix=Math.min(data.length-2,Math.max(0,Math.floor(x/CELL))),iy=Math.min(data[0].length-2,Math.max(0,Math.floor(y/CELL))),u=x/CELL-ix,v=y/CELL-iy;
 const a=data[ix][iy],b=data[ix+1][iy],c=data[ix][iy+1],d=data[ix+1][iy+1];
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}

test('pillar bounds preserve native heightfield contacts at slopes, pits, cell seams and field edges',()=>{
 for(const id of ['alps','hell','moon'])withWorld(id,()=>{
  const data=terrainData(),native=fixture(data,false),filtered=fixture(data,true);
  let seed=123;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const points=[[0,0],[.01,.01],[-.05,120],[270,120],[269.95,2400],[135,318],[138,321],[138,324]];
  for(let i=0;i<80;i++)points.push([random()*270,random()*2457]);
  for(const [x,y] of points)for(const radius of [.22,.42,1.05])for(const clearance of [-.2,0,1e-8,.08]){
   const local=new CANNON.Vec3(x,y,height(data,x,y)+radius+clearance);
   assert.deepEqual(filtered.contacts(local,radius),native.contacts(local,radius),`${id} x${x} y${y} radius${radius} clearance${clearance}`);
  }
  assert.ok(filtered.checks<native.checks*.4,`${filtered.checks} convex checks instead of ${native.checks}`);
 });
});

test('pillar cache bounds follow rotated or translated fields and retain justTest overlaps',()=>{
 const data=Array.from({length:12},(_,x)=>Array.from({length:12},(_,y)=>-20+Math.sin(x*.4)*2-y*.3));
 const native=fixture(data,false,16),filtered=fixture(data,true,16);
 for(let stage=0;stage<12;stage++){
  for(const item of [native,filtered]){
   item.floor.position.set(stage*3-15,stage*.7-9,stage*4);
   item.floor.quaternion.setFromEuler(-Math.PI/2+stage*.035,stage*.11,stage*.027);
  }
  for(let i=0;i<12;i++){
   const x=(i%5+.1)*CELL,y=(i%7+.8)*CELL,radius=i%2?.22:1.05,local=new CANNON.Vec3(x,y,height(data,x,y)+radius-.05);
   assert.deepEqual(filtered.contacts(local,radius),native.contacts(local,radius));
   assert.deepEqual(filtered.contacts(local,radius,true),native.contacts(local,radius,true));
  }
 }
});

test('uncached mutable pillars bypass pruning and updated cached geometry stays correct',()=>{
 const data=Array.from({length:10},(_,x)=>Array.from({length:10},(_,y)=>x*.1-y*.3));
 const native=fixture(data,false,8),filtered=fixture(data,true,8);
 for(const cacheEnabled of [false,true]){
  for(const item of [native,filtered]){item.field.cacheEnabled=cacheEnabled;item.field.update();}
  for(let i=0;i<15;i++){
   const x=(i%5+.3)*CELL,y=(i%7+.7)*CELL,local=new CANNON.Vec3(x,y,height(data,x,y)+.95);
   assert.deepEqual(filtered.contacts(local),native.contacts(local));
  }
 }
 for(const item of [native,filtered]){item.field.setHeightValueAtIndex(3,4,item.field.data[3][4]+2);item.field.updateMinValue();item.field.updateMaxValue();}
 const local=new CANNON.Vec3(9.5,12.4,height(filtered.field.data,9.5,12.4)+.95);
 assert.deepEqual(filtered.contacts(local),native.contacts(local));
});

test('regular convex obstacles keep the native narrowphase path',()=>{
 const world=new CANNON.World(),sphere=new CANNON.Sphere(1.05),box=new CANNON.Box(new CANNON.Vec3(2,1,3)).convexPolyhedronRepresentation;
 const before=world.narrowphase.sphereConvex;let calls=0;
 world.narrowphase.sphereConvex=function(){calls++;return 'native';};installHeightfieldBoundsFilter(world);
 const q=new CANNON.Quaternion(),p=new CANNON.Vec3();
 assert.equal(world.narrowphase.sphereConvex(sphere,box,p,p,q,q,null,null,sphere,box,false),'native');
 assert.equal(calls,1);assert.notEqual(world.narrowphase.sphereConvex,before);
});
