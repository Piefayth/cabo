import * as THREE from "three";
import { BaseDrawableComponent } from "../core/Component";
import { ServiceContainer } from "../core/ServiceContainer";
import { Camera } from "../engine/Camera";
import { InputManager } from "../engine/InputManager";
import { PhysicsManager } from "../engine/PhysicsManager";
import { Viewpoint } from "../engine/Viewpoint";
import {
  HorizontalDirection,
  directionFromMovement,
} from "../engine/CollisionEnums";
import {
  rightVector,
} from "../engine/FezMath";
import {
  IComplexPhysicsEntity,
  createComplexPhysicsState,
} from "../structure/PhysicsEntity";

export enum ActionType {
  Idle,
  Walking,
  Running,
  Jumping,
  Falling,
  Landing,
}

/**
 * FEZ constants ported from the original source:
 *   - WalkAcceleration = 4.7   (WalkRun.cs static MovementHelper)
 *   - RunAcceleration  = 5.875
 *   - RunTimeThreshold = 0.2s
 *   - RunInputThreshold = 0.5
 *   - TrileSize = 0.15         (MovementHelper.cs / PhysicsManager.cs)
 *
 * Velocity impulse (per-tick, from MovementHelper.Update):
 *   velocity += rotate(input.x, 0, 0) * 0.15 * accel * dt
 *              * (0.5 + |gravityFactor|*1.5) / 2
 *
 * Friction (PhysicsManager.UpdateInternal, applied every tick):
 *   velocity *= lerp(One, frictionVector, (1.2 + |gf|*0.8) / 2)
 *   ground friction (X,Z) = 0.85
 *
 * Equilibrium walking speed: 0.15 * 4.7 / (1 - 0.85) = 4.7 units/sec
 */
const WALK_ACCELERATION = 4.7;
const RUN_ACCELERATION = 5.875;
const RUN_TIME_THRESHOLD = 0.2;
const RUN_INPUT_THRESHOLD = 0.5;
const TRILE_SIZE = 0.15;

/** Gomez's actual collision size from FEZ PlayerManager.BaseSize */
const PLAYER_SIZE = new THREE.Vector3(0.625, 0.9375, 1.0);

/**
 * Jump and gravity tuning. FEZ's decompiled values aren't in the
 * sources we reviewed, but these give a platformer feel with the
 * FEZ terminal velocity of 0.4 units/frame (Y clamp in PhysicsManager).
 */
const GRAVITY_PER_FRAME = 0.0135;
const JUMP_VELOCITY = 0.22;

export class PlayerManager extends BaseDrawableComponent {
  physics!: IComplexPhysicsEntity;

  action = ActionType.Idle;
  facingRight = true;
  lookingDirection = HorizontalDirection.Right;
  runTime = 0; // Seconds of sustained input above RUN_INPUT_THRESHOLD

  private mesh!: THREE.Mesh;
  private camera!: Camera;
  private input!: InputManager;
  private physicsManager!: PhysicsManager;

  private spawnPoint = new THREE.Vector3();
  private readonly KILL_FLOOR_Y = -20;

  constructor(services: ServiceContainer) {
    super(services, 10, 10);
  }

  initialize(
    camera: Camera,
    input: InputManager,
    physicsManager: PhysicsManager,
    startPosition: THREE.Vector3,
  ): void {
    this.camera = camera;
    this.input = input;
    this.physicsManager = physicsManager;
    this.spawnPoint.copy(startPosition);

    this.physics = createComplexPhysicsState(
      startPosition.clone().add(new THREE.Vector3(0, PLAYER_SIZE.y / 2, 0)),
      PLAYER_SIZE,
    );

    const geo = new THREE.BoxGeometry(
      PLAYER_SIZE.x,
      PLAYER_SIZE.y,
      PLAYER_SIZE.z,
    );
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    this.mesh = new THREE.Mesh(geo, mat);
    this.services.get<THREE.Scene>("scene").add(this.mesh);
  }

  get position(): THREE.Vector3 {
    return this.physics.center
      .clone()
      .sub(new THREE.Vector3(0, PLAYER_SIZE.y / 2, 0));
  }

  get running(): boolean {
    return this.runTime > RUN_TIME_THRESHOLD;
  }

  update(dt: number): void {
    if (this.camera.isTransitioning) {
      this._updateMesh();
      return;
    }

    const viewpoint = this.camera.viewpoint;
    this.physicsManager.viewpoint = viewpoint;

    const mx = this.input.state.movement.x;
    const rv = rightVector(viewpoint);

    // --- Running time accumulator (FEZ MovementHelper.Update) ---
    if (Math.abs(mx) > RUN_INPUT_THRESHOLD) {
      this.runTime += dt;
    } else {
      this.runTime = 0;
    }

    // --- Horizontal impulse (FEZ MovementHelper.Update) ---
    // velocity += input * 0.15 * accel * dt * (0.5 + |gf|*1.5)/2
    if (mx !== 0) {
      const accel = this.running ? RUN_ACCELERATION : WALK_ACCELERATION;
      const gf = Math.abs(this.physicsManager.gravityFactor);
      const gravityScale = (0.5 + gf * 1.5) / 2;
      const impulseMag = mx * TRILE_SIZE * accel * dt * gravityScale;
      this.physics.velocity.add(rv.clone().multiplyScalar(impulseMag));
    }

    // Facing direction
    if (mx > 0.01) {
      this.facingRight = true;
      this.lookingDirection = HorizontalDirection.Right;
    } else if (mx < -0.01) {
      this.facingRight = false;
      this.lookingDirection = HorizontalDirection.Left;
    }

    // Tell physics which direction we're moving for edge probe orientation
    this.physics.movingDirection = directionFromMovement(mx);

    // --- Jump ---
    if (this.input.state.jump.pressed && this.physics.grounded) {
      this.physics.velocity.y = JUMP_VELOCITY;
    }

    // --- Gravity (applied per-frame like FEZ) ---
    this.physics.velocity.y -= GRAVITY_PER_FRAME * this.physicsManager.gravityFactor;

    // --- Physics update: collision, friction, position ---
    this.physicsManager.updateComplex(this.physics);

    // --- Kill floor ---
    if (this.physics.center.y < this.KILL_FLOOR_Y) {
      this.respawn();
      return;
    }

    this._updateAction();
    this._updateMesh();
  }

  respawn(): void {
    this.physics.center.copy(this.spawnPoint).add(new THREE.Vector3(0, PLAYER_SIZE.y / 2, 0));
    this.physics.velocity.set(0, 0, 0);
    this.physics.groundMovement.set(0, 0, 0);
    this.physics.ground = { nearLow: null, farHigh: null };
    this.physics.background = false;
    this.runTime = 0;
    this.action = ActionType.Falling;
    this._updateMesh();
  }

  private _updateAction(): void {
    if (this.physics.grounded) {
      const rv = rightVector(this.camera.viewpoint);
      const horizSpeed = Math.abs(this.physics.velocity.dot(rv));
      if (horizSpeed > 0.005) {
        this.action = this.running ? ActionType.Running : ActionType.Walking;
      } else {
        this.action = ActionType.Idle;
      }
    } else {
      this.action =
        this.physics.velocity.y > 0 ? ActionType.Jumping : ActionType.Falling;
    }
  }

  private _updateMesh(): void {
    this.mesh.position.copy(this.physics.center);

    // Face the mesh toward the camera
    const angle = Math.atan2(
      this.camera.camera.position.x - this.mesh.position.x,
      this.camera.camera.position.z - this.mesh.position.z,
    );
    this.mesh.rotation.y = angle;
    this.mesh.scale.x = this.facingRight ? 1 : -1;
  }

  draw(): void {
    // Mesh is in the scene, Three.js handles rendering
  }
}
