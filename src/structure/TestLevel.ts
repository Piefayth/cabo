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
  fezGroundTrile,
  fezInteriorTrile,
} from "./Trile";

/**
 * Test level following FEZ's actual trile-face convention:
 *
 *   Top layer of a ground stack = TopOnly on Top face, None elsewhere.
 *   Interior layers of a ground stack = None on every face.
 *
 * This makes most level geometry HUGGABLE (None ≠ AllSides), so the
 * background/foreground layer mechanic applies naturally everywhere.
 * AllSides is reserved for genuinely blocking obstacles.
 */
export function createTestLevel(): Level {
  const trileSet = new Map<number, TrileDefinition>();

  // Visual-only ground/interior triles — huggable per FEZ convention.
  trileSet.set(1, fezGroundTrile(1, "grass", 0x6ab04c)); // top layer
  trileSet.set(2, fezInteriorTrile(2, "dirt", 0x8b6914)); // below top
  trileSet.set(3, fezGroundTrile(3, "stone", 0x7f8c8d));
  trileSet.set(4, fezGroundTrile(4, "wood", 0xb07830));
  trileSet.set(5, fezGroundTrile(5, "gold", 0xf1c40f));

  // Hard obstacles — AllSides, not huggable, block horizontal motion.
  trileSet.set(10, solidTrile(10, "brick", 0x9b3a3a));

  // Thin platforms / decorations / gameplay triles.
  trileSet.set(6, platformTrile(6, "platform", 0xc0392b));
  trileSet.set(7, immaterialTrile(7, "decoration", 0x9b59b6));
  trileSet.set(8, fezGroundTrile(8, "ice", 0x7fdbff));
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
  // MAIN GROUND — 2D walkable platform in XZ.
  // Top layer (y=1) is grass (fezGroundTrile). Body (y=0) is dirt
  // (fezInteriorTrile — no collision faces, purely visual).
  // ===================================================================
  const GX_MIN = -8, GX_MAX = 12, GZ_MIN = -2, GZ_MAX = 10;
  for (let x = GX_MIN; x <= GX_MAX; x++) {
    for (let z = GZ_MIN; z <= GZ_MAX; z++) {
      place(x, 0, z, 2); // dirt interior
      place(x, 1, z, 1); // grass top
    }
  }

  // ===================================================================
  // PERSPECTIVE STAIRCASE (Front view) — single top-layer triles at
  // different Z depths that align as a 2D staircase only from Front.
  // ===================================================================
  place(3, 4, 4, 3); place(4, 4, 4, 3); place(5, 4, 4, 3);
  place(5, 6, 9, 3); place(6, 6, 9, 3); place(7, 6, 9, 3);
  place(7, 8, 1, 5); place(8, 8, 1, 5); place(9, 8, 1, 5);

  // ===================================================================
  // PERSPECTIVE STAIRCASE (Right view) — steps at different X depths
  // that align only from the Right viewpoint.
  // ===================================================================
  place(10, 3, -1, 4); place(10, 3, 0, 4); place(10, 3, 1, 4);
  place(4, 5, 3, 4);   place(4, 5, 4, 4);  place(4, 5, 5, 4);
  place(-4, 7, 7, 5);  place(-4, 7, 8, 5); place(-4, 7, 9, 5);

  // ===================================================================
  // TopOnly PLATFORMS — jump up through from below.
  // ===================================================================
  place(0, 5, 4, 6); place(1, 5, 4, 6);
  place(0, 5, 5, 6); place(1, 5, 5, 6);

  // ===================================================================
  // LADDER + landing.
  // ===================================================================
  for (let y = 2; y <= 6; y++) place(-2, y, 4, 9);
  place(-2, 7, 4, 3); place(-1, 7, 4, 3);
  place(-2, 7, 3, 3); place(-1, 7, 3, 3);

  // ===================================================================
  // ICE PATCH — visual marker for future Sliding work.
  // ===================================================================
  place(6, 1, 7, 8, { unsafe: true });
  place(7, 1, 7, 8, { unsafe: true });
  place(6, 1, 8, 8, { unsafe: true });
  place(7, 1, 8, 8, { unsafe: true });

  // ===================================================================
  // BRICK TOWER — genuine AllSides obstacle, blocks horizontal motion.
  // Contrast point against the huggable ground geometry.
  // ===================================================================
  for (let y = 2; y <= 9; y++) {
    place(11, y, 6, 10); place(11, y, 7, 10);
    place(12, y, 6, 10); place(12, y, 7, 10);
  }

  // ===================================================================
  // FLOATING ISLAND — demonstrates depth offset between views.
  // ===================================================================
  for (let x = 8; x <= 11; x++) {
    for (let z = 13; z <= 15; z++) {
      place(x, 0, z, 2);
      place(x, 1, z, 1);
    }
  }

  // ===================================================================
  // BACKGROUND-LAYER DEMO — TWO PILLARS for side-by-side testing.
  //
  // BRICK PILLAR (AllSides) at z=2, x=5..8, y=2..5, gap at (x=6..7, y=2..3).
  //   Horizontal collision blocks (AllSides). Huggable under the new
  //   rule so approaching it also snaps your depth to its camera face.
  //   Expect: you cannot walk through, and as you approach your Z
  //   snaps to the pillar's near face (z=2.5 in Front view).
  //
  // STONE PILLAR (TopOnly, fezGroundTrile) at z=6, x=-6..-3, y=2..5,
  // gap at (x=-5..-4, y=2..3).
  //   Horizontal collision does NOT block (TopOnly only blocks from
  //   above). Still huggable (not AllSides) so the depth snap fires.
  //   Expect: you CAN walk through the pillar's screen-X range, but
  //   your Z snaps to its near face while you do. No tunneling in
  //   the depth sense — just horizontal passage.
  //
  // Having both side-by-side isolates whether the depth-snap + layer
  // mechanic works independently of the horizontal-block.
  // ===================================================================

  // Brick pillar (AllSides, blocks)
  for (let y = 2; y <= 5; y++) {
    for (let x = 5; x <= 8; x++) {
      if (x >= 6 && x <= 7 && y <= 3) continue; // door gap
      place(x, y, 2, 10); // brick
    }
  }

  // Stone pillar (TopOnly, doesn't block horizontal but huggable)
  for (let y = 2; y <= 5; y++) {
    for (let x = -6; x <= -3; x++) {
      if (x >= -5 && x <= -4 && y <= 3) continue; // door gap
      place(x, y, 6, 3); // stone, fezGroundTrile
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
