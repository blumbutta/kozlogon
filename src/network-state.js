// Rendering objects and Cannon worlds never cross the network boundary.
const goatFields = ['s','x','speed','vx','jump','dead','invulnerable','slow','finishTime','finishPlace','score','kills','rage','wildlifeHits','rideTime','grounded','touchingGround','turnAngle','roadHeading','motionTime','airTime','trickStart','trickActive','trickAirborne','trickArmedUntil','boostTime','onIce','lastVocal','lastDeath','lastInputSeq','cd','stats','isBot','name','nickname'];
const hazardFields = ['x','destroyed','warning','lastShot','aim'];
const movingFields = ['position','consumed'];
const omit = new Set(['body','world','g','visual','root','roll','shield','marker','tintMaterials','rig','ride','previousAxle','wheelLastPosition','hit','boostSeen','grounding','profile','collider','character','material']);
function plain(value, depth=0) {
 if (value===null || typeof value==='string' || typeof value==='boolean') return value;
 if (typeof value==='number') return Number.isFinite(value)?Math.round(value*1000)/1000:null;
 if (value===undefined || typeof value==='function' || depth>6) return undefined;
 if (value instanceof Set) return [...value];
 if (Array.isArray(value)) {const result=new Array(Math.min(value.length,240));for(let index=0;index<result.length;index++)if(index in value)result[index]=plain(value[index],depth+1);return result;}
 const result={};
 for (const key of Object.keys(value)) { if(omit.has(key))continue; const next=plain(value[key],depth+1); if(next!==undefined)result[key]=next; }
 return result;
}
const vector = value => {if(!value)return null;const result={x:Math.round(value.x*1000)/1000,y:Math.round(value.y*1000)/1000,z:Math.round(value.z*1000)/1000};if(value.w!==undefined)result.w=Math.round(value.w*10000)/10000;return result;};
function pick(value,fields,target={}){for(const key of fields)if(value[key]!==undefined)target[key]=plain(value[key]);return target;}
function movingState(items){const result=new Array(items.length);for(let index=0;index<items.length;index++){const item=items[index];result[index]=pick(item,movingFields,{id:item.id});}return result;}
function entityState(entity){
 const result={};
 // Body vectors replace the same properties below; avoid copying them twice.
 for(const key of Object.keys(entity)){
  if(omit.has(key))continue;
  if(key==='position'||key==='velocity'){result[key]=undefined;continue;}
  const next=key==='history'&&entity.history?plain(entity.history.slice(-2).map(vector),1):plain(entity[key],1);
  if(next!==undefined)result[key]=next;
 }
 result.position=vector(entity.body?.position||entity.position);result.velocity=vector(entity.body?.velocity||entity.velocity);
 return result;
}

export function serializeState(engine) {
 const goats=new Array(engine.goats.length),hazards=[],entities=new Array(engine.entities.length),snowmobiles=new Array(engine.snowmobiles.length);
 for(let index=0;index<goats.length;index++){
  const goat=engine.goats[index],entry=pick(goat,goatFields,{id:goat.id,characterId:goat.characterId}),body=goat.body;
  entry.position=vector(body?.position);entry.velocity=vector(body?.velocity);entry.quaternion=vector(body?.quaternion);entry.angularVelocity=vector(body?.angularVelocity);goats[index]=entry;
 }
 // Most hazards are static trees, rocks or buildings. Their descriptors are
 // already shared, so only allocate records for mutable hazards.
 for(let index=0;index<engine.hazards.length;index++){
  const hazard=engine.hazards[index];if(hazard.destroyed||hazard.kind==='bear'||hazard.kind==='hunter'||hazard.kind==='gunner')hazards.push(pick(hazard,hazardFields,{index}));
 }
 for(let index=0;index<entities.length;index++)entities[index]=entityState(engine.entities[index]);
 for(let index=0;index<snowmobiles.length;index++){const item=engine.snowmobiles[index];snowmobiles[index]={id:item.id,consumed:item.consumed};}
 return {
  phase:engine.phase,counter:engine.counter,elapsed:engine.elapsed,weatherIndex:engine.weatherIndex,physicsHz:engine.physicsHz||60,
  goats,hazards,wildlife:movingState(engine.wildlife),skiers:movingState(engine.skiers),snowmobiles,entities,
 };
}

function copyVector(target,value){if(!target||!value)return;if(target.set)value.w===undefined?target.set(value.x,value.y,value.z):target.set(value.x,value.y,value.z,value.w);else Object.assign(target,value);}
export function applyState(engine,state) {
 for(const key of ['phase','counter','elapsed','weatherIndex','physicsHz'])if(state[key]!==undefined)engine[key]=state[key];
 for(const entry of state.goats||[]){const goat=engine.goats.find(value=>value.id===entry.id);if(!goat)continue;Object.assign(goat,pick(entry,goatFields));
  for(const key of ['position','velocity','quaternion','angularVelocity'])copyVector(goat.body?.[key],entry[key]);
  if(goat.body){goat.body.aabbNeedsUpdate=true;goat.body.collisionFilterMask=goat.dead||goat.finishTime!==null?0:7;}
 }
 for(const entry of state.hazards||[]){const hazard=engine.hazards[entry.index];if(hazard)Object.assign(hazard,pick(entry,hazardFields));}
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
