import * as THREE from "three";
import { Level } from "./Level";
import {
  TrileDefinition,
  TrileInstance,
  TrileEmplacement,
  emplacementKey,
  solidTrile,
  platformTrile,
  immaterialTrile,
} from "./Trile";
import { CollisionType, FaceOrientation } from "../engine/CollisionEnums";

/**
 * Build a test level that demonstrates FEZ's perspective-shifting mechanic.
 *
 * IMPORTANT: Unlike the old version, ground is only at SPECIFIC depths.
 * This is critical because NearestTrile scans front-to-back along the
 * depth axis and returns the first solid trile found. If ground exists
 * at every depth, the player always gets clamped to the camera-nearest
 * depth, making the perspective trick meaningless.
 *
 * In real FEZ levels, platforms exist at specific depths and the magic
 * is that platforms at DIFFERENT depths APPEAR to connect in 2D.
 */
export function createTestLevel(): Level {
  const trileSet = new Map<number, TrileDefinition>();

  trileSet.set(1, solidTrile(1, "grass", 0x6ab04c));
  trileSet.set(2, solidTrile(2, "dirt", 0x8b6914));
  trileSet.set(3, solidTrile(3, "stone", 0x7f8c8d));
  trileSet.set(4, solidTrile(4, "wood", 0xb07830));
  trileSet.set(5, solidTrile(5, "gold", 0xf1c40f));
  trileSet.set(6, platformTrile(6, "platform", 0xc0392b));
  trileSet.set(7, immaterialTrile(7, "decoration", 0x9b59b6));

  const triles = new Map<string, TrileInstance>();

  function place(x: number, y: number, z: number, id: number, phi = 0): void {
    const emp: TrileEmplacement = { x, y, z };
    const instance: TrileInstance = {
      position: new THREE.Vector3(x, y, z),
      emplacement: emp,
      trileId: id,
      phi,
      enabled: true,
      physicsState: null,
      overlappedTriles: [],
      forceSeeThrough: false,
      unsafe: false,
    };
    triles.set(emplacementKey(emp), instance);
  }

  // Helper: fill a horizontal strip at a specific depth
  function groundStrip(
    xMin: number,
    xMax: number,
    y: number,
    z: number,
    grassId = 1,
    dirtId = 2,
  ): void {
    for (let x = xMin; x <= xMax; x++) {
      place(x, y, z, dirtId);
      place(x, y + 1, z, grassId);
    }
  }

  // ===================================================================
  // MAIN PLATFORM — the starting area, at z=3 (a single depth!)
  // From FRONT view: a wide ground platform
  // ===================================================================
  groundStrip(-4, 10, 0, 3);

  // Also add some depth to the starting ground so it looks 3D when rotated
  groundStrip(-4, 10, 0, 4);
  groundStrip(-4, 10, 0, 2);

  // ===================================================================
  // TOWER — left side, at z=3 (same depth as main ground)
  // The player can walk into it and be stopped (same depth = real wall)
  // ===================================================================
  for (let y = 2; y <= 7; y++) {
    place(-3, y, 3, 3);
    place(-4, y, 3, 3);
    place(-3, y, 4, 3);
    place(-4, y, 4, 3);
    place(-3, y, 2, 3);
    place(-4, y, 2, 3);
  }
  // Tower top
  for (let x = -5; x <= -1; x++) {
    place(x, 8, 3, 3);
    place(x, 8, 4, 3);
    place(x, 8, 2, 3);
  }

  // ===================================================================
  // FEZ TRICK: PERSPECTIVE STAIRCASE
  // These platforms are at DIFFERENT z-depths but from the FRONT view
  // they appear as a continuous ascending staircase.
  //
  // From FRONT view (camera at +Z looking at -Z):
  //   Step 1 (y=3): x=2..4   — actually at z=3
  //   Step 2 (y=5): x=4..6   — actually at z=6 (different depth!)
  //   Step 3 (y=7): x=6..8   — actually at z=1 (yet another depth!)
  //
  // In 2D they form a staircase. In 3D they're disconnected.
  // The collision system scans depth and finds them, so you can walk on them.
  // ===================================================================

  // Step 1: at z=3 (same as main ground, naturally reachable)
  for (let x = 2; x <= 4; x++) {
    place(x, 2, 3, 4);
    place(x, 3, 3, 4);
  }

  // Step 2: at z=6 (different depth! — only connects in 2D front view)
  for (let x = 4; x <= 6; x++) {
    place(x, 4, 6, 4);
    place(x, 5, 6, 4);
  }

  // Step 3: at z=1 (yet another depth!)
  for (let x = 6; x <= 8; x++) {
    place(x, 6, 1, 5);
    place(x, 7, 1, 5);
  }

  // ===================================================================
  // RIGHT VIEW STAIRCASE
  // From the RIGHT view (camera at +X looking at -X), these form steps.
  // In 3D they're at different X depths.
  // ===================================================================
  place(5, 3, 7, 4);
  place(5, 3, 8, 4);
  place(3, 5, 7, 4);
  place(3, 5, 8, 4);
  place(1, 7, 7, 5);
  place(1, 7, 8, 5);

  // ===================================================================
  // TopOnly PLATFORMS — can jump through from below
  // ===================================================================
  place(0, 4, 3, 6);
  place(1, 4, 3, 6);
  place(0, 6, 3, 6);
  place(1, 6, 3, 6);

  // ===================================================================
  // FLOATING ISLAND — only reachable from certain viewpoints
  // From FRONT: appears to be right next to the main platform
  // From RIGHT: reveals it's far away in Z
  // ===================================================================
  for (let x = 11; x <= 13; x++) {
    place(x, 0, 8, 2);
    place(x, 1, 8, 1);
  }
  // Wall on the island
  place(13, 2, 8, 3);
  place(13, 3, 8, 3);

  // ===================================================================
  // DECORATIVE column — immaterial (walk through)
  // ===================================================================
  for (let y = 2; y <= 5; y++) {
    place(5, y, 3, 7);
  }

  const level: Level = {
    name: "Test Level",
    size: new THREE.Vector3(20, 16, 16),
    trileSet,
    triles,
    playerStart: new THREE.Vector3(0.5, 2, 3),
    waterHeight: null,
    skyColor: 0x1a1a2e,
    ambientColor: 0x404060,
  };

  return level;
}
