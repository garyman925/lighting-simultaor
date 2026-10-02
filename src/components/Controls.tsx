import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export function Range({label,value,min,max,step=1,unit='',precision=2,onChange}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;precision?:number;onChange:(n:number)=>void}) {
  return <div className="range-field"><div className="field-heading"><label>{label}</label><span>{Number(value.toFixed(precision))}<small>{unit}</small></span></div><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></div>;
}
export function NumberField({label,value,min,max,step=.1,onChange}:{label:string;value:number;min:number;max:number;step?:number;onChange:(n:number)=>void}) {
  const [draft,setDraft]=useState(value.toFixed(2));
  useEffect(()=>setDraft(value.toFixed(2)),[value]);
  return <label className="number-field"><span>{label.split(' ').at(-1)}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={draft} onChange={e=>{setDraft(e.target.value);const n=e.target.valueAsNumber;if(Number.isFinite(n)&&n>=min&&n<=max)onChange(n);}} onBlur={()=>setDraft(value.toFixed(2))}/></label>;
}
export function Section({title,icon,children,badge}:{title:string;icon?:ReactNode;children:ReactNode;badge?:string}){return <section className="control-section"><div className="section-heading"><h3>{icon}{title}</h3>{badge&&<span>{badge}</span>}</div>{children}</section>;}
