import { PlayerAction } from "./PlayerAction";
import { PlayerContext } from "./PlayerContext";
import { ActionType, isIdleLike } from "../../structure/ActionType";
import { rightVector } from "../../engine/FezMath";

/**
 * Fall — applies gravity + air control while airborne.
 *
 * Ported from FEZ/Components/Actions/Fall.cs. Gravity lives HERE, not
 * in PhysicsManager. Fall runs in all airborne states (Jumping,
 * Falling, FreeFalling) so gravity keeps decelerating the jump ascent.
 *
 *   Fall.Gravity       = 3.15f
 *   Fall.MaxVelocity   = 5.093625f   (horizontal clamp while airborne)
 *   Fall.AirControl    = 0.15f
 *   Fall.DoubleJumpTime = 0.1s        (coyote time)
 *
 * Gravity application form (per FEZ):
 *   velocity -= UnitY * Gravity * GravityFactor * TrileSize * dt
 *
 * Air-control horizontal impulse (same shape as walk/run scaled by AirControl):
 *   velocity += rv * input * TrileSize * 4.7 * AirControl * dt
 */
const GRAVITY = 3.15;
const MAX_VELOCITY = 5.093625;
const AIR_CONTROL = 0.15;
const WALK_ACCEL_FOR_AIR = 4.7;
const TRILE_SIZE = 0.15;

export class Fall extends PlayerAction {
  isActionAllowed(action: ActionType): boolean {
    // Gravity must apply nearly every frame — if it doesn't, velocity.y
    // stays at 0, vertical impulse is 0, the collide-edge early-out in
    // CollisionManager returns empty, and ground detection silently
    // fails (player oscillates grounded/ungrounded).
    // FEZ suspends gravity only while climbing, swimming, or inside
    // pipes/tunnels/portals.
    switch (action) {
      case ActionType.FrontClimbingLadder:
      case ActionType.BackClimbingLadder:
      case ActionType.SideClimbingLadder:
      case ActionType.ClimbingVine:
      case ActionType.Swimming:
      case ActionType.HurtSwim:
      case ActionType.Treading:
      case ActionType.FlyingThroughPipe:
      case ActionType.EnteringPipe:
      case ActionType.EnteringTunnel:
      case ActionType.EnteringDoor:
      case ActionType.ExitDoor:
      case ActionType.GrabCornerLedge:
      case ActionType.GrabLedgeFront:
      case ActionType.GrabLedgeBack:
      case ActionType.ShimmyFront:
      case ActionType.ShimmyBack:
      case ActionType.LowerToLedge:
      case ActionType.LowerToCornerLedge:
      case ActionType.CornerTransitionFront:
      case ActionType.CornerTransitionBack:
      case ActionType.FromCornerBack:
      case ActionType.SuckedIn:
      case ActionType.Dying:
      case ActionType.GateWarp:
      case ActionType.LesserWarp:
        return false;
      default:
        return true;
    }
  }

  testConditions(ctx: PlayerContext): void {
    const e = ctx.entity;
    const cur = ctx.action;

    if (
      !e.grounded &&
      (isIdleLike(cur) ||
        cur === ActionType.Walking ||
        cur === ActionType.Running ||
        cur === ActionType.Landing)
    ) {
      const gf = ctx.physicsManager.gravityFactor;
      // Under positive gravity, we're "falling" when Y velocity ≤ 0.
      // Under inverted gravity, we're "falling" when Y velocity ≥ 0.
      const falling = gf > 0 ? e.velocity.y <= 0 : e.velocity.y >= 0;
      if (falling) {
        ctx.action = ActionType.Falling;
      }
    }
  }

  act(ctx: PlayerContext, dt: number): boolean {
    const e = ctx.entity;
    const gf = ctx.physicsManager.gravityFactor;

    // --- Gravity (always) ---
    // velocity.y -= Gravity * GravityFactor * TrileSize * dt
    e.velocity.y -= GRAVITY * gf * TRILE_SIZE * dt;

    // --- Air control (airborne only; WalkRun handles grounded input) ---
    if (!e.grounded) {
      const mx = ctx.input.state.movement.x;
      if (mx !== 0) {
        const rv = rightVector(ctx.camera.viewpoint);
        const impulseMag =
          mx * TRILE_SIZE * WALK_ACCEL_FOR_AIR * AIR_CONTROL * dt;
        e.velocity.add(rv.clone().multiplyScalar(impulseMag));
      }

      // Horizontal speed clamp on X and Z independently (FEZ behaviour).
      const maxHoriz = MAX_VELOCITY * TRILE_SIZE;
      if (Math.abs(e.velocity.x) > maxHoriz) {
        e.velocity.x = Math.sign(e.velocity.x) * maxHoriz;
      }
      if (Math.abs(e.velocity.z) > maxHoriz) {
        e.velocity.z = Math.sign(e.velocity.z) * maxHoriz;
      }
    }

    return true;
  }
}
