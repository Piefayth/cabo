import * as THREE from "three";
import {
  CollisionType,
  VerticalDirection,
  QueryOptions,
  directionFromMovement,
} from "./CollisionEnums";
import { Viewpoint } from "./Viewpoint";
import {
  rightVector,
  forwardVector,
  depthMask,
  visibleAxis,
  axisMask,
  vec3Mul,
  vec3Abs,
  almostClampVec3,
  EPSILON,
  visibleOrientation,
} from "./FezMath";
import { CollisionManager } from "./CollisionManager";
import { LevelManager } from "./LevelManager";
import {
  IComplexPhysicsEntity,
  IPhysicsEntity,
} from "../structure/PhysicsEntity";
import {
  CollisionResult,
  MultipleHits,
  anyCollided,
  multipleHitsFirst,
  emptyCollisionHits,
  emptyInstanceHits,
} from "../structure/CollisionStructures";
import {
  TrileInstance,
  getTrileCenter,
  getTransformedSize,
  getRotatedFace,
} from "../structure/Trile";

/**
 * PhysicsManager — the FEZ physics update loop.
 * FEZ/Services/PhysicsManager.cs
 *
 * Handles gravity, friction, ground/wall/ceiling collision resolution,
 * wall hugging (depth-axis pushing), ground clamping, and background transitions.
 */

// FEZ physics constants from PhysicsManager.cs
// All friction vectors have Y=1 (no Y damping) — Y is handled by terminal velocity clamping only
const GROUND_FRICTION = new THREE.Vector3(0.85, 1, 0.85);
const AIR_FRICTION = new THREE.Vector3(0.9975, 1, 0.9975);
const WATER_FRICTION = new THREE.Vector3(0.925, 1, 0.925);
const SLIDING_FRICTION = new THREE.Vector3(0.8, 1, 0.8);
const FALLING_SPEED_LIMIT = 0.4; // Terminal velocity for complex entities
const SIMPLE_SPEED_LIMIT = 0.38;

export class PhysicsManager {
  private collisionManager: CollisionManager;
  private levelManager: LevelManager;

  /** Current camera viewpoint (set each frame by the game) */
  viewpoint: Viewpoint = Viewpoint.Front;

  /** Gravity factor: positive = normal, negative = inverted */
  get gravityFactor(): number {
    return this.collisionManager.gravityFactor;
  }
  set gravityFactor(v: number) {
    this.collisionManager.gravityFactor = v;
  }

  constructor(
    collisionManager: CollisionManager,
    levelManager: LevelManager,
  ) {
    this.collisionManager = collisionManager;
    this.levelManager = levelManager;
  }

  /**
   * Update a complex physics entity (player).
   * FEZ/Services/PhysicsManager.cs — Update(IComplexPhysicsEntity)
   */
  updateComplex(entity: IComplexPhysicsEntity): boolean {
    const wasGrounded = entity.grounded;

    // 1. Move along with ground (moving platforms)
    this.moveAlongWithGround(entity);

    // 2. Compute impulse (velocity + ground movement)
    const impulse = entity.velocity
      .clone()
      .add(entity.groundMovement);

    // 3. Run collision
    const { horizontal, vertical } = this.collisionManager.collideRectangle(
      entity.center,
      impulse,
      entity.size,
      entity.background ? QueryOptions.Background : QueryOptions.None,
      entity.elasticity,
      this.viewpoint,
      entity.movingDirection,
    );

    // 4. Ground detection (downward collision)
    entity.ground = emptyInstanceHits();
    const isDownward =
      this.gravityFactor > 0 ? impulse.y <= 0 : impulse.y >= 0;

    if (isDownward && anyCollided(vertical)) {
      if (vertical.nearLow.destination) {
        entity.ground.nearLow = vertical.nearLow.destination;
      }
      if (vertical.farHigh.destination) {
        entity.ground.farHigh = vertical.farHigh.destination;
      }
    }

    // 5. Ceiling detection (upward collision)
    entity.ceiling = emptyCollisionHits();
    const isUpward = !isDownward;
    if (isUpward && anyCollided(vertical)) {
      entity.ceiling = vertical;
    }

    // 6. Track grounded state transitions
    if (!wasGrounded && entity.grounded) {
      entity.groundedVelocity = entity.velocity.clone();
    } else if (!entity.grounded) {
      entity.groundedVelocity = null;
    }

    // 7. Determine moving direction
    const rv = rightVector(this.viewpoint);
    const horizontalVel = entity.velocity.dot(rv);
    entity.movingDirection = directionFromMovement(horizontalVel);

    // 8. Determine ground clamping (from vertical collision)
    let clampToGround: THREE.Vector3 | null = null;
    if (anyCollided(vertical)) {
      const first = multipleHitsFirst(vertical);
      if (first.shouldBeClamped || entity.mustBeClampedToGround) {
        clampToGround = first.nearestDistance;
      }
    }

    // 9. Update velocity, position, friction.
    // Note: updateInternal calls determineOverlaps at its end, so no need to
    // call it again here.
    const moved = this.updateInternal(
      entity,
      horizontal,
      vertical,
      clampToGround,
      wasGrounded,
      true, // hugWalls
      false, // velocityIrrelevant
      false, // simple
    );

    return moved;
  }

  /**
   * UpdateInternal — velocity integration and friction.
   * FEZ/Services/PhysicsManager.cs — UpdateInternal()
   */
  private updateInternal(
    entity: IPhysicsEntity,
    horizontal: MultipleHits<CollisionResult>,
    vertical: MultipleHits<CollisionResult>,
    clampToGround: THREE.Vector3 | null,
    wasGrounded: boolean,
    hugWalls: boolean,
    velocityIrrelevant: boolean,
    simple: boolean,
  ): boolean {
    // Record wall collisions
    if (!simple) {
      entity.wallCollision = horizontal;
    }

    // Apply collision responses to velocity
    if (horizontal.nearLow.collided) {
      entity.velocity.add(horizontal.nearLow.response);
    } else if (horizontal.farHigh.collided) {
      entity.velocity.add(horizontal.farHigh.response);
    }

    if (vertical.nearLow.collided) {
      entity.velocity.add(vertical.nearLow.response);
    } else if (vertical.farHigh.collided) {
      entity.velocity.add(vertical.farHigh.response);
    }

    // Select friction
    let friction: THREE.Vector3;
    const isComplex = "climbing" in entity;
    const complex = entity as IComplexPhysicsEntity;

    if (isComplex && complex.swimming) {
      friction = WATER_FRICTION.clone();
    } else if (entity.grounded) {
      // FEZ uses ground friction for normal walking. SLIDING_FRICTION is
      // reserved for the explicit sliding action (ice surfaces, etc.) — not
      // applied merely because XZ velocity is nonzero.
      friction = GROUND_FRICTION.clone();
    } else {
      friction = AIR_FRICTION.clone();
    }

    // Friction amount interpolation based on gravity factor
    const amount = (1.2 + Math.abs(this.gravityFactor) * 0.8) / 2.0;
    const lerpedFriction = new THREE.Vector3(
      1 + (friction.x - 1) * amount,
      1 + (friction.y - 1) * amount,
      1 + (friction.z - 1) * amount,
    );

    // Apply friction
    entity.velocity = almostClampVec3(
      vec3Mul(entity.velocity, lerpedFriction),
      1e-6,
    );

    // Terminal velocity clamping
    if (!entity.noVelocityClamping) {
      const limit = simple ? SIMPLE_SPEED_LIMIT : FALLING_SPEED_LIMIT;
      entity.velocity.y = Math.max(
        -limit,
        Math.min(limit, entity.velocity.y),
      );
    }

    // Position update
    const totalVelocity = entity.velocity
      .clone()
      .add(entity.groundMovement);

    if (totalVelocity.lengthSq() > 1e-12 || !velocityIrrelevant) {
      entity.center.add(totalVelocity);
    }

    // Post-update: ground clamping
    if (clampToGround) {
      this.clampToGround(entity, clampToGround);
    }

    // Wall hugging (depth-axis pushing)
    if (hugWalls && !simple) {
      this.hugWalls(entity, false, true);
    }

    // Redefine corners
    this.determineOverlaps(entity);

    return totalVelocity.lengthSq() > 1e-12;
  }

  /**
   * MoveAlongWithGround — inherit velocity from moving platforms.
   * FEZ/Services/PhysicsManager.cs — MoveAlongWithGround()
   */
  private moveAlongWithGround(entity: IPhysicsEntity): void {
    const groundTrile = entity.ground.nearLow ?? entity.ground.farHigh;
    if (!groundTrile?.physicsState) {
      // Lost ground — transfer ground movement to velocity
      if (entity.groundMovement.lengthSq() > 1e-12) {
        const transfer = entity.groundMovement.clone().multiplyScalar(0.85);
        entity.velocity.add(transfer);
        entity.groundMovement.set(0, 0, 0);
      }
      return;
    }

    const ps = groundTrile.physicsState;
    entity.groundMovement.copy(ps.velocity);

    // Sticky platforms also inherit Y movement
    if (ps.sticky) {
      entity.groundMovement.y += ps.groundMovement.y;
    }
  }

  /**
   * ClampToGround — snap entity to the depth-axis position of its ground trile.
   *
   * This ensures the entity sits precisely on the correct depth plane,
   * preventing Z-fighting and ensuring proper 2D alignment.
   *
   * FEZ/Services/PhysicsManager.cs — ClampToGround()
   */
  private clampToGround(
    entity: IPhysicsEntity,
    distance: THREE.Vector3,
  ): void {
    const vAxis = visibleAxis(this.viewpoint);
    const mask = axisMask(vAxis);
    const inverseMask = new THREE.Vector3(1, 1, 1).sub(mask);

    // Snap depth-axis to ground trile's center depth
    entity.center = vec3Mul(distance, mask).add(
      vec3Mul(entity.center, inverseMask),
    );
  }

  /**
   * HugWalls — depth-axis pushing to prevent clipping into triles.
   *
   * Separate from collision: collision handles movement blocking,
   * wall hugging handles depth-axis penetration prevention.
   *
   * The camera-facing face of a trile is computed as:
   *   trileCenter + trileHalfSize * (-forward)
   * because -forward points FROM the scene TOWARD the camera.
   *
   * The entity edge that could penetrate is:
   *   entity.center + entityHalfDepth * forward
   * which is the edge pointing INTO the scene (away from camera).
   *
   * If the entity edge has gone past the trile's camera-facing face
   * (into the trile), we push it back out.
   *
   * FEZ/Services/PhysicsManager.cs — HugWalls()
   */
  private hugWalls(
    entity: IPhysicsEntity,
    determineBackground: boolean,
    keepInFront: boolean,
  ): boolean {
    let hugged = false;

    const fwd = forwardVector(this.viewpoint);
    const negFwd = fwd.clone().negate(); // points toward camera
    const absFwd = vec3Abs(fwd);
    const dMask = depthMask(this.viewpoint);
    const entityHalfDepth = vec3Mul(entity.size, dMask).multiplyScalar(0.5);

    for (const corner of entity.cornerCollision) {
      for (const instance of [
        corner.instances.surface,
        corner.instances.deep,
      ]) {
        if (!instance || !instance.enabled) continue;
        if (!this.isHuggable(instance, entity)) continue;

        const def = this.levelManager.trileSet.get(instance.trileId);
        if (!def) continue;

        const trileCenter = getTrileCenter(instance, def);
        const trileHalfSize = getTransformedSize(instance, def)
          .multiplyScalar(0.5);

        // Camera-facing face of the trile: center offset toward camera
        // This is the face the player should be pushed in front of.
        const trileFacePoint = trileCenter
          .clone()
          .add(vec3Mul(trileHalfSize, negFwd));

        // Entity's scene-facing edge: the edge pointing away from camera
        const entityEdge = entity.center
          .clone()
          .add(vec3Mul(entityHalfDepth, fwd));

        // Vector from the trile face to the entity edge, along depth axis
        const diff = entityEdge.clone().sub(trileFacePoint);
        // Project along forward: positive = entity is in front (no penetration)
        //                        negative = entity has crossed through the face
        const depthDot = diff.dot(negFwd);

        if (depthDot < 0) {
          // Entity edge is past the trile's camera face (penetrating)

          if (determineBackground) {
            const totalSize =
              vec3Mul(trileHalfSize, absFwd).length() +
              entityHalfDepth.length();
            if (Math.abs(depthDot) > totalSize) {
              entity.background = true;
              return true;
            }
          }

          if (keepInFront) {
            // Push entity toward camera so its edge is flush with the face
            const pushback = vec3Mul(diff, absFwd).negate();
            entity.center.add(pushback);
            hugged = true;
          }
        }
      }
    }

    return hugged;
  }

  /**
   * IsHuggable — determines if a trile should block depth movement.
   *
   * Returns true for triles that are solid geometry but don't have
   * AllSides collision on the visible face (those are handled by main collision).
   * Thin triles, immaterial triles, and carried objects are not huggable.
   *
   * FEZ/Services/PhysicsManager.cs — IsHuggable()
   */
  private isHuggable(
    instance: TrileInstance,
    entity: IPhysicsEntity,
  ): boolean {
    if (!instance.enabled) return false;

    const def = this.levelManager.trileSet.get(instance.trileId);
    if (!def) return false;
    if (def.immaterial) return false;
    if (def.thin) return false;

    // Don't self-hug (for physics triles)
    if (
      instance.physicsState &&
      entity === (instance.physicsState as unknown as IPhysicsEntity)
    ) {
      return false;
    }

    // Check the visible face — AllSides triles are handled by main collision, not hugging
    const face = visibleOrientation(this.viewpoint);
    const ct = getRotatedFace(
      face,
      instance,
      def,
      this.levelManager.triles,
      this.levelManager.trileSet,
    );

    // Huggable if face is NOT one of: Immaterial, TopNoStraightLedge, AllSides
    return (
      ct !== CollisionType.Immaterial &&
      ct !== CollisionType.TopNoStraightLedge &&
      ct !== CollisionType.AllSides
    );
  }

  /**
   * DetermineOverlaps — recompute corner collision queries.
   * Probes 4 corners of the entity's AABB to find Surface/Deep triles.
   *
   * FEZ/Services/PhysicsManager.cs — DetermineOverlaps()
   */
  determineOverlaps(entity: IPhysicsEntity): void {
    const rv = rightVector(this.viewpoint);
    const halfSize = entity.size.clone().multiplyScalar(0.5);
    const eps = new THREE.Vector3(EPSILON, EPSILON, EPSILON);
    const shrunk = halfSize.clone().sub(eps);

    const options = entity.background
      ? QueryOptions.Background
      : QueryOptions.None;

    // 4 corners: (±right, ±up) combinations
    const up = new THREE.Vector3(0, 1, 0);
    const corners = [
      entity.center.clone().add(vec3Mul(rv.clone().negate().sub(up), shrunk)), // bottom-left
      entity.center.clone().add(vec3Mul(rv.clone().add(up.clone().negate()), shrunk)), // bottom-right
      entity.center.clone().add(vec3Mul(rv.clone().negate().add(up), shrunk)), // top-left
      entity.center.clone().add(vec3Mul(rv.clone().add(up), shrunk)), // top-right
    ];

    for (let i = 0; i < 4; i++) {
      const nearest = this.levelManager.nearestTrile(
        corners[i],
        options,
        this.viewpoint,
      );
      entity.cornerCollision[i] = {
        point: corners[i],
        instances: nearest,
      };
    }

    // For complex entities, also check axis collision (Up/Down)
    if ("axisCollision" in entity) {
      const complex = entity as IComplexPhysicsEntity;
      // Up edge
      const topCenter = entity.center.clone().add(
        new THREE.Vector3(0, halfSize.y - EPSILON, 0),
      );
      complex.axisCollision.set(
        VerticalDirection.Up,
        this.levelManager.nearestTrile(topCenter, options, this.viewpoint),
      );
      // Down edge
      const bottomCenter = entity.center.clone().add(
        new THREE.Vector3(0, -(halfSize.y - EPSILON), 0),
      );
      complex.axisCollision.set(
        VerticalDirection.Down,
        this.levelManager.nearestTrile(bottomCenter, options, this.viewpoint),
      );
    }
  }

  /**
   * DetermineInBackground — check if entity should transition to background layer.
   *
   * FEZ/Services/PhysicsManager.cs — DetermineInBackground()
   */
  determineInBackground(entity: IComplexPhysicsEntity): void {
    entity.background = false;

    // Determine overlaps and hug walls with background detection
    this.determineOverlaps(entity);
    const isBehind = this.hugWalls(entity, true, false);

    if (isBehind) {
      entity.background = true;
      // Re-determine with background flag
      this.determineOverlaps(entity);
      this.hugWalls(entity, false, true);
    }
  }
}
