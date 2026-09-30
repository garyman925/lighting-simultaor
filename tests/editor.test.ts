import { describe, expect, it } from 'vitest';
import { addLight, deleteLight, duplicateLight, getTransform, hasStrobe, makePortraitScene, makeThreeLightScene, sourcePower, updateLight, withTransform } from '../src/domain/scene';

describe('multi-light editor',()=>{
  it('adds beyond three lights with independent IDs and defaults',()=>{
    let s=makePortraitScene();for(let i=0;i<12;i++)s=addLight(s,`light-${i}`);
    expect(s.lights).toHaveLength(13);expect(new Set(s.lights.map(l=>l.id)).size).toBe(13);
    expect(s.lights[1].transform).not.toBe(s.lights[2].transform);
  });
  it('edits only the selected light and retains other object references',()=>{
    const s=makeThreeLightScene();const next=updateLight(s,'light-fill',{name:'Bounce',source:{mode:'continuous',dimmerPercent:8,temperatureK:3200}});
    expect(next.lights[0]).toBe(s.lights[0]);expect(next.lights[2]).toBe(s.lights[2]);expect(next.camera).toBe(s.camera);expect(next.lights[1].name).toBe('Bounce');expect(sourcePower(next.lights[1])).toBe(.08);
  });
  it('transforms by stable ID even after reorder',()=>{
    const s=makeThreeLightScene();s.lights.reverse();const t={positionM:[2,3,1] as [number,number,number],quaternion:[0,1,0,0] as [number,number,number,number]};
    const next=withTransform(s,'light-key',t);expect(getTransform(next,'light-key')).toEqual(t);expect(next.lights[0]).toBe(s.lights[0]);expect(s.lights[2].transform).not.toEqual(t);
  });
  it('duplicates all properties without sharing nested mutable values',()=>{
    const s=makeThreeLightScene();const next=duplicateLight(s,'light-rim','light-copy');const copy=next.lights.at(-1)!;
    expect(copy.id).toBe('light-copy');expect(copy.name).toBe('Rim Light copy');expect(copy.modifier).toEqual(s.lights[2].modifier);expect(copy.modifier).not.toBe(s.lights[2].modifier);expect(copy.transform.positionM[0]).toBeCloseTo(s.lights[2].transform.positionM[0]+.3);
  });
  it('can remove every light and later add one again',()=>{
    const s=makePortraitScene();const empty=deleteLight(s,'light-key');expect(empty.lights).toEqual([]);expect(empty.camera).toBe(s.camera);expect(addLight(empty,'light-new').lights).toHaveLength(1);
  });
  it('disabled flash does not constrain synchronization and contributes zero',()=>{
    let s=makeThreeLightScene();s=updateLight(s,'light-fill',{source:{mode:'strobe',powerEv:-2,temperatureK:5600}});expect(hasStrobe(s)).toBe(true);
    s=updateLight(s,'light-fill',{enabled:false});expect(hasStrobe(s)).toBe(false);expect(sourcePower(s.lights[1])).toBe(0);
  });
  it('presets are deterministic, isolated and have opposite fill and rear rim',()=>{
    const s=makeThreeLightScene();expect(s.lights.map(l=>l.name)).toEqual(['Key Light','Fill Light','Rim Light']);expect(s.lights[0].modifier.widthM).toBe(1.2);expect(s.lights[1].transform.positionM[0]).toBeGreaterThan(0);expect(sourcePower(s.lights[1])).toBeLessThan(sourcePower(s.lights[0]));expect(s.lights[2].transform.positionM[2]).toBeLessThan(0);
    s.lights[0].name='Changed';expect(makeThreeLightScene().lights[0].name).toBe('Key Light');expect(makePortraitScene().lights).toHaveLength(1);
  });
  it('stale light operations never mutate other lights or camera',()=>{
    const s=makeThreeLightScene();expect(duplicateLight(s,'light-missing')).toBe(s);expect(deleteLight(s,'light-missing').lights).toEqual(s.lights);expect(updateLight(s,'light-missing',{enabled:false}).lights).toEqual(s.lights);
  });
});
