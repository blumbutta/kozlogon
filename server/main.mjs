import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { RaceEngine } from '../src/physics.js';
import { createNetworkWorld } from '../src/network-world.js';
import { withWorld } from '../src/worlds.js';
import { RoomManager, SERVER_PHYSICS_HZ } from './rooms.mjs';

const port=Number(process.env.PORT||10000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer between 1 and 65535');
const boundedEnv=(name,fallback,max)=>{const value=Number(process.env[name]||fallback);return Number.isInteger(value)&&value>0&&value<=max?value:fallback;};
const allowedOrigins=new Set((process.env.ALLOWED_ORIGINS||'https://blumbutta.github.io').split(',').map(value=>value.trim()).filter(Boolean));
const originAllowed=origin=>!origin||allowedOrigins.has(origin)||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const manager=new RoomManager({
 maxRooms:boundedEnv('MAX_ROOMS',4,32),maxActiveRaces:boundedEnv('MAX_ACTIVE_RACES',1,8),withWorld,
 engineFactory(worldId,racers,event){
  const world=createNetworkWorld(worldId);
  for(const racer of racers)Object.assign(world.goats[racer.id],racer);
  return new RaceEngine(world.goats,world.hazards,event,{...world,network:true});
 },
});
const server=createServer((request,response)=>{
 response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');
 if(request.headers.origin&&originAllowed(request.headers.origin)){response.setHeader('Access-Control-Allow-Origin',request.headers.origin);response.setHeader('Vary','Origin');}
 const send=(status,body)=>{response.writeHead(status);response.end(request.method==='HEAD'?undefined:JSON.stringify(body));};
 if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD');send(405,{error:'Method not allowed'});return;}
 const path=request.url.split('?')[0];
 if(path==='/health')send(200,{ok:true});
 else if(path==='/')send(200,{service:'kozlogon-server',status:'online',multiplayerReady:true,gameUrl:'https://blumbutta.github.io/kozlogon/'});
 else send(404,{error:'Not found'});
});
const sockets=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
const connectionsByIp=new Map();
server.on('upgrade',(request,socket,head)=>{
 const path=request.url.split('?')[0],origin=request.headers.origin;
 // The forwarded address is supplied by Render's reverse proxy.
 const ip=String(request.headers['x-forwarded-for']||request.socket.remoteAddress||'unknown').split(',')[0].trim();
 if(path!=='/ws'||!originAllowed(origin)||(connectionsByIp.get(ip)||0)>=48){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
 sockets.handleUpgrade(request,socket,head,ws=>{ws.clientIp=ip;sockets.emit('connection',ws,request);});
});
sockets.on('connection',ws=>{
 const ip=ws.clientIp;connectionsByIp.set(ip,(connectionsByIp.get(ip)||0)+1);
 const sendPacket=packet=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<1024*1024)ws.send(packet);else if(ws.bufferedAmount>=1024*1024)ws.close(1013,'Connection too slow');};
 const connection={send(message){sendPacket(typeof message==='string'?message:JSON.stringify(message));},sendPacket,close(){ws.close(4001,'Reconnected elsewhere');}};
 ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true;});
 let windowStart=Date.now(),messages=0;
 ws.on('message',(data,isBinary)=>{
  const now=Date.now();if(now-windowStart>=1000){windowStart=now;messages=0;}if(++messages>120||isBinary){ws.close(1008,'Invalid message rate');return;}
  let payload;try{payload=JSON.parse(data.toString());}catch{connection.send({type:'error',code:'invalid_message',message:'Некорректное сообщение.'});return;}
  manager.receive(connection,payload);
 });
 ws.on('error',()=>{});
 ws.on('close',()=>{manager.disconnect(connection);const count=(connectionsByIp.get(ip)||1)-1;if(count>0)connectionsByIp.set(ip,count);else connectionsByIp.delete(ip);});
});
const simulation=setInterval(()=>manager.advance(),1000/SERVER_PHYSICS_HZ);
const heartbeat=setInterval(()=>{for(const ws of sockets.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},10_000);heartbeat.unref();
server.listen(port,'0.0.0.0',()=>console.log(`Kozlogon multiplayer server listening on port ${port}`));
let closing=false;
function shutdown(){
 if(closing)return;closing=true;clearInterval(simulation);clearInterval(heartbeat);manager.shutdown();
 for(const ws of sockets.clients)ws.close(1012,'Server restarting');
 const timeout=setTimeout(()=>{for(const ws of sockets.clients)ws.terminate();server.closeAllConnections();process.exit(1);},5000);timeout.unref();
 sockets.close();server.close(()=>{clearTimeout(timeout);process.exitCode=0;});
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
