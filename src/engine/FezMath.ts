import * as THREE from "three";
import {
  Axis,
  FaceOrientation,
  faceAsAxis,
} from "./CollisionEnums";

/**
 * FezMath.cs — Vector math utilities matching FEZ's original implementations.
 *
 * XNA coordinate conventions (right-handed, Y-up):
 *   Vector3.Forward  = (0, 0, -1)
 *   Vector3.Backward = (0, 0,  1)
 *   Vector3.Left     = (-1, 0, 0)
 *   Vector3.Right    = ( 1, 0, 0)
 *   Vector3.Up       = (0,  1, 0)
 *   Vector3.Down     = (0, -1, 0)
 *
 * Three.js uses the same conventions (right-handed, Y-up, -Z forward).
 */

import { Viewpoint } from "./Viewpoint";

export const EPSILON = 0.001;
export const HALF_VECTOR = new THREE.Vector3(0.5, 0.5, 0.5);

// --- Viewpoint-to-axis vector conversions (FezMath.cs) ---

/**
 * RightVector: the screen-horizontal axis for a viewpoint.
 * FEZ: Front→Right(1,0,0), Right→Forward(0,0,-1), Back→Left(-1,0,0), Left→Backward(0,0,1)
 */
export function rightVector(v: Viewpoint): THREE.Vector3 {
  switch (v) {
    case Viewpoint.Front:
      return new THREE.Vector3(1, 0, 0);
    case Viewpoint.Right:
      return new THREE.Vector3(0, 0, -1);
    case Viewpoint.Back:
      return new THREE.Vector3(-1, 0, 0);
    case Viewpoint.Left:
      return new THREE.Vector3(0, 0, 1);
    default:
      return new THREE.Vector3(1, 0, 0);
  }
}

/**
 * ForwardVector: camera look direction INTO the scene.
 * FEZ: Front→(0,0,-1), Right→(-1,0,0), Back→(0,0,1), Left→(1,0,0)
 */
export function forwardVector(v: Viewpoint): THREE.Vector3 {
  switch (v) {
    case Viewpoint.Front:
      return new THREE.Vector3(0, 0, -1);
    case Viewpoint.Right:
      return new THREE.Vector3(-1, 0, 0);
    case Viewpoint.Back:
      return new THREE.Vector3(0, 0, 1);
    case Viewpoint.Left:
      return new THREE.Vector3(1, 0, 0);
    default:
      return new THREE.Vector3(0, 0, -1);
  }
}

/**
 * DepthMask: the axis that gets flattened (unsigned mask).
 * Front/Back→(0,0,1), Right/Left→(1,0,0)
 */
export function depthMask(v: Viewpoint): THREE.Vector3 {
  switch (v) {
    case Viewpoint.Front:
    case Viewpoint.Back:
      return new THREE.Vector3(0, 0, 1);
    case Viewpoint.Right:
    case Viewpoint.Left:
      return new THREE.Vector3(1, 0, 0);
    default:
      return new THREE.Vector3(0, 0, 1);
  }
}

/**
 * ScreenSpaceMask: complement of DepthMask (which axes are visible).
 * Front/Back→(1,1,0), Right/Left→(0,1,1)
 */
export function screenSpaceMask(v: Viewpoint): THREE.Vector3 {
  switch (v) {
    case Viewpoint.Front:
    case Viewpoint.Back:
      return new THREE.Vector3(1, 1, 0);
    case Viewpoint.Right:
    case Viewpoint.Left:
      return new THREE.Vector3(0, 1, 1);
    default:
      return new THREE.Vector3(1, 1, 0);
  }
}

/**
 * SideMask: horizontal-only screen mask (unsigned).
 * Front/Back→(1,0,0), Right/Left→(0,0,1)
 */
export function sideMask(v: Viewpoint): THREE.Vector3 {
  switch (v) {
    case Viewpoint.Front:
    case Viewpoint.Back:
      return new THREE.Vector3(1, 0, 0);
    case Viewpoint.Right:
    case Viewpoint.Left:
      return new THREE.Vector3(0, 0, 1);
    default:
      return new THREE.Vector3(1, 0, 0);
  }
}

/**
 * VisibleOrientation: which face of a trile faces the camera for a given viewpoint.
 */
export function visibleOrientation(v: Viewpoint): FaceOrientation {
  switch (v) {
    case Viewpoint.Front:
      return FaceOrientation.Front;
    case Viewpoint.Right:
      return FaceOrientation.Right;
    case Viewpoint.Back:
      return FaceOrientation.Back;
    case Viewpoint.Left:
      return FaceOrientation.Left;
    default:
      return FaceOrientation.Front;
  }
}

/**
 * VisibleAxis: the world axis that maps to the depth axis.
 */
export function visibleAxis(v: Viewpoint): Axis {
  switch (v) {
    case Viewpoint.Front:
    case Viewpoint.Back:
      return Axis.Z;
    case Viewpoint.Right:
    case Viewpoint.Left:
      return Axis.X;
    default:
      return Axis.Z;
  }
}

/** Get a unit vector mask for an axis */
export function axisMask(a: Axis): THREE.Vector3 {
  switch (a) {
    case Axis.X:
      return new THREE.Vector3(1, 0, 0);
    case Axis.Y:
      return new THREE.Vector3(0, 1, 0);
    case Axis.Z:
      return new THREE.Vector3(0, 0, 1);
  }
}

// --- Phi (Y-axis rotation) helpers ---

export function toPhi(face: FaceOrientation): number {
  switch (face) {
    case FaceOrientation.Front:
      return 0;
    case FaceOrientation.Right:
      return Math.PI / 2;
    case FaceOrientation.Back:
      return -Math.PI;
    case FaceOrientation.Left:
      return -Math.PI / 2;
    default:
      throw new Error(`Cannot convert non-side face to phi: ${face}`);
  }
}

export function viewpointToPhi(v: Viewpoint): number {
  switch (v) {
    case Viewpoint.Front:
      return 0;
    case Viewpoint.Right:
      return Math.PI / 2;
    case Viewpoint.Back:
      return -Math.PI;
    case Viewpoint.Left:
      return -Math.PI / 2;
    default:
      throw new Error(`Cannot convert non-orthographic viewpoint to phi: ${v}`);
  }
}

export function snapPhi(phi: number): number {
  return Math.round(phi * (2 / Math.PI)) / (2 / Math.PI);
}

export function wrapAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle <= -Math.PI) angle += 2 * Math.PI;
  return angle;
}

export function orientationFromPhi(phi: number): FaceOrientation {
  phi = wrapAngle(phi);
  if (almostEqual(phi, 0)) return FaceOrientation.Front;
  if (almostEqual(phi, Math.PI / 2)) return FaceOrientation.Right;
  if (almostEqual(phi, -Math.PI) || almostEqual(phi, Math.PI))
    return FaceOrientation.Back;
  if (almostEqual(phi, -Math.PI / 2)) return FaceOrientation.Left;
  // Snap and retry
  return orientationFromPhi(snapPhi(phi));
}

// --- Vector utilities ---

export function vec3Sign(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(Math.sign(v.x), Math.sign(v.y), Math.sign(v.z));
}

export function vec3Abs(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
}

export function vec3Floor(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    Math.floor(v.x),
    Math.floor(v.y),
    Math.floor(v.z),
  );
}

export function vec3Frac(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(v.x - Math.floor(v.x), v.y - Math.floor(v.y), v.z - Math.floor(v.z));
}

/** Component-wise multiply */
export function vec3Mul(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
}

/** Get a mask: 1 for non-zero components, 0 for zero */
export function vec3GetMask(v: THREE.Vector3): THREE.Vector3 {
  return vec3Abs(vec3Sign(v));
}

export function almostEqual(a: number, b: number, eps = EPSILON): boolean {
  return Math.abs(a - b) <= eps;
}

export function almostEqualVec3(
  a: THREE.Vector3,
  b: THREE.Vector3,
  eps = EPSILON,
): boolean {
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.z - b.z) <= eps
  );
}

/** Clamp values near 0, 1, or -1 to exactly those values */
export function almostClamp(v: number, eps = 1e-6): number {
  if (Math.abs(v) <= eps) return 0;
  if (Math.abs(v - 1) <= eps) return 1;
  if (Math.abs(v + 1) <= eps) return -1;
  return v;
}

export function almostClampVec3(
  v: THREE.Vector3,
  eps = 1e-6,
): THREE.Vector3 {
  return new THREE.Vector3(
    almostClamp(v.x, eps),
    almostClamp(v.y, eps),
    almostClamp(v.z, eps),
  );
}

/** FEZ's signed distance between viewpoints. Wraps: Front→Left = -1, Left→Front = +1 */
export function getViewpointDistance(from: Viewpoint, to: Viewpoint): number {
  let num = to - from;
  if (Math.abs(num) === 3) num = Math.sign(num) * -1;
  return num;
}

/** Get a rotated viewpoint, wrapping to stay in 1-4 (Front/Right/Back/Left) */
export function getRotatedView(from: Viewpoint, distance: number): Viewpoint {
  let num = from + distance;
  while (num > 4) num -= 4;
  while (num < 1) num += 4;
  return num as Viewpoint;
}

/** Get the component of a vector along an axis */
export function getAxisComponent(v: THREE.Vector3, axis: Axis): number {
  switch (axis) {
    case Axis.X: return v.x;
    case Axis.Y: return v.y;
    case Axis.Z: return v.z;
  }
}

/** Set the component of a vector along an axis */
export function setAxisComponent(v: THREE.Vector3, axis: Axis, value: number): void {
  switch (axis) {
    case Axis.X: v.x = value; break;
    case Axis.Y: v.y = value; break;
    case Axis.Z: v.z = value; break;
  }
}
