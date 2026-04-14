import * as THREE from "three";
import { Game } from "./core/Game";
import { Camera } from "./engine/Camera";
import { InputManager } from "./engine/InputManager";
import { LevelManager } from "./engine/LevelManager";
import { CollisionManager } from "./engine/CollisionManager";
import { PhysicsManager } from "./engine/PhysicsManager";
import { PlayerManager } from "./components/PlayerManager";
import { LevelRenderer } from "./rendering/LevelRenderer";
import { TouchControls } from "./components/TouchControls";
import { DebugHud } from "./components/DebugHud";
import { createTestLevel } from "./structure/TestLevel";

// --- Bootstrap ---
const game = new Game();
const scene = game.services.get<THREE.Scene>("scene");
const level = createTestLevel();

// Sky
scene.background = new THREE.Color(level.skyColor);

// Lighting — brighter ambient + hemisphere so shadow sides are legible
// instead of near-black.
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 20, 10);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x6a5a40, 0.9));

// --- Engine systems ---
const input = new InputManager(game.services);
game.addComponent(input);

const camera = new Camera(game.services);
game.addComponent(camera);

// Level manager (spatial queries, NearestTrile)
const levelManager = new LevelManager(
  level.triles,
  level.trileSet,
  level.size,
);
game.services.register("levelManager", levelManager);

// Collision manager (CollideRectangle, face-based collision)
const collisionManager = new CollisionManager(levelManager);
game.services.register("collisionManager", collisionManager);

// Physics manager (gravity, friction, wall hugging, ground clamping)
const physicsManager = new PhysicsManager(collisionManager, levelManager);
game.services.register("physicsManager", physicsManager);

// Camera rotation from input
const cameraController = {
  updateOrder: -50,
  enabled: true,
  update(_dt: number) {
    if (input.state.rotateLeft.pressed) {
      camera.rotateViewLeft();
      levelManager.invalidateScreen(); // Rebuild depth limits
    }
    if (input.state.rotateRight.pressed) {
      camera.rotateViewRight();
      levelManager.invalidateScreen();
    }
  },
};
game.addComponent(cameraController);

// --- Level rendering ---
const levelRenderer = new LevelRenderer(scene);
levelRenderer.buildFromLevel(level);

// --- Player ---
const player = new PlayerManager(game.services);
player.initialize(
  camera,
  input,
  physicsManager,
  collisionManager,
  levelManager,
  level.playerStart,
);
game.addComponent(player);

// Camera follows player
const cameraFollow = {
  updateOrder: 50,
  enabled: true,
  update(_dt: number) {
    const pos = player.physics.center;
    camera.center.x = pos.x;
    camera.center.y = pos.y + 2;
    camera.center.z = pos.z;
  },
};
game.addComponent(cameraFollow);

// --- Mobile touch controls ---
new TouchControls(input);

// --- Debug HUD ---
new DebugHud(player, camera, input);

// --- Resize handling ---
window.addEventListener("resize", () => {
  game.resize(window.innerWidth, window.innerHeight);
  camera.resize(window.innerWidth, window.innerHeight);
});
camera.resize(window.innerWidth, window.innerHeight);

// --- Start ---
game.start(camera.camera);
