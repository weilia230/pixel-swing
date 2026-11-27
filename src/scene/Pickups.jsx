import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  collectPickup,
  getStoreVersion,
  pickups,
  subscribeStore,
  updatePickups,
} from '../game/inventory';
import ItemModel from './ItemModel';

export default function Pickups() {
  const [, setVersion] = useState(0);
  const groupRef = useRef();
  const { camera, gl } = useThree();

  useEffect(() => subscribeStore(() => setVersion(getStoreVersion())), []);

  useFrame(({ clock }, delta) => {
    updatePickups(Math.min(delta, 1 / 30));
    if (!groupRef.current) return;
    const time = clock.elapsedTime;
    groupRef.current.children.forEach((child, index) => {
      child.position.y = 0.16 + Math.sin(time * 2.4 + index) * 0.05;
      child.rotation.y = time * 0.8 + index;
    });
  });

  // 点击地上的物品拾取（App 把点击坐标转成事件）
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
      if (!hits.length) return;
      let node = hits[0].object;
      while (node) {
        if (node.userData && node.userData.pickupId) {
          collectPickup(node.userData.pickupId);
          return;
        }
        node = node.parent;
      }
    };

    window.addEventListener('scene-pickup-click', onPick);
    return () => window.removeEventListener('scene-pickup-click', onPick);
  }, [camera, gl]);

  return (
    <group ref={groupRef}>
      {pickups.map((item) => (
        <group key={item.id} position={[item.x, item.y || 0.16, item.z]} userData={{ pickupId: item.id }}>
          <ItemModel type={item.type} />
        </group>
      ))}
    </group>
  );
}
