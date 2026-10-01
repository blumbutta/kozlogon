import {center,sampleGroundHeight} from './terrain.js';
export function rampGrounding(profile,width,x,s,yaw){
 const front=profile[0],back=profile.at(-1);
 const ground=(lx,lz)=>sampleGroundHeight(center(s)+x+lx*Math.cos(yaw)+lz*Math.sin(yaw),s+lx*Math.sin(yaw)-lz*Math.cos(yaw));
 let entry=-Infinity;
 for(let i=0;i<=20;i++)entry=Math.max(entry,ground((i/20-.5)*width,front.z));
 const rootY=entry+.08-front.y;
 const apronPositions=[],apronIndices=[],steps=8,cols=8;
 for(let i=0;i<=steps;i++){
  const t=i/steps,z=front.z+4*(1-t),mix=t*t*(3-2*t);
  for(let j=0;j<=cols;j++){const xx=(j/cols-.5)*width,earth=ground(xx,z)-rootY+.055,y=Math.max(earth,earth*(1-mix)+front.y*mix);apronPositions.push(xx,y,z);}
 }
 for(let i=0;i<steps;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j;apronIndices.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);}
 const positions=[],indices=[];
 const perimeter=[];
 for(const side of [-1,1]){
  const ordered=side===-1?profile:[...profile].reverse();
  for(const p of ordered)perimeter.push({x:side*width/2,y:p.y-.16,z:p.z});
 }
 for(let i=0;i<perimeter.length;i++){
  const a=perimeter[i],b=perimeter[(i+1)%perimeter.length],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)));
  for(let j=0;j<n;j++){
   const t=j/n,xx=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t,k=positions.length/3;
   positions.push(xx,y,z,xx,Math.min(y-.1,ground(xx,z)-rootY-.18),z);
   if(k){indices.push(k-2,k-1,k,k-1,k+1,k);}
  }
 }
 const end=positions.length/3;indices.push(end-2,end-1,0,end-1,1,0);
 const collisionIndices=[];
 for(let i=0;i<indices.length;i+=3){const triangle=indices.slice(i,i+3),zs=triangle.map(index=>positions[index*3+2]);if([front.z,back.z].some(z=>zs.every(at=>Math.abs(at-z)<1e-6)))continue;collisionIndices.push(...triangle);}
 // Open ends let racers roll out from beneath ramps on deeply uneven ground.
 return {lift:rootY-sampleGroundHeight(center(s)+x,s),apronPositions,apronIndices,positions,indices,collisionIndices};
}
