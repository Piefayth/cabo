/**
 * Viewpoint enum matching FEZ's Viewpoint.cs
 * Front/Right/Back/Left are the four orthographic views.
 */
export enum Viewpoint {
  None = 0,
  Front = 1, // -Z (looking toward +Z)
  Right = 2, // -X (looking toward +X)
  Back = 3, // +Z (looking toward -Z)
  Left = 4, // +X (looking toward -X)
  Up = 5,
  Down = 6,
  Perspective = 7,
}

export function isOrthographic(v: Viewpoint): boolean {
  return v >= Viewpoint.Front && v <= Viewpoint.Left;
}

/** Get the next viewpoint rotating right (clockwise from above) */
export function rotateRight(v: Viewpoint): Viewpoint {
  switch (v) {
    case Viewpoint.Front:
      return Viewpoint.Right;
    case Viewpoint.Right:
      return Viewpoint.Back;
    case Viewpoint.Back:
      return Viewpoint.Left;
    case Viewpoint.Left:
      return Viewpoint.Front;
    default:
      return v;
  }
}

/** Get the next viewpoint rotating left (counter-clockwise from above) */
export function rotateLeft(v: Viewpoint): Viewpoint {
  switch (v) {
    case Viewpoint.Front:
      return Viewpoint.Left;
    case Viewpoint.Left:
      return Viewpoint.Back;
    case Viewpoint.Back:
      return Viewpoint.Right;
    case Viewpoint.Right:
      return Viewpoint.Front;
    default:
      return v;
  }
}

/**
 * Get the camera forward direction for a viewpoint.
 * This is the direction the camera LOOKS (into the scene).
 */
export function getForwardDirection(v: Viewpoint): [number, number, number] {
  switch (v) {
    case Viewpoint.Front:
      return [0, 0, 1];
    case Viewpoint.Right:
      return [1, 0, 0];
    case Viewpoint.Back:
      return [0, 0, -1];
    case Viewpoint.Left:
      return [-1, 0, 0];
    default:
      return [0, 0, 1];
  }
}

/**
 * Get the "right" vector for a viewpoint (the horizontal screen axis).
 * This determines which 3D axis maps to screen-horizontal.
 */
export function getRightVector(v: Viewpoint): [number, number, number] {
  switch (v) {
    case Viewpoint.Front:
      return [1, 0, 0]; // X is horizontal
    case Viewpoint.Right:
      return [0, 0, -1]; // -Z is horizontal
    case Viewpoint.Back:
      return [-1, 0, 0]; // -X is horizontal
    case Viewpoint.Left:
      return [0, 0, 1]; // Z is horizontal
    default:
      return [1, 0, 0];
  }
}

/**
 * Get the depth axis for a viewpoint (the axis that gets "flattened").
 * Returns the sign and axis index (0=x, 1=y, 2=z).
 */
export function getDepthAxis(
  v: Viewpoint,
): { axis: "x" | "z"; sign: number } {
  switch (v) {
    case Viewpoint.Front:
      return { axis: "z", sign: 1 };
    case Viewpoint.Right:
      return { axis: "x", sign: 1 };
    case Viewpoint.Back:
      return { axis: "z", sign: -1 };
    case Viewpoint.Left:
      return { axis: "x", sign: -1 };
    default:
      return { axis: "z", sign: 1 };
  }
}

/** Get the angle (in radians) around the Y axis for a viewpoint */
export function getViewpointAngle(v: Viewpoint): number {
  switch (v) {
    case Viewpoint.Front:
      return 0;
    case Viewpoint.Right:
      return Math.PI / 2;
    case Viewpoint.Back:
      return Math.PI;
    case Viewpoint.Left:
      return (3 * Math.PI) / 2;
    default:
      return 0;
  }
}

/** Number of 90-degree steps between two viewpoints (1 or 2) */
export function viewpointDistance(from: Viewpoint, to: Viewpoint): number {
  if (!isOrthographic(from) || !isOrthographic(to)) return 1;
  const diff = Math.abs(from - to);
  return diff === 2 ? 2 : 1;
}
