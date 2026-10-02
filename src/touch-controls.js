export function suppressControlGestures(buttons){
 for(const button of buttons)for(const type of ['contextmenu','selectstart','dragstart']){
  button.addEventListener(type,event=>event.preventDefault());
 }
}

export function bindTouchControls(bindings,onChange,releaseTarget=globalThis){
 const pointers=new Map();
 function update(){
  let steering=0,drive=0;
  for(const binding of pointers.values()){steering+=binding.steering||0;drive=Math.max(drive,binding.drive||0);}
  for(const binding of bindings)binding.button.classList.toggle('pressed',[...pointers.values()].includes(binding));
  onChange({steering:Math.max(-1,Math.min(1,steering)),drive});
 }
 function release(event,binding){
  const active=pointers.get(event.pointerId);
  if(!active||(binding&&active!==binding))return;
  pointers.delete(event.pointerId);
  update();
 }
 for(const binding of bindings){
  const button=binding.button;
  button.addEventListener('pointerdown',event=>{
   if(event.button>0)return;
   event.preventDefault();
   pointers.set(event.pointerId,binding);
   try{button.setPointerCapture(event.pointerId);}catch{}
   update();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>release(event,binding));
 }
 for(const type of ['pointerup','pointercancel'])releaseTarget.addEventListener?.(type,event=>release(event));
 suppressControlGestures(bindings.map(binding=>binding.button));
 return {reset(){
  const held=[...pointers];
  pointers.clear();
  update();
  for(const [id,binding] of held)if(binding.button.hasPointerCapture?.(id))binding.button.releasePointerCapture(id);
 }};
}
