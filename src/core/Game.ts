import * as THREE from "three";
import { ServiceContainer } from "./ServiceContainer";
import { GameComponent, DrawableGameComponent, isDrawable } from "./Component";

const FIXED_DT = 1 / 60;

export class Game {
  readonly services = new ServiceContainer();
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;

  private components: GameComponent[] = [];
  private drawables: DrawableGameComponent[] = [];
  private _sorted = false;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.services.register("scene", this.scene);
    this.services.register("renderer", this.renderer);
    this.services.register("game", this);
  }

  addComponent(component: GameComponent): void {
    this.components.push(component);
    if (isDrawable(component)) {
      this.drawables.push(component);
    }
    this._sorted = false;
  }

  private _ensureSorted(): void {
    if (this._sorted) return;
    this.components.sort((a, b) => a.updateOrder - b.updateOrder);
    this.drawables.sort((a, b) => a.drawOrder - b.drawOrder);
    this._sorted = true;
  }

  start(camera: THREE.Camera): void {
    this._ensureSorted();

    const clock = new THREE.Clock();
    let accumulator = 0;

    const loop = () => {
      const frameTime = Math.min(clock.getDelta(), 0.1); // Cap to avoid spiral of death
      accumulator += frameTime;

      // Fixed timestep update
      while (accumulator >= FIXED_DT) {
        this._ensureSorted();
        for (const c of this.components) {
          if (c.enabled) c.update(FIXED_DT);
        }
        accumulator -= FIXED_DT;
      }

      // Draw
      for (const d of this.drawables) {
        if (d.visible) d.draw();
      }

      this.renderer.render(this.scene, camera);
    };

    this.renderer.setAnimationLoop(loop);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }
}
