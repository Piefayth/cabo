import * as THREE from "three";
import { Level } from "../structure/Level";

/**
 * Renders a FEZ level's trile grid using Three.js instanced meshes.
 * Each trile definition gets its own InstancedMesh for efficient batching.
 */
export class LevelRenderer {
  private instancedMeshes: THREE.InstancedMesh[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  buildFromLevel(level: Level): void {
    this.clear();

    // Group trile instances by their definition ID
    const groups = new Map<number, THREE.Vector3[]>();
    for (const trile of level.triles.values()) {
      let list = groups.get(trile.trileId);
      if (!list) {
        list = [];
        groups.set(trile.trileId, list);
      }
      list.push(trile.position);
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    // Create an instanced mesh per trile type
    for (const [trileId, positions] of groups) {
      const def = level.trileSet.get(trileId);
      if (!def) continue;

      const material = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.8,
        metalness: 0.1,
      });

      const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
      const matrix = new THREE.Matrix4();

      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        // Trile positions are grid-based; offset by 0.5 to center in the cell
        matrix.setPosition(p.x + 0.5, p.y + 0.5, p.z + 0.5);
        mesh.setMatrixAt(i, matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.instancedMeshes.push(mesh);
    }
  }

  clear(): void {
    for (const mesh of this.instancedMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    this.instancedMeshes = [];
  }
}
