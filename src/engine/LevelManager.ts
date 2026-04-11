import * as THREE from "three";
import {
  CollisionType,
  FaceOrientation,
  faceGetOpposite,
  QueryOptions,
  QueryResult,
} from "./CollisionEnums";
import { Viewpoint } from "./Viewpoint";
import {
  forwardVector,
  visibleOrientation,
  depthMask,
  screenSpaceMask,
  sideMask,
  rightVector,
  almostEqual,
  EPSILON,
} from "./FezMath";
import {
  TrileDefinition,
  TrileInstance,
  TrileEmplacement,
  emplacementKey,
  emplacementFromPosition,
  getTrileCenter,
  getTransformedSize,
  getRotatedFace,
} from "../structure/Trile";
import {
  NearestTriles,
  emptyNearestTriles,
} from "../structure/CollisionStructures";

/**
 * Limit — depth range cache per screen-space tile.
 * FezEngine/Services/Limit.cs
 */
interface Limit {
  start: number; // nearest depth coordinate
  end: number; // farthest depth coordinate
  noOffset: boolean;
}

/**
 * LevelManager — manages trile lookups and depth-axis scanning.
 * Implements NearestTrile, ActualInstanceAt, and ScreenSpaceLimits.
 *
 * FezEngine/Services/LevelManager.cs (spatial query portions)
 */
export class LevelManager {
  readonly triles: Map<string, TrileInstance>;
  readonly trileSet: Map<number, TrileDefinition>;
  readonly levelSize: THREE.Vector3;

  /** Screen-space limits cache, rebuilt on viewpoint change */
  private screenSpaceLimits = new Map<string, Limit>();
  private cachedViewpoint: Viewpoint = Viewpoint.None;

  constructor(
    triles: Map<string, TrileInstance>,
    trileSet: Map<number, TrileDefinition>,
    levelSize: THREE.Vector3,
  ) {
    this.triles = triles;
    this.trileSet = trileSet;
    this.levelSize = levelSize;
  }

  /** Look up a trile at exact integer grid coordinates */
  actualInstanceAt(pos: THREE.Vector3): TrileInstance | null {
    const emp = emplacementFromPosition(pos);
    return this.triles.get(emplacementKey(emp)) ?? null;
  }

  /**
   * NearestTrile — the core FEZ spatial query.
   *
   * Scans along the camera's depth axis at the given position,
   * returning the nearest Surface (thin) and Deep (fully solid) triles.
   *
   * FezEngine/Services/LevelManager.cs, lines 799-938
   *
   * @param position World position to query
   * @param options Query options (Background reverses direction, Simple skips fuzzy matching)
   * @param viewpoint Current camera viewpoint
   * @param customViewpoint Optional override viewpoint for scanning
   */
  nearestTrile(
    position: THREE.Vector3,
    options: QueryOptions = QueryOptions.None,
    viewpoint?: Viewpoint,
    customViewpoint?: Viewpoint,
  ): NearestTriles {
    const vp = customViewpoint ?? viewpoint ?? Viewpoint.Front;
    const isBackground = (options & QueryOptions.Background) !== 0;
    const isSimple = (options & QueryOptions.Simple) !== 0;

    // Ensure screen-space limits are computed for this viewpoint
    if (this.cachedViewpoint !== vp) {
      this.rebuildScreenSpaceLimits(vp);
    }

    const depthIsZ =
      vp === Viewpoint.Front || vp === Viewpoint.Back;

    // Forward direction sign along the depth axis
    const fwd = forwardVector(vp);
    let forwardSign = depthIsZ ? Math.sign(fwd.z) : Math.sign(fwd.x);
    if (isBackground) forwardSign = -forwardSign;

    // Convert position to screen-space tile (side, y)
    const sideVec = sideMask(vp);
    const sideCoord = depthIsZ ? position.x : position.z;
    const yCoord = position.y;
    const sideInt = Math.floor(sideCoord);
    const yInt = Math.floor(yCoord);
    const tileKey = `${sideInt},${yInt}`;

    // Determine depth range to scan
    let depthStart: number;
    let depthEnd: number;

    if (customViewpoint !== undefined) {
      // Custom viewpoint: scan entire level depth
      const maxDepth = depthIsZ
        ? Math.ceil(this.levelSize.z)
        : Math.ceil(this.levelSize.x);
      if (forwardSign > 0) {
        depthStart = 0;
        depthEnd = maxDepth;
      } else {
        depthStart = maxDepth - 1;
        depthEnd = -1;
      }
    } else if (isSimple) {
      // Simple mode: exact tile only
      const limit = this.screenSpaceLimits.get(tileKey);
      if (!limit) return emptyNearestTriles();

      // limit.start is always camera-near, limit.end is always camera-far.
      // No swap needed — the walk loop handles direction via forwardSign.
      depthStart = limit.start;
      depthEnd = limit.end;
    } else {
      // Default fuzzy mode: check exact tile + 2 adjacent neighbors
      const sideFrac = sideCoord - sideInt;
      const yFrac = yCoord - yInt;
      const neighborSide = sideInt + (sideFrac > 0.5 ? 1 : -1);
      const neighborY = yInt + (yFrac > 0.5 ? 1 : -1);

      const keys = [
        tileKey,
        `${neighborSide},${yInt}`,
        `${sideInt},${neighborY}`,
      ];

      let foundAny = false;
      // Union must widen the range: take the most-camera-near start
      // and the most-camera-far end across all neighbor tiles.
      // limit.start is always camera-near, limit.end is always camera-far.
      let unionStart = forwardSign > 0 ? Infinity : -Infinity;
      let unionEnd = forwardSign > 0 ? -Infinity : Infinity;

      for (const key of keys) {
        const limit = this.screenSpaceLimits.get(key);
        if (!limit) continue;
        foundAny = true;
        if (forwardSign > 0) {
          // Positive scan: start is low value, end is high value
          unionStart = Math.min(unionStart, limit.start);
          unionEnd = Math.max(unionEnd, limit.end);
        } else {
          // Negative scan: start is high value, end is low value
          unionStart = Math.max(unionStart, limit.start);
          unionEnd = Math.min(unionEnd, limit.end);
        }
      }

      if (!foundAny) return emptyNearestTriles();
      depthStart = unionStart;
      depthEnd = unionEnd;
    }

    // Walk along depth axis
    const result: NearestTriles = { surface: null, deep: null };
    let d = depthStart;

    while (true) {
      // Build emplacement for this depth
      const emp: TrileEmplacement = depthIsZ
        ? { x: sideInt, y: yInt, z: d }
        : { x: d, y: yInt, z: sideInt };

      const instance = this.offsetInstanceAt(
        position,
        emp,
        depthIsZ,
        vp,
        isBackground,
        !isSimple,
      );

      if (instance) {
        const queryRes = this.instanceMaterialForQuery(
          instance,
          vp,
          isBackground,
        );

        if (queryRes === QueryResult.Full) {
          result.deep = instance;
          break; // Stop at first fully solid
        } else if (queryRes === QueryResult.Thin && result.surface === null) {
          result.surface = instance;
          // Continue scanning for Deep
        }
      }

      // Advance
      if (forwardSign > 0 ? d >= depthEnd : d <= depthEnd) break;
      d += forwardSign;
    }

    return result;
  }

  /**
   * OffsetInstanceAt — fuzzy cell lookup.
   * Checks up to 4 neighboring cells for a trile that contains the query position.
   *
   * FezEngine/Services/LevelManager.cs, lines 946-1005
   */
  private offsetInstanceAt(
    position: THREE.Vector3,
    emplacement: TrileEmplacement,
    depthIsZ: boolean,
    viewpoint: Viewpoint,
    isBackground: boolean,
    fuzzy: boolean,
  ): TrileInstance | null {
    // Check exact emplacement first
    const exact = this.triles.get(emplacementKey(emplacement));
    if (exact && exact.enabled) {
      const qr = this.instanceMaterialForQuery(exact, viewpoint, isBackground);
      if (qr !== QueryResult.Nothing) {
        if (!fuzzy) return exact;
        if (this.offsetInstanceContains(position, exact, depthIsZ)) {
          return exact;
        }
      }
    }

    if (!fuzzy) return exact?.enabled ? exact : null;

    // Check neighbors based on fractional position
    const sideCoord = depthIsZ ? position.x : position.z;
    const yCoord = position.y;
    const sideFrac = sideCoord - Math.floor(sideCoord);
    const yFrac = yCoord - Math.floor(yCoord);

    const sideOff = sideFrac > 0.5 ? 1 : -1;
    const yOff = yFrac > 0.5 ? 1 : -1;

    // Horizontal neighbor
    const hNeighbor: TrileEmplacement = depthIsZ
      ? { x: emplacement.x + sideOff, y: emplacement.y, z: emplacement.z }
      : { x: emplacement.x, y: emplacement.y, z: emplacement.z + sideOff };

    const hInst = this.triles.get(emplacementKey(hNeighbor));
    if (hInst && hInst.enabled) {
      if (this.instanceMaterialForQuery(hInst, viewpoint, isBackground) !== QueryResult.Nothing) {
        if (this.offsetInstanceContains(position, hInst, depthIsZ)) return hInst;
      }
    }

    // Vertical neighbor
    const vNeighbor: TrileEmplacement = {
      x: emplacement.x,
      y: emplacement.y + yOff,
      z: emplacement.z,
    };
    const vInst = this.triles.get(emplacementKey(vNeighbor));
    if (vInst && vInst.enabled) {
      if (this.instanceMaterialForQuery(vInst, viewpoint, isBackground) !== QueryResult.Nothing) {
        if (this.offsetInstanceContains(position, vInst, depthIsZ)) return vInst;
      }
    }

    // Diagonal neighbor
    const dNeighbor: TrileEmplacement = depthIsZ
      ? {
          x: emplacement.x + sideOff,
          y: emplacement.y + yOff,
          z: emplacement.z,
        }
      : {
          x: emplacement.x,
          y: emplacement.y + yOff,
          z: emplacement.z + sideOff,
        };
    const dInst = this.triles.get(emplacementKey(dNeighbor));
    if (dInst && dInst.enabled) {
      if (this.instanceMaterialForQuery(dInst, viewpoint, isBackground) !== QueryResult.Nothing) {
        if (this.offsetInstanceContains(position, dInst, depthIsZ)) return dInst;
      }
    }

    // No trile at this depth contains the query point in screen-space.
    // Return null — do NOT fall back to the exact emplacement, as that
    // causes phantom collisions with triles the player isn't actually near.
    return null;
  }

  /**
   * OffsetInstanceContains — check if a position falls within a trile's screen-space AABB.
   * FezEngine/Services/LevelManager.cs, lines 1032-1046
   */
  private offsetInstanceContains(
    position: THREE.Vector3,
    instance: TrileInstance,
    depthIsZ: boolean,
  ): boolean {
    const def = this.trileSet.get(instance.trileId);
    if (!def) return false;

    const center = getTrileCenter(instance, def);
    const size = getTransformedSize(instance, def);
    const halfSize = size.clone().multiplyScalar(0.5);

    // Screen-space containment (skip depth check)
    if (depthIsZ) {
      // X and Y are visible
      return (
        position.x >= center.x - halfSize.x &&
        position.x <= center.x + halfSize.x &&
        position.y >= center.y - halfSize.y &&
        position.y <= center.y + halfSize.y
      );
    } else {
      // Z and Y are visible
      return (
        position.z >= center.z - halfSize.z &&
        position.z <= center.z + halfSize.z &&
        position.y >= center.y - halfSize.y &&
        position.y <= center.y + halfSize.y
      );
    }
  }

  /**
   * InstanceMaterialForQuery — determine if a trile passes the query filter.
   * Returns Nothing, Thin, or Full.
   * FezEngine/Services/LevelManager.cs, lines 1048-1054
   */
  private instanceMaterialForQuery(
    instance: TrileInstance,
    viewpoint: Viewpoint,
    isBackground: boolean,
  ): QueryResult {
    const def = this.trileSet.get(instance.trileId);
    if (!def) return QueryResult.Nothing;

    // Skip immaterial triles
    if (def.immaterial) return QueryResult.Nothing;

    // Skip triles currently being physics-updated (prevents self-collision)
    if (instance.physicsState?.updatingPhysics) return QueryResult.Nothing;

    // Check the camera-facing face
    let face = visibleOrientation(viewpoint);
    if (isBackground) face = faceGetOpposite(face);

    const rotatedFace = getRotatedFace(
      face,
      instance,
      def,
      this.triles,
      this.trileSet,
    );

    if (rotatedFace === CollisionType.Immaterial) return QueryResult.Nothing;
    if (def.thin) return QueryResult.Thin;
    return QueryResult.Full;
  }

  /**
   * Rebuild screen-space limits for a viewpoint.
   * FezEngine/Services/LevelManager.cs — FillScreenSpaceTile
   *
   * For each screen-space tile (side, y), records the min/max depth
   * coordinates where triles exist.
   */
  rebuildScreenSpaceLimits(viewpoint: Viewpoint): void {
    this.screenSpaceLimits.clear();
    this.cachedViewpoint = viewpoint;

    const depthIsZ =
      viewpoint === Viewpoint.Front || viewpoint === Viewpoint.Back;
    const fwd = forwardVector(viewpoint);
    const forwardSign = depthIsZ ? Math.sign(fwd.z) : Math.sign(fwd.x);

    const maxSide = depthIsZ
      ? Math.ceil(this.levelSize.x)
      : Math.ceil(this.levelSize.z);
    const maxY = Math.ceil(this.levelSize.y);
    const maxDepth = depthIsZ
      ? Math.ceil(this.levelSize.z)
      : Math.ceil(this.levelSize.x);

    for (let side = -1; side < maxSide + 1; side++) {
      for (let y = -1; y < maxY + 1; y++) {
        let foundStart: number | null = null;
        let foundEnd: number | null = null;

        // Walk depth from near to far
        const start = forwardSign > 0 ? 0 : maxDepth - 1;
        const end = forwardSign > 0 ? maxDepth : -1;

        for (
          let d = start;
          forwardSign > 0 ? d < end : d > end;
          d += forwardSign
        ) {
          const emp: TrileEmplacement = depthIsZ
            ? { x: side, y, z: d }
            : { x: d, y, z: side };

          const key = emplacementKey(emp);
          const instance = this.triles.get(key);

          if (instance && instance.enabled) {
            const def = this.trileSet.get(instance.trileId);
            if (def && !def.immaterial) {
              if (foundStart === null) foundStart = d;
              foundEnd = d;
            }
          }
        }

        if (foundStart !== null && foundEnd !== null) {
          // Store with consistent ordering: start is always the camera-near side
          const tileKey = `${side},${y}`;
          this.screenSpaceLimits.set(tileKey, {
            start: forwardSign > 0
              ? Math.min(foundStart, foundEnd)
              : Math.max(foundStart, foundEnd),
            end: forwardSign > 0
              ? Math.max(foundStart, foundEnd)
              : Math.min(foundStart, foundEnd),
            noOffset: true,
          });
        }
      }
    }
  }

  /** Invalidate screen-space limits (call on viewpoint change) */
  invalidateScreen(): void {
    this.cachedViewpoint = Viewpoint.None;
  }
}
