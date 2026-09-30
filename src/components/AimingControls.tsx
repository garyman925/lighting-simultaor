import { aimLight, horizontalShortcuts, lightAngles, placeLight, verticalShortcuts } from '../domain/aiming';
import type { AimTarget } from '../domain/aiming';
import type { LightSpec, SceneDocument } from '../domain/scene';
import { NumberField, Section } from './Controls';

export function AimingControls({scene,light,onChange}:{scene:SceneDocument;light:LightSpec;onChange:(light:LightSpec)=>void}) {
  const angles=lightAngles(scene,light);
  const target=light.aiming?.target??'face';
  return <Section title="Light Position & Aim" badge="CAMERA RELATIVE">
    <p className="micro-note">0° 正面 · − 左 / + 右 · 180° 背光。繞目標移動並對準，保留距離；+ elevation 從上方照射。</p>
    {(['horizontal','vertical'] as const).map(axis=><div className="aim-angle" key={axis}>
      <div className="transform-label">{axis==='horizontal'?'Horizontal · 方位':'Vertical · 高低入射角'}</div>
      <NumberField label={axis==='horizontal'?'Horizontal angle':'Vertical angle'} value={angles[axis]} min={axis==='horizontal'?-180:-89} max={axis==='horizontal'?180:89} step={1} onChange={v=>onChange(placeLight(scene,light,{[axis]:v}))}/>
      <div className="angle-shortcuts">{(axis==='horizontal'?horizontalShortcuts:verticalShortcuts).map(value=><button key={value} aria-label={`${axis} ${value}°`} aria-pressed={Math.abs(angles[axis]-value)<.01} title={axis==='horizontal'?(value===0?'Frontal':Math.abs(value)===180?'Back light':`${value<0?'Camera Left':'Camera Right'} ${Math.abs(value)}°`):`${value}° elevation`} onClick={()=>onChange(placeLight(scene,light,{[axis]:value}))}>{value>0?'+':''}{value}°</button>)}</div>
    </div>)}
    {light.transform.positionM[1]<.25&&<p className="micro-note" role="status">燈具低於 0.25m；可提高角度或移近目標。角度控制不做碰撞限制。</p>}
    <div className="aim-targets">{([['face','Face'],['chest','Chest'],['center','Model Center']] as [AimTarget,string][]).map(([id,label])=><button key={id} aria-pressed={target===id} onClick={()=>onChange(aimLight(scene,light,id))}>Aim at {label}</button>)}</div>
    <label className="auto-aim"><input type="checkbox" aria-label="Auto Aim" checked={light.aiming?.auto??false} onChange={e=>{const next={...light,aiming:{target,auto:e.target.checked}};onChange(e.target.checked?aimLight(scene,next):next);}}/>Auto Aim · 移動時保持對準</label>
    <p className="micro-note">自由旋轉會關閉此燈 Auto Aim。青色箭頭顯示實際出光方向，金點是目標；只在 Studio 顯示。</p>
  </Section>;
}
