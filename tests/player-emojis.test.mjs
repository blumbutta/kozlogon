import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../server/rooms.mjs';
import {PLAYER_EMOJIS,playerEmoji} from '../src/player-emojis.js';

test('twenty human seats get distinct badges while reconnect and name edits keep the badge',()=>{
 assert.equal(PLAYER_EMOJIS.length,20);assert.equal(new Set(PLAYER_EMOJIS).size,20);
 const manager=new RoomManager(),clients=Array.from({length:20},()=>({send(){}}));
 manager.receive(clients[0],{type:'create',nickname:'Шустрый'});const room=clients[0].room;
 for(let index=1;index<20;index++)manager.receive(clients[index],{type:'join',roomId:room.id,nickname:'Игрок '+index});
 assert.ok(room.racers.every(r=>r.name===playerEmoji(r.id)+' '+r.nickname&&!r.isBot));
 manager.receive(clients[1],{type:'select',nickname:'Новое имя'});assert.equal(room.racers[1].name,'😎 Новое имя');
 const reconnectToken=clients[1].member.reconnectToken;manager.disconnect(clients[1]);const resumed={send(){}};
 manager.receive(resumed,{type:'join',roomId:room.id,reconnectToken});assert.equal(room.racers[1].name,'😎 Новое имя');
 manager.receive(resumed,{type:'leave'});assert.match(room.racers[1].name,/^🤖 /);assert.equal(room.racers[1].isBot,true);
 assert.equal(playerEmoji(-1),'');assert.equal(playerEmoji(null),'');
});
