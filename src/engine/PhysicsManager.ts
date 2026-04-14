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
  emptyCollisionResult,
  emptyInstanceHits,
} from "../structure/CollisionStructures";
import {
  TrileInstance,
  getTrileCenter,
  getTransformedSize,
  getRotatedFace,
} from "../structure/Trile";
import { ActionType } from "../structure/ActionType";

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

    // 8a. Full layer re-evaluation when the entity has inherited
    // motion from the ground or is climbing. This is the FEZ gate
    // (GroundMovement != Zero || Climbing). The method
    // unconditionally clears entity.background, loops hugWalls until
    // no more pushing, and re-sets entity.background if any iteration
    // detected deep penetration into a huggable trile.
    //
    // The "emerge in front when walking back" behaviour comes from
    // the LIGHT variant inside updateInternal — it runs every frame
    // and clears entity.background as soon as the refreshed corner
    // probes stop seeing huggable triles.
    if (
      entity.climbing ||
      entity.groundMovement.lengthSq() > 1e-8
    ) {
      this.determineInBackground(entity);
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
      // FEZ selects SlidingFriction only when the player is in the
      // explicit Sliding action (coast-to-stop state). Otherwise
      // GroundFriction for walk/run/idle.
      if (isComplex && complex.action === ActionType.Sliding) {
        friction = SLIDING_FRICTION.clone();
      } else {
        friction = GROUND_FRICTION.clone();
      }
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

    // Refresh corner probes at the newly-integrated position BEFORE
    // running hugWalls. hugWalls consumes entity.cornerCollision;
    // if we don't refresh first it would use stale corners from the
    // previous frame's position and miss depth-penetration that only
    // appears at the new center.
    this.determineOverlaps(entity);

    // Wall hugging (depth-axis pushback) — pushes the entity toward the
    // camera so its scene-facing edge is flush with any huggable trile's
    // camera-facing face. This is the mechanism that produces the
    // "emerge in front when walking back over a wall you were behind"
    // behaviour: once the light variant clears entity.background, the
    // next frame's horizontal walk back into the wall's screen-X range
    // finds the wall as huggable in foreground mode and gets pushed
    // along the depth axis to its front face.
    if (hugWalls && !simple) {
      this.hugWalls(entity, false, true);
    }

    // Light background re-evaluation — clears entity.background if none
    // of the corner probes still see a huggable trile. The automatic
    // foreground-return path.
    if (hugWalls && !simple && "climbing" in entity) {
      this.determineInBackgroundLight(entity as IComplexPhysicsEntity);
    }

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
   * Returns both flags; never writes entity.background directly — the
   * caller (determineInBackground) owns that write so the loop pattern
   * works correctly. Setting entity.background from inside this method
   * would short-circuit the loop-until-not-hugged semantics FEZ relies
   * on.
   *
   * FEZ/Services/PhysicsManager.cs — HugWalls()
   */
  private hugWalls(
    entity: IPhysicsEntity,
    determineBackground: boolean,
    keepInFront: boolean,
  ): { hugged: boolean; isBehind: boolean } {
    let hugged = false;
    let isBehind = false;

    // When the entity is ALREADY in the background layer, FEZ flips
    // the forward vector so pushback/detection is measured from the
    // opposite side of triles. Grounded entities already in background
    // skip hugWalls entirely — the ground-clamp keeps them put.
    const inBg = entity.background;
    if (inBg && entity.grounded) {
      return { hugged, isBehind };
    }
    const fwd = inBg
      ? forwardVector(this.viewpoint).negate()
      : forwardVector(this.viewpoint);
    const negFwd = fwd.clone().negate(); // points "toward camera" from the entity's layer perspective
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

        // FEZ-faithful geometry:
        //
        //   trile near face = trileCenter + trileHalfSize * (-forward)
        //     (the trile's camera-facing surface in the current layer)
        //
        //   entity back edge = entity.center + entityHalfDepth * forward
        //     (the entity's scene-facing edge — the AABB-min corner in the
        //      depth axis, what FEZ refers to as "entity.Center - halfSize")
        //
        // The snap fires whenever the trile's near face is scene-ward of
        // the entity's back edge OR vice-versa — i.e., whenever the two
        // aren't exactly flush. The resulting push is "attract to face":
        // always moves the entity along the depth axis until its back
        // edge aligns with the trile's camera-facing face.
        //
        // When the entity is in front of the face, the push pulls it
        // backward; when behind, forward. This produces the observable
        // FEZ behaviour of walking-into a non-AllSides trile snapping
        // the player to that trile's depth, regardless of starting side.
        const trileFacePoint = trileCenter
          .clone()
          .add(vec3Mul(trileHalfSize, negFwd));
        const entityProbe = entity.center
          .clone()
          .add(vec3Mul(entityHalfDepth, fwd)); // back edge, toward scene

        const diff = entityProbe.clone().sub(trileFacePoint);
        const depthDot = diff.dot(negFwd);

        // Behind-detection only fires when the entity is genuinely
        // deep on the scene side of the trile's face (depthDot < 0
        // AND penetration exceeds half the combined sizes). This
        // gates the background-layer transition.
        let markedBehind = false;
        if (determineBackground && depthDot < 0) {
          const totalSize =
            vec3Mul(trileHalfSize, absFwd).length() +
            entityHalfDepth.length();
          if (Math.abs(depthDot) > totalSize) {
            isBehind = true;
            markedBehind = true;
          }
        }

        // Push "attract to face": move the entity along the depth axis
        // until its back edge is flush with the trile's camera-facing
        // face. Pushes in BOTH directions (negative depthDot → forward;
        // positive depthDot → backward) so walking into a huggable
        // trile from the camera side also snaps to the face.
        //
        // Skipped only when the Behind branch already fired (during
        // determineBackground loops), matching FEZ's mutually-exclusive
        // "Behind vs push" logic inside a single hugWalls iteration.
        if (!markedBehind && keepInFront && Math.abs(depthDot) > 1e-6) {
          const pushback = vec3Mul(diff, absFwd).negate();
          entity.center.add(pushback);
          hugged = true;
        }
      }
    }

    return { hugged, isBehind };
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

    // Check the visible face. Huggable when non-Immaterial and
    // non-TopNoStraightLedge. AllSides IS huggable — main collision
    // handles the horizontal blocking, while the hug snaps the entity's
    // depth to the face. Without AllSides being huggable, a player
    // walking toward a solid wall at a different depth would phase
    // through it depth-wise (wall blocks horizontally, but nothing
    // aligns the player's Z with the wall's face, so on the next view
    // rotation / movement they're still at their old depth).
    const face = visibleOrientation(this.viewpoint);
    const ct = getRotatedFace(
      face,
      instance,
      def,
      this.levelManager.triles,
      this.levelManager.trileSet,
    );

    return (
      ct !== CollisionType.Immaterial &&
      ct !== CollisionType.TopNoStraightLedge
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
   * DetermineInBackground — full layer re-evaluation.
   *
   * The FEZ pattern (per audit against the decompiled PhysicsManager):
   *   1. Unconditionally clear entity.background.
   *   2. Loop: determineOverlaps + hugWalls(determineBackground=true,
   *      keepInFront=true). Each iteration pushes the entity toward the
   *      camera away from huggable triles and records whether the
   *      entity's penetration was deep enough to count as "behind".
   *      Keep looping until no more pushing happens.
   *   3. Set entity.background = (any iteration detected isBehind).
   *   4. If now in background, re-sample overlaps with the background
   *      query flag so subsequent callers see the correct trile set.
   *
   * The observable behaviour ("walk back toward a wall, emerge in
   * front") falls out of this default-to-foreground pattern: next
   * tick's CollideRectangle runs with the layer filter derived from
   * entity.background, and foreground walls simply aren't seen as
   * colliders when the player is in the foreground layer.
   *
   * FEZ/Services/PhysicsManager.cs — DetermineInBackground()
   */
  determineInBackground(entity: IComplexPhysicsEntity): void {
    entity.background = false;

    // keepInFront is `!climbing` per FEZ — while climbing we don't
    // push the entity out of huggable triles (climbing states carry
    // their own position management).
    const keepInFront = !entity.climbing;

    // Loop: determineOverlaps + hugWalls(determineBackground=true).
    // Each iteration that pushes back with keepInFront sets `hugged`;
    // the loop exits when no more pushback happens. We take only the
    // FINAL iteration's isBehind — FEZ's settled-position result.
    let result: { hugged: boolean; isBehind: boolean } = {
      hugged: false,
      isBehind: false,
    };
    let iterations = 0;
    const MAX_ITERATIONS = 8; // safety cap — normal case resolves in 1–2
    for (;;) {
      this.determineOverlaps(entity);
      result = this.hugWalls(entity, true, keepInFront);
      if (!result.hugged) break;
      if (++iterations >= MAX_ITERATIONS) break;
    }

    entity.background = result.isBehind;

    // Final pushback pass: re-sample overlaps with the now-correct
    // background flag and run hugWalls one more time with
    // determineBackground=false so any settling uses pure pushback
    // semantics against the correct layer's trile set.
    this.determineOverlaps(entity);
    this.hugWalls(entity, false, keepInFront);
  }

  /**
   * DetermineInBackgroundLight — the allowEnterInBackground=false variant.
   *
   * FEZ's UpdateInternal calls this every frame. It only CLEARS
   * entity.background when no corner has a huggable instance — i.e.,
   * the entity is no longer overlapping any background-suitable trile
   * and should return to the foreground layer. It never sets
   * entity.background to true.
   *
   * This is the mechanism that "ushers the player back to foreground"
   * once they've walked out from behind the wall without needing a
   * rotation or moving platform to trigger the full re-evaluation.
   */
  private determineInBackgroundLight(entity: IComplexPhysicsEntity): void {
    if (!entity.background) return; // already foreground — nothing to do

    // If any corner probe still sees a huggable trile, we're still
    // validly in the background.
    for (const corner of entity.cornerCollision) {
      for (const inst of [corner.instances.surface, corner.instances.deep]) {
        if (inst && this.isHuggable(inst, entity)) {
          return;
        }
      }
    }

    // No huggable triles — return to foreground.
    entity.background = false;
  }
}
