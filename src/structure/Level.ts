import * as THREE from "three";

/**
 * A Trile is a block type definition — the template.
 * In FEZ these come from TrileSets (texture atlas + geometry).
 * For now we use simple unit cubes with colors.
 */
export interface TrileDefinition {
  id: number;
  name: string;
  color: number; // hex color
  solid: boolean;
  climbable?: boolean;
}

/**
 * A placed trile in the level grid.
 * TrileEmplacement in FEZ is integer coordinates.
 */
export interface TrileInstance {
  position: THREE.Vector3; // integer grid position
  trileId: number;
  phi: number; // Y-axis rotation in 90-degree increments (0, PI/2, PI, 3PI/2)
}

/**
 * A background plane — 2D sprite in 3D space.
 */
export interface BackgroundPlane {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  size: { width: number; height: number };
  color: number;
}

/**
 * A trigger volume in the level.
 */
export interface Volume {
  id: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  onEnter?: () => void;
  onExit?: () => void;
}

/**
 * The Level data structure, matching FEZ's Level.cs
 */
export interface Level {
  name: string;
  size: THREE.Vector3;
  trileSet: Map<number, TrileDefinition>;
  triles: Map<string, TrileInstance>; // key = "x,y,z"
  backgroundPlanes: BackgroundPlane[];
  volumes: Volume[];
  playerStart: THREE.Vector3;
  waterHeight: number | null;
  skyColor: number;
  ambientColor: number;
}

/** Create a trile map key from grid coordinates */
export function trileKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Look up a trile at integer grid coordinates */
export function getTrileAt(level: Level, x: number, y: number, z: number): TrileInstance | undefined {
  return level.triles.get(trileKey(x, y, z));
}

/** Look up the definition for a trile instance */
export function getTrileDefinition(level: Level, instance: TrileInstance): TrileDefinition | undefined {
  return level.trileSet.get(instance.trileId);
}
