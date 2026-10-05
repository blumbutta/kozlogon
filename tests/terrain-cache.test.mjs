import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import {withWorld,getActiveWorld} from '../src/worlds.js';
import {CELL,MIN_X,MAX_X,MIN_S,MAX_S,SPIKE_PITS,center,terrainHeight,terrainData,sampleGroundHeight} from '../src/terrain.js';

// Independent copy of the original interpolation: all four heights are
// computed procedurally on every query, without consulting cached vertices.
function referenceHeight(x,s){
 const ix=Math.floor((x-MIN_X)/CELL),is=Math.floor((s-MIN_S)/CELL);
 const x0=MIN_X+ix*CELL,s0=MIN_S+is*CELL,u=(x-x0)/CELL,v=(s-s0)/CELL;
 const a=terrainHeight(x0,s0),b=terrainHeight(x0+CELL,s0),c=terrainHeight(x0,s0+CELL),d=terrainHeight(x0+CELL,s0+CELL);
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
function coordinates(){
 const points=[];
 let seed=9183;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<2000;i++)points.push([MIN_X+random()*(MAX_X-MIN_X),MIN_S+random()*(MAX_S-MIN_S)]);
 for(const x of [MIN_X,MIN_X+CELL,0,MAX_X-CELL,MAX_X])for(const s of [MIN_S,MIN_S+CELL,0,MAX_S-CELL,MAX_S]){
  points.push([x,s],[x-1e-10,s+1e-10],[x+CELL*.35,s+CELL*.65],[x+CELL*.35,s+CELL*.65+1e-9]);
 }
 for(const pit of SPIKE_PITS)for(const dx of [0,.4,pit.r-.01,pit.r+.01])for(const ds of [0,.6,pit.r-.01])points.push([center(pit.s)+pit.x+dx,pit.s+ds]);
 points.push([MIN_X-25,100],[MAX_X+25,100],[0,MIN_S-50],[0,MAX_S+50],[850,12000],[NaN,0],[0,NaN],[Infinity,1],[0,-Infinity]);
 return points;
}

test('cached heights exactly preserve both ground triangles, pits and procedural out-of-bounds heights in every world',()=>{
 const points=coordinates();
 for(const worldId of ['alps','hell','moon'])withWorld(worldId,()=>{
  for(const [x,s] of points)assert.equal(sampleGroundHeight(x,s),referenceHeight(x,s),`${worldId}: ${x}, ${s}`);
 });
});

test('world switches and nested room scopes always select their own cached surface',()=>{
 const original=getActiveWorld(),pit=SPIKE_PITS[2],x=center(pit.s)+pit.x,s=pit.s;
 const values={};
 for(const worldId of ['alps','hell','moon'])withWorld(worldId,()=>{values[worldId]=referenceHeight(x,s);sampleGroundHeight(x,s);});
 assert.equal(values.alps,values.moon);
 assert.ok(values.hell-values.alps>3,'the hell surface has no spike pit depression');
 withWorld('alps',()=>{
  assert.equal(sampleGroundHeight(x,s),values.alps);
  withWorld('hell',()=>{
   assert.equal(sampleGroundHeight(x,s),values.hell);
   withWorld('moon',()=>assert.equal(sampleGroundHeight(x,s),values.moon));
   assert.equal(sampleGroundHeight(x,s),values.hell);
  });
  assert.equal(sampleGroundHeight(x,s),values.alps);
 });
 assert.equal(getActiveWorld(),original);
});

test('each Cannon heightfield has independent mutable rows and cannot change the shared height cache',()=>withWorld('alps',()=>{
 const first=terrainData(),second=terrainData(),ix=41,is=333,x=MIN_X+ix*CELL,s=MIN_S+is*CELL;
 assert.equal(first.length,(MAX_X-MIN_X)/CELL+1);
 assert.equal(first[0].length,(MAX_S-MIN_S)/CELL+1);
 assert.notEqual(first,second);assert.notEqual(first[ix],second[ix]);
 const original=terrainHeight(x,s),field=new CANNON.Heightfield(first,{elementSize:CELL});
 field.setHeightValueAtIndex(ix,is,original+100);
 assert.equal(first[ix][is],original+100);
 assert.equal(second[ix][is],original);
 assert.equal(terrainData()[ix][is],original);
 assert.equal(sampleGroundHeight(x,s),original);
}));

test('cached heightfield vertices remain bit-for-bit identical to procedural terrain vertices',()=>{
 for(const worldId of ['alps','hell','moon'])withWorld(worldId,()=>{
  const grid=terrainData();
  for(let ix=0;ix<grid.length;ix++)for(let is=0;is<grid[ix].length;is++)assert.equal(grid[ix][is],terrainHeight(MIN_X+ix*CELL,MIN_S+is*CELL));
 });
});
