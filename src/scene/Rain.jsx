import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { player } from '../game/runtime';
import { weather } from '../game/time';
import { isInsideBuilding } from '../game/terrain';

const COUNT = 260;

export default function Rain() {
  const mesh = useRef();
  const drops = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        x: (Math.random() - 0.5) * 26,
        y: Math.random() * 12,
        z: (Math.random() - 0.5) * 26,
        speed: 9 + Math.random() * 6,
      })),
    []
  );

  useFrame((_, delta) => {
    const element = mesh.current;
    if (!element) return;
    const visible = weather.rain > 0.02;
    element.visible = visible;
    if (!visible) return;
    const dt = Math.min(delta, 1 / 30);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < COUNT; i += 1) {
      const drop = drops[i];
      drop.y -= drop.speed * dt;
      if (drop.y < 0) {
        drop.y = 10 + Math.random() * 4;
        drop.x = (Math.random() - 0.5) * 26;
        drop.z = (Math.random() - 0.5) * 26;
      }
      const x = player.position.x + drop.x;
      const z = player.position.z + drop.z;
      const sheltered = isInsideBuilding(x, z, 1.1);
      dummy.position.set(x, sheltered ? -100 : drop.y, z);
      dummy.scale.setScalar(sheltered ? 0 : 1);
      dummy.updateMatrix();
      element.setMatrixAt(i, dummy.matrix);
    }
    element.instanceMatrix.needsUpdate = true;
    element.material.opacity = 0.16 + weather.rain * 0.3;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false} visible={false}>
      <boxGeometry args={[0.03, 0.36, 0.03]} />
      <meshBasicMaterial color="#a8c2d4" transparent opacity={0.35} />
    </instancedMesh>
  );
}
