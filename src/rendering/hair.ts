import * as T from 'three';
import { HAIR_STYLES } from '../domain/model';

/** Original closed hair shells: all styles cached once, no textures or external assets. */
export function makeHair(){
  const root=new T.Group();root.name='Hairstyles';
  const material=new T.MeshPhysicalMaterial({color:'#201916',roughness:.38,metalness:0,ior:1.55,specularIntensity:.7});
  const geometries:T.BufferGeometry[]=[];
  const styles=new Map<string,T.Group>();
  for(const style of HAIR_STYLES){
    const group=new T.Group();group.name=`Hair ${style}`;root.add(group);styles.set(style,group);
    if(style==='bald')continue;
    // Polar shell: high front hairline, longer sides and back, always outside facial planes.
    const vertices:number[]=[],indices:number[]=[],cols=64,rows=28;
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
      const u=i/cols*Math.PI*2,t=j/rows,front=Math.max(0,Math.cos(u));
      const end=T.MathUtils.lerp(style==='short'?1.83:2.04,.99,front**5);
      const theta=.006+t*end;
      const wave=style==='curly'?.004*Math.sin(u*13+t*26)*Math.sin(theta):.0015*Math.sin(u*22+t*6)*Math.sin(theta);
      let x=(.100+wave)*Math.sin(theta)*Math.sin(u),y=1.594+.161*Math.cos(theta),z=-.010+(.111+wave)*Math.sin(theta)*Math.cos(u);
      if((style==='bob'||style==='long')&&t>.58){
        const k=(t-.58)/.42,fall=(style==='bob'?.09:.20)*k*k*(1-front**2);
        y-=fall;x*=1+.16*k*(1-front);z-=.043*k*k*(1-front);
      }
      if(style==='curly'){x*=1.10;z*=1.09;y+=.008*Math.sin(theta);}
      vertices.push(x,y,z);
      if(j<rows&&i<cols){const n=j*(cols+1)+i;indices.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
    // Double-sided shell avoids open backfaces at the trimmed hairline.
    const shell=new T.Mesh(g,material);shell.name=`${style} hair shell`;shell.castShadow=shell.receiveShadow=true;group.add(shell);geometries.push(g);
    const tuftGeometry=new T.SphereGeometry(1,12,8);geometries.push(tuftGeometry);
    const count=style==='curly'?68:style==='short'?10:0;
    for(let i=0;i<count;i++){
      const u=i*2.399963,theta=style==='curly'?Math.acos(1-(i+.5)/count*.98):.22+(i%3)*.18;
      const tuft=new T.Mesh(tuftGeometry,material);
      tuft.position.set(.102*Math.sin(theta)*Math.sin(u),1.594+.158*Math.cos(theta),-.01+.111*Math.sin(theta)*Math.cos(u));
      tuft.scale.set(...(style==='curly'?[.017,.013,.017]:[.024,.012,.035]) as [number,number,number]);tuft.rotation.y=u;
      tuft.castShadow=tuft.receiveShadow=true;group.add(tuft);
    }
  }
  material.side=T.DoubleSide;
  function update(style:string,color:string){styles.forEach((g,id)=>{g.visible=id===style;});material.color.set(color);}
  update('short','#201916');
  return {root,material,update,dispose:()=>{geometries.forEach(g=>g.dispose());material.dispose();}};
}
