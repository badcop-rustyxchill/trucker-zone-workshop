import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Bake static transforms and batch surfaces without simplifying any triangles.
export function greyPreview(source){
  source.updateMatrixWorld(true);
  const root=new THREE.Group(),groups=new Map(),materials=new Map(),retainedTextures=new Set();
  let beforeCalls=0,triangleCount=0;
  function materialFor(original){
    const cutout=original.alphaTest>0&&original.map;
    const glass=original.transparent&&!cutout;
    const key=cutout?'cutout-'+original.map.uuid:glass?'glass':'solid';
    if(!materials.has(key)){
      const material=new THREE.MeshLambertMaterial({color:glass?0x9ba8ae:0x9b9fa1,side:THREE.DoubleSide,transparent:!!glass,opacity:glass?.22:1,depthWrite:!glass});
      if(cutout){
        material.map=original.map;material.alphaTest=original.alphaTest;retainedTextures.add(original.map);
        material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb = diffuse;');};
        material.customProgramCacheKey=()=> 'workshop-grey-cutout';
      }
      materials.set(key,material);
    }
    return {key,material:materials.get(key),cutout:!!cutout};
  }
  source.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const src=mesh.geometry,pos=src.attributes.position,index=src.index,count=index?index.count:pos.count;
    const pieces=src.groups.length&&Array.isArray(mesh.material)?src.groups:[{start:0,count,materialIndex:0}];
    const normal=src.attributes.normal,uv=src.attributes.uv,normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for(const piece of pieces){
      const original=Array.isArray(mesh.material)?mesh.material[piece.materialIndex]:mesh.material;
      if(!original)continue;
      const {key,material,cutout}=materialFor(original),vertices=[],normals=[],coords=[];
      const bounds=new THREE.Box3(),v=new THREE.Vector3(),n=new THREE.Vector3();
      for(let i=piece.start;i<Math.min(count,piece.start+piece.count);i++){
        const id=index?index.getX(i):i;v.fromBufferAttribute(pos,id).applyMatrix4(mesh.matrixWorld);vertices.push(v.x,v.y,v.z);bounds.expandByPoint(v);
        if(normal){n.fromBufferAttribute(normal,id).applyMatrix3(normalMatrix).normalize();normals.push(n.x,n.y,n.z);}
        if(cutout)coords.push(uv?uv.getX(id):0,uv?uv.getY(id):0);
      }
      if(!vertices.length)continue;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      if(normal)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));else geometry.computeVertexNormals();
      if(cutout)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));
      const center=bounds.getCenter(new THREE.Vector3()),cell=`${Math.floor(center.x/48)},${Math.floor(center.z/48)}`,batch=key+'|'+cell;
      if(!groups.has(batch))groups.set(batch,{material,geometries:[]});groups.get(batch).geometries.push(geometry);
      beforeCalls++;triangleCount+=vertices.length/9;
    }
  });
  for(const {material,geometries} of groups.values()){
    const geometry=geometries.length===1?geometries[0]:mergeGeometries(geometries,false);
    if(geometries.length>1)for(const part of geometries)part.dispose();
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    root.add(new THREE.Mesh(geometry,material));
  }
  const disposed=new Set();
  source.traverse(o=>{o.geometry?.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])if(material&&!disposed.has(material)){disposed.add(material);for(const value of Object.values(material))if(value?.isTexture&&!retainedTextures.has(value))value.dispose();material.dispose();}});
  root.userData.previewMetrics={beforeCalls,afterCalls:groups.size,triangles:triangleCount};
  return root;
}
