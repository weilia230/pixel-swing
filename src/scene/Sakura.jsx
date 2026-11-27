import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../utils/random';
import { SAKURA, SAKURA_SCALE } from '../game/terrain';

const UP = new THREE.Vector3(0, 1, 0);
const SWING_PIVOT = new THREE.Vector3(-1.9, 3.45, 0.7);
const SWING_GAP = 2.82;

const PINK = {
  deep: ['#6f3459', '#7e3d64', '#8f4671', '#9c4f7c'],
  mid: ['#b95e8d', '#c76a9a', '#d778a6', '#df85b2'],
  light: ['#efa0c2', '#f0a8c8', '#f6b9d3', '#f9c8dd'],
  pale: ['#ffd8e8', '#ffe3ef', '#ffeaf4', '#fff0f6'],
};

function pick(list, random) {
  return list[Math.floor(random() * list.length) % list.length];
}

function Branch({ from, to, radius, color = '#2f1a26' }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const direction = new THREE.Vector3().subVectors(b, a);
    const len = direction.length();
    return {
      position: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()),
      length: len,
    };
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);

  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius * 0.66, radius, length, 6]} />
      <meshLambertMaterial color={color} flatShading />
    </mesh>
  );
}

// 树冠花团：参考图的方块堆叠、分层粉色
const CLUSTERS = (() => {
  const random = mulberry32(8123);
  const list = [];
  for (let i = 0; i < 46; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 0.35 + Math.sqrt(random()) * 2.15;
    const height = 4.5 + (random() - 0.5) * 1.65 - (radius / 2.5) * 0.55;
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );
    if (position.distanceTo(SWING_PIVOT) < 0.95) continue;
    list.push({ position, angle, spread: 0.42 + random() * 0.38 });
  }
  // 树冠下缘的垂花团，轮廓更参差
  for (let i = 0; i < 12; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 1.35 + random() * 0.95;
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      3.45 + random() * 0.45,
      Math.sin(angle) * radius
    );
    if (position.distanceTo(SWING_PIVOT) < 0.95) continue;
    list.push({ position, angle, spread: 0.36 + random() * 0.24 });
  }
  return list;
})();

const BLOOMS = (() => {
  const random = mulberry32(5521);
  const items = [];

  CLUSTERS.forEach((cluster) => {
    const count = 30 + Math.floor(random() * 20);
    for (let i = 0; i < count; i += 1) {
      const position = new THREE.Vector3(
        cluster.position.x + (random() - 0.5) * cluster.spread * 2,
        cluster.position.y + (random() - 0.5) * cluster.spread * 1.3,
        cluster.position.z + (random() - 0.5) * cluster.spread * 2
      );
      if (position.distanceTo(SWING_PIVOT) < 0.55) continue;

      const sun = Math.cos(cluster.angle) * -0.86 + Math.sin(cluster.angle) * 0.5;
      let palette;
      if (position.y > 5.05) palette = random() < 0.5 ? PINK.pale : PINK.light;
      else if (position.y > 4.35) palette = random() < 0.55 ? PINK.light : PINK.mid;
      else palette = random() < 0.55 ? PINK.mid : PINK.deep;
      if (sun > 0.35 && random() < 0.45) palette = PINK.light;
      if (sun < -0.2 && position.y < 4.6 && random() < 0.4) palette = PINK.deep;

      const slab = random() < 0.3;
      const size = 0.1 + random() * 0.14;
      items.push({
        position,
        width: size * (slab ? 2.0 + random() * 1.2 : 1.1 + random() * 0.7),
        height: size * (slab ? 0.32 + random() * 0.14 : 0.45 + random() * 0.25),
        depth: size * (slab ? 0.9 + random() * 0.4 : 0.85 + random() * 0.5),
        color: pick(palette, random),
      });
    }
  });

  // 树冠外缘零星花枝
  for (let i = 0; i < 10; i += 1) {
    const angle = random() * Math.PI * 2;
    let gap = angle - SWING_GAP;
    gap = Math.atan2(Math.sin(gap), Math.cos(gap));
    if (Math.abs(gap) < 0.55) continue;
    const radius = 2.0 + random() * 0.45;
    const y = 4.1 + random() * 1.0;
    for (let j = 0; j < 8; j += 1) {
      const size = 0.09 + random() * 0.1;
      items.push({
        position: new THREE.Vector3(
          Math.cos(angle) * radius + (random() - 0.5) * 0.4,
          y + (random() - 0.5) * 0.35,
          Math.sin(angle) * radius + (random() - 0.5) * 0.4
        ),
        width: size * (1.2 + random() * 0.8),
        height: size * (0.45 + random() * 0.3),
        depth: size * (1.0 + random() * 0.5),
        color: pick(PINK.light, random),
      });
    }
  }

  // 树冠下垂的花串，让轮廓更像参考图
  for (let i = 0; i < 14; i += 1) {
    const angle = random() * Math.PI * 2;
    let gap = angle - SWING_GAP;
    gap = Math.atan2(Math.sin(gap), Math.cos(gap));
    if (Math.abs(gap) < 0.62) continue;
    const radius = 1.5 + random() * 0.95;
    const top = 3.55 + random() * 0.5;
    const segments = 3 + Math.floor(random() * 4);
    for (let j = 0; j < segments; j += 1) {
      const size = 0.08 + random() * 0.055;
      items.push({
        position: new THREE.Vector3(
          Math.cos(angle) * radius + (random() - 0.5) * 0.16,
          top - j * 0.17,
          Math.sin(angle) * radius + (random() - 0.5) * 0.16
        ),
        width: size * 1.55,
        height: size * 0.95,
        depth: size * 1.2,
        color: pick(j % 2 === 0 ? PINK.light : PINK.pale, random),
      });
    }
  }

  // 树顶最亮的一撮浅粉
  for (let i = 0; i < 26; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = random() * 1.05;
    items.push({
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        5.5 + random() * 0.5,
        Math.sin(angle) * radius
      ),
      width: 0.14 + random() * 0.12,
      height: 0.09 + random() * 0.07,
      depth: 0.12 + random() * 0.1,
      color: pick(random() < 0.7 ? PINK.pale : PINK.light, random),
    });
  }

  return items;
})();

const BACKING = [
  { position: [0, 4.5, -0.55], scale: [1.7, 0.9, 0.8], color: '#6a3155' },
  { position: [0.5, 4.1, 0.3], scale: [1.2, 0.65, 1.0], color: '#753860' },
  { position: [0.2, 4.2, -0.95], scale: [1.5, 1.0, 0.7], color: '#5f2b4b' },
  { position: [-1.15, 4.0, -0.15], scale: [0.9, 0.85, 0.9], color: '#703a5c' },
  { position: [1.15, 4.05, 0.2], scale: [0.85, 0.8, 0.85], color: '#753860' },
  { position: [0, 3.68, 0.6], scale: [0.85, 0.5, 0.7], color: '#5b2847' },
];

// 樱花花瓣轮廓：整体保持椭圆，只在外端收进一个小缺口。
function createPetalGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1, 0);
  shape.bezierCurveTo(-0.72, 0.82, 0.28, 1.02, 0.9, 0.38);
  shape.quadraticCurveTo(0.82, 0.14, 0.68, 0);
  shape.quadraticCurveTo(0.82, -0.14, 0.9, -0.38);
  shape.bezierCurveTo(0.28, -1.02, -0.72, -0.82, -1, 0);
  const geometry = new THREE.ShapeGeometry(shape, 8);
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  geometry.boundingBox.getSize(size);
  geometry.translate(-center.x, -center.y, 0);
  geometry.scale(2 / size.x, 2 / size.y, 1);
  return geometry;
}

const PETAL_GEOMETRY = createPetalGeometry();

// 主樱花树持续落花：每片花瓣独立错相循环，不依赖交互或花瓣爆发事件。
function FallingPetals() {
  const mesh = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const petals = useMemo(() => {
    const random = mulberry32(91827);
    return Array.from({ length: 96 }, () => {
      const angle = random() * Math.PI * 2;
      const radius = 0.35 + Math.sqrt(random()) * 2.65;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        top: 3.6 + random() * 2.1,
        phase: random(),
        speed: 0.0325 + random() * 0.025,
        driftX: (random() - 0.5) * 1.8,
        driftZ: (random() - 0.5) * 1.4,
        size: 0.035 + random() * 0.04,
        color: pick(random() < 0.55 ? PINK.light : PINK.pale, random),
      };
    });
  }, []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const color = new THREE.Color();
    petals.forEach((petal, index) => {
      mesh.current.setColorAt(index, color.set(petal.color));
    });
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [petals]);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const time = clock.elapsedTime;
    petals.forEach((petal, index) => {
      const fall = (time * petal.speed + petal.phase) % 1;
      const fadeScale = Math.min(1, fall * 12, (1 - fall) * 12);
      dummy.position.set(
        petal.x + petal.driftX * fall + Math.sin(time * 0.7 + petal.phase * 12) * 0.22,
        0.1 + (1 - fall) * petal.top,
        petal.z + petal.driftZ * fall + Math.cos(time * 0.55 + petal.phase * 9) * 0.16
      );
      dummy.rotation.set(
        time * 0.8 + petal.phase * 5,
        time * 1.1 + petal.phase * 8,
        Math.sin(time + petal.phase * 7) * 0.7
      );
      // 椭圆可视面积约为最初矩形的四分之一。
      dummy.scale.set(petal.size * 0.48 * fadeScale, petal.size * 0.24 * fadeScale, 1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[PETAL_GEOMETRY, null, petals.length]} frustumCulled={false}>
      <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

// 地面花瓣浮在草尖上，以固定的小屏幕尺寸保留远景辨识度，不再埋进草叶。
function FallenPetals() {
  const { geometry, texture } = useMemo(() => {
    const random = mulberry32(91828);
    const count = 220;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 0.9 + random() * 1.9;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.115 + random() * 0.02;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      color.set(pick(random() < 0.85 ? PINK.pale : PINK.light, random));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.translate(16, 16);
    ctx.scale(14, -14);
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.bezierCurveTo(-0.72, 0.82, 0.28, 1.02, 0.9, 0.38);
    ctx.quadraticCurveTo(0.82, 0.14, 0.68, 0);
    ctx.quadraticCurveTo(0.82, -0.14, 0.9, -0.38);
    ctx.bezierCurveTo(0.28, -1.02, -0.72, -0.82, -1, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { geometry, texture };
  }, []);

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={2}>
      <pointsMaterial
        map={texture}
        size={3.6}
        sizeAttenuation={false}
        vertexColors
        transparent
        alphaTest={0.08}
        depthWrite={false}
      />
    </points>
  );
}

export default function Sakura() {
  const sway = useRef();
  const blossoms = useRef();

  useLayoutEffect(() => {
    if (!blossoms.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    BLOOMS.forEach((bloom, index) => {
      dummy.position.copy(bloom.position);
      dummy.scale.set(bloom.width, bloom.height, bloom.depth);
      dummy.updateMatrix();
      blossoms.current.setMatrixAt(index, dummy.matrix);
      blossoms.current.setColorAt(index, color.set(bloom.color));
    });
    blossoms.current.instanceMatrix.needsUpdate = true;
    if (blossoms.current.instanceColor) blossoms.current.instanceColor.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    if (!sway.current) return;
    const time = clock.elapsedTime;
    sway.current.rotation.z = Math.sin(time * 0.42) * 0.006;
    sway.current.rotation.x = Math.sin(time * 0.31 + 1.1) * 0.005;
  });

  return (
    <group position={[SAKURA.x, 0, SAKURA.z]} scale={SAKURA_SCALE}>
      {/* 树根与深紫黑树干 */}
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.3, 0.44, 0.42, 8]} />
        <meshLambertMaterial color="#251420" flatShading />
      </mesh>
      <mesh position={[0, 0.9, 0]} rotation={[0, 0, 0.04]}>
        <cylinderGeometry args={[0.23, 0.3, 1.7, 8]} />
        <meshLambertMaterial color="#2f1a26" flatShading />
      </mesh>
      <mesh position={[0.05, 2.15, 0.02]} rotation={[0, 0, 0.07]}>
        <cylinderGeometry args={[0.16, 0.23, 1.25, 8]} />
        <meshLambertMaterial color="#2f1a26" flatShading />
      </mesh>
      <mesh position={[0.14, 3.15, 0.03]} rotation={[0, 0, -0.06]}>
        <cylinderGeometry args={[0.09, 0.16, 1.05, 8]} />
        <meshLambertMaterial color="#2f1a26" flatShading />
      </mesh>

      {/* 树皮纹理与根部外扩 */}
      <mesh position={[0.12, 1.0, 0.235]} rotation={[0, 0, 0.04]}>
        <boxGeometry args={[0.08, 1.25, 0.06]} />
        <meshLambertMaterial color="#422432" />
      </mesh>
      <mesh position={[-0.13, 1.6, 0.2]} rotation={[0, 0, -0.05]}>
        <boxGeometry args={[0.05, 0.85, 0.05]} />
        <meshLambertMaterial color="#3a1f2b" />
      </mesh>
      <mesh position={[0.01, 2.3, 0.18]} rotation={[0, 0, -0.06]}>
        <boxGeometry args={[0.05, 0.9, 0.04]} />
        <meshLambertMaterial color="#422432" />
      </mesh>
      {[
        [0.46, 0.1, 0.3, 0.5, 0.2, 0.26, 0.5],
        [-0.42, 0.09, 0.24, 0.46, 0.18, 0.24, -0.6],
        [0.1, 0.08, -0.46, 0.36, 0.16, 0.42, 1.7],
        [-0.22, 0.08, 0.44, 0.34, 0.16, 0.38, -2.4],
      ].map(([x, y, z, sx, sy, sz, ry], index) => (
        <mesh
          key={index}
          position={[x, y, z]}
          rotation={[0, ry, 0]}
          scale={[sx, sy, sz]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial color="#251420" />
        </mesh>
      ))}

      {/* 秋千枝 + 树冠支撑枝 */}
      <Branch from={[0.1, 2.85, 0.04]} to={[-1.9, 3.45, 0.7]} radius={0.105} />
      <Branch from={[0.12, 3.25, 0.01]} to={[-1.1, 4.35, 0.55]} radius={0.08} />
      <Branch from={[0.14, 3.35, 0]} to={[0.95, 4.35, -0.55]} radius={0.08} />
      <Branch from={[0.1, 3.05, 0.04]} to={[0.5, 4.15, 1.0]} radius={0.07} />
      <Branch from={[0.14, 3.45, 0]} to={[-0.7, 4.55, -0.85]} radius={0.065} />
      <Branch from={[0.12, 3.3, 0]} to={[1.35, 4.0, 0.35]} radius={0.065} />
      <Branch from={[0.16, 3.6, 0.02]} to={[-1.75, 4.75, 0.45]} radius={0.05} />
      <Branch from={[0.16, 3.55, 0.04]} to={[1.65, 4.55, -0.1]} radius={0.05} />
      <Branch from={[0.14, 3.4, 0.04]} to={[0.1, 4.85, 1.35]} radius={0.045} />

      <group ref={sway}>
        {BACKING.map((block, index) => (
          <mesh key={index} position={block.position} scale={block.scale}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={block.color} />
          </mesh>
        ))}

        <instancedMesh ref={blossoms} args={[null, null, BLOOMS.length]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#ffffff" />
        </instancedMesh>
      </group>
      <FallingPetals />
      <FallenPetals />
    </group>
  );
}
