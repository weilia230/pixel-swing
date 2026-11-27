import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../utils/random';
import { shorelineZ, LAND } from '../game/terrain';
import { worldTime } from '../game/time';

const HALO_TEXTURE = (() => {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255, 255, 235, 1)');
  gradient.addColorStop(0.3, 'rgba(236, 255, 175, 0.72)');
  gradient.addColorStop(0.68, 'rgba(205, 242, 120, 0.2)');
  gradient.addColorStop(1, 'rgba(190, 232, 95, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
})();

// 地图扩大两倍后，萤火虫按新的草地范围铺开（数量同步增加）
const FLIES = (() => {
  const random = mulberry32(451);
  const spanX = LAND.maxX - LAND.minX;
  return Array.from({ length: 64 }, (_, index) => {
    const x = LAND.minX + 2 + random() * (spanX - 4);
    const z = shorelineZ(x) + 1 + random() * (LAND.maxZ - shorelineZ(x) - 2.4);
    const base = [x, 0.55 + random() * 2.45, z];
    return {
      base,
      ax: 0.7 + random() * 1.3,
      ay: 0.24 + random() * 0.5,
      az: 0.7 + random() * 1.3,
      sx: 0.16 + random() * 0.2,
      sy: 0.22 + random() * 0.26,
      sz: 0.14 + random() * 0.18,
      px: random() * Math.PI * 2,
      py: random() * Math.PI * 2,
      pz: random() * Math.PI * 2,
      flicker: 1.4 + random() * 2.2,
      phase: random() * Math.PI * 2,
      size: 0.4 + random() * 0.28,
      color: index % 4 === 0 ? '#ffd98a' : '#eaff9c',
    };
  });
})();

export default function Fireflies() {
  const groups = useRef([]);
  const sprites = useRef([]);

  const glowTexture = useMemo(() => HALO_TEXTURE, []);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    FLIES.forEach((fly, index) => {
      const group = groups.current[index];
      if (group) {
        group.position.set(
          fly.base[0] +
            Math.sin(time * fly.sx + fly.px) * fly.ax +
            Math.sin(time * fly.sx * 0.47 + fly.pz) * fly.ax * 0.45,
          fly.base[1] + Math.sin(time * fly.sy + fly.py) * fly.ay,
          fly.base[2] +
            Math.cos(time * fly.sz + fly.pz) * fly.az +
            Math.sin(time * fly.sz * 0.41 + fly.px) * fly.az * 0.4
        );
      }
      const sprite = sprites.current[index];
      if (sprite) {
        const flicker = 0.5 + 0.5 * Math.sin(time * fly.flicker + fly.phase);
        // 白天几乎看不见，黄昏开始出现，夜晚最亮
        const nightGlow = 0.08 + worldTime.night * 0.92;
        sprite.material.opacity = (0.2 + flicker * 0.5) * nightGlow;
      }
    });
  });

  return (
    <group>
      {FLIES.map((fly, index) => (
        <group
          key={index}
          ref={(element) => {
            groups.current[index] = element;
          }}
        >
          <mesh>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
            <meshBasicMaterial color="#fff7b0" toneMapped={false} />
          </mesh>
          <sprite
            ref={(element) => {
              sprites.current[index] = element;
            }}
            scale={[fly.size, fly.size, 1]}
          >
            <spriteMaterial
              map={glowTexture}
              color={fly.color}
              transparent
              opacity={0.6}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </sprite>
        </group>
      ))}
    </group>
  );
}
