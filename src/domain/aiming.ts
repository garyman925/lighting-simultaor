import { Quaternion, Vector3 } from 'three';
import { lookAt } from './scene';
import type { LightSpec, SceneDocument, Vec3 } from './scene';

export type AimTarget = 'face' | 'chest' | 'center';
export const horizontalShortcuts = [-90, -45, 0, 45, 90, 135, 180];
export const verticalShortcuts = [-45, -30, 0, 30, 45];
export const rotationSnaps = [0, 5, 15, 45] as const;
export function snapRadians(degrees: number) { return degrees ? degrees * Math.PI / 180 : null; }
const rad = Math.PI / 180;

/** Landmarks in the procedural model's local coordinates; follow scale and rotation. */
export function aimPoint(scene: SceneDocument, target: AimTarget = 'face'): Vec3 {
  const local: Vec3 = target === 'face' ? [0, 1.60, .10] : target === 'chest' ? [0, 1.28, .10] : [0, .875, 0];
  return new Vector3(...local).multiplyScalar(scene.model.heightCm / 175)
    .applyQuaternion(new Quaternion(...scene.model.transform.quaternion))
    .add(new Vector3(...scene.model.transform.positionM)).toArray();
}

/** Horizontal ground-plane basis. Camera roll and editor orbit do not change photography sides. */
export function cameraBasis(scene: SceneDocument) {
  const front = new Vector3(...scene.camera.transform.positionM).sub(new Vector3(...scene.model.transform.positionM));
  front.y = 0;
  if (front.lengthSq() < 1e-10) {
    front.set(0, 0, 1).applyQuaternion(new Quaternion(...scene.camera.transform.quaternion)); front.y = 0;
    if (front.lengthSq() < 1e-10) front.set(0, 0, 1);
  }
  front.normalize();
  return { front, right: new Vector3(0, 1, 0).cross(front).normalize() };
}

export function lightAngles(scene: SceneDocument, light: LightSpec) {
  const offset = new Vector3(...light.transform.positionM).sub(new Vector3(...aimPoint(scene, light.aiming?.target)));
  const { front, right } = cameraBasis(scene);
  return { horizontal: Math.atan2(offset.dot(right), offset.dot(front)) / rad,
    vertical: Math.atan2(offset.y, Math.hypot(offset.x, offset.z)) / rad, distance: offset.length() };
}

export function aimLight(scene: SceneDocument, light: LightSpec, target: AimTarget = light.aiming?.target ?? 'face'): LightSpec {
  const point = aimPoint(scene, target), position = light.transform.positionM;
  return { ...light, aiming: { target, auto: light.aiming?.auto ?? false }, transform: { ...light.transform,
    quaternion: Math.hypot(...position.map((v, i) => v - point[i])) < 1e-6 ? light.transform.quaternion : lookAt(position, point) } };
}

/** Orbit the target at fixed radius, then aim local -Z (the emitting face) at it. */
export function placeLight(scene: SceneDocument, light: LightSpec, angles: { horizontal?: number; vertical?: number; distance?: number }): LightSpec {
  if (Object.values(angles).some(v => !Number.isFinite(v))) return light;
  const current = lightAngles(scene, light), h = (angles.horizontal ?? current.horizontal) * rad;
  const v = Math.max(-89, Math.min(89, angles.vertical ?? current.vertical)) * rad;
  const radius = Math.max(.1, angles.distance ?? current.distance), { front, right } = cameraBasis(scene);
  const position = new Vector3(...aimPoint(scene, light.aiming?.target))
    .addScaledVector(front, radius * Math.cos(v) * Math.cos(h))
    .addScaledVector(right, radius * Math.cos(v) * Math.sin(h));
  position.y += radius * Math.sin(v);
  return aimLight(scene, { ...light, transform: { ...light.transform, positionM: position.toArray() } });
}

export function syncAutoAim(scene: SceneDocument): SceneDocument {
  return { ...scene, lights: scene.lights.map(light => light.aiming?.auto ? aimLight(scene, light) : light) };
}

/** Rebase a preset's semantic angles onto the user's current camera/model. */
export function applyLightingPreset(scene: SceneDocument, preset: SceneDocument): SceneDocument {
  return { ...scene, name: preset.name, lights: preset.lights.map(light => placeLight(scene, light, lightAngles(preset, light))) };
}
