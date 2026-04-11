import * as THREE from "three";
import { Level, TrileDefinition, TrileInstance, trileKey } from "./Level";

/**
 * Build a test level that demonstrates the FEZ perspective-shifting mechanic.
 *
 * The level contains:
 * - A ground platform
 * - Platforms that only connect when viewed from specific angles
 * - A simple tower structure
 */
export function createTestLevel(): Level {
  const trileSet = new Map<number, TrileDefinition>();

  // Define block types
  trileSet.set(1, { id: 1, name: "grass", color: 0x6ab04c, solid: true });
  trileSet.set(2, { id: 2, name: "dirt", color: 0x8b6914, solid: true });
  trileSet.set(3, { id: 3, name: "stone", color: 0x7f8c8d, solid: true });
  trileSet.set(4, { id: 4, name: "wood", color: 0xb07830, solid: true });
  trileSet.set(5, { id: 5, name: "gold", color: 0xf1c40f, solid: true });

  const triles = new Map<string, TrileInstance>();

  function place(x: number, y: number, z: number, id: number): void {
    triles.set(trileKey(x, y, z), {
      position: new THREE.Vector3(x, y, z),
      trileId: id,
      phi: 0,
    });
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

  // === FEZ TRICK: Disconnected platforms that align in specific viewpoints ===
  // From the FRONT view (looking along +Z), these appear as a staircase:
  // But they're at different Z depths and don't actually connect in 3D.

  // Step 1: visible from front, at z=2
  for (let x = 2; x <= 4; x++) {
    place(x, 3, 2, 4);
  }

  // Step 2: visible from front, at z=5 (different depth!)
  for (let x = 4; x <= 6; x++) {
    place(x, 5, 5, 4);
  }

  // Step 3: visible from front, at z=1 (yet another depth!)
  for (let x = 6; x <= 8; x++) {
    place(x, 7, 1, 5);
  }

  // === RIGHT view staircase (looking along +X) ===
  // These form a path from the right viewpoint
  place(5, 3, 6, 4);
  place(5, 3, 7, 4);
  place(3, 5, 6, 4);
  place(3, 5, 7, 4);
  place(1, 7, 6, 5);
  place(1, 7, 7, 5);

  // === Bridge that only appears connected from FRONT view ===
  // Two pillars at different Z, with blocks between them only at certain Z
  // Pillar A
  for (let y = 2; y <= 5; y++) {
    place(0, y, 0, 3);
  }
  // Pillar B
  for (let y = 2; y <= 5; y++) {
    place(0, y, 5, 3);
  }
  // "Bridge" block in between — from Front view, appears to connect the pillars
  place(0, 5, -1, 5);

  const level: Level = {
    name: "Test Level",
    size: new THREE.Vector3(16, 16, 16),
    trileSet,
    triles,
    backgroundPlanes: [],
    volumes: [],
    playerStart: new THREE.Vector3(2.5, 2, 3),
    waterHeight: null,
    skyColor: 0x1a1a2e,
    ambientColor: 0x404060,
  };

  return level;
}
