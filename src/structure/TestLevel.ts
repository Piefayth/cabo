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
 * Ground spans BOTH X and Z so the player has walkable area regardless
 * of camera orientation. Perspective-trick elements (platforms at
 * different depths that align in 2D from one viewpoint) are layered on
 * top of that base.
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
  trileSet.set(8, solidTrile(8, "ice", 0x7fdbff));
  trileSet.set(9, ladderTrile(9, "ladder", 0xd4a017));
  trileSet.set(10, solidTrile(10, "brick", 0x9b3a3a));

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
  // MAIN GROUND — a proper 2D walkable platform in the XZ plane.
  // Spans both axes so the player has space to move regardless of
  // which of the four orthographic views the camera is in.
  // ===================================================================
  const GROUND_X_MIN = -8;
  const GROUND_X_MAX = 12;
  const GROUND_Z_MIN = -2;
  const GROUND_Z_MAX = 10;
  for (let x = GROUND_X_MIN; x <= GROUND_X_MAX; x++) {
    for (let z = GROUND_Z_MIN; z <= GROUND_Z_MAX; z++) {
      place(x, 0, z, 2); // dirt
      place(x, 1, z, 1); // grass
    }
  }

  // ===================================================================
  // STONE WALL — a corner structure visible from two viewpoints.
  //   From Front/Back: it's a wall extending in X at z=0 and z=1
  //   From Right/Left: it's a wall extending in Z at x=-7 and x=-8
  // ===================================================================
  // The wall sits at the back-left corner of the ground.
  for (let y = 2; y <= 5; y++) {
    // Back wall slice (runs along X at z=0..1)
    for (let x = -8; x <= -5; x++) {
      place(x, y, 0, 3);
      place(x, y, 1, 3);
    }
    // Left wall slice (runs along Z at x=-8..-7)
    for (let z = 2; z <= 5; z++) {
      place(-8, y, z, 3);
      place(-7, y, z, 3);
    }
  }

  // ===================================================================
  // FEZ PERSPECTIVE STAIRCASE (from FRONT view)
  //
  // Ascending steps that appear connected from Front view but are at
  // completely different Z depths. Visible as 2D-aligned steps only
  // when the camera is at Front (looking along -Z).
  // ===================================================================
  // Step 1 (lowest) — at z=4 (middle of ground)
  place(3, 4, 4, 4);
  place(4, 4, 4, 4);
  place(5, 4, 4, 4);

  // Step 2 — at z=9 (deeper into the scene)
  place(5, 6, 9, 4);
  place(6, 6, 9, 4);
  place(7, 6, 9, 4);

  // Step 3 — at z=-1 (closer to camera, "in front" of main ground)
  place(7, 8, -1, 5);
  place(8, 8, -1, 5);
  place(9, 8, -1, 5);

  // ===================================================================
  // FEZ PERSPECTIVE STAIRCASE (from RIGHT view)
  //
  // From the Right viewpoint (camera at +X looking -X), the depth axis
  // becomes X. These platforms are at different X positions but align
  // as a 2D staircase when viewed from the right.
  // ===================================================================
  place(10, 3, -1, 4);
  place(10, 3, 0, 4);
  place(10, 3, 1, 4);

  place(4, 5, 3, 4);
  place(4, 5, 4, 4);
  place(4, 5, 5, 4);

  place(-4, 7, 7, 5);
  place(-4, 7, 8, 5);
  place(-4, 7, 9, 5);

  // ===================================================================
  // TopOnly PLATFORMS — can jump up through from below
  // ===================================================================
  place(0, 5, 4, 6);
  place(1, 5, 4, 6);
  place(0, 5, 5, 6);
  place(1, 5, 5, 6);

  // ===================================================================
  // LADDER — climb up from main ground
  // ===================================================================
  for (let y = 2; y <= 6; y++) {
    place(-2, y, 4, 9);
  }
  // Small stone landing at the top of the ladder
  place(-2, 7, 4, 3);
  place(-1, 7, 4, 3);
  place(-2, 7, 3, 3);
  place(-1, 7, 3, 3);

  // ===================================================================
  // ICE PATCH — slippery ground zone (visual cue for future Sliding use)
  // ===================================================================
  place(6, 1, 7, 8, { unsafe: true });
  place(7, 1, 7, 8, { unsafe: true });
  place(6, 1, 8, 8, { unsafe: true });
  place(7, 1, 8, 8, { unsafe: true });

  // ===================================================================
  // BRICK TOWER — structure visible from all sides with its own
  // landing platforms. Deliberately standalone to give vertical
  // interest independent of any specific viewpoint.
  // ===================================================================
  for (let y = 2; y <= 9; y++) {
    place(11, y, 6, 10);
    place(11, y, 7, 10);
    place(12, y, 6, 10);
    place(12, y, 7, 10);
  }

  // ===================================================================
  // FLOATING ISLAND — offset from the main ground
  //   From Front view, it appears adjacent (same screen-X as main)
  //   From Right view, its distance in Z is obvious
  // ===================================================================
  for (let x = 8; x <= 11; x++) {
    for (let z = 13; z <= 15; z++) {
      place(x, 0, z, 2);
      place(x, 1, z, 1);
    }
  }

  // ===================================================================
  // BACKGROUND-LAYER TEST: wall-with-gap
  //
  // A brick wall at z=2 that runs across x=5..8, y=2..5, with a
  // pass-through gap at x=6..7 y=2..3. Ground behind the wall
  // (z=0..1, which is deeper into the scene from Front view) lets the
  // player stand back there.
  //
  // How to exercise the mechanic from Front view:
  //   1. From main ground (z=4..10 area), walk through the gap
  //      (x=6 or 7, through the z=2 wall slice) by dropping down into
  //      z=1 or z=0. You should be rendered MAGENTA (background).
  //   2. Walk out from behind horizontally (to x < 5 or x > 8).
  //      Player should flip back to WHITE (foreground) as soon as no
  //      corner sees a huggable trile (determineInBackgroundLight in
  //      updateInternal).
  //   3. Walk back toward the wall's X range. Because background=false
  //      by the time you overlap the wall's screen-X, the layer query
  //      filter excludes the wall as a collider. You emerge in front
  //      of the wall at your current z, not back behind it.
  // ===================================================================
  for (let y = 2; y <= 5; y++) {
    for (let x = 5; x <= 8; x++) {
      // Skip the gap at x=6..7, y=2..3
      if (x >= 6 && x <= 7 && y <= 3) continue;
      place(x, y, 2, 10);
    }
  }

  const level: Level = {
    name: "Test Level",
    size: new THREE.Vector3(24, 16, 20),
    trileSet,
    triles,
    playerStart: new THREE.Vector3(0.5, 2, 4),
    waterHeight: null,
    skyColor: 0x1a1a2e,
    ambientColor: 0x404060,
  };

  return level;
}
