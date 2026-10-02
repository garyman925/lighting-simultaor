import { describe,it,expect } from 'vitest';
import * as T from 'three';
import { makeHumanoid } from '../src/rendering/humanoid';
import { makeCorneaMaterial,updateCorneaEmitter } from '../src/rendering/cornea';
import { EQUIPMENT,emitterSurface,apertureSamples,makeModifier,withGrid } from '../src/domain/equipment';
import { makeCatchlightScene,makePortraitScene,lookAt,duplicateLight } from '../src/domain/scene';
import { QUALITY,qualityName } from '../src/rendering/quality';

describe('VS04A portrait foundation',()=>{
  it('has two separately layered curved corneas, iris, pupils and sclera, without emission',()=>{
    const human=makeHumanoid(),parts:T.Object3D[]=[];human.root.traverse(o=>parts.push(o));
    for(const name of ['Cornea','Iris','Pupil','Sclera','Orbital eyelid skin'])expect(parts.filter(o=>o.name===name)).toHaveLength(2);
    for(const cap of parts.filter(o=>o.name==='Cornea') as T.Mesh[]){expect(cap.layers.mask).toBe(2);expect(cap.castShadow).toBe(false);const p=cap.geometry.getAttribute('position');expect(p.getZ(0)).toBeGreaterThan(.007);}
    expect(human.cornea.transparent).toBe(true);expect(human.cornea.depthWrite).toBe(false);expect(human.skin.emissive.getHex()).toBe(0);
    human.dispose();
  });
  it('has finite nondegenerate facial geometry and unit normals',()=>{
    const human=makeHumanoid();human.root.traverse(o=>{if(o instanceof T.Mesh){const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');for(const i of new Set(o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:p.count},(_,i)=>i))){expect(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i))).toBe(true);expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i)),`${o.name} ${o.geometry.type} vertex ${i}`).toBeCloseTo(1,3);}}});human.dispose();
  });
  for(const d of EQUIPMENT)it(`${d.id}: direct samples lie on the same corneal emitter surface`,()=>{
    const m=makeModifier(d.id),s=emitterSurface(m);
    for(const p of apertureSamples(m,[.23,-.29])){
      const x=2*p.position[0]/s.widthM,y=2*p.position[1]/s.heightM,r=Math.hypot(x,y);
      if(s.shape==='rectangle')expect(Math.max(Math.abs(x),Math.abs(y))).toBeLessThanOrEqual(1);
      else if(s.shape==='octagon'){const angle=Math.atan2(y,x),sector=((angle+Math.PI/8)%(Math.PI/4)+Math.PI/4)%(Math.PI/4)-Math.PI/8;expect(r*Math.cos(sector)).toBeLessThanOrEqual(Math.cos(Math.PI/8)+1e-8);}
      else expect(r).toBeLessThanOrEqual(1);
      if(s.shape==='dish')expect(r).toBeGreaterThan(.25);
      expect(p.position[2]).toBeCloseTo(s.shape==='umbrella'?.165-.2*r*r:-.035);
    }
  });
  it('emitter inverse transform follows translation and rotation, including Aim at Face',()=>{
    const s=makeCatchlightScene(),m=makeCorneaMaterial(),l=s.lights[0];l.transform={positionM:[1,2,3],quaternion:lookAt([1,2,3],[0,1.6,.1])};
    updateCorneaEmitter(m,l,s.camera,new T.Color('white'),new T.Matrix4());
    const world=new T.Vector3(...l.transform.positionM);expect(world.applyMatrix4(m.uniforms.worldToEmitter.value).length()).toBeLessThan(1e-10);m.dispose();
  });
  it('disabled and zero-power sources have zero reflected radiance',()=>{
    const s=makeCatchlightScene(),m=makeCorneaMaterial(),l=s.lights[0];l.enabled=false;
    updateCorneaEmitter(m,l,s.camera,new T.Color('white'),new T.Matrix4());expect(m.uniforms.radiance.value.r).toBe(0);
    l.enabled=true;l.source={mode:'continuous',dimmerPercent:0,temperatureK:5600};updateCorneaEmitter(m,l,s.camera,new T.Color('white'),new T.Matrix4());expect(m.uniforms.radiance.value.r).toBe(0);m.dispose();
  });
  it('dish sizes scale aperture and conserve integrated source radiance',()=>{
    const s=makeCatchlightScene(),m=makeCorneaMaterial();const values=['42','55','70'].map(size=>{const l={...s.lights[0],modifier:makeModifier('beauty-dish',size)};updateCorneaEmitter(m,l,s.camera,new T.Color('white'),new T.Matrix4());return {half:m.uniforms.halfSize.value.x,energy:m.uniforms.radiance.value.r*emitterSurface(l.modifier).areaM2};});
    expect(values.map(v=>v.half)).toEqual([.21,.275,.35]);expect(values[0].energy).toBeCloseTo(values[2].energy);m.dispose();
  });
  it('grid changes angular transmission, never aperture geometry',()=>{
    const s=makeCatchlightScene(),m=makeCorneaMaterial(),l=s.lights[0];updateCorneaEmitter(m,l,s.camera,new T.Color('white'),new T.Matrix4());const brightness=m.uniforms.radiance.value.r,cutoff=m.uniforms.cutoff.value;
    const grid=withGrid(l.modifier,true);expect(emitterSurface(grid)).toEqual(emitterSurface(l.modifier));updateCorneaEmitter(m,{...l,modifier:grid},s.camera,new T.Color('white'),new T.Matrix4());expect(m.uniforms.radiance.value.r/brightness).toBeCloseTo(.78);expect(m.uniforms.cutoff.value).toBeGreaterThan(cutoff);m.dispose();
  });
  it('reflection responds linearly to exposure and duplicate lights retain independent positions',()=>{
    const s=duplicateLight(makeCatchlightScene(),'light-key','light-copy'),m=makeCorneaMaterial();updateCorneaEmitter(m,s.lights[0],s.camera,new T.Color('white'),new T.Matrix4());const first=m.uniforms.radiance.value.r,transform=m.uniforms.worldToEmitter.value.clone();
    updateCorneaEmitter(m,s.lights[1],{...s.camera,iso:s.camera.iso*2},new T.Color('white'),new T.Matrix4());expect(m.uniforms.radiance.value.r).toBeCloseTo(first*2);expect(m.uniforms.worldToEmitter.value.equals(transform)).toBe(false);m.dispose();
  });
  it('fixed inspection preset is reproducible and does not mutate the ordinary portrait preset',()=>{
    const before=makePortraitScene(),s=makeCatchlightScene();expect(s).toEqual(makeCatchlightScene());expect(s.camera.focalLengthMm).toBe(85);expect(makePortraitScene()).toEqual(before);
  });
  it('legacy quality remains readable and Draft has bounded work',()=>{
    expect(qualityName('balanced')).toBe('Standard');expect(qualityName('low')).toBe('Draft');expect(QUALITY.Draft.batches).toBe(1);expect(QUALITY.High.batches).toBeGreaterThan(QUALITY.Standard.batches);expect(QUALITY.Draft.maxWidth).toBeLessThan(QUALITY.Standard.maxWidth);
  });
});
