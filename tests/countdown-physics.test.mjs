import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceEngine} from '../src/physics.js';
import {createNetworkWorld} from '../src/network-world.js';
import {serializeState} from '../src/network-state.js';
import {withWorld} from '../src/worlds.js';

test('online racers remain stationary for the authoritative ten-second countdown, then start once',()=>withWorld('alps',()=>{
 const layout=createNetworkWorld('alps'),events=[];
 const engine=new RaceEngine(layout.goats,layout.hazards,type=>events.push(type),{...layout,network:true});
 engine.start();assert.equal(engine.counter,10);
 const initial=engine.goats.map(g=>({...g.body.position}));
 for(let tick=0;tick<599;tick++)engine.step(1/60);
 assert.equal(engine.phase,'countdown');assert.equal(engine.elapsed,0);assert.equal(events.includes('go'),false);
 assert.deepEqual(engine.goats.map(g=>({...g.body.position})),initial);
 const lateJoinSnapshot=serializeState(engine);
 assert.ok(lateJoinSnapshot.counter>0&&lateJoinSnapshot.counter<.02);
 for(let tick=0;tick<4;tick++)engine.step(1/60);
 assert.equal(engine.phase,'racing');assert.ok(engine.elapsed>0);assert.equal(events.filter(type=>type==='go').length,1);
}));

test('the offline countdown remains unchanged',()=>withWorld('alps',()=>{
 const layout=createNetworkWorld('alps'),engine=new RaceEngine(layout.goats,layout.hazards,()=>{},layout);
 engine.start();assert.equal(engine.counter,3.2);
}));
