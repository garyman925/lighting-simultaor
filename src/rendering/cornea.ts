import * as T from 'three';
import { emitterSurface, opticalParameters } from '../domain/equipment';
import { exposure, sourcePower } from '../domain/scene';
import type { LightSpec, CameraSpec } from '../domain/scene';

/** Analytic ray/emitter intersection on the actual curved corneal surface.
 * Separate additive radiance pass, sharing the opaque scene's depth buffer.
 * No environment capture, sprite, point-light specular or modifier texture. */
export function makeCorneaMaterial() {
  return new T.ShaderMaterial({
    transparent:true, blending:T.AdditiveBlending, depthWrite:false, toneMapped:false,
    uniforms:{worldToEmitter:{value:new T.Matrix4()},halfSize:{value:new T.Vector2()},shape:{value:0},radiance:{value:new T.Color(0)},cutoff:{value:0},innerCutoff:{value:0},worldToHead:{value:new T.Matrix4()}},
    vertexShader:`varying vec3 worldP; varying vec3 worldN;
      void main(){worldP=(modelMatrix*vec4(position,1.)).xyz;
        worldN=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.);}`,
    fragmentShader:`precision highp float;
      uniform mat4 worldToEmitter,worldToHead; uniform vec2 halfSize;
      uniform int shape; uniform vec3 radiance; uniform float cutoff,innerCutoff;
      varying vec3 worldP; varying vec3 worldN;
      // Conservative nose ellipsoid blocks reflections arriving through the bridge.
      bool noseBlocks(vec3 o,vec3 d,float endT){
        vec3 p=((worldToHead*vec4(o,1.)).xyz-vec3(0.,1.602,.117))/vec3(.018,.049,.027);
        vec3 v=(worldToHead*vec4(d,0.)).xyz/vec3(.018,.049,.027);
        float a=dot(v,v),b=dot(p,v),c=dot(p,p)-1.,h=b*b-a*c;
        if(h<0.)return false;float t=(-b-sqrt(h))/a;return t>.0005&&t<endT;
      }
      void main(){
        vec3 n=normalize(worldN),viewDir=normalize(cameraPosition-worldP);
        vec3 ray=reflect(-viewDir,n);
        vec3 o=(worldToEmitter*vec4(worldP,1.)).xyz;
        vec3 d=(worldToEmitter*vec4(ray,0.)).xyz;
        float t=-1.;
        if(shape==3){
          // VS03 umbrella: z=.165-.2*((x/hx)^2+(y/hy)^2).
          vec2 p=o.xy/halfSize,v=d.xy/halfSize;
          float a=.2*dot(v,v),b=d.z+.4*dot(p,v),c=o.z-.165+.2*dot(p,p);
          float h=b*b-4.*a*c;
          if(abs(a)<.000001){if(abs(b)>.000001)t=-c/b;}
          else if(h>=0.){float t0=(-b-sqrt(h))/(2.*a),t1=(-b+sqrt(h))/(2.*a);t=t0>0.?t0:t1;}
        }else if(abs(d.z)>.000001)t=(-.035-o.z)/d.z;
        if(t<=0.||d.z<=0.||noseBlocks(worldP,ray,t))discard;
        vec2 p=(o+t*d).xy/halfSize;
        float edge;
        if(shape==0)edge=max(abs(p.x),abs(p.y))-1.;
        else if(shape==1){float a=atan(p.y,p.x);float sector=mod(a+.3926990817,.7853981634)-.3926990817;
          edge=length(p)*cos(sector)-.9238795325;
        }else edge=length(p)-1.;
        float aa=max(fwidth(edge),.002),mask=1.-smoothstep(-aa,aa,edge);
        if(shape==2)mask*=smoothstep(.25-aa,.25+aa,length(p));
        // Same angular cutoff, penumbra and grid transmission as direct light.
        float beam=smoothstep(cutoff,innerCutoff,d.z);
        float fresnel=.025+ .975*pow(1.-max(dot(n,viewDir),0.),5.);
        gl_FragColor=vec4(radiance*mask*beam*fresnel,1.);
      }`
  });
}
export function updateCorneaEmitter(material:T.ShaderMaterial,light:LightSpec,camera:CameraSpec,color:T.Color,head:T.Matrix4){
  const s=emitterSurface(light.modifier),opt=opticalParameters(light.modifier);
  material.uniforms.worldToEmitter.value.compose(new T.Vector3(...light.transform.positionM),new T.Quaternion(...light.transform.quaternion),new T.Vector3(1,1,1)).invert();
  material.uniforms.worldToHead.value.copy(head).invert();
  material.uniforms.halfSize.value.set(s.widthM/2,s.heightM/2);
  material.uniforms.shape.value=s.shape==='rectangle'?0:s.shape==='octagon'?1:s.shape==='dish'?2:s.shape==='umbrella'?3:4;
  material.uniforms.cutoff.value=Math.cos(opt.spreadDeg*Math.PI/360);
  material.uniforms.innerCutoff.value=Math.cos(opt.spreadDeg*Math.PI/360*(1-opt.penumbra));
  material.uniforms.radiance.value.copy(color).multiplyScalar(3.8*exposure(camera,light.source.mode)*sourcePower(light)*opt.gain/s.areaM2);
}
