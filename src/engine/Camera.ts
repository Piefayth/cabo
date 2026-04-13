import * as THREE from "three";
import { BaseComponent } from "../core/Component";
import { ServiceContainer } from "../core/ServiceContainer";
import {
  Viewpoint,
  rotateLeft,
  rotateRight,
  viewpointDistance,
  isOrthographic,
} from "./Viewpoint";
import { forwardVector } from "./FezMath";

/**
 * Camera — viewpoint rotation + orthographic projection.
 *
 * Constants ported from FEZ/FezEngine/Services/DefaultCameraManager.cs:
 *   TransitionSpeed        = 0.45  (seconds; scaled by viewpoint distance)
 *   DefaultFov             = 45°   (perspective FOV for first-person)
 *   defaultViewableWidth   = 26.66667  (ortho half-width reference)
 *   TrixelsPerTrile        = 16    (unit conversion factor)
 *   DefaultNearPlane       = 0.1
 *   DefaultFarPlane        = 500
 *
 * Rotation uses a spline-style arc through a midpoint rather than linear
 * interpolation — FEZ's `Vector3SplineInterpolation`. This ported version
 * interpolates the camera direction vector through an intermediate
 * perpendicular (the natural halfway vector for the rotation) so the
 * camera arcs rather than shortest-path lerps.
 *
 * The projection transition (ortho ↔ perspective morph during rotation)
 * is intentionally deferred — FEZ uses a `ProjectionTransition` matrix
 * interpolation that requires additional infrastructure.
 */
const TRANSITION_SPEED = 0.45;
const DEFAULT_VIEWABLE_WIDTH = 26.66667;
const DEFAULT_NEAR_PLANE = 0.1;
const DEFAULT_FAR_PLANE = 500;
/** Distance from center to camera along the direction vector.
 *  FEZ uses 249.95 for the orthographic look-at eye distance. */
const CAMERA_DISTANCE = 249.95;

export class Camera extends BaseComponent {
  readonly camera: THREE.OrthographicCamera;

  private _viewpoint = Viewpoint.Front;
  private _targetViewpoint = Viewpoint.Front;
  private _transitioning = false;
  private _transitionProgress = 0;
  private _transitionDuration = TRANSITION_SPEED;

  private _startDirection = new THREE.Vector3(0, 0, 1);
  private _endDirection = new THREE.Vector3(0, 0, 1);
  private _midDirection = new THREE.Vector3(0, 0, 1);

  /** Listeners fired when a viewpoint change completes. Mirrors
   *  DefaultCameraManager.ChangeViewpoint callbacks. */
  private onRotateListeners: Array<(vp: Viewpoint) => void> = [];

  center = new THREE.Vector3(0, 8, 0);
  /** Current viewable width (FEZ's PredefinedView.Radius equivalent). */
  viewableWidth = DEFAULT_VIEWABLE_WIDTH;

  private _aspect = window.innerWidth / window.innerHeight;

  constructor(services: ServiceContainer) {
    super(services, -100);
    // FEZ: Matrix.CreateOrthographic(width, width/aspect, near, far).
    // XNA/Three convention: width is FULL width (symmetric around 0).
    // So half-width = viewableWidth / 2, half-height = viewableWidth / 2 / aspect.
    const hw = this.viewableWidth / 2;
    const hh = hw / this._aspect;
    this.camera = new THREE.OrthographicCamera(
      -hw,
      hw,
      hh,
      -hh,
      DEFAULT_NEAR_PLANE,
      DEFAULT_FAR_PLANE,
    );
    this._startDirection.copy(forwardVector(this._viewpoint)).negate();
    this._endDirection.copy(this._startDirection);
    this._applyCameraPosition();
  }

  get viewpoint(): Viewpoint {
    return this._viewpoint;
  }

  get isTransitioning(): boolean {
    return this._transitioning;
  }

  get transitionProgress(): number {
    return this._transitionProgress;
  }

  /** Register a callback that fires when a rotation completes. */
  onRotate(cb: (vp: Viewpoint) => void): void {
    this.onRotateListeners.push(cb);
  }

  resize(width: number, height: number): void {
    this._aspect = width / height;
    const hw = this.viewableWidth / 2;
    const hh = hw / this._aspect;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }

  rotateViewRight(): void {
    if (this._transitioning) return;
    this._startTransition(rotateRight(this._viewpoint));
  }

  rotateViewLeft(): void {
    if (this._transitioning) return;
    this._startTransition(rotateLeft(this._viewpoint));
  }

  private _startTransition(target: Viewpoint): void {
    if (!isOrthographic(target)) return;
    this._targetViewpoint = target;
    this._transitioning = true;
    this._transitionProgress = 0;

    // Camera direction points AWAY from the scene, toward the camera.
    this._startDirection.copy(forwardVector(this._viewpoint)).negate();
    this._endDirection.copy(forwardVector(target)).negate();

    // Intermediate direction matches FEZ's GetIntemediateVector:
    //  - Non-antipodal: slerp(from, to, 0.5) — approximated by normalizing (from+to).
    //  - Antipodal: Cross(Normalize(to - from), UnitY), which stays in the
    //    horizontal plane instead of flying over the top.
    const mid = this._startDirection.clone().add(this._endDirection);
    if (mid.lengthSq() < 1e-6) {
      const delta = this._endDirection
        .clone()
        .sub(this._startDirection)
        .normalize();
      mid.copy(delta).cross(new THREE.Vector3(0, 1, 0));
      if (mid.lengthSq() < 1e-6) mid.set(0, 1, 0); // vertical-axis fallback
    }
    mid.normalize();
    this._midDirection.copy(mid);

    // FEZ duration: TransitionSpeed * ((|dist|-1)/2 + 1).
    // For 1-step: × 1.0. For 2-step (180°): × 1.5. Not × 2.0.
    const absDist = Math.abs(viewpointDistance(this._viewpoint, target));
    const durationScale = (absDist - 1) / 2 + 1;
    this._transitionDuration = TRANSITION_SPEED * durationScale;

    // FEZ fires ViewpointChanged at the START of the transition (not the
    // end). Listeners react to the target viewpoint immediately.
    for (const cb of this.onRotateListeners) cb(target);
  }

  update(dt: number): void {
    if (!this._transitioning) {
      this._applyCameraPosition();
      return;
    }

    this._transitionProgress += dt / this._transitionDuration;

    if (this._transitionProgress >= 1) {
      this._transitionProgress = 1;
      this._transitioning = false;
      this._viewpoint = this._targetViewpoint;
      this._applyCameraPosition();
      return;
    }

    // FEZ's Vector3SplineInterpolation advances t LINEARLY along the
    // spline — no quadratic in/out. The smoothness comes from the
    // spline curve shape itself, not from easing the t parameter.
    const dir = this._splineDirection(this._transitionProgress);
    this._setCameraFromDirection(dir);
  }

  private _splineDirection(t: number): THREE.Vector3 {
    // Quadratic Bézier:  P(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
    // where P0=startDir, P1=midDir, P2=endDir.
    const u = 1 - t;
    const p = new THREE.Vector3();
    p.addScaledVector(this._startDirection, u * u);
    p.addScaledVector(this._midDirection, 2 * u * t);
    p.addScaledVector(this._endDirection, t * t);
    p.normalize();
    return p;
  }

  private _applyCameraPosition(): void {
    const dir = forwardVector(this._viewpoint).clone().negate();
    this._setCameraFromDirection(dir);
  }

  private _setCameraFromDirection(dir: THREE.Vector3): void {
    // dir points FROM center TOWARD the camera's desired position.
    const eye = this.center.clone().add(
      dir.clone().multiplyScalar(CAMERA_DISTANCE),
    );
    this.camera.position.copy(eye);
    this.camera.lookAt(this.center);
    this.camera.updateProjectionMatrix();
  }
}
