import { makeSkinMaterial } from './skin';
import { skinMask } from '../domain/skin';
import type { SkinRegion } from '../domain/skin';
import * as T from 'three';
import { makeCorneaMaterial } from './cornea';


/** Original procedural study mannequin: no downloaded or unlicensed character assets. */
export function makeHumanoid() {
  const root=new T.Group(); root.name='Humanoid';
  const skinSystem=makeSkinMaterial(),skin=skinSystem.material;
  const cornea=makeCorneaMaterial();
  const lips=skin;
  const hair=new T.MeshStandardMaterial({color:'#241c17',roughness:.72});
  const shirt=new T.MeshStandardMaterial({color:'#9aa5a2',roughness:.92});
  const trousers=new T.MeshStandardMaterial({color:'#3c4548',roughness:.88});
  const shoe=new T.MeshStandardMaterial({color:'#23272a',roughness:.52});
  const white=new T.MeshStandardMaterial({color:'#c4beb0',roughness:.68});
  const iris=new T.MeshStandardMaterial({color:'#ffffff',roughness:.85});
  const pupil=new T.MeshStandardMaterial({color:'#060504',roughness:1});
  const geometries:T.BufferGeometry[]=[];
  function mesh(g:T.BufferGeometry,m:T.Material,pos:number[],scale=[1,1,1],region:SkinRegion='skin') {
    g.normalizeNormals();geometries.push(g); const o=new T.Mesh(g,m); o.position.set(pos[0],pos[1],pos[2]);o.scale.set(scale[0],scale[1],scale[2]);o.castShadow=true;o.receiveShadow=true;root.add(o);
    if(m===skin){
      o.updateMatrix();const a=g.getAttribute('position'),mask:number[]=[];
      for(let i=0;i<a.count;i++){const v=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrix);mask.push(...skinMask(v.x,v.y,v.z,region));}
      g.setAttribute('skinMask',new T.Float32BufferAttribute(mask,4));
    }
    return o;
  }
  function ellipsoid(pos:number[],scale:number[],mat:T.Material=skin,region:SkinRegion='skin') { return mesh(new T.SphereGeometry(1,32,24),mat,pos,scale,region); }
  function limb(a:T.Vector3,b:T.Vector3,r1:number,r2:number,mat:T.Material) {
    const d=b.clone().sub(a); const o=mesh(new T.CylinderGeometry(r2,r1,d.length(),24),mat,a.clone().add(b).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
  }
  // Feet, legs and a softly shaped torso, with a neutral fitted studio outfit.
  for(const side of [-1,1]) {
    ellipsoid([side*.102,.068,.045],[.078,.062,.16],shoe);
    limb(new T.Vector3(side*.1,.16,0),new T.Vector3(side*.10,.49,-.015),.065,.079,trousers);
    ellipsoid([side*.1,.5,-.015],[.083,.088,.078],trousers);
    limb(new T.Vector3(side*.1,.51,-.015),new T.Vector3(side*.09,.89,0),.083,.103,trousers);
  }
  ellipsoid([0,.91,0],[.19,.14,.11],trousers);
  const pts=[new T.Vector2(.16,.89),new T.Vector2(.169,.94),new T.Vector2(.15,1.05),new T.Vector2(.176,1.17),new T.Vector2(.215,1.30),new T.Vector2(.19,1.365),new T.Vector2(.085,1.405)];
  mesh(new T.LatheGeometry(pts,48),shirt,[0,0,0],[1,1,.64]);
  ellipsoid([0,1.42,0],[.065,.11,.063]);
  for(const side of [-1,1]) {
    ellipsoid([side*.206,1.325,0],[.076,.085,.078],shirt);
    const shoulder=new T.Vector3(side*.22,1.31,0),elbow=new T.Vector3(side*.29,1.065,.012),wrist=new T.Vector3(side*.305,.84,.04);
    limb(shoulder,elbow,.066,.046,skin);ellipsoid(elbow.toArray(),[.048,.057,.049]);
    limb(elbow,wrist,.047,.027,skin);ellipsoid([side*.31,.79,.045],[.035,.076,.025]);
    for(let f=0;f<4;f++) ellipsoid([side*(.289+f*.014),.726+(f===0?.01:0),.047],[.008,.04,.009]);
    const thumb=ellipsoid([side*.266,.783,.066],[.013,.038,.014]);thumb.rotation.z=side*-.4;
    ellipsoid([side*.095,1.58,-.008],[.021,.04,.02],skin,'ear');
  }
  // A single smooth face surface with nose bridge/tip, chin, orbital hollows and cheek bones.
  const faceG=new T.SphereGeometry(1,160,128),a=faceG.getAttribute('position');
  const gauss=(v:number,s:number)=>Math.exp(-v*v/(s*s));
  for(let i=0;i<a.count;i++) {
    const sx=a.getX(i),sy=a.getY(i),sz=a.getZ(i);let x=sx*.091*(sy<-.2?1+(sy+.2)*.2:1),y=sy*.158+(sy<-.2?.05*((-sy-.2)/.8)**2:0),z=sz*.101;
    if(sz>0){
      const frontal=Math.pow(sz,3);
      z+=frontal*(.022*gauss(x,.023)*gauss(y-.013,.062)+.028*gauss(x,.021)*gauss(y+.008,.025));
      z-=frontal*.030*(gauss(x-.033,.019)+gauss(x+.033,.019))*gauss(y-.031,.012);
      z+=frontal*.012*(gauss(x-.04,.03)+gauss(x+.04,.03))*gauss(y-.055,.012);
      z+=frontal*.018*(gauss(x-.060,.025)+gauss(x+.060,.025))*gauss(y+.004,.027);
      z-=frontal*.007*(gauss(x-.061,.028)+gauss(x+.061,.028))*gauss(y+.049,.034);
      z+=frontal*.009*gauss(x,.036)*gauss(y+.058,.022);
      z+=frontal*.013*gauss(x,.046)*gauss(y+.1,.026);
    }
    a.setXYZ(i,x,y,z);
  }
  faceG.computeVertexNormals();
  mesh(faceG,skin,[0,1.586,0]).name='Portrait face';
  for(const side of [-1,1]) {
    const eyeX=side*.033,eyeY=1.617,eyeZ=.085;
    const sclera=ellipsoid([eyeX,eyeY,eyeZ],[.013,.013,.013],white);sclera.name='Sclera';sclera.castShadow=false;
    // Iris is a shallow curved disc, with radial pigment variation in vertex colors.
    const irisG=new T.SphereGeometry(.0129,64,24,0,Math.PI*2,0,Math.asin(.0062/.0129));irisG.rotateX(Math.PI/2);
    // Sphere cap initially points +Y; rotate to +Z.
    const colors=[];const ip=irisG.getAttribute('position');
    for(let i=0;i<ip.count;i++){const x=ip.getX(i),y=ip.getY(i),r=Math.hypot(x,y)/.0062,theta=Math.atan2(y,x);const f=.62+.18*Math.sin(theta*47)+.12*Math.sin(theta*83+r*19);const c=new T.Color('#8b7650').multiplyScalar(f*(r>.9?.48:1));colors.push(c.r,c.g,c.b);}
    irisG.setAttribute('color',new T.Float32BufferAttribute(colors,3));iris.vertexColors=true;
    const ir=mesh(irisG,iris,[eyeX,eyeY,eyeZ+.0003]);ir.name='Iris';ir.castShadow=false;
    const p=ellipsoid([eyeX,eyeY,.0984],[.0027,.0027,.0004],pupil);p.name='Pupil';p.castShadow=false;
    const cap=new T.SphereGeometry(.008,64,32,0,Math.PI*2,0,Math.asin(.0064/.008));cap.rotateX(Math.PI/2);
    const c=mesh(cap,cornea,[eyeX,eyeY,.093]);c.name='Cornea';c.layers.set(1);c.castShadow=false;c.receiveShadow=false;
    // Upper/lower lids follow the globe and mask the eye with real depth geometry.
    for(const upper of [true,false]){
      const points=[];
      for(let j=0;j<=32;j++){const t=j/32*Math.PI,x=-.0128*Math.cos(t),y=(upper?.0065:-.0048)*Math.sin(t);const z=Math.sqrt(Math.max(.000003,.013**2-x*x-y*y));points.push(new T.Vector3(eyeX+x,eyeY+y,eyeZ+z));}
      mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),48,.0008,8,false),skin,[0,0,0]).name=upper?'Upper eyelid':'Lower eyelid';
    }
    // Skin sheets cover the globe outside the almond opening, not just a rim.
    const lv:number[]=[],li:number[]=[];
    for(let ring=0;ring<=12;ring++)for(let j=0;j<=96;j++){
      const angle=j/96*Math.PI*2,k=ring/12;
      const dx=T.MathUtils.lerp(.0128,.025,k)*Math.cos(angle),dy=T.MathUtils.lerp(Math.sin(angle)>0?.0065:.0048,.021,k)*Math.sin(angle);
      const x=eyeX+dx,y=eyeY+dy-1.586,sy=y/.158,sx=x/.091,sz=Math.sqrt(Math.max(0,1-sx*sx-sy*sy)),frontal=sz**3;
      let z=sz*.101+frontal*(.022*gauss(x,.023)*gauss(y-.013,.062)+.028*gauss(x,.021)*gauss(y+.008,.025));
      z-=frontal*.030*(gauss(x-.033,.019)+gauss(x+.033,.019))*gauss(y-.031,.012);
      z+=frontal*.012*(gauss(x-.04,.03)+gauss(x+.04,.03))*gauss(y-.055,.012);
      z+=frontal*.018*(gauss(x-.060,.025)+gauss(x+.060,.025))*gauss(y+.004,.027);
      z-=frontal*.007*(gauss(x-.061,.028)+gauss(x+.061,.028))*gauss(y+.049,.034);
      z+=frontal*.009*gauss(x,.036)*gauss(y+.058,.022)+frontal*.013*gauss(x,.046)*gauss(y+.1,.026);
      const innerX=.0128*Math.cos(angle),innerY=(Math.sin(angle)>0?.0065:.0048)*Math.sin(angle);
      const innerZ=eyeZ+Math.sqrt(.013**2-innerX*innerX-innerY*innerY)+.0004;
      // Smoothly join the eyelid margin to the face, avoiding a hard max/sphere seam.
      const lidZ=T.MathUtils.lerp(innerZ,z,k*k*(3-2*k));
      const smoothing=.001*(1-k);
      z=.5*(z+lidZ+Math.sqrt((z-lidZ)**2+smoothing*smoothing))+.0001;
      lv.push(x,eyeY+dy,z);
      if(ring<12&&j<96){const n=ring*97+j;li.push(n,n+97,n+1,n+1,n+97,n+98);}
    }
    const lidG=new T.BufferGeometry();lidG.setAttribute('position',new T.Float32BufferAttribute(lv,3));lidG.setIndex(li);lidG.computeVertexNormals();
    const lids=mesh(lidG,skin,[0,0,0]);lids.name='Orbital eyelid skin';lids.castShadow=false;
    const brow=ellipsoid([side*.038,1.643,.094],[.024,.003,.004],hair);brow.rotation.z=side*-.09;
  }
  ellipsoid([-.011,1.535,.104],[.017,.0035,.005],lips,'lip');
  ellipsoid([.011,1.535,.104],[.017,.0035,.005],lips,'lip');
  ellipsoid([0,1.528,.104],[.026,.0045,.006],lips,'lip');
  // Close-cropped cap, with an asymmetric swept crown.
  mesh(new T.SphereGeometry(1,48,32,0,Math.PI*2,0,Math.PI*.43),hair,[0,1.594,-.008],[.095,.16,.104]);
  for(let i=0;i<8;i++) {
    const strand=ellipsoid([-.057+i*.016,1.728+Math.sin(i*.5)*.008,-.003],[.025,.013,.079],hair);strand.rotation.y=-.3;
  }
  return {root,skin,skinSystem,cornea,dispose:()=>{geometries.forEach(g=>g.dispose());[skin,hair,shirt,trousers,shoe,white,iris,pupil,cornea].forEach(m=>m.dispose());}};
}
