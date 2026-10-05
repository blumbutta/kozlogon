export const MULTIPLAYER_SERVER = 'https://kozlogon-server.onrender.com';

export function createMultiplayerClient({serverUrl=MULTIPLAYER_SERVER,onMessage=()=>{},onStatus=()=>{},onError=()=>{}}={}) {
 const url=new URL(serverUrl);url.protocol=url.protocol==='http:'?'ws:':'wss:';url.pathname='/ws';url.search='';url.hash='';
 const compression=typeof DecompressionStream==='function';
 let socket=null,pending=null,retryTimer=null,closed=true,generation=0,attempt=0,credentials=null;
 const storageKey=roomId=>'kozlogon-room:'+url.host+':'+roomId;
 const remember=welcome=>{
  credentials={roomId:welcome.roomId,reconnectToken:welcome.reconnectToken};
  pending={type:'join',...credentials,compression};
  try{sessionStorage.setItem(storageKey(welcome.roomId),JSON.stringify(credentials));}catch{}
 };
 function dial(){
  const current=++generation;onStatus(attempt?'reconnecting':'connecting');
  socket=new WebSocket(url.href);socket.binaryType='arraybuffer';let incoming=Promise.resolve();
  socket.onopen=()=>{if(current!==generation)return;attempt=0;onStatus('connected');socket.send(JSON.stringify(pending));};
  socket.onmessage=event=>{incoming=incoming.then(async()=>{
   if(current!==generation)return;
   let data=event.data;
   if(typeof data!=='string')data=await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
   if(current!==generation)return;
   let message;try{message=JSON.parse(data);}catch{return;}
   if(message.type==='welcome')remember(message);
   if(message.type==='error')onError(message.message||'Не удалось войти в комнату');
   if(message.type==='replaced'){closed=true;onStatus('offline');}
   onMessage(message);
  }).catch(()=>{if(current===generation){onError('Не удалось прочитать обновление игры. Переподключаемся…');socket.close();}});};
  socket.onerror=()=>{if(current===generation)onStatus('reconnecting');};
  socket.onclose=()=>{
   if(current!==generation||closed)return;onStatus('reconnecting');
   retryTimer=setTimeout(dial,Math.min(5000,500*1.5**attempt++));
  };
 }
 function open(command){
  closed=true;generation++;clearTimeout(retryTimer);socket?.close();credentials=null;
  pending={...command,compression};if(command.type==='join'){
   try{const saved=JSON.parse(sessionStorage.getItem(storageKey(command.roomId))||'null');if(saved?.reconnectToken)pending.reconnectToken=saved.reconnectToken;}catch{}
  }
  closed=false;attempt=0;dial();
 }
 function send(command){if(socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify(command));return true;}
 function leave(){closed=true;generation++;clearTimeout(retryTimer);if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'leave'}));socket?.close();socket=null;if(credentials){try{sessionStorage.removeItem(storageKey(credentials.roomId));}catch{}}credentials=null;onStatus('offline');}
 return {open,send,leave,get connected(){return socket?.readyState===WebSocket.OPEN;},get active(){return !closed;}};
}
