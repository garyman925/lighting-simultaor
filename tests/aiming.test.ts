import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { aimLight, aimPoint, applyLightingPreset, cameraBasis, horizontalShortcuts, lightAngles, placeLight, snapRadians, syncAutoAim, verticalShortcuts } from '../src/domain/aiming';
import { duplicateLight, eulerToQuat, makeEquipmentScene, makePortraitScene, makeThreeLightScene, migrateScene, withTransform } from '../src/domain/scene';
import type { LightSpec, SceneDocument } from '../src/domain/scene';
import { makeModifier, withGrid } from '../src/domain/equipment';

function pointsAtTarget(s:SceneDocument,l:LightSpec){
  const expected=new Vector3(...aimPoint(s,l.aiming?.target)).sub(new Vector3(...l.transform.positionM)).normalize();
  expect(new Vector3(0,0,-1).applyQuaternion(new Quaternion(...l.transform.quaternion)).dot(expected)).toBeCloseTo(1,10);
}
describe('photography aiming',()=>{
  it.each(horizontalShortcuts)('places horizontal %s relative to camera with unchanged radius/elevation',h=>{
    const s=makePortraitScene(),original=s.lights[0],before=lightAngles(s,original),l=placeLight(s,original,{horizontal:h}),after=lightAngles(s,l);
    expect(after.horizontal).toBeCloseTo(h);expect(after.vertical).toBeCloseTo(before.vertical);expect(after.distance).toBeCloseTo(before.distance);pointsAtTarget(s,l);
    if(h===45)expect(l.transform.positionM[0]).toBeGreaterThan(0);
    if(h===-45)expect(l.transform.positionM[0]).toBeLessThan(0);
  });
  it.each(verticalShortcuts)('combines horizontal -45 and elevation %s in either order',v=>{
    const s=makePortraitScene(),l=placeLight(s,placeLight(s,s.lights[0],{horizontal:-45}),{vertical:v});
    const reverse=placeLight(s,placeLight(s,s.lights[0],{vertical:v}),{horizontal:-45});
    expect(lightAngles(s,l).horizontal).toBeCloseTo(-45);expect(lightAngles(s,l).vertical).toBeCloseTo(v);
    l.transform.positionM.forEach((n,i)=>expect(n).toBeCloseTo(reverse.transform.positionM[i]));pointsAtTarget(s,l);
  });
  it('supports 37 degrees and camera-relative axes after camera/model translation',()=>{
    const s=makePortraitScene();s.model.transform.positionM=[1,0,2];s.camera.transform.positionM=[4,2,2];
    const front=placeLight(s,s.lights[0],{horizontal:0,vertical:0,distance:2});expect(front.transform.positionM[0]).toBeCloseTo(3);expect(front.transform.positionM[2]).toBeCloseTo(2.1);
    const right=placeLight(s,front,{horizontal:90});expect(right.transform.positionM[2]).toBeLessThan(0.2);
    const custom=placeLight(s,right,{horizontal:37,vertical:23.5});expect(lightAngles(s,custom).horizontal).toBeCloseTo(37);expect(lightAngles(s,custom).vertical).toBeCloseTo(23.5);pointsAtTarget(s,custom);
  });
  it.each(['face','chest','center'] as const)('aims at transformed %s landmark without moving the fixture',target=>{
    const s=makePortraitScene();s.model.heightCm=200;s.model.transform.positionM=[1,.2,-1];s.model.transform.quaternion=eulerToQuat([0,60,0]);
    const l=aimLight(s,s.lights[0],target);expect(l.transform.positionM).toEqual(s.lights[0].transform.positionM);pointsAtTarget(s,l);
  });
  it('auto aim follows light/model motion and scale; manual rotation disables only that light',()=>{
    let s=makeThreeLightScene();s.lights[0].aiming={target:'face',auto:true};
    s=withTransform(s,'light-key',{...s.lights[0].transform,positionM:[-2,3,1]});pointsAtTarget(s,s.lights[0]);
    s=syncAutoAim({...s,model:{...s.model,heightCm:195}});pointsAtTarget(s,s.lights[0]);
    s=withTransform(s,'model',{...s.model.transform,positionM:[.3,.2,0]});pointsAtTarget(s,s.lights[0]);
    const fill=s.lights[1];const q=eulerToQuat([10,20,30]);s=withTransform(s,'light-key',{...s.lights[0].transform,quaternion:q},true);
    expect(s.lights[0].aiming?.auto).toBe(false);expect(s.lights[0].transform.quaternion).toEqual(q);expect(s.lights[1]).toBe(fill);
    const moved=withTransform(s,'light-key',{...s.lights[0].transform,positionM:[2,2,2]});expect(moved.lights[0].transform.quaternion).toEqual(q);
  });
  it('duplicate auto aim remains independent and re-aims at its offset position',()=>{
    const s=makePortraitScene();s.lights[0].aiming={target:'chest',auto:true};const next=duplicateLight(s,'light-key','light-copy');
    pointsAtTarget(next,next.lights[1]);expect(next.lights[1].aiming).not.toBe(s.lights[0].aiming);
  });
  it.each(['reflector','softbox','octabox','stripbox','beauty-dish','umbrella','snoot'] as const)('preserves %s equipment and grid while aiming',id=>{
    const s=makePortraitScene(),l={...s.lights[0],modifier:withGrid(makeModifier(id),true)};
    const next=placeLight(s,l,{horizontal:135,vertical:30});expect(next.modifier).toEqual(l.modifier);pointsAtTarget(s,next);
  });
  it.each(['soft','beauty','dramatic'] as const)('rebases %s preset while preserving camera/model/exposure',id=>{
    const s=makePortraitScene();s.camera.transform.positionM=[3,2,0];s.model.heightCm=190;
    const preset=makeEquipmentScene(id),next=applyLightingPreset(s,preset);expect(next.camera).toBe(s.camera);expect(next.model).toBe(s.model);
    next.lights.forEach((l,i)=>{const a=lightAngles(next,l),b=lightAngles(preset,preset.lights[i]);expect(a.horizontal).toBeCloseTo(b.horizontal);expect(a.vertical).toBeCloseTo(b.vertical);expect(a.distance).toBeCloseTo(b.distance);pointsAtTarget(next,l);});
  });
  it('handles degenerate axes, coincident light and invalid inputs without NaNs',()=>{
    const s=makePortraitScene();s.camera.transform.positionM=[0,2,0];s.camera.transform.quaternion=eulerToQuat([-90,0,0]);expect(cameraBasis(s).front.length()).toBeCloseTo(1);
    const l={...s.lights[0],transform:{...s.lights[0].transform,positionM:aimPoint(s)}};
    expect(aimLight(s,l).transform.quaternion).toEqual(l.transform.quaternion);const next=placeLight(s,l,{horizontal:37});expect(lightAngles(s,next).distance).toBeCloseTo(.1);pointsAtTarget(s,next);
    expect(placeLight(s,l,{vertical:NaN})).toBe(l);
  });
  it('exports aiming metadata and accepts existing v2 documents without it',()=>{
    const s=makePortraitScene();s.lights[0].aiming={target:'chest',auto:true};expect(migrateScene(JSON.parse(JSON.stringify(s))).lights[0].aiming).toEqual(s.lights[0].aiming);
    delete s.lights[0].aiming;expect(migrateScene(s).lights[0].transform).toEqual(s.lights[0].transform);
  });
  it('maps Off and each snap option to TransformControls units',()=>{
    expect(snapRadians(0)).toBeNull();for(const value of [5,15,45])expect(snapRadians(value)).toBeCloseTo(value*Math.PI/180);
  });
});
