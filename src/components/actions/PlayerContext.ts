import { Camera } from "../../engine/Camera";
import { CollisionManager } from "../../engine/CollisionManager";
import { InputManager } from "../../engine/InputManager";
import { LevelManager } from "../../engine/LevelManager";
import { PhysicsManager } from "../../engine/PhysicsManager";
import { ActionType } from "../../structure/ActionType";
import { IComplexPhysicsEntity } from "../../structure/PhysicsEntity";
import { HorizontalDirection } from "../../engine/CollisionEnums";

/**
 * PlayerContext — bundles the services an action needs.
 *
 * Mirrors how FEZ's PlayerAction resolves dependencies via
 * ServiceHelper.InjectServices. Rather than a DI framework we pass
 * a single context object into every action call.
 *
 * The context also tracks per-player state that FEZ keeps on the
 * PlayerManager but which is shared across actions:
 *   - action / lastAction
 *   - lookingDirection
 *   - jumpState (for Jump sustain)
 *   - runTime (for WalkRun)
 *   - sinceJumped
 */
export interface PlayerContext {
  // Services
  readonly entity: IComplexPhysicsEntity;
  readonly input: InputManager;
  readonly physicsManager: PhysicsManager;
  readonly collisionManager: CollisionManager;
  readonly levelManager: LevelManager;
  readonly camera: Camera;

  // Persistent player state shared between actions
  action: ActionType;
  lastAction: ActionType;
  lookingDirection: HorizontalDirection;

  /** Seconds of sustained input > RunInputThreshold (FEZ MovementHelper.RunTime) */
  runTime: number;

  /** Seconds since jump began. Used for sustain window (FEZ Jump). */
  sinceJumped: number;

  /** Seconds airborne — used for DoubleJumpTime coyote-time grace */
  sinceNotGrounded: number;

  /** Whether the jump button has been released since the last jump (so sustain ends) */
  jumpReleased: boolean;

  /** Tracks whether the player is in the hold-jump phase */
  jumpHeld: boolean;

  /** Signals that the current frame should transition into Jump */
  wantsJump: boolean;
}

export function createPlayerContext(
  entity: IComplexPhysicsEntity,
  input: InputManager,
  physicsManager: PhysicsManager,
  collisionManager: CollisionManager,
  levelManager: LevelManager,
  camera: Camera,
): PlayerContext {
  return {
    entity,
    input,
    physicsManager,
    collisionManager,
    levelManager,
    camera,
    action: ActionType.Idle,
    lastAction: ActionType.None,
    lookingDirection: HorizontalDirection.Right,
    runTime: 0,
    sinceJumped: Infinity,
    sinceNotGrounded: 0,
    jumpReleased: true,
    jumpHeld: false,
    wantsJump: false,
  };
}
