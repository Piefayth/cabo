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
/** Perspective FOV reached at the midpoint of a viewpoint transition.
 *  FEZ's GameCameraManager.FirstPersonFov = 75°; we use a gentler 55°
 *  which reads as a noticeable but not-jarring dolly-zoom during rotation. */
const TRANSITION_FOV_DEG = 55;

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

  /** Cached orthographic projection matrix — applied when not
   *  transitioning. Perspective matrices used during transitions are
   *  built per-frame by _applyMorph since both the FOV and the
   *  camera dolly distance depend on the transition blend factor. */
  private _orthoMatrix = new THREE.Matrix4();

  /** Listeners fired when a viewpoint change STARTS (matches FEZ's
   *  ChangeViewpoint event timing — fires with the target viewpoint). */
  private onRotateListeners: Array<(vp: Viewpoint) => void> = [];

  /** Listeners fired when a viewpoint change COMPLETES (used for
   *  deferred re-evaluation that needs the new viewpoint to be fully
   *  active — e.g., DetermineInBackground). */
  private onRotationCompleteListeners: Array<(vp: Viewpoint) => void> = [];

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
    this._rebuildProjectionMatrices();
    this._startDirection.copy(forwardVector(this._viewpoint)).negate();
    this._endDirection.copy(this._startDirection);
    this._applyCameraPosition();
  }

  /**
   * Recomputes the cached ortho projection matrix for the current
   * viewable width and aspect. Perspective matrices are rebuilt
   * per-frame during transitions because they depend on the blend
   * factor (FOV lerps from ortho-equivalent narrow → TRANSITION_FOV
   * wide). Dolly distance is computed to keep scene size constant.
   */
  private _rebuildProjectionMatrices(): void {
    const hw = this.viewableWidth / 2;
    const hh = hw / this._aspect;
    this._orthoMatrix.makeOrthographic(
      -hw,
      hw,
      hh,
      -hh,
      DEFAULT_NEAR_PLANE,
      DEFAULT_FAR_PLANE,
    );
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

  /** Fires at the START of a viewpoint transition (matches FEZ). */
  onRotate(cb: (vp: Viewpoint) => void): void {
    this.onRotateListeners.push(cb);
  }

  /** Fires at the END of a viewpoint transition, when the new
   *  viewpoint is fully the current one. Used for deferred physics
   *  re-evaluation. */
  onRotationComplete(cb: (vp: Viewpoint) => void): void {
    this.onRotationCompleteListeners.push(cb);
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
    this._rebuildProjectionMatrices();
    if (!this._transitioning) this._applyOrtho();
  }

  /** Applies the cached ortho matrix to the Three.js camera. */
  private _applyOrtho(): void {
    this.camera.projectionMatrix.copy(this._orthoMatrix);
    this.camera.projectionMatrixInverse
      .copy(this._orthoMatrix)
      .invert();
  }

  /**
   * Dolly-zoom morph during a viewpoint transition.
   *
   * Keeps subject size at the look-at point constant by dollying the
   * camera closer as FOV widens (and back out as FOV narrows).
   *
   * Endpoints are ortho-equivalent: at blend=0 the FOV is so narrow
   * that perspective is indistinguishable from ortho at
   * CAMERA_DISTANCE, so the transition in/out is seamless with the
   * ortho framing used when not transitioning.
   *
   * At blend=1 (midpoint) FOV is TRANSITION_FOV_DEG and the camera
   * has pulled close enough that scene size at the look-at stays
   * constant — producing the "Vertigo" / dolly-zoom visual that
   * reveals the 3D structure without changing object size.
   *
   * Returns the effective camera distance for this frame so the
   * caller can position the eye.
   */
  private _applyMorph(progress: number): number {
    // Bell curve: 0 at t=0, 1 at t=0.5, 0 at t=1.
    const blend = Math.sin(Math.PI * progress);
    const hh = this.viewableWidth / 2 / this._aspect;
    // FOV that makes a perspective camera at CAMERA_DISTANCE match the
    // ortho view's rectangle — ≈3° for our setup. Indistinguishable
    // from ortho visually, so blend=0 is seamless.
    const orthoEquivFov = 2 * Math.atan(hh / CAMERA_DISTANCE);
    const targetFov = (TRANSITION_FOV_DEG * Math.PI) / 180;
    const fov = orthoEquivFov * (1 - blend) + targetFov * blend;
    // Dolly distance — keeps half-height constant at the look-at.
    const dollyD = hh / Math.tan(fov / 2);
    // Build perspective matrix directly (cheaper than lerping a cached
    // one and mathematically cleaner).
    const ptan = Math.tan(fov / 2);
    const t = ptan * DEFAULT_NEAR_PLANE;
    const r = t * this._aspect;
    this.camera.projectionMatrix.makePerspective(
      -r,
      r,
      t,
      -t,
      DEFAULT_NEAR_PLANE,
      DEFAULT_FAR_PLANE,
    );
    this.camera.projectionMatrixInverse
      .copy(this.camera.projectionMatrix)
      .invert();
    return dollyD;
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
      this._applyOrtho();
      return;
    }

    this._transitionProgress += dt / this._transitionDuration;

    if (this._transitionProgress >= 1) {
      this._transitionProgress = 1;
      this._transitioning = false;
      this._viewpoint = this._targetViewpoint;
      this._applyCameraPosition();
      this._applyOrtho();
      // Fire completion listeners with the NEW viewpoint now fully
      // active. Used for deferred physics re-evaluation.
      for (const cb of this.onRotationCompleteListeners) cb(this._viewpoint);
      return;
    }

    // FEZ's Vector3SplineInterpolation advances t LINEARLY along the
    // spline — no quadratic in/out. The smoothness comes from the
    // spline curve shape itself, not from easing the t parameter.
    const dir = this._splineDirection(this._transitionProgress);

    // Morph projection + compute dolly-zoom camera distance. Returns
    // the distance at which the current FOV produces the same subject
    // size as the ortho view at CAMERA_DISTANCE — so scene size stays
    // constant while FOV widens and the camera pulls closer.
    const dollyDistance = this._applyMorph(this._transitionProgress);
    this._setCameraFromDirection(dir, dollyDistance);
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

  private _setCameraFromDirection(
    dir: THREE.Vector3,
    distance: number = CAMERA_DISTANCE,
  ): void {
    // dir points FROM center TOWARD the camera's desired position.
    const eye = this.center.clone().add(
      dir.clone().multiplyScalar(distance),
    );
    this.camera.position.copy(eye);
    this.camera.lookAt(this.center);
    // NOTE: do NOT call updateProjectionMatrix here — _applyOrtho or
    // _applyMorph manages projectionMatrix directly and Three's auto
    // update would stomp the morph mid-transition.
  }
}
