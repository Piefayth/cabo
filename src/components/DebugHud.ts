import { PlayerManager } from "./PlayerManager";
import { Camera } from "../engine/Camera";
import { InputManager } from "../engine/InputManager";
import { Viewpoint } from "../engine/Viewpoint";
import { HorizontalDirection } from "../engine/CollisionEnums";

/**
 * Debug HUD — shows player position, velocity, ground state, collision info.
 * Useful for diagnosing collision/movement issues.
 */
export class DebugHud {
  private container: HTMLElement;
  private player: PlayerManager;
  private camera: Camera;
  private input: InputManager;
  private frameCount = 0;

  constructor(player: PlayerManager, camera: Camera, input: InputManager) {
    this.player = player;
    this.camera = camera;
    this.input = input;
    this.container = document.createElement("div");
    this.container.id = "debug-hud";
    this._style();
    document.body.appendChild(this.container);

    setInterval(() => this._update(), 50); // 20 Hz
  }

  private _style(): void {
    const style = document.createElement("style");
    style.textContent = `
      #debug-hud {
        position: fixed;
        top: 8px;
        left: 8px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.65);
        color: #fff;
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 11px;
        line-height: 1.5;
        border-radius: 4px;
        white-space: pre;
        z-index: 1000;
        pointer-events: none;
        max-width: 380px;
      }
      #debug-hud .hl { color: #ff0; }
      #debug-hud .ok { color: #7f7; }
      #debug-hud .bad { color: #f77; }
      #debug-hud .bg-on { color: #f0f; font-weight: bold; }
      #debug-hud .bg-off { color: #555; }
    `;
    document.head.appendChild(style);
  }

  private _update(): void {
    this.frameCount++;
    const p = this.player.physics;
    const c = p.center;
    const v = p.velocity;

    const viewpoint = Viewpoint[this.camera.viewpoint];
    const dir = HorizontalDirection[p.movingDirection];
    const groundNearLow = p.ground.nearLow ? "Y" : "-";
    const groundFarHigh = p.ground.farHigh ? "Y" : "-";

    const groundClass = p.grounded ? "ok" : "bad";
    const bgClass = p.background ? "bg-on" : "bg-off";

    const wcNear = p.wallCollision.nearLow.collided ? "Y" : "-";
    const wcFar = p.wallCollision.farHigh.collided ? "Y" : "-";
    const wcNearDest = p.wallCollision.nearLow.destination
      ? `@(${p.wallCollision.nearLow.destination.position.x},${p.wallCollision.nearLow.destination.position.y},${p.wallCollision.nearLow.destination.position.z})`
      : "";
    const wcFarDest = p.wallCollision.farHigh.destination
      ? `@(${p.wallCollision.farHigh.destination.position.x},${p.wallCollision.farHigh.destination.position.y},${p.wallCollision.farHigh.destination.position.z})`
      : "";

    const cam = this.camera.camera.position;

    this.container.innerHTML =
      `<span class="hl">POS</span>   ${c.x.toFixed(3)}, ${c.y.toFixed(3)}, ${c.z.toFixed(3)}\n` +
      `<span class="hl">VEL</span>   ${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)}\n` +
      `<span class="hl">VIEW</span>  ${viewpoint}  dir:${dir}\n` +
      `<span class="${groundClass}">GRND</span>  ${p.grounded ? "YES" : "no "}  near:${groundNearLow} far:${groundFarHigh}\n` +
      `<span class="bad">WALL</span>  near:${wcNear} ${wcNearDest} far:${wcFar} ${wcFarDest}\n` +
      `<span class="${bgClass}">BG</span>    ${p.background ? "YES" : "no "}\n` +
      `<span class="hl">INP</span>   mx=${this.input.state.movement.x.toFixed(2)} jmp=${this.input.state.jump.down ? "Y" : "-"}\n` +
      `<span class="hl">CAM</span>   ${cam.x.toFixed(2)}, ${cam.y.toFixed(2)}, ${cam.z.toFixed(2)}\n` +
      `<span class="hl">F</span>     ${this.frameCount}`;
  }
}
