import {center,sampleGroundHeight} from './terrain.js';

// Upright alpine houses stand on terraces that extend down to the rough hillside.
export function foundationProfile(collider,scale,x,s,yaw){
 const [hx,hy,hz]=collider.halfExtents,[ox,oy,oz]=collider.offset;
 const bounds={minX:ox-hx-.18,maxX:ox+hx+.18,minZ:oz-hz-.18,maxZ:oz+hz+.18};
 const ground=(lx,lz)=>sampleGroundHeight(center(s)+x+scale*(lx*Math.cos(yaw)+lz*Math.sin(yaw)),s+scale*(lx*Math.sin(yaw)-lz*Math.cos(yaw)));
 let floor=-Infinity;
 for(let lx=bounds.minX;lx<=bounds.maxX+.8;lx+=.8)for(let lz=bounds.minZ;lz<=bounds.maxZ+.8;lz+=.8)floor=Math.max(floor,ground(Math.min(lx,bounds.maxX),Math.min(lz,bounds.maxZ)));
 floor+=.18;
 const corners=[[bounds.minX,bounds.minZ],[bounds.maxX,bounds.minZ],[bounds.maxX,bounds.maxZ],[bounds.minX,bounds.maxZ]];
 const points=[];
 for(let edge=0;edge<4;edge++){
  const a=corners[edge],b=corners[(edge+1)%4],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));
  for(let i=0;i<steps;i++){const t=i/steps,lx=a[0]+(b[0]-a[0])*t,lz=a[1]+(b[1]-a[1])*t;points.push([lx,(ground(lx,lz)-floor-.25)/scale,lz]);}
 }
 const low=Math.min(...points.map(p=>p[1])),top=oy+hy;
 return {lift:floor-sampleGroundHeight(center(s)+x,s),points,bounds,collider:{halfExtents:[hx+.18,(top-low)/2,hz+.18],offset:[ox,(top+low)/2,oz]}};
}
