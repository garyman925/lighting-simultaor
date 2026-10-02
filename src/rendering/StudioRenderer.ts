import { aimPoint, snapRadians } from '../domain/aiming';
import { apertureSamples, opticalParameters, catchlightDescriptor } from '../domain/equipment';
import { makeEquipmentVisual } from './equipmentVisual';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { exposure, getTransform, sourcePower, verticalFov } from '../domain/scene';
import type { SceneDocument, Selection, Transform, LightSpec, StudioView } from '../domain/scene';
import { makeHumanoid } from './humanoid';
import { updateCorneaEmitter } from './cornea';
import { QUALITY,qualityName } from './quality';

export interface FrameStats { ms:number; triangles:number; calls:number; samples:number; frames:number; }
interface Callbacks { transform:(selection:Selection,t:Transform,restoreAim?:LightSpec['aiming'])=>void; select:(s:Selection)=>void; stats:(s:FrameStats)=>void; error:(s:string)=>void; }
export class StudioRenderer {
  private renderer:T.WebGLRenderer;
  private scene=new T.Scene();
  private perspective=new T.PerspectiveCamera(43,1,.05,100);
  private orthographic=new T.OrthographicCamera(-4,4,3,-3,.05,100);
  private editor:T.PerspectiveCamera|T.OrthographicCamera=this.perspective;
  private view:StudioView='Perspective';
  private studioDirty=true;
  private studioTarget=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});
  private selectionBox=new T.Box3Helper(new T.Box3(),0xffd38a);
  private overlay=new T.Scene();
  private aimingArrow=new T.ArrowHelper(new T.Vector3(0,0,-1),new T.Vector3(),1,0x79e8db);
  private aimingTarget=new T.Mesh(new T.SphereGeometry(.035,12,8),new T.MeshBasicMaterial({color:0xffd38a,depthTest:false}));
  private shot=new T.PerspectiveCamera(30,1.5,.05,50);
  private orbit:OrbitControls;
  private gizmo:TransformControls;
  private human=makeHumanoid();
  private rigs=new Map<string,{root:T.Group;visual:T.Group;stand:T.Group}>();
  private cameraRig=new T.Group();
  private helpers=new T.Group();
  private editorFill=new T.HemisphereLight(0xdce8ed,0x555044,.45);
  private lights:T.SpotLight[]=[];
  private targets:T.Object3D[]=[];
  private backdropMaterial=new T.MeshStandardMaterial({color:'#887b6f',roughness:.95});
  private stage:T.Mesh;
  private selected:Selection='light-key';
  private document:SceneDocument;
  private frame=0;
  private disposed=false;
  private resizeObserver:ResizeObserver;
  private elapsed:number[]=[];
  private frames=0;
  private pointerStart=[0,0];
  private dragBefore:Transform|null=null;
  private dragBeforeAim:LightSpec['aiming'];
  private lastStats=0;
  private contextLost=false;
  private batch=0;
  private interacting=false;
  private interactionTimer:ReturnType<typeof setTimeout>|undefined;
  private inspect=1;
  private inspectionCamera=new T.PerspectiveCamera();
  private sampleTarget=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});
  private history=[new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType}),new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType})];
  private compositeScene=new T.Scene();
  private displayScene=new T.Scene();
  private screenCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  private composite=new T.ShaderMaterial({uniforms:{previous:{value:null},sampleFrame:{value:null},weight:{value:1}},vertexShader:'varying vec2 texUv; void main(){texUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D previous;uniform sampler2D sampleFrame;uniform float weight;varying vec2 texUv;void main(){gl_FragColor=mix(texture2D(previous,texUv),texture2D(sampleFrame,texUv),weight);}',depthTest:false,depthWrite:false,toneMapped:false});
  private displayMaterial=new T.MeshBasicMaterial({depthTest:false,depthWrite:false});
  private supportsFloat=true;
  private disposers:(()=>void)[]=[];

  constructor(private host:HTMLElement,private studioView:HTMLElement,private previewView:HTMLElement,document:SceneDocument,private callbacks:Callbacks) {
    this.document=document;
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;
    this.renderer.autoClear=false;this.renderer.info.autoReset=false;
    this.supportsFloat=this.renderer.extensions.has('EXT_color_buffer_float');
    if(!this.supportsFloat)[this.sampleTarget,this.studioTarget,...this.history].forEach(t=>{t.texture.type=T.UnsignedByteType;});
    this.sampleTarget.samples=4;
    this.compositeScene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.composite));
    this.displayScene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.displayMaterial));
    this.renderer.domElement.className='render-canvas';this.renderer.domElement.setAttribute('aria-label','3D Studio and Camera rendering');
    host.prepend(this.renderer.domElement);
    this.editor.position.set(0,4.6,7);
    this.orbit=new OrbitControls(this.editor,studioView);this.orbit.target.set(0,1,0);this.orbit.minDistance=.4;this.orbit.maxDistance=35;this.orbit.minZoom=.15;this.orbit.maxZoom=12;this.orbit.screenSpacePanning=true;this.orbit.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.PAN,RIGHT:T.MOUSE.PAN};this.orbit.update();
    this.orbit.addEventListener('change',this.invalidateStudio);
    this.gizmo=new TransformControls(this.editor,studioView);this.gizmo.setSize(.82);this.gizmo.setSpace('world');
    this.overlay.add(this.gizmo.getHelper(),this.selectionBox,this.aimingArrow,this.aimingTarget);(this.selectionBox.material as T.LineBasicMaterial).depthTest=false;
    this.gizmo.addEventListener('dragging-changed',e=>{this.orbit.enabled=!e.value;this.setInteracting(!!e.value);});
    this.orbit.addEventListener('start',()=>this.setInteracting(true));
    this.orbit.addEventListener('end',()=>this.setInteracting(false));
    this.listen(host.ownerDocument,'pointerdown',()=>this.setInteracting(true));
    this.listen(host.ownerDocument,'pointerup',()=>this.setInteracting(false));
    this.listen(host.ownerDocument,'pointercancel',()=>this.setInteracting(false));
    this.gizmo.addEventListener('mouseDown',()=>{this.dragBefore=structuredClone(getTransform(this.document,this.selected));const light=this.document.lights.find(l=>l.id===this.selected);this.dragBeforeAim=light?structuredClone(light.aiming??{target:'face',auto:false}):undefined;});
    this.gizmo.addEventListener('mouseUp',()=>{this.dragBefore=null;});
    this.gizmo.addEventListener('objectChange',()=>{
      const o=this.object(this.selected);if(!o)return;if(this.gizmo.getMode()==='translate'){o.position.x=T.MathUtils.clamp(o.position.x,-4,4);o.position.y=T.MathUtils.clamp(o.position.y,this.selected==='model'?0:.25,4);o.position.z=T.MathUtils.clamp(o.position.z,-3,6);}
      this.callbacks.transform(this.selected,{positionM:o.position.toArray(),quaternion:o.quaternion.toArray()});
    });
    this.gizmo.addEventListener('change',this.invalidateStudio);
    this.scene.add(this.human.root,this.cameraRig,this.helpers,this.editorFill);this.makeCamera();
    this.stage=this.makeStage();this.scene.add(this.stage);
    const grid=new T.GridHelper(10,20,0x6f7777,0x4b5354);grid.position.y=.002;(grid.material as T.Material).transparent=true;(grid.material as T.Material).opacity=.3;this.helpers.add(grid);
    for(let i=0;i<9;i++){
      const l=new T.SpotLight(0xffffff,1,0,Math.PI/3,.35,2);l.castShadow=true;l.shadow.mapSize.set(512,512);l.shadow.camera.near=.08;l.shadow.camera.far=15;l.shadow.bias=-.00008;l.shadow.normalBias=.0004;
      const target=new T.Object3D();this.scene.add(l,target);l.target=target;this.lights.push(l);this.targets.push(target);
    }
    this.resizeObserver=new ResizeObserver(()=>{const r=host.getBoundingClientRect();this.renderer.setSize(r.width,r.height,false);this.batch=0;this.invalidateStudio();});this.resizeObserver.observe(host);this.resizeObserver.observe(studioView);this.resizeObserver.observe(previewView);
    this.listen(studioView,'pointerdown',((e:PointerEvent)=>{this.pointerStart=[e.clientX,e.clientY];}) as EventListener);
    this.listen(studioView,'pointerup',((e:PointerEvent)=>this.pick(e)) as EventListener);
    this.listen(this.renderer.domElement,'webglcontextlost',((e:Event)=>{e.preventDefault();this.contextLost=true;this.callbacks.error('繪圖連線中斷。請重新載入；目前場景可先匯出備份。');}) as EventListener);
    this.listen(documentOwner(),'visibilitychange',()=>{if(!window.document.hidden)this.invalidate();});
    this.listen(studioView,'pointercancel',()=>{this.orbit.enabled=true;});
    this.update(document);this.select('light-key');
  }
  private listen(target:EventTarget,type:string,fn:EventListener){target.addEventListener(type,fn);this.disposers.push(()=>target.removeEventListener(type,fn));}
  private object(s:Selection){return s==='camera'?this.cameraRig:s==='model'?this.human.root:this.rigs.get(s)?.root;}
  private mesh(g:T.BufferGeometry,m:T.Material,parent:T.Object3D){const o=new T.Mesh(g,m);parent.add(o);return o;}
  private makeRig(){
    const root=new T.Group(),visual=new T.Group(),stand=new T.Group();root.add(visual);
    const dark=new T.MeshStandardMaterial({color:'#23292c',roughness:.72});
    const rod=this.mesh(new T.CylinderGeometry(.015,.022,1,12),dark,stand);rod.name='rod';
    for(let i=0;i<3;i++){const leg=this.mesh(new T.BoxGeometry(.025,.025,.62),dark,stand);leg.rotation.y=i*Math.PI*2/3;leg.position.set(Math.sin(leg.rotation.y)*.24,.035,Math.cos(leg.rotation.y)*.24);}
    this.scene.add(root,stand);return {root,visual,stand};
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
    const previous=this.document;
    const visualChanged=previous.render.quality!==s.render.quality||previous.model!==s.model||previous.camera!==s.camera||previous.environment!==s.environment||
      JSON.stringify(previous.lights.map(({name,...l})=>l))!==JSON.stringify(s.lights.map(({name,...l})=>l));
    this.document=s;
    for(const [id,rig] of this.rigs)if(!s.lights.some(l=>l.id===id)){
      if(this.gizmo.object===rig.root)this.gizmo.detach();
      this.disposeObject(rig.root);this.disposeObject(rig.stand);this.rigs.delete(id);
    }
    for(const light of s.lights){
      let rig=this.rigs.get(light.id);if(!rig){rig=this.makeRig();this.rigs.set(light.id,rig);}
      rig.root.position.fromArray(light.transform.positionM);rig.root.quaternion.fromArray(light.transform.quaternion);
      const signature=JSON.stringify(light.modifier);
      if(rig.visual.userData.signature!==signature){
        this.disposeObject(rig.visual);rig.visual=makeEquipmentVisual(light.modifier);
        rig.visual.userData.signature=signature;rig.visual.userData.catchlight=catchlightDescriptor(light.modifier);rig.root.add(rig.visual);
      }
      rig.stand.position.set(rig.root.position.x,0,rig.root.position.z);
      const rod=rig.stand.getObjectByName('rod')!;rod.scale.y=Math.max(.1,rig.root.position.y);rod.position.y=rig.root.position.y/2;
      rig.root.updateMatrixWorld(true);
    }
    for(const id of ['camera','model'] as const){const t=getTransform(s,id),o=this.object(id)!;o.position.fromArray(t.positionM);o.quaternion.fromArray(t.quaternion);}
    this.human.root.scale.setScalar(s.model.heightCm/175);this.human.skin.color.set(s.model.skinColor);
    this.shot.position.copy(this.cameraRig.position);this.shot.quaternion.copy(this.cameraRig.quaternion);this.shot.fov=verticalFov(s.camera.focalLengthMm);this.shot.updateProjectionMatrix();
    this.backdropMaterial.color.set(s.environment.backgroundColor);
    if(visualChanged||this.frames===0){
      if(this.frames>0){this.setInteracting(true);this.setInteracting(false);}
      this.batch=0;this.callbacks.stats({ms:this.elapsed.at(-1)??0,triangles:0,calls:0,samples:0,frames:this.frames});this.invalidateStudio();
    }
  }
  select(s:Selection){this.selected=s;const o=this.object(s);if(o)this.gizmo.attach(o);else this.gizmo.detach();this.invalidateStudio();}
  setInspection(value:number){this.inspect=value;this.batch=0;this.invalidate();}
  private setInteracting(value:boolean){
    clearTimeout(this.interactionTimer);
    if(value){if(!this.interacting){this.interacting=true;this.batch=0;this.invalidateStudio();}}
    else this.interactionTimer=setTimeout(()=>{this.interacting=false;this.batch=0;this.invalidateStudio();},180);
  }
  mode(m:'translate'|'rotate'){this.gizmo.setMode(m);this.invalidateStudio();}
  rotationSnap(degrees:number){this.gizmo.setRotationSnap(snapRadians(degrees));this.invalidateStudio();}
  cancelDrag(){if(this.dragBefore){const before=this.dragBefore;this.gizmo.reset();this.callbacks.transform(this.selected,before,this.dragBeforeAim);this.dragBefore=null;}this.orbit.enabled=true;}
  setView(view:StudioView){
    this.view=view;this.editor=view==='Perspective'?this.perspective:this.orthographic;
    this.editor.up.set(0,view==='Top'?0:1,view==='Top'?-1:0);
    this.editor.position.set(...(view==='Perspective'?[0,4.6,7]:view==='Top'?[0,9,0]:view==='Front'?[0,1,9]:[9,1,0]) as [number,number,number]);
    this.orthographic.zoom=1;this.orbit.object=this.editor;this.orbit.target.set(0,1,0);this.orbit.enableRotate=view==='Perspective';this.orbit.enabled=true;
    this.gizmo.camera=this.editor;this.orbit.update();this.invalidateStudio();
  }
  resetView(){this.setView(this.view);}
  private disposeObject(o:T.Object3D){
    o.removeFromParent();const materials=new Set<T.Material>();o.traverse(child=>{if(child instanceof T.Mesh||child instanceof T.LineSegments){child.geometry.dispose();(Array.isArray(child.material)?child.material:[child.material]).forEach(m=>materials.add(m));}});materials.forEach(m=>m.dispose());
  }
  private positionSamples(light:LightSpec|undefined,jitter:number[]){
    const rig=light?this.rigs.get(light.id):undefined;
    const samples=light?apertureSamples(light.modifier,jitter):[],optics=light?opticalParameters(light.modifier):null;
    const draft=this.interacting||qualityName(this.document.render.quality)==='Draft';
    this.lights.forEach((l,i)=>{
      l.visible=!!light&&(!draft||i===0);
      if(!light||!rig||!optics||!l.visible){l.intensity=0;return;}
      const sample=draft?{position:samples[4].position,weight:1}:samples[i];
      const pos=new T.Vector3(...sample.position).applyMatrix4(rig.root.matrixWorld);
      l.angle=optics.spreadDeg*Math.PI/360;l.penumbra=optics.penumbra;      l.position.copy(pos);this.targets[i].position.copy(pos).add(new T.Vector3(0,0,-1).applyQuaternion(rig.root.quaternion));
      l.color.copy(kelvin(light.source.temperatureK));l.intensity=3.8*exposure(this.document.camera,light.source.mode)*sourcePower(light)*sample.weight*optics.gain;
    });
  }
  /** Reuse nine shadow maps for any fixture count. Sum direct light in linear HDR before tone mapping.
   * Later passes shade only the already visible surfaces (equal depth), preserving occlusion.
   */
  private renderLighting(target:T.WebGLRenderTarget,camera:T.Camera,studio:boolean,jitter:number[]){
    this.renderer.setRenderTarget(target);this.renderer.setScissorTest(false);this.renderer.toneMapping=T.NoToneMapping;this.renderer.setClearColor(0);this.renderer.clear();
    this.helpers.visible=false;this.cameraRig.visible=studio;
    this.rigs.forEach(r=>{r.root.visible=studio;r.stand.visible=studio;});
    const materials=new Set<T.Material>();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.LineSegments)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
    const originals=[...materials].map(m=>({m,blending:m.blending,depthFunc:m.depthFunc,depthWrite:m.depthWrite,color:(m instanceof T.MeshBasicMaterial||m instanceof T.LineBasicMaterial)?m.color.clone():null}));
    const enabled=this.document.lights.filter(l=>sourcePower(l)>0);
    const passes:(LightSpec|undefined)[]=enabled.length?enabled:[undefined];
    passes.forEach((light,i)=>{
      this.editorFill.intensity=studio&&i===0?.45:0;
      this.helpers.visible=studio&&i===0;
      if(i===1)originals.forEach(({m,color})=>{m.blending=T.CustomBlending;m.blendSrc=T.OneFactor;m.blendDst=T.OneFactor;m.blendEquation=T.AddEquation;m.depthFunc=T.EqualDepth;m.depthWrite=false;if(color&&(m instanceof T.MeshBasicMaterial||m instanceof T.LineBasicMaterial))m.color.set(0);});
      this.positionSamples(light,jitter);this.renderer.shadowMap.needsUpdate=true;this.renderer.render(this.scene,camera);
    });
    originals.forEach(({m,blending,depthFunc,depthWrite,color})=>{m.blending=blending;m.depthFunc=depthFunc;m.depthWrite=depthWrite;if(color&&(m instanceof T.MeshBasicMaterial||m instanceof T.LineBasicMaterial))m.color.copy(color);});
    // Corneal reflections use all enabled emitters, once each, after the opaque sum.
    // Layer 1 keeps the transparent cap out of equal-depth multi-light accumulation.
    const mask=camera.layers.mask;camera.layers.set(1);this.renderer.shadowMap.enabled=false;
    for(const light of enabled){updateCorneaEmitter(this.human.cornea,light,this.document.camera,kelvin(light.source.temperatureK),this.human.root.matrixWorld);this.renderer.render(this.scene,camera);}
    camera.layers.mask=mask;this.renderer.shadowMap.enabled=true;
    this.rigs.forEach(r=>{r.root.visible=true;r.stand.visible=true;});this.cameraRig.visible=true;
  }
  private pick(e:PointerEvent){
    if(e.button!==0||Math.hypot(e.clientX-this.pointerStart[0],e.clientY-this.pointerStart[1])>4||this.gizmo.axis)return;
    const r=this.studioView.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.editor);
    const hit=ray.intersectObjects([...Array.from(this.rigs.values(),r=>r.root),this.cameraRig,this.human.root],true)[0];if(!hit)return;
    let o:T.Object3D|null=hit.object;while(o&&o.parent!==this.scene)o=o.parent;
    if(o){const id=[...this.rigs].find(([,r])=>r.root===o)?.[0];this.callbacks.select(id as Selection|| (o===this.cameraRig?'camera':'model'));}
  }
  private invalidateStudio=()=>{this.studioDirty=true;this.invalidate();};
  invalidate=()=>{if(!this.frame&&!this.disposed&&!this.contextLost&&!window.document.hidden)this.frame=requestAnimationFrame(this.draw);};
  private viewport(el:HTMLElement){const r=el.getBoundingClientRect(),host=this.host.getBoundingClientRect();return{x:r.left-host.left,y:host.bottom-r.bottom,w:r.width,h:r.height};}
  private draw=()=>{
    this.frame=0;if(this.disposed||this.contextLost)return;const start=performance.now();this.renderer.info.reset();
    const a=this.viewport(this.studioView);
    if(a.w<1||a.h<1)return;
    if(this.editor instanceof T.PerspectiveCamera)this.editor.aspect=a.w/a.h;
    else {this.orthographic.left=-3*a.w/a.h;this.orthographic.right=3*a.w/a.h;this.orthographic.top=3;this.orthographic.bottom=-3;}
    this.editor.updateProjectionMatrix();
    const quality=QUALITY[this.interacting?'Draft':qualityName(this.document.render.quality)];
    const sw=Math.round(a.w*this.renderer.getPixelRatio()*(this.interacting?.65:1)),sh=Math.round(a.h*this.renderer.getPixelRatio()*(this.interacting?.65:1));
    if(this.studioTarget.width!==sw||this.studioTarget.height!==sh){this.studioTarget.setSize(sw,sh);this.studioDirty=true;}
    if(this.studioDirty){this.renderLighting(this.studioTarget,this.editor,true,[0,0]);this.studioDirty=false;}
    this.renderer.setRenderTarget(null);this.renderer.setScissorTest(true);this.renderer.setViewport(a.x,a.y,a.w,a.h);this.renderer.setScissor(a.x,a.y,a.w,a.h);this.renderer.setClearColor('#252d31');this.renderer.clear();
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.displayMaterial.map=this.studioTarget.texture;this.renderer.render(this.displayScene,this.screenCamera);
    const selectedObject=this.object(this.selected);this.selectionBox.visible=!!selectedObject;
    if(selectedObject)this.selectionBox.box.setFromObject(selectedObject,true);
    const selectedLight=this.document.lights.find(l=>l.id===this.selected);
    this.aimingArrow.visible=this.aimingTarget.visible=!!selectedLight;
    if(selectedLight){
      const origin=new T.Vector3(...selectedLight.transform.positionM),target=new T.Vector3(...aimPoint(this.document,selectedLight.aiming?.target));
      this.aimingArrow.position.copy(origin);
      this.aimingArrow.setDirection(new T.Vector3(0,0,-1).applyQuaternion(new T.Quaternion(...selectedLight.transform.quaternion)));
      this.aimingArrow.setLength(Math.max(.1,origin.distanceTo(target)),.14,.07);
      this.aimingTarget.position.copy(target);
    }
    this.renderer.clearDepth();this.renderer.render(this.overlay,this.editor);
    const b=this.viewport(this.previewView);this.renderer.setViewport(b.x,b.y,b.w,b.h);this.renderer.setScissor(b.x,b.y,b.w,b.h);this.renderer.setClearColor('#111516');this.renderer.clear();
    let w=b.w,h=w/1.5;if(h>b.h){h=b.h;w=h*1.5;}
    {
      const rw=Math.max(1,Math.min(quality.maxWidth,Math.round(w*this.renderer.getPixelRatio()*quality.scale))),rh=Math.max(1,Math.round(rw/1.5));
      if(this.sampleTarget.samples!==quality.samples){this.sampleTarget.dispose();this.sampleTarget.samples=quality.samples;this.batch=0;}
      if(this.sampleTarget.width!==rw||this.sampleTarget.height!==rh){this.sampleTarget.setSize(rw,rh);this.history.forEach(t=>t.setSize(rw,rh));this.batch=0;}
      if(this.batch<quality.batches){
        // Eight deterministic strata offsets, nine points per batch. Accumulate before tone mapping.
        const jitter=[[-.31,.17],[.23,-.29],[-.09,-.11],[.37,.39],[-.42,-.37],[.06,.33],[.29,.02],[-.22,-.43]][this.batch];
        this.inspectionCamera.copy(this.shot);
        if(this.inspect>1){
          // Sensor crop about the projected face. The capture camera is never mutated.
          this.shot.updateMatrixWorld();const face=new T.Vector3(0,1.617,.09).applyMatrix4(this.human.root.matrixWorld).project(this.shot);
          const zoom=this.inspect;this.inspectionCamera.setViewOffset(1500,1000,(face.x+1)*750-750/zoom,(1-face.y)*500-500/zoom,1500/zoom,1000/zoom);
        }else this.inspectionCamera.clearViewOffset();
        this.renderLighting(this.sampleTarget,this.inspectionCamera,false,jitter);
        const destination=this.history[this.batch%2],previous=this.history[(this.batch+1)%2];
        if(this.batch===0){this.renderer.setRenderTarget(previous);this.renderer.setClearColor(0);this.renderer.clear();}
        this.composite.uniforms.previous.value=previous.texture;this.composite.uniforms.sampleFrame.value=this.sampleTarget.texture;this.composite.uniforms.weight.value=1/(this.batch+1);
        this.renderer.setRenderTarget(destination);this.renderer.clear();this.renderer.render(this.compositeScene,this.screenCamera);this.batch++;
      }
      this.displayMaterial.map=this.history[(this.batch-1)%2].texture;this.renderer.setRenderTarget(null);this.renderer.setScissorTest(true);this.renderer.setViewport(b.x+(b.w-w)/2,b.y+(b.h-h)/2,w,h);this.renderer.setScissor(b.x+(b.w-w)/2,b.y+(b.h-h)/2,w,h);this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.render(this.displayScene,this.screenCamera);
    }
    this.helpers.visible=true;this.cameraRig.visible=true;
    this.frames++;const ms=performance.now()-start;this.elapsed.push(ms);if(this.elapsed.length>60)this.elapsed.shift();
    if(start-this.lastStats>250||this.frames<3||this.batch===quality.batches){this.callbacks.stats({ms:this.elapsed.reduce((a,b)=>a+b,0)/this.elapsed.length,triangles:this.renderer.info.render.triangles,calls:this.renderer.info.render.calls,samples:this.batch*(quality===QUALITY.Draft?1:9),frames:this.frames});this.lastStats=start;}
    if(this.batch<quality.batches)this.invalidate();
  };
  dispose(){this.disposed=true;clearTimeout(this.interactionTimer);cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.orbit.dispose();this.gizmo.dispose();this.disposers.forEach(f=>f());this.human.dispose();this.aimingArrow.dispose();this.aimingTarget.geometry.dispose();this.aimingTarget.material.dispose();
    const geometry=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.LineSegments){geometry.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.lights.forEach(l=>l.shadow.dispose());this.studioTarget.dispose();this.selectionBox.geometry.dispose();(this.selectionBox.material as T.LineBasicMaterial).dispose();this.sampleTarget.dispose();this.history.forEach(t=>t.dispose());this.composite.dispose();this.displayMaterial.dispose();this.compositeScene.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});this.displayScene.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});this.renderer.dispose();this.renderer.domElement.remove();
  }
}
function documentOwner(){return window.document;}
/** Fixed RGB approximation normalized in linear light, not a spectral simulation. */
function kelvin(k:number){
  const t=k/100; const r=t<=66?255:329.698727446*((t-60)**-.1332047592),g=t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*((t-60)**-.0755148492),b=t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307;
  const c=new T.Color().setRGB(T.MathUtils.clamp(r/255,0,1),T.MathUtils.clamp(g/255,0,1),T.MathUtils.clamp(b/255,0,1),T.SRGBColorSpace);return c.multiplyScalar(1/(c.r*.2126+c.g*.7152+c.b*.0722));
}
