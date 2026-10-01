/** V6 show assets. Airborne trick rig replaces the curled wheel presentation. */
export function createShowAssets(THREE) {
  const geometries=new Map(),materials=new Map(),templates=new Map();
  const cached=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);};
  const ball=()=>cached('ball',()=>new THREE.SphereGeometry(1,9,6));
  const cube=()=>cached('cube',()=>new THREE.BoxGeometry(1,1,1));
  const cone=()=>cached('cone',()=>new THREE.ConeGeometry(1,1,7));
  const cylinder=()=>cached('cylinder',()=>new THREE.CylinderGeometry(1,1,1,8));
  function mat(name,color){const key=`${name}_${color}`;if(!materials.has(key)){const m=new THREE.MeshStandardMaterial({color,roughness:.86,flatShading:true});m.name=name;materials.set(key,m);}return materials.get(key);}
  const fur=mat('yeti_fur',0xf2f1e8),furShadow=mat('fur_shadow',0xd1d9d6),face=mat('yeti_face',0xa8b8be),black=mat('black',0x1b2429),teeth=mat('teeth',0xfceac4),red=mat('angry_eyes',0xf03229);
  red.emissive.setHex(0xae110a);red.emissiveIntensity=.5;
  const steel=mat('trap_steel',0xadb8b7),darkSteel=mat('dark_steel',0x414c51),wood=mat('stand_wood',0xa97749),woodDark=mat('stand_dark',0x62472f),pants=mat('crowd_pants',0x384b61);
  const bright=[0xf7ce4c,0xe97858,0x6fbacd,0x9ba75e,0xb795ca,0xf0eee0].map((c,i)=>mat(`shirt_${i}`,c));
  const skins=[0xe3b796,0xca9271,0x997053].map((c,i)=>mat(`skin_${i}`,c));
  const part=(geometry,material,position,scale,rotation=[0,0,0])=>({geometry,material,position,scale,rotation});
  const oval=(m,p,s,r)=>part(ball(),m,p,s,r),box=(m,p,s,r)=>part(cube(),m,p,s,r),tip=(m,p,s,r)=>part(cone(),m,p,s,r);
  function segment(m,a,b,r){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize()),e=new THREE.Euler().setFromQuaternion(q);return part(cylinder(),m,av.add(bv).multiplyScalar(.5).toArray(),[r,d.length(),r],[e.x,e.y,e.z]);}
  function merged(parts){const positions=[],normals=[],v=new THREE.Vector3(),n=new THREE.Vector3(),matrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3(),q=new THREE.Quaternion();for(const p of parts){q.setFromEuler(new THREE.Euler(...p.rotation));matrix.compose(new THREE.Vector3(...p.position),q,new THREE.Vector3(...p.scale));normalMatrix.getNormalMatrix(matrix);const pos=p.geometry.getAttribute('position'),nor=p.geometry.getAttribute('normal'),ix=p.geometry.index;for(let j=0,count=ix?ix.count:pos.count;j<count;j++){const i=ix?ix.getX(j):j;v.fromBufferAttribute(pos,i).applyMatrix4(matrix);n.fromBufferAttribute(nor,i).applyMatrix3(normalMatrix).normalize();positions.push(v.x,v.y,v.z);normals.push(n.x,n.y,n.z);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.computeBoundingBox();g.computeBoundingSphere();return g;}
  function staticGroup(parts,name){const group=new THREE.Group();group.name=name;const byMaterial=new Map();for(const p of parts){if(!byMaterial.has(p.material))byMaterial.set(p.material,[]);byMaterial.get(p.material).push(p);}for(const [m,items]of byMaterial){const mesh=new THREE.Mesh(merged(items),m);mesh.name=`${name}_${m.name}`;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}return group;}
  const clone=(key,make)=>{if(!templates.has(key))templates.set(key,make());return templates.get(key).clone(true);};

  function makeYeti(){
    const root=new THREE.Group();root.name='furious_running_yeti';
    const p=[oval(fur,[0,2.76,0],[1.30,1.17,.84]),oval(furShadow,[0,2.60,.72],[.88,.80,.17]),oval(fur,[0,4.10,.23],[1.01,.86,.79]),oval(face,[0,3.96,.91],[.72,.58,.23]),oval(fur,[0,4.23,.66],[.94,.40,.39]),oval(black,[0,3.98,1.12],[.24,.17,.10]),oval(black,[0,3.68,1.095],[.50,.30,.15]),oval(face,[0,3.46,1.0],[.53,.15,.24])];
    for(const side of[-1,1]){
      p.push(oval(fur,[side*.85,4.52,.22],[.25,.31,.30]),oval(black,[side*.34,4.22,1.005],[.20,.145,.064]),oval(red,[side*.34,4.22,1.067],[.125,.073,.030]),box(furShadow,[side*.36,4.395,1.0],[.53,.13,.13],[0,0,side*.34]));
      for(let i=0;i<3;i++)p.push(tip(fur,[side*(.65+i*.22),3.32-i*.12,.48],[.14,.45,.14],[0,0,Math.PI+side*.4]));
    }
    for(const x of[-.37,-.13,.13,.37])p.push(tip(teeth,[x,3.77,1.214],[.08,.24,.055],[0,0,Math.PI]));
    for(const x of[-.30,.30])p.push(tip(teeth,[x,3.535,1.20],[.08,.19,.06]));
    for(let i=0;i<6;i++)p.push(tip(fur,[(i-2.5)*.22,4.82,.06],[.15,.42,.17],[0,0,(i-2.5)*-.10]));
    const torso=staticGroup(p,'yeti_torso');root.add(torso);
    for(const side of[-1,1]){
      const leg=staticGroup([oval(fur,[0,-.46,0],[.43,.74,.48]),oval(furShadow,[0,-1.25,.12],[.49,.30,.66]),oval(fur,[0,-1.27,.26],[.48,.25,.61]),...[-.24,0,.24].map(x=>tip(darkSteel,[x,-1.38,.83],[.085,.35,.085],[Math.PI/2,0,0]))],`yeti_leg_${side}`);leg.position.set(side*.59,1.56,0);root.add(leg);
      const arm=staticGroup([oval(fur,[0,-.72,0],[.45,.83,.44]),oval(fur,[0,-1.60,.06],[.50,.49,.49]),...[-.27,0,.27].map(x=>oval(furShadow,[x,-1.82,.24],[.125,.25,.15])),...[-.27,0,.27].map(x=>tip(darkSteel,[x,-2.025,.22],[.07,.25,.07],[0,0,Math.PI]))],`yeti_arm_${side}`);arm.position.set(side*1.32,3.43,.07);arm.rotation.z=side*.16;root.add(arm);
    }
    root.userData.forward=[0,0,1];return root;
  }
  function yeti(){const g=clone('yeti',makeYeti);g.userData.legs=[-1,1].map(s=>g.getObjectByName(`yeti_leg_${s}`));g.userData.arms=[-1,1].map(s=>g.getObjectByName(`yeti_arm_${s}`));g.userData.torso=g.getObjectByName('yeti_torso');return g;}
  function animateYeti(g,time){g.userData.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(time*9+i*Math.PI)*.60);g.userData.arms.forEach((arm,i)=>{arm.rotation.x=-Math.sin(time*9+i*Math.PI)*.78;arm.rotation.z=(i?1:-1)*(.18+.08*Math.sin(time*4));});g.userData.torso.position.y=Math.abs(Math.sin(time*9))*.09;}

  function makeTrap(){
    const root=new THREE.Group();root.name='vicious_bear_trap';
    const p=[box(darkSteel,[0,.10,0],[3.5,.20,.45]),box(darkSteel,[0,.085,0],[.38,.17,2.60]),part(cylinder(),steel,[0,.16,0],[.48,.12,.48]),part(cylinder(),red,[0,.245,0],[.33,.025,.33])];
    const coil=cached('trap_coil',()=>{const points=[];for(let i=0;i<=120;i++){const t=i/120,a=t*Math.PI*18;points.push(new THREE.Vector3((t-.5)*.75,Math.cos(a)*.16,Math.sin(a)*.16));}return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),120,.052,5,false);});
    for(const side of[-1,1]){p.push(part(coil,steel,[side*1.60,.29,0],[1,1,1]),box(darkSteel,[side*1.54,.17,0],[.42,.34,.64]),part(cylinder(),black,[side*1.43,.27,0],[.105,.38,.105],[0,0,Math.PI/2]));}
    root.add(staticGroup(p,'trap_springs'));
    for(const side of[-1,1]){
      const jaw=[];const start=side===1?0:Math.PI;
      for(let i=0;i<14;i++){const a=start+i/14*Math.PI,b=start+(i+1)/14*Math.PI;jaw.push(segment(steel,[Math.cos(a)*1.38,0,Math.sin(a)*1.38],[Math.cos(b)*1.38,0,Math.sin(b)*1.38],.13));}
      for(let i=1;i<14;i++){const a=start+i/14*Math.PI;jaw.push(tip(steel,[Math.cos(a)*1.25,.24,Math.sin(a)*1.25],[.115,.49,.115]));jaw.push(tip(darkSteel,[Math.cos(a)*1.42,.115,Math.sin(a)*1.42],[.06,.24,.06]));}
      const group=staticGroup(jaw,`trap_jaw_${side}`);group.position.y=.22;group.userData.side=side;root.add(group);
    }
    return root;
  }
  function trap(){const g=clone('trap',makeTrap);g.userData.jaws=[-1,1].map(s=>g.getObjectByName(`trap_jaw_${s}`));g.userData.animateJaw=true;g.userData.closed=false;g.userData.closeAmount=0;return g;}
  function animateTrap(g,time,closed=g.userData.closed){g.userData.closed=Boolean(closed);const amount=closed?1:0;g.userData.closeAmount=amount;g.userData.jaws.forEach(jaw=>jaw.rotation.x=-jaw.userData.side*(amount*1.32+(g.userData.animateJaw&&!closed?Math.sin(time*3)*.035:0)));}

  function pennant(){return cached('pennant',()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.43,0,.02,.43,0,.02,0,-.70,.02,.43,0,-.02,-.43,0,-.02,0,-.70,-.02],3));g.computeVertexNormals();return g;});}
  function standStatic(){
    const p=[box(woodDark,[0,.18,0],[28,.36,8.5])];
    for(let row=0;row<3;row++){
      const y=1+row*1.65,z=2.6-row*2.6;p.push(box(wood,[0,y/2,z],[27.4,y,2.5]),box(darkSteel,[0,y+.11,z+1.17],[27.8,.18,.16]));
      for(let b=0;b<6;b++)p.push(box(bright[(b+row)%bright.length],[(b-2.5)*4.5,y-.40,z+1.30],[4.46,.61,.055]));
      for(let col=0;col<12;col++){
        const x=(col-5.5)*2,y0=y,z0=z-.10,shirt=bright[(col+row*3)%6];
        p.push(box(woodDark,[x,y0+.32,z0],[.70,.14,.54]),oval(shirt,[x,y0+.87,z0],[.25,.40,.18]),box(pants,[x-.10,y0+.40,z0+.14],[.17,.64,.20]),box(pants,[x+.10,y0+.40,z0+.14],[.17,.64,.20]),box(black,[x-.10,y0+.08,z0+.25],[.20,.16,.35]),box(black,[x+.10,y0+.08,z0+.25],[.20,.16,.35]));
      }
    }
    for(const x of[-13.2,13.2]){p.push(box(darkSteel,[x,3.9,-3.90],[.16,7.8,.16]),box(bright[0],[x,7.55,-3.90],[.35,.45,.25]));for(const z of[-3.8,3.8])p.push(box(darkSteel,[x,2.35,z],[.20,4.7,.20]));}
    p.push(box(bright[1],[0,7.27,-3.9],[26.4,.66,.15]),box(bright[0],[0,7.60,-3.9],[26.5,.08,.19]),box(bright[2],[0,6.94,-3.9],[26.5,.08,.19]));
    for(let i=0;i<26;i++)p.push(part(pennant(),bright[i%6],[(i-12.5)*.93,6.88,-3.80],[1,1,1]));
    for(const side of[-1,1])p.push(box(bright[2],[side*12.8,5.0,0],[.20,.16,8]),segment(darkSteel,[side*12.8,.2,3.8],[side*12.8,4.7,-3.8],.09));
    const g=staticGroup(p,'grandstand_structure');g.userData={width:28,depth:8.5,forward:[0,0,1],audienceCount:36};return g;
  }
  function stands(){
    // One stand unit: owner places two units at x +/-28, z -18 at the finish.
    const g=clone('stand',standStatic),spectators=[],armBatches=bright.map((m,i)=>{const mesh=new THREE.InstancedMesh(cylinder(),m,12);mesh.name=`crowd_arm_batch_${i}`;mesh.castShadow=true;mesh.frustumCulled=false;g.add(mesh);return{mesh,next:0};}),skinBatches=skins.map((m,i)=>{const mesh=new THREE.InstancedMesh(ball(),m,36);mesh.name=`crowd_skin_batch_${i}`;mesh.castShadow=true;mesh.frustumCulled=false;g.add(mesh);return{mesh,next:0};});
    for(let row=0;row<3;row++)for(let col=0;col<12;col++){
      const x=(col-5.5)*2,y=1+row*1.65,z=2.6-row*2.6-.10,shirt=(col+row*3)%6,skin=(col+row)%3;
      const head=new THREE.Object3D();head.position.set(x,y+1.42,z+.005);head.scale.set(.21,.25,.20);
      const arms=[-1,1].map(side=>{const arm=new THREE.Object3D();arm.position.set(x+side*.27,y+1.12,z);arm.userData.side=side;return arm;});
      const aBatch=armBatches[shirt],sBatch=skinBatches[skin];
      spectators.push({head,arms,phase:(row*12+col)*1.71,baseHeadY:head.position.y,armBatch:aBatch.mesh,armIndices:[aBatch.next++,aBatch.next++],skinBatch:sBatch.mesh,skinIndices:[sBatch.next++,sBatch.next++,sBatch.next++]});
    }
    g.userData.spectators=spectators;g.userData.armBatches=armBatches.map(b=>b.mesh);g.userData.skinBatches=skinBatches.map(b=>b.mesh);animateStand(g,0,false);return g;
  }
  function animateStand(g,time,celebrating=false){
    const q=new THREE.Quaternion(),scale=new THREE.Vector3(),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),offset=new THREE.Vector3();
    for(const s of g.userData.spectators){s.head.position.y=s.baseHeadY+(celebrating?Math.abs(Math.sin(time*6+s.phase))*.12:Math.sin(time*1.7+s.phase)*.025);s.head.rotation.z=Math.sin(time*3+s.phase)*(celebrating?.16:.045);s.head.updateMatrix();s.skinBatch.setMatrixAt(s.skinIndices[0],s.head.matrix);
      s.arms.forEach((arm,i)=>{const side=arm.userData.side;arm.rotation.z=side*(celebrating?2.35+Math.sin(time*8+s.phase+i)*.27:.20+Math.sin(time*2+s.phase+i)*.12);arm.rotation.x=celebrating?-.30+Math.sin(time*5+s.phase)*.18:-.10;arm.updateMatrix();q.copy(arm.quaternion);offset.set(0,-.30,0).applyQuaternion(q);position.copy(arm.position).add(offset);scale.set(.09,.60,.09);matrix.compose(position,q,scale);s.armBatch.setMatrixAt(s.armIndices[i],matrix);offset.set(0,-.65,0).applyQuaternion(q);position.copy(arm.position).add(offset);scale.set(.095,.115,.095);matrix.compose(position,q,scale);s.skinBatch.setMatrixAt(s.skinIndices[i+1],matrix);});
    }
    for(const b of[...g.userData.armBatches,...g.userData.skinBatches])b.instanceMatrix.needsUpdate=true;
  }

  function trickRig(def={}){
    const species=def.species||'goat',furColor=def.furColor??0xf1e9d4,coat=mat(`trick_fur_${species}`,furColor),hoof=mat('trick_hoof',0x493d31),horn=mat('trick_horn',0xc8ae7c),eyes=mat('trick_eyes',0xfff4db),accent=mat('trick_scarf',def.color??0xffce55),g=new THREE.Group();g.name=`trick_${species}`;
    const p=[oval(coat,[0,0,0],[.59,.48,.85]),oval(coat,[0,.26,-.82],[.44,.46,.42]),oval(accent,[0,.13,-.52],[.54,.095,.45]),box(accent,[.35,-.06,-.33],[.16,.40,.08],[.2,0,-.2])];
    const broad=species==='cow'||species==='moose',muzzle=mat('trick_muzzle',broad?0xba9677:0xa58c6d);p.push(oval(muzzle,[0,.08,-1.13],[broad?.37:.23,.22,.29]),oval(black,[0,.10,-1.39],[broad?.23:.12,.075,.06]));
    for(const side of[-1,1]){
      p.push(oval(coat,[side*.47,.37,-.76],[.21,.11,.20],[0,0,side*.24]),oval(eyes,[side*.29,.33,-1.11],[.13,.135,.068]),oval(black,[side*.29,.32,-1.166],[.065,.082,.035]),box(coat,[side*.31,.47,-1.12],[.25,.055,.09],[0,0,-side*.20]));
      if(species==='goat'){const points=[[side*.25,.58,-.76],[side*.33,.93,-.65],[side*.33,1.15,-.43],[side*.28,1.08,-.20]];for(let i=0;i<3;i++)p.push(segment(horn,points[i],points[i+1],.075-i*.018));}
      else if(species==='cow'){p.push(segment(horn,[side*.35,.49,-.77],[side*.64,.69,-.75],.075),tip(horn,[side*.67,.75,-.75],[.05,.22,.05],[0,0,-side*.6]));p.push(oval(black,[side*.54,.04,.05],[.09,.30,.37]),oval(black,[side*.16,.42,.22],[.24,.06,.26]));}
      else if(species==='deer'){const points=[[side*.22,.60,-.74],[side*.39,.91,-.72],[side*.55,1.24,-.62],[side*.64,1.45,-.48]];for(let i=0;i<3;i++)p.push(segment(horn,points[i],points[i+1],.052-i*.012));for(let i=0;i<3;i++)p.push(segment(horn,points[i+1],[side*(.63+i*.10),1.00+i*.23,-.95],.030));}
      else {p.push(segment(horn,[side*.26,.55,-.74],[side*.57,.89,-.72],.085),oval(horn,[side*.69,.96,-.70],[.38,.25,.11],[.06,0,-side*.35]));for(let i=0;i<4;i++)p.push(tip(horn,[side*(.49+i*.13),1.17+(i%2)*.07,-.69],[.05,.30,.05],[0,0,-side*.27]));}
    }
    if(species==='goat')p.push(tip(coat,[0,-.19,-1.02],[.13,.36,.14],[0,0,Math.PI]));
    g.add(staticGroup(p,'trick_body_head'));
    const legs=[];
    for(const front of[-1,1])for(const side of[-1,1]){
      const leg=clone(`trick_leg_${species}_${furColor}`,()=>staticGroup([oval(coat,[0,-.35,0],[.15,.38,.16]),oval(coat,[0,-.86,.075],[.125,.28,.13]),box(hoof,[0,-1.18,.16],[.29,.25,.34])],'airborne_leg'));leg.name=`trick_leg_${front}_${side}`;leg.position.set(side*.43,-.15,front*.57);leg.userData={side,front};g.add(leg);legs.push(leg);
    }
    const bum=staticGroup([oval(coat,[-.28,0,0],[.34,.40,.32]),oval(coat,[.28,0,0],[.34,.40,.32]),oval(muzzle,[0,.03,.28],[.085,.085,.035])],'trick_bum');bum.position.set(0,.01,.82);g.add(bum);
    const tailParts=[];
    if(species==='cow'){tailParts.push(segment(coat,[0,0,0],[0,.34,.34],.063),segment(coat,[0,.34,.34],[0,.24,.82],.054),oval(hoof,[0,.22,.93],[.105,.17,.18]));}
    else if(species==='deer')tailParts.push(oval(coat,[0,.14,.19],[.15,.23,.30],[-.4,0,0]));
    else tailParts.push(oval(coat,[0,.10,.17],[.15,.20,species==='moose'?.19:.28],[-.25,0,0]));
    const tail=staticGroup(tailParts,'trick_tail');tail.position.set(0,.08,.20);bum.add(tail);g.visible=false;g.userData={legs,tail,bum,axle:[1,0,0],species,replaceWheelBody:true,presentation:'airborne-animal',minimumAirTime:.55};return g;
  }
  function animateTrick(g,time,variant=0){
    g.visible=true;const t=Math.max(0,time),style=((Math.floor(variant)%5)+5)%5,speed=7+style*.9,wave=Math.sin(t*speed);
    for(const leg of g.userData.legs){const {side,front}=leg.userData;leg.rotation.z=side*(1.23+Math.sin(t*speed+front)*.32);leg.rotation.x=front*(.56+Math.sin(t*(speed*.73)+side)*.44);leg.rotation.y=side*front*Math.sin(t*speed)*.30;if(style===3){leg.rotation.x=front*(.60+Math.sin(t*10+side*Math.PI)*.95);leg.rotation.z=side*(1.12+Math.cos(t*8+front)*.28);}}
    const bum=g.userData.bum;bum.rotation.y=Math.sin(t*(speed+3))*.78;bum.rotation.x=Math.sin(t*speed)*.36;bum.rotation.z=Math.sin(t*(speed*.8))*.37;bum.position.x=Math.sin(t*(speed+3))*.15;bum.scale.set(1+Math.sin(t*(speed+3))*.25,1+Math.cos(t*speed)*.10,1);
    g.userData.tail.rotation.x=Math.sin(t*(speed+4))*.95;g.userData.tail.rotation.y=Math.cos(t*(speed+2))*.75;
    g.position.y=Math.sin(t*8)*.14;
    if(style===0)g.rotation.set(.23*Math.sin(t*4),.45*Math.sin(t*5),.38*Math.sin(t*6));
    else if(style===1)g.rotation.set(t*5.5,.25*Math.sin(t*3),.33*Math.sin(t*7));
    else if(style===2)g.rotation.set(t*3.5,t*4,.25*Math.sin(t*6));
    else if(style===3)g.rotation.set(.25*Math.sin(t*6),.65*Math.sin(t*4),.55*Math.sin(t*5));
    else g.rotation.set(-.30+.22*wave,Math.sin(t*7)*.80,Math.sin(t*9)*.47);
  }
  return{yeti,trap,stands,trickRig,animateYeti,animateTrap,animateStand,animateTrick};
}
