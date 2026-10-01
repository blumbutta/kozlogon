import {spikePits,lavaFlows,lavaPathX,center,LENGTH} from './terrain.js';
import {clearCourseIce} from './ice-clearance.js';
export function createWorldLayout(){
 let seed=1781;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const side=()=>random()<.5?-1:1;
 const trees=Array.from({length:330},(_,id)=>{
  const close=id%6===0;
  return {s:random()*2320-25,x:side()*(close?7+random()*12:22+random()*57),scale:.85+random()*.85};
 });
 const houses=Array.from({length:56},(_,id)=>{
  const s=id<8?180+id*38:id<40?635+(id-8)*27:1550+(id-40)*33;
  return {s,x:(id%2?-1:1)*(16+random()*22),style:id%5,scale:.82+random()*.38,yaw:(random()-.5)*.7};
 });
 const hunters=Array.from({length:28},(_,id)=>({s:135+id*73,x:(id%2?-1:1)*(11+random()*13)}));
 const obstacles=[];
 for(let s=90;s<2110;s+=28){const roll=random();let kind=roll<.1?'ramp':roll<.25?'hay':roll<.37?'bear':'rock';if(s<380&&kind==='bear')kind='rock';obstacles.push({s,x:(random()-.5)*19,kind,style:obstacles.length%3,r:kind==='ramp'?2:kind==='bear'?1.6:1.4});}
 const wildlife=Array.from({length:72},(_,id)=>{
  const kind=id%3===0?'marmot':'squirrel';
  return {id,kind,s0:75+id*29.3,x0:(random()-.5)*5,span:15+random()*8,speed:3.4+random()*2.3,phase:random()*Math.PI*2,points:kind==='squirrel'?100:150,radius:kind==='squirrel'?.52:.68,centerHeight:kind==='squirrel'?.5:.53,consumed:false};
 });
 const skiRoutes=[
  {start:70,end:760,side:-1,offset:46,cross:true,cycles:1.4,phase:.2,width:9,color:0x4a92d5},
  {start:400,end:1160,side:1,offset:48,cross:true,cycles:1.5,phase:2,width:11,color:0xe5795e},
  {start:1030,end:1800,side:-1,offset:42,cross:true,cycles:1.3,phase:4,width:10,color:0x4a92d5},
  {start:1480,end:2260,side:1,offset:44,cross:true,cycles:1.6,phase:1,width:10,color:0xe5795e}
 ];
 const reserve=(item,margin,minOffset=0)=>{
  const intervals=[];
  for(const route of skiRoutes){
   if(item.s<route.start-margin||item.s>route.end+margin)continue;
   let lo=Infinity,hi=-Infinity;
   for(let ds=-margin;ds<=margin;ds+=1){const at=item.s+ds;if(at<route.start||at>route.end)continue;const lane=skiRouteX(route,at)+center(at)-center(item.s);lo=Math.min(lo,lane);hi=Math.max(hi,lane);}
   intervals.push([lo-route.width/2-margin,hi+route.width/2+margin]);
  }
  const candidates=[item.x,-100,100,-16,16,...intervals.flatMap(([a,b])=>[a-.3,b+.3])];
  const allowed=candidates.filter(x=>Math.abs(x)>=minOffset&&Math.abs(x)<=100&&intervals.every(([a,b])=>x<a||x>b));
  item.x=allowed.sort((a,b)=>Math.abs(a-item.x)-Math.abs(b-item.x))[0]??(item.x<0?-100:100);
 };
 for(const tree of trees)reserve(tree,1.4);
 for(const [id,tree] of trees.entries())if(tree.s>LENGTH-70&&tree.s<LENGTH+85&&Math.abs(tree.x)<60)tree.x=(tree.x<0?-1:1)*(65+(id%5)*3);
 for(const house of houses)reserve(house,8,16);
 clearCourseIce(obstacles);
 const pits=spikePits(),lava=lavaFlows();
 const snowmobiles=Array.from({length:18},(_,id)=>({id,s:135+id*111+random()*40,x:(random()-.5)*17,consumed:false,radius:2.2}));
 const mobileClear=(s,x)=>{
  if(obstacles.some(h=>Math.abs(h.s-s)<(h.kind==='ramp'?18:h.r+3)&&Math.abs(h.x-x)<(h.kind==='ramp'?5:h.r+3)))return false;
  if(trees.some(tree=>Math.hypot(tree.s-s,tree.x-x)<2.2+1.5*tree.scale))return false;
  if(houses.some(house=>Math.abs(house.s-s)<11*house.scale+2.2&&Math.abs(house.x-x)<8*house.scale+2.2))return false;
  if(pits.some(pit=>Math.hypot(pit.s-s,pit.x-x)<pit.r+3.2))return false;
  if(lava.some(flow=>Math.abs(s-flow.s)<flow.r+3.2&&Math.abs(x-lavaPathX(flow,s))<flow.halfWidth+3.2))return false;
  return true;
 };
 for(const mobile of snowmobiles){
  const initialS=mobile.s,initialX=mobile.x;
  search:for(let ds=0;ds<=35;ds+=2)for(const direction of ds?[1,-1]:[1])for(let dx=0;dx<=24;dx+=1)for(const side of dx?[1,-1]:[1]){
   const s=initialS+ds*direction,x=initialX+dx*side;
   if(s>90&&s<LENGTH-65&&Math.abs(x)<=13&&mobileClear(s,x)){mobile.s=s;mobile.x=x;break search;}
  }
 }
 return {trees,houses,hunters,obstacles,wildlife,skiRoutes,snowmobiles,pits,lava};
}
export function skiRouteX(route,s){if(route.cross)return Math.sin((s-route.start)/(route.end-route.start)*Math.PI*2*route.cycles+route.phase)*route.offset;return route.side*route.offset+Math.sin(s*.012+route.phase)*9+Math.sin(s*.027+route.phase)*2;}
