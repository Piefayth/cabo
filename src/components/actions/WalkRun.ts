import { PlayerAction } from "./PlayerAction";
import { PlayerContext } from "./PlayerContext";
import { ActionType, isIdleLike } from "../../structure/ActionType";
import {
  HorizontalDirection,
  horizontalSign,
  directionFromMovement,
} from "../../engine/CollisionEnums";
import { rightVector } from "../../engine/FezMath";

/**
 * WalkRun — horizontal ground movement.
 *
 * Ported from FEZ/Components/Actions/WalkRun.cs. FEZ uses a shared
 * static MovementHelper (WalkAcceleration 4.7, RunAcceleration 5.875,
 * RunTimeThreshold 0.2 s) to accumulate horizontal velocity each tick:
 *
 *   velocity += rotate(input.x, 0, 0) * TrileSize * accel * dt
 *            * (0.5 + |GravityFactor|*1.5) / 2
 *
 * Running kicks in after 0.2 s of sustained |input| > 0.5.
 *
 * TestConditions mirrors FEZ's walk/run state machine: from Idle-like
 * states, grounded + non-zero input + not pushing transitions to
 * Walking. From Walking/Running we call TestForTurn, which checks
 * whether input has flipped against lookingDirection and triggers
 * RunTurnAround.
 */
const WALK_ACCELERATION = 4.7;
const RUN_ACCELERATION = 5.875;
const RUN_TIME_THRESHOLD = 0.2;
const RUN_INPUT_THRESHOLD = 0.5;
const TRILE_SIZE = 0.15;

export class WalkRun extends PlayerAction {
  isActionAllowed(action: ActionType): boolean {
    // FEZ allows Walking/Running/RunTurnAround AND Landing so that
    // horizontal velocity keeps advancing while the landing animation plays.
    return (
      action === ActionType.Walking ||
      action === ActionType.Running ||
      action === ActionType.RunTurnAround ||
      action === ActionType.Landing
    );
  }

  testConditions(ctx: PlayerContext): void {
    const e = ctx.entity;
    const mx = ctx.input.state.movement.x;

    if (isIdleLike(ctx.action)) {
      // FEZ: if grounded, input.X != 0, and PushedInstance == null,
      // enter Walking. (We have no pushed-instance yet.)
      if (e.grounded && mx !== 0) {
        ctx.action = ActionType.Walking;
      } else {
        // FEZ: WalkRun.MovementHelper.Reset() — resets RunTime to 0.
        ctx.runTime = 0;
      }
    } else if (
      ctx.action === ActionType.Walking ||
      ctx.action === ActionType.Running
    ) {
      this.testForTurn(ctx);
    }
  }

  /**
   * FEZ's TestForTurn: if input sign differs from LookingDirection,
   * transition to RunTurnAround. Not implementing the full turn
   * animation — we just flip direction instantly for now.
   */
  private testForTurn(ctx: PlayerContext): void {
    const mx = ctx.input.state.movement.x;
    const inputSign = Math.sign(mx);
    if (inputSign === 0) return;
    const lookingSign = horizontalSign(ctx.lookingDirection);
    if (inputSign === lookingSign) return;
    // Turned against looking direction — flip looking direction.
    // TODO: port RunTurnAround animation when animations exist.
    ctx.lookingDirection =
      inputSign > 0 ? HorizontalDirection.Right : HorizontalDirection.Left;
  }

  begin(ctx: PlayerContext): void {
    // FEZ WalkRun.Begin resets MovementHelper.RunTime.
    ctx.runTime = 0;
  }

  act(ctx: PlayerContext, dt: number): boolean {
    const mx = ctx.input.state.movement.x;

    // Accumulate RunTime (MovementHelper.Update)
    if (Math.abs(mx) > RUN_INPUT_THRESHOLD) {
      ctx.runTime += dt;
    } else {
      ctx.runTime = 0;
    }

    const running = ctx.runTime > RUN_TIME_THRESHOLD;

    // Promote Walking -> Running once runTime crosses threshold.
    // FEZ never demotes: once Running, the player stays Running until
    // the action ends (Idle/Jump/Fall transition takes over).
    if (running && ctx.action === ActionType.Walking) {
      ctx.action = ActionType.Running;
    }

    // Apply horizontal impulse — exact FEZ MovementHelper.Update formula
    if (mx !== 0) {
      const accel = running ? RUN_ACCELERATION : WALK_ACCELERATION;
      const gf = Math.abs(ctx.physicsManager.gravityFactor);
      const gravityScale = (0.5 + gf * 1.5) / 2;
      const impulseMag = mx * TRILE_SIZE * accel * dt * gravityScale;
      const rv = rightVector(ctx.camera.viewpoint);
      ctx.entity.velocity.add(rv.clone().multiplyScalar(impulseMag));
    }

    // Update lookingDirection from input
    if (mx > 0) ctx.lookingDirection = HorizontalDirection.Right;
    else if (mx < 0) ctx.lookingDirection = HorizontalDirection.Left;
    ctx.entity.movingDirection = directionFromMovement(mx);

    return true;
  }
}
