import * as THREE from "three";
import { BaseDrawableComponent } from "../core/Component";
import { ServiceContainer } from "../core/ServiceContainer";
import { Camera } from "../engine/Camera";
import { InputManager } from "../engine/InputManager";
import { PhysicsManager } from "../engine/PhysicsManager";
import { CollisionManager } from "../engine/CollisionManager";
import { LevelManager } from "../engine/LevelManager";
import { HorizontalDirection } from "../engine/CollisionEnums";
import { ActionType } from "../structure/ActionType";
import {
  IComplexPhysicsEntity,
  createComplexPhysicsState,
} from "../structure/PhysicsEntity";

import { PlayerAction } from "./actions/PlayerAction";
import { PlayerContext, createPlayerContext } from "./actions/PlayerContext";
import { Idle } from "./actions/Idle";
import { WalkRun } from "./actions/WalkRun";
import { Jump } from "./actions/Jump";
import { Fall } from "./actions/Fall";
import { Land } from "./actions/Land";
import { Teeter } from "./actions/Teeter";
import { Slide } from "./actions/Slide";
import { ClimbLadder } from "./actions/ClimbLadder";

/**
 * PlayerManager — dispatches to a list of PlayerAction instances.
 *
 * Mirrors FEZ/Services/PlayerManager.cs + the component architecture
 * where each PlayerAction subclass is registered and the active one
 * is selected each frame via isActionAllowed().
 *
 * Per-frame flow (matches FEZ PlayerAction.Update):
 *   for each action:  action.testConditions(ctx)  — may set entity.action
 *   for each action:  if isActionAllowed(entity.action):
 *                        on first frame of action: action.begin(ctx)
 *                        action.act(ctx, dt)
 *   run physics (collision + friction + integration)
 */
const PLAYER_SIZE = new THREE.Vector3(0.625, 0.9375, 1.0);

export class PlayerManager extends BaseDrawableComponent {
  physics!: IComplexPhysicsEntity;
  ctx!: PlayerContext;

  private mesh!: THREE.Mesh;
  private camera!: Camera;
  private input!: InputManager;
  private physicsManager!: PhysicsManager;
  private actions: PlayerAction[] = [];
  /** Per-action last-frame active state (for begin/end lifecycle). */
  private wasActive = new Map<PlayerAction, boolean>();

  private spawnPoint = new THREE.Vector3();
  private readonly KILL_FLOOR_Y = -20;

  constructor(services: ServiceContainer) {
    super(services, 10, 10);
  }

  initialize(
    camera: Camera,
    input: InputManager,
    physicsManager: PhysicsManager,
    collisionManager: CollisionManager,
    levelManager: LevelManager,
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

    this.ctx = createPlayerContext(
      this.physics,
      input,
      physicsManager,
      collisionManager,
      levelManager,
      camera,
    );

    // Order matters: actions with transitions that should fire first
    // come first (Jump before Fall so coyote-time jumps beat fall
    // transitions).
    // Order: tests that should win transitions go first. Climbing
    // takes priority (suppresses normal walk/jump). Fall runs during
    // Jumping too, so its act() always applies gravity when airborne.
    this.actions = [
      new ClimbLadder(),
      new Land(),
      new Jump(),
      new Fall(),
      new Slide(),
      new Teeter(),
      new WalkRun(),
      new Idle(),
    ];

    // Re-evaluate background layer when a viewpoint rotation completes.
    // FEZ calls DetermineInBackground at the end of a viewpoint
    // transition so that any trile newly in front of the player (or
    // newly behind) reclassifies their layer.
    camera.onRotationComplete(() => {
      this.physicsManager.determineInBackground(this.physics);
    });

    const geo = new THREE.BoxGeometry(
      PLAYER_SIZE.x,
      PLAYER_SIZE.y,
      PLAYER_SIZE.z,
    );
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    this.mesh = new THREE.Mesh(geo, mat);
    this.services.get<THREE.Scene>("scene").add(this.mesh);

    // Resolve the initial background-layer state so the first frame
    // reflects reality rather than the default `false` from
    // createComplexPhysicsState. Without this, the mechanic only
    // activates on the first ground-movement tick or rotation.
    this.physicsManager.viewpoint = camera.viewpoint;
    this.physicsManager.determineInBackground(this.physics);
  }

  get position(): THREE.Vector3 {
    return this.physics.center
      .clone()
      .sub(new THREE.Vector3(0, PLAYER_SIZE.y / 2, 0));
  }

  update(dt: number): void {
    if (this.camera.isTransitioning) {
      this._updateMesh();
      return;
    }

    this.physicsManager.viewpoint = this.camera.viewpoint;

    // Track airborne time for coyote-time jump grace.
    if (this.physics.grounded) {
      this.ctx.sinceNotGrounded = 0;
    } else {
      this.ctx.sinceNotGrounded += dt;
    }

    // 1. Test conditions across all actions (transitions fire here).
    for (const a of this.actions) a.testConditions(this.ctx);

    // Mirror ctx.action onto the entity so PhysicsManager can branch
    // on it (e.g., SlidingFriction selection).
    this.physics.action = this.ctx.action;

    // 2. Run EVERY action whose isActionAllowed is true — matches FEZ's
    //    PlayerAction.Update pattern where each action self-guards and
    //    multiple actions can run in parallel (e.g., Fall applies gravity
    //    during Jumping). Fire begin() / end() on activation transitions.
    for (const a of this.actions) {
      const isActive = a.isActionAllowed(this.ctx.action);
      const wasActive = this.wasActive.get(a) ?? false;
      if (isActive && !wasActive) a.begin(this.ctx);
      if (!isActive && wasActive) a.end(this.ctx);
      if (isActive) a.act(this.ctx, dt);
      this.wasActive.set(a, isActive);
    }

    // Re-mirror in case act() changed ctx.action mid-frame.
    this.physics.action = this.ctx.action;

    // 3. Physics pass: collision, friction, integration.
    this.physicsManager.updateComplex(this.physics);

    // Kill floor
    if (this.physics.center.y < this.KILL_FLOOR_Y) {
      this.respawn();
      return;
    }

    // Track lastAction for FEZ-style transitions.
    if (this.ctx.lastAction !== this.ctx.action) {
      this.ctx.lastAction = this.ctx.action;
    }

    this._updateMesh();
  }

  respawn(): void {
    this.physics.center
      .copy(this.spawnPoint)
      .add(new THREE.Vector3(0, PLAYER_SIZE.y / 2, 0));
    this.physics.velocity.set(0, 0, 0);
    this.physics.groundMovement.set(0, 0, 0);
    this.physics.ground = { nearLow: null, farHigh: null };
    this.physics.background = false;
    this.ctx.action = ActionType.Idle;
    this.ctx.lastAction = ActionType.None;
    this.ctx.runTime = 0;
    this.ctx.sinceJumped = Infinity;
    this.ctx.sinceNotGrounded = 0;
    this._updateMesh();
  }

  get action(): ActionType {
    return this.ctx?.action ?? ActionType.Idle;
  }

  get facingRight(): boolean {
    return this.ctx?.lookingDirection === HorizontalDirection.Right;
  }

  private _updateMesh(): void {
    this.mesh.position.copy(this.physics.center);
    // Background-layer debug tint — bright magenta with a strong
    // emissive glow so it's obvious even in shadow. Reverts to plain
    // white with no emissive when foreground.
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    if (mat) {
      if (this.physics.background) {
        mat.color.setHex(0xff00ff);
        mat.emissive.setHex(0x880088);
        mat.emissiveIntensity = 1.0;
      } else {
        mat.color.setHex(0xffffff);
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }
    // Face mesh toward camera
    const angle = Math.atan2(
      this.camera.camera.position.x - this.mesh.position.x,
      this.camera.camera.position.z - this.mesh.position.z,
    );
    this.mesh.rotation.y = angle;
    this.mesh.scale.x = this.facingRight ? 1 : -1;
  }

  draw(): void {
    // Mesh is in the scene; Three.js handles rendering.
  }
}
