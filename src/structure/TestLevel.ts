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

/**
 * Test level demonstrating the FEZ perspective-shifting mechanic.
 *
 * KEY DESIGN RULE: Ground at any given screen-space position should be
 * at ONE depth only. NearestTrile scans front-to-back and returns the
 * camera-nearest solid block — ground at multiple depths causes the
 * player to depth-clamp unpredictably.
 *
 * The perspective trick uses platforms at DIFFERENT depths that only
 * APPEAR to connect when viewed from a specific angle.
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

  function place(x: number, y: number, z: number, id: number): void {
    const emp: TrileEmplacement = { x, y, z };
    triles.set(emplacementKey(emp), {
      position: new THREE.Vector3(x, y, z),
      emplacement: emp,
      trileId: id,
      phi: 0,
      enabled: true,
      physicsState: null,
      overlappedTriles: [],
      forceSeeThrough: false,
      unsafe: false,
    });
  }

  // ===================================================================
  // MAIN GROUND — single depth z=4
  // A wide platform the player starts on
  // ===================================================================
  for (let x = -5; x <= 5; x++) {
    place(x, 0, 4, 2);
    place(x, 1, 4, 1);
  }

  // ===================================================================
  // WALL — at z=4, same depth as ground. A real wall the player can see.
  // ===================================================================
  for (let y = 2; y <= 5; y++) {
    place(-4, y, 4, 3);
    place(-5, y, 4, 3);
  }

  // ===================================================================
  // FEZ TRICK: PERSPECTIVE STAIRCASE (from FRONT view)
  //
  // From Front view, these appear as ascending steps going right.
  // In 3D, each step is at a completely different z-depth.
  // The player can walk up them because the collision system
  // scans along the depth axis and finds them.
  //
  //   Step 1 (y=3):  x=3..5   at z=4  (same as ground — reachable by walking)
  //   Step 2 (y=5):  x=5..7   at z=8  (different depth!)
  //   Step 3 (y=7):  x=7..9   at z=1  (yet another depth!)
  //
  // From Right/Left/Back views, they're clearly disconnected.
  // ===================================================================

  // Step 1 — at z=4 (same as ground, walk right to reach it)
  for (let x = 3; x <= 5; x++) {
    place(x, 2, 4, 4);
    place(x, 3, 4, 4);
  }

  // Step 2 — at z=8 (different depth! Only connects in Front view)
  for (let x = 5; x <= 7; x++) {
    place(x, 4, 8, 4);
    place(x, 5, 8, 4);
  }

  // Step 3 — at z=1 (yet another depth!)
  for (let x = 7; x <= 9; x++) {
    place(x, 6, 1, 5);
    place(x, 7, 1, 5);
  }

  // ===================================================================
  // RIGHT VIEW PLATFORMS
  // From Right view (camera at +X), these form steps going right.
  // In 3D they're at different x-depths.
  // ===================================================================
  place(6, 3, 6, 4);
  place(6, 3, 7, 4);
  place(2, 5, 6, 4);
  place(2, 5, 7, 4);

  // ===================================================================
  // TopOnly PLATFORMS — jump up through from below, land on top
  // ===================================================================
  place(-1, 4, 4, 6);
  place(0, 4, 4, 6);
  place(-1, 7, 4, 6);
  place(0, 7, 4, 6);

  // ===================================================================
  // FLOATING ISLAND — at z=10, visible from Front view as adjacent
  // to main ground, but actually far away in depth
  // ===================================================================
  for (let x = 7; x <= 10; x++) {
    place(x, 0, 10, 2);
    place(x, 1, 10, 1);
  }
  // Small wall on island
  place(10, 2, 10, 3);
  place(10, 3, 10, 3);

  const level: Level = {
    name: "Test Level",
    size: new THREE.Vector3(20, 16, 16),
    trileSet,
    triles,
    playerStart: new THREE.Vector3(0.5, 2, 4),
    waterHeight: null,
    skyColor: 0x1a1a2e,
    ambientColor: 0x404060,
  };

  return level;
}
