import * as THREE from 'three';
import {bindTouchControls,suppressControlGestures} from './touch-controls.js';
import {createHazardAssets} from './hazard-assets.js';
import {createCharacterAssets} from './character-assets.js';
import {createShowAssets} from './show-assets.js';
import {createSceneEffects} from './scene-effects.js';
import {createGameAudio} from './game-audio.js';
import {createRideAssets} from './ride-assets.js';
import {createTerrainChunks,batchTrees,createFragmentPool} from './render-budget.js';
import {CHARACTERS as ALPINE_CHARACTERS,spawnPosition} from './racers.js';
import {getActiveWorld,resolveWorld} from './worlds.js';
import {WORLD_LOOKS,worldCharacters,weatherLook,victimNames} from './world-presentation.js';
import {createThemeCreatures} from './theme-creatures.js';
import {createThemeScenery} from './theme-scenery.js';
import {updateWheelPose} from './wheel-pose.js';
import {courseBoosts,createBoostVisual} from './boosts.js';
import {wildlifePosition} from './wildlife.js';
import {rampGrounding} from './ramp-grounding.js';
import {RaceEngine} from './physics.js';
import {foundationProfile} from './foundations.js';
import {createSceneryAssets} from './scenery-assets.js';
import {createWorldLayout,skiRouteX} from './world-layout.js';
import {LENGTH, CELL, MIN_X, MAX_X, MIN_S, MAX_S, center, height, terrainHeight, sampleGroundHeight} from './terrain.js';

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const WORLD=getActiveWorld(),LOOK=WORLD_LOOKS[WORLD.id],params=new URLSearchParams(globalThis.location?.search||'');
const CHARACTERS=worldCharacters(ALPINE_CHARACTERS,WORLD);
const rosterFor=id=>{const selected=CHARACTERS.find(c=>c.id===id)||CHARACTERS[0];return [selected,...CHARACTERS.filter(c=>c.id!==selected.id)];};
const themeCreatures=WORLD.id==='alps'?null:createThemeCreatures(THREE,WORLD.id);
const themeScenery=WORLD.id==='alps'?null:createThemeScenery(THREE,WORLD.id);
const layout=createWorldLayout();
const assets=createSceneryAssets(THREE);
const hazardAssets=createHazardAssets(THREE);
const characterAssets=createCharacterAssets(THREE);
const showAssets=createShowAssets(THREE);
const rideAssets=createRideAssets(THREE);
const gameAudio=createGameAudio();
const boosts=courseBoosts();
const ROAD = 12, RADIUS = 1.05;
let selectedCharacterId=CHARACTERS.find(c=>c.id===params.get('character'))?.id||CHARACTERS[0].id;
let selectedSpecies='goat';
let seed = 72;
const rnd = () => {seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296;};
const derivative = s => (center(s + .1) - center(s - .1)) / .2;
const worldPosition = (x,s,h=0) => new THREE.Vector3(center(s)+x,sampleGroundHeight(center(s)+x,s)+h,-s);
const canvas = $('world');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'}); }
catch(e) { $('error').classList.remove('hidden'); $('intro').classList.add('hidden'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LOOK.exposure;
const scene = new THREE.Scene();
scene.background = new THREE.Color(LOOK.sky);
scene.fog = new THREE.Fog(LOOK.sky,90,WORLD.id==='moon'?530:430);
const backdrop=themeScenery?.backdrop();if(backdrop){scene.add(backdrop);if(backdrop.userData.planet){backdrop.userData.planet.position.set(-330,-80,-1050);backdrop.userData.planet.scale.setScalar(.65);}}
const camera = new THREE.PerspectiveCamera(63,innerWidth/innerHeight,.1,1900);
const hemi = new THREE.HemisphereLight(LOOK.hemi,LOOK.groundLight,2.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(LOOK.sun,LOOK.sunIntensity);
sun.position.set(-60,300,70);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-40;sun.shadow.camera.near=.1;sun.shadow.camera.far=250;sun.shadow.bias=-.001;sun.shadow.normalBias=.1;
scene.add(sun);scene.add(sun.target);
const sceneEffects=createSceneEffects(THREE,scene);sceneEffects.blood.material.color.setHex(LOOK.blood);sceneEffects.stains.material.color.setHex(LOOK.stain);
const fragmentPool=createFragmentPool(THREE,scene,160);
const rageColor=new THREE.Color(0xec4434);
const mats = {};
function mat(c){return mats[c] ||= new THREE.MeshStandardMaterial({color:c,roughness:.86,flatShading:true});}
function mesh(geo,c,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,typeof c==='number'?mat(c):c);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const geo = {sphere:new THREE.IcosahedronGeometry(1,1),ball:new THREE.SphereGeometry(1,12,8),box:new THREE.BoxGeometry(1,1,1),cone:new THREE.ConeGeometry(1,1,7),cylinder:new THREE.CylinderGeometry(1,1,1,8)};
function sphere(parent,c,x,y,z,sx,sy=sx,sz=sx){const m=mesh(geo.sphere,c,parent,x,y,z);m.scale.set(sx,sy,sz);return m;}
function box(parent,c,x,y,z,sx,sy,sz){const m=mesh(geo.box,c,parent,x,y,z);m.scale.set(sx,sy,sz);return m;}
function tube(parent,points,r,c){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(new THREE.TubeGeometry(curve,12,r,6,false),c,parent);}
function tree(){if(themeScenery)return themeScenery.tree();const g=new THREE.Group();box(g,0x634a33,0,5.5,0,.65,11,.65);for(let i=0;i<3;i++){const m=mesh(geo.cone,[0x315b4f,0x386957,0x477964][i],g,0,10+i*4.1,0);m.scale.set(4.7-i*.95,11-i*.3,4.7-i*.95);}g.userData.collider={halfExtents:[.325,5.5,.325],offset:[0,5.5,0]};return g;}
function rock(){const g=new THREE.Group();const r=sphere(g,0x829294,0,.65,0,1.6,1.3,1.3);r.rotation.set(.2,.5,.4);sphere(g,0xa6ae9e,.4,1.3,-.1,.75,.25,.65);return g;}
function hay(){const g=new THREE.Group();const m=mesh(geo.cylinder,0xd6b270,g,0,.9,0);m.scale.set(1.2,1.8,1.2);m.rotation.z=Math.PI/2;box(g,0x967544,0,.93,0,.1,1.75,2.3);return g;}
const ramp=style=>hazardAssets.ramp(style),bear=()=>themeCreatures?.npc('bear')||hazardAssets.bear(),hunter=()=>themeCreatures?.npc('hunter')||hazardAssets.hunter();
function snowmobileFor(def={}){const g=rideAssets.snowmobile(def);if(themeCreatures){g.remove(g.userData.rider);const rider=themeCreatures.rider(def);g.add(rider);g.userData.rider=rider;g.userData.arms=[-1,1].map(side=>rider.getObjectByName('rider_arm_'+side));g.userData.legs=[-1,1].map(side=>rider.getObjectByName('rider_leg_'+side));g.userData.vehicle.traverse(m=>{if(m.isMesh&&m.material.name.includes('chassis'))m.material.color.setHex(WORLD.id==='hell'?0xad3d42:0x829ccf);});}return g;}
function characterVisual(def){
 const root=new THREE.Group(),model=themeCreatures?.character(def)||characterAssets.character(def);root.add(model.roll);
 const rig=themeCreatures?.trickRig(def)||showAssets.trickRig(def);root.add(rig);
 const ride=snowmobileFor(def);ride.position.y=-1.05;ride.visible=false;root.add(ride);
 const shield=mesh(new THREE.SphereGeometry(1.46,16,10),new THREE.MeshBasicMaterial({color:def.color,transparent:true,opacity:.18,wireframe:true}),root);shield.visible=false;
 const marker=new THREE.Group();root.add(marker);
 shield.userData.noShatter=true;return {root,roll:model.roll,shield,marker,tintMaterials:model.tintMaterials,rig,ride};
}
const characterModels=new Map(CHARACTERS.map(def=>{const visual=characterVisual(def);scene.add(visual.root);return [def.id,visual];}));

const terrainGeo=new THREE.BufferGeometry();const pos=[],vcolors=[],indices=[];
const rows=Math.round((MAX_S-MIN_S)/CELL),cols=Math.round((MAX_X-MIN_X)/CELL);
for(let i=0;i<=rows;i++){const s=MIN_S+i*CELL;for(let j=0;j<=cols;j++){const x=MIN_X+j*CELL;pos.push(x,terrainHeight(x,s),-s);const slope=(terrainHeight(x,s+1)-terrainHeight(x,s-1))/2;const exposed=slope>-.15||slope<-1.05;const c=new THREE.Color(exposed?(s<420?LOOK.upperRock:LOOK.rock):(s<420?LOOK.upper:s<1250?LOOK.middle:LOOK.lower));for(const route of layout.skiRoutes)if(s>=route.start&&s<=route.end&&Math.abs(x-center(s)-skiRouteX(route,s))<route.width/2)c.setHex(LOOK.route);for(const pit of layout.pits)if(Math.hypot(x-center(pit.s)-pit.x,s-pit.s)<pit.r*.92)c.setHex(0x3d3b35);const shade=.89+rnd()*.2;c.multiplyScalar(shade);vcolors.push(c.r,c.g,c.b);}}
for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j;indices.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);}
terrainGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(vcolors,3));terrainGeo.setIndex(indices);terrainGeo.computeVertexNormals();const terrain=createTerrainChunks(THREE,terrainGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}),{cols,rows,minS:MIN_S,cell:CELL});scene.add(terrain);terrainGeo.dispose();
const props=[],hazards=[];
function place(g,x,s,kind=null,r=1.5){
 g.position.copy(worldPosition(x,s,g.userData.groundLift||0));g.rotation.y+=-Math.atan(derivative(s));scene.add(g);const prop={g,s};props.push(prop);
 if(kind){const c=g.userData.collider,collider=c?{halfExtents:c.halfExtents.map((n,i)=>n*[g.scale.x,g.scale.y,g.scale.z][i]),offset:(c.offset||[0,c.offsetY,0]).map((n,i)=>n*[g.scale.x,g.scale.y,g.scale.z][i])}:null;const h={g,x,s,kind,r,collider,groundLift:g.userData.groundLift||0,yaw:g.rotation.y,hit:new Set(),baseX:x,profile:g.userData.profile,width:g.userData.width,grounding:g.userData.grounding};hazards.push(h);prop.hazard=h;}return g;
}
for(const t of layout.trees){const g=tree();g.scale.setScalar(t.scale);if(!themeScenery&&t.s<360)g.traverse(m=>{if(m.isMesh&&m.material.color.getHex()!==0x634a33&&rnd()>.5)m.material=mat(0xa7c4b6);});place(g,t.x,t.s,'tree',.55*t.scale);}
const treeBatch=batchTrees(THREE,props.filter(p=>p.hazard?.kind==='tree').map(p=>p.g));scene.add(treeBatch);for(const p of props)if(p.hazard?.kind==='tree')scene.remove(p.g);
for(let i=0;i<40;i++){const s=rnd()*2350;const g=rock();g.scale.setScalar(1+rnd()*3);let x=(rnd()<.5?-1:1)*(23+rnd()*90);if(s>LENGTH-70&&s<LENGTH+85&&Math.abs(x)<60)x=(x<0?-1:1)*(67+i%5*3);place(g,x,s);}
for(const [houseIndex,h] of layout.houses.entries()){
 const g=themeScenery?.house(h.style)||assets.house(h.style);g.scale.setScalar(h.scale);g.rotation.y=h.yaw;
 const profile=foundationProfile(g.userData.collider,h.scale,h.x,h.s,h.yaw-Math.atan(derivative(h.s)));
 const positions=[],indices=[];
 for(const point of profile.points){positions.push(...point,point[0],0,point[2]);}
 for(let i=0;i<profile.points.length;i++){const a=i*2,b=((i+1)%profile.points.length)*2;indices.push(a,b,a+1,b,b+1,a+1);}
 const {minX,maxX,minZ,maxZ}=profile.bounds,base=positions.length/3;positions.push(minX,0,minZ,maxX,0,minZ,maxX,0,maxZ,minX,0,maxZ);indices.push(base,base+2,base+1,base,base+3,base+2);
 const foundation=new THREE.BufferGeometry();foundation.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));foundation.setIndex(indices);foundation.computeVertexNormals();mesh(foundation,new THREE.MeshStandardMaterial({color:0x8e9690,roughness:1,flatShading:true,side:THREE.DoubleSide}),g);
 g.userData.collider=profile.collider;g.userData.groundLift=profile.lift;
 place(g,h.x,h.s,'house',g.userData.collider.halfExtents[0]*h.scale);
 if(houseIndex%7===3){const gun=themeCreatures?.npc('gunner',houseIndex%5)||rideAssets.gunnerWindow();gun.position.set(0,.6,g.userData.collider.halfExtents[2]+.2);gun.scale.setScalar(.8);g.add(gun);g.updateMatrixWorld(true);const from=gun.userData.flash.getWorldPosition(new THREE.Vector3());hazards.push({kind:'gunner',id:'gunner-'+houseIndex,x:h.x,s:h.s,r:.7,sourceName:WORLD.hazardNames.gunner,houseYaw:g.rotation.y,fireFrom:{x:from.x,y:from.y,z:from.z},g:gun,hit:new Set(),baseX:h.x});}
}
for(const h of layout.obstacles){const g=({ramp,hay,bear,rock})[h.kind](h.style);if(h.kind==='ramp'){const grounding=rampGrounding(g.userData.profile,g.userData.width,h.x,h.s,-Math.atan(derivative(h.s)));g.userData.groundLift=grounding.lift;g.userData.grounding=grounding;for(const [positions,indices,color] of [[grounding.apronPositions,grounding.apronIndices,0xc78b50],[grounding.positions,grounding.collisionIndices||grounding.indices,0x806044]]){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}),g);}}place(g,h.x,h.s,h.kind,h.r);}
for(const zone of boosts){const g=createBoostVisual(THREE,zone);scene.add(g);props.push({g,s:zone.s});}
for(const h of hazards.filter(h=>h.kind==='ramp')){const g=createBoostVisual(THREE,h,h);scene.add(g);props.push({g,s:h.s});}
for(const pit of layout.pits){const g=hazardAssets.spikePit(pit.r*.65);place(g,pit.x,pit.s);for(const spike of g.userData.spikes){const {x,z}=spike.userData.basePosition;g.updateMatrixWorld(true);const v=new THREE.Vector3(x,0,z).applyMatrix4(g.matrixWorld);spike.position.y=sampleGroundHeight(v.x,-v.z)-g.position.y+spike.userData.height/2;}g.userData.floor.visible=false;}

for(const [i,h] of layout.hunters.entries()){place(themeCreatures?.npc('hunter',i%5)||hunter(),h.x,h.s,'hunter',.7);hazards.at(-1).sourceName=WORLD.hazardNames.hunter;}
const lavaVisuals=layout.lava.map(flow=>{const g=themeScenery.lavaFlow(flow,sampleGroundHeight,center,{halfWidth:flow.halfWidth,length:flow.length});scene.add(g);props.push({g,s:flow.s});return g;});
const snowmobiles=layout.snowmobiles;for(const pickup of snowmobiles){const g=snowmobileFor();g.userData.rider.visible=false;g.position.copy(worldPosition(pickup.x,pickup.s));g.rotation.y=-Math.atan(derivative(pickup.s));scene.add(g);pickup.visual=g;}
const mountains=[];
for(let i=0;i<7;i++)for(const side of [-1,1]){const s=90+i*365;const g=themeScenery?.mountain(i*31+side+100)||assets.mountain(i*31+side+100);g.position.set(side*(335+(i%3)*25),height(s)-48,-s-95);g.rotation.y=i*.54;g.traverse(m=>{if(m.isMesh){m.material.fog=false;m.castShadow=false;}});scene.add(g);mountains.push({g,s});}

// The snow is painted on the actual ground mesh; narrow grooves follow its triangles.
function skiGroove(route,lane){const positions=[],indexes=[];for(let s=route.start;s<=route.end;s+=1.5){const x=center(s)+skiRouteX(route,s)+lane;const i=positions.length/3;for(const edge of [-.10,.10])positions.push(x+edge,sampleGroundHeight(x+edge,s)+.17,-s);if(i)indexes.push(i-2,i-1,i,i-1,i+1,i);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indexes);geometry.computeVertexNormals();const g=mesh(geometry,new THREE.MeshStandardMaterial({color:WORLD.id==='alps'?0xaabfc7:LOOK.route,roughness:1,side:THREE.DoubleSide}),scene);g.castShadow=false;return g;}
const skiers=[];
for(const [routeIndex,route] of layout.skiRoutes.entries()){
 for(const lane of [-.24,.24])skiGroove(route,lane);
 for(let s=route.start+18;s<route.end;s+=58){const g=new THREE.Group();for(const side of [-1,1]){const pole=box(g,0x6a7c81,side*(route.width*.5+.3),1.3,0,.10,2.6,.10);const flag=box(g,route.color,side*(route.width*.5+.3)-side*.45,2.25,0,.85,.45,.05);}place(g,skiRouteX(route,s),s);}
 for(let i=0;i<4;i++){const g=themeCreatures?.npc('skier',i)||assets.skier();scene.add(g);skiers.push({id:routeIndex*4+i,kind:'skier',visual:g,g,route,phase:((i+.2+routeIndex*.13)/4)%1,speed:13+i*1.3,radius:.8,centerHeight:1,points:250,consumed:false});}
}
const wildlife=layout.wildlife;
for(const animal of wildlife){animal.visual=themeCreatures?.npc(animal.kind,animal.id%5)||assets.animal(animal.kind);scene.add(animal.visual);}
function gate(s,text,color,width=22){
 const g=new THREE.Group(),base=sampleGroundHeight(center(s),s),yaw=-Math.atan(derivative(s));let top=base+5.6;
 for(let x=-width/2;x<=width/2;x+=3){const wx=center(s)+Math.cos(yaw)*x,ss=s+Math.sin(yaw)*x;top=Math.max(top,sampleGroundHeight(wx,ss)+5.6);}
 g.userData.groundLift=top-base-5.6;
 for(const x of [-width/2,width/2]){const wx=center(s)+Math.cos(yaw)*x,ss=s+Math.sin(yaw)*x,bottom=sampleGroundHeight(wx,ss)-top+5.6;box(g,0x5b6759,x,(bottom+5.6)/2,0,.45,5.6-bottom,.45);}
 box(g,color,0,5.6,0,width+.3,1.2,.25);
 const c=document.createElement('canvas');c.width=512;c.height=64;const cx=c.getContext('2d');cx.fillStyle='#182a28';cx.font='bold 39px sans-serif';cx.textAlign='center';cx.fillText(text,256,47);const tex=new THREE.CanvasTexture(c);const label=mesh(new THREE.PlaneGeometry(Math.min(width*.68,24),1.8),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide}),g,0,5.8,.16);label.castShadow=false;place(g,0,s);
}
gate(8,'СТАРТ',0xd6fc64);gate(LENGTH,'ФИНИШ',0xd6fc64,70);
for(let i=0;i<70;i++){const g=new THREE.Group();box(g,i%2?0x182a28:0xf2eee1,0,.06,0,1, .10,2.1);place(g,-34.5+i,LENGTH);}
const grandstands=[];
for(const side of [-1,1]){const g=themeCreatures?.stands()||showAssets.stands(),s=LENGTH+32,x=side*27,yaw=-Math.atan(derivative(s));let base=-Infinity,minBase=Infinity;
 for(let dx=-14;dx<=14;dx+=2)for(let dz=-4.3;dz<=4.3;dz+=2){const wx=center(s)+x+Math.cos(yaw)*dx+Math.sin(yaw)*dz,ss=s+Math.sin(yaw)*dx-Math.cos(yaw)*dz;const ground=sampleGroundHeight(wx,ss);base=Math.max(base,ground);minBase=Math.min(minBase,ground);}
 g.position.set(center(s)+x,base+.15,-s);g.rotation.y=yaw;
 // A stone foundation fills the gap under the level spectator platform.
 const floor=sampleGroundHeight(center(s)+x,s),depth=Math.max(1,base-minBase+1);box(g,0x818d90,0,-depth/2,0,28,depth,8.5);scene.add(g);grandstands.push(g);
}
const goats=rosterFor(selectedCharacterId).map((def,i)=>{const spawn=spawnPosition(i);return {id:i,characterId:def.id,character:def,name:i===0?'Ты · '+def.name:def.name,color:def.color,visual:characterModels.get(def.id),...spawn,speed:0,vx:0,jump:0,vy:0,spin:0,dead:0,invulnerable:0,spring:0,slow:0,finishTime:null,cd:{jump:0,bomb:0,spring:0,trap:0},ai:{target:spawn.x,timer:0}};});

let last=performance.now(),accumulator=0,attract=0,toastTimer=0,eventTimer=0,shake=0,uiTimer=0;
const keys=new Set();let touchSteer=0,touchDrive=0;
const dynamic=new Map(),effects=[],scorePopups=[],specialEffects=[],bulletTrails=new Map();
let flash=0,baseSunIntensity=LOOK.sunIntensity;
const flashLight=new THREE.PointLight(0xffad46,0,35);scene.add(flashLight);
let soundOn=false,soundPreference=params.get('sound')!=='off';
function syncSoundIcon(){$('sound').textContent=soundPreference?'♫':'♪';$('sound').setAttribute('aria-label',soundPreference?'Выключить звук':'Включить звук');$('sound').title=soundPreference?'Выключить звук':'Включить звук';}
function setSound(value){soundPreference=Boolean(value);soundOn=gameAudio.enable(value);syncSoundIcon();}
syncSoundIcon();
const unlockMusic=()=>{if(soundPreference)setSound(true);};addEventListener('pointerdown',unlockMusic,{capture:true});addEventListener('keydown',unlockMusic,{capture:true});
function animalVoice(g,position){const distance=new THREE.Vector3(position.x,position.y,position.z).distanceTo(goats[0].visual.root.position);if(distance<=65)gameAudio.animal(g.character,.11/(1+distance*.045));}
function tone(freq=350){gameAudio.cue(freq<150?'death':freq>600?'boost':'jump');}
$('sound').onclick=()=>{soundPreference=!soundPreference;setSound(soundPreference);if(soundOn)tone(530,.14);};
function toast(message,seconds=2.4){$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=seconds;}
function burst(position,color=0xffba64,count=22){if(position.distanceTo(goats[0].visual.root.position)>200)return;for(let i=0;i<Math.min(16,count);i++){const size=.1+rnd()*.28;fragmentPool.spawn(position,new THREE.Vector3((rnd()-.5)*12,2+rnd()*9,(rnd()-.5)*12),new THREE.Vector3(size,size,size),i%3===0?0xfff0c9:color,.55+rnd()*.6);}}
function shatterVisual(g,position,offset=0){
 if(!g)return;g.position.set(position.x,position.y-offset,position.z);g.updateMatrixWorld(true);g.visible=false;
 if(new THREE.Vector3(position.x,position.y,position.z).distanceTo(goats[0].visual.root.position)>150)return;
 sceneEffects.bloodBurst(position,offset>1?1.6:1);
 let pieces=0;g.traverse(part=>{if(!part.isMesh||part.userData.noShatter||!part.visible||pieces>=9)return;pieces++;const color=part.material?.color?.getHex?.()??0xaf6043;fragmentPool.spawn(new THREE.Vector3(position.x,position.y,position.z),new THREE.Vector3((rnd()-.5)*19,5+rnd()*10,(rnd()-.5)*19),new THREE.Vector3(.23+rnd()*.35,.24+rnd()*.42,.23+rnd()*.35),color,1.3,new THREE.Vector3(rnd()*10,rnd()*10,rnd()*10));});
 for(let i=0;i<8;i++)fragmentPool.spawn(new THREE.Vector3(position.x,position.y,position.z),new THREE.Vector3((rnd()-.5)*17,5+rnd()*9,(rnd()-.5)*17),new THREE.Vector3(.2+rnd()*.25,.18+rnd()*.4,.2+rnd()*.25),LOOK.blood,1.4,new THREE.Vector3(rnd()*10,rnd()*10,rnd()*10));
}
function shatterAnimal(animal,position){shatterVisual(animal.visual,position,animal.centerHeight);}
function animatedExplosion(data){
 gameAudio.explosion(data.position,data.kind==='bomblet'?.65:1);
 const p=new THREE.Vector3(data.position.x,data.position.y,data.position.z);if(p.distanceTo(goats[0].visual.root.position)>220)return;const g=hazardAssets.explosion();g.position.copy(p);g.scale.setScalar(.05);
 g.traverse(m=>{if(m.isMesh){m.castShadow=false;m.material=m.material.clone();m.material.transparent=true;m.material.depthWrite=false;}});
 scene.add(g);specialEffects.push({g,kind:'blast',age:0,life:.85,radius:data.radius,disposeMaterials:true});
 const shock=new THREE.Mesh(new THREE.TorusGeometry(1,.045,5,36),new THREE.MeshBasicMaterial({color:0xffd76d,transparent:true,opacity:.9,depthWrite:false}));shock.rotation.x=Math.PI/2;shock.position.copy(p);shock.position.y+=.15;scene.add(shock);specialEffects.push({g:shock,kind:'shock',age:0,life:.6,radius:data.radius,disposeMaterials:true,disposeGeometry:true});
 burst(p,0xff8b4b,22);flashLight.position.copy(p);flashLight.intensity=18;if(p.distanceTo(goats[0].visual.root.position)<28){shake=.75;tone(55,.45,'sawtooth',.07);}
}
function showLightning(data){
 const p=data.position,points=[];for(let i=0;i<10;i++){const t=i/9;points.push({x:p.x+(1-t)*(rnd()-.5)*9,y:p.y+70*(1-t),z:p.z+(1-t)*(rnd()-.5)*7});}
 const g=hazardAssets.lightning(points);g.traverse(m=>{if(m.isMesh){m.material=m.material.clone();m.material.transparent=true;}});scene.add(g);specialEffects.push({g,kind:'bolt',age:0,life:.42,disposeMaterials:true});
 flash=.65;flashLight.position.set(p.x,p.y+5,p.z);flashLight.intensity=35;burst(new THREE.Vector3(p.x,p.y+.2,p.z),0xdaf6ff,18);tone(45,.7,'sawtooth',.10);
}
function releaseSpecial(fx){scene.remove(fx.g);fx.g.traverse(m=>{if(m.isInstancedMesh)m.dispose();});if(fx.disposeMaterials)fx.g.traverse(m=>{if(m.isMesh)m.material.dispose();});if(fx.disposeGeometry)fx.g.geometry.dispose();}
const killNames=victimNames(WORLD);
function scorePopup(points,position){const el=document.createElement('div');el.className='score-popup';el.textContent='+'+points;document.getElementById('game').appendChild(el);scorePopups.push({el,position:new THREE.Vector3(position.x,position.y+1.8,position.z),life:1.4});}
function nameLabel(name,color){const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.fillStyle='#182a28';ctx.fillRect(34,6,188,47);ctx.fillStyle='#'+color.toString(16).padStart(6,'0');ctx.fillText(name,128,40);const m=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));m.scale.set(2.5,.62,1);m.position.set(0,2.45,0);return m;}
goats.forEach((g,i)=>{g.label=nameLabel(i===0?'ТЫ':g.name,g.color);g.visual.root.add(g.label);const dot=document.createElement('span');dot.className='progress-dot';dot.style.background='#'+g.color.toString(16);$('progress-line').appendChild(dot);g.dot=dot;});
const ring=mesh(new THREE.TorusGeometry(1.45,.055,6,30),new THREE.MeshBasicMaterial({color:0xd6fc64}),scene);ring.rotation.x=Math.PI/2;
const aimLines=[];
hazards.filter(h=>['hunter','gunner'].includes(h.kind)).forEach(h=>{const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xff604b,transparent:true,opacity:.7}));scene.add(line);aimLines.push({h,line});});
const precipCount=1800,precipPositions=new Float32Array(precipCount*3);
for(let i=0;i<precipCount;i++){precipPositions[i*3]=(rnd()-.5)*70;precipPositions[i*3+1]=rnd()*40;precipPositions[i*3+2]=(rnd()-.5)*70;}
const precipGeo=new THREE.BufferGeometry();precipGeo.setAttribute('position',new THREE.BufferAttribute(precipPositions,3));const precipitation=new THREE.Points(precipGeo,new THREE.PointsMaterial({color:0xe7f5ff,size:.14,transparent:true,opacity:.8,depthWrite:false}));scene.add(precipitation);precipitation.visible=false;
const rainPositions=new Float32Array(precipCount*6),rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3).setUsage(THREE.DynamicDrawUsage));const rainLines=new THREE.LineSegments(rainGeometry,new THREE.LineBasicMaterial({color:0xc2ecff,transparent:true,opacity:.44,depthWrite:false}));rainLines.frustumCulled=false;rainLines.visible=false;scene.add(rainLines);
function entityVisual(e){
 let g=new THREE.Group();
 if(e.kind==='bomber')g=hazardAssets.bomber();
 else if(e.kind==='yeti')g=themeCreatures?.npc('yeti',e.id%5)||showAssets.yeti();
 else if(['bomb','canister','bomblet'].includes(e.kind)){sphere(g,e.kind==='bomb'?0x29362f:0xb94735,0,0,0,e.kind==='bomblet'?.26:.46,e.kind==='canister'?.85:.46);box(g,0xc7a369,0,.44,0,.1,.2,.1);sphere(g,0xffb44d,0,.60,0,.13);}
 else if(e.kind==='trap'){g=showAssets.trap();g.scale.setScalar(1.4);}
 else if(e.kind==='strike'){const points=[];for(let i=0;i<=48;i++){const angle=i/48*Math.PI*2,x=Math.cos(angle)*e.radius,z=Math.sin(angle)*e.radius;points.push(new THREE.Vector3(x,sampleGroundHeight(e.position.x+x,-e.position.z-z)-e.position.y+.22,z));}mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),72,.13,5,false),new THREE.MeshBasicMaterial({color:0x7eeaff,transparent:true,opacity:.9,toneMapped:false}),g);const mark=mesh(geo.cone,new THREE.MeshBasicMaterial({color:0xe2faff}),g,0,3,0);mark.scale.set(.3,.8,.3);mark.rotation.z=Math.PI;}
 else if(e.kind==='bullet'){const m=new THREE.MeshBasicMaterial({color:0xffee88,toneMapped:false});sphere(g,m,0,0,0,.24);box(g,m,0,0,.5,.16,.16,1.8);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(220*3),3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xffbc66,transparent:true,opacity:.78,depthWrite:false,toneMapped:false}));line.frustumCulled=false;scene.add(line);bulletTrails.set(e.id,{line,e,age:0,released:false});}
 if(!['bomber','yeti','trap'].includes(e.kind)){const knownG=new Set(Object.values(geo)),knownM=new Set(Object.values(mats)),ownG=new Set(),ownM=new Set();g.traverse(m=>{if(m.isMesh){if(!knownG.has(m.geometry))ownG.add(m.geometry);if(!knownM.has(m.material))ownM.add(m.material);}});g.userData.ownG=[...ownG];g.userData.ownM=[...ownM];}scene.add(g);dynamic.set(e.id,g);
}
function removeEntity(g){scene.remove(g);for(const geometry of g.userData.ownG||[])geometry.dispose();for(const material of g.userData.ownM||[])material.dispose();}
function finish(){
 const ranking=engine.ranking(),player=goats[0],place=ranking.findIndex(g=>g.id===0)+1,stats=player.stats;
 $('finish-title').textContent=place===1?'Первый внизу!':place===2?'Почти догнал!':'Спуск пережили!';$('finish-subtitle').textContent=`${place}-е место · ${formatTime(player.finishTime??engine.elapsed)} · 1 166 м по вертикали`;
 $('finish-bonus').textContent=`${player.score.toLocaleString('ru-RU')} очков · ${player.kills} убийств`;
 $('finish-stats').innerHTML=`<div class="finish-totals"><div><b>${stats.bombs}</b><span>Бомб сброшено</span></div><div><b>${stats.traps}</b><span>Капканов сброшено</span></div><div><b>${stats.deaths}</b><span>Смертей</span></div><div><b>${stats.snowmobiles}</b><span>${WORLD.id==='alps'?'Снегоходов':'Скутеров'}</span></div></div><div class="kill-breakdown">${Object.entries(killNames).filter(([kind])=>stats.kills[kind]>0).map(([kind,name])=>`<span>${name}<b>${stats.kills[kind]}</b></span>`).join('')||'<span>Никого не убил. Пока.</span>'}</div><details><summary>Причины смертей</summary>${Object.entries(stats.deathReasons).map(([reason,count])=>`<p>${reason} <b>×${count}</b></p>`).join('')||'<p>Без смертей!</p>'}</details>`;
 $('finish-results').innerHTML=ranking.map((g,i)=>`<li class="${g.id===0?'you':''}"><span>${i+1}. ${g.name}</span><small>${g.finishTime!==null?formatTime(g.finishTime):Math.round(LENGTH-g.s)+' м до низа'} · ${g.kills} убийств · ${g.score} оч.</small></li>`).join('');$('finish').classList.remove('hidden');$('pause').classList.add('hidden');
}
function event(type,data){
 if(type==='reset'){sceneEffects.reset();fragmentPool.reset();gameAudio.reset();$('finish-banner').classList.add('hidden');for(const g of dynamic.values())removeEntity(g);dynamic.clear();for(const fx of effects)scene.remove(fx.m);effects.length=0;for(const popup of scorePopups)popup.el.remove();scorePopups.length=0;for(const fx of specialEffects)releaseSpecial(fx);specialEffects.length=0;for(const trail of bulletTrails.values()){scene.remove(trail.line);trail.line.geometry.dispose();trail.line.material.dispose();}bulletTrails.clear();for(const g of goats){g.visual.roll.visible=true;g.visual.rig.visible=false;g.visual.ride.visible=false;}flash=0;flashLight.intensity=0;toastTimer=0;eventTimer=0;$('toast').classList.remove('visible');$('event-message').textContent='';}
 else if(type==='weather'){const w=data,appearance=weatherLook(WORLD,w);$('weather-name').textContent=w.name;$('weather-effect').textContent=w.effect;$('weather-icon').textContent=w.icon;scene.background.setHex(appearance.color);scene.fog.color.copy(scene.background);scene.fog.far=appearance.fogFar;baseSunIntensity=appearance.sun;sun.intensity=baseSunIntensity;precipitation.visible=appearance.particles;rainLines.visible=appearance.streaks;rainLines.material.color.setHex(appearance.rain);precipitation.material.color.setHex(appearance.particle);precipGeo.setDrawRange(0,700);}
 else if(type==='spawn')entityVisual(data);
 else if(type==='remove'){const g=dynamic.get(data.id);if(g)removeEntity(g);dynamic.delete(data.id);const trail=bulletTrails.get(data.id);if(trail){trail.released=true;trail.age=0;}}
 else if(type==='death'){shatterVisual(data.goat.visual.root,data.position,0);if(data.goat.id===0){shake=.4;toast(data.reason,2.4);$('event-message').textContent=data.reason;eventTimer=2.4;gameAudio.cue('death');}}
 else if(type==='explosion')animatedExplosion(data);
 else if(type==='lightning'){showLightning(data);gameAudio.cue('lightning');}
 else if(type==='clusterSplit'){gameAudio.cluster(data.position);animatedExplosion(data);}
 else if(type==='shot'){gameAudio.shot(data.bullet.position,data.hunter.kind==='gunner'?3:1);burst(new THREE.Vector3(data.bullet.position.x,data.bullet.position.y,data.bullet.position.z),0xffe58c,3);}
 else if(type==='wildlifeHit'||type==='skierHit')shatterAnimal(data.animal,data.position);
 else if(type==='landing')animalVoice(data.goat,data.position);
 else if(type==='yetiKill'){const g=dynamic.get(data.entity.id);if(g)shatterVisual(g,data.position,2.2);}
 else if(type==='trapSnap'){sceneEffects.bloodBurst(data.position,.65);gameAudio.cue('trap');}
 else if(type==='finishCrossed'){sceneEffects.party.start();gameAudio.finish();$('finish-banner-title').textContent=data.place===1?'ПОБЕДА!':'ФИНИШ!';$('finish-banner-caption').textContent=data.place+'-е место · '+goats[0].character.name;$('finish-banner').classList.remove('hidden');$('hud').classList.add('hidden');}
 else if(type==='hazardKill')shatterVisual(data.hazard.g,data.position,1);
 else if(type==='score'){if(data.goat.id===0){scorePopup(data.points,data.position);gameAudio.cue('score');}}
 else if(type==='finish'){sceneEffects.party.active=false;$('finish-banner').classList.add('hidden');finish();}
 else if(type==='go')gameAudio.cue('go');
 else if(type==='jump'||type==='ramp'||type==='spring'||type==='bomb'||type==='trap'){if(data.id===0)gameAudio.cue(type==='ramp'?'jump':type);}
 else if(type==='ride'){data.pickup.visual.visible=false;if(data.goat.id===0)gameAudio.cue('boost');}
 else if(type==='boost'){if(data.goat.id===0)gameAudio.cue('boost');}
 else if(type==='obstacle'){if(data.goat.id===0){shake=.12;gameAudio.cue('bounce');}}
 else if(type==='bounce'){if(data.id===0){gameAudio.cue('bounce');burst(data.visual.root.position,0xd6fc64,6);}}
}
const engine=new RaceEngine(goats,hazards,event,{wildlife,skiers,boosts,snowmobiles});
const characterThumbnails=new Map();
function makeCharacterThumbnails(){
 const previewScene=new THREE.Scene();previewScene.background=new THREE.Color(0x233d37);
 previewScene.add(new THREE.HemisphereLight(0xffffff,0x667751,2.5));
 const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(4,6,3);previewScene.add(light);
 const previewCamera=new THREE.PerspectiveCamera(38,1.1,.1,30);previewCamera.position.set(3.6,1.8,-2.6);previewCamera.lookAt(0,.15,0);
 const ratio=renderer.getPixelRatio(),shadows=renderer.shadowMap.enabled;renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;renderer.setSize(110,100,false);
 for(const def of CHARACTERS){const model=characterModels.get(def.id).roll.clone(true);previewScene.add(model);renderer.render(previewScene,previewCamera);characterThumbnails.set(def.id,canvas.toDataURL('image/png'));previewScene.remove(model);}
 renderer.setPixelRatio(ratio);renderer.shadowMap.enabled=shadows;renderer.setSize(innerWidth,innerHeight);
}
function selectCharacter(id){
 const roster=rosterFor(id);selectedCharacterId=roster[0].id;selectedSpecies=roster[0].species;
 for(const g of goats){g.visual.root.remove(g.label);g.label.material.map.dispose();g.label.material.dispose();}
 roster.forEach((def,i)=>{const g=goats[i];Object.assign(g,{characterId:def.id,character:def,name:i===0?'Ты · '+def.name:def.name,color:def.color,visual:characterModels.get(def.id),...spawnPosition(i)});g.label=nameLabel(i===0?'ТЫ':g.name,g.color);g.visual.root.add(g.label);g.dot.style.background='#'+g.color.toString(16).padStart(6,'0');engine.resetBody(g);});
 $('selected-character').textContent=roster[0].name+' · '+roster[0].speciesName;renderCharacterPicker();
}
function renderCharacterPicker(){
 $('character-options').replaceChildren();
 for(const def of CHARACTERS.filter(c=>c.species===selectedSpecies)){
  const button=document.createElement('button');button.type='button';button.className='character-option'+(def.id===selectedCharacterId?' selected':'');button.dataset.characterId=def.id;button.setAttribute('aria-pressed',String(def.id===selectedCharacterId));button.setAttribute('aria-label',def.name+', '+def.speciesName);
  const picture=document.createElement('img');picture.src=characterThumbnails.get(def.id);picture.alt='';picture.width=110;picture.height=100;
  const title=document.createElement('b');title.textContent=def.name;button.append(picture,title);button.onclick=()=>{selectCharacter(def.id);if(soundPreference!==false)setSound(true);gameAudio.preview(def);};$('character-options').appendChild(button);
 }
 for(const button of $('species-tabs').children)button.setAttribute('aria-selected',String(button.dataset.species===selectedSpecies));
}
for(const button of $('species-tabs').children)button.onclick=()=>{selectedSpecies=button.dataset.species;renderCharacterPicker();};
for(const button of $('species-tabs').children)button.textContent=LOOK.families[button.dataset.species];
$('selected-mountain').textContent=WORLD.title;
for(const button of $('mountain-options').children){button.setAttribute('aria-pressed',String(button.dataset.mountain===WORLD.id));button.classList.toggle('selected',button.dataset.mountain===WORLD.id);button.onclick=()=>selectMountain(button.dataset.mountain);}
$('intro-description').textContent=WORLD.id==='alps'?'Свернись в клубок и рухни с вершины. Обгони 19 соперников на диком склоне.':WORLD.id==='hell'?'Свернись в колесо, обгони 19 демонов и проскочи мимо потоков лавы.':'Свернись в колесо, обгони 19 пришельцев и летай дольше при слабой гравитации.';
$('intro-journey').textContent=LOOK.journey;
function selectMountain(id){const world=resolveWorld(id);if(engine.phase!=='intro'||world.id===WORLD.id)return false;const url=new URL(location.href);url.searchParams.set('mountain',world.id);url.searchParams.set('character',selectedCharacterId);url.searchParams.set('sound',soundPreference?'on':'off');location.assign(url.href);return true;}
makeCharacterThumbnails();selectCharacter(selectedCharacterId);
function formatTime(t){return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}
function start(){if(soundPreference!==false)setSound(true);resetInput();accumulator=0;engine.start();$('intro').classList.add('hidden');$('intro-footer').classList.add('hidden');$('hud').classList.remove('hidden');$('finish').classList.add('hidden');$('pause-panel').classList.add('hidden');$('pause').classList.remove('hidden');$('countdown').classList.remove('hidden');camera.position.copy(worldPosition(goats[0].x,-12,9));tone(330,.1);}
function pause(value){if(engine.pause(value)){$('pause-panel').classList.toggle('hidden',!value);resetInput();accumulator=0;}}
$('start').onclick=start;$('restart').onclick=start;$('restart-pause').onclick=start;$('resume').onclick=()=>pause(false);$('pause').onclick=()=>pause(true);
function returnToMenu(){engine.start();engine.phase='intro';resetInput();accumulator=0;$('hud').classList.add('hidden');$('finish').classList.add('hidden');$('pause-panel').classList.add('hidden');$('countdown').classList.add('hidden');$('intro').classList.remove('hidden');$('intro-footer').classList.remove('hidden');$('pause').classList.add('hidden');}
$('choose-character').onclick=returnToMenu;$('choose-character-finish').onclick=returnToMenu;
for(const kind of ['jump','bomb','spring','trap'])$(kind).onclick=()=>engine.ability(goats[0],kind);$('recover').onclick=()=>engine.ability(goats[0],'recover');
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault();if(e.code==='Escape'&&!e.repeat){pause(engine.phase!=='paused');return;}if(!e.repeat){const action={Space:'jump',KeyE:'bomb',ShiftLeft:'spring',ShiftRight:'spring',KeyQ:'trap',KeyR:'recover'}[e.code];if(action)engine.ability(goats[0],action);}keys.add(e.code);});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{resetInput();if(['racing','countdown','celebrating'].includes(engine.phase))pause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();pause(true);}});
const driveButton=$('drive');
const touchControls=bindTouchControls([{button:$('left'),steering:-1},{button:$('right'),steering:1},{button:driveButton,drive:1}],state=>{touchSteer=state.steering;touchDrive=state.drive;});
suppressControlGestures(['jump','bomb','spring','trap','recover'].map($));
function resetInput(){keys.clear();touchControls.reset();}
let countdownText='';
const compactScore=new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1});
function updateUI(){const p=goats[0],mobile=innerWidth<=600||globalThis.matchMedia?.('(pointer:coarse)').matches;const rank=engine.ranking();$('bonus-score').textContent=mobile?compactScore.format(p.score):p.score.toLocaleString('ru-RU');$('wildlife-count').textContent=p.kills;$('rage-fill').style.width=p.rage*100+'%';$('rage-value').textContent=mobile?'+'+Math.round(p.rage*18)+'% к скорости':Math.round(p.rage*100)+'% · +'+Math.round(p.rage*18)+'% к движению';$('recover').disabled=engine.phase!=='racing'||p.dead>0;$('player-status').textContent=p.rideTime>0?(mobile?'×3 · ':LOOK.vehicle+' ×3 · ')+p.rideTime.toFixed(1)+' с':p.invulnerable>0&&engine.phase==='racing'?'ЩИТ '+p.invulnerable.toFixed(1)+' с'+(mobile?'':' · от любых опасностей'):p.boostTime>0?'УСКОРЕНИЕ':'';driveButton.classList.toggle('pressed',touchDrive>0||keys.has('KeyW')||keys.has('ArrowUp'));$('rank').textContent=rank.findIndex(g=>g.id===0)+1;$('speed').textContent=Math.round(p.speed*3.6);$('time').textContent=formatTime(engine.elapsed);$('distance').textContent=Math.max(0,Math.round(LENGTH-p.s)).toLocaleString('ru-RU')+' м до низа';$('progress-fill').style.width=clamp(p.s/LENGTH*100,0,100)+'%';for(const g of goats)g.dot.style.left=clamp(g.s/LENGTH*100,0,100)+'%';const visibleRanks=rank.map((g,i)=>({g,i})).filter(({g,i})=>i<5||g.id===0);const leaderboard=visibleRanks.map(({g,i})=>`<li class="${g.id===0?'you':''}"><span class="racer-number">${i+1}</span><span class="racer-dot" style="background:#${g.color.toString(16)}"></span><span>${g.name}</span>${g.finishTime!==null?' ✓':''}</li>`).join('');if($('racers').innerHTML!==leaderboard)$('racers').innerHTML=leaderboard;
 for(const k of ['jump','bomb','spring','trap']){const cd=p.cd[k];$(k).disabled=engine.phase!=='racing'||p.dead>0||cd>0;$(k+'-cd').textContent=k==='spring'&&p.spring>0?p.spring.toFixed(1)+' СЕК':cd>0?cd.toFixed(1)+' СЕК':k==='jump'?'ГОТОВ':'ГОТОВА';$(k).classList.toggle('active-spring',k==='spring'&&p.spring>0);}
 $('location').textContent=LOOK.sections[p.s<420?0:p.s<710?1:p.s<1250?2:3];
 if(engine.phase==='countdown'){const label=String(Math.max(1,Math.ceil(engine.counter-.2)));if(label!==countdownText){countdownText=label;tone(360,.1);}$('countdown').textContent=label;$('countdown').classList.remove('hidden');}else{$('countdown').classList.add('hidden');countdownText='';}}
let renderSlow=0,renderQuality=1.35,frameAverage=1/60;
const rigYaw=new THREE.Quaternion(),upAxis=new THREE.Vector3(0,1,0);
function render(dt){const p=goats[0];
 frameAverage=frameAverage*.97+dt*.03;if(['racing','celebrating'].includes(engine.phase)){renderSlow=frameAverage>.031?renderSlow+dt:Math.max(0,renderSlow-dt);if(renderSlow>2&&renderQuality>1){renderQuality=1;renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.shadowMap.enabled=false;renderSlow=0;}}
 for(const chunk of terrain.userData.chunks)chunk.visible=chunk.userData.endS>p.s-150&&chunk.userData.startS<p.s+520;
 for(const g of goats){
  const b=g.body;g.visual.root.position.set(b.position.x,b.position.y,b.position.z);g.visual.root.rotation.set(0,0,0);updateWheelPose(THREE,g,dt,engine.phase==='paused');g.visual.root.visible=g.dead<=0&&Math.abs(g.s-p.s)<210;
  if(g.visual.root.visible&&g.visual.lastRage!==g.rage){for(const tint of g.visual.tintMaterials){tint.material.color.copy(tint.base).lerp(rageColor,g.rage*.88);tint.material.emissive.setHex(0x72190e);tint.material.emissiveIntensity=g.rage*.13;}g.visual.lastRage=g.rage;}
  const riding=g.rideTime>0&&!g.dead,doingTrick=g.trickActive&&g.trickAirborne&&!g.dead&&!riding;g.visual.rig.visible=doingTrick;g.visual.roll.visible=!doingTrick&&!riding;g.visual.ride.visible=riding;
  if(doingTrick){showAssets.animateTrick(g.visual.rig,g.motionTime-(g.trickStart||0),g.character.variant);rigYaw.setFromAxisAngle(upAxis,g.wheelHeading||0);g.visual.rig.quaternion.premultiply(rigYaw);}
  if(riding){g.visual.ride.rotation.y=-Math.atan2(b.velocity.x,-b.velocity.z);g.visual.ride.rotation.z=-g.turnAngle*.25;rideAssets.animateRide(g.visual.ride,g.motionTime,{speed:g.speed,trick:g.jump>1});}
  g.visual.shield.visible=g.spring>0||g.invulnerable>0&&(engine.phase==='racing'||engine.phase==='paused'&&engine.beforePause==='racing');g.visual.shield.material.color.set(g.spring>0?g.color:0xdbefff);g.visual.shield.rotation.y+=engine.phase==='paused'?0:dt*2;g.visual.marker.visible=false;g.label.visible=engine.phase!=='intro'&&(g.id===0||Math.abs(g.s-p.s)<45);g.label.position.y=riding?4.2:doingTrick?3.5:2.45;
 }
 for(const pickup of snowmobiles){pickup.visual.visible=!pickup.consumed&&pickup.s>p.s-60&&pickup.s<p.s+350;}
 for(const prop of props)prop.g.visible=prop.s>p.s-80&&prop.s<p.s+440&&!prop.hazard?.destroyed;
 treeBatch.userData.syncVisibility();
 for(const skier of skiers){const g=skier.visual,a=skier.position,s=-a.z;g.visible=!skier.consumed&&s>p.s-60&&s<p.s+440;g.position.set(a.x,a.y-skier.centerHeight+.18,a.z);const later=wildlifePosition(skier,engine.elapsed+.05),ahead=new THREE.Vector3(later.x-a.x,later.y-a.y,later.z-a.z);if(ahead.length()>30)ahead.set(0,-.53,-1);ahead.normalize();g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,themeCreatures?1:-1),ahead);}
 for(const animal of wildlife){const g=animal.visual;g.visible=!animal.consumed&&animal.s0>p.s-50&&animal.s0<p.s+280;if(!g.visible)continue;const a=animal.position,b=animal.previous;g.position.set(a.x,a.y-animal.centerHeight,a.z);const dx=a.x-b.x,dz=a.z-b.z;if(Math.hypot(dx,dz)>.00001)g.rotation.y=Math.atan2(-dx,-dz);else g.rotation.y=Math.cos(animal.phase)>=0?-Math.PI/2:Math.PI/2;for(const [i,leg] of g.userData.legs.entries())leg.rotation.x=Math.sin(engine.elapsed*animal.speed*7+i*Math.PI/2)*.5;g.userData.tail.rotation.z=Math.sin(engine.elapsed*7+animal.id)*.14;}

 for(const h of hazards)if(h.kind==='bear'&&!h.destroyed){h.g.position.copy(worldPosition(h.x,h.s));h.g.rotation.y=Math.sin(attract+h.s)*.2;}
 for(const h of hazards)if(h.kind==='hunter'&&!h.destroyed){const target=goats.find(g=>g.id===h.targetId)||p;const dx=target.body.position.x-h.g.position.x,dz=target.body.position.z-h.g.position.z;h.g.rotation.y=Math.atan2(dx,dz);if(h.g.userData.weapon&&h.aim){const d=h.aim.velocity;h.g.userData.weapon.rotation.y=Math.atan2(d.x,d.z)-h.g.rotation.y;h.g.userData.weapon.rotation.x=-Math.atan2(d.y,Math.hypot(d.x,d.z));}}
 for(const h of hazards)if(h.kind==='gunner'){rideAssets.animateGun(h.g,engine.elapsed,engine.elapsed-(h.lastShot??-10)<.18);h.g.visible=Math.abs(h.s-p.s)<250;if(h.aim)h.g.userData.weapon.rotation.y=Math.max(-.6,Math.min(.6,Math.atan2(h.aim.velocity.x,h.aim.velocity.z)-(h.houseYaw||0)));h.g.userData.weapon.rotation.x=-Math.atan2(h.aim?.velocity.y||0,Math.hypot(h.aim?.velocity.x||0,h.aim?.velocity.z||1));}
 for(const {h,line} of aimLines){line.visible=!h.destroyed&&h.warning>0;if(line.visible&&h.aim){const points=[new THREE.Vector3(h.aim.from.x,h.aim.from.y,h.aim.from.z),new THREE.Vector3(h.aim.to.x,h.aim.to.y,h.aim.to.z)];line.geometry.setFromPoints(points);line.material.opacity=.35+Math.sin(attract*22)*.3;}}
 for(const e of engine.entities){const g=dynamic.get(e.id);if(!g)continue;g.position.set(e.position.x,e.position.y,e.position.z);if(e.body)g.quaternion.set(e.body.quaternion.x,e.body.quaternion.y,e.body.quaternion.z,e.body.quaternion.w);else if(e.velocity){const v=e.velocity;g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(v.x,v.y||0,v.z).normalize());}if(e.kind==='yeti'){g.position.y-=2.2;g.rotation.y=Math.atan(derivative(-e.position.z));if(e.targetId!=null){const target=goats.find(a=>a.id===e.targetId);if(target)g.rotation.y=Math.atan2(target.body.position.x-e.position.x,target.body.position.z-e.position.z);}showAssets.animateYeti(g,engine.elapsed);g.visible=!e.destroyed;}if(e.kind==='trap'){showAssets.animateTrap(g,engine.elapsed,e.snap>0);}if(e.kind==='strike'){g.visible=!e.struck;g.scale.setScalar(.96+Math.sin(engine.elapsed*22)*.06);}}
 const effectDt=engine.phase==='paused'?0:dt;
 if(themeScenery)themeScenery.updateBackdrop(backdrop,engine.elapsed,p.body.position);
 fragmentPool.update(effectDt);gameAudio.update(dt,{phase:engine.phase,weather:engine.weather,playerPosition:p.body.position,bears:hazards.filter(h=>h.kind==='bear')});
 sceneEffects.update(effectDt);for(const g of grandstands){g.visible=p.s>LENGTH-450;(themeCreatures?.animateStand||showAssets.animateStand)(g,sceneEffects.party.time,sceneEffects.party.time>0);}
 for(const [id,trail] of bulletTrails){if(trail.e.history.length>1){const points=trail.e.history,attr=trail.line.geometry.attributes.position;for(let i=0;i<points.length;i++)attr.setXYZ(i,points[i].x,points[i].y,points[i].z);attr.needsUpdate=true;trail.line.geometry.setDrawRange(0,points.length);}if(trail.released){trail.age+=effectDt;trail.line.material.opacity=.78*Math.max(0,1-trail.age/2);if(trail.age>=2){scene.remove(trail.line);trail.line.geometry.dispose();trail.line.material.dispose();bulletTrails.delete(id);}}}
 for(let i=specialEffects.length-1;i>=0;i--){const fx=specialEffects[i];fx.age+=effectDt;const t=fx.age/fx.life;if(fx.kind==='blast'){fx.g.scale.setScalar(fx.radius*.42*Math.min(1,t*3)+.04);fx.g.traverse(m=>{if(m.isMesh)m.material.opacity=Math.max(0,1-t);});}else if(fx.kind==='shock'){fx.g.scale.setScalar(.1+fx.radius*t*1.5);fx.g.material.opacity=1-t;}else if(fx.kind==='bolt')fx.g.traverse(m=>{if(m.isMesh)m.material.opacity=Math.max(0,1-t)*(.7+Math.sin(fx.age*90)*.3);});if(t>=1){releaseSpecial(fx);specialEffects.splice(i,1);}}
 flash=Math.max(0,flash-effectDt*4);$('lightning-flash').style.opacity=flash;flashLight.intensity=Math.max(0,flashLight.intensity-effectDt*80);sun.intensity=baseSunIntensity+flash*6;
 for(let i=effects.length-1;i>=0;i--){const fx=effects[i];const effectDt=engine.phase==='paused'?0:dt;fx.life-=effectDt;fx.v.y-=18*effectDt;fx.m.position.addScaledVector(fx.v,effectDt);if(fx.spin){fx.m.rotation.x+=fx.spin.x*effectDt;fx.m.rotation.y+=fx.spin.y*effectDt;fx.m.rotation.z+=fx.spin.z*effectDt;}fx.m.scale.multiplyScalar(Math.exp(-effectDt*1.4));if(fx.life<=0){scene.remove(fx.m);effects.splice(i,1);}}
 for(let i=scorePopups.length-1;i>=0;i--){const popup=scorePopups[i];popup.life-=engine.phase==='paused'?0:dt;const projected=popup.position.clone().project(camera);popup.el.style.left=(projected.x*.5+.5)*innerWidth+'px';popup.el.style.top=(-projected.y*.5+.5)*innerHeight-(1.4-popup.life)*50+'px';popup.el.style.opacity=Math.min(1,popup.life*2);if(popup.life<=0){popup.el.remove();scorePopups.splice(i,1);}}
 precipitation.position.copy(p.visual.root.position);rainLines.position.copy(p.visual.root.position);
 if(precipitation.visible||rainLines.visible){const arr=precipGeo.attributes.position.array,snow=precipitation.visible;for(let i=0;i<precipCount;i++){const j=i*3;arr[j+1]-=effectDt*(snow?3.5:44);arr[j]+=effectDt*(snow?Math.sin(attract+i)*.7:2.5)+effectDt*engine.weather.wind*.65*Math.sin(engine.elapsed*1.12);if(arr[j+1]<-10){arr[j+1]=30;arr[j]=(rnd()-.5)*70;}if(!snow){const k=i*6;rainPositions[k]=arr[j];rainPositions[k+1]=arr[j+1];rainPositions[k+2]=arr[j+2];rainPositions[k+3]=arr[j]-.12-engine.weather.wind*.025;rainPositions[k+4]=arr[j+1]-1.8;rainPositions[k+5]=arr[j+2];}}precipGeo.attributes.position.needsUpdate=true;rainGeometry.attributes.position.needsUpdate=true;}
 ring.position.set(p.body.position.x,terrainHeight(p.body.position.x,p.s)+.15,p.body.position.z);ring.visible=p.dead<=0&&engine.phase!=='intro';
 const intro=engine.phase==='intro',celebrating=engine.phase==='celebrating'||engine.phase==='paused'&&engine.beforePause==='celebrating';let cp,look;
 if(celebrating){const t=sceneEffects.party.time;cp=worldPosition(16+Math.sin(t*.45)*4,LENGTH-22,20);look=worldPosition(0,LENGTH+23,7);}else if(intro){cp=worldPosition(13+Math.sin(attract*.13)*3,-15,14);look=worldPosition(0,28,1.8+LOOK.lift);}else{const b=p.body;cp=new THREE.Vector3(b.position.x-b.velocity.x*.06,b.position.y+12.2-p.jump*.2,b.position.z+13);look=new THREE.Vector3(b.position.x+b.velocity.x*.22,terrainHeight(b.position.x,p.s+21)+.3+p.jump*.25,b.position.z-21);look.y+=LOOK.lift;}
 if(shake>0){cp.x+=(rnd()-.5)*shake;cp.y+=(rnd()-.5)*shake;shake=Math.max(0,shake-dt);}
 camera.position.lerp(cp,1-Math.exp(-dt*(intro?2.2:7)));camera.lookAt(look);sun.position.copy(worldPosition(-40,p.s-50,110));sun.target.position.copy(worldPosition(0,p.s+25));renderer.render(scene,camera);}
function frame(now){const dt=Math.min((now-last)/1000,.08);last=now;attract+=dt;const drive=touchDrive||((keys.has('KeyW')||keys.has('ArrowUp'))?1:0);const steering=touchSteer||((keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0));accumulator+=dt;while(accumulator>=1/90){engine.step(1/90,steering,drive);accumulator-=1/90;}uiTimer-=dt;if(uiTimer<=0){updateUI();uiTimer=.16;}if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('visible');}if(eventTimer>0){eventTimer-=dt;if(eventTimer<=0)$('event-message').textContent='';}render(dt);requestAnimationFrame(frame);}
camera.position.copy(worldPosition(13,-15,14));requestAnimationFrame(frame);
const mc=document.modelContext;
if(mc?.registerTool){const lifecycle=new AbortController();const defs=[
 {name:'get_goat_race_state',title:'Состояние спуска',description:'Read the current downhill race, weather, rankings and ability cooldowns.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>engine.state()},
 {name:'start_goat_race',title:'Начать новый спуск',description:'Start or restart the twenty-character downhill race, clearing the current run.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{start();updateUI();return engine.state();}},
 {name:'use_goat_ability',title:'Использовать способность',description:'Use the player goat jump, spring, bomb or trap in the running race. Fails while unavailable.',inputSchema:{type:'object',properties:{ability:{type:'string',enum:['jump','spring','bomb','trap','recover']}},required:['ability'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||!['jump','spring','bomb','trap','recover'].includes(input.ability))throw new Error('Unknown ability');const used=engine.ability(goats[0],input.ability);updateUI();return {used,state:engine.state()};}},
 {name:'pause_goat_race',title:'Пауза спуска',description:'Pause or resume the current goat race.',inputSchema:{type:'object',properties:{paused:{type:'boolean'}},required:['paused'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(typeof input?.paused!=='boolean')throw new Error('paused must be boolean');pause(input.paused);return engine.state();}}
 ];for(const def of defs){try{Promise.resolve(mc.registerTool(def,{signal:lifecycle.signal})).catch(()=>{});}catch{}}addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
