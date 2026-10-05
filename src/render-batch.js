import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// A wheel is a rigid group. Its per-racer rage materials remain independent;
// immutable colours can share one draw when every other shader setting matches.
// Only direct mesh children are considered, so animated joints stay separate.
export function batchRigidMaterials(THREE, root) {
 const buckets=new Map(),identity=new THREE.Matrix4(),inverse=new THREE.Matrix4();
 const meshCount=()=>root.children.filter(child=>child.isMesh).length;
 const before=meshCount();
 root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();
 for(const mesh of root.children){
  const material=mesh.material,geometry=mesh.geometry;
  if(!mesh.isMesh||mesh.isInstancedMesh||mesh.isSkinnedMesh||!mesh.visible||!material?.isMeshStandardMaterial||
   material.userData.characterTint||material.transparent||material.opacity!==1||material.vertexColors||
   material.map||material.alphaMap||material.normalMap||material.bumpMap||material.displacementMap||
   material.roughnessMap||material.metalnessMap||material.emissiveMap||material.aoMap||material.lightMap||
   material.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile||
   mesh.customDepthMaterial||mesh.customDistanceMaterial||geometry.groups.length||
   geometry.getAttribute('color')||geometry.getAttribute('tangent')||
   Object.keys(geometry.morphAttributes).length||Object.values(geometry.attributes).some(a=>a.isInterleavedBufferAttribute)||
   geometry.drawRange.start!==0||geometry.drawRange.count!==Infinity)continue;
  const json=material.toJSON();
  for(const key of ['metadata','uuid','name','color','userData'])delete json[key];
  const attributes=Object.entries(geometry.attributes).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join('|');
  const key=JSON.stringify(json)+':'+attributes+':'+[mesh.castShadow,mesh.receiveShadow,mesh.renderOrder,mesh.layers.mask,mesh.frustumCulled].join(':');
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(mesh);
 }
 const batches=[];
 for(const meshes of buckets.values()){
  if(meshes.length<2)continue;
  const geometries=[];
  for(const mesh of meshes){
   mesh.updateWorldMatrix(false,false);
   const transform=identity.multiplyMatrices(inverse,mesh.matrixWorld);
   const geometry=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(transform);
   // A reflected mesh flips front-face winding at render time. Bake that flip
   // when its transform becomes part of one ordinary, unreflected mesh.
   if(transform.determinant()<0){
    for(const attribute of Object.values(geometry.attributes)){
     const a=attribute.array,size=attribute.itemSize;
     for(let vertex=0;vertex<attribute.count;vertex+=3)for(let component=0;component<size;component++){
      const left=(vertex+1)*size+component,right=(vertex+2)*size+component,value=a[left];a[left]=a[right];a[right]=value;
     }
    }
   }
   const count=geometry.getAttribute('position').count,colors=new Float32Array(count*3),color=mesh.material.color;
   for(let i=0;i<count;i++){colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;}
   geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometries.push(geometry);
  }
  const geometry=mergeGeometries(geometries,false);for(const source of geometries)source.dispose();
  if(!geometry)continue;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const source=meshes[0],material=source.material.clone();material.color.setHex(0xffffff);material.vertexColors=true;
  const batch=new THREE.Mesh(geometry,material);batch.name=root.name+'_colour_batch_'+batches.length;
  batch.castShadow=source.castShadow;batch.receiveShadow=source.receiveShadow;batch.renderOrder=source.renderOrder;
  batch.layers.mask=source.layers.mask;batch.frustumCulled=source.frustumCulled;
  batch.userData.shatterMaterials=meshes.flatMap(mesh=>mesh.userData.shatterMaterials||[mesh.material]);
  batches.push(batch);for(const mesh of meshes)root.remove(mesh);root.add(batch);
 }
 const result={before,after:meshCount(),batches};root.userData.renderBatch={before:result.before,after:result.after};return result;
}
