import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../utils/random';
import { createCrossedFoliageGeometry, createFoliageTexture } from './foliage';
import { FORESTS, heightAt, pathDistance } from '../game/terrain';

function Instances({ geometry, items, flatShading = false, basic = false, map = null, alphaTest = 0, doubleSide = false }) {
  const mesh = useRef();

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    mesh.current.count = items.length;
    items.forEach((item, index) => {
      dummy.position.set(item.pos[0], item.pos[1], item.pos[2]);
      const rot = item.rot || [0, 0, 0];
      dummy.rotation.set(rot[0], rot[1], rot[2]);
      dummy.scale.set(item.scale[0], item.scale[1], item.scale[2]);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
      if (item.color) mesh.current.setColorAt(index, color.set(item.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [items]);

  return (
    <instancedMesh ref={mesh} args={[geometry, null, Math.max(items.length, 1)]} frustumCulled={false}>
      {basic ? (
        <meshBasicMaterial color="#ffffff" map={map} alphaTest={alphaTest} side={doubleSide ? THREE.DoubleSide : THREE.FrontSide} />
      ) : (
        <meshLambertMaterial color="#ffffff" map={map} alphaTest={alphaTest} side={doubleSide ? THREE.DoubleSide : THREE.FrontSide} flatShading={flatShading} />
      )}
    </instancedMesh>
  );
}

// 只保留林下地被；所有立木与灌木都由最终植物目录中的体素模型替换
function buildFloor() {
  const random = mulberry32(6612);
  const grass = [];
  const ferns = [];
  const logs = [];
  const stumps = [];
  const flowers = [];

  FORESTS.forEach((zone) => {
    const area = (zone.maxX - zone.minX) * (zone.maxZ - zone.minZ);
    const grassCount = Math.floor(area / 75);
    const fernCount = Math.floor(area / 260);
    for (let i = 0; i < grassCount * 2 && grass.length < 18000; i += 1) {
      const x = zone.minX + random() * (zone.maxX - zone.minX);
      const z = zone.minZ + random() * (zone.maxZ - zone.minZ);
      if (pathDistance(x, z) < 2.2) continue;
      const scale = 0.45 + random() * 0.85;
      grass.push({
        pos: [x, heightAt(x, z) + 0.03, z],
        rot: [0, random() * Math.PI * 2, (random() - 0.5) * 0.1],
        scale: [scale, scale * (0.65 + random() * 0.7), scale],
        color: random() > 0.5 ? '#e2ead7' : '#d9e2cd',
      });
    }
    for (let i = 0; i < fernCount * 2 && ferns.length < 4400; i += 1) {
      const x = zone.minX + random() * (zone.maxX - zone.minX);
      const z = zone.minZ + random() * (zone.maxZ - zone.minZ);
      if (pathDistance(x, z) < 2.4) continue;
      const scale = 0.55 + random() * 0.65;
      ferns.push({
        pos: [x, heightAt(x, z) + 0.025, z],
        rot: [0, random() * Math.PI * 2, 0],
        scale: [scale * 1.35, scale * 0.85, scale * 1.35],
        color: '#c2d69c',
      });
    }
    for (let i = 0; i < 26; i += 1) {
      const x = zone.minX + random() * (zone.maxX - zone.minX);
      const z = zone.minZ + random() * (zone.maxZ - zone.minZ);
      if (pathDistance(x, z) < 3) continue;
      const length = 1.6 + random() * 2.8;
      const yaw = random() * Math.PI;
      logs.push({
        pos: [x, heightAt(x, z) + 0.22, z],
        rot: [0, yaw, Math.PI / 2],
        scale: [0.36, length, 0.36],
        color: random() > 0.5 ? '#5a4531' : '#4b3828',
      });
      if (random() > 0.5) {
        const sx = x + 1.4 + random();
        const sz = z + (random() - 0.5) * 2;
        stumps.push({
          pos: [sx, heightAt(sx, sz) + 0.4, sz],
          rot: [0, random() * Math.PI, 0],
          scale: [0.55, 0.8, 0.55],
          color: '#5c4632',
        });
      }
      if (random() > 0.7) {
        for (let f = 0; f < 3; f += 1) {
          const fx = x + (random() - 0.5) * 2.4;
          const fz = z + (random() - 0.5) * 2.4;
          flowers.push({
            pos: [fx, heightAt(fx, fz) + 0.2, fz],
            rot: [0, random() * Math.PI, 0],
            scale: [0.1, 0.1, 0.1],
            color: random() > 0.5 ? '#e8d9c0' : '#c9a9d6',
          });
        }
      }
    }
  });

  return { grass, ferns, logs, stumps, flowers };
}

export default function Forest() {
  const floor = useMemo(() => buildFloor(), []);
  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(1, 1.12, 1, 5), []);
  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const foliageGeometry = useMemo(() => createCrossedFoliageGeometry(), []);
  const grassSprite = useMemo(() => createFoliageTexture('grass'), []);
  const fernSprite = useMemo(() => createFoliageTexture('fern'), []);

  return (
    <group name="forest-floor">
      <Instances geometry={foliageGeometry} items={floor.grass} map={grassSprite} alphaTest={0.35} doubleSide />
      <Instances geometry={foliageGeometry} items={floor.ferns} map={fernSprite} alphaTest={0.35} doubleSide />
      <Instances geometry={trunkGeometry} items={floor.logs} flatShading />
      <Instances geometry={trunkGeometry} items={floor.stumps} flatShading />
      <Instances geometry={boxGeometry} items={floor.flowers} basic />
    </group>
  );
}
