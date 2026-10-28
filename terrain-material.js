import * as THREE from 'three';

// Appearance only: native height samples, holes and placement coordinates stay intact.
export function terrainColour(data,x,z,id=''){
  const i=z*data.width+x,h=data.heights[i];
  if(data.splat){
    const palette=[0x8c795a,0xdce2df,0xb7a17b,0x77766e,0x6e804a,0x4b5d35,0x969285,0x858177];
    const result=new THREE.Color(0,0,0);let sum=0;
    for(let ch=0;ch<8;ch++){const w=((data.splatMask??255)&(1<<ch))?data.splat[i*8+ch]:0;if(w){const c=new THREE.Color(palette[ch]);result.r+=c.r*w;result.g+=c.g*w;result.b+=c.b*w;sum+=w;}}
    if(sum)return result.multiplyScalar(1/sum);
  }
  const dx=data.size.x/(data.width-1),dz=data.size.z/(data.height-1);
  const sx=(data.heights[z*data.width+Math.min(x+1,data.width-1)]-data.heights[z*data.width+Math.max(0,x-1)])/(2*dx);
  const sz=(data.heights[Math.min(z+1,data.height-1)*data.width+x]-data.heights[Math.max(0,z-1)*data.width+x])/(2*dz);
  const slope=Math.sqrt(sx*sx+sz*sz);
  const tx=data.origin.x+x*dx,tz=data.origin.z+z*dz;
  const patches=.5+.24*Math.sin(tx*.071+Math.sin(tz*.043)*2)+.18*Math.sin(tz*.13+tx*.037);
  const desert=id.includes('desert'),snow=id.includes('arctic'),swamp=id.includes('swamp');
  const grass=new THREE.Color(snow?0xcdd5d2:desert?0xb5a17a:swamp?0x4b6237:0x70834a);
  const dirt=new THREE.Color(snow?0x8f9695:desert?0xa28c65:0x8c795a);
  grass.lerp(dirt,THREE.MathUtils.smoothstep(patches,.38,.82)*.8);
  grass.lerp(new THREE.Color(0x77766a),THREE.MathUtils.smoothstep(slope,.32,1.15));
  grass.multiplyScalar(.91+.13*patches);
  return grass;
}

export function terrainMaterial(){
  // One reusable tile adds soil/gravel detail without extra geometry or draw calls.
  const size=256,bytes=new Uint8Array(size*size*4);let seed=28173;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const grain=random(),pebble=grain>.985;
    const n=Math.round(pebble?220:170+grain*60+10*Math.sin(x*.17)*Math.sin(y*.13));
    const i=(y*size+x)*4;bytes[i]=bytes[i+1]=bytes[i+2]=n;bytes[i+3]=255;
  }
  const map=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
  map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;
  return new THREE.MeshLambertMaterial({vertexColors:true,map,side:THREE.DoubleSide});
}
