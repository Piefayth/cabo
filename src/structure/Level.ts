import * as THREE from "three";
import {
  TrileDefinition,
  TrileInstance,
  TrileEmplacement,
  emplacementKey,
  emplacementFromPosition,
} from "./Trile";

/**
 * Level — the level data structure.
 * FezEngine/Structure/Level.cs
 *
 * Contains the trile grid, art objects, volumes, and metadata.
 */
export interface Level {
  name: string;
  size: THREE.Vector3;
  trileSet: Map<number, TrileDefinition>;
  triles: Map<string, TrileInstance>; // key = emplacementKey
  playerStart: THREE.Vector3;
  waterHeight: number | null;
  skyColor: number;
  ambientColor: number;
}

/** Look up a trile at integer grid coordinates */
export function getTrileAt(
  level: Level,
  x: number,
  y: number,
  z: number,
): TrileInstance | undefined {
  return level.triles.get(emplacementKey({ x, y, z }));
}

/** Look up the definition for a trile instance */
export function getTrileDefinition(
  level: Level,
  instance: TrileInstance,
): TrileDefinition | undefined {
  return level.trileSet.get(instance.trileId);
}
