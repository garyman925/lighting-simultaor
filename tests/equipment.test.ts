import { describe,it,expect } from 'vitest';
import { EQUIPMENT,makeModifier,switchModifier,withGrid,opticalParameters,apertureSamples,catchlightDescriptor } from '../src/domain/equipment';
import { makePortraitScene,makeEquipmentScene,migrateScene,updateLight,addLight,duplicateLight,deleteLight,withTransform,sourcePower } from '../src/domain/scene';
import { makeEquipmentVisual } from '../src/rendering/equipmentVisual';
import { Box3,Vector3 } from 'three';
import legacy from '../fixtures/portrait.scene.json';

describe('equipment catalog and calibration boundary',()=>{
  it('has seven unique generic definitions and all requested dish sizes',()=>{
    expect(new Set(EQUIPMENT.map(d=>d.id)).size).toBe(7);
    expect(EQUIPMENT.find(d=>d.id==='beauty-dish')!.dimensions.map(s=>s.widthM)).toEqual([.42,.55,.7]);
    for(const d of EQUIPMENT){expect(d.manufacturer).toBeNull();expect(d.calibration.status).toBe('uncalibrated');expect(d.defaultSpreadDeg).toBeGreaterThan(0);expect(d.defaultSpreadDeg).toBeLessThan(180);expect(new Set(d.dimensions.map(s=>s.id)).size).toBe(d.dimensions.length);}
  });
  for(const d of EQUIPMENT)it(`${d.id}: add, switch, transform, independent duplicate, disable and delete`,()=>{
    let s=addLight(makePortraitScene(),'light-test');s=updateLight(s,'light-test',{modifier:makeModifier(d.id)});
    const transform={positionM:[1,2,3] as [number,number,number],quaternion:[0,1,0,0] as [number,number,number,number]};s=withTransform(s,'light-test',transform);
    s=duplicateLight(s,'light-test','light-copy');const copy=s.lights[2];expect(copy.modifier.equipmentId).toBe(d.id);expect(copy.transform.quaternion).toEqual(transform.quaternion);
    copy.modifier.accessories.push({id:'grid',enabled:true});expect(s.lights[1].modifier.accessories).toEqual([]);
    s=updateLight(s,'light-copy',{enabled:false});expect(sourcePower(s.lights[2])).toBe(0);expect(deleteLight(s,'light-copy').lights).toHaveLength(2);
  });
  it('conserves source weight across every size, grid and temporal pass',()=>{
    for(const d of EQUIPMENT)for(const size of d.dimensions)for(const jitter of [[0,0],[-.42,-.43],[.37,.39]]){
      const m=makeModifier(d.id,size.id),samples=apertureSamples(m,jitter);expect(samples).toHaveLength(9);expect(samples.reduce((n,s)=>n+s.weight,0)).toBeCloseTo(1);
      expect(samples.every(s=>Math.abs(s.position[0])<=m.widthM/2&&Math.abs(s.position[1])<=m.heightM/2)).toBe(true);
    }
  });
  it('size changes actual sample aperture and equipment bounds',()=>{
    for(const d of EQUIPMENT){const a=makeModifier(d.id,d.dimensions[0].id),b=makeModifier(d.id,d.dimensions.at(-1)!.id);
      const variance=(m:typeof a)=>apertureSamples(m).reduce((v,s)=>v+s.position[0]**2+s.position[1]**2,0);
      expect(variance(b)).toBeGreaterThan(variance(a));
      expect(new Box3().setFromObject(makeEquipmentVisual(b)).getSize(new Vector3()).x).toBeGreaterThan(new Box3().setFromObject(makeEquipmentVisual(a)).getSize(new Vector3()).x);
    }
  });
  it('dish avoids the deflector; rectangle, strip and circular apertures differ',()=>{
    const dish=makeModifier('beauty-dish');expect(apertureSamples(dish).every(s=>Math.hypot(s.position[0],s.position[1])>dish.widthM*.125)).toBe(true);
    expect(catchlightDescriptor(dish).centralOcclusion).toBe(.25);expect(catchlightDescriptor(makeModifier('stripbox')).widthM).toBeLessThan(catchlightDescriptor(makeModifier('stripbox')).heightM);
    expect(apertureSamples(makeModifier('octabox'))).not.toEqual(apertureSamples(makeModifier('softbox')));
  });
  it('grid reduces real beam and transmission and is removed on incompatible switches',()=>{
    for(const d of EQUIPMENT){const m=makeModifier(d.id),g=withGrid(m,true);if(d.gridCompatible){expect(opticalParameters(g).spreadDeg).toBeLessThan(opticalParameters(m).spreadDeg);expect(opticalParameters(g).gain).toBeLessThan(opticalParameters(m).gain);}else expect(g.accessories).toEqual([]);}
    const m=withGrid(makeModifier('beauty-dish'),true);expect(switchModifier(m,'octabox').accessories[0].enabled).toBe(true);expect(switchModifier(m,'umbrella').accessories).toEqual([]);
  });
  it('presets vary lighting while keeping camera, exposure, model and background identical',()=>{
    const scenes=(['soft','beauty','dramatic'] as const).map(makeEquipmentScene);
    for(const s of scenes){expect(s.camera).toEqual(scenes[0].camera);expect(s.model).toEqual(scenes[0].model);expect(s.environment).toEqual(scenes[0].environment);}expect(new Set(scenes.map(s=>JSON.stringify(s.lights))).size).toBe(3);
  });
  it('migrates v1 fixture without losing transforms, exposure or custom dimensions',()=>{
    const next=migrateScene(legacy);expect(next.schemaVersion).toBe(2);expect(next.camera).toEqual(legacy.camera);expect(next.lights[0].transform).toEqual(legacy.lights[0].transform);expect(next.lights[0].modifier.widthM).toBe(legacy.lights[0].modifier.widthM);expect(legacy.schemaVersion).toBe(1);
  });
  it('round trips v2 mixed equipment and rejects unknown versions',()=>{
    let s=makeEquipmentScene('dramatic');for(const d of EQUIPMENT)s=updateLight(addLight(s,`light-${d.id}`),`light-${d.id}`,{modifier:makeModifier(d.id)});
    expect(migrateScene(JSON.parse(JSON.stringify(s)))).toEqual(s);expect(()=>migrateScene({...s,schemaVersion:99})).toThrow();
  });
});
