import { EQUIPMENT, equipment, gridEnabled, switchModifier, withGrid } from '../domain/equipment';
import type { EquipmentId, ModifierSpec } from '../domain/equipment';
export function EquipmentControls({value,onChange,prefix=''}:{value:ModifierSpec;onChange:(m:ModifierSpec)=>void;prefix?:string}){
  const d=equipment(value.equipmentId);
  return <div className="equipment-controls">
    <label>Modifier<select aria-label={`${prefix}Modifier`} value={d.id} onChange={e=>onChange(switchModifier(value,e.target.value as EquipmentId))}>{EQUIPMENT.map(item=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
    <label>Size<select aria-label={`${prefix}Size`} value={value.sizeId} onChange={e=>onChange(switchModifier(value,d.id,e.target.value))}>{!d.dimensions.some(s=>s.id===value.sizeId)&&<option value={value.sizeId}>Custom {Math.round(value.widthM*100)} × {Math.round(value.heightM*100)}cm</option>}{d.dimensions.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
    {d.gridCompatible?<label className="grid-toggle"><input type="checkbox" aria-label={`${prefix}Grid`} checked={gridEnabled(value)} onChange={e=>onChange(withGrid(value,e.target.checked))}/>Grid · 收窄光束及溢光</label>:<p className="micro-note">此器材暫不支援 Grid。</p>}
  </div>;
}
