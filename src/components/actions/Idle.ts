import { PlayerAction } from "./PlayerAction";
import { PlayerContext } from "./PlayerContext";
import { ActionType } from "../../structure/ActionType";
import { rightVector } from "../../engine/FezMath";

/**
 * Idle — handles the standing / at-rest state.
 *
 * Ported from FEZ/Components/Actions/Idle.cs. FEZ's Idle tests for
 * transitions back to Idle when horizontal velocity is ~0, input.x
 * is 0, the player isn't pushing, and the vertical velocity has the
 * expected sign for the current gravity direction.
 *
 * Sub-idle variants (LookAround, Sleep, Yawn, Play) are stubbed for
 * later — they are cosmetic cycles that don't affect gameplay.
 */
export class Idle extends PlayerAction {
  isActionAllowed(action: ActionType): boolean {
    return (
      action === ActionType.Idle ||
      action === ActionType.IdleLookAround ||
      action === ActionType.IdleSleep ||
      action === ActionType.IdleYawn ||
      action === ActionType.IdlePlay ||
      action === ActionType.LookingLeft ||
      action === ActionType.LookingRight ||
      action === ActionType.LookingUp ||
      action === ActionType.LookingDown
    );
  }

  testConditions(ctx: PlayerContext): void {
    const e = ctx.entity;
    const cur = ctx.action;

    // FEZ Idle.TestConditions: from Walking/Running/Landing, return to
    // Idle when grounded, input.X == 0, XZ velocity ~= 0, and the player
    // isn't being pushed/carried. We don't track pushed/carried yet.
    if (
      cur === ActionType.Walking ||
      cur === ActionType.Running ||
      cur === ActionType.Landing ||
      cur === ActionType.RunTurnAround
    ) {
      const rv = rightVector(ctx.camera.viewpoint);
      const horizSpeed = Math.abs(e.velocity.dot(rv));
      const mx = ctx.input.state.movement.x;
      if (e.grounded && mx === 0 && horizSpeed < 1e-3) {
        ctx.action = ActionType.Idle;
      }
    }
  }

  act(_ctx: PlayerContext, _dt: number): boolean {
    // Cosmetic idle variants not yet implemented — return true so the
    // default animation tick runs.
    return true;
  }
}
