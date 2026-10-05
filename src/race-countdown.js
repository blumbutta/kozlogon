// Server snapshots may repeat, skip a number, or arrive after the starting cue.
// Play the current count once, without replaying missed counts for spectators.
export function createRaceCountdown({onTick=()=>{},onGo=()=>{}}={}){
 let lastTick=Infinity,seenCountdown=false,started=false,goAt=-Infinity;
 const now=()=>globalThis.performance?.now()??Date.now();
 function reset(){lastTick=Infinity;seenCountdown=false;started=false;goAt=-Infinity;}
 function go(time=now()){
  if(!seenCountdown||started)return false;
  started=true;goAt=time;onGo();return true;
 }
 function update(phase,counter,time=now()){
  if(phase==='countdown'){
   seenCountdown=true;
   const tick=Math.max(1,Math.ceil(Number.isFinite(counter)?counter:1));
   if(!started&&tick<lastTick){lastTick=tick;onTick(tick);}
   return started&&time-goAt<800?'СТАРТ!':started?'':String(tick);
  }
  if(phase==='racing'){
   go(time);return started&&time-goAt<800?'СТАРТ!':'';
  }
  return '';
 }
 return{update,go,reset};
}
