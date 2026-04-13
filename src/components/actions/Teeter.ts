import { PlayerAction } from "./PlayerAction";
import { PlayerContext } from "./PlayerContext";
import { ActionType } from "../../structure/ActionType";
import { getTrileCenter } from "../../structure/Trile";
import { sideMask } from "../../engine/FezMath";

/**
 * Teeter — idle-on-ledge state.
 *
 * Ported from FEZ/Components/Actions/Teeter.cs.
 *
 * Trigger: player grounded, no horizontal input, and the offset from
 * the ground trile's center along the side axis is in the band
 * (0.45, 1.0]. Ground.FarHigh must be null (no second ground trile
 * farther along the side axis — confirming we're on an edge).
 *
 * On entry FEZ damps velocity by (0.5, 1, 0.5).
 * Exit transitions are handled by other actions' testConditions
 * (WalkRun re-enters on input, Fall takes over when grounded becomes
 * false). We do not force-exit.
 */
const TEETER_MIN = 0.45;
const TEETER_MAX = 1.0;

export class Teeter extends PlayerAction {
  isActionAllowed(action: ActionType): boolean {
    return action === ActionType.Teetering;
  }

  testConditions(ctx: PlayerContext): void {
    const e = ctx.entity;
    const cur = ctx.action;

    // FEZ entry set: Idle / Walking / Running / Grabbing / Pushing /
    // Dropping / Sliding. We don't have Grabbing/Pushing/Dropping/Sliding
    // as transitionable states yet; Idle/Walking/Running cover the
    // grounded cases that matter.
    const allowedFrom =
      cur === ActionType.Idle ||
      cur === ActionType.Walking ||
      cur === ActionType.Running;
    if (!allowedFrom) return;
    if (!e.grounded) return;
    if (ctx.input.state.movement.x !== 0) return;

    // FEZ requires Ground.FarHigh == null — we're supported by only one
    // ground trile along the side axis (i.e., on an edge).
    if (e.ground.farHigh !== null) return;

    const ground = e.ground.nearLow;
    if (!ground) return;
    const def = ctx.levelManager.trileSet.get(ground.trileId);
    if (!def) return;

    const groundCenter = getTrileCenter(ground, def);
    const sMask = sideMask(ctx.camera.viewpoint);
    const offsetVec = e.center.clone().sub(groundCenter);
    const offset = Math.abs(offsetVec.dot(sMask));

    if (offset > TEETER_MIN && offset <= TEETER_MAX) {
      ctx.action = ActionType.Teetering;
      // Damp velocity (0.5, 1, 0.5) on entry — matches FEZ.
      e.velocity.x *= 0.5;
      e.velocity.z *= 0.5;
    }
  }

  act(_ctx: PlayerContext, _dt: number): boolean {
    // No per-frame work — other actions' testConditions transition us out.
    return true;
  }
}
