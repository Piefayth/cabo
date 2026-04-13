import { PlayerAction } from "./PlayerAction";
import { PlayerContext } from "./PlayerContext";
import { ActionType, isIdleLike } from "../../structure/ActionType";

/**
 * Jump — initiates and sustains a jump.
 *
 * Ported from FEZ/Components/Actions/Jump.cs. FEZ uses these constants:
 *   SideJumpStrength = 0.25f
 *   UpJumpStrength   = 1.025f
 *   Sustain window   = 0.25 s (while button held)
 *   Sustain boost    = 0.6f  (else 0)
 *
 * The initial impulse scales UpJumpStrength by TrileSize (0.15).
 * While the jump button is held within the sustain window, additional
 * vertical force is added each frame.
 *
 * DoubleJumpTime = 0.1 s (from Fall.cs) provides coyote-time — the
 * player can still jump for 0.1 s after leaving a ledge. We handle
 * that by checking sinceNotGrounded instead of requiring entity.grounded.
 */
const UP_JUMP_STRENGTH = 1.025;
const SIDE_JUMP_STRENGTH = 0.25;
const SUSTAIN_WINDOW = 0.25; // seconds
const SUSTAIN_BOOST = 0.6;
const TRILE_SIZE = 0.15;
const DOUBLE_JUMP_TIME = 0.1; // coyote time

export class Jump extends PlayerAction {
  isActionAllowed(action: ActionType): boolean {
    return action === ActionType.Jumping;
  }

  testConditions(ctx: PlayerContext): void {
    // Trigger from grounded idle/walk states or within coyote window
    const canJump =
      ctx.entity.grounded ||
      ctx.sinceNotGrounded < DOUBLE_JUMP_TIME;

    const pressedThisFrame = ctx.input.state.jump.pressed;

    if (
      canJump &&
      pressedThisFrame &&
      (isIdleLike(ctx.action) ||
        ctx.action === ActionType.Walking ||
        ctx.action === ActionType.Running)
    ) {
      ctx.action = ActionType.Jumping;
      ctx.wantsJump = true;
    }
  }

  begin(ctx: PlayerContext): void {
    // Initial impulse per FEZ Jump.DoJump:
    //   velocity.y += TrileSize * gf * UpJumpStrength * multiplier
    // multiplier = 1.0 normally (0.775 for ladder/vine jumps — not yet
    // supported; we always use 1.0).
    // IMPORTANT: FEZ ADDS to velocity.y (preserves moving-platform
    // momentum), it does not SET it.
    const gf = ctx.physicsManager.gravityFactor;
    ctx.entity.velocity.y += TRILE_SIZE * gf * UP_JUMP_STRENGTH * 1.0;
    ctx.sinceJumped = 0;
    ctx.jumpHeld = true;
    ctx.jumpReleased = false;
    ctx.wantsJump = false;
    // SIDE_JUMP_STRENGTH (0.25) is applied when jumping off a ladder/vine
    // or a ledge grab — deferred until those actions exist.
    void SIDE_JUMP_STRENGTH;
  }

  act(ctx: PlayerContext, dt: number): boolean {
    ctx.sinceJumped += dt;

    if (!ctx.input.state.jump.down) {
      ctx.jumpHeld = false;
      ctx.jumpReleased = true;
    }

    // Sustain per FEZ: while held within 0.25s, add
    //   dt * SustainBoost * gf * UpJumpStrength / 2
    // ≈ dt * 0.6 * gf * 1.025 / 2  ≈  dt * 0.3075 * gf
    // (unit: velocity per second — note this is NOT scaled by TrileSize
    // because the formula is already per-second, not per-trile-tick.)
    if (ctx.jumpHeld && ctx.sinceJumped < SUSTAIN_WINDOW) {
      const gf = ctx.physicsManager.gravityFactor;
      ctx.entity.velocity.y += dt * SUSTAIN_BOOST * gf * UP_JUMP_STRENGTH / 2;
    }

    // Transition to Falling once the rising phase ends.
    // FEZ's check: vertical velocity direction is opposite to gravity
    // direction (so under inverted gravity, velocity.y >= 0 is "falling").
    const gf = ctx.physicsManager.gravityFactor;
    const fallingTriggered = gf > 0 ? ctx.entity.velocity.y <= 0 : ctx.entity.velocity.y >= 0;
    if (fallingTriggered) {
      ctx.action = ActionType.Falling;
    }

    return true;
  }
}
