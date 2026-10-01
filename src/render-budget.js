export function createTerrainChunks(THREE,geometry,material,{cols,rows,minS,cell,step=48}){
 const group=new THREE.Group(),chunks=[];
 for(let start=0;start<rows;start+=step){
  const end=Math.min(rows,start+step),first=start*(cols+1),last=(end+1)*(cols+1),geo=new THREE.BufferGeometry();
  for(const name of ['position','normal','color']){const a=geometry.attributes[name];geo.setAttribute(name,new THREE.BufferAttribute(a.array.slice(first*a.itemSize,last*a.itemSize),a.itemSize));}
  const index=geometry.index.array.slice(start*cols*6,end*cols*6),local=new Uint16Array(index.length);for(let i=0;i<index.length;i++)local[i]=index[i]-first;geo.setIndex(new THREE.BufferAttribute(local,1));geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;mesh.userData.startS=minS+start*cell;mesh.userData.endS=minS+end*cell;group.add(mesh);chunks.push(mesh);
 }
 group.userData.chunks=chunks;return group;
}
export function batchTrees(THREE,roots){
 const group=new THREE.Group(),batches=new Map(),references=new Map(),hidden=new THREE.Matrix4().makeScale(0,0,0);
 for(const root of roots){root.updateMatrixWorld(true);references.set(root,{visible:true,instances:[]});root.traverse(m=>{if(!m.isMesh)return;const key=m.geometry.uuid+':'+m.material.uuid;if(!batches.has(key))batches.set(key,{geometry:m.geometry,material:m.material,entries:[]});batches.get(key).entries.push({root,matrix:m.matrixWorld.clone()});});}
 for(const batch of batches.values()){const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.entries.length);batch.entries.forEach(({root,matrix},index)=>{mesh.setMatrixAt(index,matrix);references.get(root).instances.push({mesh,index,matrix});});mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);}
 group.userData.syncVisibility=()=>{for(const [root,state] of references){if(state.visible===root.visible)continue;state.visible=root.visible;for(const {mesh,index,matrix} of state.instances){mesh.setMatrixAt(index,root.visible?matrix:hidden);mesh.instanceMatrix.needsUpdate=true;}}};
 return group;
}
export function createFragmentPool(THREE,scene,count=160){
 const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,vertexColors:true}),count);mesh.frustumCulled=false;scene.add(mesh);
 const fragments=Array.from({length:count},()=>({life:0,p:new THREE.Vector3(),v:new THREE.Vector3(),rotation:new THREE.Vector3(),spin:new THREE.Vector3(),scale:new THREE.Vector3()})),temp=new THREE.Object3D(),colorValue=new THREE.Color();let cursor=0;
 for(let i=0;i<count;i++)mesh.setColorAt(i,colorValue);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
 function spawn(p,v,scale,color,life=.9,spin=null){const index=cursor++%count,f=fragments[index];f.life=life;f.p.copy(p);f.v.copy(v);f.scale.copy(scale);f.rotation.set(0,0,0);if(spin)f.spin.copy(spin);else f.spin.set(0,0,0);mesh.setColorAt(index,colorValue.set(color));mesh.instanceColor.needsUpdate=true;}
 function update(dt){for(let i=0;i<count;i++){const f=fragments[i];if(f.life>0){f.life=Math.max(0,f.life-dt);f.v.y-=18*dt;f.p.addScaledVector(f.v,dt);f.rotation.addScaledVector(f.spin,dt);f.scale.multiplyScalar(Math.exp(-dt*1.15));temp.position.copy(f.p);temp.rotation.set(f.rotation.x,f.rotation.y,f.rotation.z);temp.scale.copy(f.scale);}else{temp.position.set(0,-10000,0);temp.scale.setScalar(0);}temp.updateMatrix();mesh.setMatrixAt(i,temp.matrix);}mesh.instanceMatrix.needsUpdate=true;}
 function reset(){for(const f of fragments)f.life=0;cursor=0;update(0);}
 reset();return {mesh,fragments,spawn,update,reset};
}
