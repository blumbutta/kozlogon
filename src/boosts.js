import {center,sampleGroundHeight} from './terrain.js';
export function courseBoosts(){return Array.from({length:16},(_,i)=>({id:i,x:[0,-5,5,0][i%4],s:100+i*130,width:8,length:12,yaw:-Math.atan((center(100+i*130+.2)-center(100+i*130-.2))/.4)}));}
export function localBoostPosition(zone,p){
 const dx=p.x-center(zone.s)-zone.x,dz=p.z+zone.s,c=Math.cos(zone.yaw||0),s=Math.sin(zone.yaw||0);
 return {x:c*dx-s*dz,z:s*dx+c*dz};
}
export function rampSurfaceAt(h,z){
 const profile=h.profile,front=profile[0],back=profile.at(-1);
 if(z>front.z)return {y:front.y,slope:0};
 if(z<back.z)return {y:back.y,slope:0};
 for(let i=1;i<profile.length;i++){const a=profile[i-1],b=profile[i];if(z<=a.z&&z>=b.z){const t=(z-a.z)/(b.z-a.z);return {y:a.y+(b.y-a.y)*t,slope:(b.y-a.y)/(a.z-b.z)};}}
 return {y:front.y,slope:0};
}
export function createBoostVisual(THREE,zone,ramp=null){
 const group=new THREE.Group(),positions=[],indices=[];
 const material=new THREE.MeshBasicMaterial({color:0x9efaff,side:THREE.DoubleSide,toneMapped:false});
 const origin={x:center(zone.s)+zone.x,y:sampleGroundHeight(center(zone.s)+zone.x,zone.s)+(zone.groundLift||0),z:-zone.s};
 const yaw=zone.yaw||0,c=Math.cos(yaw),s=Math.sin(yaw);
 const point=(x,z)=>{
  const wx=origin.x+c*x+s*z,wz=origin.z-s*x+c*z;
  return [x,ramp?rampSurfaceAt(ramp,z).y+.09:sampleGroundHeight(wx,-wz)-origin.y+.13,z];
 };
 const triangle=(a,b,c)=>{const i=positions.length/3;positions.push(...point(...a),...point(...b),...point(...c));indices.push(i,i+1,i+2);};
 const ribbon=(a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len*.18,nz=dx/len*.18,n=Math.ceil(len/.35);for(let i=0;i<n;i++){const x=a[0]+dx*i/n,z=a[1]+dz*i/n,x2=a[0]+dx*(i+1)/n,z2=a[1]+dz*(i+1)/n;triangle([x+nx,z+nz],[x-nx,z-nz],[x2+nx,z2+nz]);triangle([x-nx,z-nz],[x2-nx,z2-nz],[x2+nx,z2+nz]);}};
 const front=ramp?ramp.profile[0].z:zone.length/2,back=ramp?ramp.profile.at(-1).z:-zone.length/2,width=zone.width*.66;
 const icePositions=[],iceColors=[],iceIndices=[],nx=12,nz=Math.ceil(front-back);
 for(let row=0;row<=nz;row++){const z=front+(back-front)*row/nz;for(let col=0;col<=nx;col++){const x=(col/nx-.5)*zone.width*(ramp?.92:1);const p=point(x,z);p[1]+=.025;icePositions.push(...p);const color=new THREE.Color((row+col)%4===0?0xe6ffff:0x8dd4ea);iceColors.push(color.r,color.g,color.b);}}
 for(let row=0;row<nz;row++)for(let col=0;col<nx;col++){const a=row*(nx+1)+col;iceIndices.push(a,a+1,a+nx+1,a+1,a+nx+2,a+nx+1);}
 const ice=new THREE.BufferGeometry();ice.setAttribute('position',new THREE.Float32BufferAttribute(icePositions,3));ice.setAttribute('color',new THREE.Float32BufferAttribute(iceColors,3));ice.setIndex(iceIndices);ice.computeVertexNormals();
 const iceMat=new THREE.MeshPhysicalMaterial({color:0xc4f7ff,vertexColors:true,roughness:.12,metalness:.12,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.82,side:THREE.DoubleSide});group.add(new THREE.Mesh(ice,iceMat));
 // Cracks glint on course ice; only ramps keep downhill arrows.
 if(ramp){for(let z=front-1;z>back+1;z-=2.8)for(const side of [-1,1])ribbon([side*width/2,z+.65],[0,z-.6]);}
 else{for(let i=0;i<5;i++){const z=front-1.2-i*(front-back-2.4)/4,x=(i%2?-.2:.3)*zone.width;ribbon([x-1.1,z+.25],[x,z-.35]);ribbon([x,z-.35],[x+.7,z-.18]);}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();group.add(new THREE.Mesh(geometry,material));
 group.position.set(origin.x,origin.y,origin.z);group.rotation.y=yaw;group.userData.boost=true;group.userData.ice=true;group.userData.arrows=!!ramp;return group;
}
