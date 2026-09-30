import * as T from 'three';

/** Original procedural study mannequin: no downloaded or unlicensed character assets. */
export function makeHumanoid() {
  const root=new T.Group(); root.name='Humanoid';
  const skin=new T.MeshStandardMaterial({color:'#BD8867',roughness:.43,metalness:0});
  const lips=new T.MeshStandardMaterial({color:'#80513f',roughness:.55});
  const hair=new T.MeshStandardMaterial({color:'#241c17',roughness:.72});
  const shirt=new T.MeshStandardMaterial({color:'#9aa5a2',roughness:.92});
  const trousers=new T.MeshStandardMaterial({color:'#3c4548',roughness:.88});
  const shoe=new T.MeshStandardMaterial({color:'#23272a',roughness:.52});
  const white=new T.MeshStandardMaterial({color:'#c4beb0',roughness:.32});
  const iris=new T.MeshStandardMaterial({color:'#302d20',roughness:.4});
  const geometries:T.BufferGeometry[]=[];
  function mesh(g:T.BufferGeometry,m:T.Material,pos:number[],scale=[1,1,1]) {
    geometries.push(g); const o=new T.Mesh(g,m); o.position.set(pos[0],pos[1],pos[2]);o.scale.set(scale[0],scale[1],scale[2]);o.castShadow=true;o.receiveShadow=true;root.add(o);return o;
  }
  function ellipsoid(pos:number[],scale:number[],mat:T.Material=skin) { return mesh(new T.SphereGeometry(1,32,24),mat,pos,scale); }
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
    ellipsoid([side*.113,1.58,-.008],[.021,.04,.02]);
  }
  // A single smooth face surface with nose bridge/tip, chin, orbital hollows and cheek bones.
  const faceG=new T.SphereGeometry(1,80,64),a=faceG.getAttribute('position');
  const gauss=(v:number,s:number)=>Math.exp(-v*v/(s*s));
  for(let i=0;i<a.count;i++) {
    const sx=a.getX(i),sy=a.getY(i),sz=a.getZ(i);let x=sx*.112*(sy<-.2?1+(sy+.2)*.2:1),y=sy*.158,z=sz*.101;
    if(sz>0){
      const frontal=Math.pow(sz,3);
      z+=frontal*(.028*gauss(x,.023)*gauss(y-.013,.062)+.041*gauss(x,.021)*gauss(y+.008,.025));
      z-=frontal*.013*(gauss(x-.044,.026)+gauss(x+.044,.026))*gauss(y-.031,.018);
      z+=frontal*.01*(gauss(x-.058,.035)+gauss(x+.058,.035))*gauss(y+.018,.026);
      z+=frontal*.013*gauss(x,.046)*gauss(y+.1,.026);
    }
    a.setXYZ(i,x,y,z);
  }
  faceG.computeVertexNormals();mesh(faceG,skin,[0,1.586,0]);
  for(const side of [-1,1]) {
    ellipsoid([side*.044,1.614,.090],[.023,.009,.009],white);
    ellipsoid([side*.044,1.614,.098],[.008,.008,.004],iris);
    ellipsoid([side*.044,1.614,.101],[.0038,.0045,.002],hair);
    const brow=ellipsoid([side*.044,1.639,.095],[.027,.0037,.005],hair);brow.rotation.z=side*-.09;
  }
  ellipsoid([0,1.535,.101],[.031,.004,.006],lips);
  ellipsoid([0,1.528,.101],[.028,.004,.007],skin);
  // Close-cropped cap, with an asymmetric swept crown.
  mesh(new T.SphereGeometry(1,48,32,0,Math.PI*2,0,Math.PI*.43),hair,[0,1.594,-.008],[.116,.16,.104]);
  for(let i=0;i<8;i++) {
    const strand=ellipsoid([-.07+i*.019,1.728+Math.sin(i*.5)*.008,-.003],[.025,.013,.079],hair);strand.rotation.y=-.3;
  }
  return {root,skin,dispose:()=>{geometries.forEach(g=>g.dispose());[skin,lips,hair,shirt,trousers,shoe,white,iris].forEach(m=>m.dispose());}};
}
