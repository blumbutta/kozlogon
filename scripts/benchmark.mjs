// Deterministic CPU/memory benchmark. No sockets or external services are used.
// Run: node scripts/benchmark.mjs 120 20 (or 60 3 for three humans + 17 bots).
import {createHash} from 'node:crypto';
import {RoomManager} from '../server/rooms.mjs';
import {RaceEngine} from '../src/physics.js';
import {createNetworkWorld} from '../src/network-world.js';
import {serializeState} from '../src/network-state.js';
import {withWorld} from '../src/worlds.js';

const seconds=Number(process.argv[2]||120);
if(!Number.isInteger(seconds)||seconds<10||seconds>600)throw new Error('Duration must be an integer from 10 to 600 simulated seconds.');
const humans=Number(process.argv[3]||20);
if(!Number.isInteger(humans)||humans<1||humans>20)throw new Error('Human players per room must be an integer from 1 to 20.');
let clock=1000,bytes=0,packets=0,peakRss=0;
const manager=new RoomManager({now:()=>clock,withWorld,maxActiveRaces:2,engineFactory(worldId,racers,event){
 const layout=createNetworkWorld(worldId);
 for(const racer of racers)Object.assign(layout.goats[racer.id],racer);
 return new RaceEngine(layout.goats,layout.hazards,event,{...layout,network:true});
}});
const client=()=>({send(){},sendPacket(packet){bytes+=Buffer.byteLength(packet);packets++;}});
const rooms=[],start=performance.now(),cpuStart=process.cpuUsage();
for(const worldId of ['alps','hell']){
 const host=client();manager.receive(host,{type:'create',worldId,nickname:'Benchmark '+worldId+' 0',compression:true});
 const room=host.room,peers=[host];
 for(let id=1;id<humans;id++){const peer=client();manager.receive(peer,{type:'join',roomId:room.id,nickname:'Benchmark '+worldId+' '+id,compression:true});peers.push(peer);}
 manager.receive(host,{type:'start'});
 const watcher=client();manager.receive(watcher,{type:'join',roomId:room.id,nickname:'Benchmark observer',compression:true});
 rooms.push({room,peers});
}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
for(let step=1;step<=seconds*60;step++){
 clock=1000+step*1000/60;
 for(const {room,peers} of rooms){
  if(step%2===0)for(let id=0;id<humans;id++){
   const goat=room.engine.goats[id],lane=((id%5)-2)*3;
   manager.receive(peers[id],{type:'input',seq:step,steer:clamp((lane-goat.x)*.095-goat.vx*.014+Math.sin(step/240+id)*.08,-.9,.9),drive:1});
  }
  if(step>900&&step%12===0)for(let id=0;id<humans;id++){
   const goat=room.engine.goats[id],kind=['bomb','trap','jump'][(Math.floor(step/12)+id)%3];
   if(!goat.dead&&goat.finishTime===null&&goat.cd[kind]<=0)manager.receive(peers[id],{type:'ability',kind});
   if(goat.s>1800&&!goat.dead)manager.receive(peers[id],{type:'ability',kind:'recover'});
  }
 }
 manager.advance();
 if(step%60===0)peakRss=Math.max(peakRss,process.memoryUsage().rss);
}
const cpu=process.cpuUsage(cpuStart),states=rooms.map(({room})=>serializeState(room.engine));
console.log(JSON.stringify({simSeconds:seconds,humansPerRoom:humans,botsPerRoom:20-humans,wallSeconds:(performance.now()-start)/1000,cpuSeconds:(cpu.user+cpu.system)/1e6,peakRss, memory:process.memoryUsage(),bytes,packets,statesHash:createHash('sha256').update(JSON.stringify(states)).digest('hex'),rooms:rooms.map(({room})=>({phase:room.phase,tick:room.tick,elapsed:room.engine.elapsed,entities:room.engine.entities.length,bombs:room.engine.goats.reduce((n,g)=>n+g.stats.bombs,0),traps:room.engine.goats.reduce((n,g)=>n+g.stats.traps,0),deaths:room.engine.goats.reduce((n,g)=>n+g.stats.deaths,0)}))},null,2));
