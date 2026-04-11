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
  vec3Mul,
  almostEqual,
} from "../engine/FezMath";
import {
  IComplexPhysicsEntity,
  createComplexPhysicsState,
} from "../structure/PhysicsEntity";

export enum ActionType {
  Idle,
  Walking,
  Jumping,
  Falling,
  Landing,
}

/**
 * FEZ applies gravity as a per-frame velocity delta inside the game components,
 * not the physics manager. The physics manager handles friction and collision.
 * These are per-frame values at 60fps.
 */
const GRAVITY_PER_FRAME = 0.0075 / 1.0; // ~0.0075 per frame in FEZ
const JUMP_VELOCITY = 0.1575; // FEZ jump initial velocity
const MOVE_SPEED = 0.0875; // FEZ horizontal acceleration per frame

/** Player size matching Gomez's bounding box */
const PLAYER_SIZE = new THREE.Vector3(0.8, 1.5, 0.8);

export class PlayerManager extends BaseDrawableComponent {
  /** The physics entity state — matches IComplexPhysicsEntity exactly */
  physics!: IComplexPhysicsEntity;

  action = ActionType.Idle;
  facingRight = true;

  private mesh!: THREE.Mesh;
  private camera!: Camera;
  private input!: InputManager;
  private physicsManager!: PhysicsManager;

  constructor(services: ServiceContainer) {
    super(services, 10, 10);
  }

  private spawnPoint = new THREE.Vector3();
  private readonly KILL_FLOOR_Y = -20;

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

    // Initialize physics state (center is at the middle of the player)
    this.physics = createComplexPhysicsState(
      startPosition.clone().add(new THREE.Vector3(0, PLAYER_SIZE.y / 2, 0)),
      PLAYER_SIZE,
    );

    // Simple player mesh — Gomez-like proportions
    const geo = new THREE.BoxGeometry(
      PLAYER_SIZE.x,
      PLAYER_SIZE.y,
      PLAYER_SIZE.x,
    );
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    this.mesh = new THREE.Mesh(geo, mat);
    this.services.get<THREE.Scene>("scene").add(this.mesh);
  }

  /** Convenience: feet position (bottom of bounding box) */
  get position(): THREE.Vector3 {
    return this.physics.center
      .clone()
      .sub(new THREE.Vector3(0, PLAYER_SIZE.y / 2, 0));
  }

  update(dt: number): void {
    if (this.camera.isTransitioning) {
      this._updateMesh();
      return; // Freeze during viewpoint rotation (like FEZ)
    }

    const viewpoint = this.camera.viewpoint;
    this.physicsManager.viewpoint = viewpoint;

    // --- Horizontal movement ---
    const mx = this.input.state.movement.x;
    const rv = rightVector(viewpoint);

    // FEZ-style: direct velocity setting along screen-right
    const targetVel = rv.clone().multiplyScalar(mx * MOVE_SPEED);

    // Apply to velocity (keeping vertical component)
    const currentHoriz = rv.clone().multiplyScalar(this.physics.velocity.dot(rv));
    const verticalVel = this.physics.velocity.clone().sub(currentHoriz);

    if (Math.abs(mx) > 0.1) {
      // Blend toward target
      const blend = this.physics.grounded ? 0.4 : 0.15;
      const newHoriz = currentHoriz.lerp(targetVel, blend);
      this.physics.velocity.copy(verticalVel.add(newHoriz));
    }

    // Facing direction
    if (mx > 0.1) this.facingRight = true;
    else if (mx < -0.1) this.facingRight = false;

    // Moving direction for collision edge testing
    this.physics.movingDirection = directionFromMovement(mx);

    // --- Jump ---
    if (this.input.state.jump.pressed && this.physics.grounded) {
      this.physics.velocity.y = JUMP_VELOCITY;
    }

    // --- Gravity ---
    this.physics.velocity.y -= GRAVITY_PER_FRAME * this.physicsManager.gravityFactor;

    // --- Physics update (collision, friction, position) ---
    this.physicsManager.updateComplex(this.physics);

    // --- Kill floor ---
    if (this.physics.center.y < this.KILL_FLOOR_Y) {
      this.respawn();
      return;
    }

    // --- Action state ---
    this._updateAction();

    // --- Update mesh ---
    this._updateMesh();
  }

  private _updateAction(): void {
    if (this.physics.grounded) {
      const speed =
        Math.abs(this.physics.velocity.x) +
        Math.abs(this.physics.velocity.z);
      this.action = speed > 0.001 ? ActionType.Walking : ActionType.Idle;
    } else {
      this.action =
        this.physics.velocity.y > 0 ? ActionType.Jumping : ActionType.Falling;
    }
  }

  respawn(): void {
    this.physics.center.copy(this.spawnPoint).add(new THREE.Vector3(0, PLAYER_SIZE.y / 2, 0));
    this.physics.velocity.set(0, 0, 0);
    this.physics.groundMovement.set(0, 0, 0);
    this.physics.ground = { nearLow: null, farHigh: null };
    this.physics.background = false;
    this.action = ActionType.Falling;
    this._updateMesh();
  }

  private _updateMesh(): void {
    this.mesh.position.copy(this.physics.center);

    // Face the player mesh toward camera
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
