import * as THREE from "three";
import { BaseDrawableComponent } from "../core/Component";
import { ServiceContainer } from "../core/ServiceContainer";
import { Camera } from "../engine/Camera";
import { InputManager } from "../engine/InputManager";
import { Viewpoint, getRightVector, getDepthAxis } from "../engine/Viewpoint";
import { Level } from "../structure/Level";
import { collidePlayer, projectToScreen, isSolidAt } from "../engine/Collision";

export enum ActionType {
  Idle,
  Walking,
  Jumping,
  Falling,
  Landing,
}

const MOVE_SPEED = 5;
const JUMP_VELOCITY = 10;
const GRAVITY = -28;
const MAX_FALL_SPEED = -20;
const FRICTION_GROUND = 12;
const FRICTION_AIR = 3;

export class PlayerManager extends BaseDrawableComponent {
  position = new THREE.Vector3();
  velocity = new THREE.Vector3(0, 0, 0);
  action = ActionType.Idle;
  facingRight = true;
  grounded = false;

  private mesh!: THREE.Mesh;
  private camera!: Camera;
  private input!: InputManager;
  private level!: Level;

  constructor(services: ServiceContainer) {
    super(services, 10, 10);
  }

  initialize(camera: Camera, input: InputManager, level: Level): void {
    this.camera = camera;
    this.input = input;
    this.level = level;

    // Simple player mesh — Gomez-like proportions (short & square)
    const geo = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    this.mesh = new THREE.Mesh(geo, mat);
    this.services.get<THREE.Scene>("scene").add(this.mesh);

    this.position.copy(level.playerStart);
  }

  update(dt: number): void {
    if (this.camera.isTransitioning) {
      this._updateMeshPosition();
      return; // Freeze player during rotation (like FEZ)
    }

    const viewpoint = this.camera.viewpoint;
    this._handleMovement(dt, viewpoint);
    this._applyGravity(dt);
    this._resolveCollisions(viewpoint);
    this._updateAction();
    this._updateMeshPosition();
  }

  private _handleMovement(dt: number, viewpoint: Viewpoint): void {
    const mx = this.input.state.movement.x;
    const right = getRightVector(viewpoint);

    // Horizontal movement along the screen-right axis
    const targetVelX = mx * MOVE_SPEED;
    const friction = this.grounded ? FRICTION_GROUND : FRICTION_AIR;

    // Get current screen-horizontal velocity
    const currentScreenVel =
      this.velocity.x * right[0] + this.velocity.z * right[2];
    const newScreenVel = this._approach(currentScreenVel, targetVelX, friction * dt);

    // Apply to world velocity along right vector
    this.velocity.x = newScreenVel * right[0];
    this.velocity.z = newScreenVel * right[2];

    // Track facing direction
    if (mx > 0.1) this.facingRight = true;
    else if (mx < -0.1) this.facingRight = false;

    // Jump
    if (this.input.state.jump.pressed && this.grounded) {
      this.velocity.y = JUMP_VELOCITY;
      this.grounded = false;
    }

    // Apply velocity to position
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
  }

  private _applyGravity(dt: number): void {
    this.velocity.y += GRAVITY * dt;
    if (this.velocity.y < MAX_FALL_SPEED) {
      this.velocity.y = MAX_FALL_SPEED;
    }
    this.position.y += this.velocity.y * dt;
  }

  private _resolveCollisions(viewpoint: Viewpoint): void {
    const collision = collidePlayer(this.level, this.position, viewpoint);
    const right = getRightVector(viewpoint);
    const { screenX } = projectToScreen(this.position, viewpoint);

    // Ground
    if (collision.grounded && this.velocity.y <= 0) {
      this.position.y = collision.groundY;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Ceiling
    if (collision.ceiling && this.velocity.y > 0) {
      this.velocity.y = 0;
    }

    // Walls: push player out
    const halfW = 0.4;
    if (collision.wallLeft) {
      const wallEdge = Math.floor(screenX - halfW) + 1;
      const newScreenX = wallEdge + halfW + 0.001;
      const offset = newScreenX - screenX;
      this.position.x += offset * right[0];
      this.position.z += offset * right[2];
      // Zero out velocity along right vector if moving into wall
      const velDot = this.velocity.x * right[0] + this.velocity.z * right[2];
      if (velDot < 0) {
        this.velocity.x -= velDot * right[0];
        this.velocity.z -= velDot * right[2];
      }
    }
    if (collision.wallRight) {
      const wallEdge = Math.floor(screenX + halfW);
      const newScreenX = wallEdge - halfW - 0.001;
      const offset = newScreenX - screenX;
      this.position.x += offset * right[0];
      this.position.z += offset * right[2];
      const velDot = this.velocity.x * right[0] + this.velocity.z * right[2];
      if (velDot > 0) {
        this.velocity.x -= velDot * right[0];
        this.velocity.z -= velDot * right[2];
      }
    }

    // Fall out of world — respawn
    if (this.position.y < -10) {
      this.position.copy(this.level.playerStart);
      this.velocity.set(0, 0, 0);
    }
  }

  private _updateAction(): void {
    if (this.grounded) {
      const speed = Math.abs(this.velocity.x) + Math.abs(this.velocity.z);
      this.action = speed > 0.5 ? ActionType.Walking : ActionType.Idle;
    } else {
      this.action =
        this.velocity.y > 0 ? ActionType.Jumping : ActionType.Falling;
    }
  }

  private _updateMeshPosition(): void {
    this.mesh.position.set(
      this.position.x,
      this.position.y + 0.6, // offset to center mesh on feet position
      this.position.z,
    );

    // Face the player mesh toward camera and flip based on facing direction
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

  private _approach(current: number, target: number, maxDelta: number): number {
    if (current < target) {
      return Math.min(current + maxDelta, target);
    }
    return Math.max(current - maxDelta, target);
  }
}
