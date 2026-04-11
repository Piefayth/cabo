import { BaseComponent } from "../core/Component";
import { ServiceContainer } from "../core/ServiceContainer";

export interface InputState {
  movement: { x: number; y: number };
  jump: ButtonState;
  rotateLeft: ButtonState;
  rotateRight: ButtonState;
}

export interface ButtonState {
  pressed: boolean; // Just pressed this frame
  down: boolean; // Held down
  released: boolean; // Just released this frame
}

function emptyButton(): ButtonState {
  return { pressed: false, down: false, released: false };
}

export class InputManager extends BaseComponent {
  readonly state: InputState = {
    movement: { x: 0, y: 0 },
    jump: emptyButton(),
    rotateLeft: emptyButton(),
    rotateRight: emptyButton(),
  };

  // Raw key state
  private keys = new Set<string>();
  private keysPressed = new Set<string>();
  private keysReleased = new Set<string>();

  // Touch state
  private _movementTouchId: number | null = null;
  private _movementOrigin = { x: 0, y: 0 };
  private _touchMovement = { x: 0, y: 0 };
  private _touchJump = false;
  private _touchRotateLeft = false;
  private _touchRotateRight = false;

  constructor(services: ServiceContainer) {
    super(services, -200); // Update before camera

    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) {
        this.keysPressed.add(e.code);
      }
      this.keys.add(e.code);
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.keysReleased.add(e.code);
    });

    // Touch controls are driven by the TouchControls UI component
  }

  /** Called by TouchControls component */
  setMovementTouch(id: number, originX: number, originY: number): void {
    this._movementTouchId = id;
    this._movementOrigin = { x: originX, y: originY };
    this._touchMovement = { x: 0, y: 0 };
  }

  updateMovementTouch(x: number, y: number): void {
    if (this._movementTouchId === null) return;
    const dx = x - this._movementOrigin.x;
    const dy = y - this._movementOrigin.y;
    const deadzone = 10;
    const maxDist = 50;
    this._touchMovement.x =
      Math.abs(dx) > deadzone
        ? Math.max(-1, Math.min(1, dx / maxDist))
        : 0;
    this._touchMovement.y =
      Math.abs(dy) > deadzone
        ? Math.max(-1, Math.min(1, -dy / maxDist))
        : 0;
  }

  clearMovementTouch(): void {
    this._movementTouchId = null;
    this._touchMovement = { x: 0, y: 0 };
  }

  setTouchJump(active: boolean): void {
    this._touchJump = active;
  }

  setTouchRotateLeft(active: boolean): void {
    this._touchRotateLeft = active;
  }

  setTouchRotateRight(active: boolean): void {
    this._touchRotateRight = active;
  }

  update(_dt: number): void {
    // Movement from keyboard
    let mx = 0;
    let my = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) mx -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) mx += 1;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) my += 1;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) my -= 1;

    // Merge touch movement
    if (this._movementTouchId !== null) {
      mx = this._touchMovement.x;
      my = this._touchMovement.y;
    }

    this.state.movement.x = mx;
    this.state.movement.y = my;

    // Buttons
    this._updateButton(
      this.state.jump,
      this.keys.has("Space") || this._touchJump,
    );
    this._updateButton(
      this.state.rotateLeft,
      this.keysPressed.has("KeyQ") || this._touchRotateLeft,
    );
    this._updateButton(
      this.state.rotateRight,
      this.keysPressed.has("KeyE") || this._touchRotateRight,
    );

    // Clear per-frame sets
    this.keysPressed.clear();
    this.keysReleased.clear();
    this._touchRotateLeft = false;
    this._touchRotateRight = false;
  }

  private _updateButton(btn: ButtonState, isDown: boolean): void {
    btn.pressed = isDown && !btn.down;
    btn.released = !isDown && btn.down;
    btn.down = isDown;
  }
}
