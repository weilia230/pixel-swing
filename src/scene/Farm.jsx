import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../utils/random';
import { FARM, PLANT_SCALE, RABBIT_HOLES } from '../game/terrain';
import { gate } from '../game/runtime';
import { CROPS, getCropsVersion, subscribeCrops } from '../game/crops';

const WOOD = '#6b432a';
const WOOD_LIGHT = '#7d5233';
const WOOD_DARK = '#523120';
const SOIL = '#5b3a26';
const SOIL_DARK = '#4a2e1e';
const RIDGE = '#6b452b';

// 田垄土壤贴图：深褐底 + 横向垄沟 + 细碎土粒
function makeSoilTexture() {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = SOIL;
  ctx.fillRect(0, 0, size, size);

  const random = mulberry32(2029);
  for (let y = 0; y < size; y += 12) {
    ctx.fillStyle = SOIL_DARK;
    ctx.fillRect(0, y, size, 2);
    ctx.fillStyle = '#65422b';
    ctx.fillRect(0, y + 2, size, 1);
  }
  for (let i = 0; i < 260; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    ctx.fillStyle = random() > 0.5 ? '#6a4830' : '#4e3220';
    ctx.fillRect(x, y, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 4);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 每种生长阶段拆成小方块部件，再按“类型 × 阶段 × 部件”实例化。
const CROP_PARTS = {
  radish: {
    seed: [
      { size: [0.07, 0.05, 0.07], pos: [-0.08, 0.1, 0], color: '#b85132' },
      { size: [0.06, 0.05, 0.06], pos: [0.07, 0.1, 0.04], color: '#df7a3c' },
      { size: [0.05, 0.04, 0.05], pos: [0.02, 0.09, -0.07], color: '#75402b' },
    ],
    seedling: [
      { size: [0.13, 0.34, 0.07], pos: [-0.09, 0.27, 0], rot: [0, 0, -0.48], color: '#72a946' },
      { size: [0.13, 0.34, 0.07], pos: [0.09, 0.27, 0], rot: [0, 0, 0.48], color: '#8abd50' },
      { size: [0.05, 0.14, 0.05], pos: [0, 0.16, 0], color: '#527c35' },
    ],
    flowering: [
      { size: [0.34, 0.12, 0.22], pos: [0, 0.15, 0], color: '#65953d' },
      { size: [0.07, 0.72, 0.07], pos: [0, 0.49, 0], color: '#618c42' },
      { size: [0.05, 0.4, 0.05], pos: [-0.13, 0.5, 0], rot: [0, 0, -0.35], color: '#6d9748' },
      { size: [0.18, 0.12, 0.16], pos: [0, 0.88, 0], color: '#b48ac9' },
      { size: [0.13, 0.11, 0.13], pos: [-0.24, 0.7, 0], color: '#d0a7dc' },
      { size: [0.1, 0.1, 0.1], pos: [0.1, 0.76, 0.04], color: '#9569b3' },
    ],
    fruiting: [
      { size: [0.38, 0.12, 0.24], pos: [0, 0.15, 0], color: '#5f893b' },
      { size: [0.07, 1.02, 0.07], pos: [0, 0.63, 0], color: '#668344' },
      { size: [0.07, 0.34, 0.07], pos: [-0.15, 0.9, 0], rot: [0, 0, -0.55], color: '#9b9a55' },
      { size: [0.07, 0.34, 0.07], pos: [0.15, 0.77, 0], rot: [0, 0, 0.55], color: '#b0a25c' },
      { size: [0.06, 0.28, 0.06], pos: [-0.1, 0.61, 0.03], rot: [0, 0, -0.5], color: '#85914e' },
      { size: [0.1, 0.12, 0.1], pos: [0, 1.16, 0], color: '#b69b62' },
    ],
    mature: [
      { size: [0.34, 0.32, 0.34], pos: [0, 0.23, 0], color: '#cf3a41' },
      { size: [0.22, 0.1, 0.22], pos: [0, 0.08, 0], color: '#a92835' },
      { size: [0.18, 0.48, 0.09], pos: [-0.14, 0.55, 0], rot: [0, 0, -0.42], color: '#5f9b3a' },
      { size: [0.18, 0.52, 0.09], pos: [0.14, 0.57, 0], rot: [0, 0, 0.42], color: '#76ae45' },
      { size: [0.16, 0.4, 0.12], pos: [0, 0.52, -0.12], rot: [-0.4, 0, 0], color: '#8abd50' },
    ],
  },
  cabbage: {
    seed: [
      { size: [0.07, 0.05, 0.07], pos: [-0.08, 0.1, 0], color: '#ddd68b' },
      { size: [0.06, 0.05, 0.06], pos: [0.07, 0.1, 0.04], color: '#bdc778' },
      { size: [0.05, 0.04, 0.05], pos: [0.02, 0.09, -0.07], color: '#eff0ae' },
    ],
    seedling: [
      { size: [0.26, 0.08, 0.17], pos: [-0.12, 0.15, 0], rot: [0, 0, -0.14], color: '#83ae4c' },
      { size: [0.26, 0.08, 0.17], pos: [0.12, 0.16, 0], rot: [0, 0, 0.14], color: '#98bf59' },
      { size: [0.17, 0.08, 0.26], pos: [0, 0.14, -0.12], color: '#719c43' },
      { size: [0.17, 0.08, 0.26], pos: [0, 0.17, 0.12], color: '#a4c866' },
    ],
    flowering: [
      { size: [0.46, 0.13, 0.4], pos: [0, 0.16, 0], color: '#7ca348' },
      { size: [0.07, 0.76, 0.07], pos: [0, 0.52, 0], color: '#78974a' },
      { size: [0.05, 0.42, 0.05], pos: [0.14, 0.52, 0], rot: [0, 0, 0.35], color: '#86a253' },
      { size: [0.18, 0.12, 0.16], pos: [0, 0.93, 0], color: '#f0d553' },
      { size: [0.13, 0.11, 0.13], pos: [0.25, 0.73, 0], color: '#ffe477' },
      { size: [0.1, 0.1, 0.1], pos: [-0.1, 0.8, 0.04], color: '#d8bc3e' },
    ],
    fruiting: [
      { size: [0.46, 0.13, 0.4], pos: [0, 0.16, 0], color: '#789b46' },
      { size: [0.07, 1.04, 0.07], pos: [0, 0.64, 0], color: '#718b47' },
      { size: [0.07, 0.34, 0.07], pos: [-0.15, 0.91, 0], rot: [0, 0, -0.55], color: '#a5a154' },
      { size: [0.07, 0.34, 0.07], pos: [0.15, 0.78, 0], rot: [0, 0, 0.55], color: '#b4aa60' },
      { size: [0.06, 0.28, 0.06], pos: [0.1, 0.62, 0.03], rot: [0, 0, 0.5], color: '#8c9650' },
      { size: [0.1, 0.12, 0.1], pos: [0, 1.18, 0], color: '#b6a464' },
    ],
    mature: [
      { size: [0.58, 0.16, 0.32], pos: [0, 0.18, 0], color: '#7fb246' },
      { size: [0.32, 0.16, 0.58], pos: [0, 0.2, 0], color: '#8dbc51' },
      { size: [0.46, 0.28, 0.46], pos: [0, 0.35, 0], color: '#b7cf7c' },
      { size: [0.34, 0.28, 0.34], pos: [0, 0.48, 0], color: '#d9e7a4' },
      { size: [0.22, 0.18, 0.22], pos: [0, 0.64, 0], color: '#eef3c6' },
    ],
  },
};

function InstancedPart({ items, part, version }) {
  const mesh = useRef();

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    mesh.current.count = items.length;
    items.forEach((item, index) => {
      const [ox, oy, oz] = part.pos;
      const cos = Math.cos(item.rot);
      const sin = Math.sin(item.rot);
      const scale = item.scale * PLANT_SCALE;
      dummy.position.set(
        item.x + (ox * cos + oz * sin) * scale,
        oy * scale,
        item.z + (-ox * sin + oz * cos) * scale
      );
      const rotation = part.rot || [0, 0, 0];
      dummy.rotation.set(rotation[0], item.rot + rotation[1], rotation[2]);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [items, part, version]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false}>
      <boxGeometry args={part.size} />
      <meshLambertMaterial color={part.color} />
    </instancedMesh>
  );
}

function Crops() {
  const [version, setVersion] = useState(getCropsVersion);

  useEffect(() => subscribeCrops(() => setVersion(getCropsVersion())), []);

  const groups = useMemo(() => {
    const result = [];
    ['radish', 'cabbage'].forEach((type) => {
      Object.entries(CROP_PARTS[type]).forEach(([stage, parts]) => {
        const items = CROPS.items.filter((item) => item.type === type && item.stage === stage);
        parts.forEach((part, index) => result.push({ key: `${type}-${stage}-${index}`, items, part }));
      });
    });
    return result;
  }, [version]);

  return (
    <group>
      {groups.map((group) => (
        <InstancedPart key={group.key} items={group.items} part={group.part} version={version} />
      ))}
    </group>
  );
}

const FENCE_SEGMENTS = (() => {
  const { minX, maxX, minZ, maxZ, gate: g } = FARM;
  const half = g.width / 2;
  return [
    { axis: 'x', fixed: minZ, from: minX, to: maxX },
    { axis: 'x', fixed: maxZ, from: minX, to: maxX },
    { axis: 'z', fixed: minX, from: minZ, to: maxZ },
    { axis: 'z', fixed: maxX, from: minZ, to: g.z - half },
    { axis: 'z', fixed: maxX, from: g.z + half, to: maxZ },
  ];
})();

function Fence() {
  const parts = useMemo(() => {
    const posts = [];
    const rails = [];
    FENCE_SEGMENTS.forEach((seg) => {
      const length = Math.abs(seg.to - seg.from);
      const count = Math.max(1, Math.round(length / 3.0));
      for (let i = 0; i <= count; i += 1) {
        const t = seg.from + ((seg.to - seg.from) * i) / count;
        posts.push({
          x: seg.axis === 'x' ? t : seg.fixed,
          z: seg.axis === 'x' ? seg.fixed : t,
        });
      }
      const center = (seg.from + seg.to) / 2;
      [1.1, 1.9].forEach((h) => {
        rails.push({
          x: seg.axis === 'x' ? center : seg.fixed,
          z: seg.axis === 'x' ? seg.fixed : center,
          size: seg.axis === 'x' ? [length, 0.12, 0.09] : [0.09, 0.12, length],
          y: h,
        });
      });
    });
    return { posts, rails };
  }, []);

  return (
    <group>
      {parts.posts.map((post, index) => (
        <mesh key={`p${index}`} position={[post.x, FARM.fenceHeight / 2, post.z]}>
          <boxGeometry args={[0.18, FARM.fenceHeight, 0.18]} />
          <meshLambertMaterial color={WOOD} />
        </mesh>
      ))}
      {parts.rails.map((rail, index) => (
        <mesh key={`r${index}`} position={[rail.x, rail.y, rail.z]}>
          <boxGeometry args={rail.size} />
          <meshLambertMaterial color={WOOD_LIGHT} />
        </mesh>
      ))}
    </group>
  );
}

// 东侧围栏门：绕北端门柱旋转，打开时朝草地侧（东）摆出去
function Gate() {
  const { gate: g, maxX } = FARM;
  const hingeZ = g.z - g.width / 2;
  const group = useRef();

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const target = gate.open ? 1.85 : 0;
    gate.angle += (target - gate.angle) * Math.min(1, dt * 7);
    if (group.current) group.current.rotation.y = gate.angle;
  });

  return (
    <group ref={group} position={[maxX, 0, hingeZ]}>
      {/* 两根竖框 */}
      <mesh position={[0, 1.15, 0.1]}>
        <boxGeometry args={[0.2, 2.2, 0.2]} />
        <meshLambertMaterial color={WOOD} />
      </mesh>
      <mesh position={[0, 1.15, g.width - 0.1]}>
        <boxGeometry args={[0.2, 2.2, 0.2]} />
        <meshLambertMaterial color={WOOD} />
      </mesh>
      {/* 三道横板 */}
      {[0.7, 1.3, 1.9].map((h) => (
        <mesh key={h} position={[0, h, g.width / 2]}>
          <boxGeometry args={[0.14, 0.2, g.width - 0.24]} />
          <meshLambertMaterial color={WOOD_LIGHT} />
        </mesh>
      ))}
      {/* 斜撑 */}
      <mesh position={[0, 1.3, g.width / 2]} rotation={[0.62, 0, 0]}>
        <boxGeometry args={[0.12, 0.18, g.width * 0.86]} />
        <meshLambertMaterial color={WOOD_DARK} />
      </mesh>
      {/* 门轴柱 */}
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[0.3, 2.6, 0.3]} />
        <meshLambertMaterial color={WOOD_DARK} />
      </mesh>
    </group>
  );
}

// 兔子洞：草丘 + 拱形洞口 + 干草 + 小栅栏 + 胡萝卜（参考图二）
function Burrow({ x, z, yaw }) {
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {/* 泥土底座 */}
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[2.4, 0.18, 1.9]} />
        <meshLambertMaterial color="#6b4a2c" />
      </mesh>
      {/* 草丘阶梯 */}
      <mesh position={[0, 0.3, -0.05]}>
        <boxGeometry args={[2.05, 0.42, 1.55]} />
        <meshLambertMaterial color="#5f7c36" />
      </mesh>
      <mesh position={[0, 0.55, -0.12]}>
        <boxGeometry args={[1.55, 0.34, 1.15]} />
        <meshLambertMaterial color="#6d8a3e" />
      </mesh>
      <mesh position={[0, 0.75, -0.18]}>
        <boxGeometry args={[0.95, 0.24, 0.72]} />
        <meshLambertMaterial color="#7a9747" />
      </mesh>
      {/* 洞口：深色内腔 + 土色拱边 */}
      <mesh position={[0, 0.44, 0.5]}>
        <boxGeometry args={[1.0, 0.82, 0.34]} />
        <meshLambertMaterial color="#2a1a12" />
      </mesh>
      <mesh position={[0, 0.92, 0.52]}>
        <boxGeometry args={[1.2, 0.18, 0.3]} />
        <meshLambertMaterial color="#7d5636" />
      </mesh>
      <mesh position={[-0.6, 0.58, 0.52]}>
        <boxGeometry args={[0.18, 0.66, 0.3]} />
        <meshLambertMaterial color="#7d5636" />
      </mesh>
      <mesh position={[0.6, 0.58, 0.52]}>
        <boxGeometry args={[0.18, 0.66, 0.3]} />
        <meshLambertMaterial color="#7d5636" />
      </mesh>
      {/* 门口干草 */}
      {[-0.34, 0, 0.34].map((dx, i) => (
        <mesh key={i} position={[dx, 0.2, 0.8]} rotation={[0, 0.5 + i * 0.6, 0]}>
          <boxGeometry args={[0.42, 0.07, 0.12]} />
          <meshLambertMaterial color="#e2c66a" />
        </mesh>
      ))}
      {/* 右侧小栅栏 */}
      <group position={[1.0, 0, 0.34]}>
        {[-0.42, 0, 0.42].map((dz) => (
          <mesh key={dz} position={[0, 0.26, dz]}>
            <boxGeometry args={[0.1, 0.52, 0.1]} />
            <meshLambertMaterial color={WOOD} />
          </mesh>
        ))}
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.08, 0.1, 0.86]} />
          <meshLambertMaterial color={WOOD_LIGHT} />
        </mesh>
      </group>
      {/* 胡萝卜 */}
      <group position={[-0.95, 0, 0.72]}>
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[0.14, 0.26, 0.14]} />
          <meshLambertMaterial color="#e8792c" />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.18, 0.12, 0.18]} />
          <meshLambertMaterial color="#5f9b3a" />
        </mesh>
      </group>
      {/* 小草花 */}
      {[[-0.75, 0.85], [0.62, 1.0], [-0.2, 1.02]].map(([fx, fz], i) => (
        <mesh key={i} position={[fx, 0.12, fz]}>
          <boxGeometry args={[0.09, 0.09, 0.09]} />
          <meshLambertMaterial color={i % 2 ? '#f6f0dc' : '#c9b6e6'} />
        </mesh>
      ))}
    </group>
  );
}

export default function Farm() {
  const soil = useMemo(() => makeSoilTexture(), []);
  const width = FARM.maxX - FARM.minX - 0.9;
  const depth = FARM.maxZ - FARM.minZ - 0.9;
  const centerX = (FARM.minX + FARM.maxX) / 2;
  const centerZ = (FARM.minZ + FARM.maxZ) / 2;

  return (
    <group>
      {/* 田埂土壤 */}
      <mesh rotation-x={-Math.PI / 2} position={[centerX, 0.068, centerZ]}>
        <planeGeometry args={[width, depth]} />
        <meshLambertMaterial map={soil} color="#ffffff" />
      </mesh>

      {/* 四周稍稍隆起的田埂 */}
      {[
        { position: [centerX, 0.11, FARM.minZ + 0.45], size: [width, 0.12, 0.6] },
        { position: [centerX, 0.11, FARM.maxZ - 0.45], size: [width, 0.12, 0.6] },
        { position: [FARM.minX + 0.45, 0.11, centerZ], size: [0.6, 0.12, depth] },
        { position: [FARM.maxX - 0.45, 0.11, centerZ], size: [0.6, 0.12, depth] },
      ].map((ridge, index) => (
        <mesh key={index} position={ridge.position}>
          <boxGeometry args={ridge.size} />
          <meshLambertMaterial color={RIDGE} />
        </mesh>
      ))}

      <Crops />
      <Fence />
      <Gate />

      {RABBIT_HOLES.map((hole, index) => (
        <Burrow key={index} x={hole.x} z={hole.z} yaw={hole.yaw} />
      ))}
    </group>
  );
}
