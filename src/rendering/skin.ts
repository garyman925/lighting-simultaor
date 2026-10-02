import * as T from 'three';
import { pigmentAbsorption,resolveSkin } from '../domain/skin';
import type { SkinMaterialParameters } from '../domain/skin';
import type { RenderQuality } from './quality';

// Same near/far as the renderer's pooled spot shadow cameras.
export const SKIN_SHADOW_NEAR=.08,SKIN_SHADOW_FAR=15;
const declarations=`
varying vec4 vSkinMask;
uniform float skinVariation, skinSSS, skinQuality, skinPigment;
uniform vec2 skinShadowRange;
float skinLightDepth(float d) {
  return skinShadowRange.x*skinShadowRange.y /
    max(.00001,skinShadowRange.y-d*(skinShadowRange.y-skinShadowRange.x));
}
vec3 skinTransmission(sampler2D map,vec3 coord,vec2 offset) {
  float depth=unpackRGBAToDepth(texture2D(map,coord.xy+offset));
  float thickness=max(0.,skinLightDepth(coord.z)-skinLightDepth(depth));
  // Beer-Lambert inspired RGB attenuation, not measured spectral tissue.
  return exp(-max(.003,thickness)*vec3(38.,95.,180.)*(1.+skinPigment*1.6));
}
`;
const translucency=`
#if defined(USE_SHADOWMAP) && (UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS)
if(skinQuality>0.5 && skinSSS>0. && vSkinMask.z>0.001) {
  vec3 sc=vSpotLightCoord[i].xyz/vSpotLightCoord[i].w;
  if(all(greaterThan(sc,vec3(0.))) && all(lessThan(sc,vec3(1.)))) {
    vec3 transmitted;
    if(skinQuality>1.5) {
      vec2 texel=0.5/spotLightShadow.shadowMapSize;
      transmitted=(skinTransmission(spotShadowMap[i],sc,texel)+
        skinTransmission(spotShadowMap[i],sc,-texel)+
        skinTransmission(spotShadowMap[i],sc,vec2(texel.x,-texel.y))+
        skinTransmission(spotShadowMap[i],sc,vec2(-texel.x,texel.y)))*.25;
    }else transmitted=skinTransmission(spotShadowMap[i],sc,vec2(0.));
    float back=smoothstep(-.15,.65,-dot(geometryNormal,directLight.direction));
    float edge=.35+.65*pow(1.-abs(dot(geometryNormal,geometryViewDir)),2.);
    reflectedLight.directDiffuse+=skinRawLight*transmitted*back*edge*
      skinSSS*vSkinMask.z*.45*RECIPROCAL_PI*(1.-material.specularColor);
  }
}
#endif
`;
/** Hooks only the physical skin material. Cornea remains an independent emitter-ray shader. */
export function makeSkinMaterial() {
  const material=new T.MeshPhysicalMaterial({color:'#BD8867',roughness:.43,metalness:0,ior:1.5,specularIntensity:1});
  const uniforms={
    skinVariation:{value:1},skinSSS:{value:.45},skinQuality:{value:1},skinPigment:{value:.4},
    skinShadowRange:{value:new T.Vector2(SKIN_SHADOW_NEAR,SKIN_SHADOW_FAR)},
  };
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 skinMask; varying vec4 vSkinMask;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvSkinMask=skinMask;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <packing>','#include <packing>\n'+declarations);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor-skinVariation*(vSkinMask.x*.075+vSkinMask.y*.09),.20,.9);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.82,.57,.59),vSkinMask.y*.55);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
      #include <lights_physical_fragment>
      material.specularColor*=1.+skinVariation*(vSkinMask.x*.12+vSkinMask.y*.18);
      material.diffuseColor*=1.-material.specularColor;
    `);
    // Soft diffuse wrap redistributes a small fraction of front illumination, retaining shadows.
    let physical=T.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
      `float nl=dot(geometryNormal,directLight.direction);
       float wrapped=max(0.,nl+.25)/1.5625;
       float scatter=skinQuality>.5?skinSSS*.28:0.;
       reflectedLight.directDiffuse += mix(dotNL,wrapped,scatter)*directLight.color*BRDF_Lambert(material.diffuseColor);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',physical);
    let lights=T.ShaderChunk.lights_fragment_begin;
    const start=lights.indexOf('#if ( NUM_SPOT_LIGHTS');
    const end=lights.indexOf('#if ( NUM_DIR_LIGHTS',start);
    const spot=lights.slice(start,end)
      .replace('SpotLight spotLight;','SpotLight spotLight; vec3 skinRawLight;')
      .replace('getSpotLightInfo( spotLight, geometryPosition, directLight );','getSpotLightInfo( spotLight, geometryPosition, directLight );\n skinRawLight=directLight.color;')
      .replace('RE_Direct( directLight,',translucency+'\nRE_Direct( directLight,');
    lights=lights.slice(0,start)+spot+lights.slice(end);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lights);
  };
  material.customProgramCacheKey=()=> 'portrait-skin-v1';
  return {material,uniforms,
    update(value:SkinMaterialParameters,quality:RenderQuality) {
      const p=resolveSkin(value);
      material.color.set(p.skinTone);material.roughness=p.roughness;
      // Neutral dielectric F0 derived from user reflectance; pigment never tints the reflection.
      const root=Math.sqrt(p.reflectance);material.ior=(1+root)/(1-root);
      uniforms.skinVariation.value=p.regionVariation;uniforms.skinSSS.value=p.subsurface;
      uniforms.skinPigment.value=pigmentAbsorption(p.skinTone);
      uniforms.skinQuality.value=quality==='Draft'?0:quality==='High'?2:1;
    },
  };
}
