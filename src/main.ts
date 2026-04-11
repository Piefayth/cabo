import * as THREE from "three";
import { Game } from "./core/Game";
import { Camera } from "./engine/Camera";
import { InputManager } from "./engine/InputManager";
import { PlayerManager } from "./components/PlayerManager";
import { LevelRenderer } from "./rendering/LevelRenderer";
import { TouchControls } from "./components/TouchControls";
import { createTestLevel } from "./structure/TestLevel";

// --- Bootstrap ---
const game = new Game();
const scene = game.services.get<THREE.Scene>("scene");
const level = createTestLevel();

// Sky
scene.background = new THREE.Color(level.skyColor);

// Lighting
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(10, 20, 10);
scene.add(sun);
scene.add(new THREE.AmbientLight(level.ambientColor, 0.6));
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x362d1b, 0.4));

// --- Engine components ---
const input = new InputManager(game.services);
game.addComponent(input);

const camera = new Camera(game.services);
game.addComponent(camera);

// Camera rotation from input
const cameraController = {
  updateOrder: -50,
  enabled: true,
  update(_dt: number) {
    if (input.state.rotateLeft.pressed) camera.rotateViewLeft();
    if (input.state.rotateRight.pressed) camera.rotateViewRight();
  },
};
game.addComponent(cameraController);

// --- Level rendering ---
const levelRenderer = new LevelRenderer(scene);
levelRenderer.buildFromLevel(level);

// --- Player ---
const player = new PlayerManager(game.services);
player.initialize(camera, input, level);
game.addComponent(player);

// Camera follows player
const cameraFollow = {
  updateOrder: 50,
  enabled: true,
  update(_dt: number) {
    camera.center.x = player.position.x;
    camera.center.y = player.position.y + 4;
    camera.center.z = player.position.z;
  },
};
game.addComponent(cameraFollow);

// --- Mobile touch controls ---
new TouchControls(input);

// --- Resize handling ---
window.addEventListener("resize", () => {
  game.resize(window.innerWidth, window.innerHeight);
  camera.resize(window.innerWidth, window.innerHeight);
});
camera.resize(window.innerWidth, window.innerHeight);

// --- Start ---
game.start(camera.camera);
