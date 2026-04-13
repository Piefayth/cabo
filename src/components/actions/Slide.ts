import { PlayerAction } from "./PlayerAction";
import { PlayerContext } from "./PlayerContext";
import { ActionType } from "../../structure/ActionType";
import { rightVector } from "../../engine/FezMath";

/**
 * Slide — coast-to-stop state.
 *
 * Ported from FEZ/Components/Actions/Slide.cs. FEZ's Sliding is the
 * "you released input but still have horizontal velocity" state — it
 * is NOT a surface-type check. The player coasts while SlidingFriction
 * (0.8) decays XZ velocity.
 *
 * Entry: from Idle / sub-idle / Walking / Running when
 *   |XZ velocity| > 0 and |movement.x| ~ 0.
 * Exit: external — Idle's TestConditions takes over when velocity
 * finally reaches zero; WalkRun takes over on new input; Fall on
 * becoming airborne.
 *
 * Act is intentionally a no-op — deceleration happens via friction in
 * PhysicsManager when entity.action === Sliding (wired separately).
 */
export class Slide extends PlayerAction {
  isActionAllowed(action: ActionType): boolean {
    return action === ActionType.Sliding;
  }

  testConditions(ctx: PlayerContext): void {
    const e = ctx.entity;
    const cur = ctx.action;

    // FEZ entry set: idle variants, Walking, Running.
    const fromAllowed =
      cur === ActionType.Idle ||
      cur === ActionType.IdlePlay ||
      cur === ActionType.IdleSleep ||
      cur === ActionType.IdleLookAround ||
      cur === ActionType.IdleYawn ||
      cur === ActionType.Walking ||
      cur === ActionType.Running;
    if (!fromAllowed) return;
    if (!e.grounded) return;

    const mx = ctx.input.state.movement.x;
    if (Math.abs(mx) > 0.01) return;

    const rv = rightVector(ctx.camera.viewpoint);
    const horizSpeed = Math.abs(e.velocity.dot(rv));
    if (horizSpeed > 0.001) {
      ctx.action = ActionType.Sliding;
    }
  }

  act(_ctx: PlayerContext, _dt: number): boolean {
    // No-op — PhysicsManager applies SlidingFriction while action=Sliding.
    return true;
  }
}
