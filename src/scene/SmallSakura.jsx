import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../utils/random';
import { SMALL_SAKURA } from '../game/terrain';

const PALETTE = ['#efa0c2', '#f6b9d3', '#ffd8e8', '#e88fb4', '#ffc4da', '#fff0f6'];

function buildBuds(seed) {
  const random = mulberry32(seed);
  const buds = [];
  // 三团低矮树冠，方块堆叠
  for (let cluster = 0; cluster < 3; cluster += 1) {
    const angle = (cluster / 3) * Math.PI * 2 + random() * 0.6;
    const cx = Math.cos(angle) * (0.5 + random() * 0.5);
    const cz = Math.sin(angle) * (0.5 + random() * 0.5);
    const cy = 2.65 + cluster * 0.34 + random() * 0.2;
    const count = 16 + Math.floor(random() * 8);
    for (let i = 0; i < count; i += 1) {
      const spread = 0.72;
      const size = 0.16 + random() * 0.16;
      buds.push({
        x: cx + (random() - 0.5) * spread * 2,
        y: cy + (random() - 0.5) * spread,
        z: cz + (random() - 0.5) * spread * 2,
        sx: size * (1.0 + random() * 0.9),
        sy: size * (0.55 + random() * 0.4),
        sz: size * (0.8 + random() * 0.6),
        color: PALETTE[Math.floor(random() * PALETTE.length)],
      });
    }
  }
  // 树顶一小撮浅粉
  for (let i = 0; i < 10; i += 1) {
    buds.push({
      x: (random() - 0.5) * 0.5,
      y: 3.75 + random() * 0.3,
      z: (random() - 0.5) * 0.5,
      sx: 0.2 + random() * 0.14,
      sy: 0.1 + random() * 0.08,
      sz: 0.18 + random() * 0.12,
      color: PALETTE[random() < 0.6 ? 2 : 5],
    });
  }
  return buds;
}

const TREES = SMALL_SAKURA.map((tree, index) => ({
  ...tree,
  buds: buildBuds(9000 + index * 137),
  swayPhase: index * 1.7,
}));

export default function SmallSakura() {
  const groups = useRef([]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    groups.current.forEach((group, index) => {
      if (!group) return;
      group.rotation.z = Math.sin(time * 0.5 + TREES[index].swayPhase) * 0.008;
      group.rotation.x = Math.sin(time * 0.37 + TREES[index].swayPhase * 1.3) * 0.006;
    });
  });

  return (
    <group>
      {TREES.map((tree, treeIndex) => (
        <SmallTree
          key={treeIndex}
          tree={tree}
          groupRef={(element) => {
            groups.current[treeIndex] = element;
          }}
        />
      ))}
    </group>
  );
}

function SmallTree({ tree, groupRef }) {
  const buds = useRef();

  useLayoutEffect(() => {
    if (!buds.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    tree.buds.forEach((bud, index) => {
      dummy.position.set(bud.x, bud.y, bud.z);
      dummy.scale.set(bud.sx, bud.sy, bud.sz);
      dummy.updateMatrix();
      buds.current.setMatrixAt(index, dummy.matrix);
      buds.current.setColorAt(index, color.set(bud.color));
    });
    buds.current.instanceMatrix.needsUpdate = true;
    if (buds.current.instanceColor) buds.current.instanceColor.needsUpdate = true;
  }, [tree]);

  return (
    <group
      ref={groupRef}
      position={[tree.x, 0, tree.z]}
      rotation={[0, tree.rot, 0]}
      scale={tree.scale}
    >
      {/* 矮树干 */}
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.34, 7]} />
        <meshLambertMaterial color="#2b1723" flatShading />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.14, 0.21, 1.6, 7]} />
        <meshLambertMaterial color="#33202b" flatShading />
      </mesh>
      <mesh position={[0.04, 1.9, 0.02]} rotation={[0, 0, 0.08]}>
        <cylinderGeometry args={[0.09, 0.15, 1.0, 7]} />
        <meshLambertMaterial color="#33202b" flatShading />
      </mesh>

      {/* 三根斜枝 */}
      <mesh position={[0.38, 2.35, 0.14]} rotation={[0, 0.4, 0.85]}>
        <boxGeometry args={[0.7, 0.11, 0.11]} />
        <meshLambertMaterial color="#2b1723" />
      </mesh>
      <mesh position={[-0.36, 2.5, -0.1]} rotation={[0, -0.3, -0.75]}>
        <boxGeometry args={[0.66, 0.1, 0.1]} />
        <meshLambertMaterial color="#2b1723" />
      </mesh>
      <mesh position={[0.02, 2.72, 0.38]} rotation={[0.9, 0, 0.1]}>
        <boxGeometry args={[0.1, 0.1, 0.62]} />
        <meshLambertMaterial color="#2b1723" />
      </mesh>

      <instancedMesh ref={buds} args={[null, null, tree.buds.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color="#ffffff" />
      </instancedMesh>
    </group>
  );
}
