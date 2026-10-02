export type RenderQuality='Draft'|'Standard'|'High';
export const QUALITY={Draft:{batches:1,scale:.65,maxWidth:720,samples:1},Standard:{batches:4,scale:1,maxWidth:1200,samples:4},High:{batches:8,scale:1.5,maxWidth:1800,samples:4}};
export function qualityName(value:string):RenderQuality{return value==='low'?'Draft':value==='balanced'?'Standard':value==='Draft'||value==='High'?value:'Standard';}
