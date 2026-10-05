import { makePortraitScene } from '../domain/scene';
import type { SceneDocument, Transform, LightSpec } from '../domain/scene';
import { EQUIPMENT, makeModifier } from '../domain/equipment';
import type { EquipmentId } from '../domain/equipment';
import { BODY_TYPES, HAIR_STYLES, POSES } from '../domain/model';
import { resolveSkin } from '../domain/skin';

export const PROJECT_VERSION = 1;
export interface ProjectContent { name:string; notes:string; scene:SceneDocument }
export interface ProjectDocument extends ProjectContent {
  projectVersion:1; id:string; createdAt:string; updatedAt:string; revision:string;
}
export const contentOf = ({name,notes,scene}:ProjectContent):ProjectContent => structuredClone({name,notes,scene});
export const fingerprint = (value:ProjectContent) => JSON.stringify(contentOf(value));
export function newProject(name='Untitled project', scene=makePortraitScene()):ProjectDocument {
  const now=new Date().toISOString();
  return {projectVersion:1,id:crypto.randomUUID(),name,notes:'',scene,createdAt:now,updatedAt:now,revision:crypto.randomUUID()};
}
type RecordValue = Record<string,unknown>;
const record=(v:unknown):RecordValue=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as RecordValue:{};
const str=(v:unknown,d:string,max=120)=>typeof v==='string'?v.slice(0,max):d;
const bool=(v:unknown,d:boolean)=>typeof v==='boolean'?v:d;
const color=(v:unknown,d:string)=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v)?v:d;
const choice=<const T extends string>(v:unknown,options:readonly T[],d:T):T=>options.includes(v as T)?v as T:d;
const date=(v:unknown,d:string)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:d;

/** Trust boundary: whitelist every field. Never spread untrusted objects into scene state. */
export function validateProject(input:unknown):{project:ProjectDocument;warnings:string[]} {
  const root=record(input),warnings:string[]=[];
  if(Object.keys(root).length===0)throw new Error('This file does not contain a project.');
  const legacy=root.projectVersion===undefined&&[1,2].includes(root.schemaVersion as number);
  if(!legacy&&root.projectVersion!==PROJECT_VERSION)throw new Error('Unsupported project version. Open this file in a compatible LUMA Studio version.');
  const raw=legacy?root:record(root.scene);
  if(![1,2].includes(raw.schemaVersion as number))throw new Error('Unsupported or missing scene schema version.');
  if(!raw.model||!raw.camera||!Array.isArray(raw.lights))throw new Error('Project is missing model, camera or lights.');
  if(raw.lights.length>100)throw new Error('A project can contain at most 100 lights.');
  if(legacy)warnings.push('Legacy scene migrated to project v1.');
  const d=newProject(),s=d.scene,m=record(raw.model),c=record(raw.camera),env=record(raw.environment),r=record(raw.render);
  const num=(v:unknown,fallback:number,min:number,max:number)=>{
    if(v===undefined)return fallback;
    if(typeof v!=='number'||!Number.isFinite(v)){warnings.push('Invalid number replaced with a safe default.');return fallback;}
    const n=Math.max(min,Math.min(max,v));if(n!==v)warnings.push('Out-of-range value limited to a safe range.');return n;
  };
  const transform=(v:unknown,fallback:Transform):Transform=>{
    const t=record(v),p=Array.isArray(t.positionM)?t.positionM:[],q=Array.isArray(t.quaternion)?t.quaternion:[];
    const quaternion=fallback.quaternion.map((n,i)=>num(q[i],n,-1,1)) as Transform['quaternion'];
    const length=Math.hypot(...quaternion);
    return {positionM:fallback.positionM.map((n,i)=>num(p[i],n,-100,100)) as Transform['positionM'],quaternion:length<1e-8?[0,0,0,1]:Math.abs(length-1)<1e-12?quaternion:quaternion.map(n=>n/length) as Transform['quaternion']};
  };
  const skinRaw=record(m.skin),skin=resolveSkin({
    skinTone:color(skinRaw.skinTone,color(m.skinColor,s.model.skinColor)),
    skinFinish:choice(skinRaw.skinFinish,['Matte','Natural','Glossy','Custom'],'Natural'),
    roughness:num(skinRaw.roughness,.43,.2,.85),reflectance:num(skinRaw.reflectance,.035,0,.08),
    subsurface:num(skinRaw.subsurface,.45,0,1),regionVariation:num(skinRaw.regionVariation,1,0,1),
  });
  s.model={id:str(m.id,s.model.id),assetId:str(m.assetId,s.model.assetId),transform:transform(m.transform,s.model.transform),
    heightCm:num(m.heightCm,175,150,200),bodyPreset:choice(m.bodyPreset,Object.keys(BODY_TYPES),'regular'),
    skinColor:color(m.skinColor,skin.skinTone),skin,hairStyle:choice(m.hairStyle,HAIR_STYLES,'short'),hairColor:color(m.hairColor,'#201916'),
    pose:choice(m.pose,Object.keys(POSES) as (keyof typeof POSES)[],'Front'),headYaw:num(m.headYaw,0,-30,30),headPitch:num(m.headPitch,0,-15,15)};
  s.camera={id:str(c.id,s.camera.id),transform:transform(c.transform,s.camera.transform),
    sensorWidthMm:num(c.sensorWidthMm,36,1,100),sensorHeightMm:num(c.sensorHeightMm,24,1,100),focalLengthMm:num(c.focalLengthMm,50,10,600),
    fNumber:num(c.fNumber,4,1,64),shutterSeconds:num(c.shutterSeconds,1/125,1/8000,30),iso:num(c.iso,200,25,102400),
    whiteBalanceK:num(c.whiteBalanceK,5600,1000,15000),exposureCompEv:num(c.exposureCompEv,0,-10,10)};
  const ids=new Set<string>();
  s.lights=raw.lights.map((value,index)=>{
    const l=record(value),source=record(l.source),modifier=record(l.modifier),aim=record(l.aiming);
    let id=str(l.id,`light-import-${index}`);
    if(!/^light-[\w-]+$/.test(id)||ids.has(id)){id=`light-import-${index}-${crypto.randomUUID()}`;warnings.push('Repaired invalid or duplicate light ID.');}ids.add(id);
    const equipmentId=modifier.equipmentId??(raw.schemaVersion===1&&modifier.presetId==='softbox-120'?'softbox':undefined);
    if(!EQUIPMENT.some(e=>e.id===equipmentId))throw new Error(`Light ${index+1} has an unknown equipment type.`);
    const mod=makeModifier(equipmentId as EquipmentId,str(modifier.sizeId,''));
    mod.widthM=num(modifier.widthM,mod.widthM,.02,5);mod.heightM=num(modifier.heightM,mod.heightM,.02,5);
    mod.sizeId=str(modifier.sizeId,'custom');
    if(EQUIPMENT.find(e=>e.id===equipmentId)!.gridCompatible&&Array.isArray(modifier.accessories)){
      const grid=modifier.accessories.map(record).find(a=>a.id==='grid');if(grid)mod.accessories=[{id:'grid',enabled:bool(grid.enabled,false)}];
    }
    return {id:id as LightSpec['id'],name:str(l.name,`Light ${index+1}`,80),enabled:bool(l.enabled,true),fixtureId:str(l.fixtureId,'generic-led-200'),
      transform:transform(l.transform,d.scene.lights[0].transform),modifier:mod,
      source:source.mode==='strobe'?{mode:'strobe',powerEv:num(source.powerEv,-1,-10,0),temperatureK:num(source.temperatureK,5600,1000,15000)}:
        {mode:'continuous',dimmerPercent:num(source.dimmerPercent,70,0,100),temperatureK:num(source.temperatureK,5600,1000,15000)},
      ...(l.aiming!==undefined?{aiming:{target:choice(aim.target,['face','chest','center'],'face'),auto:bool(aim.auto,false)}}:{}),
    };
  });
  s.environment={backgroundColor:color(env.backgroundColor,s.environment.backgroundColor),floorColor:color(env.floorColor,s.environment.floorColor),floorFollowsBackground:bool(env.floorFollowsBackground,true),
    widthM:num(env.widthM,8,1,100),heightM:num(env.heightM,5,1,100),depthM:num(env.depthM,10,1,100),curveRadiusM:num(env.curveRadiusM,1,.01,10)};
  s.render={quality:choice(r.quality,['balanced','low','Draft','Standard','High'],'Standard'),previewMode:'capture',seed:Math.round(num(r.seed,42,0,2147483647))};
  s.id=str(raw.id,s.id);s.name=str(raw.name,s.name);s.createdAt=date(raw.createdAt,d.createdAt);s.updatedAt=date(raw.updatedAt,d.updatedAt);
  s.catalogVersion=str(raw.catalogVersion,s.catalogVersion);
  const project:ProjectDocument={...d,id:legacy?d.id:str(root.id,d.id),name:str(root.name,s.name).trim()||'Untitled project',notes:str(root.notes,'',20000),scene:s,
    createdAt:date(root.createdAt,d.createdAt),updatedAt:date(root.updatedAt,d.updatedAt),revision:str(root.revision,d.revision)};
  return {project,warnings:[...new Set(warnings)]};
}
export function parseProject(json:string){
  if(json.length>5_000_000)throw new Error('Project file is too large (maximum 5 MB).');
  let value:unknown;try{value=JSON.parse(json);}catch{throw new Error('Invalid JSON. Choose a LUMA project JSON file.');}
  return validateProject(value);
}
export const serializeProject=(project:ProjectDocument)=>JSON.stringify(project,null,2);
