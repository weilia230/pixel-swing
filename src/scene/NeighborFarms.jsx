import { useMemo } from 'react';
import { mulberry32 } from '../utils/random';
import { NEIGHBOR_FARMS, neighborBeds } from '../game/terrain';

const WALL = '#d9c7a4';
const WALL_DARK = '#c3ae88';
const TIMBER = '#6b4a32';
const ROOF = '#8a4a3a';
const ROOF_DARK = '#70392c';
const ROOF_LIGHT = '#a05a45';
const DOOR = '#6b432a';
const GLOW = '#ffd9a0';
const SOIL = '#5b3a26';
const SOIL_DARK = '#432a1a';
const SOIL_LIGHT = '#6f4a2e';
const RIDGE = '#7a5233';

function NeighborHouse({ house, accent }) {
  const { x, z, width, depth, wallHeight } = house;
  const halfW = width / 2;
  return (
    <group position={[x, 0, z]}>
      {/* 石砌地基 */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[width + 1.2, 0.44, depth + 1.2]} />
        <meshLambertMaterial color="#6b625a" />
      </mesh>
      {/* 土墙 */}
      <mesh position={[0, wallHeight / 2, 0]}>
        <boxGeometry args={[width, wallHeight, depth]} />
        <meshLambertMaterial color={WALL} />
      </mesh>
      <mesh position={[0, wallHeight * 0.55, depth / 2 + 0.01]}>
        <boxGeometry args={[width * 0.98, wallHeight * 0.55, 0.06]} />
        <meshLambertMaterial color={WALL_DARK} />
      </mesh>
      {/* 木构架 */}
      {[
        [-halfW + 0.28, -depth / 2 + 0.28],
        [halfW - 0.28, -depth / 2 + 0.28],
        [-halfW + 0.28, depth / 2 - 0.28],
        [halfW - 0.28, depth / 2 - 0.28],
      ].map(([bx, bz]) => (
        <mesh key={`${bx}-${bz}`} position={[bx, wallHeight / 2, bz]}>
          <boxGeometry args={[0.34, wallHeight, 0.34]} />
          <meshLambertMaterial color={TIMBER} />
        </mesh>
      ))}
      <mesh position={[0, wallHeight - 0.18, depth / 2]}>
        <boxGeometry args={[width, 0.32, 0.2]} />
        <meshLambertMaterial color={TIMBER} />
      </mesh>
      {/* 四坡草顶，逐层收窄 */}
      <mesh position={[0, wallHeight + 0.32, 0]}>
        <boxGeometry args={[width + 2.2, 0.55, depth + 2.0]} />
        <meshLambertMaterial color={ROOF_DARK} />
      </mesh>
      <mesh position={[0, wallHeight + 0.82, 0]}>
        <boxGeometry args={[width + 1.1, 0.5, depth + 1.1]} />
        <meshLambertMaterial color={ROOF} />
      </mesh>
      <mesh position={[0, wallHeight + 1.26, 0]}>
        <boxGeometry args={[width * 0.66, 0.42, depth * 0.62]} />
        <meshLambertMaterial color={ROOF_LIGHT} />
      </mesh>
      <mesh position={[0, wallHeight + 1.58, 0]}>
        <boxGeometry args={[width * 0.34, 0.3, depth * 0.3]} />
        <meshLambertMaterial color={ROOF_DARK} />
      </mesh>
      {/* 屋顶横向瓦楞 */}
      {[-0.3, 0.1, 0.5].map((offset) => (
        <mesh key={offset} position={[0, wallHeight + 0.86, (depth / 2 + 0.6) * offset]}>
          <boxGeometry args={[width + 1.2, 0.08, 0.14]} />
          <meshLambertMaterial color={ROOF_DARK} />
        </mesh>
      ))}
      {/* 烟囱 */}
      <mesh position={[halfW * 0.5, wallHeight + 1.15, -depth * 0.22]}>
        <boxGeometry args={[1.0, 2.2, 1.0]} />
        <meshLambertMaterial color="#7d6a5c" />
      </mesh>
      <mesh position={[halfW * 0.5, wallHeight + 2.3, -depth * 0.22]}>
        <boxGeometry args={[1.2, 0.22, 1.2]} />
        <meshLambertMaterial color="#9a8674" />
      </mesh>
      {/* 南侧门与两扇暖光窗 */}
      <mesh position={[0, 1.5, depth / 2 + 0.06]}>
        <boxGeometry args={[1.5, 2.5, 0.14]} />
        <meshLambertMaterial color={TIMBER} />
      </mesh>
      <mesh position={[0, 1.35, depth / 2 + 0.1]}>
        <boxGeometry args={[1.24, 2.3, 0.1]} />
        <meshLambertMaterial color={DOOR} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * halfW * 0.55, wallHeight * 0.52, depth / 2 + 0.08]}>
          <mesh>
            <boxGeometry args={[1.7, 1.5, 0.14]} />
            <meshLambertMaterial color={TIMBER} />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[1.42, 1.24, 0.06]} />
            <meshLambertMaterial color={GLOW} />
          </mesh>
          <mesh position={[0, 0, 0.12]}>
            <boxGeometry args={[0.08, 1.24, 0.04]} />
            <meshLambertMaterial color={TIMBER} />
          </mesh>
          <mesh position={[0, 0, 0.12]}>
            <boxGeometry args={[1.42, 0.08, 0.04]} />
            <meshLambertMaterial color={TIMBER} />
          </mesh>
          {/* 窗台花箱 */}
          <mesh position={[0, -0.86, 0.24]}>
            <boxGeometry args={[1.5, 0.36, 0.34]} />
            <meshLambertMaterial color="#8a5f3a" />
          </mesh>
          {[-0.45, 0, 0.45].map((fx) => (
            <mesh key={fx} position={[fx, -0.66, 0.28]}>
              <boxGeometry args={[0.18, 0.18, 0.18]} />
              <meshLambertMaterial color={accent} />
            </mesh>
          ))}
        </group>
      ))}
      {/* 门前石阶与木栅栏 */}
      <mesh position={[0, 0.16, depth / 2 + 1.0]}>
        <boxGeometry args={[2.4, 0.28, 1.4]} />
        <meshLambertMaterial color="#8d8378" />
      </mesh>
      <mesh position={[0, 0.42, depth / 2 + 1.7]}>
        <boxGeometry args={[1.4, 0.3, 0.5]} />
        <meshLambertMaterial color="#7b7268" />
      </mesh>
      {[-3.9, -2.6, 2.6, 3.9].map((fx) => (
        <group key={fx} position={[fx, 0, depth / 2 + 2.1]}>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.16, 1.0, 0.16]} />
            <meshLambertMaterial color="#6b432a" />
          </mesh>
          <mesh position={[0.65, 0.66, 0]}>
            <boxGeometry args={[1.3, 0.12, 0.1]} />
            <meshLambertMaterial color="#7d5233" />
          </mesh>
          <mesh position={[0.65, 0.34, 0]}>
            <boxGeometry args={[1.3, 0.12, 0.1]} />
            <meshLambertMaterial color="#7d5233" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// 每条田垄：土床 + 垄沟 + 土块颗粒 + 杂草 + 木边
function Beds() {
  const beds = useMemo(() => neighborBeds(), []);
  const detail = useMemo(() => {
    const random = mulberry32(4417);
    return beds.map((bed) => {
      const clods = [];
      const weeds = [];
      const stones = [];
      for (let i = 0; i < 16; i += 1) {
        clods.push({
          x: (random() - 0.5) * (bed.width - 1),
          z: (random() - 0.5) * (bed.depth - 0.6),
          size: 0.08 + random() * 0.14,
          color: random() > 0.5 ? SOIL_LIGHT : SOIL_DARK,
        });
      }
      for (let i = 0; i < 7; i += 1) {
        weeds.push({
          x: (random() - 0.5) * (bed.width - 0.8),
          z: (random() > 0.5 ? 1 : -1) * (bed.depth / 2 - 0.2 - random() * 0.5),
          scale: 0.12 + random() * 0.16,
        });
      }
      for (let i = 0; i < 5; i += 1) {
        stones.push({
          x: (random() - 0.5) * (bed.width - 0.6),
          z: (random() - 0.5) * (bed.depth - 0.4),
          size: 0.08 + random() * 0.09,
        });
      }
      return { clods, weeds, stones };
    });
  }, [beds]);

  return (
    <group>
      {beds.map((bed, index) => (
        <group key={index} position={[bed.x, 0, bed.z]}>
          {/* 土床 */}
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[bed.width, 0.36, bed.depth]} />
            <meshLambertMaterial color={SOIL} />
          </mesh>
          {/* 两侧田埂 */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (bed.width / 2 - 0.12), 0.26, 0]}>
              <boxGeometry args={[0.26, 0.2, bed.depth]} />
              <meshLambertMaterial color={RIDGE} />
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <mesh key={`end-${side}`} position={[0, 0.26, side * (bed.depth / 2 - 0.12)]}>
              <boxGeometry args={[bed.width, 0.2, 0.26]} />
              <meshLambertMaterial color={RIDGE} />
            </mesh>
          ))}
          {/* 垄沟 */}
          {[-0.9, -0.3, 0.3, 0.9].map((offset) => (
            <mesh key={offset} position={[0, 0.37, offset * (bed.depth / 2.2)]}>
              <boxGeometry args={[bed.width - 0.7, 0.05, 0.16]} />
              <meshLambertMaterial color={SOIL_DARK} />
            </mesh>
          ))}
          {/* 土块颗粒 */}
          {detail[index].clods.map((clod, i) => (
            <mesh key={`c${i}`} position={[clod.x, 0.4, clod.z]}>
              <boxGeometry args={[clod.size, clod.size * 0.6, clod.size]} />
              <meshLambertMaterial color={clod.color} />
            </mesh>
          ))}
          {/* 杂草 */}
          {detail[index].weeds.map((weed, i) => (
            <group key={`w${i}`} position={[weed.x, 0.38, weed.z]}>
              <mesh position={[0, weed.scale * 0.5, 0]}>
                <boxGeometry args={[0.05, weed.scale, 0.05]} />
                <meshLambertMaterial color="#4f6f2f" />
              </mesh>
              <mesh position={[weed.scale * 0.4, weed.scale * 0.6, 0]} rotation={[0, 0, 0.6]}>
                <boxGeometry args={[weed.scale * 0.8, 0.04, 0.06]} />
                <meshLambertMaterial color="#678a3d" />
              </mesh>
            </group>
          ))}
          {/* 小石子 */}
          {detail[index].stones.map((stone, i) => (
            <mesh key={`s${i}`} position={[stone.x, 0.42, stone.z]} rotation={[0.4, i, 0.2]}>
              <boxGeometry args={[stone.size, stone.size * 0.7, stone.size]} />
              <meshLambertMaterial color={i % 2 ? '#6c645a' : '#7a7266'} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export default function NeighborFarms() {
  return (
    <group>
      {NEIGHBOR_FARMS.map((farm) => (
        <NeighborHouse key={farm.id} house={farm.house} accent={farm.accent} />
      ))}
      <Beds />
    </group>
  );
}
