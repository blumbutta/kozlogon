import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSceneryAssets} from '../src/scenery-assets.js';
import {createThemeScenery} from '../src/theme-scenery.js';
import {createThemeCreatures} from '../src/theme-creatures.js';
import {createHazardAssets} from '../src/hazard-assets.js';
import {createRideAssets} from '../src/ride-assets.js';
import {createNetworkWorld,networkHouseCollider,networkTreeCollider,networkRampDefinition} from '../src/network-world.js';
import {getActiveWorld,setActiveWorld,withWorld} from '../src/worlds.js';
import {center,sampleGroundHeight,spikePits,lavaFlows} from '../src/terrain.js';
import {foundationProfile} from '../src/foundations.js';

const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-8,`${label}: ${actual} ≠ ${expected}`);

test('headless house collision bounds exactly match every graphical house',()=>{
 for(const worldId of ['alps','hell','moon']){
  const assets=worldId==='alps'?createSceneryAssets(THREE):createThemeScenery(THREE,worldId);
  for(let style=0;style<5;style++){
   const actual=assets.house(style).userData.collider,shared=networkHouseCollider(worldId,style);
   assert.deepEqual(shared.halfExtents,actual.halfExtents,`${worldId} house ${style}`);
   assert.deepEqual(shared.offset,actual.offset,`${worldId} house ${style} offset`);
  }
 }
});

test('headless ramps use the exact renderer profiles and tree colliders',()=>{
 const assets=createHazardAssets(THREE);
 for(let style=0;style<3;style++){
  const ramp=assets.ramp(style).userData,shared=networkRampDefinition(style);
  assert.equal(shared.width,ramp.width);
  assert.deepEqual(shared.profile,ramp.profile);
 }
 for(const id of ['hell','moon'])assert.deepEqual(networkTreeCollider(id),createThemeScenery(THREE,id).tree().userData.collider);
 assert.deepEqual(networkTreeCollider('alps'),{halfExtents:[.325,5.5,.325],offset:[0,5.5,0]});
});

test('headless foundation and window gun origins match placed and scaled graphical houses',()=>{
 for(const worldId of ['alps','hell','moon'])withWorld(worldId,()=>{
  const shared=createNetworkWorld(worldId);
  const scenery=worldId==='alps'?createSceneryAssets(THREE):createThemeScenery(THREE,worldId);
  const gunAssets=worldId==='alps'?createRideAssets(THREE):createThemeCreatures(THREE,worldId);
  for(const source of shared.hazards.filter(h=>h.kind==='gunner')){
   const descriptor=shared.layout.houses[source.houseIndex],house=scenery.house(descriptor.style);
   const yaw=descriptor.yaw-Math.atan((center(descriptor.s+.1)-center(descriptor.s-.1))/.2);
   const foundation=foundationProfile(house.userData.collider,descriptor.scale,descriptor.x,descriptor.s,yaw);
   const collider=shared.hazards.find(h=>h.netId==='house-'+source.houseIndex);
   assert.deepEqual(collider.collider.halfExtents,foundation.collider.halfExtents.map(n=>n*descriptor.scale));
   assert.deepEqual(collider.collider.offset,foundation.collider.offset.map(n=>n*descriptor.scale));
   near(collider.groundLift,foundation.lift,'foundation lift');
   house.scale.setScalar(descriptor.scale);house.rotation.y=yaw;
   const x=center(descriptor.s)+descriptor.x;
   house.position.set(x,sampleGroundHeight(x,descriptor.s)+foundation.lift,-descriptor.s);
   const gun=worldId==='alps'?gunAssets.gunnerWindow():gunAssets.npc('gunner',source.houseIndex%5);
   gun.position.set(0,.6,foundation.collider.halfExtents[2]+.2);gun.scale.setScalar(.8);house.add(gun);house.updateMatrixWorld(true);
   const muzzle=gun.userData.flash.getWorldPosition(new THREE.Vector3());
   for(const axis of ['x','y','z'])near(source.fireFrom[axis],muzzle[axis],`${worldId} gun ${source.houseIndex} ${axis}`);
  }
 });
});

test('rooms keep deterministic unique actors and independent mutable game state',()=>{
 const a=createNetworkWorld('alps'),hell=createNetworkWorld('hell'),b=createNetworkWorld('alps');
 assert.equal(a.goats.length,20);assert.equal(new Set(a.goats.map(g=>g.characterId)).size,20);
 assert.ok(a.goats.every(g=>g.isBot&&g.controller==='bot'&&g.name.startsWith('🤖 ')));
 assert.equal(new Set(a.hazards.map(h=>h.netId)).size,a.hazards.length);
 assert.deepEqual(a.hazards,b.hazards);
 a.hazards[0].hit.add(3);a.wildlife[0].consumed=true;a.goats[0].name='Иван';
 assert.equal(b.hazards[0].hit.size,0);assert.equal(b.wildlife[0].consumed,false);
 assert.notEqual(b.goats[0].name,'Иван');
 assert.equal(hell.layout.pits.length,0);assert.equal(hell.layout.lava.length,11);
 assert.equal(a.layout.pits.length,11);assert.equal(a.layout.lava.length,0);
});

test('synchronous world scopes restore the previous room even after failure',()=>{
 setActiveWorld('moon');
 withWorld('hell',()=>{assert.equal(getActiveWorld().id,'hell');assert.equal(spikePits().length,0);assert.equal(lavaFlows().length,11);});
 assert.equal(getActiveWorld().id,'moon');
 assert.throws(()=>withWorld('alps',()=>{throw new Error('room error');}),/room error/);
 assert.equal(getActiveWorld().id,'moon');
 assert.throws(()=>withWorld('hell',()=>Promise.resolve()),/must be synchronous/);
 assert.equal(getActiveWorld().id,'moon');setActiveWorld('alps');
});
