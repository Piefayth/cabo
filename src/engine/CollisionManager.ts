import * as THREE from "three";
import {
  CollisionType,
  FaceOrientation,
  Direction2D,
  QueryOptions,
  HorizontalDirection,
  faceGetOpposite,
  horizontalSign,
} from "./CollisionEnums";
import { Viewpoint } from "./Viewpoint";
import {
  forwardVector,
  rightVector,
  visibleOrientation,
  vec3Sign,
  vec3Abs,
  vec3Mul,
  almostEqual,
  EPSILON,
} from "./FezMath";
import { LevelManager } from "./LevelManager";
import {
  TrileInstance,
  TrileDefinition,
  getTrileCenter,
  getTransformedSize,
  getRotatedFace,
} from "../structure/Trile";
import {
  CollisionResult,
  MultipleHits,
  emptyCollisionResult,
  emptyCollisionHits,
} from "../structure/CollisionStructures";

/**
 * CollisionManager — the core FEZ collision algorithm.
 * Ported faithfully from FEZ/Services/CollisionManager.cs.
 *
 * Entry point: collideRectangle()
 * Tests horizontal and vertical edges of an entity's bounding box
 * against the trile grid using viewpoint-projected collision.
 */
export class CollisionManager {
  private levelManager: LevelManager;

  /** Positive = normal gravity, negative = inverted */
  gravityFactor = 1.0;

  constructor(levelManager: LevelManager) {
    this.levelManager = levelManager;
  }

  /**
   * CollideRectangle — main entry point.
   * Splits impulse into horizontal/vertical, tests edges, handles diagonal fallback.
   *
   * FEZ/Services/CollisionManager.cs — CollideRectangle()
   */
  collideRectangle(
    position: THREE.Vector3,
    impulse: THREE.Vector3,
    size: THREE.Vector3,
    options: QueryOptions,
    elasticity: number,
    viewpoint: Viewpoint,
    lookingDir: HorizontalDirection = HorizontalDirection.Right,
  ): {
    horizontal: MultipleHits<CollisionResult>;
    vertical: MultipleHits<CollisionResult>;
  } {
    const isSimple = (options & QueryOptions.Simple) !== 0;

    // Split impulse into horizontal and vertical components
    // Front/Back: horizontal = X, Right/Left: horizontal = Z
    let horizontalImpulse: THREE.Vector3;
    if (
      viewpoint === Viewpoint.Front ||
      viewpoint === Viewpoint.Back
    ) {
      horizontalImpulse = new THREE.Vector3(impulse.x, 0, 0);
    } else {
      horizontalImpulse = new THREE.Vector3(0, 0, impulse.z);
    }
    const verticalImpulse = new THREE.Vector3(0, impulse.y, 0);

    const halfSize = size.clone().multiplyScalar(0.5);

    // First pass: test at current position
    let horizontal = this.collideEdge(
      position,
      horizontalImpulse,
      halfSize,
      Direction2D.Horizontal,
      options,
      elasticity,
      viewpoint,
      lookingDir,
    );

    let vertical = this.collideEdge(
      position,
      verticalImpulse,
      halfSize,
      Direction2D.Vertical,
      options,
      elasticity,
      viewpoint,
      lookingDir,
    );

    // Two-pass fallback for diagonal movement:
    // If neither collided, retry with position offset by the other axis's impulse.
    if (!isSimple) {
      if (
        !horizontal.nearLow.collided &&
        !horizontal.farHigh.collided &&
        !vertical.nearLow.collided &&
        !vertical.farHigh.collided
      ) {
        // Retry horizontal at position + verticalImpulse
        const h2 = this.collideEdge(
          position.clone().add(verticalImpulse),
          horizontalImpulse,
          halfSize,
          Direction2D.Horizontal,
          options,
          elasticity,
          viewpoint,
          lookingDir,
        );
        if (h2.nearLow.collided || h2.farHigh.collided) {
          horizontal = h2;
        }

        // Retry vertical at position + horizontalImpulse
        const v2 = this.collideEdge(
          position.clone().add(horizontalImpulse),
          verticalImpulse,
          halfSize,
          Direction2D.Vertical,
          options,
          elasticity,
          viewpoint,
          lookingDir,
        );
        if (v2.nearLow.collided || v2.farHigh.collided) {
          vertical = v2;
        }
      }
    }

    return { horizontal, vertical };
  }

  /**
   * CollideEdge — test two points along an edge of the entity.
   *
   * For Horizontal: tests bottom and top of the side-facing edge.
   * For Vertical: tests left and right of the up/down-facing edge.
   *
   * FEZ/Services/CollisionManager.cs — CollideEdge()
   */
  private collideEdge(
    position: THREE.Vector3,
    impulse: THREE.Vector3,
    halfSize: THREE.Vector3,
    direction: Direction2D,
    options: QueryOptions,
    elasticity: number,
    viewpoint: Viewpoint,
    lookingDir: HorizontalDirection,
  ): MultipleHits<CollisionResult> {
    const result = emptyCollisionHits();

    // If no impulse in this direction, skip
    if (impulse.lengthSq() < 1e-12) return result;

    const isSimple = (options & QueryOptions.Simple) !== 0;
    const sign = vec3Sign(impulse);

    if (direction === Direction2D.Horizontal) {
      if (!isSimple) {
        // Test bottom edge: position + (sign + Down) * halfSize
        const nearLowPos = position.clone().add(
          vec3Mul(
            new THREE.Vector3(sign.x, -1, sign.z),
            halfSize,
          ),
        );
        result.nearLow = this.collidePoint(
          nearLowPos,
          impulse,
          options,
          elasticity,
          viewpoint,
        );

        // Test top edge: position + (sign + Up) * halfSize
        const farHighPos = position.clone().add(
          vec3Mul(
            new THREE.Vector3(sign.x, 1, sign.z),
            halfSize,
          ),
        );
        result.farHigh = this.collidePoint(
          farHighPos,
          impulse,
          options,
          elasticity,
          viewpoint,
        );
      }

      // Fallback: center edge test
      if (isSimple || !result.nearLow.collided) {
        const centerPos = position.clone().add(
          vec3Mul(sign, halfSize),
        );
        result.nearLow = this.collidePoint(
          centerPos,
          impulse,
          options,
          elasticity,
          viewpoint,
        );
      }
    } else {
      // Vertical direction
      const rv = rightVector(viewpoint).multiplyScalar(
        horizontalSign(lookingDir),
      );

      if (!isSimple) {
        // Test near/left edge: position + (sign - rightVec) * halfSize
        const nearLowPos = position.clone().add(
          vec3Mul(
            sign.clone().sub(rv),
            halfSize,
          ),
        );
        result.nearLow = this.collidePoint(
          nearLowPos,
          impulse,
          options,
          elasticity,
          viewpoint,
        );

        // Test far/right edge: position + (sign + rightVec) * halfSize
        const farHighPos = position.clone().add(
          vec3Mul(
            sign.clone().add(rv),
            halfSize,
          ),
        );
        result.farHigh = this.collidePoint(
          farHighPos,
          impulse,
          options,
          elasticity,
          viewpoint,
        );
      }

      // Fallback: center edge test
      if (isSimple || !result.nearLow.collided) {
        const centerPos = position.clone().add(
          vec3Mul(sign, halfSize),
        );
        result.nearLow = this.collidePoint(
          centerPos,
          impulse,
          options,
          elasticity,
          viewpoint,
        );
      }
    }

    return result;
  }

  /**
   * CollidePoint — single point collision test.
   *
   * 1. Find trile at destination via NearestTrile depth scan
   * 2. Test collision with that trile
   * 3. Check ground clamping for downward movement
   *
   * FEZ/Services/CollisionManager.cs — CollidePoint()
   */
  private collidePoint(
    position: THREE.Vector3,
    impulse: THREE.Vector3,
    options: QueryOptions,
    elasticity: number,
    viewpoint: Viewpoint,
  ): CollisionResult {
    const destination = position.clone().add(impulse);
    const isBackground = (options & QueryOptions.Background) !== 0;

    let instance: TrileInstance | null = null;

    if (isBackground) {
      // Background: exact grid lookup
      instance = this.levelManager.actualInstanceAt(destination);
    } else {
      // Normal: depth-axis scan, prefer Deep over Surface
      const nearest = this.levelManager.nearestTrile(
        destination,
        options,
        viewpoint,
      );
      instance = nearest.deep ?? nearest.surface;
    }

    let result = emptyCollisionResult();

    if (instance && instance.enabled) {
      result = this.collideWithInstance(
        position,
        destination,
        impulse,
        instance,
        options,
        elasticity,
        viewpoint,
      );
    }

    // Ground clamping check for downward movement (or upward if inverted gravity)
    const isDownward = this.gravityFactor > 0 ? impulse.y < 0 : impulse.y > 0;
    if (isDownward && result.collided) {
      // Nudge destination slightly to avoid boundary issues
      const checkDest = destination.clone();
      const frac = checkDest.y - Math.floor(checkDest.y);
      if (almostEqual(frac, 0.25) || almostEqual(frac, 0.75)) {
        checkDest.y += 0.001;
      }

      const cellInstance = this.levelManager.actualInstanceAt(checkDest);
      if (!cellInstance || !cellInstance.enabled) {
        result.shouldBeClamped = true;
      } else {
        const def = this.levelManager.trileSet.get(cellInstance.trileId);
        if (def) {
          let face = visibleOrientation(viewpoint);
          if (isBackground) face = faceGetOpposite(face);
          const ct = getRotatedFace(
            face,
            cellInstance,
            def,
            this.levelManager.triles,
            this.levelManager.trileSet,
          );
          if (
            ct === CollisionType.None ||
            ct === CollisionType.Immaterial
          ) {
            result.shouldBeClamped = true;
          }
        }
      }
    }

    return result;
  }

  /**
   * CollideWithInstance — test collision against a specific trile instance.
   *
   * Gets the visible face's collision type, computes solid collision response,
   * then determines if it actually blocks (AllSides always, TopOnly only from above).
   *
   * FEZ/Services/CollisionManager.cs — CollideWithInstance()
   */
  private collideWithInstance(
    origin: THREE.Vector3,
    destination: THREE.Vector3,
    impulse: THREE.Vector3,
    instance: TrileInstance,
    options: QueryOptions,
    elasticity: number,
    viewpoint: Viewpoint,
  ): CollisionResult {
    const def = this.levelManager.trileSet.get(instance.trileId);
    if (!def) return emptyCollisionResult();

    const isBackground = (options & QueryOptions.Background) !== 0;

    // Normal pointing back at the mover
    const normal = vec3Sign(impulse).negate();

    // Determine the visible face orientation
    let faceOri = visibleOrientation(viewpoint);
    if (isBackground) faceOri = faceGetOpposite(faceOri);

    // Get the collision type for this face, rotated by trile's phi
    const rotatedFace = getRotatedFace(
      faceOri,
      instance,
      def,
      this.levelManager.triles,
      this.levelManager.trileSet,
    );

    if (rotatedFace === CollisionType.None) {
      return emptyCollisionResult();
    }

    const result: CollisionResult = {
      collided: false,
      shouldBeClamped: false,
      response: new THREE.Vector3(),
      nearestDistance: getTrileCenter(instance, def),
      destination: instance,
    };

    // Compute solid collision response
    const response = this.solidCollision(
      normal,
      instance,
      def,
      origin,
      destination,
      impulse,
      elasticity,
    );

    if (response.lengthSq() < 1e-12) {
      return result; // No penetration
    }

    result.response = response;

    // Determine if this is a blocking collision
    switch (rotatedFace) {
      case CollisionType.AllSides:
        result.collided = true;
        break;

      case CollisionType.TopOnly:
      case CollisionType.TopNoStraightLedge: {
        // Blocks only if normal points upward (respecting gravity)
        const normalUp = this.gravityFactor > 0
          ? normal.y > 0
          : normal.y < 0;
        if (normalUp) {
          result.collided = true;
        }
        break;
      }

      case CollisionType.Immaterial:
        // Never blocks
        break;
    }

    return result;
  }

  /**
   * SolidCollision — compute the displacement response vector.
   *
   * Projects origin and destination against the trile's face to determine
   * penetration depth. Handles moving triles via PhysicsState velocity.
   *
   * FEZ/Services/CollisionManager.cs — SolidCollision()
   */
  private solidCollision(
    normal: THREE.Vector3,
    instance: TrileInstance,
    def: TrileDefinition,
    origin: THREE.Vector3,
    destination: THREE.Vector3,
    impulse: THREE.Vector3,
    elasticity: number,
  ): THREE.Vector3 {
    const halfSize = getTransformedSize(instance, def)
      .multiplyScalar(0.5);
    const center = getTrileCenter(instance, def);

    // Face point: the surface of the trile closest to the mover
    const facePoint = center.clone().add(vec3Mul(halfSize, normal));

    // Handle moving triles
    let prevFacePoint: THREE.Vector3;
    let faceDelta: THREE.Vector3;

    if (instance.physicsState) {
      const vel = instance.physicsState.velocity;
      // Compute where the face was last frame
      // "stickyMask" in FEZ — for now use full velocity
      prevFacePoint = center
        .clone()
        .sub(vel)
        .add(vec3Mul(halfSize, normal));
      faceDelta = facePoint.clone().sub(prevFacePoint);
    } else {
      prevFacePoint = facePoint.clone();
      faceDelta = new THREE.Vector3(0, 0, 0);
    }

    // Check 1: Was the origin already behind the face? (started inside)
    // FEZ uses strict < 0 — if dot is exactly 0, collision proceeds.
    const originToFace = origin.clone().sub(prevFacePoint);
    if (originToFace.dot(normal) < 0) {
      return new THREE.Vector3(0, 0, 0); // Already inside — skip
    }

    // Check 2: Is the destination still in front of the face? (didn't reach it)
    // FEZ uses strict > 0.
    const destToFace = destination.clone().sub(facePoint);
    if (destToFace.dot(normal) > 0) {
      return new THREE.Vector3(0, 0, 0); // Didn't penetrate — skip
    }

    // Compute response
    const axisMaskVec = vec3Abs(normal);

    if (elasticity <= 0) {
      // Push flush against the face: response = (facePoint - destination) * |normal|
      return vec3Mul(facePoint.clone().sub(destination), axisMaskVec);
    } else {
      // Bounce: response = (faceDelta - impulse) * |normal| * (1 + elasticity)
      return vec3Mul(faceDelta.clone().sub(impulse), axisMaskVec).multiplyScalar(
        1 + elasticity,
      );
    }
  }
}
