import * as THREE from "three";
import { BaseComponent } from "../core/Component";
import { ServiceContainer } from "../core/ServiceContainer";
import {
  Viewpoint,
  getViewpointAngle,
  rotateLeft,
  rotateRight,
  viewpointDistance,
  isOrthographic,
} from "./Viewpoint";

const TRANSITION_BASE_DURATION = 0.45; // seconds, matching FEZ
const CAMERA_DISTANCE = 20;
const ORTHO_SIZE = 12; // half-height of orthographic frustum

export class Camera extends BaseComponent {
  readonly camera: THREE.OrthographicCamera;

  private _viewpoint = Viewpoint.Front;
  private _targetViewpoint = Viewpoint.Front;
  private _transitioning = false;
  private _transitionProgress = 0;
  private _transitionDuration = TRANSITION_BASE_DURATION;
  private _startAngle = 0;
  private _endAngle = 0;
  private _rotationDirection = 1; // 1 = clockwise, -1 = counter-clockwise

  center = new THREE.Vector3(0, 8, 0);
  private _aspect = window.innerWidth / window.innerHeight;

  constructor(services: ServiceContainer) {
    super(services, -100); // Update before everything else
    const hw = ORTHO_SIZE * this._aspect;
    this.camera = new THREE.OrthographicCamera(
      -hw,
      hw,
      ORTHO_SIZE,
      -ORTHO_SIZE,
      0.1,
      200,
    );
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

  resize(width: number, height: number): void {
    this._aspect = width / height;
    const hw = ORTHO_SIZE * this._aspect;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = ORTHO_SIZE;
    this.camera.bottom = -ORTHO_SIZE;
    this.camera.updateProjectionMatrix();
  }

  rotateViewRight(): void {
    if (this._transitioning) return;
    this._startTransition(rotateRight(this._viewpoint), 1);
  }

  rotateViewLeft(): void {
    if (this._transitioning) return;
    this._startTransition(rotateLeft(this._viewpoint), -1);
  }

  private _startTransition(target: Viewpoint, direction: number): void {
    if (!isOrthographic(target)) return;
    this._targetViewpoint = target;
    this._transitioning = true;
    this._transitionProgress = 0;
    this._rotationDirection = direction;

    this._startAngle = getViewpointAngle(this._viewpoint);
    this._endAngle = this._startAngle + direction * (Math.PI / 2);

    const dist = viewpointDistance(this._viewpoint, target);
    this._transitionDuration = TRANSITION_BASE_DURATION * dist;
  }

  update(dt: number): void {
    if (!this._transitioning) return;

    this._transitionProgress += dt / this._transitionDuration;

    if (this._transitionProgress >= 1) {
      this._transitionProgress = 1;
      this._transitioning = false;
      this._viewpoint = this._targetViewpoint;
      this._applyCameraPosition();
      return;
    }

    // Smooth ease in-out
    const t = this._easeInOut(this._transitionProgress);
    const angle = this._startAngle + (this._endAngle - this._startAngle) * t;
    this._setCameraFromAngle(angle);
  }

  private _easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  private _applyCameraPosition(): void {
    const angle = getViewpointAngle(this._viewpoint);
    this._setCameraFromAngle(angle);
  }

  private _setCameraFromAngle(angle: number): void {
    const x = this.center.x + Math.sin(angle) * CAMERA_DISTANCE;
    const z = this.center.z + Math.cos(angle) * CAMERA_DISTANCE;

    this.camera.position.set(x, this.center.y, z);
    this.camera.lookAt(this.center);
    this.camera.updateProjectionMatrix();
  }
}
