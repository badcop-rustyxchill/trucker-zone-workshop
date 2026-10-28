import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {greyPreview} from './grey-preview.js';
import {FlyControls} from './fly-controls.js';
import {terrainColour,terrainMaterial} from './terrain-material.js';
import {validateLootData,findLootConflicts} from './loot-spawns.js';
import {clone,round,vector,toView,fromView,arrayKey,settingsKey,settings,points,validateConfig,exportConfig,newPoint,sampleTerrain} from './core.js';

const $ = id => document.getElementById(id);
const STORAGE='trucker-zone-workshop-v1';
const state={catalog:[],trailers:[],config:null,monument:null,tab:'spawns',index:-1,placing:false,mode:'translate',top:false,ready:false,undo:[],redo:[],documentName:'TruckerEvent.json'};
let renderer,scene,camera,orbit,gizmo,proxy,modelRoot,terrainRoot,zoneRoot,trailerRoot,grid,fly;
let fineAdjust=false;
let navigation='fly',lastHover=0,lootRoot,lootData={monuments:{}};
const activeLoot=()=>lootData.monuments[state.monument?.id];
let nativeTerrain=null,solidMeshes=[],modelToken=0,toastTimer,dragBefore=null,syncing=false,renderNeeded=true;
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const trailerCache=new Map();
const selectedPoint=()=>state.monument ? points(state.config,state.monument,state.tab)[state.index] : null;
const xyz=p=>`${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
const on=(id,event,fn)=>$(id).addEventListener(event,fn);
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function invalidate(){renderNeeded=true;}
function quatFromUnity(p={x:0,y:0,z:0}) {
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...['x','y','z'].map(a=>THREE.MathUtils.degToRad(p[a]??0)),'YXZ'));
  return q.set(-q.x,-q.y,q.z,q.w);
}
function quatToUnity(q){const e=new THREE.Euler().setFromQuaternion(new THREE.Quaternion(-q.x,-q.y,q.z,q.w),'YXZ');return vector({x:THREE.MathUtils.radToDeg(e.x),y:THREE.MathUtils.radToDeg(e.y),z:THREE.MathUtils.radToDeg(e.z)});}
function persist(){
  try{localStorage.setItem(STORAGE,JSON.stringify({config:state.config,monument:state.monument?.id,tab:state.tab,index:state.index,documentName:state.documentName}));$('save-state').textContent='Saved in this browser';}
  catch{$('save-state').textContent='Browser storage unavailable — export to save';}
}
function checkpoint(before){const snapshot=JSON.stringify(before??state.config);if(state.undo.at(-1)!==snapshot)state.undo.push(snapshot);if(state.undo.length>70)state.undo.shift();state.redo=[];}
function edit(fn){checkpoint();fn();persist();refresh();}
function restoreHistory(direction){
  const from=state[direction],to=state[direction==='undo'?'redo':'undo'];if(!from.length)return;
  to.push(JSON.stringify(state.config));state.config=JSON.parse(from.pop());persist();refresh();
}
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function saveConfig(){try{download(exportConfig(state.config),'TruckerEvent.json');toast('Configuration exported.');}catch(e){toast(e.message);}}
function renderLibrary(){
  const q=$('search').value.trim().toLowerCase(),category=$('category').value;
  const visible=state.catalog.filter(m=>(!category||m.category===category)&&`${m.name} ${m.id} ${m.category}`.toLowerCase().includes(q));
  $('monument-count').textContent=visible.length;
  const list=$('monument-list');list.replaceChildren();
  for(const m of visible){
    const button=document.createElement('button');button.className='monument'+(m===state.monument?' active':'');button.setAttribute('role','option');button.setAttribute('aria-selected',String(m===state.monument));
    const icon=document.createElement('span');icon.className='monument-icon';icon.textContent=m.category==='Cave'?'◇':m.isSafeZone?'⌂':'▱';
    const text=document.createElement('span'),name=document.createElement('span'),cat=document.createElement('span');name.className='monument-name';name.textContent=m.name;cat.className='monument-category';cat.textContent=m.category;text.append(name,cat);button.append(icon,text);
    const counts=document.createElement('span');counts.className='monument-counts';
    for(const [tab,label] of [['spawns','Trailer spawns'],['deliveries','Delivery zones']]){const n=points(state.config,m,tab).length,count=document.createElement('span');count.className='count-'+tab;count.textContent=n;count.title=`${n} ${label.toLowerCase()}`;count.setAttribute('aria-label',count.title);counts.append(count);}button.append(counts);
    button.addEventListener('click',()=>selectMonument(m));list.append(button);
  }
  if(!visible.length){const empty=document.createElement('div');empty.className='no-results';empty.textContent='No matching monuments. Try a different name or category.';list.append(empty);}
}
function refresh(){
  if(!state.monument)return;
  const list=points(state.config,state.monument,state.tab);state.index=Math.min(state.index,list.length-1);
  $('tab-spawns').classList.toggle('active',state.tab==='spawns');$('tab-deliveries').classList.toggle('active',state.tab==='deliveries');
  $('spawn-count').textContent=points(state.config,state.monument,'spawns').length;$('delivery-count').textContent=points(state.config,state.monument,'deliveries').length;
  $('point-list-title').textContent=state.tab==='spawns'?'TRAILER SPAWNS':'DELIVERY SPHERES';$('add-point').textContent=state.tab==='spawns'?'+ Add point':'+ Add zone';
  const target=$('point-list');target.replaceChildren();
  list.forEach((p,i)=>{const b=document.createElement('button');b.className=`point-row ${state.tab==='deliveries'?'delivery ':''}${i===state.index?'selected':''}`;const num=document.createElement('span');num.className='point-index';num.textContent=String(i+1).padStart(2,'0');const title=document.createElement('span');title.textContent=state.tab==='spawns'?'Trailer spawn':'Drop-off zone';const pos=document.createElement('span');pos.className='point-pos';pos.textContent=state.tab==='spawns'?`${p['Local rotation'].y.toFixed(0)}°`:`r ${p.Radius.toFixed(1)} m`;b.append(num,title,pos);b.addEventListener('click',()=>{state.index=i;setPlacing(false);refresh();persist();});target.append(b);});
  const p=selectedPoint();$('point-inspector').hidden=!p;$('inspector-empty').hidden=!!p;$('rotation-fields').hidden=state.tab!=='spawns';$('radius-fields').hidden=state.tab!=='deliveries';
  $('selected-title').textContent=`${state.tab==='spawns'?'Spawn':'Delivery zone'} ${String(state.index+1).padStart(2,'0')}`;
  if(!p){$('inspector-empty').querySelector('strong').textContent=list.length?'No selection':(state.tab==='spawns'?'No trailer spawns':'No delivery zones');$('inspector-empty').querySelector('p').textContent=list.length?'Click a trailer or zone, or choose one from the list to edit.':'Add a point, then use Place to position it.';}
  refreshFields();
  const cfg=settings(state.config,state.monument);$('monument-enabled').checked=cfg?.Enabled??false;$('display-name').value=cfg?.['Display name']??'';$('allowed-types').value=(cfg?.['Allowed delivery types']??[]).join(', ');
  $('undo').disabled=!state.undo.length;$('redo').disabled=!state.redo.length;
  $('config-name').textContent=state.documentName;$('config-count').textContent=`${Object.keys(state.config.Monuments).length} configured`;
  renderLibrary();renderZones();syncProxy();updateTrailers();invalidate();
}
function refreshFields(){const p=selectedPoint();if(!p)return;for(const axis of ['x','y','z']){if(document.activeElement!==$('pos-'+axis))$('pos-'+axis).value=round(p['Local position'][axis]);if(state.tab==='spawns'&&document.activeElement!==$('rot-'+axis))$('rot-'+axis).value=round(p['Local rotation'][axis]);}if(state.tab==='deliveries'){$('radius').value=p.Radius;$('radius-slider').value=Math.min(60,p.Radius);$('sphere-size').textContent=`Diameter ${round(p.Radius*2)} m`;}}
function disposeTree(root){if(!root)return;root.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});root.removeFromParent();}
function clearGroup(root){for(const c of [...root.children]){c.removeFromParent();c.traverse(o=>{if(o.userData.ownedGeometry)o.geometry?.dispose();if(o.userData.ownedMaterial)for(const m of (Array.isArray(o.material)?o.material:[o.material]))m?.dispose();});}}
function own(object){object.userData.ownedGeometry=true;object.userData.ownedMaterial=true;return object;}
function initScene(){
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.setClearColor(0x374343);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;$('viewport').prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','3D monument. Right mouse looks around; WASD flies through the scene. Q and E move down and up. Shift moves faster. Use Place to position a point.');renderer.domElement.tabIndex=0;
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x374343,.00075);scene.add(new THREE.HemisphereLight(0xe4e8ed,0x60646b,1.5));const sun=new THREE.DirectionalLight(0xffffff,1.8);sun.position.set(-160,240,100);scene.add(sun);
  camera=new THREE.PerspectiveCamera(48,1,.1,12000);camera.position.set(80,65,85);
  orbit=new OrbitControls(camera,renderer.domElement);orbit.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;orbit.enableDamping=true;orbit.dampingFactor=.12;orbit.maxPolarAngle=Math.PI*.93;orbit.minDistance=.8;orbit.maxDistance=4000;orbit.addEventListener('change',invalidate);orbit.enabled=false;
  fly=new FlyControls(camera,renderer.domElement,invalidate,looking=>{document.body.classList.toggle('mouse-look',looking);if(gizmo){gizmo.enabled=!looking&&!state.placing;gizmo.getHelper().visible=!looking&&!!selectedPoint();}},()=>!state.placing&&!gizmo?.axis&&!gizmo?.dragging);
  proxy=new THREE.Object3D();scene.add(proxy);gizmo=new TransformControls(camera,renderer.domElement);gizmo.setSpace('local');gizmo.setSize(.85);scene.add(gizmo.getHelper());
  gizmo.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value&&navigation==='orbit';fly.setEnabled(!e.value&&navigation==='fly');if(e.value)dragBefore=clone(state.config);else if(dragBefore){if(JSON.stringify(dragBefore)!==JSON.stringify(state.config))checkpoint(dragBefore);dragBefore=null;persist();refresh();}});
  gizmo.addEventListener('objectChange',()=>{if(syncing)return;const p=selectedPoint();if(!p)return;p['Local position']=fromView(proxy.position);if(state.tab==='spawns')p['Local rotation']=quatToUnity(proxy.quaternion);refreshFields();renderZones();updateTrailers();invalidate();});
  terrainRoot=new THREE.Group();zoneRoot=new THREE.Group();trailerRoot=new THREE.Group();lootRoot=new THREE.Group();scene.add(terrainRoot,zoneRoot,trailerRoot,lootRoot);
  grid=new THREE.GridHelper(1500,300,0x728178,0x56645d);grid.material.transparent=true;grid.material.opacity=.22;scene.add(grid);const axes=new THREE.AxesHelper(6);axes.position.set(0,.08,0);scene.add(axes);
  const resize=()=>{const el=$('viewport');renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();invalidate();};new ResizeObserver(resize).observe($('viewport'));resize();
  let down=null;renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(down.x-e.clientX,down.y-e.clientY)>4||e.button!==0||gizmo.dragging||fly.looking)return;if(gizmo.axis&&!state.placing)return;handleViewportClick(e);});
  renderer.domElement.addEventListener('pointermove',e=>{if(!state.ready||!state.placing||fly.looking||gizmo.dragging||performance.now()-lastHover<120)return;lastHover=performance.now();pointerAt(e);const hit=raycaster.intersectObjects(solidMeshes,false)[0];if(hit)$('cursor-coordinates').textContent=xyz(fromView(hit.point))+' m';});
  renderer.domElement.addEventListener('dblclick',e=>{if(selectedPoint()&&!gizmo.axis){setPlacing(true);handleViewportClick(e);}});
  updateSnap();
  let previous=performance.now(),sampleStart=previous,frames=0,lastRendered=0,activeFrames=0,activeMs=0;
  function animate(now){
    requestAnimationFrame(animate);const dt=Math.min(.05,(now-previous)/1000);previous=now;
    const moved=fly.update(dt);if(orbit.enabled)orbit.update();
    if(moved)$('cursor-coordinates').textContent='CAM '+xyz(fromView(camera.position))+' m';
    if(renderNeeded){renderer.render(scene,camera);renderNeeded=false;frames++;if(lastRendered&&now-lastRendered<100){activeMs+=now-lastRendered;activeFrames++;}lastRendered=now;}
    if(now-sampleStart>=1000){
      if(state.ready){const fps=activeFrames>=5?` · ${Math.round(activeFrames*1000/activeMs)} FPS`:'';$('geometry-info').textContent=`${Math.round(state.monument.triangles/1000)}K TRI · ${renderer.info.render.calls} DRAWS${fps}`;}
      sampleStart=now;frames=0;activeFrames=0;activeMs=0;
    }
  }requestAnimationFrame(animate);
}
function pointerAt(e){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
function handleViewportClick(e){
  if(!state.ready)return;pointerAt(e);
  if(state.placing){const hit=raycaster.intersectObjects(solidMeshes,false)[0];if(!hit){toast('Click a monument or terrain surface.');return;}if(!selectedPoint()){addPoint(fromView(hit.point));setPlacing(false);return;}edit(()=>{const p=fromView(hit.point);p.y=round(p.y+(state.tab==='spawns'?activeGroundOffset():0));selectedPoint()['Local position']=p;});setPlacing(false);return;}
  const hit=raycaster.intersectObjects([zoneRoot,trailerRoot],true).find(h=>h.object.userData.pointIndex!==undefined);if(hit){state.tab=hit.object.userData.tab;state.index=hit.object.userData.pointIndex;refresh();persist();}else{state.index=-1;refresh();persist();}
}
function setPlacing(value){state.placing=value;document.body.classList.toggle('placing',value);$('tool-place').classList.toggle('active',value);$('placement-hint').textContent=value?'Click a surface to place the selected point · Esc to cancel':(navigation==='fly'?'Mouse drag look · WASD fly · Q/E down/up · Shift faster':'Drag to orbit · Right-drag to pan · Scroll to zoom');if(gizmo)gizmo.enabled=!value&&!fly?.looking;}
function setMode(mode){state.mode=mode;gizmo.setMode(mode);$('tool-move').classList.toggle('active',mode==='translate');$('tool-rotate').classList.toggle('active',mode==='rotate');setPlacing(false);syncProxy();invalidate();}
function updateSnap(){const enabled=$('snap-enabled').checked||fineAdjust;gizmo?.setTranslationSnap(enabled?(fineAdjust?.01:Number($('snap-step').value)):null);gizmo?.setRotationSnap(enabled?(fineAdjust?Math.PI/180:Math.PI/12):null);}
function syncProxy(){if(!gizmo)return;syncing=true;const p=selectedPoint();if(p){proxy.position.set(...toView(p['Local position']));proxy.quaternion.copy(quatFromUnity(p['Local rotation']));gizmo.attach(proxy);gizmo.enabled=!state.placing&&!fly?.looking;gizmo.visible=true;if(state.tab==='deliveries'&&state.mode==='rotate'){state.mode='translate';gizmo.setMode('translate');$('tool-move').classList.add('active');$('tool-rotate').classList.remove('active');}}else gizmo.detach();$('tool-rotate').disabled=state.tab!=='spawns'||!p;syncing=false;}
function renderZones(){
  if(!zoneRoot)return;clearGroup(zoneRoot);
  for(const tab of ['deliveries','spawns'])points(state.config,state.monument,tab).forEach((p,i)=>{
    const selected=state.tab===tab&&state.index===i,color=tab==='spawns'?0xefb477:0xc9e38c;
    const group=new THREE.Group();group.position.set(...toView(p['Local position']));group.quaternion.copy(quatFromUnity(p['Local rotation']));
    if(tab==='deliveries'){
      const sphere=own(new THREE.Mesh(new THREE.SphereGeometry(p.Radius,32,20),new THREE.MeshBasicMaterial({color,transparent:true,opacity:selected?.13:.085,depthWrite:false,side:THREE.DoubleSide})));sphere.userData.pointIndex=i;sphere.userData.tab=tab;group.add(sphere);
      for(const axis of ['x','y','z']){const ring=own(new THREE.Mesh(new THREE.TorusGeometry(p.Radius,Math.max(.025,p.Radius*.003),4,80),new THREE.MeshBasicMaterial({color,transparent:true,opacity:selected?.95:.65,depthWrite:false})));if(axis==='x')ring.rotation.y=Math.PI/2;if(axis==='y')ring.rotation.x=Math.PI/2;group.add(ring);}
    }
    const pin=own(new THREE.Mesh(new THREE.OctahedronGeometry(selected?.42:.28),new THREE.MeshBasicMaterial({color,depthTest:false})));pin.userData.pointIndex=i;pin.userData.tab=tab;pin.renderOrder=10;group.add(pin);
    if(tab==='spawns'){const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,.1,0),3,color,.7,.4);group.add(arrow);}
    zoneRoot.add(group);
  });invalidate();
}
function buildTerrain(data){
  disposeTree(terrainRoot);terrainRoot=new THREE.Group();scene.add(terrainRoot);nativeTerrain=data;
  if(!data)return;
  const g=new THREE.BufferGeometry(),v=[],c=[],uv=[],indices=[];
  for(let z=0;z<data.height;z++)for(let x=0;x<data.width;x++){
    const i=z*data.width+x,h=data.heights[i],tx=data.origin.x+x/(data.width-1)*data.size.x,tz=data.origin.z+z/(data.height-1)*data.size.z;
    v.push(tx,h,-tz);uv.push(tx/8,tz/8);const base=terrainColour(data,x,z,state.monument?.id);c.push(base.r,base.g,base.b);
  }
  for(let z=0;z<data.height-1;z++)for(let x=0;x<data.width-1;x++){
    const a=z*data.width+x,b=a+1,d=a+data.width,e=d+1;
    if(data.blend&&Math.max(data.blend[a],data.blend[b],data.blend[d],data.blend[e])<.02)continue;
    if(data.alpha&&Math.min(data.alpha[a],data.alpha[b],data.alpha[d],data.alpha[e])<.5)continue;
    indices.push(a,b,d,b,e,d);
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,terrainMaterial());mesh.userData.isTerrain=true;terrainRoot.add(mesh);terrainRoot.visible=$('show-terrain').checked;
}
async function selectMonument(m){
  const token=++modelToken;state.ready=false;state.monument=m;state.index=points(state.config,m,state.tab).length?0:-1;setPlacing(false);gizmo.detach();$('loading').hidden=false;$('loading').querySelector('strong').textContent='Opening '+m.name;$('loading').querySelector('span:last-child').textContent='Loading…';$('monument-title').textContent=m.name;$('monument-category').textContent=m.category.toUpperCase();renderLibrary();
  try{
    const [gltf,terrain]=await Promise.all([loader.loadAsync(m.model),m.terrain?fetch(m.terrain).then(r=>{if(!r.ok)throw new Error('Terrain asset missing');return r.json();}):null]);
    if(token!==modelToken){disposeTree(gltf.scene);return;}
    disposeTree(modelRoot);modelRoot=greyPreview(gltf.scene);scene.add(modelRoot);modelRoot.updateMatrixWorld(true);buildTerrain(terrain);
    solidMeshes=[];modelRoot.traverse(o=>{if(o.isMesh)solidMeshes.push(o);});terrainRoot.traverse(o=>{if(o.isMesh)solidMeshes.push(o);});
    renderLootSpawns();state.ready=true;$('loading').hidden=true;$('geometry-info').textContent=`${Math.round(m.triangles/1000)}K TRIANGLES`;$('terrain-info').textContent=terrain?'Terrain':'No terrain template';
    grid.position.y=terrain?sampleTerrain(terrain,0,0)??0:0;frameMonument();refresh();persist();
  }catch(e){if(token!==modelToken)return;console.error(e);$('loading').querySelector('strong').textContent='Could not open this monument';$('loading').querySelector('span:last-child').textContent=e.message;toast('Could not load '+m.name+'. Check the local asset files.');}
}
function frameMonument(){if(!modelRoot)return;const b=new THREE.Box3().setFromObject(modelRoot),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());center.y=Math.max(0,center.y*.5);frame(center,Math.max(size.x,size.z,size.y,20)*.8);}
function frame(center,distance){orbit.target.copy(center);if(state.top){camera.position.set(center.x,center.y+distance*1.6,center.z+.01);camera.up.set(0,0,-1);}else{camera.up.set(0,1,0);camera.position.copy(center).add(new THREE.Vector3(distance*.8,distance*.65,distance*.9));}camera.lookAt(center);fly?.sync();if(orbit.enabled)orbit.update();invalidate();}
function frameSelection(){const p=selectedPoint();if(p)frame(new THREE.Vector3(...toView(p['Local position'])),state.tab==='deliveries'?Math.max(15,p.Radius*2.3):20);}
function activeGroundOffset(){const chosen=$('preview-model').value;return state.trailers.find(t=>t.id===(chosen==='both'?'euro':chosen))?.groundOffset??0;}
function surfaceY(p){if(!state.ready)return null;const ray=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+.5,-p.z),new THREE.Vector3(0,-1,0),0,5000);let hits=ray.intersectObjects(solidMeshes.filter(m=>m.parent!==terrainRoot||terrainRoot.visible),false);if(!hits.length){ray.ray.origin.y=5000;hits=ray.intersectObjects(solidMeshes,false);}return hits[0]?.point.y??sampleTerrain(nativeTerrain,p.x,p.z);}
function addPoint(position){if(!state.monument||!state.ready)return;const pos=position??{x:0,y:sampleTerrain(nativeTerrain,0,0)??0,z:0};if(state.tab==='spawns')pos.y+=activeGroundOffset();edit(()=>{const cfg=settings(state.config,state.monument,true),key=arrayKey(state.tab);cfg[key]??=[];cfg[key].push(newPoint(state.tab,pos));state.index=cfg[key].length-1;});if(!position){setPlacing(true);toast('Click a surface to place the new '+(state.tab==='spawns'?'spawn.':'delivery zone.'));}}
function deletePoint(){if(!selectedPoint())return;edit(()=>{points(state.config,state.monument,state.tab).splice(state.index,1);state.index--;});}
function duplicatePoint(){const p=selectedPoint();if(!p)return;edit(()=>{const copy=clone(p);copy['Local position'].x=round(copy['Local position'].x+2);const list=points(state.config,state.monument,state.tab);list.push(copy);state.index=list.length-1;});toast('Point duplicated 2 metres along local X.');}
function boundsMesh(center,size,color,filled=false){const g=new THREE.BoxGeometry(size.x,size.y,size.z);const result=filled?new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.11,depthWrite:false})):new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color,transparent:true,opacity:.9}));if(!filled)g.dispose();result.position.set(...toView(center));return own(result);}
function updateTrailers(){
  if(!trailerRoot)return;clearGroup(trailerRoot);
  const choice=$('preview-model').value,shown=state.trailers.filter(t=>choice==='both'||t.id===choice);
  const spawns=points(state.config,state.monument,'spawns');
  spawns.forEach((p,index)=>{
    const selected=state.tab==='spawns'&&state.index===index;
    for(const t of shown){
      const group=new THREE.Group();group.position.set(...toView(p['Local position']));group.quaternion.copy(quatFromUnity(p['Local rotation']));
      const native=trailerCache.get(t.id);
      if(native){const mesh=native.clone(true);mesh.traverse(o=>{if(o.isMesh){o.userData.pointIndex=index;o.userData.tab='spawns';if(choice==='both'){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=t.id==='semi'?.62:.5;o.material.depthWrite=false;o.userData.ownedMaterial=true;}}});group.add(mesh);}
      if(selected){if($('show-bounds').checked)group.add(boundsMesh(t.bounds.Center,t.bounds.Size,0xefb477));if($('show-colliders').checked)for(const box of t.colliders)group.add(boundsMesh(box.Center,box.Size,0x9bbfca,true));}
      trailerRoot.add(group);
    }
  });
  $('trailer-dimensions').textContent=shown.map(t=>{const b=t.visualBoundsThree,d=b?b[1].map((v,i)=>v-b[0][i]):[t.bounds.Size.x,t.bounds.Size.y,t.bounds.Size.z];return `${t.id==='semi'?'SEMI':'EURO'} MODEL  ${d[0].toFixed(2)} W × ${d[1].toFixed(2)} H × ${d[2].toFixed(2)} L`;}).join(' / ');
  updateLootStatus(spawns,shown);invalidate();
}
function renderLootSpawns(){
  if(!lootRoot)return;clearGroup(lootRoot);lootRoot.visible=$('show-loot').checked;
  const markers=activeLoot()?.markers??[];if(!markers.length)return;
  const volumes=own(new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,16),new THREE.MeshBasicMaterial({color:0x76b9e8,transparent:true,opacity:.12,depthWrite:false}),markers.length));
  const rings=own(new THREE.InstancedMesh(new THREE.TorusGeometry(1,.025,4,32),new THREE.MeshBasicMaterial({color:0x76b9e8,transparent:true,opacity:.85,depthWrite:false}),markers.length));
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  markers.forEach((m,i)=>{const v=new THREE.Vector3(...toView(m.position)),h=m.height??1.5;matrix.compose(v.clone().add(new THREE.Vector3(0,h/2,0)),new THREE.Quaternion(),new THREE.Vector3(m.radius,h,m.radius));volumes.setMatrixAt(i,matrix);matrix.compose(v.clone().add(new THREE.Vector3(0,.04,0)),q,new THREE.Vector3(m.radius,m.radius,m.radius));rings.setMatrixAt(i,matrix);});
  lootRoot.add(volumes,rings);invalidate();
}
function updateLootStatus(spawns,shown){
  const entry=activeLoot(),exact=entry?.status==='bundled-server-prefab',markers=entry?.markers??[];
  $('loot-source').textContent=exact?`${markers.length} built-in loot spawn areas`:'Loot spawn data unavailable';
  const conflicts=exact?findLootConflicts(spawns,shown,markers):[],text=$('loot-conflicts');
  text.classList.toggle('has-conflicts',conflicts.length>0);
  text.textContent=conflicts.length?conflicts.slice(0,4).map(c=>`Spawn ${c.index+1}: ${c.marker.kind} ${exact?'spawn area':'reference'} — ${c.marker.name}`).join('\n')+(conflicts.length>4?`\n+${conflicts.length-4} more`:''):(exact?'No trailer envelopes intersect the built-in loot areas.':'Loot spawn data is unavailable for this monument.');
}

function wireUI(){
  on('show-loot','change',()=>{lootRoot.visible=$('show-loot').checked;invalidate();});
  on('search','input',renderLibrary);on('category','change',renderLibrary);
  on('tab-spawns','click',()=>{state.tab='spawns';state.index=points(state.config,state.monument,'spawns').length?0:-1;refresh();persist();});
  on('tab-deliveries','click',()=>{state.tab='deliveries';state.index=points(state.config,state.monument,'deliveries').length?0:-1;refresh();persist();});
  on('tool-move','click',()=>setMode('translate'));on('tool-rotate','click',()=>setMode('rotate'));on('tool-place','click',()=>{if(!selectedPoint()){addPoint();return;}setPlacing(!state.placing);});on('snap-enabled','change',updateSnap);on('snap-step','change',updateSnap);
  on('add-point','click',()=>addPoint());on('delete-point','click',deletePoint);on('duplicate-point','click',duplicatePoint);on('undo','click',()=>restoreHistory('undo'));on('redo','click',()=>restoreHistory('redo'));
  for(const kind of ['pos','rot'])for(const axis of ['x','y','z'])on(`${kind}-${axis}`,'input',()=>{const input=$(`${kind}-${axis}`),value=Number(input.value),key=kind==='pos'?'Local position':'Local rotation';if(!selectedPoint()||input.value===''||!Number.isFinite(value)||selectedPoint()[key][axis]===value)return;edit(()=>{selectedPoint()[key]=vector({...selectedPoint()[key],[axis]:value});});});
  const radiusEdit=()=>{const n=Number($('radius').value);if(!selectedPoint()||!Number.isFinite(n)||n<=0||n>1000){toast('Choose a radius between 0.1 and 1000 metres.');refreshFields();return;}edit(()=>selectedPoint().Radius=round(n));};
  on('radius','input',()=>{const n=Number($('radius').value);if(selectedPoint()&&Number.isFinite(n)&&n>=.1&&n<=1000&&n!==selectedPoint().Radius)radiusEdit();});on('radius-slider','input',()=>{$('radius').value=$('radius-slider').value;});on('radius-slider','change',radiusEdit);
  on('drop-surface','click',()=>{const p=selectedPoint();if(!p)return;const y=surfaceY(p['Local position']);if(y==null){toast('No surface found below this point. Use Place to pick one.');return;}edit(()=>p['Local position'].y=round(y+(state.tab==='spawns'?activeGroundOffset():0)));});
  on('preview-model','change',updateTrailers);on('show-bounds','change',updateTrailers);on('show-colliders','change',updateTrailers);
  on('show-grid','change',()=>{grid.visible=$('show-grid').checked;invalidate();});on('show-terrain','change',()=>{terrainRoot.visible=$('show-terrain').checked;invalidate();});
  on('frame-monument','click',frameMonument);on('frame-selection','click',frameSelection);
  function setNavigation(mode){navigation=mode;orbit.enabled=mode==='orbit';fly.setEnabled(mode==='fly');$('view-fly').classList.toggle('active',mode==='fly');$('view-perspective').classList.toggle('active',mode==='orbit');setPlacing(false);invalidate();}
  on('view-fly','click',()=>{state.top=false;$('view-top').classList.remove('active');setNavigation('fly');renderer.domElement.focus();});
  on('view-perspective','click',()=>{state.top=false;$('view-top').classList.remove('active');orbit.target.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(20));setNavigation('orbit');});
  on('view-top','click',()=>{state.top=true;setNavigation('orbit');$('view-top').classList.add('active');if(selectedPoint())frameSelection();else frameMonument();});
  on('fly-speed','input',()=>{fly.speed=THREE.MathUtils.clamp(Number($('fly-speed').value)||8,.1,150);});
  on('monument-enabled','change',()=>edit(()=>settings(state.config,state.monument,true).Enabled=$('monument-enabled').checked));on('display-name','change',()=>edit(()=>settings(state.config,state.monument,true)['Display name']=$('display-name').value.trim()));on('allowed-types','change',()=>edit(()=>settings(state.config,state.monument,true)['Allowed delivery types']=[...new Set($('allowed-types').value.split(',').map(s=>s.trim()).filter(Boolean))]));
  on('export-config','click',saveConfig);on('import-config','click',()=>$('file-input').click());on('file-input','change',async()=>{const file=$('file-input').files[0];if(!file)return;try{const value=validateConfig(JSON.parse(await file.text()));checkpoint();state.config=value;state.documentName=file.name;state.index=0;persist();refresh();toast('Imported '+file.name+'. Previous workspace is available with Undo.');}catch(e){toast('Import failed: '+e.message);}$('file-input').value='';});
  on('help','click',()=>$('guide-dialog').showModal());document.querySelectorAll('.dialog-close,.dialog-done').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  on('copy-json','click',()=>{const data=exportConfig(state.config);$('json-title').textContent=state.monument.name;$('json-preview').textContent=JSON.stringify({[settingsKey(data,state.monument)]:settings(data,state.monument)??{}},null,2);$('json-dialog').showModal();});
  on('copy-json-text','click',async()=>{try{await navigator.clipboard.writeText($('json-preview').textContent);toast('Monument JSON copied.');}catch{toast('Select the JSON text and use Ctrl+C.');}});on('export-monument','click',()=>download(JSON.parse($('json-preview').textContent),state.monument.id+'-zones.json'));
  document.addEventListener('keydown',e=>{if(e.key==='Control'){fineAdjust=true;updateSnap();}});
  document.addEventListener('keyup',e=>{if(e.key==='Control'){fineAdjust=false;updateSnap();}});
  window.addEventListener('blur',()=>{fineAdjust=false;updateSnap();});
  document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();restoreHistory(e.shiftKey?'redo':'undo');}else if((e.ctrlKey||e.metaKey)&&key==='y'){e.preventDefault();restoreHistory('redo');}else if((e.ctrlKey||e.metaKey)&&key==='d'){e.preventDefault();duplicatePoint();}else if((e.ctrlKey||e.metaKey)&&key==='s'){e.preventDefault();saveConfig();}else if(key==='1')setMode('translate');else if(key==='2'&&state.tab==='spawns')setMode('rotate');else if(key==='p')$('tool-place').click();else if(key==='f')frameSelection();else if(key==='home'){e.preventDefault();frameMonument();}else if(key==='escape')setPlacing(false);else if(key==='delete')deletePoint();else if(key==='/'){e.preventDefault();$('search').focus();}else if(key==='?')$('guide-dialog').showModal();});
}
async function start(){
  if(location.protocol==='file:')throw new Error('Open Zone Workshop.exe to launch the editor. Browsers need a local server to load 3D models.');
  const get=path=>fetch(path).then(r=>{if(!r.ok)throw new Error('Missing file: '+path);return r.json();});
  const [catalog,starter,trailers,loot]=await Promise.all([get('data/catalog.json'),get('data/starter-config.json'),get('data/trailers.json'),get('data/loot-spawns.json')]);lootData=validateLootData(loot);state.catalog=catalog.monuments;state.trailers=trailers;state.config=validateConfig(starter);
  let saved=null;try{saved=JSON.parse(localStorage.getItem(STORAGE));if(saved?.config){state.config=validateConfig(saved.config);state.tab=saved.tab==='deliveries'?'deliveries':'spawns';state.documentName=saved.documentName??'TruckerEvent.json';}}catch{toast('Could not restore browser autosave. Starting with the bundled config.');}
  const categories=[...new Set(state.catalog.map(m=>m.category))].sort();for(const c of categories){const option=document.createElement('option');option.value=c;option.textContent=c;$('category').append(option);}
  initScene();wireUI();
  await Promise.all(state.trailers.map(async t=>{try{trailerCache.set(t.id,(await loader.loadAsync(t.model??t.file)).scene);}catch(e){console.error(e);toast(t.name+' preview could not load.');}}));
  const first=state.catalog.find(m=>m.id===saved?.monument)??state.catalog.find(m=>m.id==='gas_station_1')??state.catalog[0];await selectMonument(first);
  if(saved&&Number.isInteger(saved.index)){state.index=Math.max(-1,Math.min(saved.index,points(state.config,first,state.tab).length-1));refresh();}
}
start().catch(e=>{console.error(e);$('loading').querySelector('strong').textContent='Workshop could not start';$('loading').querySelector('span:last-child').textContent=e.message;});
