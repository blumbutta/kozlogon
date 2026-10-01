/**
 * Theme scenery. Geometry/material templates are shared, no remote assets.
 * createThemeScenery(THREE,'hell'|'moon') -> house(style), tree(), mountain(seed),
 * backdrop(), updateBackdrop(group,time,anchor), lavaFlow(zone,sample,center,opts).
 * Houses use userData.collider {halfExtents,offset}; trees expose a narrow trunk
 * collider and cached static meshes, compatible with batchTrees.
 * lavaFlow returns a group with WORLD coordinates. Do not place() it again.
 * Its exact kill footprint is userData.flow {s,x,halfWidth,halfLength,pathX(s)}.
 * Terrain must be sampled without spike depressions for the flowing lava theme.
 */
export function createThemeScenery(THREE, themeId = 'hell') {
  const lunar = themeId === 'moon';
  const geometries = new Map(), templates = new Map(), materials = new Map();
  const palettes = lunar
    ? {stone:0x8596ad,dark:0x2b344b,metal:0xd7e3ee,trim:0x4b7d9c,glass:0x42ebda,
      glow:0x93ffce,crystal:0x738ed8,crystalLight:0xa5ddfc,soil:0x727c93}
    : {stone:0x382331,dark:0x160f1b,metal:0x664658,trim:0x871c32,glass:0xff742c,
      glow:0xffd35b,crystal:0x3c202b,crystalLight:0x9b253a,soil:0x251920};
  function material(name) {
    if (!materials.has(name)) {
      const glow = ['glow','glass'].includes(name);
      materials.set(name,new THREE.MeshStandardMaterial({color:palettes[name],
        roughness:glow?.3:.91,metalness:name==='metal'?.36:0,flatShading:true,
        emissive:glow?palettes[name]:0x000000,emissiveIntensity:glow?.55:0}));
    }
    return materials.get(name);
  }
  function cache(key, make) {if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);}
  const box=()=>cache('box',()=>new THREE.BoxGeometry(1,1,1));
  const ball=()=>cache('ball',()=>new THREE.IcosahedronGeometry(1,1));
  const cone=()=>cache('cone',()=>new THREE.ConeGeometry(1,1,8));
  const crystal=()=>cache('crystal',()=>new THREE.CylinderGeometry(0,1,1,5));
  const cylinder=()=>cache('cylinder',()=>new THREE.CylinderGeometry(1,1,1,10));
  const p=(geometry,mat,position,scale,rotation=[0,0,0])=>({geometry,mat,position,scale,rotation});
  const cube=(mat,pos,size,rot)=>p(box(),mat,pos,size,rot);
  const oval=(mat,pos,size,rot)=>p(ball(),mat,pos,size,rot);
  function segment(mat,a,b,r=.13) {
    const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());
    const e=new THREE.Euler().setFromQuaternion(q);
    return p(cylinder(),mat,va.add(vb).multiplyScalar(.5).toArray(),[r,d.length(),r],[e.x,e.y,e.z]);
  }
  function merge(parts) {
    const positions=[],normals=[],v=new THREE.Vector3(),n=new THREE.Vector3(),m=new THREE.Matrix4(),nm=new THREE.Matrix3();
    for(const item of parts){
      m.compose(new THREE.Vector3(...item.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...item.rotation)),new THREE.Vector3(...item.scale));nm.getNormalMatrix(m);
      const geometry=item.geometry,ps=geometry.getAttribute('position'),ns=geometry.getAttribute('normal'),idx=geometry.index,count=idx?idx.count:ps.count;
      for(let j=0;j<count;j++){const i=idx?idx.getX(j):j;v.fromBufferAttribute(ps,i).applyMatrix4(m);n.fromBufferAttribute(ns,i).applyMatrix3(nm).normalize();positions.push(v.x,v.y,v.z);normals.push(n.x,n.y,n.z);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.computeBoundingBox();g.computeBoundingSphere();return g;
  }
  function staticGroup(parts,name) {
    const buckets=new Map(),g=new THREE.Group();g.name=name;
    for(const part of parts){if(!buckets.has(part.mat))buckets.set(part.mat,[]);buckets.get(part.mat).push(part);}
    for(const [mat,items] of buckets){const mesh=new THREE.Mesh(merge(items),material(mat));mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);}
    return g;
  }
  function finishHouse(g,style) {
    g.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(g),size=bounds.getSize(new THREE.Vector3()),c=bounds.getCenter(new THREE.Vector3());
    g.userData={theme:themeId,style,dimensions:{width:size.x,height:size.y,length:size.z},collider:{type:'box',halfExtents:[size.x/2,size.y/2,size.z/2],offset:[c.x,c.y,c.z],offsetY:c.y}};return g;
  }
  function portals(parts,w,d,height,rows=1) {
    for(const side of [-1,1])for(let row=0;row<rows;row++)for(const x of [-w*.29,w*.29]){
      const y=1.9+row*1.65,z=side*(d/2+.035);
      parts.push(cube('dark',[x,y,z],[1.35,1.3,.15]));
      parts.push(cube('glass',[x,y,z+side*.09],[1.12,1.04,.07]));
      parts.push(cube('metal',[x,y,z+side*.14],[.075,1.08,.05]));
    }
    parts.push(cube('dark',[0,1.15,d/2+.12],[1.65,2.25,.2]));
    parts.push(cube('trim',[0,1.1,d/2+.24],[1.25,2.05,.12]));
    parts.push(cube('glow',[0,1.13,d/2+.32],[.065,1.8,.05]));
  }
  function makeHouse(style) {
    const parts=[],w=[8,6.8,7.5,8.7,10][style],d=[6.5,7.3,7.5,6.2,5.6][style],h=[4.2,5.4,4.5,5.5,3.6][style];
    parts.push(cube('stone',[0,.22,0],[w+.35,.44,d+.35]));
    if(lunar){
      if(style===0||style===2){
        parts.push(oval('metal',[0,h*.43,0],[w*.5,h*.5,d*.5]));
        parts.push(cube('stone',[0,1.4,0],[w*.87,2.25,d*.87]));
        parts.push(p(cylinder(),'trim',[0,.49,0],[w*.52,.2,d*.52]));
      }else{
        parts.push(cube('metal',[0,h/2+.44,0],[w,h,d]));
        parts.push(cube('trim',[0,h+.6,0],[w+.25,.32,d+.25]));
      }
      for(const side of [-1,1])parts.push(cube('trim',[side*(w/2-.3),h/2+.4,0],[.3,h,d+.15]));
      if(style===1){parts.push(p(cylinder(),'stone',[0,h+1.3,0],[2.2,1.65,2.2]));parts.push(oval('metal',[0,h+2.1,0],[2.25,.48,2.25]));}
      if(style===2){for(const side of [-1,1])parts.push(oval('metal',[side*3.9,2.25,0],[1.8,2,2.1]));}
      if(style===3){parts.push(p(cylinder(),'metal',[2.7,h+1.1,.8],[1.12,3.3,1.12]));parts.push(oval('glass',[2.7,h+2.8,.8],[1.4,.65,1.4]));}
      if(style===4){for(const x of [-2.3,2.3])parts.push(oval('metal',[x,h+.45,0],[2.3,.7,2.45]));}
      // Solar wings and a ring antenna give the bases readable sci-fi silhouettes.
      for(const side of [-1,1]){parts.push(segment('metal',[side*w*.35,h+.1,0],[side*(w*.55+1),h+1.1,0],.08));parts.push(cube('dark',[side*(w*.55+1),h+1.15,0],[1.75,.10,2.8],[0,0,side*.32]));parts.push(cube('glass',[side*(w*.55+1),h+1.21,0],[1.48,.035,2.5],[0,0,side*.32]));}
      parts.push(segment('metal',[-w*.24,h+.1,1.2],[-w*.24,h+2.1,1.2],.07));parts.push(oval('glow',[-w*.24,h+2.15,1.2],[.21,.21,.21]));
    }else{
      parts.push(cube('stone',[0,h/2+.44,0],[w,h,d]));
      parts.push(cube('dark',[0,h+.55,0],[w+.3,.3,d+.3]));
      // Five forms: twin-tower keep, chapel, rotunda, asymmetric fortress, barracks.
      if(style===2){parts.push(p(cylinder(),'stone',[0,h*.55,0],[w*.53,h,d*.53]));parts.push(p(cone(),'trim',[0,h+1.8,0],[w*.62,3.1,d*.62]));}
      else if(style===1){parts.push(p(cone(),'trim',[0,h+1.8,0],[w*.76,3.2,d*.76],[0,Math.PI/4,0]));}
      else {for(let x=-w/2;x<=w/2;x+=1.2){parts.push(cube('metal',[x,h+1.04,-d/2],[.6,.75,.55]));parts.push(cube('metal',[x,h+1.04,d/2],[.6,.75,.55]));}}
      const towers=style===0?[-1,1]:style===3?[1]:[];
      for(const side of towers){parts.push(p(cylinder(),'metal',[side*w*.38,h*.65,0],[1.1,h*1.3,1.1]));parts.push(p(cone(),'trim',[side*w*.38,h*1.3+1.2,0],[1.4,2.4,1.4]));}
      for(const side of [-1,1]){
        parts.push(segment('dark',[side*w*.35,h+.25,-d*.18],[side*(w*.35+.7),h+2.1,-d*.18],.15));
        parts.push(p(cone(),'metal',[side*(w*.35+.68),h+2.2,-d*.18],[.18,1.05,.18],[0,0,side*-.45]));
      }
      // Infernal furnace vents; distinct horns, no human chalet shapes or snow.
      for(const x of [-w*.35,0,w*.35])parts.push(cube('glow',[x,.72,-d/2-.03],[.58,.3,.1]));
    }
    portals(parts,w,d,h,h>4.7?2:1);
    return finishHouse(staticGroup(parts,(lunar?'moon_base_':'demon_fort_')+style),style);
  }
  function house(style=0) {const id=((Math.floor(Number(style)||0)%5)+5)%5,key='house-'+id;if(!templates.has(key))templates.set(key,makeHouse(id));return templates.get(key).clone(true);}
  function tree() {
    if(!templates.has('tree')){
      const parts=[];
      if(lunar){
        parts.push(p(crystal(),'crystal',[0,10,0],[1.8,20,1.6],[0,.12,.04]));
        for(const side of [-1,1]){parts.push(p(crystal(),'crystalLight',[side*1.65,6.5,.35],[1.3,13,1.25],[0,.2,side*-.19]));parts.push(p(crystal(),'glass',[side*.85,9,-.4],[.32,15,.38],[0,0,side*.035]));}
        parts.push(oval('soil',[0,.55,0],[2.8,.75,2.4]));
      }else{
        parts.push(p(cylinder(),'dark',[0,7.5,0],[.34,15,.34]));
        for(const side of [-1,1]){
          parts.push(segment('dark',[0,9.5,0],[side*3,14,side*.5],.2));
          parts.push(segment('dark',[side*3,14,side*.5],[side*2.7,19,side*.65],.11));
          parts.push(segment('dark',[0,13,0],[side*1.8,20,-side*.4],.16));
          parts.push(p(cone(),'crystalLight',[side*2.75,19.15,side*.65],[.27,.7,.27]));
        }
        parts.push(p(cone(),'dark',[0,18.5,0],[.35,8,.35]));
        parts.push(cube('glow',[.355,5.2,.05],[.025,4.3,.13]));
        parts.push(oval('soil',[0,.2,0],[1.35,.4,1.2]));
      }
      const g=staticGroup(parts,lunar?'lunar_crystal':'charred_tree');
      g.userData={theme:themeId,collider:{halfExtents:[lunar?.48:.34,lunar?10:7.5,lunar?.48:.34],offset:[0,lunar?10:7.5,0]}};templates.set('tree',g);
    }
    return templates.get('tree').clone(true);
  }
  function rng(seed) {let state=2166136261;for(const c of String(seed))state=Math.imul(state^c.charCodeAt(0),16777619);return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
  function peak(variant) {
    const key='peak-'+variant;
    if(!templates.has(key)){
      const random=rng(key),count=10,angles=Array.from({length:count},(_,i)=>i*Math.PI*2/count);
      const profile=lunar?[[1,0],[.64,.33],[.36,.87],[.22,.65],[.12,.58]]:[[1,0],[.66,.43],[.31,.95],[.23,.84],[.14,.75]];
      const rings=profile.map(([radius,y],ring)=>angles.map(a=>[Math.cos(a)*radius*(.89+random()*.22),y+(ring?(random()-.5)*.055:0),Math.sin(a)*radius*(.86+random()*.22)]));
      const positions=[],colors=[],dark=new THREE.Color(lunar?0x4e5870:0x211724),mid=new THREE.Color(lunar?0x9297ac:0x58404b),light=new THREE.Color(lunar?0xc2c9d6:0x8b3642);
      for(let ring=0;ring<rings.length-1;ring++)for(let i=0;i<count;i++){
        const j=(i+1)%count,col=[dark,mid,light][(i+ring+variant)%3];
        for(const tri of [[rings[ring][i],rings[ring+1][i],rings[ring][j]],[rings[ring][j],rings[ring+1][i],rings[ring+1][j]]])for(const v of tri){positions.push(...v);colors.push(col.r,col.g,col.b);}
      }
      const bottom=[0,lunar?.55:.72,0],last=rings.at(-1);for(let i=0;i<count;i++)for(const v of [last[i],bottom,last[(i+1)%count]]){positions.push(...v);colors.push(dark.r,dark.g,dark.b);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
      if(!materials.has('peakSurface'))materials.set('peakSurface',new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));
      const g=new THREE.Group(),surface=new THREE.Mesh(geometry,materials.get('peakSurface'));surface.receiveShadow=true;surface.castShadow=false;g.add(surface);
      if(!lunar){
        const lava=[];
        for(let i=0;i<count;i++)lava.push(...[0,.738,0],...last[i].map((v,k)=>k===1?.744:v*.93),...last[(i+1)%count].map((v,k)=>k===1?.744:v*.93));
        // Six ribbons leave the crater and descend the exterior; no overlaid shell.
        for(const idx of [0,2,3,5,7,8])for(let ring=0;ring<3;ring++){
          const a=rings[ring][idx],b=rings[ring+1][idx],half=.025+(3-ring)*.003;
          const ang=angles[idx],tx=-Math.sin(ang)*half,tz=Math.cos(ang)*half,offset=.008;
          const va=[a[0]+Math.cos(ang)*offset,a[1]+offset,a[2]+Math.sin(ang)*offset],vb=[b[0]+Math.cos(ang)*offset,b[1]+offset,b[2]+Math.sin(ang)*offset];
          const a0=[va[0]+tx,va[1],va[2]+tz],a1=[va[0]-tx,va[1],va[2]-tz],b0=[vb[0]+tx,vb[1],vb[2]+tz],b1=[vb[0]-tx,vb[1],vb[2]-tz];lava.push(...a0,...a1,...b0,...a1,...b1,...b0);
        }
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(lava,3));geo.computeVertexNormals();geo.computeBoundingSphere();
        if(!materials.has('volcanoLava'))materials.set('volcanoLava',new THREE.MeshBasicMaterial({color:0xff5d18,side:THREE.DoubleSide,toneMapped:false}));
        g.add(new THREE.Mesh(geo,materials.get('volcanoLava')));
      }
      g.name=lunar?'angular_lunar_crater':'open_volcano';templates.set(key,g);
    }
    return templates.get(key).clone(true);
  }
  function mountain(seed=1) {
    const random=rng(seed),height=150+random()*150,base=height*(lunar?.7:.66),g=new THREE.Group();g.name=lunar?'moon_crater_mountains':'volcano_cluster';
    for(const [i,p] of [[0,0,1,1],[-.8,.2,.57,.67],[.72,-.19,.46,.59]].entries()){
      const volcano=peak(Math.floor(random()*8));volcano.position.set(p[0]*base,0,p[1]*base);volcano.scale.set(base*p[3],height*p[2],base*p[3]*(.88+random()*.14));volcano.rotation.y=random()*Math.PI*2;g.add(volcano);
    }
    g.userData={theme:themeId,seed,height,singleSurface:true,crater:true};return g;
  }
  let flowTexture;
  function lavaTexture() {
    if(flowTexture)return flowTexture;
    const w=64,h=128,pixels=new Uint8Array(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const phase=Math.sin(x*.8+Math.sin(y*.25)*2)+Math.sin(y*.48+x*.19),ridge=Math.sin(x*.35-y*.14)> .48;
      const bright=phase>1.06||ridge,i=(y*w+x)*4;pixels[i]=bright?255:175+Math.round((phase+2)*14);pixels[i+1]=bright?173+Math.round(Math.sin(y*.3)*35):32+Math.round((phase+2)*8);pixels[i+2]=bright?21:11;pixels[i+3]=255;
    }
    flowTexture=new THREE.DataTexture(pixels,w,h,THREE.RGBAFormat);flowTexture.wrapS=flowTexture.wrapT=THREE.RepeatWrapping;flowTexture.magFilter=THREE.LinearFilter;flowTexture.minFilter=THREE.LinearFilter;flowTexture.colorSpace=THREE.SRGBColorSpace;flowTexture.needsUpdate=true;return flowTexture;
  }
  function lavaFlow(zone,sampleGroundHeight,center,options={}) {
    const halfWidth=options.halfWidth??2.6,halfLength=(options.length??zone.r*2)/2,step=.75;
    const pathX=s=>zone.x+Math.sin((s-zone.s)*.11)*4,positions=[],uvs=[],indices=[];
    const rows=Math.ceil(halfLength*2/step),cell=options.terrainCell??3,minX=options.terrainMinX??-135,minS=options.terrainMinS??-60;
    const clip=(polygon,boundary)=>{
      for(let edge=0;edge<boundary.length&&polygon.length;edge++){
        const a=boundary[edge],b=boundary[(edge+1)%boundary.length],out=[];
        const side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
        for(let i=0;i<polygon.length;i++){
          const v=polygon[i],w=polygon[(i+1)%polygon.length],dv=side(v),dw=side(w),iv=dv>=-1e-8,iw=dw>=-1e-8;
          if(iv)out.push(v);
          if(iv!==iw){const t=dv/(dv-dw);out.push([v[0]+(w[0]-v[0])*t,v[1]+(w[1]-v[1])*t]);}
        }
        polygon=out;
      }
      return polygon;
    };
    // Clipped polygons keep every original ground edge. Each lava triangle lies
    // exactly 15cm above one terrain triangle, even across the steepest bumps.
    for(let row=0;row<rows;row++){
      const a=zone.s-halfLength+halfLength*2*row/rows,b=zone.s-halfLength+halfLength*2*(row+1)/rows;
      const ax=center(a)+pathX(a),bx=center(b)+pathX(b),quad=[[ax-halfWidth,a],[ax+halfWidth,a],[bx+halfWidth,b],[bx-halfWidth,b]];
      const lx=Math.floor((Math.min(ax,bx)-halfWidth-minX)/cell),hx=Math.floor((Math.max(ax,bx)+halfWidth-minX)/cell),ls=Math.floor((a-minS)/cell),hs=Math.floor((b-minS)/cell);
      for(let ix=lx;ix<=hx;ix++)for(let is=ls;is<=hs;is++){
        const x=minX+ix*cell,s=minS+is*cell;
        for(const tri of [[[x,s],[x+cell,s],[x,s+cell]],[[x+cell,s],[x+cell,s+cell],[x,s+cell]]]){
          const clipped=clip(tri,quad),polygon=clipped.filter((v,i)=>!i||Math.hypot(v[0]-clipped[i-1][0],v[1]-clipped[i-1][1])>1e-7);
          if(polygon.length>2&&Math.hypot(polygon[0][0]-polygon.at(-1)[0],polygon[0][1]-polygon.at(-1)[1])<1e-7)polygon.pop();
          if(polygon.length<3)continue;const base=positions.length/3;
          for(const [px,ps] of polygon){positions.push(px,sampleGroundHeight(px,ps)+.15,-ps);uvs.push((px-center(ps)-pathX(ps)+halfWidth)/(halfWidth*2)*1.8,(ps-zone.s+halfLength)/(halfLength*2)*2.5);}
          for(let i=1;i<polygon.length-1;i++){
            const [p0,p1,p2]=[polygon[0],polygon[i],polygon[i+1]],area=(p1[0]-p0[0])*(p2[1]-p0[1])-(p1[1]-p0[1])*(p2[0]-p0[0]);
            if(Math.abs(area)>1e-8)indices.push(base,base+i,base+i+1);
          }
        }
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();
    if(!materials.has('flow'))materials.set('flow',new THREE.MeshBasicMaterial({map:lavaTexture(),color:0xffffff,side:THREE.DoubleSide,toneMapped:false}));
    const g=new THREE.Group(),mesh=new THREE.Mesh(geo,materials.get('flow'));mesh.castShadow=false;mesh.receiveShadow=false;g.add(mesh);g.name='flowing_lava';
    g.userData.flow={s:zone.s,x:zone.x,halfWidth,halfLength,pathX};g.userData.theme=themeId;return g;
  }
  function backdrop() {
    const g=new THREE.Group(),random=rng(themeId+'sky');g.name=themeId+'_backdrop';
    if(lunar){
      const positions=[];for(let i=0;i<1600;i++){const a=random()*Math.PI*2,b=random()*.79+.08,r=1350;positions.push(Math.cos(a)*Math.cos(b)*r,Math.sin(b)*r,Math.sin(a)*Math.cos(b)*r);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      const stars=new THREE.Points(geo,new THREE.PointsMaterial({color:0xcbeaff,size:2.8,sizeAttenuation:true,fog:false,toneMapped:false}));stars.frustumCulled=false;g.add(stars);
      const earth=new THREE.Group();earth.position.set(-760,530,-670);earth.rotation.set(.2,.2,-.24);
      earth.add(new THREE.Mesh(cache('earth',()=>new THREE.SphereGeometry(170,32,20)),new THREE.MeshBasicMaterial({color:0x1c83d2,fog:false,toneMapped:false})));
      const patches=[];
      for(const [lon,lat,width,length] of [[-.25,.48,.44,.31],[.34,.52,.40,.29],[.44,.16,.25,.49],[-.3,-.28,.2,.45],[-.76,.26,.22,.31],[1.1,-.39,.23,.17]]){
        const x=Math.sin(lon)*Math.cos(lat)*172,y=Math.sin(lat)*172,z=Math.cos(lon)*Math.cos(lat)*172,q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(x,y,z).normalize()),e=new THREE.Euler().setFromQuaternion(q);
        patches.push(oval('soil',[x,y,z],[width*135,length*135,4],[e.x,e.y,e.z]));
      }
      const lands=staticGroup(patches,'earth_continents');lands.traverse(m=>{if(m.isMesh){m.material=new THREE.MeshBasicMaterial({color:0x64b882,fog:false,toneMapped:false});m.castShadow=false;m.receiveShadow=false;}});earth.add(lands);
      const atmosphere=new THREE.Mesh(cache('atmosphere',()=>new THREE.SphereGeometry(179,24,16)),new THREE.MeshBasicMaterial({color:0x71dfff,transparent:true,opacity:.11,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false}));earth.add(atmosphere);g.add(earth);g.userData.planet=earth;
    }else{
      const sun=new THREE.Mesh(cache('hellsun',()=>new THREE.SphereGeometry(92,20,14)),new THREE.MeshBasicMaterial({color:0xff5427,fog:false,toneMapped:false}));sun.position.set(-720,440,-660);g.add(sun);
      const ring=new THREE.Mesh(cache('hellhalo',()=>new THREE.TorusGeometry(114,9,5,40)),new THREE.MeshBasicMaterial({color:0xff802d,fog:false,transparent:true,opacity:.22,depthWrite:false,toneMapped:false}));ring.position.copy(sun.position);g.add(ring);
      const ps=[];for(let i=0;i<220;i++)ps.push((random()-.5)*530,35+random()*320,-120-random()*530);
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));const embers=new THREE.Points(geo,new THREE.PointsMaterial({color:0xffad47,size:.85,transparent:true,opacity:.62,depthWrite:false,fog:true,toneMapped:false}));embers.frustumCulled=false;g.add(embers);g.userData.embers=embers;
    }
    return g;
  }
  function updateBackdrop(group,time,anchor) {
    if(group&&anchor)group.position.set(anchor.x,anchor.y,anchor.z);
    if(flowTexture)flowTexture.offset.y=-time*.28;
    if(group?.userData.embers){group.userData.embers.position.y=(time*4)%120;group.userData.embers.rotation.y=Math.sin(time*.04)*.06;}
    if(group?.userData.planet)group.userData.planet.rotation.y=.2+time*.006;
  }
  return {house,tree,mountain,backdrop,updateBackdrop,lavaFlow};
}
