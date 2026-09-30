export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Selection = 'softbox' | 'camera' | 'model';
export interface Transform { positionM: Vec3; quaternion: Quat }
export interface CameraSpec {
  id: string; transform: Transform; sensorWidthMm: number; sensorHeightMm: number;
  focalLengthMm: number; fNumber: number; shutterSeconds: number; iso: number;
  whiteBalanceK: number; exposureCompEv: number;
}
export interface SceneDocument {
  schemaVersion: 1; id: string; name: string; units: 'm'; catalogVersion: string;
  createdAt: string; updatedAt: string;
  model: { id: string; assetId: string; transform: Transform; heightCm: number; bodyPreset: string; skinColor: string; hairStyle: string; hairColor: string };
  camera: CameraSpec;
  lights: [{ id: string; name: string; enabled: boolean; fixtureId: string; transform: Transform;
    source: { mode: 'continuous'; dimmerPercent: number; temperatureK: number } | { mode: 'strobe'; powerEv: number; temperatureK: number };
    modifier: { presetId: 'softbox-120'; widthM: number; heightM: number; gridId: null } }];
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
    schemaVersion:1,id:'portrait-01',name:'Portrait study',units:'m',catalogVersion:'mvp-generic-1',createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',
    camera:{id:'camera-01',transform:{positionM:cam,quaternion:lookAt(cam,[0,1.22,0])},sensorWidthMm:36,sensorHeightMm:24,focalLengthMm:50,fNumber:4,shutterSeconds:1/125,iso:200,whiteBalanceK:5600,exposureCompEv:0},
    model:{id:'model-01',assetId:'human-base-01',transform:{positionM:[0,0,0],quaternion:[0,0,0,1]},heightCm:175,bodyPreset:'regular',skinColor:'#BD8867',hairStyle:'short',hairColor:'#201916'},
    lights:[{id:'light-key',name:'Key light',enabled:true,fixtureId:'generic-led-200',transform:{positionM:light,quaternion:lookAt(light,[0,1.4,0])},source:{mode:'continuous',dimmerPercent:70,temperatureK:5600},modifier:{presetId:'softbox-120',widthM:1.2,heightM:1.2,gridId:null}}],
    environment:{backgroundColor:'#887b6f',floorColor:'#887b6f',floorFollowsBackground:true,widthM:8,heightM:5,depthM:10,curveRadiusM:1},
    render:{quality:'balanced',previewMode:'capture',seed:42},
  };
}
export function getTransform(s: SceneDocument, selected: Selection): Transform { return selected==='softbox'? s.lights[0].transform : s[selected].transform; }
export function withTransform(s: SceneDocument, selected: Selection, t: Transform): SceneDocument {
  return selected==='softbox' ? {...s,lights:[{...s.lights[0],transform:t}]} : {...s,[selected]:{...s[selected],transform:t}};
}
/** Uniform strata conserve total source energy while the physical aperture changes. */
export function emitterSamples(size: number, count=3) {
  const result: {position:Vec3;weight:number}[]=[];
  for(let y=0;y<count;y++) for(let x=0;x<count;x++) result.push({position:[((x+.5)/count-.5)*size,((y+.5)/count-.5)*size,-.035],weight:1/(count*count)});
  return result;
}
export function sourcePower(s: SceneDocument) {
  const l=s.lights[0]; return !l.enabled?0:l.source.mode==='continuous'?l.source.dimmerPercent/100:2**l.source.powerEv;
}
