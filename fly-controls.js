import * as THREE from 'three';

export class FlyControls {
  constructor(camera,canvas,onChange,onLook,canDragLook=()=>true){
    this.camera=camera;this.canvas=canvas;this.enabled=true;this.looking=false;this.speed=8;this.keys=new Set();this.onChange=onChange;this.onLook=onLook;
    this.euler=new THREE.Euler(0,0,0,'YXZ');this.direction=new THREE.Vector3();this.step=new THREE.Vector3();
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{if(!this.enabled)return;canvas.focus({preventScroll:true});if(e.button===0&&canDragLook()){this.leftCandidate={x:e.clientX,y:e.clientY};return;}if(e.button!==2)return;e.preventDefault();this.sync();this.lookButton=2;this.looking=true;onLook(true);const request=canvas.requestPointerLock?.();request?.catch?.(()=>{});});
    document.addEventListener('pointerup',e=>{if(e.button===0)this.leftCandidate=null;if(e.button===this.lookButton)this.stopLook();});
    document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&this.looking)this.stopLook();});
    document.addEventListener('mousemove',e=>{if(!this.enabled)return;if(this.leftCandidate&&!this.looking&&(e.buttons&1)&&Math.hypot(e.clientX-this.leftCandidate.x,e.clientY-this.leftCandidate.y)>3){this.sync();this.lookButton=0;this.looking=true;onLook(true);}if(!this.looking)return;this.euler.y-=e.movementX*.002;this.euler.x=THREE.MathUtils.clamp(this.euler.x-e.movementY*.002,-Math.PI*.495,Math.PI*.495);camera.quaternion.setFromEuler(this.euler);onChange();});
    document.addEventListener('keydown',e=>{
      if(!this.enabled||(!this.looking&&document.activeElement!==canvas)||e.metaKey||e.target.matches('input,textarea,select'))return;
      if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();this.keys.add(e.code);}
      if(e.code==='Escape')this.stopLook();
    },true);
    document.addEventListener('keyup',e=>this.keys.delete(e.code),true);
    window.addEventListener('blur',()=>{this.keys.clear();this.stopLook();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.keys.clear();this.stopLook();}});
    canvas.addEventListener('wheel',e=>{if(!this.enabled||!this.looking)return;e.preventDefault();this.speed=THREE.MathUtils.clamp(this.speed*Math.exp(-e.deltaY*.001),.1,150);document.getElementById('fly-speed').value=this.speed.toFixed(1);},{passive:false});
  }
  sync(){this.euler.setFromQuaternion(this.camera.quaternion,'YXZ');}
  stopLook(){if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.looking=false;this.leftCandidate=null;this.lookButton=null;this.onLook(false);}
  setEnabled(enabled){this.enabled=enabled;this.keys.clear();this.stopLook();this.sync();}
  update(dt){
    if(!this.enabled||!this.keys.size)return false;
    const key=k=>this.keys.has(k)?1:0;
    this.direction.set(key('KeyD')-key('KeyA'),0,key('KeyS')-key('KeyW'));
    if(this.direction.lengthSq())this.direction.normalize().applyQuaternion(this.camera.quaternion);
    this.direction.y+=key('KeyE')+key('Space')-key('KeyQ')-Math.max(key('ControlLeft'),key('ControlRight'));
    if(!this.direction.lengthSq())return false;
    this.direction.normalize();const boost=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?4:1;
    this.camera.position.addScaledVector(this.direction,Math.min(dt,.05)*this.speed*boost);this.onChange();return true;
  }
}
