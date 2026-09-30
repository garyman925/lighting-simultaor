import * as T from 'three';
import { equipment, gridEnabled } from '../domain/equipment';
import type { ModifierSpec } from '../domain/equipment';

/** Local -Z faces the subject. Geometry is editorial only and never self-shadows. */
export function makeEquipmentVisual(m:ModifierSpec){
  const root=new T.Group(),d=equipment(m.equipmentId),w=m.widthM,h=m.heightM,depth=d.renderer.depthM;
  const dark=new T.MeshStandardMaterial({color:'#252c30',roughness:.7,side:T.DoubleSide});
  const silver=new T.MeshStandardMaterial({color:'#b7bec2',roughness:.36,metalness:.6,side:T.DoubleSide});
  const white=new T.MeshBasicMaterial({color:'#fff0d1',side:T.DoubleSide,toneMapped:false});
  function mesh(g:T.BufferGeometry,mat:T.Material,z=0){const o=new T.Mesh(g,mat);o.position.z=z;root.add(o);return o;}
  if(d.shape==='rectangle'){
    mesh(new T.BoxGeometry(w,h,depth),dark,depth/2);
    mesh(new T.PlaneGeometry(w*.98,h*.98),white,-.008);
  }else{
    const segments=d.shape==='octagon'?8:40;
    const body=mesh(new T.CylinderGeometry(.5,.12,depth,segments,1,true),d.shape==='dish'||d.shape==='umbrella'?silver:dark,depth/2);
    body.rotation.x=-Math.PI/2;body.scale.set(w,1,h);
    if(d.shape==='cone'){
      mesh(new T.CircleGeometry(w*d.renderer.apertureRatio/2,32),white,.008);
    }else if(d.shape==='dish'){
      mesh(new T.RingGeometry(w*.125,w*.49,40),white,-.008);
      mesh(new T.CircleGeometry(w*.125,40),silver,-.045);
      const brace=mesh(new T.BoxGeometry(w*.55,.009,.009),silver,-.04);brace.rotation.z=.4;
    }else{
      mesh(new T.CircleGeometry(w*.495,segments),white,-.008);
      if(d.shape==='umbrella'){
        for(let i=0;i<8;i++){
          const a=i*Math.PI/4;
          const line=new T.LineSegments(new T.BufferGeometry().setFromPoints([new T.Vector3(0,0,-.025),new T.Vector3(Math.cos(a)*w/2,Math.sin(a)*h/2,-.025)]),new T.LineBasicMaterial({color:'#bcae91'}));root.add(line);
        }
        const shaft=mesh(new T.CylinderGeometry(.008,.008,.55,8),silver,-.2);shaft.rotation.x=Math.PI/2;
      }
    }
  }
  if(gridEnabled(m)){
    const vertices:number[]=[];
    for(let i=-5;i<=5;i++){
      const t=i/6,extent=d.shape==='rectangle'?1:Math.sqrt(1-t*t);
      vertices.push(t*w/2,-extent*h/2,-.055,t*w/2,extent*h/2,-.055,-extent*w/2,t*h/2,-.055,extent*w/2,t*h/2,-.055);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));root.add(new T.LineSegments(g,new T.LineBasicMaterial({color:'#292d30'})));
  }
  return root;
}
