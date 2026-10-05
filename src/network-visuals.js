const clockNow=()=>performance.now();
const finiteVector=value=>value&&['x','y','z'].every(key=>Number.isFinite(value[key]));
const vector=value=>({x:value.x,y:value.y,z:value.z});
const magnitude=value=>Math.hypot(value.x,value.y,value.z);
const copy=(target,source)=>{target.x=source.x;target.y=source.y;target.z=source.z;return target;};

// Rendering samples live outside the authoritative actors. The server remains
// responsible for every collision; these vectors are used only by their models.
export function createNetworkVisuals({delayMs=75,maxExtrapolationMs=75}={}){
 const delay=Math.max(0,Math.min(250,delayMs))/1000,extrapolation=Math.max(0,Math.min(250,maxExtrapolationMs))/1000;
 let actors=new WeakMap(),clock=null,renderTime=-Infinity;
 function setTime(seconds,receivedAt=clockNow()){
  if(!Number.isFinite(seconds)||!Number.isFinite(receivedAt)||clock&&seconds<clock.seconds)return;
  if(clock)time(seconds,receivedAt);
  clock={seconds,receivedAt};
  if(renderTime===-Infinity)renderTime=seconds-delay;
 }
 function time(fallbackSeconds,now=clockNow()){
  if(!clock)return fallbackSeconds;
  const age=Math.max(0,Math.min(delay+extrapolation,(now-clock.receivedAt)/1000));
  renderTime=Math.max(renderTime,clock.seconds+age-delay);
  return renderTime;
 }
 function record(actor,position,seconds,velocity,receivedAt=clockNow()){
  if(!actor||typeof actor!=='object'||!finiteVector(position)||!Number.isFinite(seconds))return;
  let entry=actors.get(actor),previous=entry?.samples.at(-1);
  if(previous&&seconds<=previous.seconds)return;
  const span=previous?seconds-previous.seconds:0;
  const speed=Math.max(previous?magnitude(previous.velocity):0,finiteVector(velocity)?magnitude(velocity):0);
  const distance=previous?Math.hypot(position.x-previous.position.x,position.y-previous.position.y,position.z-previous.position.z):0;
  const teleport=previous&&distance>Math.max(12,speed*span*3+2);
  const motion=finiteVector(velocity)?vector(velocity):previous&&!teleport&&span>0?{
   x:(position.x-previous.position.x)/span,y:(position.y-previous.position.y)/span,z:(position.z-previous.position.z)/span,
  }:{x:0,y:0,z:0};
  if(!entry){entry={samples:[],position:vector(position),velocity:vector(motion)};actors.set(actor,entry);}
  if(teleport){entry.samples.length=0;copy(entry.position,position);copy(entry.velocity,motion);}
  entry.samples.push({seconds,position:vector(position),velocity:motion,receivedAt});
  if(entry.samples.length>6)entry.samples.shift();
 }
 function position(actor,fallback,now=clockNow()){
  const entry=actors.get(actor);if(!entry)return fallback;
  const samples=entry.samples,last=samples.at(-1),at=time(last.seconds,now),first=samples[0];
  if(at<=first.seconds){copy(entry.velocity,first.velocity);return copy(entry.position,first.position);}
  for(let index=1;index<samples.length;index++){
   const next=samples[index];if(at>next.seconds)continue;
   const previous=samples[index-1],span=next.seconds-previous.seconds,t=(at-previous.seconds)/span;
   for(const key of ['x','y','z']){
    entry.position[key]=previous.position[key]+(next.position[key]-previous.position[key])*t;
    entry.velocity[key]=(next.position[key]-previous.position[key])/span;
   }
   return entry.position;
  }
  const ahead=Math.max(0,Math.min(extrapolation,at-last.seconds));
  for(const key of ['x','y','z'])entry.position[key]=last.position[key]+last.velocity[key]*ahead;
  copy(entry.velocity,last.velocity);return entry.position;
 }
 function velocity(actor,fallback){return actors.get(actor)?.velocity||fallback;}
 function reset(){actors=new WeakMap();clock=null;renderTime=-Infinity;}
 return {record,position,velocity,setTime,time,reset};
}
