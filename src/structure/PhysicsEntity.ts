import * as THREE from "three";
import {
  HorizontalDirection,
  VerticalDirection,
} from "../engine/CollisionEnums";
import {
  CollisionResult,
  MultipleHits,
  NearestTriles,
  PointCollision,
  emptyCollisionHits,
  emptyInstanceHits,
  emptyNearestTriles,
} from "./CollisionStructures";
import { TrileInstance } from "./Trile";
import { ActionType } from "./ActionType";

/**
 * IPhysicsEntity — base interface for all physics objects.
 * FezEngine/Structure/IPhysicsEntity.cs
 */
export interface IPhysicsEntity {
  ground: MultipleHits<TrileInstance | null>;
  velocity: THREE.Vector3;
  groundMovement: THREE.Vector3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  cornerCollision: PointCollision[];
  wallCollision: MultipleHits<CollisionResult>;
  background: boolean;
  elasticity: number;
  noVelocityClamping: boolean;

  // Computed
  readonly grounded: boolean;
  readonly sliding: boolean;
}

/**
 * IComplexPhysicsEntity — extended interface for player (Gomez).
 * FEZ/Structure/IComplexPhysicsEntity.cs
 */
export interface IComplexPhysicsEntity extends IPhysicsEntity {
  mustBeClampedToGround: boolean;
  groundedVelocity: THREE.Vector3 | null;
  movingDirection: HorizontalDirection;
  climbing: boolean;
  swimming: boolean;
  axisCollision: Map<VerticalDirection, NearestTriles>;
  ceiling: MultipleHits<CollisionResult>;
  handlesZClamping: boolean;
  /** Current high-level action — used by PhysicsManager to pick the
   *  friction vector (Sliding uses SlidingFriction). Maintained by
   *  PlayerManager each frame from PlayerContext.action. */
  action: ActionType;
  /** FEZ PlayerManager.HeldInstance — ladder/vine/ledge we're holding. */
  heldInstance: TrileInstance | null;
}

/**
 * Create default state for a complex physics entity.
 */
export function createComplexPhysicsState(
  center: THREE.Vector3,
  size: THREE.Vector3,
): IComplexPhysicsEntity {
  const axisCollision = new Map<VerticalDirection, NearestTriles>();
  axisCollision.set(VerticalDirection.Up, emptyNearestTriles());
  axisCollision.set(VerticalDirection.Down, emptyNearestTriles());

  return {
    ground: emptyInstanceHits(),
    velocity: new THREE.Vector3(),
    groundMovement: new THREE.Vector3(),
    center: center.clone(),
    size: size.clone(),
    cornerCollision: [
      { point: new THREE.Vector3(), instances: emptyNearestTriles() },
      { point: new THREE.Vector3(), instances: emptyNearestTriles() },
      { point: new THREE.Vector3(), instances: emptyNearestTriles() },
      { point: new THREE.Vector3(), instances: emptyNearestTriles() },
    ],
    wallCollision: emptyCollisionHits(),
    background: false,
    elasticity: 0,
    noVelocityClamping: false,

    get grounded(): boolean {
      return this.ground.nearLow !== null || this.ground.farHigh !== null;
    },
    get sliding(): boolean {
      const v = this.velocity;
      return (
        Math.abs(v.x) > 1e-6 || Math.abs(v.z) > 1e-6
      );
    },

    mustBeClampedToGround: false,
    groundedVelocity: null,
    movingDirection: HorizontalDirection.None,
    climbing: false,
    swimming: false,
    axisCollision,
    ceiling: emptyCollisionHits(),
    handlesZClamping: false,
    action: ActionType.Idle,
    heldInstance: null,
  };
}
