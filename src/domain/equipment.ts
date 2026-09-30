export type EquipmentId = 'reflector' | 'softbox' | 'octabox' | 'stripbox' | 'beauty-dish' | 'umbrella' | 'snoot';
export type Shape = 'rectangle' | 'octagon' | 'dish' | 'umbrella' | 'cone';
export interface SizePreset { id:string; label:string; widthM:number; heightM:number }
export interface EquipmentDefinition {
  id:EquipmentId; category:'modifier'; displayName:string; shape:Shape; dimensions:SizePreset[];
  defaultSpreadDeg:number; profile:'flat'|'center'|'ring'|'broad'; gridCompatible:boolean;
  renderer:{penumbra:number; gain:number; depthM:number; apertureRatio:number};
  manufacturer:string|null; model:string|null; calibration:{status:'uncalibrated'; version:number};
}
const round=(cm:number):SizePreset=>({id:String(cm),label:`${cm}cm`,widthM:cm/100,heightM:cm/100});
const rect=(w:number,h:number):SizePreset=>({id:`${w}x${h}`,label:`${w} × ${h}cm`,widthM:w/100,heightM:h/100});
const define=(id:EquipmentId,displayName:string,shape:Shape,dimensions:SizePreset[],defaultSpreadDeg:number,profile:EquipmentDefinition['profile'],gridCompatible:boolean,penumbra:number,gain:number,depthM:number,apertureRatio=1):EquipmentDefinition=>({id,category:'modifier',displayName,shape,dimensions,defaultSpreadDeg,profile,gridCompatible,renderer:{penumbra,gain,depthM,apertureRatio},manufacturer:null,model:null,calibration:{status:'uncalibrated',version:1}});
export const EQUIPMENT:EquipmentDefinition[]=[
  define('reflector','Bare Reflector','cone',[round(18),round(25)],55,'center',true,.2,1.3,.18,.4),
  define('softbox','Rectangular Softbox','rectangle',[rect(60,90),rect(90,120),rect(120,120),rect(120,180)],110,'flat',true,.55,1,.32),
  define('octabox','Octabox','octagon',[round(90),round(120),round(150)],100,'flat',true,.65,1,.4),
  define('stripbox','Stripbox','rectangle',[rect(30,120),rect(40,180),rect(60,180)],85,'flat',true,.5,1,.3),
  define('beauty-dish','Beauty Dish','dish',[round(42),round(55),round(70)],80,'ring',true,.7,1.15,.17),
  define('umbrella','Umbrella','umbrella',[round(85),round(105),round(150)],150,'broad',false,.9,.85,.45),
  define('snoot','Snoot','cone',[round(6),round(10)],18,'center',false,.15,1.6,.38,.8),
];
export const ACCESSORIES={grid:{id:'grid' as const,displayName:'Grid',spreadMultiplier:.4,transmission:.78,penumbra:.4}};
export interface ModifierSpec { equipmentId:EquipmentId; sizeId:string; widthM:number; heightM:number; accessories:{id:'grid';enabled:boolean}[] }
export function equipment(id:EquipmentId){const d=EQUIPMENT.find(d=>d.id===id);if(!d)throw new Error(`Unknown equipment: ${id}`);return d;}
export function makeModifier(id:EquipmentId='softbox',sizeId?:string):ModifierSpec {
  const d=equipment(id),s=d.dimensions.find(s=>s.id===sizeId)??d.dimensions[0];
  return {equipmentId:id,sizeId:s.id,widthM:s.widthM,heightM:s.heightM,accessories:[]};
}
export function switchModifier(m:ModifierSpec,id:EquipmentId,sizeId?:string):ModifierSpec {
  const next=makeModifier(id,sizeId);next.accessories=equipment(id).gridCompatible?structuredClone(m.accessories):[];return next;
}
export function gridEnabled(m:ModifierSpec){return equipment(m.equipmentId).gridCompatible&&m.accessories.some(a=>a.id==='grid'&&a.enabled);}
export function withGrid(m:ModifierSpec,enabled:boolean):ModifierSpec{return {...m,accessories:equipment(m.equipmentId).gridCompatible?[{id:'grid',enabled}]:[]};}
export function modifierLabel(m:ModifierSpec){const d=equipment(m.equipmentId);return `${d.displayName} ${Math.round(m.widthM*100)}${m.widthM===m.heightM?'':` × ${Math.round(m.heightM*100)}`}cm${gridEnabled(m)?' + Grid':''}`;}
export function opticalParameters(m:ModifierSpec){const d=equipment(m.equipmentId),g=gridEnabled(m);return {spreadDeg:d.defaultSpreadDeg*(g?ACCESSORIES.grid.spreadMultiplier:1),penumbra:g?ACCESSORIES.grid.penumbra:d.renderer.penumbra,gain:d.renderer.gain*(g?ACCESSORIES.grid.transmission:1)};}
/** Nine stratified aperture samples per pass. Circular apertures use equal-area polar strata;
 * dish uses an annulus around its central deflector; octagon clips radial extent to eight edges.
 * Total source weight remains one for every size. No image-space shadow blur. */
export function apertureSamples(m:ModifierSpec,jitter=[0,0]) {
  const d=equipment(m.equipmentId),samples=[];
  for(let i=0;i<9;i++){
    const u=(i%3+.5+jitter[0])/3,v=(Math.floor(i/3)+.5+jitter[1])/3;
    let x=u-.5,y=v-.5,z=-.035;
    if(d.shape!=='rectangle'){
      const theta=2*Math.PI*u,inner=d.profile==='ring'?.25:0;
      let r=.5*Math.sqrt(inner*inner+(1-inner*inner)*v);
      if(d.shape==='octagon')r*=Math.cos(Math.PI/8)/Math.cos((theta+Math.PI/8)%(Math.PI/4)-Math.PI/8);
      x=r*Math.cos(theta);y=r*Math.sin(theta);
      if(d.shape==='umbrella')z+=.2*(1-4*r*r);
    }
    samples.push({position:[x*m.widthM*d.renderer.apertureRatio,y*m.heightM*d.renderer.apertureRatio,z] as [number,number,number],weight:1/9});
  }
  return samples;
}
/** Reserved for a future corneal reflection renderer; never a screen-space eye overlay. */
export function catchlightDescriptor(m:ModifierSpec){return {shape:equipment(m.equipmentId).shape,widthM:m.widthM,heightM:m.heightM,centralOcclusion:m.equipmentId==='beauty-dish'?.25:0,grid:gridEnabled(m),samples:apertureSamples(m)};}
