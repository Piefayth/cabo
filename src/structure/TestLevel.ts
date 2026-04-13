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
  ladderTrile,
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
  // Ice — slippery ground. `unsafe` isn't the right FEZ concept but is
  // what we have to flag a trile as slippery for the Slide action.
  trileSet.set(8, solidTrile(8, "ice", 0x7fdbff));
  trileSet.set(9, ladderTrile(9, "ladder", 0xd4a017));

  const triles = new Map<string, TrileInstance>();

  function place(
    x: number,
    y: number,
    z: number,
    id: number,
    opts: { unsafe?: boolean } = {},
  ): void {
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
      unsafe: opts.unsafe ?? false,
    });
  }

  // ===================================================================
  // MAIN GROUND — single depth z=4, wider than before so there's
  // plenty of open space to move around in.
  // ===================================================================
  for (let x = -10; x <= 14; x++) {
    place(x, 0, 4, 2);
    place(x, 1, 4, 1);
  }

  // ===================================================================
  // WALL — at z=4, same depth as ground. A real wall the player can see.
  // Moved further left so it's not hugging the start position.
  // ===================================================================
  for (let y = 2; y <= 5; y++) {
    place(-9, y, 4, 3);
    place(-10, y, 4, 3);
  }

  // ===================================================================
  // FEZ TRICK: PERSPECTIVE STAIRCASE (from FRONT view)
  //
  // From Front view, these appear as ascending steps going right.
  // In 3D, each step is at a completely different z-depth.
  //
  // CRITICAL: steps are placed at y ≥ 4 so they're ABOVE the player's
  // head while walking (player head at y=2.9375). Walking under them
  // is fine; to reach them the player jumps up onto the lowest one.
  // ===================================================================

  // Step 1 — at z=4 (same as ground), y=4 (above head, reachable by jump)
  for (let x = 3; x <= 5; x++) {
    place(x, 4, 4, 4);
  }

  // Step 2 — at z=8 (different depth!)
  for (let x = 5; x <= 7; x++) {
    place(x, 6, 8, 4);
  }

  // Step 3 — at z=1 (yet another depth!)
  for (let x = 7; x <= 9; x++) {
    place(x, 8, 1, 5);
  }

  // ===================================================================
  // RIGHT VIEW PLATFORMS
  // From Right view (camera at +X), these form steps going right.
  // In 3D they're at different x-depths.
  // ===================================================================
  place(6, 5, 6, 4);
  place(6, 5, 7, 4);
  place(2, 7, 6, 4);
  place(2, 7, 7, 4);

  // ===================================================================
  // TopOnly PLATFORMS — jump up through from below, land on top
  // ===================================================================
  place(-1, 5, 4, 6);
  place(0, 5, 4, 6);
  place(-1, 9, 4, 6);
  place(0, 9, 4, 6);

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

  // ===================================================================
  // ICE PATCH — slippery ground at x=3..5 on main platform
  // Triggers the Slide action; horizontal momentum carries you across.
  // ===================================================================
  // Overwrites the grass at those positions with ice marked unsafe.
  place(3, 1, 4, 8, { unsafe: true });
  place(4, 1, 4, 8, { unsafe: true });
  place(5, 1, 4, 8, { unsafe: true });

  // ===================================================================
  // LADDER — climb up from main ground at x=-2
  // ===================================================================
  for (let y = 2; y <= 6; y++) {
    place(-2, y, 4, 9);
  }
  // Small landing at the top of the ladder
  place(-2, 7, 4, 3);
  place(-1, 7, 4, 3);

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
