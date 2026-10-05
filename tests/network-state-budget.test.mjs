import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeState,applyState} from '../src/network-state.js';
import {RoomManager} from '../server/rooms.mjs';
import {RaceEngine} from '../src/physics.js';
import {createNetworkWorld} from '../src/network-world.js';
import {withWorld} from '../src/worlds.js';

// The established protocol is a reference for every exported value: this
// optimization must not trade field precision, entity history or names for CPU.
const goatFields=['s','x','speed','vx','jump','dead','invulnerable','slow','finishTime','finishPlace','score','kills','rage','wildlifeHits','rideTime','grounded','touchingGround','turnAngle','roadHeading','motionTime','airTime','trickStart','trickActive','trickAirborne','trickArmedUntil','boostTime','onIce','lastVocal','lastDeath','lastInputSeq','cd','stats','isBot','name','nickname'];
const omit=new Set(['body','world','g','visual','root','roll','shield','marker','tintMaterials','rig','ride','previousAxle','wheelLastPosition','hit','boostSeen','grounding','profile','collider','character','material']);
function referencePlain(value,depth=0){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number')return Number.isFinite(value)?Math.round(value*1000)/1000:null;
 if(value===undefined||typeof value==='function'||depth>6)return undefined;
 if(value instanceof Set)return [...value];
 if(Array.isArray(value))return value.slice(0,240).map(item=>referencePlain(item,depth+1));
 const result={};for(const [key,item]of Object.entries(value)){if(omit.has(key))continue;const next=referencePlain(item,depth+1);if(next!==undefined)result[key]=next;}return result;
}
const referenceVector=value=>value?{x:Math.round(value.x*1000)/1000,y:Math.round(value.y*1000)/1000,z:Math.round(value.z*1000)/1000,...(value.w===undefined?{}:{w:Math.round(value.w*10000)/10000})}:null;
const referencePick=(value,fields)=>Object.fromEntries(fields.filter(key=>value[key]!==undefined).map(key=>[key,referencePlain(value[key])]));
function referenceSnapshot(engine){return{
 phase:engine.phase,counter:engine.counter,elapsed:engine.elapsed,weatherIndex:engine.weatherIndex,physicsHz:engine.physicsHz||60,
 goats:engine.goats.map(goat=>({id:goat.id,characterId:goat.characterId,...referencePick(goat,goatFields),position:referenceVector(goat.body?.position),velocity:referenceVector(goat.body?.velocity),quaternion:referenceVector(goat.body?.quaternion),angularVelocity:referenceVector(goat.body?.angularVelocity)})),
 hazards:engine.hazards.map((hazard,index)=>({index,...referencePick(hazard,['x','destroyed','warning','lastShot','aim'])})).filter(value=>engine.hazards[value.index].destroyed||['bear','hunter','gunner'].includes(engine.hazards[value.index].kind)),
 wildlife:engine.wildlife.map(animal=>({id:animal.id,...referencePick(animal,['position','consumed'])})),skiers:engine.skiers.map(animal=>({id:animal.id,...referencePick(animal,['position','consumed'])})),snowmobiles:engine.snowmobiles.map(pickup=>({id:pickup.id,consumed:pickup.consumed})),
 entities:engine.entities.map(entity=>({...referencePlain({...entity,...(entity.history?{history:entity.history.slice(-2).map(referenceVector)}:{})}),position:referenceVector(entity.body?.position||entity.position),velocity:referenceVector(entity.body?.velocity||entity.velocity)})),
};}

function heavyFixture(){return withWorld('alps',()=>{
 const world=createNetworkWorld('alps'),engine=new RaceEngine(world.goats,world.hazards,()=>{}, {...world,network:true});
 engine.phase='racing';engine.elapsed=123.456789;engine.counter=0;engine.weatherIndex=4;
 for(const goat of engine.goats){
  Object.assign(goat,{nickname:'Игрок № '+goat.id,name:'Игрок № '+goat.id,isBot:goat.id%3===0,s:123.456789,speed:22.123456,finishPlace:goat.id===2?1:null,lastInputSeq:4321,trickActive:true,trickAirborne:true,lastDeath:{reason:'Молния',elapsed:12.56789},stats:{kills:{goat:7,yeti:2,hunter:4},bombs:9,traps:5,deaths:2,invalid:Infinity,seen:new Set(['yeti','hunter']),empty:undefined,callback:()=>{}}});
  goat.body.userData=goat;goat.body.quaternion.set(.1234567,.2345678,.3456789,.8765432);goat.body.velocity.set(.987654,2.345678,-28.765432);
 }
 for(let index=0;index<engine.hazards.length;index++)if(index%37===0)engine.hazards[index].destroyed=true;
 const kinds=['bullet','rocket','bomb','trap','plane','cluster','yeti','lightning'];
 engine.entities=Array.from({length:100},(_,id)=>{
  const entity={id,kind:kinds[id%kinds.length],owner:id%20,age:id/55,life:3,position:{x:id,y:55,z:-id},velocity:{x:1,y:2,z:3},aim:.1234567,radius:4.777777,
   history:Array.from({length:245},(_,index)=>({x:index/33,y:index/7,z:-index/8})),metadata:{valid:true,sparse:[1,,3],nonfinite:NaN,flags:new Set(['rage','ice'])}};
  entity.body={position:{x:id+.456789,y:55,z:-id},velocity:{x:1,y:2,z:3},g:entity};
  if(id%5===0)entity.history=[];
  if(id%7===0){delete entity.position;delete entity.velocity;}
  return entity;
 });
 return engine;
});}

test('allocation reduction preserves the complete snapshot protocol for dense effects',()=>{
 const engine=heavyFixture(),expected=referenceSnapshot(engine),actual=serializeState(engine);
 assert.deepEqual(actual,expected);assert.equal(JSON.stringify(actual),JSON.stringify(expected));
 assert.equal(actual.goats.length,20);assert.equal(actual.entities.length,100);
 assert.equal(actual.goats[0].quaternion.w,.8765);assert.equal(actual.goats[0].speed,22.123);
 assert.equal(actual.entities[1].history.length,2);assert.equal(actual.entities[1].position.x,1.457);
 assert.ok(actual.hazards.every((hazard,index,array)=>!index||array[index-1].index<hazard.index));
 assert.equal(actual.goats[0].stats.invalid,null);assert.deepEqual(actual.goats[0].stats.seen,['yeti','hunter']);
 const visual={keep:true},body={position:{},velocity:{},quaternion:{},angularVelocity:{}},target={...engine,goats:[{id:0,visual,body}],entities:[]};
 applyState(target,actual);assert.equal(target.goats[0].visual,visual);assert.equal(target.goats[0].body,body);assert.equal(target.goats[0].nickname,'Игрок № 0');
});

test('static hazard state is skipped before getters or temporary snapshot records',()=>{
 let staticReads=0;
 const engine={phase:'racing',goats:[],wildlife:[],skiers:[],snowmobiles:[],entities:[],hazards:Array.from({length:1000},(_,index)=>({kind:'tree',get x(){staticReads++;return index;}}))};
 engine.hazards[111]={kind:'hunter',x:3.14159,warning:1};engine.hazards[666]={kind:'rock',x:9,destroyed:true};
 const state=serializeState(engine);assert.equal(staticReads,0);assert.deepEqual(state.hazards,[{index:111,x:3.142,warning:1},{index:666,x:9,destroyed:true}]);
});

function roomFixture(){
 let now=1000;
 const manager=new RoomManager({now:()=>now,engineFactory:(worldId,racers)=>({phase:'intro',counter:3,elapsed:0,weatherIndex:0,hazards:[],wildlife:[],skiers:[],snowmobiles:[],entities:[],goats:racers.map(racer=>({...racer,finishTime:null})),inputMaps:[],samples:[],start(){this.phase='countdown';},step(dt,steer,drive,inputs){this.phase='racing';this.elapsed+=dt;this.inputMaps.push(inputs);this.samples.push(new Map(inputs));}})});
 const client=()=>({send(){}}),host=client();manager.receive(host,{type:'create'});const room=host.room;
 const join=(payload={})=>{const connection=client();manager.receive(connection,{type:'join',roomId:room.id,...payload});return connection;};
 const advance=ms=>{now+=ms;manager.advance();};
 return{manager,room,host,join,advance};
}

test('racer lookup index survives reconnect, expiry and spectator promotion',()=>{
 const {manager,room,host,join,advance}=roomFixture(),player=join(),token=player.member.reconnectToken,identity=player.member.id;
 assert.equal(room.memberForSlot(0),host.member);assert.equal(room.memberForSlot(1),player.member);
 manager.disconnect(player);assert.equal(room.memberForSlot(1).id,identity);
 const resumed=join({reconnectToken:token});assert.equal(room.memberForSlot(1),resumed.member);
 manager.receive(host,{type:'start'});advance(20);const spectator=join();assert.equal(spectator.member.role,'spectator');
 manager.disconnect(resumed);advance(20_001);assert.equal(room.memberForSlot(1),undefined);
 room.engine.goats.forEach(goat=>{goat.finishTime=1;});advance(20);manager.receive(host,{type:'returnLobby'});
 assert.equal(spectator.member.role,'player');assert.equal(spectator.member.playerId,1);assert.equal(room.memberForSlot(1),spectator.member);
 manager.receive(spectator,{type:'leave'});assert.equal(room.memberForSlot(1),undefined);assert.equal(room.playersBySlot.size,1);
});

test('input dispatch reuses bounded storage while advancing newest authenticated inputs',()=>{
 const {manager,room,host,join,advance}=roomFixture();for(let index=1;index<20;index++)join();
 manager.receive(host,{type:'start'});advance(20);manager.receive(host,{type:'input',seq:1,steer:-.6,drive:1});advance(20);
 manager.receive(host,{type:'input',seq:2,steer:.8,drive:0});advance(20);
 const engine=room.engine;assert.ok(engine.inputMaps.length>=3);assert.ok(engine.inputMaps.every(map=>map===room.inputs));assert.equal(room.inputs.size,20);
 assert.equal(engine.samples[0].get(0).seq,-1);assert.deepEqual(engine.samples.at(-1).get(0),{seq:2,steer:.8,drive:0});
 manager.receive(host,{type:'leave'});advance(20);assert.equal(room.inputs.size,19);assert.ok(!room.inputs.has(0));
});
