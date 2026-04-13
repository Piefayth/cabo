import * as THREE from "three";
import {
  CollisionType,
  FaceOrientation,
  faceGetOpposite,
  faceIsSide,
} from "../engine/CollisionEnums";
import {
  toPhi,
  orientationFromPhi,
  almostEqual,
  EPSILON,
} from "../engine/FezMath";

/**
 * Trile — the block type definition (template).
 * FezEngine/Structure/Trile.cs
 *
 * Each trile has collision faces per FaceOrientation, a size,
 * and flags for material behavior.
 */
/**
 * Actor types — mirrors FEZ ActorType enum (abbreviated). Determines
 * how a trile participates in gameplay (climbing, bouncing, etc.).
 */
export enum ActorType {
  None = 0,
  Ladder,
  Vine,
  ClimbableNpc,
  Sign,
  Lesser,
  Warp,
  Pickup,
  PickupNoRespawn,
  Door,
  BigDoor,
  CodeMachine,
  Telescope,
  TreasureChest,
  LoveStatue,
  Bomb,
  BombHolder,
  HeavyBomb,
  HeavyBombHolder,
  CrumbleStepOn,
  CrumbleSpawn,
  KillBody,
  BellBoarder,
  PivotBlock,
  Boarder,
  Conveyor,
  ConveyorWest,
  ConveyorEast,
  ConveyorUp,
  ConveyorDown,
}

export interface TrileDefinition {
  id: number;
  name: string;
  color: number;
  /** Collision type per face. All 6 faces defined. */
  faces: Map<FaceOrientation, CollisionType>;
  size: THREE.Vector3; // Usually (1,1,1) for standard triles
  offset: THREE.Vector3; // Center offset within the cell
  immaterial: boolean;
  thin: boolean; // Thin triles are see-through for depth queries
  /** FEZ ActorSettings.Type — determines gameplay interaction */
  actorType: ActorType;
}

/**
 * TrileInstance — a placed trile in the level grid.
 * FezEngine/Structure/TrileInstance.cs
 */
export interface TrileInstance {
  position: THREE.Vector3; // Bottom-corner world position
  emplacement: TrileEmplacement; // Integer grid coordinates
  trileId: number;
  phi: number; // Y-axis rotation (0, PI/2, -PI, -PI/2)
  enabled: boolean;
  /** Optional physics state for moving triles */
  physicsState: InstancePhysicsState | null;
  /** Other triles sharing this grid cell */
  overlappedTriles: TrileInstance[];
  forceSeeThrough: boolean;
  unsafe: boolean;
}

/**
 * TrileEmplacement — integer grid coordinates.
 * FezEngine/Structure/TrileEmplacement.cs
 */
export interface TrileEmplacement {
  x: number;
  y: number;
  z: number;
}

export function emplacementKey(e: TrileEmplacement): string {
  return `${e.x},${e.y},${e.z}`;
}

export function emplacementFromPosition(pos: THREE.Vector3): TrileEmplacement {
  return {
    x: Math.floor(pos.x),
    y: Math.floor(pos.y),
    z: Math.floor(pos.z),
  };
}

export function emplacementToVector(e: TrileEmplacement): THREE.Vector3 {
  return new THREE.Vector3(e.x, e.y, e.z);
}

export function emplacementOffset(
  e: TrileEmplacement,
  dx: number,
  dy: number,
  dz: number,
): TrileEmplacement {
  return { x: e.x + dx, y: e.y + dy, z: e.z + dz };
}

export function traverseInto(
  e: TrileEmplacement,
  face: FaceOrientation,
): TrileEmplacement {
  switch (face) {
    case FaceOrientation.Left:
      return { x: e.x - 1, y: e.y, z: e.z };
    case FaceOrientation.Right:
      return { x: e.x + 1, y: e.y, z: e.z };
    case FaceOrientation.Down:
      return { x: e.x, y: e.y - 1, z: e.z };
    case FaceOrientation.Top:
      return { x: e.x, y: e.y + 1, z: e.z };
    case FaceOrientation.Back:
      return { x: e.x, y: e.y, z: e.z - 1 };
    case FaceOrientation.Front:
      return { x: e.x, y: e.y, z: e.z + 1 };
  }
}

/**
 * InstancePhysicsState — for triles that can move.
 * FezEngine/Structure/InstancePhysicsState.cs
 */
export interface InstancePhysicsState {
  velocity: THREE.Vector3;
  groundMovement: THREE.Vector3;
  center: THREE.Vector3;
  sticky: boolean;
  updatingPhysics: boolean;
  vanished: boolean;
  ignoreCollision: boolean;
  background: boolean;
  forceNonStatic: boolean;
}

// --- TrileInstance computed properties ---

/**
 * Get the transformed size of a trile instance, accounting for phi rotation.
 * If rotated 90 or 270 degrees, X and Z are swapped.
 */
export function getTransformedSize(
  instance: TrileInstance,
  def: TrileDefinition,
): THREE.Vector3 {
  const ori = orientationFromPhi(instance.phi);
  if (ori === FaceOrientation.Left || ori === FaceOrientation.Right) {
    return new THREE.Vector3(def.size.z, def.size.y, def.size.x);
  }
  return def.size.clone();
}

/**
 * Get the center of a trile instance in world space.
 * center = Transform(offset, phiQuat) / 2 + (0.5, 0.5, 0.5) + position
 */
export function getTrileCenter(
  instance: TrileInstance,
  def: TrileDefinition,
): THREE.Vector3 {
  const q = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    instance.phi,
  );
  const offset = def.offset.clone().applyQuaternion(q).multiplyScalar(0.5);
  return offset
    .add(new THREE.Vector3(0.5, 0.5, 0.5))
    .add(instance.position);
}

/**
 * GetRotatedFace — get the collision type for a face, accounting for trile rotation.
 * Converts the query face into the trile's local space by subtracting Phi.
 *
 * SPECIAL: TopOnly faces are downgraded to None if there's a solid trile
 * directly above with a face covering this side.
 *
 * FezEngine/Structure/TrileInstance.cs — GetRotatedFace()
 *
 * @param queryFace The world-space face to query
 * @param instance The trile instance
 * @param def The trile definition
 * @param levelTriles All triles in the level (for above-check)
 * @param levelTrileSet All trile definitions (for above-check)
 */
export function getRotatedFace(
  queryFace: FaceOrientation,
  instance: TrileInstance,
  def: TrileDefinition,
  levelTriles?: Map<string, TrileInstance>,
  levelTrileSet?: Map<number, TrileDefinition>,
): CollisionType {
  if (!faceIsSide(queryFace)) {
    // Top/Down faces are not rotated by phi (phi is Y-axis only)
    return def.faces.get(queryFace) ?? CollisionType.None;
  }

  // Convert query face to local space by subtracting phi
  const worldPhi = toPhi(queryFace);
  const localPhi = worldPhi - instance.phi;
  const localFace = orientationFromPhi(localPhi);
  const ct = def.faces.get(localFace) ?? CollisionType.None;

  // TopOnly downgrade: if there's a solid block above with matching face
  if (
    ct === CollisionType.TopOnly &&
    levelTriles &&
    levelTrileSet
  ) {
    const above = emplacementOffset(instance.emplacement, 0, 1, 0);
    const aboveKey = emplacementKey(above);
    const aboveInstance = levelTriles.get(aboveKey);
    if (aboveInstance && aboveInstance.enabled) {
      const aboveDef = levelTrileSet.get(aboveInstance.trileId);
      if (
        aboveDef &&
        !aboveDef.immaterial &&
        !aboveDef.thin
      ) {
        const aboveFace =
          aboveDef.faces.get(localFace) ?? CollisionType.None;
        if (aboveFace !== CollisionType.None && aboveFace !== CollisionType.Immaterial) {
          // Check centers are aligned on the query axis
          const instCenter = getTrileCenter(instance, def);
          const aboveCenter = getTrileCenter(aboveInstance, aboveDef);
          const axis = queryFace === FaceOrientation.Left || queryFace === FaceOrientation.Right
            ? "x" : "z";
          if (almostEqual(instCenter[axis], aboveCenter[axis])) {
            return CollisionType.None; // Downgrade
          }
        }
      }
    }
  }

  return ct;
}

// --- Trile definition helpers ---

/** Create a standard solid trile with AllSides on all faces */
export function solidTrile(
  id: number,
  name: string,
  color: number,
  actorType: ActorType = ActorType.None,
): TrileDefinition {
  const faces = new Map<FaceOrientation, CollisionType>();
  faces.set(FaceOrientation.Left, CollisionType.AllSides);
  faces.set(FaceOrientation.Right, CollisionType.AllSides);
  faces.set(FaceOrientation.Top, CollisionType.AllSides);
  faces.set(FaceOrientation.Down, CollisionType.AllSides);
  faces.set(FaceOrientation.Front, CollisionType.AllSides);
  faces.set(FaceOrientation.Back, CollisionType.AllSides);
  return {
    id, name, color, faces,
    size: new THREE.Vector3(1, 1, 1),
    offset: new THREE.Vector3(0, 0, 0),
    immaterial: false,
    thin: false,
    actorType,
  };
}

/** Create a platform trile — TopOnly on top, None on sides */
export function platformTrile(
  id: number,
  name: string,
  color: number,
): TrileDefinition {
  const faces = new Map<FaceOrientation, CollisionType>();
  faces.set(FaceOrientation.Left, CollisionType.None);
  faces.set(FaceOrientation.Right, CollisionType.None);
  faces.set(FaceOrientation.Top, CollisionType.TopOnly);
  faces.set(FaceOrientation.Down, CollisionType.None);
  faces.set(FaceOrientation.Front, CollisionType.TopOnly);
  faces.set(FaceOrientation.Back, CollisionType.TopOnly);
  return {
    id, name, color, faces,
    size: new THREE.Vector3(1, 1, 1),
    offset: new THREE.Vector3(0, 0, 0),
    immaterial: false,
    thin: true,
    actorType: ActorType.None,
  };
}

/** Create an immaterial (pass-through) trile — for decoration */
export function immaterialTrile(
  id: number,
  name: string,
  color: number,
  actorType: ActorType = ActorType.None,
): TrileDefinition {
  const faces = new Map<FaceOrientation, CollisionType>();
  for (let f = 0; f <= 5; f++) {
    faces.set(f as FaceOrientation, CollisionType.Immaterial);
  }
  return {
    id, name, color, faces,
    size: new THREE.Vector3(1, 1, 1),
    offset: new THREE.Vector3(0, 0, 0),
    immaterial: true,
    thin: false,
    actorType,
  };
}

/** Create a ladder trile — immaterial but with ActorType.Ladder */
export function ladderTrile(
  id: number,
  name: string,
  color: number,
): TrileDefinition {
  return immaterialTrile(id, name, color, ActorType.Ladder);
}
