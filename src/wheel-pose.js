// Collision is spherical. Its unconstrained tumble must never tip the visible wheel flat.
export function updateWheelPose(THREE,g,dt,paused=false){
 const p=g.body.position,v=g.body.velocity;
 const slope=(g.roadHeading||0),targetYaw=-Math.atan(slope)-(g.turnAngle||0);
 if(g.wheelHeading===undefined)g.wheelHeading=targetYaw;
 if(!paused&&g.dead<=0&&g.finishTime===null){
  g.wheelHeading+=(targetYaw-g.wheelHeading)*(1-Math.exp(-dt*6));
  const last=g.wheelLastPosition;
  if(last){const dx=p.x-last.x,dz=p.z-last.z,dy=p.y-last.y;
   if(Math.hypot(dx,dy,dz)<8){const advance=dx*(-Math.sin(g.wheelHeading))+dz*(-Math.cos(g.wheelHeading));g.wheelSpin=(g.wheelSpin||0)-advance/1.05;}
  }
 }
 g.wheelLastPosition={x:p.x,y:p.y,z:p.z};
 const speed=Math.hypot(v.x,v.y,v.z),amplitude=Math.min(.17,speed/45*.17);
 const wobble=Math.sin((g.motionTime||0)*(3.3+speed*.07)+g.id*.7)*amplitude;
 const lean=Math.max(-Math.PI/12,Math.min(Math.PI/12,wobble-(g.turnAngle||0)*.36));
 g.wheelLean=lean;
 const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),g.wheelHeading);
 const tilt=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),lean);
 const roll=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),g.wheelSpin||0);
 g.visual.roll.quaternion.copy(yaw).multiply(tilt).multiply(roll);
}
