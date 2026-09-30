import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { emitterSamples, exposure, getTransform, sourcePower, verticalFov } from '../domain/scene';
import type { SceneDocument, Selection, Transform } from '../domain/scene';
import { makeHumanoid } from './humanoid';

export interface FrameStats { ms:number; triangles:number; calls:number; samples:number; frames:number; }
interface Callbacks { transform:(selection:Selection,t:Transform)=>void; select:(s:Selection)=>void; stats:(s:FrameStats)=>void; error:(s:string)=>void; }
export class StudioRenderer {
  private renderer:T.WebGLRenderer;
  private scene=new T.Scene();
  private editor=new T.PerspectiveCamera(43,1,.05,50);
  private shot=new T.PerspectiveCamera(30,1.5,.05,50);
  private orbit:OrbitControls;
  private gizmo:TransformControls;
  private human=makeHumanoid();
  private softbox=new T.Group();
  private boxVisual=new T.Group();
  private stand=new T.Group();
  private cameraRig=new T.Group();
  private helpers=new T.Group();
  private lights:T.SpotLight[]=[];
  private targets:T.Object3D[]=[];
  private backdropMaterial=new T.MeshStandardMaterial({color:'#887b6f',roughness:.95});
  private stage:T.Mesh;
  private selected:Selection='softbox';
  private document:SceneDocument;
  private frame=0;
  private disposed=false;
  private shadowDirty=true;
  private resizeObserver:ResizeObserver;
  private elapsed:number[]=[];
  private frames=0;
  private pointerStart=[0,0];
  private dragBefore:Transform|null=null;
  private lastStats=0;
  private contextLost=false;
  private disposers:(()=>void)[]=[];

  constructor(private host:HTMLElement,private studioView:HTMLElement,private previewView:HTMLElement,document:SceneDocument,private callbacks:Callbacks) {
    this.document=document;
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;
    this.renderer.autoClear=false;this.renderer.info.autoReset=false;
    this.renderer.domElement.className='render-canvas';this.renderer.domElement.setAttribute('aria-label','3D Studio and Camera rendering');
    host.prepend(this.renderer.domElement);
    this.editor.position.set(4.4,3.0,5.6);
    this.orbit=new OrbitControls(this.editor,studioView);this.orbit.target.set(0,1,0);this.orbit.minDistance=2;this.orbit.maxDistance=14;this.orbit.maxPolarAngle=Math.PI*.49;this.orbit.update();
    this.orbit.addEventListener('change',this.invalidate);
    this.gizmo=new TransformControls(this.editor,studioView);this.gizmo.setSize(.82);this.gizmo.setSpace('world');
    this.helpers.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed',e=>{this.orbit.enabled=!e.value;});
    this.gizmo.addEventListener('mouseDown',()=>{this.dragBefore=structuredClone(getTransform(this.document,this.selected));});
    this.gizmo.addEventListener('mouseUp',()=>{this.dragBefore=null;});
    this.gizmo.addEventListener('objectChange',()=>{
      const o=this.object(this.selected);o.position.x=T.MathUtils.clamp(o.position.x,-4,4);o.position.y=T.MathUtils.clamp(o.position.y,this.selected==='model'?0:.25,4);o.position.z=T.MathUtils.clamp(o.position.z,-3,6);
      this.callbacks.transform(this.selected,{positionM:o.position.toArray(),quaternion:o.quaternion.toArray()});
    });
    this.gizmo.addEventListener('change',this.invalidate);
    this.scene.add(this.human.root,this.softbox,this.stand,this.cameraRig,this.helpers);
    this.softbox.add(this.boxVisual);this.makeSoftbox();this.makeCamera();
    this.stage=this.makeStage();this.scene.add(this.stage);
    const grid=new T.GridHelper(10,20,0x6f7777,0x4b5354);grid.position.y=.002;(grid.material as T.Material).transparent=true;(grid.material as T.Material).opacity=.3;this.helpers.add(grid);
    for(let i=0;i<9;i++){
      const l=new T.SpotLight(0xffffff,1,0,Math.PI/3,.35,2);l.castShadow=true;l.shadow.mapSize.set(1024,1024);l.shadow.camera.near=.08;l.shadow.camera.far=15;l.shadow.bias=-.00015;l.shadow.normalBias=.004;
      const target=new T.Object3D();this.scene.add(l,target);l.target=target;this.lights.push(l);this.targets.push(target);
    }
    this.resizeObserver=new ResizeObserver(()=>{const r=host.getBoundingClientRect();this.renderer.setSize(r.width,r.height,false);this.invalidate();});this.resizeObserver.observe(host);this.resizeObserver.observe(studioView);this.resizeObserver.observe(previewView);
    this.listen(studioView,'pointerdown',((e:PointerEvent)=>{this.pointerStart=[e.clientX,e.clientY];}) as EventListener);
    this.listen(studioView,'pointerup',((e:PointerEvent)=>this.pick(e)) as EventListener);
    this.listen(this.renderer.domElement,'webglcontextlost',((e:Event)=>{e.preventDefault();this.contextLost=true;this.callbacks.error('繪圖連線中斷。請重新載入；目前場景可先匯出備份。');}) as EventListener);
    this.listen(documentOwner(),'visibilitychange',()=>{if(!window.document.hidden)this.invalidate();});
    this.update(document);this.select('softbox');
  }
  private listen(target:EventTarget,type:string,fn:EventListener){target.addEventListener(type,fn);this.disposers.push(()=>target.removeEventListener(type,fn));}
  private object(s:Selection){return s==='softbox'?this.softbox:s==='camera'?this.cameraRig:this.human.root;}
  private mesh(g:T.BufferGeometry,m:T.Material,parent:T.Object3D){const o=new T.Mesh(g,m);parent.add(o);return o;}
  private makeSoftbox(){
    const dark=new T.MeshStandardMaterial({color:'#23292c',roughness:.72});
    const diffuser=new T.MeshBasicMaterial({color:'#faf1dc',side:T.DoubleSide,toneMapped:false});
    // Local -Z is the emitter direction. Equipment geometry never shadows its own emitter samples.
    const casing=this.mesh(new T.CylinderGeometry(.49,.70,.32,4,1,true),dark,this.boxVisual);casing.rotation.x=Math.PI/2;casing.rotation.y=Math.PI/4;casing.position.z=.16;
    const plane=this.mesh(new T.PlaneGeometry(1,1),diffuser,this.boxVisual);plane.rotation.y=Math.PI;plane.position.z=-.008;
    const edge=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.018,1.018,.028)),new T.LineBasicMaterial({color:0xd0b077}));this.boxVisual.add(edge);
    const rod=this.mesh(new T.CylinderGeometry(.015,.022,1,12),dark,this.stand);rod.name='rod';
    for(let i=0;i<3;i++){const leg=this.mesh(new T.BoxGeometry(.025,.025,.62),dark,this.stand);leg.rotation.y=i*Math.PI*2/3;leg.position.set(Math.sin(leg.rotation.y)*.24,.035,Math.cos(leg.rotation.y)*.24);}
  }
  private makeCamera(){
    const body=new T.MeshStandardMaterial({color:'#22292d',roughness:.6}),lens=new T.MeshStandardMaterial({color:'#263c48',metalness:.55,roughness:.22});
    this.mesh(new T.BoxGeometry(.22,.15,.10),body,this.cameraRig);
    const l=this.mesh(new T.CylinderGeometry(.054,.066,.15,24),lens,this.cameraRig);l.rotation.x=Math.PI/2;l.position.z=-.10;
    const wire=new T.LineSegments(new T.EdgesGeometry(new T.ConeGeometry(.19,.4,4,1,true)),new T.LineBasicMaterial({color:0x85a9bb,transparent:true,opacity:.4}));wire.rotation.x=Math.PI/2;wire.rotation.z=Math.PI/4;wire.position.z=-.35;this.cameraRig.add(wire);
  }
  private makeStage(){
    const profile:[number,number][]=[[0,6],[0,-2]];
    for(let i=1;i<=24;i++){const a=i/24*Math.PI/2;profile.push([1-Math.cos(a),-2-Math.sin(a)]);}
    profile.push([5,-3]);const vertices:number[]=[],indices:number[]=[];
    for(const [y,z] of profile)vertices.push(-5,y,z,5,y,z);
    for(let i=0;i<profile.length-1;i++){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();this.backdropMaterial.side=T.DoubleSide;
    const stage=new T.Mesh(g,this.backdropMaterial);stage.receiveShadow=true;return stage;
  }
  update(s:SceneDocument){
    if(this.disposed)return;
    const prev=this.document;
    this.shadowDirty ||= JSON.stringify([prev.model,prev.lights[0].transform,prev.lights[0].modifier])!==JSON.stringify([s.model,s.lights[0].transform,s.lights[0].modifier]);
    this.document=s;
    for(const selected of ['model','camera','softbox'] as Selection[]){const t=getTransform(s,selected),o=this.object(selected);o.position.fromArray(t.positionM);o.quaternion.fromArray(t.quaternion);}
    this.human.root.scale.setScalar(s.model.heightCm/175);this.human.skin.color.set(s.model.skinColor);
    const light=s.lights[0],size=light.modifier.widthM;this.boxVisual.scale.set(size,light.modifier.heightM,1);
    this.stand.position.set(this.softbox.position.x,0,this.softbox.position.z);const rod=this.stand.getObjectByName('rod')!;rod.scale.y=Math.max(.1,this.softbox.position.y);rod.position.y=this.softbox.position.y/2;
    this.softbox.updateMatrixWorld(true);
    const temp=kelvin(light.source.temperatureK); const gain=exposure(s.camera,light.source.mode)*sourcePower(s);
    emitterSamples(size).forEach((sample,i)=>{
      const pos=new T.Vector3(...sample.position).applyMatrix4(this.softbox.matrixWorld);
      this.lights[i].position.copy(pos);this.targets[i].position.copy(pos).add(new T.Vector3(0,0,-1).applyQuaternion(this.softbox.quaternion));
      this.lights[i].color.copy(temp);this.lights[i].intensity=3.8*gain*sample.weight;
    });
    this.shot.position.copy(this.cameraRig.position);this.shot.quaternion.copy(this.cameraRig.quaternion);this.shot.fov=verticalFov(s.camera.focalLengthMm);this.shot.updateProjectionMatrix();
    this.backdropMaterial.color.set(s.environment.backgroundColor);
    this.invalidate();
  }
  select(s:Selection){this.selected=s;this.gizmo.attach(this.object(s));this.invalidate();}
  mode(m:'translate'|'rotate'){this.gizmo.setMode(m);this.invalidate();}
  cancelDrag(){if(this.dragBefore){const before=this.dragBefore;this.gizmo.reset();this.callbacks.transform(this.selected,before);this.dragBefore=null;}}
  resetView(){this.editor.position.set(4.4,3,5.6);this.orbit.target.set(0,1,0);this.orbit.update();this.invalidate();}
  private pick(e:PointerEvent){
    if(Math.hypot(e.clientX-this.pointerStart[0],e.clientY-this.pointerStart[1])>4||this.gizmo.axis)return;
    const r=this.studioView.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.editor);
    const hit=ray.intersectObjects([this.softbox,this.cameraRig,this.human.root],true)[0];if(!hit)return;
    let o:T.Object3D|null=hit.object;while(o&&o.parent!==this.scene)o=o.parent;
    if(o)this.callbacks.select(o===this.softbox?'softbox':o===this.cameraRig?'camera':'model');
  }
  invalidate=()=>{if(!this.frame&&!this.disposed&&!this.contextLost&&!window.document.hidden)this.frame=requestAnimationFrame(this.draw);};
  private viewport(el:HTMLElement){const r=el.getBoundingClientRect(),host=this.host.getBoundingClientRect();return{x:r.left-host.left,y:host.bottom-r.bottom,w:r.width,h:r.height};}
  private draw=()=>{
    this.frame=0;if(this.disposed||this.contextLost)return;const start=performance.now();this.renderer.info.reset();
    this.renderer.setScissorTest(true);
    const a=this.viewport(this.studioView);this.renderer.setViewport(a.x,a.y,a.w,a.h);this.renderer.setScissor(a.x,a.y,a.w,a.h);this.renderer.setClearColor('#252d31');this.renderer.clear();
    this.editor.aspect=a.w/a.h;this.editor.updateProjectionMatrix();
    this.helpers.visible=true;this.cameraRig.visible=true;this.scene.background=null;
    this.renderer.shadowMap.needsUpdate=this.shadowDirty;this.renderer.render(this.scene,this.editor);this.shadowDirty=false;
    const b=this.viewport(this.previewView);this.renderer.setViewport(b.x,b.y,b.w,b.h);this.renderer.setScissor(b.x,b.y,b.w,b.h);this.renderer.setClearColor('#111516');this.renderer.clear();
    let w=b.w,h=w/1.5;if(h>b.h){h=b.h;w=h*1.5;}
    this.renderer.setViewport(b.x+(b.w-w)/2,b.y+(b.h-h)/2,w,h);this.renderer.setScissor(b.x+(b.w-w)/2,b.y+(b.h-h)/2,w,h);
    this.renderer.setClearColor(this.document.environment.backgroundColor);this.renderer.clear();this.helpers.visible=false;this.cameraRig.visible=false;
    this.renderer.render(this.scene,this.shot);this.helpers.visible=true;this.cameraRig.visible=true;
    this.frames++;const ms=performance.now()-start;this.elapsed.push(ms);if(this.elapsed.length>60)this.elapsed.shift();
    if(start-this.lastStats>250||this.frames<3){this.callbacks.stats({ms:this.elapsed.reduce((a,b)=>a+b,0)/this.elapsed.length,triangles:this.renderer.info.render.triangles,calls:this.renderer.info.render.calls,samples:9,frames:this.frames});this.lastStats=start;}
  };
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.orbit.dispose();this.gizmo.dispose();this.disposers.forEach(f=>f());this.human.dispose();
    const geometry=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.LineSegments){geometry.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.lights.forEach(l=>l.shadow.dispose());this.renderer.dispose();this.renderer.domElement.remove();
  }
}
function documentOwner(){return window.document;}
/** Fixed RGB approximation normalized in linear light, not a spectral simulation. */
function kelvin(k:number){
  const t=k/100; const r=t<=66?255:329.698727446*((t-60)**-.1332047592),g=t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*((t-60)**-.0755148492),b=t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307;
  const c=new T.Color().setRGB(T.MathUtils.clamp(r/255,0,1),T.MathUtils.clamp(g/255,0,1),T.MathUtils.clamp(b/255,0,1),T.SRGBColorSpace);return c.multiplyScalar(1/(c.r*.2126+c.g*.7152+c.b*.0722));
}
