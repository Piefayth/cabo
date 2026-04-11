import { ServiceContainer } from "./ServiceContainer";

export interface GameComponent {
  readonly updateOrder: number;
  enabled: boolean;
  update(dt: number): void;
}

export interface DrawableGameComponent extends GameComponent {
  readonly drawOrder: number;
  visible: boolean;
  draw(): void;
}

export function isDrawable(c: GameComponent): c is DrawableGameComponent {
  return "draw" in c;
}

export abstract class BaseComponent implements GameComponent {
  readonly updateOrder: number;
  enabled = true;

  constructor(
    protected services: ServiceContainer,
    updateOrder = 0,
  ) {
    this.updateOrder = updateOrder;
  }

  abstract update(dt: number): void;
}

export abstract class BaseDrawableComponent implements DrawableGameComponent {
  readonly updateOrder: number;
  readonly drawOrder: number;
  enabled = true;
  visible = true;

  constructor(
    protected services: ServiceContainer,
    updateOrder = 0,
    drawOrder = 0,
  ) {
    this.updateOrder = updateOrder;
    this.drawOrder = drawOrder;
  }

  abstract update(dt: number): void;
  abstract draw(): void;
}
