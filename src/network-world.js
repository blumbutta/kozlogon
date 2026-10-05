import {CHARACTERS,spawnPosition} from './racers.js';
import {worldCharacters} from './world-presentation.js';
import {resolveWorld,withWorld} from './worlds.js';
import {createWorldLayout} from './world-layout.js';
import {courseBoosts} from './boosts.js';
import {center,sampleGroundHeight} from './terrain.js';
import {foundationProfile} from './foundations.js';
import {rampGrounding} from './ramp-grounding.js';

// Bounds of the cached house meshes, including roofs and porches. A parity test
// compares these numbers with the renderer assets, keeping Node free of Three.
const HOUSE_BOUNDS={
 alps:[
  [[4.35026216506958,3.1500000953674316,4.110000014305115],[0,3.1500000953674316,-.31000006198883057]],
  [[3.6632261276245117,3.5485379695892334,4.120000004768372],[0,3.5485379695892334,-.29499995708465576]],
  [[3.766183853149414,2.984999895095825,4.037499904632568],[0,2.984999895095825,-.0774998664855957]],
  [[4.292129039764404,4.380000114440918,3.5250000953674316],[-.007205009460449219,4.380000114440918,0]],
  [[4.900000095367432,2.427664041519165,2.7521450519561768],[0,2.427664041519165,0]]
 ],
 hell:[
  [[4.440000057220459,3.930000066757202,3.5600000619888306],[0,3.930000066757202,.034999966621398926]],
  [[5.357999801635742,4.400000095367432,5.357999801635742],[0,4.400000095367432,0]],
  [[4.650000095367432,3.924999952316284,4.650000095367432],[0,3.924999952316284,0]],
  [[4.677999973297119,4.775000095367432,3.409999966621399],[.0279998779296875,4.775000095367432,.034999966621398926]],
  [[5.237500190734863,3.1363673210144043,3.1100000143051147],[-.0625,3.1363673210144043,.034999966621398926]]
 ],
 moon:[
  [[6.246309280395508,3.426999971270561,3.5225000381469727],[0,3.13299997150898,.07249999046325684]],
  [[5.586309432983398,3.990000009536743,3.922499895095825],[0,3.990000009536743,.07249999046325684]],
  [[5.971309185028076,3.5875000655651093,4.022499918937683],[0,3.272500067949295,.07249987125396729]],
  [[6.631309509277344,4.474999904632568,3.372499942779541],[0,4.474999904632568,.07249999046325684]],
  [[7.346309185028076,2.9800000190734863,3.072499990463257],[0,2.9800000190734863,.07249999046325684]]
 ]
};

export function networkHouseCollider(worldId,style){
 const world=resolveWorld(worldId),index=((Math.floor(Number(style)||0)%5)+5)%5;
 const [halfExtents,offset]=HOUSE_BOUNDS[world.id][index];
 return {type:'box',halfExtents:[...halfExtents],offset:[...offset],offsetY:offset[1]};
}

export function networkTreeCollider(worldId){
 const id=resolveWorld(worldId).id;
 if(id==='moon')return {halfExtents:[.48,10,.48],offset:[0,10,0]};
 if(id==='hell')return {halfExtents:[.34,7.5,.34],offset:[0,7.5,0]};
 return {halfExtents:[.325,5.5,.325],offset:[0,5.5,0]};
}

export function networkRampDefinition(style){
 if(style===1){
  const length=17.4,height=3.3;
  return {style:'quarterpipe',width:5.4,length,height,profile:Array.from({length:17},(_,i)=>{
   const t=i/16;return {z:length/2-t*length,y:.04+(height-.04)*t*t};
  })};
 }
 if(style===2)return {style:'twin_kicker',width:5.8,length:15.8,height:4.45,profile:[{z:7.9,y:.04},{z:1.9,y:1.2},{z:-.7,y:1.2},{z:-7.9,y:4.45}]};
 return {style:'straight_wedge',width:5.6,length:12.4,height:3.35,profile:[{z:6.2,y:.04},{z:-6.2,y:3.35}]};
}

const roadYaw=s=>-Math.atan((center(s+.1)-center(s-.1))/.2);
const scaledCollider=(collider,scale)=>({halfExtents:collider.halfExtents.map(n=>n*scale),offset:collider.offset.map(n=>n*scale)});

export function createNetworkWorld(worldId='alps'){
 const world=resolveWorld(worldId);
 return withWorld(world.id,()=>{
  const layout=createWorldLayout(),hazards=[];
  const add=(kind,def,netId,extra={})=>{
   const hazard={kind,x:def.x,s:def.s,r:def.r??1.5,yaw:roadYaw(def.s),groundLift:0,baseX:def.x,hit:new Set(),netId,...extra};
   hazards.push(hazard);return hazard;
  };
  layout.trees.forEach((tree,index)=>add('tree',tree,'tree-'+index,{r:.55*tree.scale,collider:scaledCollider(networkTreeCollider(world.id),tree.scale)}));
  layout.houses.forEach((house,index)=>{
   const yaw=house.yaw+roadYaw(house.s),raw=networkHouseCollider(world.id,house.style);
   const foundation=foundationProfile(raw,house.scale,house.x,house.s,yaw);
   const collider=scaledCollider(foundation.collider,house.scale);
   add('house',house,'house-'+index,{r:collider.halfExtents[0],yaw,collider,groundLift:foundation.lift});
   if(index%7===3){
    const local={x:0,y:(.6+.8*1.41)*house.scale,z:(foundation.collider.halfExtents[2]+.2+.8*.26)*house.scale};
    // The visual flash group is attached at the machine-gun origin.
    const x=center(house.s)+house.x,fireFrom={x:x+Math.sin(yaw)*local.z,y:sampleGroundHeight(x,house.s)+foundation.lift+local.y,z:-house.s+Math.cos(yaw)*local.z};
    add('gunner',house,'gunner-'+index,{id:'gunner-'+index,r:.7,sourceName:world.hazardNames.gunner,houseYaw:yaw,fireFrom,houseIndex:index});
   }
  });
  layout.obstacles.forEach((obstacle,index)=>{
   const extra={};
   if(obstacle.kind==='ramp'){
    const ramp=networkRampDefinition(obstacle.style),grounding=rampGrounding(ramp.profile,ramp.width,obstacle.x,obstacle.s,roadYaw(obstacle.s));
    Object.assign(extra,{profile:ramp.profile,width:ramp.width,grounding,groundLift:grounding.lift});
   }
   if(obstacle.kind==='bear')extra.sourceName=world.hazardNames.bear;
   add(obstacle.kind,obstacle,'obstacle-'+index,extra);
  });
  layout.hunters.forEach((hunter,index)=>add('hunter',hunter,'hunter-'+index,{r:.7,sourceName:world.hazardNames.hunter}));
  const skiers=layout.skiRoutes.flatMap((route,routeIndex)=>Array.from({length:4},(_,i)=>({
   id:routeIndex*4+i,kind:'skier',route,phase:((i+.2+routeIndex*.13)/4)%1,speed:13+i*1.3,radius:.8,centerHeight:1,points:250,consumed:false
  })));
  const goats=worldCharacters(CHARACTERS,world).map((character,index)=>({
   id:index,characterId:character.id,character,name:'🤖 '+character.name,color:character.color,isBot:true,controller:'bot',
   ...spawnPosition(index),speed:0,vx:0,jump:0,vy:0,spin:0,dead:0,invulnerable:0,slow:0,finishTime:null,
   cd:{jump:0,bomb:0,trap:0},ai:{target:spawnPosition(index).x,timer:0}
  }));
  return {worldId:world.id,layout,goats,hazards,wildlife:layout.wildlife,skiers,boosts:courseBoosts(),snowmobiles:layout.snowmobiles};
 });
}
