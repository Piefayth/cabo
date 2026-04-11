/**
 * Collision-related enums matching FEZ's original C# enums exactly.
 */

/** FezEngine/CollisionType.cs */
export enum CollisionType {
  AllSides = 0,
  TopOnly = 1,
  None = 2,
  Immaterial = 3,
  TopNoStraightLedge = 4,
}

/** FezEngine/FaceOrientation.cs - Opposites are offset by 3 */
export enum FaceOrientation {
  Left = 0,
  Down = 1,
  Back = 2,
  Right = 3,
  Top = 4,
  Front = 5,
}

/** FezEngine/Axis.cs */
export enum Axis {
  X = 0,
  Y = 1,
  Z = 2,
}

/** FezEngine/Direction2D.cs */
export enum Direction2D {
  Horizontal = 0,
  Vertical = 1,
}

/** FezEngine/HorizontalDirection.cs */
export enum HorizontalDirection {
  None = 0,
  Left = 1,
  Right = 2,
}

/** FezEngine/VerticalDirection.cs */
export enum VerticalDirection {
  Up = 0,
  Down = 1,
}

/** FezEngine/Services/QueryOptions.cs - Flags enum */
export enum QueryOptions {
  None = 0,
  Background = 1,
  Simple = 2,
}

/** Internal query result for NearestTrile material filtering */
export enum QueryResult {
  Nothing = 0,
  Thin = 1,
  Full = 2,
}

// --- Face orientation helpers ---

export function faceGetOpposite(face: FaceOrientation): FaceOrientation {
  return ((face + 3) % 6) as FaceOrientation;
}

export function faceIsPositive(face: FaceOrientation): boolean {
  return face > FaceOrientation.Back; // Right, Top, Front
}

export function faceIsSide(face: FaceOrientation): boolean {
  return face !== FaceOrientation.Down && face !== FaceOrientation.Top;
}

export function faceAsAxis(face: FaceOrientation): Axis {
  switch (face) {
    case FaceOrientation.Left:
    case FaceOrientation.Right:
      return Axis.X;
    case FaceOrientation.Back:
    case FaceOrientation.Front:
      return Axis.Z;
    default:
      return Axis.Y;
  }
}

export function faceAsVector(face: FaceOrientation): [number, number, number] {
  switch (face) {
    case FaceOrientation.Left:
      return [-1, 0, 0];
    case FaceOrientation.Down:
      return [0, -1, 0];
    case FaceOrientation.Back:
      return [0, 0, -1]; // XNA Forward
    case FaceOrientation.Right:
      return [1, 0, 0];
    case FaceOrientation.Top:
      return [0, 1, 0];
    case FaceOrientation.Front:
      return [0, 0, 1]; // XNA Backward
    default:
      return [0, 0, 0];
  }
}

// --- Horizontal direction helpers ---

export function horizontalGetOpposite(
  dir: HorizontalDirection,
): HorizontalDirection {
  if (dir === HorizontalDirection.Left) return HorizontalDirection.Right;
  if (dir === HorizontalDirection.Right) return HorizontalDirection.Left;
  return HorizontalDirection.None;
}

export function horizontalSign(dir: HorizontalDirection): number {
  return dir === HorizontalDirection.Right ? 1 : -1;
}

export function directionFromMovement(x: number): HorizontalDirection {
  if (x > 0) return HorizontalDirection.Right;
  if (x < 0) return HorizontalDirection.Left;
  return HorizontalDirection.None;
}
