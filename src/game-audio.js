// All sounds are synthesized locally. Call enable(true) from a click/touch handler.
// A profile changes waveform, formants, syllables, pitch contour and modulation.
const VOICES = {
 goat: [
  {pitch:178,wave:'sawtooth',formants:[780,1580,2600],rhythm:[[0,.19,1],[.24,.19,.9],[.48,.42,1]],contour:[1,1.18,.76],rough:.10,rate:10,depth:20},
  {pitch:235,wave:'square',formants:[1080,2050,3200],rhythm:[[0,.58,1],[.66,.18,.8]],contour:[1.3,.82,1.1],rough:.03,rate:6,depth:28},
  {pitch:132,wave:'sawtooth',formants:[610,1190,2120],rhythm:[[0,1.08,1]],contour:[.78,1.3,.66],rough:.29,rate:14,depth:11},
  {pitch:286,wave:'triangle',formants:[940,1750,2900],rhythm:[[0,.25,.9],[.34,.54,1]],contour:[1,1.42,.88],rough:.08,rate:4,depth:37},
  {pitch:100,wave:'square',formants:[430,940,1830],rhythm:[[0,.17,1],[.23,.13,.65],[.41,.63,1]],contour:[.9,1.05,.55],rough:.22,rate:7,depth:14}
 ],
 cow: [
  {pitch:83,wave:'sawtooth',formants:[420,840,1500],rhythm:[[0,1.25,1]],contour:[1,1.18,.65],rough:.09,rate:3.5,depth:6},
  {pitch:121,wave:'triangle',formants:[620,1210,2050],rhythm:[[0,.27,.85],[.37,.28,1],[.75,.56,.9]],contour:[1.3,1,.88],rough:.04,rate:6,depth:16},
  {pitch:62,wave:'square',formants:[290,660,1230],rhythm:[[0,.64,1],[.76,.64,1]],contour:[.83,1.09,.58],rough:.26,rate:8,depth:5},
  {pitch:106,wave:'sawtooth',formants:[510,1050,1790],rhythm:[[0,.40,1],[.55,.75,1]],contour:[1,1.53,.75],rough:.13,rate:4.2,depth:13},
  {pitch:73,wave:'triangle',formants:[365,790,1680],rhythm:[[0,1.5,.95]],contour:[1.25,.88,.48],rough:.33,rate:2.2,depth:8}
 ],
 deer: [
  {pitch:370,wave:'triangle',formants:[1250,2280,3300],rhythm:[[0,.32,1],[.43,.46,.9]],contour:[1,1.57,.82],rough:.07,rate:9,depth:32},
  {pitch:455,wave:'sine',formants:[1510,2680,3650],rhythm:[[0,.15,1],[.23,.15,.8],[.47,.37,1]],contour:[1.14,1.52,.98],rough:.03,rate:14,depth:54},
  {pitch:265,wave:'sawtooth',formants:[980,1930,2980],rhythm:[[0,1.15,1]],contour:[.82,1.8,.62],rough:.20,rate:6,depth:26},
  {pitch:328,wave:'square',formants:[1120,2460,3470],rhythm:[[0,.44,1],[.63,.24,.85]],contour:[1.4,.86,1.15],rough:.10,rate:12,depth:21},
  {pitch:520,wave:'triangle',formants:[1770,3090,4050],rhythm:[[0,.66,1],[.81,.15,.6]],contour:[.88,1.27,.71],rough:.13,rate:3.8,depth:63}
 ],
 moose: [
  {pitch:57,wave:'sawtooth',formants:[300,600,1080],rhythm:[[0,1.15,1]],contour:[.8,1.15,.55],rough:.24,rate:5,depth:7},
  {pitch:75,wave:'square',formants:[390,770,1440],rhythm:[[0,.32,1],[.51,.76,.95]],contour:[1.18,.84,.63],rough:.18,rate:9,depth:10},
  {pitch:45,wave:'sawtooth',formants:[235,490,920],rhythm:[[0,.20,.8],[.31,.20,1],[.62,.81,1]],contour:[.96,1.45,.7],rough:.35,rate:7,depth:4},
  {pitch:94,wave:'triangle',formants:[470,950,1630],rhythm:[[0,.63,1],[.81,.49,.9]],contour:[1,1.65,.72],rough:.09,rate:3,depth:16},
  {pitch:64,wave:'square',formants:[345,690,1260],rhythm:[[0,1.52,1]],contour:[1.3,.72,.46],rough:.29,rate:11,depth:12}
 ]
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const midi=n=>440*Math.pow(2,(n-69)/12);
const MELODY=[72,76,79,76,74,77,81,77,76,79,84,79,74,77,79,71,72,76,79,84,81,77,74,77,79,76,72,76,74,71,72,79];
const CHORDS=[[48,52,55],[53,57,60],[48,52,55],[55,59,62]];
const MAX_VOICES=32,MAX_ANIMALS=4;

export function createGameAudio(){
 let audio=null,enabled=false,master=null,buses=null,ambient=null;
 let phase='intro',listener={x:0,y:0,z:0},musicBeat=0,musicRemaining=0,clock=0,finishUntil=-1;
 const active=new Set(),buffers=new Map(),bearTimes=new Map();
 function param(p,value,t=audio?.currentTime||0,seconds=.035){
  if(!p)return;p.cancelScheduledValues(t);p.setValueAtTime(p.value,t);p.linearRampToValueAtTime(value,t+seconds);
 }
 function remove(v,stop=false){
  if(v.dead)return;v.dead=true;active.delete(v);
  if(stop)for(const source of v.sources){try{source.stop(audio.currentTime);}catch{}}
  for(const node of v.nodes){try{node.disconnect();}catch{}}
 }
 function clear(tag){for(const v of [...active])if(!tag||v.tag===tag)remove(v,true);}
 function noise(kind){
  if(buffers.has(kind))return buffers.get(kind);
  const rate=audio.sampleRate,channels=kind==='rain'||kind==='clap'?2:1;
  const buffer=audio.createBuffer(channels,Math.ceil(rate*(kind==='clap'?1:3)),rate);
  for(let ch=0;ch<channels;ch++){
   const data=buffer.getChannelData(ch);let last=0,smooth=0;
   for(let i=0;i<data.length;i++){
    const white=Math.random()*2-1;
    if(kind==='brown'){last=(last+white*.045)/1.025;data[i]=last*3.4;}
    else if(kind==='rain'){smooth=smooth*.45+white*.55;data[i]=(white-smooth)*.9;}
    else if(kind==='clap')data[i]=white*(.28+.72*Math.pow(Math.abs(Math.sin(i/rate*(ch?19:17)*Math.PI)),16));
    else data[i]=white;
   }
  }
  buffers.set(kind,buffer);return buffer;
 }
 function spatial(position,range=160){
  if(!position)return {gain:1,pan:0};
  const dx=(position.x||0)-listener.x,dz=(position.z||0)-listener.z,dy=(position.y||0)-listener.y;
  const distance=Math.hypot(dx,dy,dz);return {gain:distance>range?0:1/(1+distance*.045),pan:clamp(dx/Math.max(16,distance),-.85,.85)};
 }
 function ready(){return enabled&&audio&&phase!=='paused';}
 function voice(tag,duration,volume=1,position,start=audio?.currentTime||0){
  if(!ready())return null;
  const s=spatial(position,tag==='effect'?230:100);if(s.gain<.008)return null;
  if(tag==='animal'&&[...active].filter(v=>v.tag==='animal').length>=MAX_ANIMALS)return null;
  if(tag==='music'&&[...active].filter(v=>v.tag==='music').length>=12)return null;
  if(active.size>=MAX_VOICES){const expendable=[...active].find(v=>v.tag==='music');if(expendable)remove(expendable,true);else return null;}
  const v={tag,nodes:[],sources:[],ended:new Set(),end:start+duration+.04,dead:false,start};
  v.add=node=>{v.nodes.push(node);return node;};
  const gain=v.add(audio.createGain());gain.gain.value=volume*s.gain;
  if(audio.createStereoPanner){const panner=v.add(audio.createStereoPanner());panner.pan.value=s.pan;gain.connect(panner);panner.connect(buses[tag==='animal'?'animal':tag==='music'?'music':'effect']);}
  else gain.connect(buses[tag==='animal'?'animal':tag==='music'?'music':'effect']);
  v.out=gain;v.source=(source,end=v.end)=>{
   v.add(source);v.sources.push(source);source.onended=()=>{v.ended.add(source);if(v.ended.size===v.sources.length)remove(v);};
   source.start(start);source.stop(end);return source;
  };
  active.add(v);return v;
 }
 function envelope(v,volume,duration,attack=.007){
  const g=v.add(audio.createGain()),t=v.start;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+duration);g.connect(v.out);return g;
 }
 function oscillator(v,type,frequency,out,duration,endFrequency){
  const osc=audio.createOscillator();osc.type=type;osc.frequency.setValueAtTime(Math.max(15,frequency),v.start);
  if(endFrequency)osc.frequency.exponentialRampToValueAtTime(Math.max(15,endFrequency),v.start+duration);
  osc.connect(out);return v.source(osc,v.start+duration+.02);
 }
 function noiseBurst(v,kind,frequency,out,duration,Q=.8){
  const source=audio.createBufferSource();source.buffer=noise(kind);source.loop=true;
  const filter=v.add(audio.createBiquadFilter());filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=Q;source.connect(filter);filter.connect(out);return v.source(source,v.start+duration+.02);
 }
 function stopAmbient(){if(!ambient)return;for(const s of ambient.sources){try{s.stop();}catch{}}for(const node of ambient.nodes){try{node.disconnect();}catch{}}ambient=null;}
 function buildAmbient(){
  if(ambient)return;ambient={nodes:[],sources:[]};
  const add=node=>{ambient.nodes.push(node);return node;};
  for(const [kind,type,frequency,Q] of [['rain','highpass',950,.6],['brown','lowpass',640,.7]]){
   const source=add(audio.createBufferSource()),filter=add(audio.createBiquadFilter()),gain=add(audio.createGain());
   source.buffer=noise(kind);source.loop=true;filter.type=type;filter.frequency.value=frequency;filter.Q.value=Q;gain.gain.value=0;
   source.connect(filter);filter.connect(gain);gain.connect(master);source.start();ambient.sources.push(source);ambient[kind]=gain;
  }
 }
 function init(){
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)return false;
  audio=new Context();master=audio.createGain();master.gain.value=.72;
  if(audio.createDynamicsCompressor){const limiter=audio.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=14;limiter.ratio.value=9;limiter.attack.value=.003;limiter.release.value=.18;master.connect(limiter);limiter.connect(audio.destination);}
  else master.connect(audio.destination);
  buses={};for(const name of ['animal','music','effect']){const gain=audio.createGain();gain.gain.value=name==='music'?.75:1;gain.connect(master);buses[name]=gain;}return true;
 }
 function enable(value){
  if(!value){enabled=false;clear();stopAmbient();return false;}
  try{if(!audio&&!init())return false;enabled=true;buildAmbient();const resumed=audio.resume?.();if(resumed?.catch)resumed.catch(()=>{});return true;}
  catch{enabled=false;clear();stopAmbient();return false;}
 }
 function animal(def,volume=.14,position){
  const species=def?.species||'goat',index=clamp(Math.trunc(def?.variant||0),0,4),original=(VOICES[species]||VOICES.goat)[index];
  const p=def?.theme==='hell'?{...original,pitch:original.pitch*.62,wave:'sawtooth',formants:original.formants.map(f=>f*.65),rough:original.rough+.22}:def?.theme==='moon'?{...original,pitch:original.pitch*1.65,wave:'sine',formants:original.formants.map(f=>f*1.22),depth:original.depth+32}:original;
  const duration=p.rhythm.at(-1)[0]+p.rhythm.at(-1)[1],v=voice('animal',duration,clamp(volume,0,.35),position);if(!v)return false;
  const t=v.start,amp=v.add(audio.createGain());amp.gain.setValueAtTime(.0001,t);amp.connect(v.out);
  for(const [offset,length,strength] of p.rhythm){amp.gain.setValueAtTime(.0001,t+offset);amp.gain.linearRampToValueAtTime(strength,t+offset+.055);amp.gain.setValueAtTime(strength*.72,t+offset+length*.58);amp.gain.exponentialRampToValueAtTime(.0001,t+offset+length);}
  const source=audio.createOscillator();source.type=p.wave;source.frequency.setValueAtTime(p.pitch*p.contour[0],t);source.frequency.linearRampToValueAtTime(p.pitch*p.contour[1],t+duration*.35);source.frequency.exponentialRampToValueAtTime(p.pitch*p.contour[2],t+duration);
  p.formants.forEach((frequency,i)=>{const filter=v.add(audio.createBiquadFilter()),level=v.add(audio.createGain());filter.type='bandpass';filter.Q.value=3+i;filter.frequency.setValueAtTime(frequency,t);filter.frequency.linearRampToValueAtTime(frequency*(index%2?1.22:.78),t+duration);level.gain.value=[1,.66,.35][i];source.connect(filter);filter.connect(level);level.connect(amp);});
  const direct=v.add(audio.createGain());direct.gain.value=.16;source.connect(direct);direct.connect(amp);
  v.source(source,t+duration+.02);
  const sub=v.add(audio.createGain());sub.gain.value=.26;sub.connect(amp);oscillator(v,'sine',p.pitch*.5,sub,duration,p.pitch*p.contour[2]*.5);
  const lfo=audio.createOscillator(),depth=v.add(audio.createGain());lfo.frequency.value=p.rate;depth.gain.value=p.depth;lfo.connect(depth);depth.connect(source.frequency);v.source(lfo,t+duration+.02);
  const breath=v.add(audio.createGain());breath.gain.value=p.rough;breath.connect(amp);noiseBurst(v,'white',p.formants[0]*1.3,breath,duration,.7);
  return true;
 }
 function pluck(note,duration,volume,type='triangle',start=audio.currentTime){
  const v=voice('music',duration,1,null,start);if(!v)return;oscillator(v,type,midi(note),envelope(v,volume,duration),duration);
 }
 function percussion(high,start){
  const v=voice('music',.11,1,null,start);if(!v)return;
  if(high)noiseBurst(v,'white',6500,envelope(v,.028,.075),.08,.4);
  else oscillator(v,'sine',105,envelope(v,.09,.12),.12,42);
 }
 function beat(start){
  const n=musicBeat++%MELODY.length;
  pluck(MELODY[n],.18,.045,n%8<4?'triangle':'sine',start);
  if(n%2===0){const chord=CHORDS[Math.floor(n/8)];pluck(chord[(n/2)%3],.28,.055,'sine',start);percussion(false,start);}
  else percussion(true,start);
  if(n%8===0)for(const note of CHORDS[Math.floor(n/8)])pluck(note+12,.40,.012,'triangle',start);
 }
 function shot(position,burst=1){
  const count=clamp(Math.round(burst)||1,1,6);let played=false;
  for(let i=0;i<count;i++){
   const v=voice('effect',.16,1,position,(audio?.currentTime||0)+i*.075);if(!v)break;
   noiseBurst(v,'white',2700,envelope(v,.24,.10),.12,.5);oscillator(v,'square',190,envelope(v,.13,.09),.10,55);played=true;
  }
  return played;
 }
 function growl(position){
  const v=voice('effect',1.25,1,position);if(!v)return false;
  const amp=envelope(v,.25,1.2,.08);noiseBurst(v,'brown',260,amp,1.2,1.8);
  const osc=audio.createOscillator(),filter=v.add(audio.createBiquadFilter());osc.type='sawtooth';osc.frequency.setValueAtTime(58,v.start);osc.frequency.linearRampToValueAtTime(86,v.start+.4);osc.frequency.exponentialRampToValueAtTime(38,v.start+1.2);filter.type='lowpass';filter.frequency.value=520;osc.connect(filter);filter.connect(amp);v.source(osc,v.start+1.25);
  const lfo=audio.createOscillator(),depth=v.add(audio.createGain());lfo.frequency.value=19;depth.gain.value=12;lfo.connect(depth);depth.connect(osc.frequency);v.source(lfo,v.start+1.25);return true;
 }
 function explosion(position,strength=1){
  const k=clamp(strength,.3,2),v=voice('effect',1.65,1,position);if(!v)return false;
  noiseBurst(v,'brown',180,envelope(v,.60*k,1.5,.008),1.55,.8);
  noiseBurst(v,'white',1800,envelope(v,.33*k,.45,.003),.5,.6);
  oscillator(v,'sine',105,envelope(v,.55*k,1.2,.006),1.25,28);return true;
 }
 function cluster(position){
  const v=voice('effect',.65,1,position);if(!v)return false;
  noiseBurst(v,'white',3200,envelope(v,.23,.13),.15,1.4);
  for(let i=0;i<3;i++)oscillator(v,'triangle',820+i*480,envelope(v,.09,.52),.56,180+i*60);
  return true;
 }
 function finish(){
  if(!ready()||clock<finishUntil)return false;finishUntil=clock+5;clear('music');clear('effect');
  const now=audio.currentTime;
  for(const [i,n] of [72,76,79,84].entries()){
   const v=voice('effect',1.5,1,null,now+i*.15);if(v){oscillator(v,'triangle',midi(n),envelope(v,.16,1.4,.025),1.45);oscillator(v,'sine',midi(n-12),envelope(v,.07,1.3),1.4);}
  }
  const applause=voice('effect',4.7,1);if(applause){const amp=envelope(applause,.35,4.6,.15);amp.gain.setValueAtTime(.28,now+3.3);amp.gain.exponentialRampToValueAtTime(.0001,now+4.6);noiseBurst(applause,'clap',1600,amp,4.65,.45);}
  return true;
 }
 function cue(kind){
  const p={jump:[420,.16,'triangle'],boost:[640,.25,'triangle'],trap:[180,.18,'square'],bomb:[260,.14,'triangle'],countdown:[370,.12,'sine'],go:[700,.30,'triangle'],score:[900,.12,'sine'],death:[110,.35,'sawtooth'],bounce:[290,.13,'triangle'],lightning:[65,.70,'sawtooth']}[kind]||[480,.12,'sine'];
  const v=voice('effect',p[1],1);if(!v)return false;oscillator(v,p[2],p[0],envelope(v,.07,p[1]),p[1],p[0]*.65);return true;
 }
 function update(dt,state={}){
  const wasPaused=phase==='paused';phase=state.phase||phase;
  if(state.playerPosition)listener={x:state.playerPosition.x||0,y:state.playerPosition.y||0,z:state.playerPosition.z||0};
  if(!audio||!enabled)return;
  for(const v of [...active])if(audio.currentTime>v.end+.1)remove(v,true);
  if(phase==='paused'){
   if(!wasPaused)clear();param(ambient?.rain?.gain,0);param(ambient?.brown?.gain,0);return;
  }
  dt=clamp(dt,0,.25);if(dt===0)return;clock+=dt;
  const weather=state.weather||{},name=typeof weather==='string'?weather:weather.name||'';
  const kind=typeof weather==='object'?weather.kind:name;
  const rain=(kind==='storm'||name==='Гроза')?.25:(kind==='rain'||name==='Дождь')?.21:0;
  const wind=clamp(typeof weather==='object'?weather.wind||0:0,0,12);
  const inGame=['countdown','racing','celebrating'].includes(phase);
  param(ambient.rain.gain,inGame?rain:0);param(ambient.brown.gain,inGame?(.012+wind*.013)*(1+.22*Math.sin(clock*1.1)):0);
  const musicAllowed=['intro','countdown','racing','celebrating','finished'].includes(phase)&&state.music!==false;
  if(musicAllowed){musicRemaining-=dt;while(musicRemaining<=0){beat(audio.currentTime+Math.max(0,musicRemaining+dt));musicRemaining+=.24;}}
  if(inGame)for(const bear of (state.bears||[]).slice(0,64)){
   if(bear.destroyed)continue;const position=bear.position||bear.g?.position||bear.body?.position;if(!position)continue;
   const key=bear.id??bear.s??bear;if(Math.hypot(position.x-listener.x,position.z-listener.z)>65)continue;
   if(clock>=(bearTimes.get(key)||0)){if(growl(position)){if(!bearTimes.has(key)&&bearTimes.size>=64)bearTimes.delete(bearTimes.keys().next().value);bearTimes.set(key,clock+4.5+(Math.abs(position.z)%3));}break;}
  }
 }
 function reset(){clear();musicBeat=0;musicRemaining=0;clock=0;finishUntil=-1;bearTimes.clear();phase='intro';if(ambient){param(ambient.rain.gain,0);param(ambient.brown.gain,0);}}
 function preview(def){clear('animal');return animal(def,.2);}
 return {enable,update,animal,preview,shot,growl,explosion,cluster,finish,cue,reset,get enabled(){return enabled;}};
}
