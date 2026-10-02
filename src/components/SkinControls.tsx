import { SKIN_TONES,SKIN_FINISHES,withSkinFinish,resolveSkin } from '../domain/skin';
import type { SkinMaterialParameters } from '../domain/skin';
import { Range,Section } from './Controls';
export function SkinControls({value,onChange}:{value:SkinMaterialParameters;onChange:(p:SkinMaterialParameters)=>void}) {
  const update=(patch:Partial<SkinMaterialParameters>)=>onChange(resolveSkin({...value,...patch}));
  return <Section title="Skin Material" badge={value.skinFinish}>
    <div className="swatches skin-swatches" role="group" aria-label="Skin Tone">
      {SKIN_TONES.map(t=><button key={t.id} title={t.color} aria-label={`Skin Tone ${t.id}`} aria-pressed={value.skinTone===t.color} style={{background:t.color}} onClick={()=>update({skinTone:t.color})}>{t.id}</button>)}
    </div>
    <p className="micro-note">Skin Tone · 01–07。膚色不改變表面反射率。</p>
    <div className="lens-presets" role="group" aria-label="Skin Finish">{(Object.keys(SKIN_FINISHES) as (keyof typeof SKIN_FINISHES)[]).map(f=><button key={f} aria-pressed={value.skinFinish===f} onClick={()=>onChange(withSkinFinish(value,f))}>{f}</button>)}</div>
    <Range label="Skin roughness" value={value.roughness} min={.2} max={.85} step={.01} onChange={roughness=>update({roughness,skinFinish:'Custom'})}/>
    <Range label="Skin reflectance" precision={3} value={value.reflectance} min={0} max={.08} step={.001} onChange={reflectance=>update({reflectance,skinFinish:'Custom'})}/>
    <details><summary>Advanced numeric controls</summary>
      <div className="skin-numeric">{([
        ['Roughness','roughness',.2,.85,.01],['Reflectance F0','reflectance',0,.08,.001],
        ['Subsurface amount','subsurface',0,1,.05],['Region variation','regionVariation',0,1,.05],
      ] as const).map(([label,key,min,max,step])=><label key={key}>{label}<input type="number" aria-label={label} value={value[key]} min={min} max={max} step={step} onChange={e=>{const v=e.target.valueAsNumber;if(Number.isFinite(v)&&v>=min&&v<=max)update({[key]:v,...(key==='roughness'||key==='reflectance'?{skinFinish:'Custom' as const}:{})});}}/></label>)}</div>
    </details>
    <p className="micro-note">薄組織透光近似 · Draft 關閉，Standard / High 啟用。Reflectance 為中性表面 F0。</p>
  </Section>;
}
