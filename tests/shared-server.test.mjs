import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const root=fileURLToPath(new URL('../',import.meta.url));
const origin='https://blumbutta.github.io';
const until=(operation,ms=5000)=>Promise.race([operation,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Timed out')),ms);timer.unref();})]);
async function freePort(){
 const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
 const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;
}
async function startServer(t,dbPath=''){
 const port=await freePort(),url=`http://127.0.0.1:${port}`;
 const processEnv={...process.env,PORT:String(port),NODE_ENV:'production',INTEGRALS_DB_PATH:dbPath,ALLOWED_ORIGINS:origin,MAX_ROOMS:'4',MAX_ACTIVE_RACES:'1'};
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:processEnv,stdio:['ignore','pipe','pipe']});
 let logs='',stopped=false;
 child.stdout.on('data',chunk=>{logs+=chunk;});child.stderr.on('data',chunk=>{logs+=chunk;});
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 async function stop(){
  if(stopped)return;stopped=true;child.kill('SIGTERM');
  const result=await until(exited,6500).catch(error=>{child.kill('SIGKILL');throw error;});
  assert.equal(result.code,0,logs);
 }
 t.after(async()=>{await stop();});
 await until(new Promise((resolve,reject)=>{
  child.stdout.on('data',()=>{if(logs.includes('listening on port'))resolve();});
  child.once('error',reject);child.once('exit',code=>reject(new Error(`Server exited ${code}: ${logs}`)));
 }));
 return {url,stop};
}
function wsConnect(t,url,path,headers={}){
 return until(new Promise((resolve,reject)=>{
  const ws=new WebSocket(url.replace('http:','ws:')+path,{headers:{Origin:origin,...headers}});
  t.after(()=>ws.terminate());ws.once('error',reject);ws.once('open',()=>resolve(ws));
 }));
}
function packet(ws,predicate=()=>true){
 return until(new Promise((resolve,reject)=>{
  const onMessage=data=>{let value;try{value=JSON.parse(data);}catch{return;}if(predicate(value)){ws.off('message',onMessage);ws.off('close',onClose);resolve(value);}};
  const onClose=()=>{ws.off('message',onMessage);reject(new Error('WebSocket closed before packet'));};
  ws.on('message',onMessage);ws.once('close',onClose);
 }));
}
async function requestPacket(ws,body,predicate){const waiting=packet(ws,predicate);ws.send(JSON.stringify(body));return waiting;}
function closeSocket(ws){if(ws.readyState===WebSocket.CLOSED)return Promise.resolve();const closed=new Promise(resolve=>ws.once('close',resolve));ws.close();return until(closed);}
function rejectedUpgrade(t,url,path,headers={}){
 return until(new Promise((resolve,reject)=>{
  const ws=new WebSocket(url.replace('http:','ws:')+path,{headers:{Origin:origin,...headers}});t.after(()=>ws.terminate());
  ws.once('unexpected-response',(_req,res)=>{const status=res.statusCode;res.resume();ws.terminate();resolve(status);});
  ws.once('open',()=>{ws.terminate();reject(new Error('Upgrade unexpectedly succeeded'));});
  ws.on('error',()=>{});
 }));
}

test('shared bundled server keeps legacy routes and limits when Integrals storage is not configured',{timeout:30000},async t=>{
 const {url}=await startServer(t);
 await t.test('HTTP health, methods, CORS and isolated Integrals fallback',async()=>{
  let response=await fetch(url+'/health');assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  response=await fetch(url+'/health',{method:'HEAD'});assert.equal(response.status,200);assert.equal(await response.text(),'');
  response=await fetch(url+'/cube-health');const cube=await response.json();
  assert.deepEqual([cube.maxPlayers,cube.maxRooms,cube.maxActiveRooms,cube.simulationHz],[6,4,1,20]);
  response=await fetch(url+'/',{headers:{Origin:origin}});const info=await response.json();
  assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert.deepEqual([info.maxRooms,info.maxActiveRaces,info.physicsHz],[4,1,60]);
  assert.equal(info.integrals.apiPath,'/integrals-api');assert.equal(info.integrals.gameUrl,'https://blumbutta.github.io/integrals-remake/');
  response=await fetch(url+'/health',{method:'POST'});assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, HEAD');
  response=await fetch(url+'/does-not-exist');assert.equal(response.status,404);
  response=await fetch(url+'/integrals-api/health');assert.equal(response.status,503);assert.equal((await response.json()).error.code,'storage_unavailable');
  response=await fetch(url+'/integrals-api/players',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,503);
  response=await fetch(url+'/integrals-api/players',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}});
  assert.equal(response.status,204);assert.match(response.headers.get('access-control-allow-methods'),/POST/);
  response=await fetch(url+'/integrals-api/health',{headers:{Origin:'https://untrusted.example'}});assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),null);
  response=await fetch(url+'/integrals-api-extra');assert.equal(response.status,404);
 });
 for(const [path,slots] of [['/ws',20],['/cube-ws',6]]){
  await t.test(`${path} creates four rooms, rejects fifth, and handles a join`,async sub=>{
   const clients=[];let firstRoom;
   for(let i=0;i<5;i++){
    const ws=await wsConnect(sub,url,path);clients.push(ws);
    const answer=await requestPacket(ws,{type:'create',nickname:'Integration '+i},value=>value.type==='room'||value.type==='error');
    if(i===4)assert.equal(answer.code,'server_busy');
    else {assert.equal(answer.type,'room');assert.equal((answer.racers||answer.slots).length,slots);firstRoom??=answer.roomId;}
   }
   const joined=await requestPacket(clients[4],{type:'join',roomId:firstRoom,nickname:'Guest'},value=>value.type==='welcome');assert.equal(joined.roomId,firstRoom);
   for(const ws of clients){await requestPacket(ws,{type:'leave'},value=>value.type==='left');await closeSocket(ws);}
  });
  await t.test(`${path} rejects binary, oversized messages and message-rate bursts`,async sub=>{
   const binary=await wsConnect(sub,url,path);let closing=new Promise(resolve=>binary.once('close',resolve));binary.send(Buffer.from([1]));assert.equal(await until(closing),1008);
   const oversized=await wsConnect(sub,url,path);closing=new Promise(resolve=>oversized.once('close',resolve));oversized.send('x'.repeat(8192));assert.equal(await until(closing),1009);
   const burst=await wsConnect(sub,url,path);closing=new Promise(resolve=>burst.once('close',resolve));
   for(let i=0;i<(path==='/ws'?121:81);i++)burst.send('{"type":"input"}');
   assert.equal(await until(closing),1008);
  });
  await t.test(`${path} enforces origin and per-IP connection budget`,async sub=>{
   assert.equal(await rejectedUpgrade(sub,url,path,{Origin:'https://untrusted.example'}),403);
   const ip=path==='/ws'?'192.0.2.11':'192.0.2.12',max=path==='/ws'?48:24,connections=[];
   for(let i=0;i<max;i++)connections.push(await wsConnect(sub,url,path,{'X-Forwarded-For':ip}));
   assert.equal(await rejectedUpgrade(sub,url,path,{'X-Forwarded-For':ip}),403);
   await Promise.all(connections.map(closeSocket));
  });
 }
 assert.equal(await rejectedUpgrade(t,url,'/unknown-ws'),403);
 assert.equal((await fetch(url+'/health')).status,200);
});

test('shared bundled server handles Integrals writes before GET guard and persists them across restart',{timeout:20000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'integrals-shared-'));let server;
 t.after(async()=>{await server?.stop();await rm(directory,{recursive:true,force:true});});
 const dbPath=join(directory,'game.sqlite');server=await startServer(t,dbPath);
 let response=await fetch(server.url+'/integrals-api/health');assert.equal(response.status,200);
 const headers={Origin:origin,'Content-Type':'application/json'};
 response=await fetch(server.url+'/integrals-api/players',{method:'POST',headers,body:JSON.stringify({nickname:'Persistence check'})});assert.equal(response.status,201);
 const created=await response.json();assert.ok(created.token);headers.Authorization='Bearer '+created.token;
 response=await fetch(server.url+'/integrals-api/action',{method:'POST',headers,body:JSON.stringify({id:`${Date.now()}-${randomUUID()}`,type:'click',amount:1})});assert.equal(response.status,200);
 const clicked=(await response.json()).player,earned=clicked.totalEarned;assert.ok(earned>0);assert.ok(clicked.revision>created.player.revision);
 response=await fetch(server.url+'/integrals-api/profile',{method:'PATCH',headers,body:JSON.stringify({nickname:'Saved researcher'})});assert.equal(response.status,200);
 const updated=(await response.json()).player;assert.ok(updated.revision>clicked.revision);
 await server.stop();server=await startServer(t,dbPath);
 response=await fetch(server.url+'/integrals-api/state',{headers});assert.equal(response.status,200);const restored=(await response.json()).player;
 assert.equal(restored.id,created.player.id);assert.equal(restored.nickname,'Saved researcher');assert.equal(restored.totalEarned,earned);
 assert.ok(restored.revision>updated.revision);
 response=await fetch(server.url+'/integrals-api/leaderboard');const ranking=await response.json();assert.equal(ranking.entries[0].id,created.player.id);assert.equal(ranking.entries[0].totalEarned,earned);
 const websocket=await wsConnect(t,server.url,'/cube-ws');const welcome=await requestPacket(websocket,{type:'create',nickname:'Still works'},value=>value.type==='welcome');assert.ok(welcome.roomId);await closeSocket(websocket);
 await server.stop();
});

test('an unusable SQLite path does not prevent existing games from starting',{timeout:10000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'integrals-unavailable-'));let server;
 t.after(async()=>{await server?.stop();await rm(directory,{recursive:true,force:true});});
 server=await startServer(t,directory);
 assert.equal((await fetch(server.url+'/health')).status,200);
 assert.equal((await fetch(server.url+'/cube-health')).status,200);
 const response=await fetch(server.url+'/integrals-api/health');assert.equal(response.status,503);
 assert.equal((await response.json()).error.code,'storage_unavailable');
});
