import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { WAREHOUSE, CHESTS } from '../game/terrain';
import { player, warehouseDoor } from '../game/runtime';

const W = WAREHOUSE.width;
const D = WAREHOUSE.depth;
const T = WAREHOUSE.wall;
const H = WAREHOUSE.wallHeight;
const DOOR_W = WAREHOUSE.doorWidth;
const DOOR_H = WAREHOUSE.doorHeight;
const BASE_Y = 0.06;

const WALL = '#dfc9a0';
const WALL_SHADE = '#c3a97f';
const TIMBER = '#5b3b2c';
const TIMBER_LIGHT = '#7c5238';
const STONE = '#5d5550';
const STONE_LIGHT = '#70665e';
const ROOF = '#7a4b3c';
const ROOF_DARK = '#5c352c';
const DOOR_WOOD = '#8a5a34';
const DOOR_DARK = '#684226';
const FRAME = '#4e3226';
const GLOW = '#ffd58c';

function Box({ size, position, color, ...rest }) {
  return (
    <mesh position={position} {...rest}>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} side={2} />
    </mesh>
  );
}

function Chest({ x, z, lidRef }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[1.05, 0.62, 0.72]} />
        <meshLambertMaterial color="#8a5a34" />
      </mesh>
      <mesh position={[0, 0.36, 0.365]}>
        <boxGeometry args={[0.95, 0.36, 0.03]} />
        <meshLambertMaterial color="#6d4527" />
      </mesh>
      {/* 箱盖：靠近时掀开 */}
      <group ref={lidRef} position={[0, 0.56, -0.36]}>
        <mesh position={[0, 0.09, 0.36]}>
          <boxGeometry args={[1.09, 0.2, 0.76]} />
          <meshLambertMaterial color="#96663c" />
        </mesh>
        <mesh position={[0, 0.02, 0.72]}>
          <boxGeometry args={[0.22, 0.16, 0.06]} />
          <meshLambertMaterial color="#d8a94a" />
        </mesh>
      </group>
      {/* 铁箍 */}
      <mesh position={[-0.3, 0.24, 0]}>
        <boxGeometry args={[0.07, 0.66, 0.76]} />
        <meshLambertMaterial color="#4a4048" />
      </mesh>
      <mesh position={[0.3, 0.24, 0]}>
        <boxGeometry args={[0.07, 0.66, 0.76]} />
        <meshLambertMaterial color="#4a4048" />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[1.1, 0.1, 0.78]} />
        <meshLambertMaterial color="#5d3a24" />
      </mesh>
    </group>
  );
}

export default function Warehouse() {
  const roofGroup = useRef();
  const shellGroup = useRef();
  const doorGroup = useRef();
  const lidRefs = useRef([]);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 1 / 30);

    // 门板开合动画
    const target = warehouseDoor.open ? -1.42 : 0;
    warehouseDoor.angle += (target - warehouseDoor.angle) * Math.min(1, dt * 7);
    if (doorGroup.current) doorGroup.current.rotation.y = warehouseDoor.angle;

    // 玩家站在仓库里 / 相机被仓库挡住时隐藏外壳与屋顶，方便看到室内
    let hidden = player.insideKind === 'warehouse';
    if (!hidden) {
      const px = player.position.x - WAREHOUSE.x;
      const pz = player.position.z - WAREHOUSE.z;
      const cx = camera.position.x - WAREHOUSE.x;
      const cz = camera.position.z - WAREHOUSE.z;
      const insideFootprint = (x, z) =>
        x > -W / 2 - 0.3 && x < W / 2 + 0.3 && z > -D / 2 - 0.3 && z < D / 2 + 0.3;
      for (let i = 1; i < 7; i += 1) {
        const t = i / 7;
        if (insideFootprint(cx + (px - cx) * t, cz + (pz - cz) * t)) {
          hidden = true;
          break;
        }
      }
    }
    if (roofGroup.current) roofGroup.current.visible = !hidden;
    if (shellGroup.current) shellGroup.current.visible = !hidden;

    // 靠近箱子时掀盖
    lidRefs.current.forEach((lid, index) => {
      if (!lid) return;
      const open = player.nearChest === index ? -1.0 : 0;
      lid.rotation.x += (open - lid.rotation.x) * Math.min(1, dt * 8);
    });
  });

  const segW = W / 2 - DOOR_W / 2;
  const segX = DOOR_W / 2 + segW / 2;

  return (
    <group position={[WAREHOUSE.x, 0, WAREHOUSE.z]}>
      {/* 石砌地基 */}
      <Box size={[W + 0.7, 0.3, D + 0.7]} position={[0, -0.11, 0]} color={STONE} />
      <Box size={[W + 0.4, 0.22, D + 0.4]} position={[0, -0.04, 0]} color={STONE_LIGHT} />

      <group ref={shellGroup}>
        {/* 四面墙（南墙留门洞） */}
        <Box size={[W, H, T]} position={[0, BASE_Y + H / 2, -D / 2 + T / 2]} color={WALL} />
        <Box size={[T, H, D]} position={[-W / 2 + T / 2, BASE_Y + H / 2, 0]} color={WALL} />
        <Box size={[T, H, D]} position={[W / 2 - T / 2, BASE_Y + H / 2, 0]} color={WALL} />
        <Box size={[segW, H, T]} position={[-segX, BASE_Y + H / 2, D / 2 - T / 2]} color={WALL} />
        <Box size={[segW, H, T]} position={[segX, BASE_Y + H / 2, D / 2 - T / 2]} color={WALL} />
        <Box
          size={[DOOR_W, H - DOOR_H, T]}
          position={[0, BASE_Y + DOOR_H + (H - DOOR_H) / 2, D / 2 - T / 2]}
          color={WALL_SHADE}
        />

        {/* 木梁骨架 */}
        {[
          [-W / 2 + 0.13, -D / 2 + 0.13],
          [W / 2 - 0.13, -D / 2 + 0.13],
          [-W / 2 + 0.13, D / 2 - 0.13],
          [W / 2 - 0.13, D / 2 - 0.13],
        ].map(([x, z]) => (
          <Box key={`${x}-${z}`} size={[0.18, H, 0.18]} position={[x, BASE_Y + H / 2, z]} color={TIMBER} />
        ))}
        <Box size={[W + 0.06, 0.16, 0.14]} position={[0, BASE_Y + H - 0.1, D / 2 - T / 2]} color={TIMBER} />

        {/* 门框 */}
        <Box size={[0.14, DOOR_H + 0.18, 0.2]} position={[-DOOR_W / 2 - 0.05, BASE_Y + DOOR_H / 2, D / 2 - 0.02]} color={FRAME} />
        <Box size={[0.14, DOOR_H + 0.18, 0.2]} position={[DOOR_W / 2 + 0.05, BASE_Y + DOOR_H / 2, D / 2 - 0.02]} color={FRAME} />
        <Box size={[DOOR_W + 0.42, 0.16, 0.2]} position={[0, BASE_Y + DOOR_H + 0.08, D / 2 - 0.02]} color={FRAME} />

        {/* 门板：绕左侧门轴开合 */}
        <group ref={doorGroup} position={[-DOOR_W / 2, BASE_Y, D / 2 - 0.1]}>
          <Box size={[DOOR_W - 0.08, DOOR_H - 0.06, 0.1]} position={[(DOOR_W - 0.08) / 2, (DOOR_H - 0.06) / 2, 0]} color={DOOR_WOOD} />
          {[0.26, 0.56, 0.84].map((k) => (
            <Box
              key={k}
              size={[0.06, DOOR_H - 0.24, 0.04]}
              position={[(DOOR_W - 0.08) * k, (DOOR_H - 0.06) / 2, 0.06]}
              color={DOOR_DARK}
            />
          ))}
          <Box size={[0.08, 0.1, 0.07]} position={[DOOR_W - 0.26, DOOR_H * 0.46, 0.08]} color="#d8a94a" />
        </group>

        {/* 南墙小窗 */}
        <group position={[W / 2 - 1.5, 2.9, D / 2 + 0.01]}>
          <Box size={[1.0, 0.9, 0.10]} position={[0, 0, 0]} color={FRAME} />
          <Box size={[0.84, 0.74, 0.05]} position={[0, 0, 0.05]} color={GLOW} />
          <Box size={[0.06, 0.74, 0.03]} position={[0, 0, 0.08]} color={FRAME} />
        </group>

        {/* 墙上的小灯 */}
        <Box size={[0.2, 0.34, 0.14]} position={[0, 3.2, -D / 2 + T + 0.06]} color={FRAME} />
        <mesh position={[0, 3.2, -D / 2 + T + 0.14]}>
          <boxGeometry args={[0.16, 0.2, 0.08]} />
          <meshBasicMaterial color={GLOW} toneMapped={false} />
        </mesh>
      </group>

      {/* 室内陈设独立于外壳：进屋隐藏墙顶时，地板 / 箱子 / 灯光仍然可见 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.045, 0]}>
        <planeGeometry args={[W - T * 2, D - T * 2]} />
        <meshLambertMaterial color="#9a7a55" />
      </mesh>

      {CHESTS.map((chest, index) => (
        <Chest
          key={index}
          x={chest.x - WAREHOUSE.x}
          z={chest.z - WAREHOUSE.z}
          lidRef={(element) => {
            lidRefs.current[index] = element;
          }}
        />
      ))}

      <pointLight position={[0, 3.1, -D / 2 + T + 0.5]} color="#ffc27a" intensity={1.1} distance={9} />

      {/* 屋顶 */}
      <group ref={roofGroup}>
        <Box size={[W + 0.6, 0.22, D + 0.6]} position={[0, H + 0.12, 0]} color={WALL_SHADE} />
        <Box size={[W + 0.9, 0.26, D + 0.9]} position={[0, H + 0.32, 0]} color={ROOF_DARK} />
        <Box size={[W + 0.4, 0.28, D + 0.4]} position={[0, H + 0.6, 0]} color={ROOF} />
        <Box size={[W - 0.8, 0.3, D - 0.8]} position={[0, H + 0.87, 0]} color={ROOF_DARK} />
      </group>

      {/* 门口台阶 */}
      <Box size={[DOOR_W + 0.5, 0.14, 0.8]} position={[0, 0.03, D / 2 + 0.45]} color={STONE_LIGHT} />
      <Box size={[DOOR_W + 0.2, 0.12, 0.4]} position={[0, 0.13, D / 2 + 0.25]} color={STONE} />
    </group>
  );
}
