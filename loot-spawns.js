import * as THREE from 'three';
import {toView} from './core.js';

export function validateLootData(value){
  if(value?.version!==1||!value.monuments||typeof value.monuments!=='object'||Array.isArray(value.monuments))throw new Error('Invalid bundled loot spawn data.');
  const monuments=Object.create(null);let total=0;
  for(const [key,entry] of Object.entries(value.monuments)){
    if(!Array.isArray(entry?.markers))throw new Error('Missing loot marker list.');
    const id=key.replaceAll('\\','/').split('/').pop().replace(/\.prefab$/i,'').toLowerCase();
    if(!/^[a-z0-9_-]+$/.test(id))throw new Error('Invalid monument key.');
    const markers=entry.markers.map(m=>{
      if(++total>25000)throw new Error('Too many loot markers.');
      if(!m.position||!['x','y','z'].every(a=>Number.isFinite(m.position[a])))throw new Error('Loot position must contain finite x/y/z coordinates.');
      const radius=m.radius??1,height=m.height??1.5;
      if(!Number.isFinite(radius)||radius<=0||radius>500||!Number.isFinite(height)||height<=0||height>100)throw new Error('Invalid loot marker size.');
      return {name:String(m.name??'Loot spawn').slice(0,200),kind:['barrel','crate','mixed'].includes(m.kind)?m.kind:'crate',source:String(m.source??'import'),position:{x:m.position.x,y:m.position.y,z:m.position.z},radius,height};
    });
    monuments[id]={status:entry.status==='bundled-server-prefab'?'bundled-server-prefab':'unavailable',markers};
  }
  return {version:1,monuments};
}

export function findLootConflicts(spawns,trailers,markers){
  const results=[];
  spawns.forEach((p,index)=>{
    const e=p['Local rotation'],q=new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x*Math.PI/180,e.y*Math.PI/180,e.z*Math.PI/180,'YXZ'));q.set(-q.x,-q.y,q.z,q.w);
    const inverse=new THREE.Matrix4().compose(new THREE.Vector3(...toView(p['Local position'])),q,new THREE.Vector3(1,1,1)).invert();
    for(const marker of markers){
      const pos=new THREE.Vector3(...toView(marker.position)),r=marker.radius,h=marker.height??1.5;
      const area=new THREE.Box3(pos.clone().add(new THREE.Vector3(-r,0,-r)),pos.clone().add(new THREE.Vector3(r,h,r))).applyMatrix4(inverse);
      const models=trailers.filter(t=>t.visualBoundsThree&&area.intersectsBox(new THREE.Box3(new THREE.Vector3(...t.visualBoundsThree[0]),new THREE.Vector3(...t.visualBoundsThree[1]))));
      if(models.length)results.push({index,marker,models:models.map(t=>t.id)});
    }
  });
  return results;
}
