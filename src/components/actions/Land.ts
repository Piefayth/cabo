import { PlayerAction } from "./PlayerAction";
import { PlayerContext } from "./PlayerContext";
import { ActionType } from "../../structure/ActionType";

/**
 * Land — brief recovery animation after landing from a fall/jump.
 *
 * Ported from FEZ/Components/Actions/Land.cs. FEZ's Land has no
 * numeric duration constant — recovery ends when the landing
 * animation's Timing.Ended fires. It also plays a short controller
 * vibration (0.4 intensity, 0.15 s).
 *
 * Without real animations we approximate by holding Landing for a
 * fixed short interval.
 */
const LANDING_DURATION = 0.08; // seconds — placeholder until animations exist

export class Land extends PlayerAction {
  private sinceLanded = 0;

  isActionAllowed(action: ActionType): boolean {
    return action === ActionType.Landing;
  }

  testConditions(ctx: PlayerContext): void {
    const e = ctx.entity;
    const cur = ctx.action;

    // Hit the ground while falling/jumping — enter Landing.
    if (
      e.grounded &&
      (cur === ActionType.Falling ||
        cur === ActionType.FreeFalling ||
        cur === ActionType.Jumping)
    ) {
      ctx.action = ActionType.Landing;
      this.sinceLanded = 0;
    }
  }

  begin(_ctx: PlayerContext): void {
    this.sinceLanded = 0;
    // TODO: gamepad vibration 0.4 intensity × 0.15 s when Gamepad API wired.
  }

  act(ctx: PlayerContext, dt: number): boolean {
    this.sinceLanded += dt;

    // FEZ locks landing until the landing animation's Timing.Ended fires.
    // We don't have animations yet, so we hold for a fixed short interval
    // and DO NOT let input interrupt. Jump's coyote-time check still
    // permits queuing a jump-on-press (Jump.testConditions reads
    // input.jump.pressed regardless), and WalkRun runs while Landing so
    // horizontal velocity still advances.
    if (this.sinceLanded >= LANDING_DURATION) {
      ctx.action = ActionType.Idle;
    }
    return true;
  }
}
