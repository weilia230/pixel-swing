import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { HOUSE, HOUSE_LOCAL, HOUSE_SCALE } from '../game/terrain';
import { houseDoor, player } from '../game/runtime';

const WALL = '#e7d2a5';
const WALL_SHADE = '#cdb489';
const STONE = '#5d5550';
const STONE_LIGHT = '#70665e';
const TIMBER = '#5b3b2c';
const TIMBER_LIGHT = '#7c5238';
const ROOF = '#8c3f3d';
const ROOF_DARK = '#6c2b2f';
const ROOF_LIGHT = '#a4514a';
const DOOR_WOOD = '#8a5a34';
const DOOR_DARK = '#684226';
const FRAME = '#4e3226';
const GLOW = '#ffd58c';
const GLOW_SOFT = '#ffe7b8';

// 建模使用未放大的局部尺寸，整个房子再统一 ×HOUSE_SCALE
const W = HOUSE_LOCAL.width;
const D = HOUSE_LOCAL.depth;
const T = HOUSE_LOCAL.wall;
const H = HOUSE_LOCAL.wallHeight;
const BASE_Y = 0.06;
const DOOR_W = HOUSE_LOCAL.doorWidth;
const DOOR_H = HOUSE_LOCAL.doorHeight;

function Box({ size, position, color, ...rest }) {
  return (
    <mesh position={position} {...rest}>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} side={2} />
    </mesh>
  );
}

// 屋顶整体跟着墙高上移（墙高 4.2 → 7.0，+2.8）
const ROOF_LAYERS = [
  { w: W + 1.0, d: D + 1.0, y: 7.3, color: ROOF_DARK },
  { w: W + 0.2, d: D + 0.2, y: 7.6, color: ROOF },
  { w: 10.0, d: 7.6, y: 7.9, color: ROOF_LIGHT },
  { w: 7.2, d: 5.4, y: 8.2, color: ROOF },
  { w: 4.4, d: 3.4, y: 8.48, color: ROOF_DARK },
];

const SMOKE_X = 3.2;
const SMOKE_Z = -2.2;

export default function House() {
  const smoke = useRef([]);
  const roofGroup = useRef();
  const shellGroup = useRef();
  const doorGroup = useRef();

  useFrame(({ clock, camera }, delta) => {
    const time = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);

    // 门板开合：关着时挡住门洞，开门后向内摆开
    const target = houseDoor.open ? -1.25 : 0;
    houseDoor.angle += (target - houseDoor.angle) * Math.min(1, dt * 7);
    if (doorGroup.current) doorGroup.current.rotation.y = houseDoor.angle;
    // 相机与角色之间隔着房子时（自由旋转可能出现），隐藏外壳，保证角色不被挡出视野
    let occluded = false;
    if (!player.inside) {
      const px = player.position.x - HOUSE.x;
      const pz = player.position.z - HOUSE.z;
      const cx = camera.position.x - HOUSE.x;
      const cz = camera.position.z - HOUSE.z;
      const minX = -HOUSE.width / 2 - 0.35;
      const maxX = HOUSE.width / 2 + 0.35;
      const minZ = -HOUSE.depth / 2 - 0.35;
      const maxZ = HOUSE.depth / 2 + 0.35;
      for (let i = 1; i < 8; i += 1) {
        const t = i / 8;
        const x = px + (cx - px) * t;
        const z = pz + (cz - pz) * t;
        if (x > minX && x < maxX && z > minZ && z < maxZ) {
          occluded = true;
          break;
        }
      }
    }
    const hidden = !!player.inside || occluded;
    // 进屋后隐藏屋顶与整圈外墙，让相机以「娃娃屋」方式看进室内
    if (roofGroup.current) roofGroup.current.visible = !hidden;
    if (shellGroup.current) shellGroup.current.visible = !hidden;

    smoke.current.forEach((mesh, index) => {
      if (!mesh) return;
      mesh.visible = !hidden;
      const progress = (time * 0.22 + index * 0.34) % 1;
      mesh.position.y = 9.7 + progress * 2.1;
      mesh.position.x = SMOKE_X + Math.sin(time * 0.7 + index * 1.9) * 0.22;
      const scale = 0.34 + progress * 0.55;
      mesh.scale.setScalar(scale);
      mesh.material.opacity = 0.3 * (1 - progress);
    });
  });

  const segW = W / 2 - DOOR_W / 2;
  const segX = DOOR_W / 2 + segW / 2;

  return (
    <group position={[HOUSE.x, 0, HOUSE.z]} scale={HOUSE_SCALE}>
      {/* 石砌地基：整体压在地面以下，顶面低于室内地板，避免地板穿模 */}
      <Box size={[W + 0.9, 0.3, D + 0.9]} position={[0, -0.11, 0]} color={STONE} />
      <Box size={[W + 0.5, 0.22, D + 0.5]} position={[0, -0.04, 0]} color={STONE_LIGHT} />

      <group ref={shellGroup}>
        {/* 四面外墙（南墙留门洞） */}
        <Box size={[W, H, T]} position={[0, BASE_Y + H / 2, -D / 2 + T / 2]} color={WALL} />
        <Box size={[T, H, D]} position={[-W / 2 + T / 2, BASE_Y + H / 2, 0]} color={WALL} />
        <Box size={[T, H, D]} position={[W / 2 - T / 2, BASE_Y + H / 2, 0]} color={WALL} />
        <Box size={[segW, H, T]} position={[-segX, BASE_Y + H / 2, D / 2 - T / 2]} color={WALL} />
        <Box size={[segW, H, T]} position={[segX, BASE_Y + H / 2, D / 2 - T / 2]} color={WALL} />
        {/* 门楣 */}
        <Box
          size={[DOOR_W, H - DOOR_H, T]}
          position={[0, BASE_Y + DOOR_H + (H - DOOR_H) / 2, D / 2 - T / 2]}
          color={WALL_SHADE}
        />

        {/* 木梁骨架：四角立柱 + 顶部横梁 */}
        {[
          [-W / 2 + 0.14, -D / 2 + 0.14],
          [W / 2 - 0.14, -D / 2 + 0.14],
          [-W / 2 + 0.14, D / 2 - 0.14],
          [W / 2 - 0.14, D / 2 - 0.14],
        ].map(([x, z]) => (
          <Box key={`${x}-${z}`} size={[0.2, H, 0.2]} position={[x, BASE_Y + H / 2, z]} color={TIMBER} />
        ))}
        <Box size={[W + 0.08, 0.18, 0.16]} position={[0, BASE_Y + H - 0.1, D / 2 - T / 2]} color={TIMBER} />
        <Box size={[W + 0.08, 0.16, 0.16]} position={[0, BASE_Y + H - 0.1, -D / 2 + T / 2]} color={TIMBER} />
        <Box size={[0.16, 0.16, D]} position={[-W / 2 + T / 2, BASE_Y + H - 0.1, 0]} color={TIMBER} />
        <Box size={[0.16, 0.16, D]} position={[W / 2 - T / 2, BASE_Y + H - 0.1, 0]} color={TIMBER} />

        {/* 石砌墙裙：四面都压一圈，侧面不再是整块平墙（南墙给门留口） */}
        <Box size={[(W - DOOR_W) / 2, 0.8, 0.1]} position={[-(DOOR_W / 2 + (W - DOOR_W) / 4), BASE_Y + 0.4, D / 2 + 0.02]} color={STONE} />
        <Box size={[(W - DOOR_W) / 2, 0.8, 0.1]} position={[DOOR_W / 2 + (W - DOOR_W) / 4, BASE_Y + 0.4, D / 2 + 0.02]} color={STONE} />
        <Box size={[W + 0.08, 0.8, 0.1]} position={[0, BASE_Y + 0.4, -D / 2 - 0.02]} color={STONE} />
        <Box size={[0.1, 0.8, D + 0.08]} position={[W / 2 + 0.02, BASE_Y + 0.4, 0]} color={STONE} />
        <Box size={[0.1, 0.8, D + 0.08]} position={[-W / 2 - 0.02, BASE_Y + 0.4, 0]} color={STONE} />
        {[-0.3, 0.15, 0.6].map((offset) => (
          <Box key={`sm-${offset}`} size={[W + 0.1, 0.06, 0.12]} position={[0, BASE_Y + 0.4 + offset, -D / 2 - 0.03]} color={STONE_LIGHT} />
        ))}

        {/* 四面横向木梁与竖向立柱，增加屋身层次 */}
        {[0.38, 0.7].map((k) => (
          <group key={`beam-${k}`}>
            <Box size={[W + 0.1, 0.15, 0.09]} position={[0, BASE_Y + H * k, D / 2 + 0.02]} color={TIMBER} />
            <Box size={[W + 0.1, 0.15, 0.09]} position={[0, BASE_Y + H * k, -D / 2 - 0.02]} color={TIMBER} />
            <Box size={[0.09, 0.15, D + 0.1]} position={[W / 2 + 0.02, BASE_Y + H * k, 0]} color={TIMBER} />
            <Box size={[0.09, 0.15, D + 0.1]} position={[-W / 2 - 0.02, BASE_Y + H * k, 0]} color={TIMBER} />
          </group>
        ))}
        {[-1, -0.33, 0.33, 1].map((k) => (
          <group key={`stud-${k}`}>
            <Box size={[0.12, H * 0.72, 0.08]} position={[k * W * 0.4, BASE_Y + H * 0.48, -D / 2 - 0.02]} color={TIMBER_LIGHT} />
            <Box size={[0.08, H * 0.72, 0.12]} position={[W / 2 + 0.02, BASE_Y + H * 0.48, k * D * 0.4]} color={TIMBER_LIGHT} />
            <Box size={[0.08, H * 0.72, 0.12]} position={[-W / 2 - 0.02, BASE_Y + H * 0.48, k * D * 0.4]} color={TIMBER_LIGHT} />
          </group>
        ))}

        {/* 门框 + 半开木门 */}
        <Box size={[0.16, DOOR_H + 0.2, 0.22]} position={[-DOOR_W / 2 - 0.06, BASE_Y + DOOR_H / 2, D / 2 - 0.02]} color={FRAME} />
        <Box size={[0.16, DOOR_H + 0.2, 0.22]} position={[DOOR_W / 2 + 0.06, BASE_Y + DOOR_H / 2, D / 2 - 0.02]} color={FRAME} />
        <Box size={[DOOR_W + 0.48, 0.18, 0.22]} position={[0, BASE_Y + DOOR_H + 0.09, D / 2 - 0.02]} color={FRAME} />
        <group ref={doorGroup} position={[-DOOR_W / 2, BASE_Y, D / 2 - 0.12]} rotation={[0, 0, 0]}>
          <Box size={[DOOR_W - 0.1, DOOR_H - 0.08, 0.1]} position={[(DOOR_W - 0.1) / 2, (DOOR_H - 0.08) / 2, 0]} color={DOOR_WOOD} />
          {[0.22, 0.5, 0.78].map((k) => (
            <Box
              key={k}
              size={[0.06, DOOR_H - 0.26, 0.04]}
              position={[(DOOR_W - 0.1) * k, (DOOR_H - 0.08) / 2, 0.06]}
              color={DOOR_DARK}
            />
          ))}
          <Box size={[DOOR_W - 0.3, 0.09, 0.04]} position={[(DOOR_W - 0.1) / 2, DOOR_H * 0.55, 0.06]} color={DOOR_DARK} />
          <Box size={[0.09, 0.11, 0.08]} position={[DOOR_W - 0.28, DOOR_H * 0.48, 0.08]} color="#d8a94a" />
        </group>

        {/* 南墙暖光窗 */}
        {[-3.9, 3.9].map((x) => (
          <group key={x} position={[x, 3.6, D / 2 + 0.01]}>
            <Box size={[1.5, 1.2, 0.12]} position={[0, 0, 0]} color={FRAME} />
            <Box size={[1.3, 1.0, 0.06]} position={[0, 0, 0.05]} color={GLOW} />
            <Box size={[0.07, 1.0, 0.04]} position={[0, 0, 0.09]} color={FRAME} />
            <Box size={[1.3, 0.07, 0.04]} position={[0, 0, 0.09]} color={FRAME} />
            <Box size={[1.6, 0.12, 0.18]} position={[0, -0.62, 0.02]} color={TIMBER} />
          </group>
        ))}

        {/* 门灯 */}
        <Box size={[0.12, 0.4, 0.12]} position={[1.25, 2.66, D / 2 + 0.08]} color={FRAME} />
        <Box size={[0.3, 0.34, 0.3]} position={[1.25, 2.38, D / 2 + 0.1]} color={FRAME} />
        <Box size={[0.18, 0.22, 0.32]} position={[1.25, 2.38, D / 2 + 0.12]} color={GLOW_SOFT} />

        {/* 东墙 / 西墙 / 北墙暖光窗 */}
        <group position={[W / 2 - 0.02, 3.6, 1.8]} rotation={[0, Math.PI / 2, 0]}>
          <Box size={[1.3, 1.1, 0.12]} position={[0, 0, 0]} color={FRAME} />
          <Box size={[1.1, 0.9, 0.06]} position={[0, 0, 0.05]} color={GLOW} />
          <Box size={[0.06, 0.9, 0.04]} position={[0, 0, 0.09]} color={FRAME} />
          <Box size={[1.1, 0.06, 0.04]} position={[0, 0, 0.09]} color={FRAME} />
          <Box size={[1.25, 0.14, 0.24]} position={[0, -0.58, 0.06]} color={TIMBER} />
          {[-0.4, 0, 0.4].map((fx) => (
            <Box key={fx} size={[0.12, 0.16, 0.14]} position={[fx, -0.46, 0.12]} color={fx === 0 ? '#f2a2c2' : '#f7c9da'} />
          ))}
        </group>
        {[-1.5, 1.5].map((z) => (
          <group key={`ww-${z}`} position={[-W / 2 + 0.02, 3.6, z]} rotation={[0, -Math.PI / 2, 0]}>
            <Box size={[1.3, 1.1, 0.12]} position={[0, 0, 0]} color={FRAME} />
            <Box size={[1.1, 0.9, 0.06]} position={[0, 0, 0.05]} color={GLOW} />
            <Box size={[0.06, 0.9, 0.04]} position={[0, 0, 0.09]} color={FRAME} />
            <Box size={[1.1, 0.06, 0.04]} position={[0, 0, 0.09]} color={FRAME} />
          </group>
        ))}
        <group position={[-2.6, 4.1, -D / 2 + 0.02]} rotation={[0, Math.PI, 0]}>
          <Box size={[1.2, 1.0, 0.12]} position={[0, 0, 0]} color={FRAME} />
          <Box size={[1.0, 0.8, 0.06]} position={[0, 0, 0.05]} color={GLOW_SOFT} />
          <Box size={[0.06, 0.8, 0.04]} position={[0, 0, 0.09]} color={FRAME} />
          <Box size={[1.0, 0.06, 0.04]} position={[0, 0, 0.09]} color={FRAME} />
        </group>

        {/* 门前台阶 */}
        <Box size={[DOOR_W + 0.5, 0.14, 0.9]} position={[0, 0.03, D / 2 + 0.5]} color={STONE_LIGHT} />
        <Box size={[DOOR_W + 0.2, 0.12, 0.5]} position={[0, 0.13, D / 2 + 0.28]} color={STONE} />
      </group>

      <pointLight position={[1.25, 2.4, D / 2 + 0.9]} color="#ffb46f" intensity={0.9} distance={8} />

      {/* 屋顶 + 烟囱 + 炊烟（进屋时隐藏） */}
      <group ref={roofGroup}>
        <Box size={[W + 0.75, 0.22, D + 0.75]} position={[0, 7.12, 0]} color={WALL_SHADE} />
        {ROOF_LAYERS.map((layer, index) => (
          <group key={index}>
            <Box size={[layer.w, 0.3, layer.d]} position={[0, layer.y, 0]} color={layer.color} />
            <Box
              size={[layer.w + 0.12, 0.09, 0.16]}
              position={[0, layer.y + 0.11, layer.d / 2]}
              color={ROOF_DARK}
            />
          </group>
        ))}
        <Box size={[1.4, 0.2, 0.6]} position={[0, 8.7, 0]} color={ROOF_DARK} />
        <Box size={[0.24, 0.12, 0.42]} position={[0, 8.82, 0]} color={ROOF_LIGHT} />

        {/* 烟囱与炊烟 */}
        <Box size={[1.1, 3.4, 1.1]} position={[SMOKE_X, 8.15, SMOKE_Z]} color={STONE} />
        <Box size={[1.3, 0.2, 1.3]} position={[SMOKE_X, 9.85, SMOKE_Z]} color={STONE_LIGHT} />
        {[0, 1, 2].map((index) => (
          <mesh
            key={index}
            ref={(element) => {
              smoke.current[index] = element;
            }}
            position={[SMOKE_X, 6.9, SMOKE_Z]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshLambertMaterial color="#d9c7c2" transparent opacity={0.3} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* 墙角灌木 */}
      <group position={[-W / 2 - 0.45, 0.34, D / 2 + 0.3]}>
        <Box size={[0.8, 0.62, 0.8]} position={[0, 0, 0]} color="#4f6a35" />
        <Box size={[0.54, 0.42, 0.54]} position={[0.12, 0.34, 0.06]} color="#5d7a3c" />
        <Box size={[0.11, 0.11, 0.11]} position={[0.1, 0.56, 0.18]} color="#f2a2c2" />
        <Box size={[0.1, 0.1, 0.1]} position={[-0.2, 0.52, 0.08]} color="#f7b6cf" />
      </group>
      <group position={[W / 2 + 0.5, 0.3, D / 2 + 0.28]}>
        <Box size={[0.68, 0.56, 0.68]} position={[0, 0, 0]} color="#4f6a35" />
        <Box size={[0.46, 0.38, 0.46]} position={[-0.1, 0.32, 0]} color="#5d7a3c" />
        <Box size={[0.1, 0.1, 0.1]} position={[-0.06, 0.52, 0.16]} color="#ffe3ef" />
      </group>
    </group>
  );
}
