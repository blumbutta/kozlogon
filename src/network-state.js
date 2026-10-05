// Rendering objects and Cannon worlds never cross the network boundary.
const goatFields = ['s','x','speed','vx','jump','dead','invulnerable','slow','finishTime','finishPlace','score','kills','rage','wildlifeHits','rideTime','grounded','touchingGround','turnAngle','roadHeading','motionTime','airTime','trickStart','trickActive','trickAirborne','trickArmedUntil','boostTime','onIce','lastVocal','lastDeath','lastInputSeq','cd','stats','isBot','name','nickname'];
const omit = new Set(['body','world','g','visual','root','roll','shield','marker','tintMaterials','rig','ride','previousAxle','wheelLastPosition','hit','boostSeen','grounding','profile','collider','character','material']);
function plain(value, depth=0) {
 if (value===null || typeof value==='string' || typeof value==='boolean') return value;
 if (typeof value==='number') return Number.isFinite(value)?Math.round(value*1000)/1000:null;
 if (value===undefined || typeof value==='function' || depth>6) return undefined;
 if (value instanceof Set) return [...value];
 if (Array.isArray(value)) return value.slice(0,240).map(item=>plain(item,depth+1));
 const result={};
 for (const [key,item] of Object.entries(value)) { if(omit.has(key))continue; const next=plain(item,depth+1); if(next!==undefined)result[key]=next; }
 return result;
}
const vector = value => value ? {x:Math.round(value.x*1000)/1000,y:Math.round(value.y*1000)/1000,z:Math.round(value.z*1000)/1000,...(value.w===undefined?{}:{w:Math.round(value.w*10000)/10000})} : null;
const pick=(value,fields)=>Object.fromEntries(fields.filter(key=>value[key]!==undefined).map(key=>[key,plain(value[key])]));

export function serializeState(engine) {
 return {
  phase:engine.phase,counter:engine.counter,elapsed:engine.elapsed,weatherIndex:engine.weatherIndex,physicsHz:engine.physicsHz||60,
  goats:engine.goats.map(goat=>({id:goat.id,characterId:goat.characterId,...pick(goat,goatFields),position:vector(goat.body?.position),velocity:vector(goat.body?.velocity),quaternion:vector(goat.body?.quaternion),angularVelocity:vector(goat.body?.angularVelocity)})),
  hazards:engine.hazards.map((hazard,index)=>({index,...pick(hazard,['x','destroyed','warning','lastShot','aim'])})).filter((value)=>engine.hazards[value.index].destroyed||['bear','hunter','gunner'].includes(engine.hazards[value.index].kind)),
  wildlife:engine.wildlife.map(animal=>({id:animal.id,...pick(animal,['position','consumed'])})),
  skiers:engine.skiers.map(animal=>({id:animal.id,...pick(animal,['position','consumed'])})),
  snowmobiles:engine.snowmobiles.map(pickup=>({id:pickup.id,consumed:pickup.consumed})),
  entities:engine.entities.map(entity=>({...plain({...entity,...(entity.history?{history:entity.history.slice(-2).map(vector)}:{})}),position:vector(entity.body?.position||entity.position),velocity:vector(entity.body?.velocity||entity.velocity)})),
 };
}

function copyVector(target,value){if(!target||!value)return;if(target.set)value.w===undefined?target.set(value.x,value.y,value.z):target.set(value.x,value.y,value.z,value.w);else Object.assign(target,value);}
export function applyState(engine,state) {
 for(const key of ['phase','counter','elapsed','weatherIndex','physicsHz'])if(state[key]!==undefined)engine[key]=state[key];
 for(const entry of state.goats||[]){const goat=engine.goats.find(value=>value.id===entry.id);if(!goat)continue;Object.assign(goat,pick(entry,goatFields));
  for(const key of ['position','velocity','quaternion','angularVelocity'])copyVector(goat.body?.[key],entry[key]);
  if(goat.body){goat.body.aabbNeedsUpdate=true;goat.body.collisionFilterMask=goat.dead||goat.finishTime!==null?0:7;}
 }
 for(const entry of state.hazards||[]){const hazard=engine.hazards[entry.index];if(hazard)Object.assign(hazard,pick(entry,['x','destroyed','warning','lastShot','aim']));}
 for(const key of ['wildlife','skiers','snowmobiles'])for(const entry of state[key]||[]){const item=engine[key]?.find(value=>value.id===entry.id);if(item){if(entry.position)item.previous=item.position?{...item.position}:{...entry.position};Object.assign(item,entry);}}
 const previous=new Map(engine.entities.map(entity=>[entity.id,entity]));
 engine.entities=(state.entities||[]).map(entry=>{const entity=previous.get(entry.id)||{},history=entity.history||[];Object.assign(entity,entry);if(entry.kind==='bullet'&&entry.history){for(const point of entry.history){const last=history.at(-1);if(!last||Math.hypot(point.x-last.x,point.y-last.y,point.z-last.z)>.01)history.push(point);}entity.history=history.slice(-220);}if(entity.body){copyVector(entity.body.position,entry.position);copyVector(entity.body.velocity,entry.velocity);}return entity;});
 for(const [id,entity] of previous)if(entity.body&&!engine.entities.some(item=>item.id===id))engine.world?.removeBody(entity.body);
 return engine;
}

export function serializeEvent(type,data,engine) {
 const encode=(value,depth=0)=>{
  if(value===null||typeof value!=='object')return plain(value);
  if(depth>5)return undefined;
  if(engine){
   const goat=engine.goats.indexOf(value);if(goat>=0)return {_ref:'goat',id:value.id};
   const hazard=engine.hazards.indexOf(value);if(hazard>=0)return {_ref:'hazard',index:hazard};
   for(const key of ['wildlife','skiers','snowmobiles'])if(engine[key]?.includes(value))return {_ref:key,id:value.id};
   if(engine.entities.includes(value))return {_ref:'entity',id:value.id,data:plain(value)};
  }
  if(Array.isArray(value))return value.map(item=>encode(item,depth+1));
  const result={};for(const [key,item] of Object.entries(value)){if(omit.has(key))continue;const next=encode(item,depth+1);if(next!==undefined)result[key]=next;}return result;
 };
 return {type,data:encode(data)};
}

export function deserializeEvent(event,engine) {
 const decode=value=>{
  if(value===null||typeof value!=='object')return value;
  if(value._ref==='goat')return engine.goats.find(item=>item.id===value.id);
  if(value._ref==='hazard')return engine.hazards[value.index];
  if(['wildlife','skiers','snowmobiles'].includes(value._ref))return engine[value._ref].find(item=>item.id===value.id);
  if(value._ref==='entity')return engine.entities.find(item=>item.id===value.id)||value.data;
  if(Array.isArray(value))return value.map(decode);
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,decode(item)]));
 };
 return {...event,data:decode(event.data)};
}
