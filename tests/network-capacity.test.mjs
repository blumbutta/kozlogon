import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager, SERVER_PHYSICS_HZ} from '../server/rooms.mjs';
import {RaceEngine} from '../src/physics.js';
import {createNetworkWorld} from '../src/network-world.js';
import {serializeState} from '../src/network-state.js';
import {getActiveWorld, withWorld} from '../src/worlds.js';

function fixture(maxActiveRaces=3){
 let now=1_000;
 const manager=new RoomManager({maxActiveRaces,now:()=>now,withWorld,
  engineFactory(worldId,racers,event){
   assert.equal(getActiveWorld().id,worldId,'construction enters the room world');
   const world=createNetworkWorld(worldId);
   for(const racer of racers)Object.assign(world.goats[racer.id],racer);
   return new RaceEngine(world.goats,world.hazards,event,{...world,network:true});
  }
 });
 const create=worldId=>{
  const connection={messages:[],send(message){if(message.type==='error')this.messages.push(message);}};
  manager.receive(connection,{type:'create',worldId,nickname:'Игрок'});
  manager.receive(connection,{type:'start'});
  return {room:connection.room,connection};
 };
 const advance=seconds=>{now+=seconds*1_000;manager.advance();};
 return {manager,create,advance};
}

function exercise(worldIds){
 const h=fixture(),entries=worldIds.map(h.create);
 for(const {room} of entries){
  room.phase=room.engine.phase='racing';room.engine.weatherIndex=3;
  room.engine.planeTimer=.25;room.engine.lightningTimer=.2;room.engine.yetiTimer=.3;
  for(const goat of room.engine.goats)goat.rocketSalvo={remaining:5,next:0};
 }
 for(let tick=0;tick<60;tick++){
  for(const {connection} of entries)h.manager.receive(connection,{type:'input',seq:tick,steer:Math.sin(tick/8)*.5,drive:1});
  h.advance(1/SERVER_PHYSICS_HZ);
 }
 return entries.map(({room})=>({worldId:room.worldId,tick:room.tick,state:serializeState(room.engine)}));
}

test('interleaved Alps, Hell and Moon retain the same physics and hazards as isolated races',()=>{
 const outer=getActiveWorld();
 const expected=['alps','hell','moon'].map(worldId=>exercise([worldId])[0]);
 assert.deepEqual(exercise(['alps','hell','moon']),expected);
 assert.equal(getActiveWorld(),outer,'no room leaves its world selected globally');
 for(const result of expected){
  assert.ok(result.tick>=59);assert.equal(result.state.goats.length,20);
  assert.ok(result.state.entities.length>0,'test includes weather, enemies and rocket bodies');
 }
});

test('two races can run independently, and finishing one immediately frees its capacity',()=>{
 const h=fixture(2),first=h.create('alps'),second=h.create('hell'),third=h.create('moon');
 assert.equal(h.manager.activeRaces(),2);assert.equal(first.room.phase,'countdown');assert.equal(second.room.phase,'countdown');
 assert.equal(third.room.phase,'lobby');assert.equal(third.connection.messages.at(-1).code,'server_busy');
 h.advance(1/SERVER_PHYSICS_HZ);assert.equal(first.room.tick,second.room.tick);
 first.room.finish();assert.equal(h.manager.activeRaces(),1);
 h.manager.receive(third.connection,{type:'start'});assert.equal(third.room.phase,'countdown');
 h.advance(1/SERVER_PHYSICS_HZ);assert.ok(second.room.tick>third.room.tick,'an existing race is not restarted by another room');
 assert.equal(h.manager.activeRaces(),2);
});

test('a stalled server callback cannot be mistaken for real-time physics throughput',()=>{
 const h=fixture(2),{room}=h.create('alps');
 // The elapsed wall-clock gap is 2 seconds, but advance deliberately admits
 // at most .25 seconds to the simulation. Performance checks must compare
 // authoritative tick deltas to monotonic wall time, not snapshots alone.
 h.advance(2);
 assert.ok(room.tick>=14&&room.tick<=15);
 assert.ok(room.tick/(2*SERVER_PHYSICS_HZ)<.13);
 const before=room.tick;h.advance(1/SERVER_PHYSICS_HZ);
 assert.ok(room.tick-before<=2,'discarded stall time is not later caught up');
});
