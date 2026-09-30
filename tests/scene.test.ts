import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3, Euler } from 'three';
import { emitterSamples, exposure, eulerToQuat, quatToEuler, lookAt, makePortraitScene, sourcePower, verticalFov, withTransform } from '../src/domain/scene';

describe('photographic exposure',()=>{
  it('doubles with ISO and gains two stops from f8 to f4',()=>{const c=makePortraitScene().camera;expect(exposure({...c,iso:c.iso*2})/exposure(c)).toBeCloseTo(2);expect(exposure({...c,fNumber:8})/exposure({...c,fNumber:4})).toBeCloseTo(.25);});
  it('shutter affects continuous but not synchronized flash',()=>{const c=makePortraitScene().camera;expect(exposure({...c,shutterSeconds:c.shutterSeconds*2})/exposure(c)).toBe(2);expect(exposure({...c,shutterSeconds:1/60},'strobe')).toBe(exposure(c,'strobe'));});
  it('light switched off is zero, independent of power',()=>{const s=makePortraitScene();s.lights[0].enabled=false;expect(sourcePower(s.lights[0])).toBe(0);});
});
describe('geometry and scene isolation',()=>{
  it('narrows field of view monotonically across all four lenses',()=>{const fs=[35,50,85,105].map(f=>verticalFov(f));expect(fs).toEqual([...fs].sort((a,b)=>b-a));expect(verticalFov(50)).toBeCloseTo(26.991,2);});
  it('conserves energy as area and sample count change',()=>{for(const n of [2,3,4]){const samples=emitterSamples(1.2,n);expect(samples.reduce((s,p)=>s+p.weight,0)).toBeCloseTo(1);expect(samples.every(s=>Math.abs(s.position[0])<.6&&Math.abs(s.position[1])<.6)).toBe(true);}expect(Math.abs(emitterSamples(1.8)[0].position[0])).toBeGreaterThan(Math.abs(emitterSamples(.3)[0].position[0]));});
  it('aims local -Z at the target, without roll',()=>{for(const p of [[-1.25,2.15,1.3],[0,1.38,3.4],[1,2,-1]] as [number,number,number][]){const target:[number,number,number]=[0,1.4,0];const q=new Quaternion(...lookAt(p,target));const dir=new Vector3(0,0,-1).applyQuaternion(q);expect(dir.dot(new Vector3(...target).sub(new Vector3(...p)).normalize())).toBeCloseTo(1,6);}});
  it('rotation fields use XYZ degrees and round-trip including near gimbal lock',()=>{for(const angles of [[20,30,-15],[0,89,0],[15,90,0]] as [number,number,number][]){const q=eulerToQuat(angles);const native=new Quaternion().setFromEuler(new Euler(...angles.map(a=>a*Math.PI/180) as [number,number,number],'XYZ'));expect(Math.abs(new Quaternion(...q).dot(native))).toBeCloseTo(1);expect(Math.abs(new Quaternion(...eulerToQuat(quatToEuler(q))).dot(native))).toBeCloseTo(1,5);}});
  it('editing/resetting do not mutate the seed or unrelated objects',()=>{const a=makePortraitScene();const b=withTransform(a,'light-key',{positionM:[1,2,3],quaternion:[0,0,0,1]});expect(a.camera).toEqual(b.camera);expect(a.lights[0].transform.positionM).not.toEqual(b.lights[0].transform.positionM);expect(makePortraitScene()).toEqual(a);});
  it('serializes without renderer objects or loss',()=>{const s=makePortraitScene();expect(JSON.parse(JSON.stringify(s))).toEqual(s);});
});
