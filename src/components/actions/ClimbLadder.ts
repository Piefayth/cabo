import { PlayerAction } from "./PlayerAction";
import { PlayerContext } from "./PlayerContext";
import { ActionType } from "../../structure/ActionType";
import { ActorType, TrileInstance } from "../../structure/Trile";
import { VerticalDirection } from "../../engine/CollisionEnums";

/**
 * ClimbLadder — ladder climbing.
 *
 * Ported (partially) from FEZ/Components/Actions/ClimbLadder.cs.
 * FEZ constants (from MovementHelper-style invocation):
 *   ClimbingSpeed = 0.425 (base acceleration-shape value, matches
 *                          WalkAcceleration family; multiplied by
 *                          TrileSize=0.15 and dt to form per-tick Y)
 *
 * FEZ distinguishes Front/Back/SideClimbingLadder by comparing the
 * ladder face's ActorFace vs. camera viewpoint. We simplify to
 * FrontClimbingLadder for now — the approach-rotation logic that
 * reacts to ViewpointChanged is not yet ported.
 *
 * Re-grab lockout (FEZ `lastGrabbed`): 0.75s after releasing a ladder
 * the player cannot grab the same or another ladder.
 *
 * Detection: FEZ iterates PlayerManager.AxisCollision for ladder
 * triles rather than using a single NearestTrile at center. This
 * matches the player hitbox better at grab moments.
 */
const CLIMBING_SPEED = 0.425;
const TRILE_SIZE = 0.15;
const REGRAB_LOCKOUT = 0.75; // seconds

export class ClimbLadder extends PlayerAction {
  private sinceReleased = Infinity;

  isActionAllowed(action: ActionType): boolean {
    return (
      action === ActionType.FrontClimbingLadder ||
      action === ActionType.BackClimbingLadder ||
      action === ActionType.SideClimbingLadder
    );
  }

  /**
   * Probe axisCollision for a ladder trile. FEZ iterates both Up and
   * Down axis collision results; Surface takes precedence.
   */
  private findLadderInAxis(ctx: PlayerContext): TrileInstance | null {
    const axis = ctx.entity.axisCollision;
    for (const dir of [VerticalDirection.Up, VerticalDirection.Down]) {
      const nt = axis.get(dir);
      if (!nt) continue;
      for (const t of [nt.surface, nt.deep]) {
        if (!t) continue;
        const def = ctx.levelManager.trileSet.get(t.trileId);
        if (def?.actorType === ActorType.Ladder) return t;
      }
    }
    return null;
  }

  testConditions(ctx: PlayerContext): void {
    if (this.sinceReleased !== Infinity) {
      this.sinceReleased += 1 / 60; // approximate; actual dt threaded through act
    }
    if (this.sinceReleased < REGRAB_LOCKOUT) return;

    const cur = ctx.action;
    if (this.isActionAllowed(cur)) return;

    const enterable =
      cur === ActionType.Idle ||
      cur === ActionType.Walking ||
      cur === ActionType.Running ||
      cur === ActionType.Jumping ||
      cur === ActionType.Falling;
    if (!enterable) return;

    // FEZ accepts Up-pressed/held for forward entry. (Side-press for
    // SideClimbingLadder approaches not yet supported.)
    const pressingUp = ctx.input.state.movement.y > 0.5;
    if (!pressingUp) return;

    const ladder = this.findLadderInAxis(ctx);
    if (!ladder) return;

    ctx.action = ActionType.FrontClimbingLadder;
    ctx.entity.heldInstance = ladder;
    ctx.entity.climbing = true;
    ctx.entity.velocity.set(0, 0, 0);
  }

  begin(ctx: PlayerContext): void {
    // FEZ snaps XZ position to ladder trile center + HalfVector. We
    // approximate by zeroing horizontal velocity (position snap would
    // cause visual jitter without animation infrastructure).
    ctx.entity.velocity.set(0, 0, 0);
    ctx.entity.climbing = true;
  }

  act(ctx: PlayerContext, dt: number): boolean {
    const e = ctx.entity;

    // Jump off — Jump.testConditions doesn't allow transitions from
    // climbing states, so we handle it here. Adds lateral impulse
    // (SideJumpStrength=0.25, applied via Jump's constant) plus upward.
    if (ctx.input.state.jump.pressed) {
      ctx.action = ActionType.Jumping;
      // Upward impulse handled by Jump.begin (which now ADDs to velocity).
      // Side kick from FEZ: velocity += rv * input.x * 0.25 * TrileSize.
      // Deferred — needs lateral input integration with Jump.begin.
      return true;
    }

    // Still overlapping a ladder?
    const ladder = this.findLadderInAxis(ctx);
    if (!ladder) {
      ctx.action = ActionType.Falling;
      this.sinceReleased = 0;
      return true;
    }
    e.heldInstance = ladder;

    // FEZ Y velocity: input.y * TrileSize * ClimbingSpeed * dt, also
    // modulated by an animation-phase factor. We omit the animation
    // phase multiplier (no animation system) and apply the base rate.
    const my = ctx.input.state.movement.y;
    e.velocity.y = my * TRILE_SIZE * CLIMBING_SPEED * 4.7;
    // ^ The `* 4.7` mirrors FEZ's `movement.y * 4.7 * 0.425 * elapsedSeconds`
    // — ClimbingSpeed (0.425) is the accel shape, 4.7 is WalkAcceleration
    // reused for per-second scaling. Kept as a per-second velocity
    // assignment without dt because we're setting (not integrating).
    void dt;

    // Freeze XZ while on the ladder — FEZ clamps against surface triles;
    // we just freeze for now.
    e.velocity.x = 0;
    e.velocity.z = 0;
    return true;
  }

  end(ctx: PlayerContext): void {
    ctx.entity.climbing = false;
    ctx.entity.heldInstance = null;
    this.sinceReleased = 0;
  }
}
