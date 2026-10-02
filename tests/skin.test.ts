import { describe,it,expect } from 'vitest';
import * as T from 'three';
import { SKIN_TONES,SKIN_FINISHES,defaultSkin,resolveSkin,withSkinFinish,skinMask,pigmentAbsorption } from '../src/domain/skin';
import { makeSkinMaterial } from '../src/rendering/skin';
import { makeHumanoid } from '../src/rendering/humanoid';
import { makeMaterialTestScene,compareSkinEquipment,migrateScene,makePortraitScene } from '../src/domain/scene';
import { GpuTimer } from '../src/rendering/timing';

describe('VS04B model material contract',()=>{
  it('clamps invalid numeric data and migrates old scenes without changing tone or camera',()=>{
    const p=resolveSkin({roughness:NaN,reflectance:Infinity,subsurface:2,regionVariation:-2,skinTone:'bad'});
    expect(p).toEqual({...defaultSkin(),subsurface:1,regionVariation:0});
    const s=makePortraitScene();delete s.model.skin;s.model.skinColor='#805139';
    const migrated=migrateScene(s);expect(migrated.model.skin?.skinTone).toBe('#805139');expect(migrated.camera).toEqual(s.camera);expect(s.model.skin).toBeUndefined();
  });
  it('finish switches preserve tone and SSS and have ordered roughness/reflectance',()=>{
    const p={...defaultSkin('#3C251E'),subsurface:.7};
    for(const f of Object.keys(SKIN_FINISHES) as (keyof typeof SKIN_FINISHES)[]){
      const q=withSkinFinish(p,f);expect(q.skinTone).toBe(p.skinTone);expect(q.subsurface).toBe(.7);expect(q.skinFinish).toBe(f);
    }
    expect(SKIN_FINISHES.Matte.roughness).toBeGreaterThan(SKIN_FINISHES.Natural.roughness);
    expect(SKIN_FINISHES.Natural.roughness).toBeGreaterThan(SKIN_FINISHES.Glossy.roughness);
    expect(SKIN_FINISHES.Matte.reflectance).toBeLessThan(SKIN_FINISHES.Glossy.reflectance);
  });
  it('A/B changes only the key modifier, including after camera/model/exposure edits',()=>{
    const s=makeMaterialTestScene();s.camera.iso=400;s.model.heightCm=180;
    const b=compareSkinEquipment(s,'softbox');
    expect(b.camera).toBe(s.camera);expect(b.model).toBe(s.model);
    expect(b.lights[0].transform).toBe(s.lights[0].transform);expect(b.lights[0].source).toBe(s.lights[0].source);
    expect(b.lights[0].modifier.widthM).toBe(1.2);
    expect(compareSkinEquipment(b,'beauty-dish')).toEqual(s);
    expect(compareSkinEquipment({...s,lights:[]},'softbox').lights).toEqual([]);
  });
  it('separates oil zones from cheeks and restricts thin tissue to local regions',()=>{
    expect(skinMask(0,1.59,.13)[0]).toBeGreaterThan(skinMask(.05,1.56,.09)[0]);
    expect(skinMask(.095,1.58,0,'ear')[2]).toBe(1);
    expect(skinMask(0,1.67,.08)[2]).toBeLessThan(.01);
    expect(skinMask(0,.8,.04)[2]).toBeLessThan(.001);
    expect(skinMask(0,1.53,.10,'lip')[1]).toBe(1);
  });
  it('all owned skin geometry has finite normalized masks; cornea is not skin',()=>{
    const h=makeHumanoid();let count=0;
    h.root.traverse(o=>{if(o instanceof T.Mesh&&o.material===h.skin){count++;const mask=o.geometry.getAttribute('skinMask');expect(mask.count).toBe(o.geometry.getAttribute('position').count);for(const v of mask.array)expect(v>=0&&v<=1&&Number.isFinite(v)).toBe(true);}});
    expect(count).toBeGreaterThan(10);expect(h.cornea).not.toBe(h.skin);h.dispose();
  });
  it('all tones retain neutral identical surface F0 while pigment changes absorption',()=>{
    const system=makeSkinMaterial();const iors:number[]=[];
    for(const t of SKIN_TONES){system.update(defaultSkin(t.color),'Standard');iors.push(system.material.ior);expect(system.material.specularColor.getHex()).toBe(0xffffff);expect(system.material.color.getHexString()).toBe(t.color.slice(1).toLowerCase());}
    expect(new Set(iors).size).toBe(1);expect(pigmentAbsorption(SKIN_TONES[6].color)).toBeGreaterThan(pigmentAbsorption(SKIN_TONES[0].color));system.material.dispose();
  });
  it('numeric F0 is mapped to dielectric IOR and quality changes no material allocation',()=>{
    const s=makeSkinMaterial(),p=defaultSkin();p.reflectance=.06;p.roughness=.31;
    for(const [q,n] of [['Draft',0],['Standard',1],['High',2]] as const){
      s.update(p,q);expect(s.uniforms.skinQuality.value).toBe(n);
      expect(((s.material.ior-1)/(s.material.ior+1))**2).toBeCloseTo(.06);
      expect(s.material.roughness).toBe(.31);
    }s.material.dispose();
  });
});
describe('GPU timing does not fabricate FPS',()=>{
  it('unsupported extension leaves measurement unavailable',()=>{
    const timer=new GpuTimer({getExtension:()=>null} as unknown as WebGL2RenderingContext);
    timer.begin();timer.end();expect(timer.supported).toBe(false);expect(timer.milliseconds).toBeNull();timer.dispose();
  });
  it('reads only available results and discards disjoint measurements',()=>{
    let available=false,disjoint=false,deleted=0;
    const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,getExtension:()=>({TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4}),
      createQuery:()=>({}),beginQuery:()=>{},endQuery:()=>{},deleteQuery:()=>{deleted++;},
      getParameter:()=>disjoint,getQueryParameter:(_:unknown,k:number)=>k===1?available:3500000};
    const timer=new GpuTimer(gl as unknown as WebGL2RenderingContext);timer.begin();timer.end();timer.poll();expect(timer.milliseconds).toBeNull();
    available=true;timer.poll();expect(timer.milliseconds).toBe(3.5);expect(deleted).toBe(1);
    disjoint=true;timer.poll();expect(timer.milliseconds).toBeNull();timer.dispose();
  });
});
