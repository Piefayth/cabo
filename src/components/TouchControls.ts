import { InputManager } from "../engine/InputManager";

/**
 * Mobile touch controls overlay.
 * Left side: virtual joystick for movement
 * Right side: jump button, rotate buttons
 */
export class TouchControls {
  private container: HTMLElement;
  private input: InputManager;

  constructor(input: InputManager) {
    this.input = input;
    this.container = document.createElement("div");
    this.container.id = "touch-controls";
    this._build();
    document.body.appendChild(this.container);
  }

  private _build(): void {
    this.container.innerHTML = `
      <div id="tc-left" class="tc-zone">
        <div id="tc-stick-area">
          <div id="tc-stick-knob"></div>
        </div>
      </div>
      <div id="tc-right" class="tc-zone">
        <button id="tc-rotate-left" class="tc-btn tc-rot">&#8630;</button>
        <button id="tc-jump" class="tc-btn tc-action">&#9650;</button>
        <button id="tc-rotate-right" class="tc-btn tc-rot">&#8631;</button>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #touch-controls {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 40vh;
        display: flex;
        justify-content: space-between;
        pointer-events: none;
        z-index: 100;
        user-select: none;
        -webkit-user-select: none;
      }
      .tc-zone {
        pointer-events: auto;
        display: flex;
        align-items: center;
        padding: 20px;
      }
      #tc-left {
        width: 40%;
        justify-content: center;
      }
      #tc-right {
        width: 40%;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
        align-content: center;
      }
      #tc-stick-area {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        border: 2px solid rgba(255, 255, 255, 0.3);
        position: relative;
        touch-action: none;
      }
      #tc-stick-knob {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }
      .tc-btn {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.4);
        background: rgba(255, 255, 255, 0.15);
        color: white;
        font-size: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: none;
        -webkit-tap-highlight-color: transparent;
      }
      .tc-btn:active {
        background: rgba(255, 255, 255, 0.35);
      }
      .tc-action {
        width: 72px;
        height: 72px;
        font-size: 28px;
      }

      /* Hide on desktop unless touch is available */
      @media (hover: hover) and (pointer: fine) {
        #touch-controls { display: none; }
      }
    `;
    document.head.appendChild(style);

    this._bindStick();
    this._bindButtons();
  }

  private _bindStick(): void {
    const area = this.container.querySelector("#tc-stick-area") as HTMLElement;
    const knob = this.container.querySelector("#tc-stick-knob") as HTMLElement;

    area.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = area.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      this.input.setMovementTouch(touch.identifier, cx, cy);
    });

    area.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      this.input.updateMovementTouch(touch.clientX, touch.clientY);

      // Move knob visually
      const rect = area.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = touch.clientX - cx;
      let dy = touch.clientY - cy;
      const maxDist = rect.width / 2 - 22;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
      }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });

    const endStick = (e: TouchEvent) => {
      e.preventDefault();
      this.input.clearMovementTouch();
      knob.style.transform = "translate(-50%, -50%)";
    };
    area.addEventListener("touchend", endStick);
    area.addEventListener("touchcancel", endStick);
  }

  private _bindButtons(): void {
    const jumpBtn = this.container.querySelector("#tc-jump") as HTMLElement;
    const rotLeftBtn = this.container.querySelector("#tc-rotate-left") as HTMLElement;
    const rotRightBtn = this.container.querySelector("#tc-rotate-right") as HTMLElement;

    // Jump — hold
    jumpBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.input.setTouchJump(true);
    });
    jumpBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.input.setTouchJump(false);
    });
    jumpBtn.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      this.input.setTouchJump(false);
    });

    // Rotate — tap (fires once per press)
    rotLeftBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.input.setTouchRotateLeft(true);
    });
    rotRightBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.input.setTouchRotateRight(true);
    });
  }
}
