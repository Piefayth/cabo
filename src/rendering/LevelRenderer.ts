import * as THREE from "three";
import { Level } from "../structure/Level";
import { TrileDefinition, TrileInstance, getTrileCenter } from "../structure/Trile";

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
    const groups = new Map<number, TrileInstance[]>();
    for (const trile of level.triles.values()) {
      if (!trile.enabled) continue;
      let list = groups.get(trile.trileId);
      if (!list) {
        list = [];
        groups.set(trile.trileId, list);
      }
      list.push(trile);
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    for (const [trileId, instances] of groups) {
      const def = level.trileSet.get(trileId);
      if (!def) continue;

      const material = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.8,
        metalness: 0.1,
        transparent: def.immaterial,
        opacity: def.immaterial ? 0.3 : 1.0,
      });

      const mesh = new THREE.InstancedMesh(
        geometry,
        material,
        instances.length,
      );
      const matrix = new THREE.Matrix4();

      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        const center = getTrileCenter(inst, def);
        matrix.makeRotationY(inst.phi);
        matrix.setPosition(center);
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
