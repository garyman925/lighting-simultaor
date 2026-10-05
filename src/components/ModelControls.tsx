import { BODY_TYPES, HAIR_COLOURS, HAIR_STYLES, HEAD_POSES, POSES, modelLandmark, resetModel, updateModel } from '../domain/model';
import type { SceneDocument } from '../domain/scene';
import { resolveSkin } from '../domain/skin';
import { SkinControls } from './SkinControls';
import { NumberField, Range, Section } from './Controls';

export function ModelControls({scene,onChange}:{scene:SceneDocument;onChange:(s:SceneDocument)=>void}){
  const m=scene.model,update=(patch:Parameters<typeof updateModel>[1])=>onChange(updateModel(scene,patch));
  const face=modelLandmark(m,'face'),chest=modelLandmark(m,'chest');
  return <div className="model-inspector" aria-label="Model Creator">
    <Section title="Model Creator" badge="PORTRAIT">
      <Range label="Model height" value={m.heightCm} min={150} max={200} unit="cm" onChange={heightCm=>update({heightCm})}/>
      <NumberField label="Height cm" value={m.heightCm} min={150} max={200} step={1} onChange={heightCm=>update({heightCm})}/>
      <label className="model-select">Body Type<select aria-label="Body Type" value={m.bodyPreset} onChange={e=>update({bodyPreset:e.target.value})}>{Object.entries(BODY_TYPES).map(([key,b])=><option key={key} value={key}>{b.label}</option>)}</select></label>
      <label className="model-select">Hair Style<select aria-label="Hair Style" value={m.hairStyle} onChange={e=>update({hairStyle:e.target.value})}>{HAIR_STYLES.map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></label>
      <div className="swatches hair-swatches" role="group" aria-label="Hair Colour">{Object.entries(HAIR_COLOURS).map(([label,color])=><button key={label} aria-label={`Hair Colour ${label}`} aria-pressed={m.hairColor===color} title={label} style={{background:color}} onClick={()=>update({hairColor:color})}><span>{label}</span></button>)}</div>
      <p className="micro-note">獨立受光髮材質 · 可比較 Stripbox / Rim highlight</p>
    </Section>
    <Section title="Portrait Pose" badge="SUBJECT">
      <div className="pose-buttons" role="group" aria-label="Portrait Pose">{(Object.keys(POSES) as (keyof typeof POSES)[]).map(p=><button key={p} aria-pressed={(m.pose??'Front')===p} onClick={()=>update({pose:p})}>{p}</button>)}</div>
      <p className="micro-note">Left / Right = 人物自身左右。姿勢相對模型基準方向。</p>
      <div className="pose-buttons" role="group" aria-label="Head Pose">{Object.entries(HEAD_POSES).map(([label,[headYaw,headPitch]])=><button key={label} aria-pressed={(m.headYaw??0)===headYaw&&(m.headPitch??0)===headPitch} onClick={()=>update({headYaw,headPitch})}>{label}</button>)}</div>
      <Range label="Head turn" value={m.headYaw??0} min={-30} max={30} unit="°" onChange={headYaw=>update({headYaw})}/>
      <Range label="Chin tilt" value={m.headPitch??0} min={-15} max={15} unit="°" onChange={headPitch=>update({headPitch})}/>
      <p className="micro-note" data-testid="model-landmarks">Face {face.map(v=>v.toFixed(3)).join(' / ')} m<br/>Chest {chest.map(v=>v.toFixed(3)).join(' / ')} m</p>
      <p className="micro-note">燈具啟用 Auto aim 後，瞄準會跟隨身高與姿勢。</p>
      <button className="aim-button" onClick={()=>onChange(resetModel(scene))}>Reset Model</button>
    </Section>
    <SkinControls value={resolveSkin(m.skin,m.skinColor)} onChange={skin=>update({skin,skinColor:skin.skinTone})}/>
  </div>;
}
