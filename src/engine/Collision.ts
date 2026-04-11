import * as THREE from "three";
import { Level, getTrileAt, getTrileDefinition } from "../structure/Level";
import { Viewpoint, getDepthAxis, getRightVector } from "./Viewpoint";

/**
 * Viewpoint-dependent collision — the heart of FEZ's dimension trick.
 *
 * In FEZ, collision is performed in the 2D projection of the current viewpoint.
 * A 3D gap that doesn't exist from the current viewing angle is walkable.
 * We scan along the depth axis to find solid triles that overlap in screen space.
 */

export interface CollisionResult {
  grounded: boolean;
  ceiling: boolean;
  wallLeft: boolean;
  wallRight: boolean;
  groundY: number; // Y position of the ground surface
}

const PLAYER_WIDTH = 0.8;
const PLAYER_HEIGHT = 1.5;
const EPSILON = 0.001;

/**
 * Check if a position is solid by scanning along the depth axis.
 * In FEZ, a block is considered solid if ANY block along the depth axis
 * at that (screen-X, Y) is solid.
 */
export function isSolidAt(
  level: Level,
  screenX: number,
  y: number,
  viewpoint: Viewpoint,
): boolean {
  const depth = getDepthAxis(viewpoint);
  const right = getRightVector(viewpoint);

  // Convert screen-X to world coordinates
  // screenX is along the right vector
  const gridX = Math.floor(screenX);
  const gridY = Math.floor(y);

  // Scan along the depth axis for any solid trile
  const size =
    depth.axis === "x"
      ? Math.ceil(level.size.x)
      : Math.ceil(level.size.z);

  for (let d = 0; d < size; d++) {
    let wx: number, wy: number, wz: number;

    if (depth.axis === "z") {
      // Front/Back: right vector is along X, depth is Z
      wx = right[0] !== 0 ? gridX : d;
      wy = gridY;
      wz = right[0] !== 0 ? d : gridX;
    } else {
      // Left/Right: right vector is along Z, depth is X
      wx = right[2] !== 0 ? d : gridX;
      wy = gridY;
      wz = right[2] !== 0 ? gridX : d;
    }

    const trile = getTrileAt(level, wx, wy, wz);
    if (trile) {
      const def = getTrileDefinition(level, trile);
      if (def?.solid) return true;
    }
  }
  return false;
}

/**
 * Project a 3D position to 2D screen-space coordinates for the given viewpoint.
 * Returns { screenX, screenY } where screenX is along the right vector.
 */
export function projectToScreen(
  pos: THREE.Vector3,
  viewpoint: Viewpoint,
): { screenX: number; screenY: number } {
  const right = getRightVector(viewpoint);

  // Dot product of position with right vector gives screen X
  const screenX = pos.x * right[0] + pos.y * right[1] + pos.z * right[2];
  const screenY = pos.y;

  return { screenX, screenY };
}

/**
 * Run full AABB collision for a player-sized entity.
 * Checks ground, ceiling, and walls using viewpoint-projected collision.
 */
export function collidePlayer(
  level: Level,
  position: THREE.Vector3,
  viewpoint: Viewpoint,
): CollisionResult {
  const { screenX, screenY } = projectToScreen(position, viewpoint);

  const halfW = PLAYER_WIDTH / 2;
  const result: CollisionResult = {
    grounded: false,
    ceiling: false,
    wallLeft: false,
    wallRight: false,
    groundY: -Infinity,
  };

  // Ground check: check just below feet
  const feetY = screenY - EPSILON;
  const gridBelowY = Math.floor(feetY);
  if (
    isSolidAt(level, Math.floor(screenX), gridBelowY, viewpoint) ||
    isSolidAt(level, Math.floor(screenX - halfW + EPSILON), gridBelowY, viewpoint) ||
    isSolidAt(level, Math.floor(screenX + halfW - EPSILON), gridBelowY, viewpoint)
  ) {
    // Only grounded if we're close to the top of the block
    const blockTopY = gridBelowY + 1;
    if (Math.abs(screenY - blockTopY) < 0.15) {
      result.grounded = true;
      result.groundY = blockTopY;
    }
  }

  // Ceiling check: check just above head
  const headY = screenY + PLAYER_HEIGHT + EPSILON;
  const gridAboveY = Math.floor(headY);
  if (
    isSolidAt(level, Math.floor(screenX), gridAboveY, viewpoint)
  ) {
    result.ceiling = true;
  }

  // Wall checks at multiple heights
  for (let h = 0.2; h < PLAYER_HEIGHT; h += 0.5) {
    const checkY = screenY + h;
    const leftX = screenX - halfW - EPSILON;
    const rightX = screenX + halfW + EPSILON;

    if (isSolidAt(level, Math.floor(leftX), Math.floor(checkY), viewpoint)) {
      result.wallLeft = true;
    }
    if (isSolidAt(level, Math.floor(rightX), Math.floor(checkY), viewpoint)) {
      result.wallRight = true;
    }
  }

  return result;
}
