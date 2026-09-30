import { makeModifier, switchModifier, withGrid } from './equipment';
import type { ModifierSpec } from './equipment';
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Selection = 'camera' | 'model' | `light-${string}`;
export type StudioView = 'Perspective' | 'Top' | 'Front' | 'Side';
export interface LightSpec {
  id: `light-${string}`; name: string; enabled: boolean; fixtureId: string; transform: Transform;
  source: { mode: 'continuous'; dimmerPercent: number; temperatureK: number } | { mode: 'strobe'; powerEv: number; temperatureK: number };
  modifier: ModifierSpec;
}
export interface Transform { positionM: Vec3; quaternion: Quat }
export interface CameraSpec {
  id: string; transform: Transform; sensorWidthMm: number; sensorHeightMm: number;
  focalLengthMm: number; fNumber: number; shutterSeconds: number; iso: number;
  whiteBalanceK: number; exposureCompEv: number;
}
export interface SceneDocument {
  schemaVersion: 2; id: string; name: string; units: 'm'; catalogVersion: string;
  createdAt: string; updatedAt: string;
  model: { id: string; assetId: string; transform: Transform; heightCm: number; bodyPreset: string; skinColor: string; hairStyle: string; hairColor: string };
  camera: CameraSpec;
  lights: LightSpec[];
  environment: { backgroundColor: string; floorColor: string; floorFollowsBackground: boolean; widthM: number; heightM: number; depthM: number; curveRadiusM: number };
  render: { quality: 'balanced' | 'low'; previewMode: 'capture'; seed: number };
}

export function exposure(camera: CameraSpec, mode: 'continuous' | 'strobe' = 'continuous') {
  return (camera.iso / 100) * (8 / camera.fNumber) ** 2 * (mode === 'continuous' ? camera.shutterSeconds * 125 : 1) * 2 ** camera.exposureCompEv;
}
export function verticalFov(focalLengthMm: number, sensorHeightMm = 24) { return 2 * Math.atan(sensorHeightMm / (2 * focalLengthMm)) * 180 / Math.PI; }
export function eulerToQuat([x, y, z]: Vec3): Quat {
  const [a, b, c] = [x, y, z].map(v => v * Math.PI / 360);
  const [c1, c2, c3] = [a, b, c].map(Math.cos), [s1, s2, s3] = [a, b, c].map(Math.sin);
  return [s1*c2*c3+c1*s2*s3, c1*s2*c3-s1*c2*s3, c1*c2*s3+s1*s2*c3, c1*c2*c3-s1*s2*s3];
}
export function quatToEuler([x,y,z,w]: Quat): Vec3 {
  const m13=2*(x*z+y*w), m23=2*(y*z-x*w), m33=1-2*(x*x+y*y), m12=2*(x*y-z*w), m11=1-2*(y*y+z*z);
  const yy=Math.asin(Math.max(-1,Math.min(1,m13)));
  const xx=Math.abs(m13)<.9999999 ? Math.atan2(-m23,m33) : Math.atan2(2*(y*z+x*w),1-2*(x*x+z*z));
  const zz=Math.abs(m13)<.9999999 ? Math.atan2(-m12,m11) : 0;
  return [xx,yy,zz].map(v=>v*180/Math.PI) as Vec3;
}
export function lookAt(position: Vec3, target: Vec3): Quat {
  const [dx,dy,dz]=position.map((v,i)=>v-target[i]);
  // YXZ look-at rotation, local -Z forward.
  const yaw=Math.atan2(dx,dz), pitch=-Math.atan2(dy,Math.hypot(dx,dz));
  const s1=Math.sin(pitch/2),c1=Math.cos(pitch/2),s2=Math.sin(yaw/2),c2=Math.cos(yaw/2);
  return [s1*c2,c1*s2,-s1*s2,c1*c2];
}
export function makePortraitScene(): SceneDocument {
  const cam:Vec3=[0,1.38,3.4], light:Vec3=[-1.25,2.15,1.3];
  return {
    schemaVersion:2,id:'portrait-01',name:'Portrait study',units:'m',catalogVersion:'generic-equipment-1',createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',
    camera:{id:'camera-01',transform:{positionM:cam,quaternion:lookAt(cam,[0,1.22,0])},sensorWidthMm:36,sensorHeightMm:24,focalLengthMm:50,fNumber:4,shutterSeconds:1/125,iso:200,whiteBalanceK:5600,exposureCompEv:0},
    model:{id:'model-01',assetId:'human-base-01',transform:{positionM:[0,0,0],quaternion:[0,0,0,1]},heightCm:175,bodyPreset:'regular',skinColor:'#BD8867',hairStyle:'short',hairColor:'#201916'},
    lights:[{id:'light-key',name:'Key light',enabled:true,fixtureId:'generic-led-200',transform:{positionM:light,quaternion:lookAt(light,[0,1.4,0])},source:{mode:'continuous',dimmerPercent:70,temperatureK:5600},modifier:makeModifier('softbox','120x120')}],
    environment:{backgroundColor:'#887b6f',floorColor:'#887b6f',floorFollowsBackground:true,widthM:8,heightM:5,depthM:10,curveRadiusM:1},
    render:{quality:'balanced',previewMode:'capture',seed:42},
  };
}
export function getTransform(s: SceneDocument, selected: Selection): Transform { return selected==='camera'||selected==='model'?s[selected].transform:s.lights.find(l=>l.id===selected)?.transform??s.model.transform; }
export function withTransform(s: SceneDocument, selected: Selection, t: Transform): SceneDocument {
  return selected==='camera'||selected==='model' ? {...s,[selected]:{...s[selected],transform:t}} : updateLight(s,selected,{transform:t});
}
export function updateLight(s:SceneDocument,id:LightSpec['id'],patch:Partial<Omit<LightSpec,'id'>>):SceneDocument {
  return {...s,lights:s.lights.map(l=>l.id===id?{...l,...patch}:l)};
}
export function addLight(s:SceneDocument,id:LightSpec['id']=`light-${crypto.randomUUID()}`):SceneDocument {
  const l=structuredClone(makePortraitScene().lights[0]);l.id=id;l.name=`Light ${s.lights.length+1}`;
  let suffix=s.lights.length+1;while(s.lights.some(existing=>existing.name===l.name))l.name=`Light ${++suffix}`;
  l.transform.positionM=[1.4,2,1.3];l.transform.quaternion=lookAt(l.transform.positionM,[0,1.4,0]);
  l.source={mode:'continuous',dimmerPercent:30,temperatureK:5600};return {...s,lights:[...s.lights,l]};
}
export function duplicateLight(s:SceneDocument,id:LightSpec['id'],newId:LightSpec['id']=`light-${crypto.randomUUID()}`):SceneDocument {
  const source=s.lights.find(l=>l.id===id);if(!source)return s;
  const copy=structuredClone(source);copy.id=newId;copy.name=`${source.name} copy`;copy.transform.positionM[0]=Math.min(4,copy.transform.positionM[0]+.3);
  return {...s,lights:[...s.lights,copy]};
}
export function deleteLight(s:SceneDocument,id:LightSpec['id']):SceneDocument {return {...s,lights:s.lights.filter(l=>l.id!==id)};}
export function hasStrobe(s:SceneDocument){return s.lights.some(l=>l.enabled&&l.source.mode==='strobe');}
export function makeThreeLightScene():SceneDocument {
  let s=makePortraitScene();s.name='Three-light portrait';s=addLight(s,'light-fill');s=addLight(s,'light-rim');
  s.lights[0].name='Key Light';s.lights[1].name='Fill Light';s.lights[1].source={mode:'continuous',dimmerPercent:22,temperatureK:5600};
  const rim=s.lights[2];rim.name='Rim Light';rim.transform.positionM=[.8,2.2,-1.2];rim.transform.quaternion=lookAt(rim.transform.positionM,[0,1.45,0]);rim.modifier.widthM=.6;rim.modifier.heightM=.6;rim.modifier.sizeId='custom';rim.source={mode:'continuous',dimmerPercent:45,temperatureK:5600};return s;
}
/** Uniform strata conserve total source energy while the physical aperture changes. */
export function emitterSamples(size: number, count=3) {
  const result: {position:Vec3;weight:number}[]=[];
  for(let y=0;y<count;y++) for(let x=0;x<count;x++) result.push({position:[((x+.5)/count-.5)*size,((y+.5)/count-.5)*size,-.035],weight:1/(count*count)});
  return result;
}
export function sourcePower(l: LightSpec) {
  return !l.enabled?0:l.source.mode==='continuous'?l.source.dimmerPercent/100:2**l.source.powerEv;
}

export type LightingPreset='soft'|'beauty'|'dramatic';
export function makeEquipmentScene(preset:LightingPreset):SceneDocument {
  let s=makePortraitScene();const key=s.lights[0];key.name='Key Light';
  if(preset==='soft'){s.name='Soft Portrait';key.modifier=makeModifier('softbox','120x180');}
  if(preset==='beauty'){
    s.name='Beauty Portrait';key.modifier=makeModifier('beauty-dish','55');key.transform.positionM=[-.45,2.05,1.3];key.transform.quaternion=lookAt(key.transform.positionM,[0,1.5,0]);
    s=addLight(s,'light-fill');s.lights[1].name='Fill Light';s.lights[1].modifier=makeModifier('umbrella','105');s.lights[1].source={mode:'continuous',dimmerPercent:12,temperatureK:5600};
  }
  if(preset==='dramatic'){
    s.name='Dramatic Strip / Rim';key.modifier=withGrid(makeModifier('stripbox','30x120'),true);key.transform.positionM=[-1.15,1.75,.35];key.transform.quaternion=lookAt(key.transform.positionM,[0,1.4,0]);
    s=addLight(s,'light-rim');const rim=s.lights[1];rim.name='Rim Light';rim.modifier=withGrid(makeModifier('stripbox','40x180'),true);rim.transform.positionM=[.8,1.8,-.8];rim.transform.quaternion=lookAt(rim.transform.positionM,[0,1.4,0]);rim.source={mode:'continuous',dimmerPercent:55,temperatureK:5600};
  }
  return s;
}
/** Explicit v1 adapter preserves custom apertures and transforms; no renderer objects enter JSON. */
export function migrateScene(input:unknown):SceneDocument {
  const s=structuredClone(input) as SceneDocument & {schemaVersion:number};
  if(!s||![1,2].includes(s.schemaVersion)||!Array.isArray(s.lights))throw new Error('Unsupported scene schema');
  s.lights=s.lights.map(l=>{
    const m=l.modifier as unknown as ModifierSpec & {presetId?:string;gridId?:string|null};
    if(!m.equipmentId){if(m.presetId!=='softbox-120')throw new Error('Unknown legacy modifier');return {...l,modifier:{...makeModifier('softbox','120x120'),widthM:m.widthM,heightM:m.heightM,sizeId:'custom'}};}
    const next=switchModifier(m,m.equipmentId,m.sizeId);
    if(!Number.isFinite(m.widthM)||!Number.isFinite(m.heightM)||m.widthM<=0||m.heightM<=0)throw new Error('Invalid aperture');
    return {...l,modifier:{...next,widthM:m.widthM,heightM:m.heightM,sizeId:m.sizeId}};
  });
  s.schemaVersion=2;s.catalogVersion='generic-equipment-1';return s;
}
