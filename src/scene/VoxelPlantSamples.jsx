import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAt } from '../game/terrain';
import { createCrossedFoliageGeometry } from './foliage';
import {
  buildBroadleaf,
  buildConifer,
  buildShrub,
  createSilhouetteTexture,
} from './voxelFlora';

// LOD 距离按植物到相机的实际距离计算，单位与世界坐标一致。
const NEAR_RANGE = 25;
const FAR_RANGE = 60;

// 三个样板：阔叶树、针叶树、灌木。确认后再替换全量植被。
const SAMPLES = [
  { id: 'broadleaf', x: -3.5, z: 3.0, build: buildBroadleaf },
  { id: 'conifer', x: 2.8, z: 4.2, build: buildConifer },
  { id: 'shrub', x: -1.0, z: 9.0, build: buildShrub },
];

function offsetBlocks(blocks, dx, dy, dz) {
  return blocks.map((block) => ({
    ...block,
    x: block.x + dx,
    y: block.y + dy,
    z: block.z + dz,
  }));
}

// 所有块合并进同一个 InstancedMesh，靠 instanceColor 区分颜色。
function BlockCluster({ blocks, geometry, material, clusterRef }) {
  useLayoutEffect(() => {
    const mesh = clusterRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    blocks.forEach((block, index) => {
      dummy.position.set(block.x, block.y, block.z);
      dummy.scale.set(block.sx, block.sy, block.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, block.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks, clusterRef]);

  return (
    <instancedMesh
      ref={clusterRef}
      args={[geometry, material, Math.max(blocks.length, 1)]}
      frustumCulled={false}
      visible={false}
    />
  );
}

function FarSprite({ texture, geometry, x, y, z, width, height, spriteRef }) {
  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        map: texture,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      }),
    [texture]
  );

  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const mesh = spriteRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    dummy.position.set(x, y, z);
    dummy.scale.set(width, height, width);
    dummy.updateMatrix();
    mesh.setMatrixAt(0, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [x, y, z, width, height, spriteRef]);

  return (
    <instancedMesh ref={spriteRef} args={[geometry, material, 1]} frustumCulled={false} visible={false} />
  );
}

export default function VoxelPlantSamples() {
  const { camera, scene } = useThree();
  const nearRef = useRef();
  const midRef = useRef();
  const farRefs = useRef([]);
  const levelRef = useRef('near');
  const reflectionRef = useRef(false);

  const plants = useMemo(
    () =>
      SAMPLES.map((sample) => {
        const model = sample.build();
        const groundY = heightAt(sample.x, sample.z);
        let radius = 0;
        model.blocks.forEach((block) => {
          radius = Math.max(radius, Math.hypot(block.x, block.z) + Math.max(block.sx, block.sz) / 2);
        });
        return {
          ...sample,
          groundY,
          near: offsetBlocks(model.blocks, sample.x, groundY, sample.z),
          mid: offsetBlocks(model.midBlocks, sample.x, groundY, sample.z),
          radius,
          height: model.height,
          texture: createSilhouetteTexture(model.blocks),
        };
      }),
    []
  );

  const nearBlocks = useMemo(() => plants.flatMap((plant) => plant.near), [plants]);
  const midBlocks = useMemo(() => plants.flatMap((plant) => plant.mid), [plants]);
  const center = useMemo(() => {
    const sum = plants.reduce((acc, plant) => ({ x: acc.x + plant.x, z: acc.z + plant.z }), { x: 0, z: 0 });
    return new THREE.Vector3(sum.x / plants.length, 3, sum.z / plants.length);
  }, [plants]);

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const blockMaterial = useMemo(() => new THREE.MeshLambertMaterial(), []);
  const spriteGeometry = useMemo(() => createCrossedFoliageGeometry(), []);

  useEffect(
    () => () => {
      boxGeometry.dispose();
      blockMaterial.dispose();
      spriteGeometry.dispose();
      plants.forEach((plant) => plant.texture.dispose());
    },
    [boxGeometry, blockMaterial, spriteGeometry, plants]
  );

  const applyLevel = useCallback(
    (level) => {
      if (nearRef.current) nearRef.current.visible = level === 'near';
      if (midRef.current) midRef.current.visible = level === 'mid';
      plants.forEach((_, index) => {
        const mesh = farRefs.current[index];
        if (mesh) mesh.visible = level === 'far';
      });
    },
    [plants]
  );

  // 倒影 pass 直接退到简化簇，避免倒影里重复绘制完整体素
  useEffect(() => {
    let reflector = null;
    scene.traverse((object) => {
      if (!reflector && object.material?.name === 'PixelLakeReflector') reflector = object;
    });
    if (!reflector) return undefined;

    const original = reflector.onBeforeRender;
    const patched = function patchedOnBeforeRender(...args) {
      reflectionRef.current = true;
      applyLevel('mid');
      try {
        return original.apply(this, args);
      } finally {
        reflectionRef.current = false;
        applyLevel(levelRef.current);
      }
    };
    reflector.onBeforeRender = patched;
    return () => {
      if (reflector.onBeforeRender === patched) reflector.onBeforeRender = original;
      reflectionRef.current = false;
    };
  }, [scene, applyLevel]);

  useFrame(() => {
    const distance = camera.position.distanceTo(center);
    const level = distance > FAR_RANGE ? 'far' : distance > NEAR_RANGE ? 'mid' : 'near';
    levelRef.current = level;
    if (!reflectionRef.current) applyLevel(level);
  });

  return (
    <group name="voxel-plant-samples">
      <BlockCluster
        blocks={nearBlocks}
        geometry={boxGeometry}
        material={blockMaterial}
        clusterRef={nearRef}
      />
      <BlockCluster
        blocks={midBlocks}
        geometry={boxGeometry}
        material={blockMaterial}
        clusterRef={midRef}
      />
      {plants.map((plant, index) => (
        <FarSprite
          key={plant.id}
          texture={plant.texture}
          geometry={spriteGeometry}
          x={plant.x}
          y={plant.groundY}
          z={plant.z}
          width={plant.radius * 2}
          height={plant.height}
          spriteRef={(node) => {
            farRefs.current[index] = node;
          }}
        />
      ))}
    </group>
  );
}
