import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {batchRigidMaterials} from '../src/render-batch.js';
import {createCharacterAssets} from '../src/character-assets.js';
import {createThemeCreatures} from '../src/theme-creatures.js';
import {CHARACTERS} from '../src/racers.js';

const triangles=root=>root.children.filter(m=>m.isMesh).reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0);
const bounds=root=>new THREE.Box3().setFromObject(root);
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<2e-6,`${label}: ${a} versus ${b}`);

test('every wheel keeps all triangles, silhouette, tint references and shadow settings while reducing material draws',()=>{
 for(const [world,assets,expected]of [
  ['alps',createCharacterAssets(THREE),[167,87]],
  ['hell',createThemeCreatures(THREE,'hell'),[120,80]],
  ['moon',createThemeCreatures(THREE,'moon'),[80,60]]
 ]){
  let before=0,after=0;
  for(const def of CHARACTERS){
   const model=assets.character(def),root=model.roll,original=root.children.slice(),count=triangles(root),box=bounds(root);
   const tintMeshes=original.filter(m=>m.material.userData.characterTint),tints=model.tintMaterials.slice();
   const sourceColors=original.map(m=>m.material.color.clone());
   const result=batchRigidMaterials(THREE,root);before+=result.before;after+=result.after;
   assert.equal(triangles(root),count,`${world} ${def.id}: unchanged triangle count`);
   const nextBox=bounds(root);for(const side of ['min','max'])for(const axis of ['x','y','z'])near(box[side][axis],nextBox[side][axis],`${world} ${def.id} bounds`);
   for(let i=0;i<original.length;i++)assert.ok(original[i].material.color.equals(sourceColors[i]),'shared source material was not recoloured');
   assert.deepEqual(model.tintMaterials,tints);
   for(const mesh of tintMeshes)assert.ok(root.children.includes(mesh),'rage tint mesh still uses its original material');
   for(const mesh of root.children){assert.equal(mesh.castShadow,true);assert.equal(mesh.receiveShadow,true);}
   for(const batch of result.batches){
    assert.equal(batch.material.vertexColors,true);assert.equal(batch.material.color.getHex(),0xffffff);
    assert.ok(batch.userData.shatterMaterials.length>1,'source fragment palettes survive batching');
    let vertex=0;
    for(const material of batch.userData.shatterMaterials){
     const source=original.find(mesh=>mesh.material===material),length=source.geometry.index?.count||source.geometry.attributes.position.count;
     for(const property of ['roughness','metalness','flatShading','side','emissiveIntensity','fog','toneMapped'])assert.equal(batch.material[property],material[property],'lighting property '+property+' remains exact');
     assert.ok(batch.material.emissive.equals(material.emissive),'emissive remains a material uniform');
     const color=batch.geometry.attributes.color;
     for(let i=0;i<length;i++,vertex++)for(const [component,channel]of [[0,'r'],[1,'g'],[2,'b']])near(color.array[vertex*3+component],material.color[channel],world+' linear '+channel);
    }
    assert.equal(vertex,batch.geometry.attributes.position.count);
   }
   if(tints.length){tints[0].material.color.setHex(0xec4434);assert.ok(tintMeshes.some(m=>m.material===tints[0].material),'rage still changes a displayed material');}
   assert.equal(batchRigidMaterials(THREE,root).after,result.after,'repeated batching is idempotent');
  }
  assert.deepEqual([before,after],expected,world+' complete 20-racer roster draw budget');
 }
});

test('rigid batching preserves transformed vertices, normals and UVs and bakes the original diffuse colours',()=>{
 const root=new THREE.Group();root.position.set(8,6,-4);root.rotation.set(.2,-.4,.1);
 const materials=[0xa4773f,0x496d86].map(color=>new THREE.MeshStandardMaterial({color,roughness:.9,flatShading:true}));
 const expected=[];
 for(let i=0;i<2;i++){
  const box=new THREE.BoxGeometry(1,1,1);box.clearGroups();
  const mesh=new THREE.Mesh(box,materials[i]);mesh.position.set(i*3,.4*i,-.3);mesh.rotation.set(.3,.2*i,.1);mesh.scale.set(i?-1.2:1.5,.6,1.8);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);mesh.updateMatrix();
  const geometry=mesh.geometry.toNonIndexed().applyMatrix4(mesh.matrix),reflected=mesh.matrix.determinant()<0;
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  for(let vertex=0;vertex<p.count;vertex++){
   const local=vertex%3,index=reflected?(local===1?vertex+1:local===2?vertex-1:vertex):vertex;
   expected.push({p:[p.getX(index),p.getY(index),p.getZ(index)],n:[n.getX(index),n.getY(index),n.getZ(index)],uv:[uv.getX(index),uv.getY(index)],c:materials[i].color.toArray()});
  }
 }
 const result=batchRigidMaterials(THREE,root);assert.equal(result.before,2);assert.equal(result.after,1);
 const g=result.batches[0].geometry;
 for(let i=0;i<expected.length;i++)for(const [name,reference]of [['position','p'],['normal','n'],['uv','uv'],['color','c']]){
  const attribute=g.attributes[name];for(let component=0;component<attribute.itemSize;component++)near(attribute.array[i*attribute.itemSize+component],expected[i][reference][component],name+' vertex '+i);
 }
});

test('independently animated joints, transparent materials and different lighting remain separate',()=>{
 const root=new THREE.Group(),geometry=new THREE.SphereGeometry(1,6,4),rig=new THREE.Group(),joint=new THREE.Group();rig.add(joint);root.add(rig);
 const jointMesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x334455}));joint.add(jointMesh);
 const base=new THREE.MeshStandardMaterial({color:0xcc8866,roughness:.9});
 const tinted=base.clone();tinted.userData.characterTint=true;
 const glow=base.clone();glow.emissive.setHex(0xff5500);glow.emissiveIntensity=.16;
 const clear=base.clone();clear.transparent=true;clear.opacity=.3;
 const custom=base.clone();custom.onBeforeCompile=()=>{};
 const meshes=[base,tinted,glow,clear,custom].map(m=>new THREE.Mesh(geometry,m));root.add(...meshes);
 const result=batchRigidMaterials(THREE,root);assert.equal(result.before,5);assert.equal(result.after,5);assert.equal(result.batches.length,0);
 assert.equal(rig.parent,root);assert.equal(joint.parent,rig);assert.equal(jointMesh.parent,joint);
 joint.rotation.x=.7;root.updateMatrixWorld(true);assert.equal(joint.rotation.x,.7);
});
