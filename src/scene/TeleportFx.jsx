// 传送落点的像素闪光特效：一圈白光扩散 + 金色像素粒子上迸。
// 监听 window 'teleport-fx' 事件 {x, z} 触发。
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAt } from '../game/terrain';

const COUNT = 42;
const COLORS = [0xffffff, 0xffe9a8, 0xffd166, 0xffffff];

export default function TeleportFx() {
  const meshRef = useRef();
  const ringRef = useRef();
  const particles = useRef(
    Array.from({ length: COUNT }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, color: 0xffffff,
    }))
  ).current;
  const active = useRef(false);
  const ring = useRef({ life: 0 });

  useEffect(() => {
    const onFx = (event) => {
      const { x = 0, z = 0 } = event.detail || {};
      const baseY = heightAt(x, z) + 0.2;
      particles.forEach((p) => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.4 + Math.random() * 3.4;
        p.x = x + (Math.random() - 0.5) * 0.8;
        p.y = baseY + Math.random() * 0.6;
        p.z = z + (Math.random() - 0.5) * 0.8;
        p.vx = Math.cos(angle) * speed;
        p.vz = Math.sin(angle) * speed;
        p.vy = 2.4 + Math.random() * 3.6;
        p.life = 0;
        p.max = 0.55 + Math.random() * 0.5;
        p.size = 0.32 + Math.random() * 0.5;
        p.color = COLORS[(Math.random() * COLORS.length) | 0];
      });
      ring.current = { life: 0.001, x, z, y: baseY };
      active.current = true;
      if (meshRef.current) meshRef.current.visible = true;
      if (ringRef.current) ringRef.current.visible = true;
    };
    window.addEventListener('teleport-fx', onFx);
    return () => window.removeEventListener('teleport-fx', onFx);
  }, [particles]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    // 粒子
    if (meshRef.current) {
      let alive = false;
      for (let i = 0; i < COUNT; i += 1) {
        const p = particles[i];
        if (p.life >= p.max) {
          dummy.scale.setScalar(0.0001);
          dummy.updateMatrix();
          meshRef.current.setMatrixAt(i, dummy.matrix);
          continue;
        }
        alive = true;
        p.life += dt;
        p.vy -= 13 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const fade = Math.max(0, 1 - p.life / p.max);
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.life * 5, p.life * 4, 0);
        dummy.scale.setScalar(p.size * fade);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        meshRef.current.setColorAt(i, tint.setHex(p.color));
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
      if (!alive) {
        active.current = false;
        meshRef.current.visible = false;
      }
    }

    // 扩散光环
    if (ringRef.current && ring.current.life > 0) {
      ring.current.life += dt;
      const t = ring.current.life / 0.55;
      if (t >= 1) {
        ring.current.life = 0;
        ringRef.current.visible = false;
      } else {
        ringRef.current.visible = true;
        ringRef.current.position.set(ring.current.x, ring.current.y + 0.15, ring.current.z);
        const s = 1.2 + t * 5.5;
        ringRef.current.scale.setScalar(s);
        const mat = ringRef.current.material;
        if (mat) mat.opacity = (1 - t) * 0.9;
      }
    }
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} visible={false} frustumCulled={false}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.85, 1.0, 24]} />
        <meshBasicMaterial color="#fff1c8" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}
