import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { heightAt } from '../game/terrain';
import { MOLES, updateMoles } from '../game/moles';

// 现阶段只堆身体：5 档深灰毛色
const C = {
  furA: '#232121',
  furB: '#282626',
  furC: '#2d2a2a',
  furD: '#333030',
  furE: '#3a3636',
  face: '#6e7178',
  paw: '#d8b28c',
  claw: '#0e0c0c',
  nose: '#c8353d',
  fang: '#ffffff',
  eye: '#f4f4f2',
  foot: '#9a9c9f',
};

// 体素：单块边长只用 0.2 / 0.4 / 0.5 / 0.7 / 0.8 / 1 / 1.2 这几档
function buildVoxels() {
  const out = [];
  const occupied = new Set();
  const push = (x, y, z, color, sx = 1, sy = 1, sz = 1, rz = 0) => {
    const key = `${x}|${y}|${z}`;
    if (occupied.has(key)) return;
    occupied.add(key);
    out.push({ x, y, z, color, sx, sy, sz, rz });
  };

  // 身体：大的一头在后，背部圆拱、屁股压低
  for (let z = -9; z <= 4; z += 1) {
    const tz = (z + 2.5) / 7;
    const rz = Math.sqrt(Math.max(0, 1 - tz * tz));
    const halfW = 4.6 * rz;
    let top = 4.0 + 4.2 * rz;
    if (z < -2.5) top -= (-2.5 - z) * 0.25;
    const topInt = Math.floor(top);
    for (let y = 0; y <= topInt; y += 1) {
      const ky = (y - top * 0.38) / (top * 0.62);
      if (Math.abs(ky) > 1) continue;
      const kk = Math.min(Math.abs(ky), 0.9);
      const w = halfW * Math.sqrt(1 - kk * kk);
      if (w < 0.3) continue;
      const vy = y / top;
      for (let x = -5; x <= 5; x += 1) {
        if (Math.abs(x) > w) continue;
        const n = Math.abs(x * 3 + y * 7 + z * 5);
        let color;
        if (z >= 2 && y <= z) color = C.face;
        else if (vy >= 0.72) color = [C.furA, C.furB][n % 2];
        else if (vy >= 0.35) color = [C.furB, C.furC, C.furD][n % 3];
        else color = [C.furC, C.furD, C.furE][n % 3];
        push(x, y, z, color);
      }
    }
  }

  // 小的一头（头）：圆球，等会放眼睛
  for (let z = 2; z <= 8; z += 1) {
    const tz = (z - 5.2) / 3.2;
    if (Math.abs(tz) > 1) continue;
    const rz = Math.sqrt(1 - tz * tz);
    const halfW = 3.5 * rz;
    const cy = 4.2;
    const ry = 3.2 * rz;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      const ky = (y - cy) / ry;
      if (Math.abs(ky) > 1) continue;
      const kk = Math.min(Math.abs(ky), 0.9);
      const w = halfW * Math.sqrt(1 - kk * kk);
      if (w < 0.3) continue;
      for (let x = -4; x <= 4; x += 1) {
        if (Math.abs(x) > w) continue;
        const n = Math.abs(x * 5 + y * 3 + z * 7);
        // 小头前下方的一半改成灰色脸
        const isFace = z >= 4 && y <= cy;
        push(x, y, z, isFace ? C.face : [C.furB, C.furC][n % 2]);
      }
    }
  }

  // 鼻子：灰色与黑色交界处，四颗红色小方块紧密相贴
  for (const nx of [-0.3, 0.3]) {
    for (const ny of [4.2, 4.8]) {
      push(nx, ny, 8.62, C.nose, 0.6, 0.6, 0.3);
    }
  }

  // 鼻子下面两颗白色尖牙：整体加大一圈
  for (const side of [-1, 1]) {
    push(side * 0.42, 3.35, 8.6, C.fang, 0.66, 1.0, 0.32);
    push(side * 0.61, 2.6, 8.6, C.fang, 0.3, 0.52, 0.28);
    push(side * 0.27, 2.6, 8.6, C.fang, 0.36, 0.52, 0.28);
    push(side * 0.42, 2.15, 8.6, C.fang, 0.36, 0.62, 0.28);
  }

  // 灰色尾巴：1 个小像素宽、10 个小像素长（继续加粗）
  for (let j = 0; j < 10; j += 1) {
    push(0, 1.4 + 0.06 * j, -9.2 - 0.4 * j, C.face, 1.3, 1.3, 0.42);
  }

  // 后脚：手臂后方的肚子底部偏后，露出身体轮廓外
  push(-4.2, 0.35, -2.0, C.foot, 1.6, 0.7, 1.8);
  push(4.2, 0.35, -2.0, C.foot, 1.6, 0.7, 1.8);

  // 手臂：长梨形，从腋下垂直向前下方延伸到接近地面
  for (const side of [-1, 1]) {
    const ax = side * 3.1;
    const ay = 4.2;
    const az = 4.2;
    const bx = side * 3.2;
    const by = 1.7;
    const bz = 6.4;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const len2 = abx * abx + aby * aby + abz * abz;
    for (let x = -6; x <= 6; x += 1) {
      for (let y = 0; y <= 7; y += 1) {
        for (let z = 2; z <= 9; z += 1) {
          const t = Math.max(0, Math.min(1,
            ((x - ax) * abx + (y - ay) * aby + (z - az) * abz) / len2));
          const r = 0.5 + 1.2 * Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.82) ** 2));
          const cx = ax + abx * t;
          const cy2 = ay + aby * t;
          const cz = az + abz * t;
          const dx = (x - cx) / (r * 0.82);
          const dy = (y - cy2) / r;
          const dz = (z - cz) / r;
          if (dx * dx + dy * dy + dz * dz <= 1) push(x, y, z, C.paw);
        }
      }
    }
    // 三根直爪：长在梨形大头的正前方，平行向前下方伸出去
    const hrx = 1.67 * 0.82;
    const hry = 1.67;
    const hrz = 1.67;
    for (let i = -1; i <= 1; i += 1) {
      const x0 = bx + i * 1.1;
      const y0 = 1.5;
      const inside = 1 - ((x0 - bx) / hrx) ** 2 - ((y0 - by) / hry) ** 2;
      const z0 = bz + hrz * Math.sqrt(Math.max(0, inside));
      for (let j = 0; j < 7; j += 1) {
        push(x0 - side * 0.05 * j, y0 - 0.22 * j, z0 + 0.3 * j, C.claw, 0.4, 0.4, 0.4);
      }
    }
  }

  return out;
}

export function MoleBody() {
  const meshRef = useRef(null);
  const voxels = useMemo(() => buildVoxels(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    voxels.forEach((voxel, index) => {
      position.set(voxel.x, voxel.y, voxel.z);
      scale.set(voxel.sx, voxel.sy, voxel.sz);
      euler.set(0, 0, voxel.rz || 0);
      quaternion.setFromEuler(euler);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(voxel.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [voxels]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, voxels.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

// 驯服后的头顶爱心
function Heart() {
  return (
    <group>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.08, 0.08, 0.04]} />
        <meshLambertMaterial color="#ff6b8a" />
      </mesh>
      <mesh position={[-0.058, 0.05, 0]}>
        <boxGeometry args={[0.055, 0.055, 0.04]} />
        <meshLambertMaterial color="#ff8ea4" />
      </mesh>
      <mesh position={[0.058, 0.05, 0]}>
        <boxGeometry args={[0.055, 0.055, 0.04]} />
        <meshLambertMaterial color="#ff8ea4" />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.055, 0.055, 0.04]} />
        <meshLambertMaterial color="#ffb1c0" />
      </mesh>
    </group>
  );
}

export default function Moles() {
  const groups = useRef([]);
  const hearts = useRef([]);
  const shadows = useRef([]);

  useFrame(({ clock }, delta) => {
    updateMoles(delta);
    const time = clock.elapsedTime;

    MOLES.forEach((mole, index) => {
      const group = groups.current[index];
      if (!group) return;
      const ground = heightAt(mole.x, mole.z);
      const bob = Math.abs(Math.sin(mole.step)) * 0.05 * mole.moving;
      group.position.set(mole.x, ground + bob, mole.z);
      group.rotation.y = mole.heading;
      // 左右摇摆的小步 + 蓄力后仰 / 嗅探前倾
      group.rotation.z = Math.sin(mole.step) * 0.06 * mole.moving;
      const lean = (mole.state === 'alert' ? -0.16 : 0)
        + (mole.sniff > 0 || mole.state === 'raid' ? 0.08 : 0);
      group.rotation.x += (lean - group.rotation.x) * Math.min(1, delta * 8);

      const heart = hearts.current[index];
      if (heart) {
        heart.visible = mole.tamed;
        if (mole.tamed) {
          heart.position.y = 1.16 + Math.sin(time * 3 + index) * 0.05;
          heart.scale.setScalar(1 + Math.sin(time * 5) * 0.08);
        }
      }

      const shadow = shadows.current[index];
      if (shadow) {
        shadow.position.x = mole.x;
        shadow.position.z = mole.z;
        shadow.position.y = ground + 0.05;
        shadow.scale.setScalar(1 - bob * 2);
      }
    });
  });

  return (
    <group>
      {MOLES.map((mole, index) => (
        <group
          key={mole.id}
          ref={(element) => {
            groups.current[index] = element;
          }}
        >
          <group scale={0.1}>
            <MoleBody />
          </group>
          <group
            ref={(element) => {
              hearts.current[index] = element;
            }}
          >
            <Heart />
          </group>
        </group>
      ))}
      {MOLES.map((mole, index) => (
        <mesh
          key={`mole-shadow-${mole.id}`}
          ref={(element) => {
            shadows.current[index] = element;
          }}
          rotation-x={-Math.PI / 2}
          position={[mole.x, 0.05, mole.z]}
        >
          <circleGeometry args={[0.62, 10]} />
          <meshBasicMaterial color="#221826" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
