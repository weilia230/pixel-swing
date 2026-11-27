import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getRabbitsVersion,
  holeSpot,
  pickRabbitTarget,
  RABBITS,
  subscribeRabbits,
  updateRabbitGrowth,
} from '../game/rabbits';
import { held } from '../game/inventory';
import { player } from '../game/runtime';
import { isEvening } from '../game/time';
import {
  FARM,
  HOUSE,
  LAND,
  SAKURA,
  SMALL_SAKURA,
  SWING_SPOT,
  WAREHOUSE,
  shorelineZ,
} from '../game/terrain';

function Box({ size, position, color, ...rest }) {
  return (
    <mesh position={position} {...rest}>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

// 兔子遇到房子 / 仓库 / 樱花树 / 菜园时贴边绕开
function keepClear(rabbit) {
  const position = rabbit.position;
  position.x = THREE.MathUtils.clamp(position.x, LAND.minX + 0.7, LAND.maxX - 0.7);
  position.z = THREE.MathUtils.clamp(position.z, shorelineZ(position.x) + 1.0, LAND.maxZ - 0.9);

  const sx = position.x - SAKURA.x;
  const sz = position.z - SAKURA.z;
  const sakuraDist = Math.hypot(sx, sz);
  const sakuraKeep = SAKURA.radius + 0.25;
  if (sakuraDist < sakuraKeep) {
    const nx = sakuraDist > 0.0001 ? sx / sakuraDist : 1;
    const nz = sakuraDist > 0.0001 ? sz / sakuraDist : 0;
    position.x = SAKURA.x + nx * sakuraKeep;
    position.z = SAKURA.z + nz * sakuraKeep;
  }

  const pushRect = (cx, cz, halfW, halfD) => {
    const minX = cx - halfW;
    const maxX = cx + halfW;
    const minZ = cz - halfD;
    const maxZ = cz + halfD;
    if (position.x > minX && position.x < maxX && position.z > minZ && position.z < maxZ) {
      const left = position.x - minX;
      const right = maxX - position.x;
      const back = position.z - minZ;
      const front = maxZ - position.z;
      const min = Math.min(left, right, back, front);
      if (min === front) position.z = maxZ;
      else if (min === back) position.z = minZ;
      else if (min === left) position.x = minX;
      else position.x = maxX;
    }
  };

  if (Math.hypot(position.x - SWING_SPOT.x, position.z - SWING_SPOT.z) < 1.4) {
    const dx = position.x - SWING_SPOT.x;
    const dz = position.z - SWING_SPOT.z;
    const d = Math.hypot(dx, dz) || 1;
    position.x = SWING_SPOT.x + (dx / d) * 1.4;
    position.z = SWING_SPOT.z + (dz / d) * 1.4;
  }

  pushRect(HOUSE.x, HOUSE.z, HOUSE.width / 2 + 0.7, HOUSE.depth / 2 + 0.7);
  pushRect(WAREHOUSE.x, WAREHOUSE.z, WAREHOUSE.width / 2 + 0.6, WAREHOUSE.depth / 2 + 0.6);
  pushRect((FARM.minX + FARM.maxX) / 2, (FARM.minZ + FARM.maxZ) / 2, (FARM.maxX - FARM.minX) / 2 + 0.6, (FARM.maxZ - FARM.minZ) / 2 + 0.6);

  SMALL_SAKURA.forEach((tree) => {
    const dx = position.x - tree.x;
    const dz = position.z - tree.z;
    const d = Math.hypot(dx, dz);
    const keep = 0.8 * tree.scale;
    if (d < keep && d > 0.0001) {
      position.x = tree.x + (dx / d) * keep;
      position.z = tree.z + (dz / d) * keep;
    }
  });
}

function Rabbit({ style }) {
  const eye = style.eye;
  return (
    <group>
      {/* 身体 */}
      <Box size={[0.27, 0.21, 0.34]} position={[0, 0.21, -0.01]} color={style.coat} />
      <Box size={[0.2, 0.1, 0.26]} position={[0, 0.13, 0.08]} color={style.belly} />

      {/* 头与口鼻 */}
      <Box size={[0.19, 0.18, 0.19]} position={[0, 0.33, 0.2]} color={style.coat} />
      <Box size={[0.1, 0.07, 0.06]} position={[0, 0.29, 0.31]} color={style.belly} />
      <Box size={[0.045, 0.035, 0.03]} position={[0, 0.31, 0.34]} color="#d2798d" />

      {/* 眼睛 */}
      <Box size={[0.035, 0.045, 0.02]} position={[-0.068, 0.36, 0.295]} color={eye} />
      <Box size={[0.035, 0.045, 0.02]} position={[0.068, 0.36, 0.295]} color={eye} />

      {/* 长耳朵 + 耳内粉 */}
      <group position={[-0.058, 0.44, 0.17]} rotation={[0, 0, -0.12]}>
        <Box size={[0.06, 0.26, 0.07]} position={[0, 0.12, 0]} color={style.coat} />
        <Box size={[0.03, 0.16, 0.02]} position={[0, 0.11, 0.035]} color={style.ear} />
      </group>
      <group position={[0.058, 0.44, 0.17]} rotation={[0, 0, 0.12]}>
        <Box size={[0.06, 0.26, 0.08]} position={[0, 0.12, 0]} color={style.coat} />
        <Box size={[0.03, 0.16, 0.02]} position={[0, 0.11, 0.035]} color={style.ear} />
      </group>

      {/* 胡须 */}
      <Box size={[0.13, 0.012, 0.012]} position={[-0.09, 0.295, 0.32]} color={style.whisker} />
      <Box size={[0.13, 0.012, 0.012]} position={[0.09, 0.295, 0.32]} color={style.whisker} />

      {/* 四只脚 */}
      <Box size={[0.07, 0.12, 0.09]} position={[-0.095, 0.07, 0.13]} color={style.coat} />
      <Box size={[0.07, 0.12, 0.09]} position={[0.095, 0.07, 0.13]} color={style.coat} />
      <Box size={[0.08, 0.1, 0.12]} position={[-0.095, 0.06, -0.13]} color={style.coat} />
      <Box size={[0.08, 0.1, 0.12]} position={[0.095, 0.06, -0.13]} color={style.coat} />

      {/* 尾巴 */}
      <Box size={[0.1, 0.1, 0.1]} position={[0, 0.24, -0.21]} color={style.belly} />
    </group>
  );
}

// 爱心：投喂后头顶冒出 3 秒
function Hearts({ heartRef }) {
  return (
    <group ref={heartRef} position={[0, 0.62, 0]} visible={false}>
      <Box size={[0.075, 0.075, 0.05]} position={[0, 0.1, 0]} color="#ff6b8a" />
      <Box size={[0.05, 0.05, 0.05]} position={[-0.055, 0.05, 0]} color="#ff8ea4" />
      <Box size={[0.05, 0.05, 0.05]} position={[0.055, 0.05, 0]} color="#ff8ea4" />
      <Box size={[0.05, 0.05, 0.05]} position={[0, 0.02, 0]} color="#ffb1c0" />
    </group>
  );
}

export default function Rabbits() {
  const [, setVersion] = useState(0);
  const groups = useRef([]);
  const bodies = useRef([]);
  const shadows = useRef([]);
  const hearts = useRef([]);
  const goal = useRef(new THREE.Vector3());

  useEffect(() => subscribeRabbits(() => setVersion(getRabbitsVersion())), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const now = performance.now();
    updateRabbitGrowth();

    const evening = isEvening();
    const holdingRadish = held.type === 'radish';
    const playerX = player.position.x;
    const playerZ = player.position.z;

    RABBITS.forEach((rabbit, index) => {
      const group = groups.current[index];
      if (!group) return;

      const toPlayer = Math.hypot(rabbit.position.x - playerX, rabbit.position.z - playerZ);
      const chasing = holdingRadish && toPlayer < 8.5;
      const wantsHole = evening && !chasing;
      const restStyle = rabbit.id % 3 === 0;
      let hopping = false;
      let goalX = rabbit.target.x;
      let goalZ = rabbit.target.z;

      if (chasing) {
        // 被萝卜吸引：围到小女孩身边
        goal.current.set(playerX, 0, playerZ);
        goalX = goal.current.x;
        goalZ = goal.current.z;
      } else if (wantsHole) {
        const spot = holeSpot(rabbit);
        goalX = spot.x;
        goalZ = spot.z;
        rabbit.target.set(goalX, 0, goalZ);
      }

      const dx = goalX - rabbit.position.x;
      const dz = goalZ - rabbit.position.z;
      const distance = Math.hypot(dx, dz);
      const arriveDistance = chasing ? 1.45 : 0.3;

      if (distance <= arriveDistance) {
        rabbit.moving += (0 - rabbit.moving) * Math.min(1, dt * 8);
        if (!wantsHole && !chasing) {
          // 正常漫游：到点后歇一会再换目标
          rabbit.pause -= dt;
          if (rabbit.pause <= 0) {
            rabbit.target.copy(pickRabbitTarget(rabbit.random));
            rabbit.pause = 0.6 + rabbit.random() * 2.0;
          }
        }
        if (chasing) {
          // 围在脚边时面向玩家，小幅度兴奋跳
          rabbit.heading +=
            Math.atan2(
              Math.sin(Math.atan2(playerX - rabbit.position.x, playerZ - rabbit.position.z) - rabbit.heading),
              Math.cos(Math.atan2(playerX - rabbit.position.x, playerZ - rabbit.position.z) - rabbit.heading)
            ) * Math.min(1, dt * 6);
          rabbit.hop += dt * 7;
          hopping = true;
        }
      } else {
        rabbit.stuck += dt;
        if (!wantsHole && !chasing && rabbit.stuck > 5) {
          rabbit.target.copy(pickRabbitTarget(rabbit.random));
          rabbit.stuck = 0;
        }
        const step = Math.min(distance, rabbit.speed * dt * (chasing ? 1.5 : 1));
        rabbit.position.x += (dx / distance) * step;
        rabbit.position.z += (dz / distance) * step;
        keepClear(rabbit);

        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - rabbit.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        rabbit.heading += diff * Math.min(1, dt * 7);

        rabbit.hop += dt * (chasing ? 13 : 9);
        hopping = true;
      }

      // 傍晚回家：部分兔子钻进洞口趴下休息
      const home = wantsHole && distance < 0.9;
      rabbit.resting = home && restStyle;
      rabbit.moving += ((hopping ? 1 : 0) - rabbit.moving) * Math.min(1, dt * 8);
      const bounce = Math.abs(Math.sin(rabbit.hop)) * 0.07 * rabbit.moving;
      const restOffset = rabbit.resting ? -0.11 : 0;

      group.position.set(rabbit.position.x, bounce + restOffset, rabbit.position.z);
      group.rotation.y = rabbit.heading;
      group.rotation.z = Math.sin(rabbit.hop) * 0.05 * rabbit.moving;

      // 体型：小兔子 0.5，长大后平滑回到 1
      const wantScale = rabbit.resting ? rabbit.scale * 0.75 : rabbit.scale;
      rabbit.visualScale += (wantScale - rabbit.visualScale) * Math.min(1, dt * 4);
      const body = bodies.current[index];
      if (body) body.scale.setScalar(rabbit.visualScale);

      const heart = hearts.current[index];
      if (heart) {
        const alive = now < rabbit.heartUntil;
        heart.visible = alive;
        if (alive) {
          heart.position.y = 0.62 + Math.sin(now * 0.006) * 0.05;
          heart.scale.setScalar(1 + Math.sin(now * 0.008) * 0.08);
        }
      }

      const shadow = shadows.current[index];
      if (shadow) {
        shadow.position.x = rabbit.position.x;
        shadow.position.z = rabbit.position.z;
        const scale = rabbit.visualScale * (1 - bounce * 2.2);
        shadow.scale.setScalar(scale);
        shadow.material.opacity = 0.24 * scale;
      }
    });
  });

  return (
    <group>
      {RABBITS.map((rabbit, index) => (
        <group
          key={rabbit.id}
          ref={(element) => {
            groups.current[index] = element;
          }}
        >
          <group
            ref={(element) => {
              bodies.current[index] = element;
            }}
          >
            <Rabbit style={rabbit.style} />
          </group>
          <Hearts
            heartRef={(element) => {
              hearts.current[index] = element;
            }}
          />
        </group>
      ))}
      {RABBITS.map((rabbit, index) => (
        <mesh
          key={`shadow-${rabbit.id}`}
          ref={(element) => {
            shadows.current[index] = element;
          }}
          rotation-x={-Math.PI / 2}
          position={[rabbit.position.x, 0.085, rabbit.position.z]}
        >
          <circleGeometry args={[0.17, 8]} />
          <meshBasicMaterial color="#2a1c2e" transparent opacity={0.24} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
