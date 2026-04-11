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
 * Build a test level that demonstrates FEZ's perspective-shifting mechanic
 * using the faithful collision system with per-face collision types.
 */
export function createTestLevel(): Level {
  const trileSet = new Map<number, TrileDefinition>();

  // Define block types with proper face-based collision
  trileSet.set(1, solidTrile(1, "grass", 0x6ab04c));
  trileSet.set(2, solidTrile(2, "dirt", 0x8b6914));
  trileSet.set(3, solidTrile(3, "stone", 0x7f8c8d));
  trileSet.set(4, solidTrile(4, "wood", 0xb07830));
  trileSet.set(5, solidTrile(5, "gold", 0xf1c40f));
  trileSet.set(6, platformTrile(6, "platform", 0xc0392b)); // TopOnly platform
  trileSet.set(7, immaterialTrile(7, "decoration", 0x9b59b6)); // Pass-through

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

  // === Ground floor platform (wide, centered) ===
  for (let x = -3; x <= 8; x++) {
    for (let z = -3; z <= 8; z++) {
      place(x, 0, z, 2); // dirt base
      place(x, 1, z, 1); // grass top
    }
  }

  // === Tower (left side) ===
  for (let y = 2; y <= 8; y++) {
    place(-2, y, 2, 3);
    place(-2, y, 3, 3);
    place(-3, y, 2, 3);
    place(-3, y, 3, 3);
  }
  // Tower top platform
  for (let x = -4; x <= 0; x++) {
    for (let z = 1; z <= 4; z++) {
      place(x, 9, z, 3);
    }
  }

  // === FEZ TRICK: Disconnected platforms that align from FRONT view ===
  // From the FRONT view (looking along -Z), these appear as a staircase.
  // They're at different Z depths and don't connect in 3D.

  // Step 1: at z=2
  for (let x = 2; x <= 4; x++) {
    place(x, 3, 2, 4);
  }

  // Step 2: at z=5 (different depth!)
  for (let x = 4; x <= 6; x++) {
    place(x, 5, 5, 4);
  }

  // Step 3: at z=1 (yet another depth!)
  for (let x = 6; x <= 8; x++) {
    place(x, 7, 1, 5);
  }

  // === RIGHT view staircase (looking along -X) ===
  place(5, 3, 6, 4);
  place(5, 3, 7, 4);
  place(3, 5, 6, 4);
  place(3, 5, 7, 4);
  place(1, 7, 6, 5);
  place(1, 7, 7, 5);

  // === TopOnly platforms — can jump through from below ===
  place(2, 4, 3, 6);
  place(3, 4, 3, 6);
  place(4, 6, 3, 6);
  place(5, 6, 3, 6);

  // === Decorative immaterial triles ===
  place(0, 3, 0, 7);
  place(1, 3, 0, 7);

  // === Bridge that only appears connected from FRONT view ===
  for (let y = 2; y <= 5; y++) {
    place(0, y, 0, 3);
  }
  for (let y = 2; y <= 5; y++) {
    place(0, y, 5, 3);
  }
  place(0, 5, -1, 5);

  const level: Level = {
    name: "Test Level",
    size: new THREE.Vector3(16, 16, 16),
    trileSet,
    triles,
    playerStart: new THREE.Vector3(2.5, 2, 3),
    waterHeight: null,
    skyColor: 0x1a1a2e,
    ambientColor: 0x404060,
  };

  return level;
}
