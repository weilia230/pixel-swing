import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STONES, collectStone, updateStones } from '../game/stones';
import { STONE } from '../game/survivalConfig';
import { heightAt } from '../game/terrain';

function StoneModel() {
  return (
    <group>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[0.24, 0.16, 0.22]} />
        <meshLambertMaterial color="#8d8b93" />
      </mesh>
      <mesh position={[-0.09, 0.18, -0.03]} rotation={[0, 0.4, 0.1]}>
        <boxGeometry args={[0.15, 0.13, 0.16]} />
        <meshLambertMaterial color="#a3a1a8" />
      </mesh>
      <mesh position={[0.08, 0.15, 0.05]} rotation={[0.1, -0.3, 0]}>
        <boxGeometry args={[0.12, 0.11, 0.13]} />
        <meshLambertMaterial color="#6d6b74" />
      </mesh>
    </group>
  );
}

export default function Stones() {
  const groupRef = useRef();
  const { camera, gl } = useThree();

  useFrame(({ clock }) => {
    updateStones();
    if (!groupRef.current) return;
    const time = clock.elapsedTime;
    groupRef.current.children.forEach((child, index) => {
      const stone = STONES[index];
      child.visible = !stone.taken;
      if (!child.visible) return;
      child.position.y = heightAt(stone.x, stone.z)
        + Math.sin(time * 2 + index) * STONE.bob;
    });
  });

  // 复用场景轻点事件：点到碎石就拾取
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPick = (event) => {
      if (!groupRef.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      pointer.x = ((event.detail.x - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.detail.y - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(groupRef.current.children, true);
      for (let i = 0; i < hits.length; i += 1) {
        let node = hits[i].object;
        while (node) {
          if (node.userData && node.userData.stoneId) {
            collectStone(node.userData.stoneId);
            return;
          }
          node = node.parent;
        }
      }
    };

    window.addEventListener('scene-pickup-click', onPick);
    return () => window.removeEventListener('scene-pickup-click', onPick);
  }, [camera, gl]);

  return (
    <group ref={groupRef}>
      {STONES.map((stone) => (
        <group
          key={stone.id}
          visible={!stone.taken}
          position={[stone.x, heightAt(stone.x, stone.z), stone.z]}
          userData={{ stoneId: stone.id }}
        >
          <StoneModel />
        </group>
      ))}
    </group>
  );
}
