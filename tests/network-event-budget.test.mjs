import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {serializeEvent,deserializeEvent} from '../src/network-state.js';
import {RoomManager} from '../server/rooms.mjs';

function fixture(){
 const bullet={id:73,kind:'bullet',owner:null,position:{x:12.533,y:567.429,z:-345.271},velocity:{x:-9.471,y:-22.193,z:48.482},life:0,history:Array.from({length:220},(_,index)=>({x:12.533+index*.51,y:567.429-index*.134,z:-345.271+index*.871}))};
 bullet.body={position:bullet.position,velocity:bullet.velocity,entity:bullet};
 const hunter={kind:'hunter',s:100,x:0,hit:new Set()},engine={goats:[],hazards:[hunter],wildlife:[],skiers:[],snowmobiles:[],entities:[bullet]};
 return {engine,bullet,hunter};
}

test('removal keeps entity identity and old decoder fallback without repeating its trail',()=>{
 const {engine,bullet}=fixture(),wire=serializeEvent('remove',bullet,engine);
 assert.deepEqual(wire,{type:'remove',data:{_ref:'entity',id:73,data:{id:73,kind:'bullet'}}});
 assert.equal(deserializeEvent(wire,engine).data,bullet,'existing decoders still resolve a full entity already present');
 assert.deepEqual(deserializeEvent(wire,{...engine,entities:[]}).data,{id:73,kind:'bullet'},'a missed snapshot still removes the correct visual and bullet trail');
 const old={...serializeEvent('spawn',bullet,engine),type:'remove'};
 assert.ok(Buffer.byteLength(JSON.stringify(wire))<Buffer.byteLength(JSON.stringify(old))*.02);
 assert.equal(deserializeEvent(old,engine).data.id,deserializeEvent(wire,engine).data.id);
});

test('spawn and shot payloads retain full precision, position and history',()=>{
 const {engine,bullet,hunter}=fixture(),spawn=serializeEvent('spawn',bullet,engine),shot=serializeEvent('shot',{bullet,hunter},engine);
 assert.equal(spawn.data.data.history.length,220);assert.deepEqual(shot.data.bullet,spawn.data);assert.deepEqual(shot.data.hunter,{_ref:'hazard',index:0});
 assert.deepEqual(spawn.data.data.position,{x:12.533,y:567.429,z:-345.271});assert.deepEqual(spawn.data.data.velocity,{x:-9.471,y:-22.193,z:48.482});
 assert.equal(bullet.history.length,220);assert.ok(!Object.hasOwn(spawn.data.data,'body'));assert.doesNotThrow(()=>JSON.stringify(spawn));
});

test('one immutable UTF-8 buffer is shared per text broadcast; compressed packets remain binary',()=>{
 const client=()=>({packets:[],send(){},sendPacket(packet,utf8){this.packets.push({packet,utf8});}});
 const engineFactory=(world,racers)=>({phase:'intro',counter:10,elapsed:0,weatherIndex:0,hazards:[],wildlife:[],skiers:[],snowmobiles:[],entities:[],goats:racers.map(racer=>({...racer,finishTime:null})),start(){this.phase='countdown';}});
 const manager=new RoomManager({engineFactory}),host=client(),guest=client();manager.receive(host,{type:'create',nickname:'Сыр 🐸',compression:true});const room=host.room;
 manager.receive(guest,{type:'join',roomId:room.id,nickname:'Дым 💀',compression:false});
 const first=host.packets.at(-1),second=guest.packets.at(-1);assert.equal(typeof first.packet,'string');assert.equal(first.packet,second.packet);assert.ok(Buffer.isBuffer(first.utf8));assert.equal(first.utf8,second.utf8);assert.equal(first.utf8.toString('utf8'),first.packet);assert.ok(first.packet.includes('Сыр 🐸'));
 manager.receive(host,{type:'start'});const compressed=host.packets.at(-1),plain=guest.packets.at(-1);assert.ok(Buffer.isBuffer(compressed.packet));assert.equal(compressed.utf8,undefined);assert.equal(typeof plain.packet,'string');assert.ok(Buffer.isBuffer(plain.utf8));assert.equal(inflateSync(compressed.packet).toString(),plain.utf8.toString());
});
