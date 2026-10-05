import { describe, expect, it } from 'vitest';
import { makePortraitScene } from '../src/domain/scene';
import { modelLandmark, resetModel, updateModel, HAIR_STYLES, POSES } from '../src/domain/model';
import { aimPoint } from '../src/domain/aiming';
import { newProject, parseProject, serializeProject } from '../src/project/schema';

describe('VS04C preserved in project workflow',()=>{
  it('face target follows body and head pose while the camera is unchanged',()=>{
    const s=makePortraitScene(),next=updateModel(s,{pose:'Profile Left',headYaw:20,headPitch:10});
    expect(aimPoint(next,'face')).toEqual(modelLandmark(next.model,'face'));expect(aimPoint(next,'face')).not.toEqual(aimPoint(s,'face'));expect(next.camera).toEqual(s.camera);
  });
  it('reset restores model controls and preserves lighting/camera',()=>{
    const s=updateModel(makePortraitScene(),{heightCm:195,bodyPreset:'full',hairStyle:'curly',pose:'3/4 Right',headYaw:20});
    const reset=resetModel(s);expect(reset.model.heightCm).toBe(175);expect(reset.model.pose).toBe('Front');expect(reset.model.hairStyle).toBe('short');expect(reset.camera).toEqual(s.camera);
  });
  it.each(HAIR_STYLES)('persists %s hair with all supported portrait poses',hairStyle=>{
    for(const pose of Object.keys(POSES) as (keyof typeof POSES)[]){const p=newProject();p.scene=updateModel(p.scene,{hairStyle,pose});expect(parseProject(serializeProject(p)).project.scene.model).toEqual(p.scene.model);}
  });
});
