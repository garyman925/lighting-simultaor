/** Serializable model-level material contract. Masks belong to the model, not the UI. */
export type SkinFinish='Matte'|'Natural'|'Glossy'|'Custom';
export interface SkinMaterialParameters {
  skinTone:string; skinFinish:SkinFinish; roughness:number; reflectance:number;
  subsurface:number; regionVariation:number;
}
export const SKIN_TONES=[
  {id:'01',color:'#E8BDAB'},
  {id:'02',color:'#D5A084'},
  {id:'03',color:'#BD8867'},
  {id:'04',color:'#A46E50'},
  {id:'05',color:'#805139'},
  {id:'06',color:'#593727'},
  {id:'07',color:'#3C251E'},
] as const;
export const SKIN_FINISHES={
  Matte:{roughness:.65,reflectance:.024},
  Natural:{roughness:.43,reflectance:.035},
  Glossy:{roughness:.27,reflectance:.046},
} as const;
export function defaultSkin(color='#BD8867'):SkinMaterialParameters {
  return {skinTone:color,skinFinish:'Natural',...SKIN_FINISHES.Natural,subsurface:.45,regionVariation:1};
}
const bounded=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
export function resolveSkin(value?:Partial<SkinMaterialParameters>,legacyColor?:string):SkinMaterialParameters {
  const d=defaultSkin(legacyColor),p={...d,...value};
  return {skinTone:/^#[0-9a-f]{6}$/i.test(p.skinTone)?p.skinTone:d.skinTone,
    skinFinish:['Matte','Natural','Glossy','Custom'].includes(p.skinFinish)?p.skinFinish:'Natural',
    roughness:bounded(p.roughness,d.roughness,.2,.85),reflectance:bounded(p.reflectance,d.reflectance,0,.08),
    subsurface:bounded(p.subsurface,d.subsurface,0,1),regionVariation:bounded(p.regionVariation,1,0,1)};
}
export function withSkinFinish(p:SkinMaterialParameters,finish:keyof typeof SKIN_FINISHES):SkinMaterialParameters {
  return {...p,...SKIN_FINISHES[finish],skinFinish:finish};
}
/** Continuous pigment absorption for custom/legacy swatches; surface F0 stays independent. */
export function pigmentAbsorption(color:string) {
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
  return Math.max(.12,Math.min(1,1-(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)));
}
export type SkinRegion='skin'|'lip'|'ear';
/** RGBA: oil-zone weight, lip weight, thin tissue weight, reserved makeup mask.
 * Coordinates are in the unscaled model's local meters; masks follow the model. */
export function skinMask(x:number,y:number,z:number,region:SkinRegion='skin'):[number,number,number,number] {
  const g=(v:number,s:number)=>Math.exp(-((v/s)**2));
  const front=Math.max(0,Math.min(1,(z-.035)/.055));
  const nose=g(x,.023)*g(y-1.592,.052)*front;
  const forehead=g(x,.065)*g(y-1.676,.036)*front;
  const cheekEdge=g(Math.abs(x)-.078,.018)*g(y-1.578,.045)*front;
  const alar=g(Math.abs(x)-.022,.012)*g(y-1.572,.018)*front;
  return [Math.min(1,nose+forehead*.65),region==='lip'?1:0,
    region==='ear'?1:Math.min(.6,cheekEdge*.4+alar*.55),0];
}
