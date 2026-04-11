import * as THREE from "three";
import type { TrileInstance } from "./Trile";

/**
 * FEZ collision data structures, ported faithfully from the C# source.
 */

/**
 * CollisionResult — result of a single collision test.
 * FezEngine/Structure/CollisionResult.cs
 */
export interface CollisionResult {
  collided: boolean;
  shouldBeClamped: boolean;
  response: THREE.Vector3;
  nearestDistance: THREE.Vector3; // center of the hit trile
  destination: TrileInstance | null;
}

export function emptyCollisionResult(): CollisionResult {
  return {
    collided: false,
    shouldBeClamped: false,
    response: new THREE.Vector3(),
    nearestDistance: new THREE.Vector3(),
    destination: null,
  };
}

/**
 * MultipleHits<T> — stores results for two edge probes.
 * FezEngine/Structure/MultipleHits`1.cs
 *
 * NearLow = near/low edge of entity, FarHigh = far/high edge.
 */
export interface MultipleHits<T> {
  nearLow: T;
  farHigh: T;
}

/** For CollisionResult MultipleHits: return first where collided=true */
export function multipleHitsFirst(
  hits: MultipleHits<CollisionResult>,
): CollisionResult {
  if (hits.nearLow.collided) return hits.nearLow;
  if (hits.farHigh.collided) return hits.farHigh;
  return emptyCollisionResult();
}

/** True if either NearLow or FarHigh has collided=true */
export function anyCollided(
  hits: MultipleHits<CollisionResult>,
): boolean {
  return hits.nearLow.collided || hits.farHigh.collided;
}

/** True if either NearLow or FarHigh has a non-null destination */
export function anyHit(
  hits: MultipleHits<CollisionResult>,
): boolean {
  return hits.nearLow.destination !== null || hits.farHigh.destination !== null;
}

export function emptyCollisionHits(): MultipleHits<CollisionResult> {
  return {
    nearLow: emptyCollisionResult(),
    farHigh: emptyCollisionResult(),
  };
}

/** For TrileInstance MultipleHits: return first non-null */
export function multipleHitsFirstInstance(
  hits: MultipleHits<TrileInstance | null>,
): TrileInstance | null {
  return hits.nearLow ?? hits.farHigh;
}

export function emptyInstanceHits(): MultipleHits<TrileInstance | null> {
  return { nearLow: null, farHigh: null };
}

/**
 * NearestTriles — result of depth-axis scanning.
 * Surface = frontmost trile (nearest to camera), may be Thin.
 * Deep = first fully solid trile along depth axis.
 * FezEngine/Services/NearestTriles.cs
 */
export interface NearestTriles {
  surface: TrileInstance | null;
  deep: TrileInstance | null;
}

export function emptyNearestTriles(): NearestTriles {
  return { surface: null, deep: null };
}

/**
 * PointCollision — a corner probe result.
 * FezEngine/Structure/PointCollision.cs
 */
export interface PointCollision {
  point: THREE.Vector3;
  instances: NearestTriles;
}
