import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { RoomManager, normalizeNickname } from '../server/rooms.mjs';
import { serializeState, applyState, serializeEvent, deserializeEvent } from '../src/network-state.js';

function harness(options={}){
 let now=1000;
 const engines=[];
 const engineFactory=(worldId,racers,event)=>{
  const engine={worldId,event,phase:'intro',counter:3,elapsed:0,weatherIndex:0,hazards:[],wildlife:[],skiers:[],snowmobiles:[],entities:[],abilities:[],steps:[],
   goats:racers.map(racer=>({...racer,finishTime:null,dead:0,cd:{jump:0,bomb:0,trap:0},stats:{kills:{}},body:{position:{x:0,y:2,z:0},velocity:{x:0,y:0,z:0},quaternion:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:0,z:0}}})),
   start(){this.phase='countdown';this.event('reset');},
   step(dt,steer,drive,inputs){this.phase='racing';this.elapsed+=dt;this.steps.push({inputs:new Map(inputs),bots:this.goats.map(goat=>goat.isBot)});},
   ability(goat,kind){if(goat.cd[kind]>0)return false;goat.cd[kind]=1;this.abilities.push({id:goat.id,kind});return true;},
  };engines.push(engine);return engine;
 };
 const manager=new RoomManager({engineFactory,now:()=>now,...options});
 const client=()=>({messages:[],send(message){this.messages.push(message);},close(){this.closed=true;}});
 const create=(payload={})=>{const connection=client();manager.receive(connection,{type:'create',...payload});return {connection,room:connection.room};};
 const join=(room,payload={})=>{const connection=client();manager.receive(connection,{type:'join',roomId:room.id,...payload});return connection;};
 const advance=ms=>{now+=ms;manager.advance();};
 return {manager,client,create,join,advance,engines,now:()=>now};
}

test('four connected humans start a one-minute countdown; drop below four cancels it',()=>{
 const h=harness(),{connection:host,room}=h.create();
 h.join(room);h.join(room);assert.equal(room.startAt,null);
 const fourth=h.join(room);assert.equal(room.startAt,h.now()+60_000);
 const firstDeadline=room.startAt;h.advance(5000);h.join(room);assert.equal(room.startAt,firstDeadline);
 h.manager.receive(fourth,{type:'leave'});assert.equal(room.startAt,h.now()+60_000,'four humans remain, and their minute starts again');
 const other=room.onlinePlayers().find(member=>member.connection!==host).connection;h.manager.receive(other,{type:'leave'});assert.equal(room.startAt,null);
 h.join(room);assert.equal(room.startAt,h.now()+60_000);h.advance(59_999);assert.equal(room.phase,'lobby');h.advance(1);assert.equal(room.phase,'countdown');
});

test('host starts immediately; every one of twenty seats can be a human',()=>{
 const h=harness(),{connection:host,room}=h.create({nickname:'Создатель'});
 for(let index=1;index<20;index++)assert.equal(h.join(room).member.role,'player');
 assert.equal(room.onlinePlayers().length,20);assert.equal(new Set(room.racers.map(racer=>racer.characterId)).size,20);assert.ok(room.racers.every(racer=>!racer.isBot));
 const observer=h.join(room);assert.equal(observer.member.role,'spectator');assert.equal(observer.member.playerId,null);
 h.manager.receive(observer,{type:'start'});assert.equal(observer.messages.at(-1).code,'host_only');
 h.manager.receive(host,{type:'start'});assert.equal(room.phase,'countdown');assert.equal(h.join(room).member.role,'spectator');
 const lone=harness(),{connection:solo,room:single}=lone.create();lone.manager.receive(solo,{type:'start'});assert.equal(single.phase,'countdown');
});

test('private invitations are high-entropy capabilities, and room state exposes no reconnect token',()=>{
 const h=harness(),{connection,room}=h.create();assert.match(room.id,/^[A-Za-z0-9_-]{24}$/);
 const stranger=h.client();h.manager.receive(stranger,{type:'join',roomId:'123456'});assert.equal(stranger.messages.at(-1).code,'room_not_found');
 assert.ok(connection.messages.find(message=>message.type==='welcome').reconnectToken);assert.ok(!JSON.stringify(room.describe()).includes('reconnectToken'));
});

test('unique characters swap with bots but cannot overwrite another human selection',()=>{
 const h=harness(),{connection:host,room}=h.create({characterId:'moose-4'});assert.equal(room.racers[0].characterId,'moose-4');
 const second=h.join(room);h.manager.receive(second,{type:'select',characterId:'moose-4'});assert.equal(second.messages.at(-1).code,'character_taken');
 const failed=h.join(room,{characterId:'moose-4'});assert.equal(failed.member,undefined);assert.equal(room.onlinePlayers().length,2);assert.equal(room.racers.filter(racer=>!racer.isBot).length,2);
 assert.equal(new Set(room.racers.map(racer=>racer.characterId)).size,20);
});

test('inputs and abilities always control the authenticated connection player',()=>{
 const h=harness(),{connection:host,room}=h.create();const second=h.join(room);h.manager.receive(host,{type:'start'});h.advance(20);
 h.manager.receive(second,{type:'input',seq:1,steer:100,drive:1,playerId:0});h.advance(20);
 const engine=room.engine,last=engine.steps.at(-1);assert.equal(last.inputs.get(1).steer,1);assert.equal(last.inputs.get(0).steer,0);
 h.manager.receive(second,{type:'input',seq:1,steer:-1,drive:1});h.manager.receive(second,{type:'input',seq:2,steer:NaN,drive:1});h.advance(20);assert.equal(engine.steps.at(-1).inputs.get(1).steer,1);
 h.manager.receive(second,{type:'ability',kind:'bomb',playerId:0});assert.deepEqual(engine.abilities,[{id:1,kind:'bomb'}]);
 h.advance(100);h.manager.receive(second,{type:'ability',kind:'bomb'});assert.equal(engine.abilities.length,1,'engine cooldown is authoritative');
 const spectator=h.join(room);h.manager.receive(spectator,{type:'ability',kind:'recover'});assert.equal(engine.abilities.length,1);
});

test('disconnect transfers host, cancels automatic start, and token restores the reserved slot',()=>{
 const h=harness(),{connection:host,room}=h.create();const second=h.join(room);h.join(room);h.join(room);const identity=host.member.id,reconnectToken=host.member.reconnectToken;
 h.manager.disconnect(host);assert.equal(room.startAt,null);assert.equal(room.hostId,second.member.id);
 h.advance(5000);const resumed=h.join(room,{reconnectToken});assert.equal(resumed.member.id,identity);assert.equal(resumed.member.playerId,0);assert.equal(room.startAt,h.now()+60_000);
 h.manager.receive(second,{type:'start'});h.advance(20);h.manager.disconnect(resumed);h.advance(20);assert.equal(room.engine.steps.at(-1).bots[0],true,'disconnected human gets autopilot');
 h.advance(20_001);assert.equal(room.memberForSlot(0),undefined);assert.equal(room.racers[0].isBot,true);
});

test('finish waits one minute after any first finisher, unless all racers finish sooner',()=>{
 const h=harness(),{connection:host,room}=h.create();h.manager.receive(host,{type:'start'});h.advance(20);room.engine.goats[7].finishTime=3;h.advance(20);const finishAt=room.finishAt;
 assert.equal(finishAt,h.now()+60_000);h.advance(59_999);assert.equal(room.phase,'racing');h.advance(12);assert.equal(room.phase,'results');
 const second=harness(),{connection,room:all}=second.create();second.manager.receive(connection,{type:'start'});second.advance(20);all.engine.goats.forEach(goat=>{goat.finishTime=2;});second.advance(20);assert.equal(all.phase,'results');
 assert.equal(all.engine.phase,'finished');assert.equal(connection.messages.filter(message=>message.type==='event'&&message.event.type==='finish').length,1);
});

test('after results host keeps the invitation, returns everyone to lobby, and promotes spectators',()=>{
 const h=harness(),{connection:host,room}=h.create({nickname:'Шустрый',characterId:'cow-3'});h.manager.receive(host,{type:'start'});h.advance(20);const spectator=h.join(room,{nickname:'Друг'});
 room.engine.goats.forEach(goat=>{goat.finishTime=1;});h.advance(20);const invitation=room.id;
 h.manager.receive(host,{type:'returnLobby'});assert.equal(room.id,invitation);assert.equal(room.phase,'lobby');assert.equal(room.engine,null);assert.equal(spectator.member.role,'player');assert.equal(spectator.member.playerId,1);assert.equal(room.racers[0].characterId,'cow-3');
 h.manager.receive(host,{type:'start'});assert.equal(room.raceId,2);assert.equal(room.engine.elapsed,0);
});

test('snapshots preserve render objects and event references without serializing Cannon cycles',()=>{
 const h=harness(),{connection,room}=h.create();h.manager.receive(connection,{type:'start'});const source=room.engine;
 source.goats[0].body.userData=source.goats[0];source.goats[0].trickActive=true;source.goats[0].stats={kills:{yeti:2},bombs:4};
 const state=serializeState(source);assert.doesNotThrow(()=>JSON.stringify(state));
 const target={...source,goats:source.goats.map(goat=>({...goat,visual:{keep:true},body:{position:{},velocity:{},quaternion:{},angularVelocity:{}}})),entities:[]};
 applyState(target,state);assert.equal(target.goats[0].visual.keep,true);assert.equal(target.goats[0].trickActive,true);assert.equal(target.goats[0].stats.kills.yeti,2);assert.equal(target.goats[0].body.position.y,2);
 const wire=serializeEvent('death',{goat:source.goats[0],reason:'Молния',position:{x:1,y:2,z:3}},source);const event=deserializeEvent(wire,target);assert.equal(event.data.goat,target.goats[0]);assert.equal(event.data.reason,'Молния');
 assert.equal(normalizeNickname('\u0000  \u202eПёс\u202c '),'Пёс');
});

test('compressed snapshots are negotiated per connection; clients without support receive JSON',()=>{
 const h=harness(),host=h.client(),packets=[];
 host.sendPacket=packet=>packets.push(packet);h.manager.receive(host,{type:'create',compression:true});const room=host.room;
 const plainClient=h.join(room);h.manager.receive(host,{type:'start'});h.advance(70);
 const binary=packets.filter(packet=>Buffer.isBuffer(packet));assert.ok(binary.length>=2);
 const decoded=binary.map(packet=>JSON.parse(inflateSync(packet).toString()));assert.equal(decoded[0].type,'raceStart');assert.ok(decoded.some(message=>message.type==='state'));
 assert.ok(plainClient.messages.some(message=>message.type==='raceStart'));assert.ok(plainClient.messages.some(message=>message.type==='state'));
});

test('a departed slot becomes a bot after the grace period and is reusable before a race',()=>{
 const h=harness(),{room}=h.create();const second=h.join(room,{nickname:'Друг'}),slot=second.member.playerId;
 h.manager.disconnect(second);h.advance(20_001);assert.equal(room.racers[slot].isBot,true);assert.match(room.racers[slot].name,/^🤖 /);
 const replacement=h.join(room);assert.equal(replacement.member.playerId,slot);
});

test('page reload resumes the same racer and accepts an input sequence starting from one',()=>{
 const h=harness(),{connection:host,room}=h.create(),player=h.join(room),identity=player.member.id,reconnectToken=player.member.reconnectToken;
 h.manager.receive(host,{type:'start'});h.advance(20);
 h.manager.receive(player,{type:'input',seq:1000,steer:1,drive:1});h.advance(20);assert.equal(room.engine.steps.at(-1).inputs.get(1).seq,1000);
 h.manager.disconnect(player);h.advance(1000);
 const reloaded=h.join(room,{reconnectToken});assert.equal(reloaded.member.id,identity);assert.deepEqual(reloaded.member.input,{seq:-1,steer:0,drive:0});
 h.manager.receive(reloaded,{type:'input',seq:1,steer:-.5,drive:1});h.advance(20);
 assert.deepEqual(room.engine.steps.at(-1).inputs.get(1),{seq:1,steer:-.5,drive:1});assert.equal(room.engine.steps.at(-1).bots[1],false);
});

test('an idle lobby keeps its reconnect grace after the final connection drops',()=>{
 const h=harness(),{connection:host,room}=h.create(),identity=host.member.id,reconnectToken=host.member.reconnectToken;
 h.advance(121_000);assert.equal(h.manager.rooms.get(room.id),room);
 h.manager.disconnect(host);h.advance(10_000);assert.equal(h.manager.rooms.get(room.id),room);
 const reloaded=h.join(room,{reconnectToken});assert.equal(reloaded.member.id,identity);assert.equal(room.hostId,identity);
 h.manager.disconnect(reloaded);h.advance(20_001);assert.equal(h.manager.rooms.has(room.id),false,'empty room is removed when its reservations expire');
});

test('a newcomer immediately becomes host if every previous member is disconnected',()=>{
 const h=harness(),{connection:host,room}=h.create();h.manager.disconnect(host);
 const newcomer=h.join(room,{nickname:'Новый хозяин'});assert.equal(room.hostId,newcomer.member.id);
 h.manager.receive(newcomer,{type:'start'});assert.equal(room.phase,'countdown');
});
