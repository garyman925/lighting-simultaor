import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { SceneDocument, Vec3 } from './scene';
import { syncAutoAim } from './aiming';
import { defaultSkin } from './skin';

export const BODY_TYPES = {
  slim: { label:'Slim', waist:.86, shoulder:.92, depth:.86 },
  regular: { label:'Average', waist:1, shoulder:1, depth:1 },
  athletic: { label:'Athletic', waist:.94, shoulder:1.14, depth:1.09 },
  full: { label:'Full', waist:1.19, shoulder:1.07, depth:1.21 },
} as const;
export const POSES = { Front:0, '3/4 Left':45, '3/4 Right':-45, 'Profile Left':90, 'Profile Right':-90 } as const;
export const HEAD_POSES = { 'Head Straight':[0,0], 'Look Left':[25,0], 'Look Right':[-25,0], 'Chin Up':[0,15], 'Chin Down':[0,-15] } as const;
export const HAIR_STYLES = ['bald','short','bob','long','curly'] as const;
export const HAIR_COLOURS = { Black:'#201916', Brown:'#563626', Blonde:'#bca16a', Red:'#863e28', Grey:'#92918c' } as const;
export const HEAD_PIVOT:Vec3 = [0,1.46,0];
export type ModelSpec = SceneDocument['model'];
export function bodyShape(model:ModelSpec){return BODY_TYPES[model.bodyPreset as keyof typeof BODY_TYPES]??BODY_TYPES.regular;}
/** Smooth cross sections leave the neck/head and floor contact unchanged. */
export function bodyScaleAt(y:number, model:ModelSpec){
  const b=bodyShape(model),mix=(a:number,c:number,t:number)=>a+(c-a)*Math.max(0,Math.min(1,t));
  const shoulder=Math.exp(-(((y-1.31)/.12)**2));
  const neck=Math.max(0,Math.min(1,(y-1.35)/.075));
  return {x:mix(mix(b.waist,b.shoulder,shoulder),1,neck),z:mix(b.depth,1,neck)};
}
export function headRotation(model:ModelSpec){return new Euler(-(model.headPitch??0)*Math.PI/180,(model.headYaw??0)*Math.PI/180,0,'YXZ');}
export function poseRotation(model:ModelSpec){return (POSES[model.pose??'Front']??0)*Math.PI/180;}
/** Maps the original VS04A head coordinates to world, including the neck pivot. */
export function modelMatrices(model:ModelSpec){
  const root=new Matrix4().compose(new Vector3(...model.transform.positionM),new Quaternion(...model.transform.quaternion),new Vector3().setScalar(model.heightCm/175));
  const body=root.clone().multiply(new Matrix4().makeRotationY(poseRotation(model)));
  const head=body.clone().multiply(new Matrix4().makeTranslation(...HEAD_PIVOT))
    .multiply(new Matrix4().makeRotationFromEuler(headRotation(model)))
    .multiply(new Matrix4().makeTranslation(0,-HEAD_PIVOT[1],0));
  return {root,body,head};
}
export function modelLandmark(model:ModelSpec,target:'face'|'chest'|'center'):Vec3 {
  const matrices=modelMatrices(model);
  const point=target==='face'?new Vector3(0,1.60,.10):target==='chest'?new Vector3(0,1.28,.10*bodyScaleAt(1.28,model).z):new Vector3(0,.875,0);
  return point.applyMatrix4(target==='face'?matrices.head:matrices.body).toArray();
}
export function updateModel(scene:SceneDocument,patch:Partial<ModelSpec>):SceneDocument {
  const m={...scene.model,...patch};
  m.heightCm=Number.isFinite(m.heightCm)?Math.max(150,Math.min(200,m.heightCm)):175;
  m.headYaw=Number.isFinite(m.headYaw)?Math.max(-30,Math.min(30,m.headYaw!)):0;
  m.headPitch=Number.isFinite(m.headPitch)?Math.max(-15,Math.min(15,m.headPitch!)):0;
  return syncAutoAim({...scene,model:m});
}
export function resetModel(scene:SceneDocument):SceneDocument {
  const skin=defaultSkin();
  return updateModel(scene,{heightCm:175,bodyPreset:'regular',pose:'Front',headYaw:0,headPitch:0,hairStyle:'short',hairColor:HAIR_COLOURS.Black,skin,skinColor:skin.skinTone});
}
