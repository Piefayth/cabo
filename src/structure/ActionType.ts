/**
 * ActionType — enumeration of every player action state.
 *
 * Mirrors FEZ/Structure/ActionType.cs. Entries at the top reflect FEZ's
 * actual numeric ordering for near-term compatibility with any
 * FEZ-serialized data; entries below that are grouped by theme and do
 * NOT match FEZ's numeric indices. If we later load FEZ save/animation
 * data we'll need a translation table.
 */
export enum ActionType {
  None = 0,

  // FEZ-ordered prefix (matches FezGame.Structure.ActionType indices)
  Idle,
  LookingLeft,
  LookingRight,
  LookingUp,
  LookingDown,
  Walking,
  Running,
  Jumping,
  FrontClimbingLadder,
  BackClimbingLadder,
  SideClimbingLadder,

  // Idle cosmetic variants (not in FEZ's prefix order; cosmetic only)
  IdleSleep,
  IdleLookAround,
  IdleYawn,
  IdlePlay,
  Teetering,

  // Locomotion (the rest)
  RunTurnAround,
  Falling,
  Landing,
  FreeFalling,
  Sliding,
  DropDown,

  // Climbing / ledges
  Grabbing,
  Pushing,
  PushingPivot,
  GrabCornerLedge,
  GrabLedgeFront,
  GrabLedgeBack,
  PullUpCornerLedge,
  PullUpFront,
  PullUpBack,
  LowerToCornerLedge,
  LowerToLedge,
  ShimmyFront,
  ShimmyBack,
  ClimbingVine,
  IdleToClimb,
  FrontClimbToIdle,
  SideClimbToIdle,
  JumpToClimb,
  JumpToSideClimb,

  // Water
  Swimming,
  HurtSwim,
  Treading,
  FlyingThroughPipe,
  EnteringPipe,
  EnteringTunnel,
  Sinking,
  Drowning,

  // Carrying
  Lifting,
  CarryIdle,
  CarryWalk,
  CarryJump,
  CarrySlide,
  CarryEnter,
  CarryHeavyIdle,
  CarryHeavyWalk,
  CarryHeavyJump,
  CarryHeavySlide,
  CarryHeavyEnter,
  Throwing,
  ThrowingHeavy,
  DropTrile,
  DropHeavyTrile,

  // Corner transitions
  GateWarp,
  LesserWarp,
  CornerTransitionFront,
  CornerTransitionBack,
  FromCornerBack,

  // Doors / signs
  EnteringDoor,
  EnteringDoorSpin,
  EnteringDoorCarry,
  EnteringDoorHeavy,
  ExitDoor,
  ExitDoorCarry,
  ExitDoorHeavy,
  OpeningDoor,
  OpeningTreasure,
  FindingTreasure,
  CollectingFez,
  ReadingSign,
  ReadTurnAround,
  EndReadTurnAround,

  // Tombstones
  GrabTombstone,
  PivotTombstone,
  LetGoOfTombstone,

  // Bells
  TurnToBell,
  HitBell,
  TurnAwayFromBell,

  // Drums
  Drums1, Drums2, Drums3, Drums4, Drums5, Drums6, Drums7,

  // Death / damage
  Dying,
  Suffering,
  GlitchDeath,
  Frozen,
  CrushHorizontal,
  CrushVertical,

  // Misc / cutscene
  SleepWake,
  WakingUp,
  WakeUp,
  Victory,
  VictoryForever,
  StandWinking,
  Sleeping,
  Boarding,
  SuckedIn,
  JetpackJumping,
  JetpackFalling,
  Bouncing,
  SpinAction,
  Flying,
  WalkingTo,

  // Floating (rotation handle / internal)
  Floating,
  Standing,
}

/**
 * Whether an action is a "walk-like" locomotion action.
 * Used by WalkRun.TestConditions to decide walk/run transitions.
 */
export function isIdleLike(a: ActionType): boolean {
  return (
    a === ActionType.Idle ||
    a === ActionType.IdleSleep ||
    a === ActionType.IdleLookAround ||
    a === ActionType.IdleYawn ||
    a === ActionType.IdlePlay ||
    a === ActionType.LookingLeft ||
    a === ActionType.LookingRight ||
    a === ActionType.LookingUp ||
    a === ActionType.LookingDown ||
    a === ActionType.Teetering ||
    a === ActionType.Sliding ||
    a === ActionType.Grabbing ||
    a === ActionType.Pushing
  );
}

export function isAirborne(a: ActionType): boolean {
  return (
    a === ActionType.Jumping ||
    a === ActionType.Falling ||
    a === ActionType.FreeFalling ||
    a === ActionType.Landing
  );
}
