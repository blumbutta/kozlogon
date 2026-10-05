import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { CHARACTERS } from '../src/racers.js';
import { resolveWorld } from '../src/worlds.js';
import { worldCharacters } from '../src/world-presentation.js';
import { serializeEvent, serializeState } from '../src/network-state.js';

const token=()=>randomBytes(18).toString('base64url');
const MAX_PLAYERS=20, RECONNECT_MS=20_000, INPUT_STALE_MS=30_000;
export const SERVER_PHYSICS_HZ=60, SNAPSHOT_HZ=15;
export const DEFAULT_MAX_ACTIVE_RACES=2;
const abilityKinds=new Set(['jump','bomb','trap','recover']);
const clamp=(number,min,max)=>Math.max(min,Math.min(max,number));
export function normalizeNickname(value,fallback='Рогач'){
 return (typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,24):'')||fallback;
}
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
const safeSend=(connection,message)=>{try{connection?.send(message);}catch{/* A closed socket is removed by the transport. */}};
const encodedSend=(connection,message,encoded,compressed)=>{
 if(!connection)return;
 try{if(connection.sendPacket)connection.sendPacket(connection.compression&&compressed?compressed:encoded);else safeSend(connection,message);}catch{/* A closing transport is handled by disconnect. */}
};

export class RaceRoom {
 constructor(manager,connection,payload={}){
  this.manager=manager;this.id=token();this.worldId=resolveWorld(payload.worldId).id;
  this.phase='lobby';this.createdAt=manager.now();this.lastActiveAt=this.createdAt;this.raceId=0;this.tick=0;this.eventSerial=0;
  this.startAt=null;this.finishAt=null;this.engine=null;this.accumulator=0;this.snapshotAccumulator=0;this.members=new Map();this.hostId=null;
  this.characters=worldCharacters(CHARACTERS,resolveWorld(this.worldId));
  this.racers=this.characters.map((character,id)=>({id,characterId:character.id,nickname:character.name,name:'🤖 '+character.name,isBot:true,controller:'bot',color:character.color,character}));
  this.join(connection,payload,true);
 }
 onlinePlayers(){return [...this.members.values()].filter(member=>member.role==='player'&&member.connection);}
 join(connection,payload={},creator=false){
  const reconnect=typeof payload.reconnectToken==='string'?[...this.members.values()].find(member=>member.reconnectToken===payload.reconnectToken):null;
  if(reconnect && (reconnect.connection||reconnect.disconnectedAt+RECONNECT_MS>=this.manager.now())){
   if(reconnect.connection&&reconnect.connection!==connection){reconnect.connection.member=null;safeSend(reconnect.connection,{type:'replaced',message:'Игра открыта в другом окне.'});reconnect.connection.close?.();}
   reconnect.connection=connection;reconnect.disconnectedAt=null;reconnect.lastInputAt=this.manager.now();reconnect.input={seq:-1,steer:0,drive:0};connection.member=reconnect;connection.room=this;
   this.lastActiveAt=this.manager.now();this.transferHost();this.welcome(reconnect);this.updateCountdown();this.broadcastRoom();if(this.engine)this.sendState(connection);return reconnect;
  }
  if(this.members.size>=52)fail('room_full','В этой комнате уже слишком много наблюдателей.');
  const slot=this.phase==='lobby'?this.racers.find(racer=>!this.memberForSlot(racer.id)):null;
  const member={id:token(),reconnectToken:token(),playerId:slot?.id??null,role:slot?'player':'spectator',nickname:normalizeNickname(payload.nickname,this.randomName()),connection,disconnectedAt:null,lastInputAt:this.manager.now(),input:{seq:-1,steer:0,drive:0},lastAbilityAt:0};
  if(slot){if(payload.characterId)this.selectCharacter(member,payload.characterId);slot.isBot=false;slot.controller='human';slot.nickname=member.nickname;slot.name=member.nickname;}
  this.members.set(member.id,member);connection.member=member;connection.room=this;
  if(creator||!this.hostId)this.hostId=member.id;
  this.transferHost();
  this.lastActiveAt=this.manager.now();this.welcome(member);this.updateCountdown();this.broadcastRoom();if(this.engine)this.sendState(connection);return member;
 }
 randomName(){return this.characters[randomBytes(1)[0]%this.characters.length].name;}
 memberForSlot(playerId){return [...this.members.values()].find(member=>member.role==='player'&&member.playerId===playerId);}
 welcome(member){safeSend(member.connection,{type:'welcome',roomId:this.id,worldId:this.worldId,memberId:member.id,playerId:member.playerId,role:member.role,nickname:member.nickname,reconnectToken:member.reconnectToken,serverTime:this.manager.now()});}
 describe(){return {roomId:this.id,worldId:this.worldId,phase:this.phase,hostId:this.hostId,startAt:this.startAt,finishAt:this.finishAt,raceId:this.raceId,physicsHz:SERVER_PHYSICS_HZ,serverTime:this.manager.now(),members:[...this.members.values()].map(member=>({id:member.id,playerId:member.playerId,role:member.role,nickname:member.nickname,connected:Boolean(member.connection)})),racers:this.racers.map(racer=>({id:racer.id,characterId:racer.characterId,nickname:racer.nickname,name:racer.name,isBot:racer.isBot,color:racer.color}))};}
 broadcast(message){
  const connections=[...this.members.values()].map(member=>member.connection).filter(Boolean),encoded=JSON.stringify(message);
  const compressed=['state','raceStart'].includes(message.type)&&connections.some(connection=>connection.compression&&connection.sendPacket)?deflateSync(encoded,{level:1}):null;
  for(const connection of connections)encodedSend(connection,message,encoded,compressed);
 }
 broadcastRoom(){this.broadcast({type:'room',...this.describe()});}
 selectCharacter(member,characterId){
  if(!this.characters.some(character=>character.id===characterId))fail('invalid_character','Такого персонажа нет.');
  const racer=this.racers[member.playerId],other=this.racers.find(value=>value.characterId===characterId);
  if(other.id===racer.id)return;
  if(this.memberForSlot(other.id))fail('character_taken','Этот персонаж уже занят другим игроком.');
  const previous=racer.character;Object.assign(racer,{character:other.character,characterId:other.character.id,color:other.character.color});
  Object.assign(other,{character:previous,characterId:previous.id,color:previous.color,nickname:previous.name,name:'🤖 '+previous.name});
 }
 updateCountdown(){
  if(this.phase!=='lobby')return;
  if(this.onlinePlayers().length>=4){if(this.startAt===null)this.startAt=this.manager.now()+60_000;}
  else this.startAt=null;
 }
 action(connection,payload){
  const member=connection.member;if(!member||member.connection!==connection)fail('not_joined','Сначала войди в комнату.');
  this.lastActiveAt=this.manager.now();
  switch(payload.type){
   case 'select':
    if(this.phase!=='lobby'||member.role!=='player')fail('not_in_lobby','Персонажа можно выбрать перед стартом.');
    if(payload.characterId)this.selectCharacter(member,payload.characterId);
    if(payload.nickname!==undefined){member.nickname=normalizeNickname(payload.nickname,member.nickname);const racer=this.racers[member.playerId];racer.nickname=member.nickname;racer.name=member.nickname;}
    this.broadcastRoom();break;
   case 'start':
    this.requireHost(member);if(this.phase!=='lobby')fail('already_started','Заезд уже начался.');this.start();break;
   case 'returnLobby':case 'restart':
    this.requireHost(member);if(this.phase!=='results')fail('race_running','Сначала дождись конца заезда.');this.returnLobby();break;
   case 'input':
    if(member.role!=='player'||!this.engine||!['countdown','racing'].includes(this.phase))return;
    if(!Number.isSafeInteger(payload.seq)||payload.seq<0||payload.seq>2**31-1||payload.seq<=member.input.seq)return;
    if(!Number.isFinite(payload.steer)||!Number.isFinite(payload.drive))fail('invalid_input','Некорректное управление.');
    member.input={seq:payload.seq,steer:clamp(payload.steer,-1,1),drive:clamp(payload.drive,0,1)};member.lastInputAt=this.manager.now();break;
   case 'ability':
    if(member.role!=='player'||this.phase!=='racing'||!this.engine)return;
    if(!abilityKinds.has(payload.kind))fail('invalid_ability','Неизвестное действие.');
    if(this.manager.now()-member.lastAbilityAt<75)return;member.lastAbilityAt=this.manager.now();
    this.manager.withWorld(this.worldId,()=>this.engine.ability(this.engine.goats[member.playerId],payload.kind));break;
   case 'ping':safeSend(connection,{type:'pong',clientTime:payload.clientTime,serverTime:this.manager.now()});break;
   default:fail('unknown_message','Неизвестная команда.');
  }
 }
 requireHost(member){if(member.id!==this.hostId)fail('host_only','Начать или перезапустить заезд может создатель комнаты.');}
 start(){
  if(this.manager.activeRaces()>=this.manager.maxActiveRaces)fail('server_busy','Сейчас идут другие заезды. Попробуй начать чуть позже.');
  this.startAt=null;this.finishAt=null;this.raceId++;this.tick=0;this.eventSerial=0;this.accumulator=0;this.snapshotAccumulator=0;
  const events=[];
  this.engine=this.manager.withWorld(this.worldId,()=>this.manager.engineFactory(this.worldId,this.racers,(type,data)=>events.push({type,data})));
  this.engine.physicsHz=SERVER_PHYSICS_HZ;
  for(const member of this.members.values()){member.input={seq:-1,steer:0,drive:0};member.lastInputAt=this.manager.now();}
  this.manager.withWorld(this.worldId,()=>this.engine.start());this.phase='countdown';
  // Keep events synchronous with their simulation tick and serialize while references still exist.
  this.engine.event=(type,data)=>this.emit(type,data);
  this.broadcastRoom();this.broadcast({type:'raceStart',raceId:this.raceId,room:this.describe(),state:serializeState(this.engine)});
  for(const event of events)this.emit(event.type,event.data);
 }
 emit(type,data){
  if(type==='finishCrossed'&&this.finishAt===null){this.finishAt=this.manager.now()+60_000;this.broadcastRoom();}
  const event={id:++this.eventSerial,...serializeEvent(type,data,this.engine)};
  this.broadcast({type:'event',raceId:this.raceId,tick:this.tick,event});
 }
 sendState(connection=null){if(!this.engine)return;const message={type:'state',raceId:this.raceId,tick:this.tick,serverTime:this.manager.now(),finishAt:this.finishAt,state:serializeState(this.engine)};if(connection){const encoded=JSON.stringify(message);encodedSend(connection,message,encoded,connection.compression?deflateSync(encoded,{level:1}):null);}else this.broadcast(message);}
 advance(dt){
  const now=this.manager.now();
  for(const member of [...this.members.values()])if(!member.connection&&member.disconnectedAt+RECONNECT_MS<now)this.removeMember(member);
  if(this.phase==='lobby'){
   this.updateCountdown();if(this.startAt!==null&&now>=this.startAt){try{this.start();}catch(error){this.startAt=now+10_000;this.broadcast({type:'error',code:error.code||'start_failed',message:error.message});this.broadcastRoom();}}
   return;
  }
  if(!this.engine||!['countdown','racing'].includes(this.phase))return;
  this.accumulator+=Math.min(.25,Math.max(0,dt));
  while(this.accumulator>=1/SERVER_PHYSICS_HZ){
   this.accumulator-=1/SERVER_PHYSICS_HZ;this.tick++;
   const inputs=new Map();
   for(const racer of this.engine.goats){const member=this.memberForSlot(racer.id);racer.isBot=!member||!member.connection||now-member.lastInputAt>INPUT_STALE_MS;racer.controller=racer.isBot?'bot':'human';if(member)inputs.set(racer.id,member.input);}
   this.manager.withWorld(this.worldId,()=>this.engine.step(1/SERVER_PHYSICS_HZ,0,0,inputs));
   if(this.engine.phase==='racing'&&this.phase==='countdown'){this.phase='racing';this.broadcastRoom();}
   if(this.finishAt===null&&this.engine.goats.some(goat=>goat.finishTime!==null)){this.finishAt=now+60_000;this.broadcastRoom();}
   if(this.finishAt!==null&&(now>=this.finishAt||this.engine.goats.every(goat=>goat.finishTime!==null))){this.finish();break;}
  }
  this.snapshotAccumulator+=dt;if(this.snapshotAccumulator>=1/SNAPSHOT_HZ){this.snapshotAccumulator%=1/SNAPSHOT_HZ;this.sendState();}
 }
 finish(){
  if(this.phase==='results')return;this.phase='results';this.engine.phase='finished';this.emit('finish');this.sendState();this.broadcastRoom();
 }
 returnLobby(){
  this.engine=null;this.phase='lobby';this.finishAt=null;this.startAt=null;this.tick=0;
  for(const member of [...this.members.values()])if(!member.connection)this.removeMember(member);
  for(const member of this.members.values())if(member.role==='spectator'){const free=this.racers.find(racer=>!this.memberForSlot(racer.id));if(!free)break;member.role='player';member.playerId=free.id;free.isBot=false;free.controller='human';free.name=member.nickname;free.nickname=member.nickname;this.welcome(member);}
  for(const racer of this.racers){const member=this.memberForSlot(racer.id);racer.isBot=!member;racer.controller=member?'human':'bot';racer.name=member?member.nickname:'🤖 '+racer.character.name;racer.nickname=member?member.nickname:racer.character.name;}
  this.updateCountdown();this.broadcast({type:'lobbyReset',raceId:this.raceId});this.broadcastRoom();
 }
 disconnect(connection,voluntary=false){
  const member=connection.member;if(!member||member.connection!==connection)return;
  this.lastActiveAt=this.manager.now();member.connection=null;member.disconnectedAt=this.lastActiveAt;member.input.steer=0;member.input.drive=0;connection.member=null;connection.room=null;
  if(member.role==='player'&&this.phase==='lobby')this.startAt=null;
  if(voluntary)this.removeMember(member);
  this.transferHost();this.updateCountdown();this.broadcastRoom();
 }
 transferHost(){if(this.members.get(this.hostId)?.connection)return;const next=this.onlinePlayers()[0]||[...this.members.values()].find(member=>member.connection);if(next)this.hostId=next.id;}
 removeMember(member){
  this.members.delete(member.id);if(member.role==='player'){const racer=this.racers[member.playerId];Object.assign(racer,{isBot:true,controller:'bot',nickname:racer.character.name,name:'🤖 '+racer.character.name});if(this.engine)Object.assign(this.engine.goats[member.playerId],{isBot:true,name:racer.name,nickname:racer.nickname});}
  this.transferHost();this.updateCountdown();this.broadcastRoom();
 }
}

export class RoomManager {
 constructor({engineFactory,withWorld=(_world,callback)=>callback(),now=()=>Date.now(),maxRooms=4,maxActiveRaces=DEFAULT_MAX_ACTIVE_RACES}={}){
  this.rooms=new Map();this.engineFactory=engineFactory;this.withWorld=withWorld;this.now=now;this.maxRooms=maxRooms;this.maxActiveRaces=maxActiveRaces;this.lastTick=now();
 }
 activeRaces(){return [...this.rooms.values()].filter(room=>['countdown','racing'].includes(room.phase)).length;}
 receive(connection,payload){
  try{
   if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.type!=='string')fail('invalid_message','Некорректное сообщение.');
   if(payload.type==='create'){
    connection.compression=payload.compression===true;
    if(connection.room)fail('already_joined','Ты уже в комнате.');if(this.rooms.size>=this.maxRooms)fail('server_busy','Сейчас все комнаты заняты. Попробуй позже.');
    const room=new RaceRoom(this,connection,payload);this.rooms.set(room.id,room);return room;
   }
   if(payload.type==='join'){
    connection.compression=payload.compression===true;
    if(connection.room)fail('already_joined','Ты уже в комнате.');if(typeof payload.roomId!=='string'||!/^[A-Za-z0-9_-]{24}$/.test(payload.roomId))fail('room_not_found','Приглашение недействительно.');
    const room=this.rooms.get(payload.roomId);if(!room)fail('room_not_found','Комната уже закрыта. Создай новый заезд.');room.join(connection,payload);return room;
   }
   if(payload.type==='leave'){connection.room?.disconnect(connection,true);safeSend(connection,{type:'left'});return;}
   if(!connection.room)fail('not_joined','Сначала создай комнату или войди по приглашению.');connection.room.action(connection,payload);
  }catch(error){safeSend(connection,{type:'error',code:error.code||'internal_error',message:error.code?error.message:'Не получилось выполнить действие. Попробуй снова.'});}
 }
 disconnect(connection){connection.room?.disconnect(connection);}
 advance(){const now=this.now(),dt=Math.max(0,(now-this.lastTick)/1000);this.lastTick=now;for(const [id,room] of this.rooms){room.advance(dt);if(![...room.members.values()].some(member=>member.connection)&&(room.members.size===0||now-room.lastActiveAt>120_000))this.rooms.delete(id);}}
 shutdown(){for(const room of this.rooms.values())room.broadcast({type:'serverRestart',message:'Сервер обновляется. Переподключаемся…'});this.rooms.clear();}
}
