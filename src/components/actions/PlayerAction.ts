import { ActionType } from "../../structure/ActionType";
import { PlayerContext } from "./PlayerContext";

/**
 * PlayerAction — base class for every player-state handler.
 *
 * Mirrors FEZ/Components/Actions/PlayerAction.cs. Each concrete action
 * advertises which ActionTypes it handles via isActionAllowed(), tests
 * transitions in testConditions(), and performs per-frame work in act().
 *
 * Update flow per frame (matching FEZ PlayerAction.Update):
 *   1. testConditions() — may reassign entity.action
 *   2. isActionAllowed(entity.action) — decides if THIS action runs
 *   3. act(dt) — if allowed, run per-frame logic
 */
export abstract class PlayerAction {
  abstract isActionAllowed(action: ActionType): boolean;

  /**
   * Test state-machine transitions. May mutate entity.action.
   * Called BEFORE act(), regardless of whether the current action
   * is one we own. This mirrors FEZ's TestConditions being called
   * unconditionally so that any action can trigger a transition
   * out of the current state.
   */
  testConditions(_ctx: PlayerContext): void {
    // Override if transitions originate here.
  }

  /**
   * Called once when this action becomes active (first frame after
   * a transition into one of our ActionTypes). Override to reset
   * per-action state (e.g., MovementHelper.RunTime).
   */
  begin(_ctx: PlayerContext): void {
    // Override if needed.
  }

  /**
   * Called once when this action deactivates (the previous frame's
   * isActionAllowed was true, now it's false). Override to clean up
   * per-action state (e.g., release held flags).
   * Mirrors FEZ PlayerAction.End() which fires in SyncAnimation.
   */
  end(_ctx: PlayerContext): void {
    // Override if needed.
  }

  /**
   * Per-frame behaviour. Called only when isActionAllowed(current) is true.
   * Return true if the default animation tick should also run, false if
   * we handled timing ourselves.
   */
  abstract act(ctx: PlayerContext, dt: number): boolean;
}
