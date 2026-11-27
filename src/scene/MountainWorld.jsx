import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mulberry32 } from '../utils/random';
import { heightAt } from '../game/terrain';
import { TILE_SIZE } from '../game/gridConfig';
import { worldTime } from '../game/time';
import { buildBladeGeometry } from './SkyGrassSample';
import {
  CAVES,
  HIDING_SPOTS,
  LAKES,
  MOUNTAIN_REGION,
  MOUNTAIN_TREES,
  PONDS,
  RIVERS,
  STREAMS,
  TALL_GRASS_PATCHES,
  WATERFALLS,
  WATER_SURFACE_LIFT,
  isMountainCaveAt,
  isMountainWaterAt,
} from '../game/mountainWorld';

const GRASS_LOW = ['#4a6139', '#526b3e', '#5b7444'];
const GRASS_MID = ['#5f7849', '#688151', '#728a59'];
const GRASS_HIGH = ['#84937a', '#909e84', '#9daa90'];
const ENTRY_CLEAR_RADIUS = 18;

function hash2(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function makeGrassTileTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#e4ebdc';
  ctx.fillRect(0, 0, size, size);
  const random = mulberry32(3301);
  for (let i = 0; i < 420; i += 1) {
    const tone = 196 + Math.floor(random() * 46);
    ctx.fillStyle = `rgb(${tone},${tone + 6},${tone - 4})`;
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1 + Math.floor(random() * 2));
  }
  for (let i = 0; i < 90; i += 1) {
    const tone = 168 + Math.floor(random() * 28);
    ctx.fillStyle = `rgb(${tone},${tone + 4},${tone - 6})`;
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildHeightGrid() {
  const nx = Math.round((MOUNTAIN_REGION.maxX - MOUNTAIN_REGION.minX) / TILE_SIZE);
  const nz = Math.round((MOUNTAIN_REGION.maxZ - MOUNTAIN_REGION.minZ) / TILE_SIZE);
  return { nx, nz };
}

function altitudeColor(height, ix, iz, target) {
  const palette = height < 9 ? GRASS_LOW : height < 19 ? GRASS_MID : GRASS_HIGH;
  target.set(palette[Math.floor(hash2(ix, iz) * palette.length)]);
  target.offsetHSL(0, 0, (hash2(ix + 17, iz - 9) - 0.5) * 0.06);
  return target;
}

// 连续高度场：每个网格角点采样一次高度，相邻角点之间用斜面相连。
// 只生成一张顶面网格，不再生成垂直侧墙，因此山体是缓坡 + 台地，而不是方块堆。
function buildTerrainGeometry() {
  const nx = Math.round((MOUNTAIN_REGION.maxX - MOUNTAIN_REGION.minX) / TILE_SIZE);
  const nz = Math.round((MOUNTAIN_REGION.maxZ - MOUNTAIN_REGION.minZ) / TILE_SIZE);
  const stride = nx + 1;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const color = new THREE.Color();

  for (let iz = 0; iz <= nz; iz += 1) {
    const z = MOUNTAIN_REGION.minZ + iz * TILE_SIZE;
    for (let ix = 0; ix <= nx; ix += 1) {
      const x = MOUNTAIN_REGION.minX + ix * TILE_SIZE;
      const height = heightAt(x, z);
      positions.push(x, height, z);
      altitudeColor(height, ix, iz, color);
      colors.push(color.r, color.g, color.b);
      uvs.push(x / TILE_SIZE, z / TILE_SIZE);
    }
  }

  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const a = iz * stride + ix;
      indices.push(a, a + stride + 1, a + 1, a, a + stride, a + stride + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function bladeGeometry() {
  const geometry = buildBladeGeometry().clone();
  const source = geometry.getAttribute('aColor');
  geometry.setAttribute('color', new THREE.BufferAttribute(source.array, 3));
  return geometry;
}

function MountainTerrain() {
  const texture = useMemo(() => makeGrassTileTexture(), []);
  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: texture,
        emissive: new THREE.Color('#1d2818'),
        emissiveIntensity: 0.5,
      }),
    [texture]
  );
  const geometry = useMemo(() => buildTerrainGeometry(), []);

  useFrame(() => {
    const daylight = worldTime.daylight;
    material.color.setScalar(0.66 + daylight * 0.46);
    material.emissiveIntensity = 0.5 - daylight * 0.22;
  });

  return (
    <group name="mountain-terrain">
      <mesh geometry={geometry} material={material} receiveShadow />
    </group>
  );
}

function buildGrassTufts() {
  const { nx, nz } = buildHeightGrid();
  const random = mulberry32(41127);
  const blades = [];
  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      if (random() > 0.78) continue;
      const x = MOUNTAIN_REGION.minX + (ix + 0.2 + random() * 0.6) * TILE_SIZE;
      const z = MOUNTAIN_REGION.minZ + (iz + 0.2 + random() * 0.6) * TILE_SIZE;
      if (isMountainWaterAt(x, z, 1.2)) continue;
      if (isMountainCaveAt(x, z, 2)) continue;
      if (TALL_GRASS_PATCHES.some((patch) => Math.hypot(x - patch.x, z - patch.z) < patch.radius)) continue;
      if (Math.hypot(x, z - 1000) < ENTRY_CLEAR_RADIUS) continue;
      const count = 5 + Math.floor(random() * 4);
      for (let b = 0; b < count; b += 1) {
        const bx = x + (random() - 0.5) * TILE_SIZE * 0.9;
        const bz = z + (random() - 0.5) * TILE_SIZE * 0.9;
        const ground = heightAt(bx, bz);
        const angle = random() * Math.PI * 2;
        const lean = 0.08 + random() * 0.2;
        blades.push({
          x: bx,
          y: ground - 0.04,
          z: bz,
          rotationY: random() * Math.PI * 2,
          leanX: Math.cos(angle) * lean,
          leanZ: Math.sin(angle) * lean,
          height: 0.95 + random() * 1.05,
          width: 1.6 + random() * 1.3,
          tint: ground < 9 ? '#8fae7d' : ground < 19 ? '#b8cba8' : '#d2ddc8',
        });
      }
    }
  }
  return blades;
}

function buildTallGrass() {
  const random = mulberry32(50917);
  const blades = [];
  TALL_GRASS_PATCHES.forEach((patch) => {
    const clusters = Math.round((patch.radius * patch.radius) / 1.4);
    for (let i = 0; i < clusters; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * patch.radius;
      const cx = patch.x + Math.cos(angle) * radius;
      const cz = patch.z + Math.sin(angle) * radius;
      if (isMountainWaterAt(cx, cz, 1.5)) continue;
      if (isMountainCaveAt(cx, cz, 1.2)) continue;
      const count = 8 + Math.floor(random() * 5);
      for (let b = 0; b < count; b += 1) {
        const bx = cx + (random() - 0.5) * 2.1;
        const bz = cz + (random() - 0.5) * 2.1;
        const y = heightAt(bx, bz);
        const bladeAngle = random() * Math.PI * 2;
        const lean = 0.12 + random() * 0.24;
        blades.push({
          x: bx,
          y: y - 0.05,
          z: bz,
          rotationY: random() * Math.PI * 2,
          leanX: Math.cos(bladeAngle) * lean,
          leanZ: Math.sin(bladeAngle) * lean,
          height: 2.6 + random() * 1.6,
          width: 2.6 + random() * 1.6,
          tint: random() > 0.5 ? '#9cb886' : '#b0c79b',
        });
      }
    }
  });
  return blades;
}

function InstancedBlades({ blades, baseGeometry }) {
  const mesh = useRef();
  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        emissive: new THREE.Color('#22301b'),
        emissiveIntensity: 0.5,
      }),
    []
  );

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    blades.forEach((blade, index) => {
      dummy.position.set(blade.x, blade.y, blade.z);
      dummy.rotation.set(blade.leanX, blade.rotationY, blade.leanZ);
      dummy.scale.set(blade.width, blade.height, blade.width);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
      mesh.current.setColorAt(index, color.set(blade.tint));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [blades]);

  useFrame(() => {
    material.color.setScalar(0.66 + worldTime.daylight * 0.46);
    material.emissiveIntensity = 0.5 - worldTime.daylight * 0.22;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[baseGeometry, material, Math.max(blades.length, 1)]}
      frustumCulled={false}
    />
  );
}

function MountainGrass() {
  const geometry = useMemo(() => bladeGeometry(), []);
  const tufts = useMemo(() => buildGrassTufts(), []);
  const tall = useMemo(() => buildTallGrass(), []);
  return (
    <group name="mountain-grass">
      <InstancedBlades blades={tufts} baseGeometry={geometry} />
      <InstancedBlades blades={tall} baseGeometry={geometry} />
    </group>
  );
}

function MountainTrees() {
  const [version, setVersion] = useState(0);
  const trunkRef = useRef();
  const leafRef = useRef();
  const trunkMaterial = useMemo(
    () => new THREE.MeshLambertMaterial({ emissive: new THREE.Color('#2a1b10'), emissiveIntensity: 0.4 }),
    []
  );
  const leafMaterial = useMemo(
    () => new THREE.MeshLambertMaterial({ emissive: new THREE.Color('#1f2b19'), emissiveIntensity: 0.5 }),
    []
  );
  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.32, 0.46, 1, 6), []);
  const leafGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useEffect(() => {
    const onChopped = () => setVersion((value) => value + 1);
    window.addEventListener('mountain-tree-chopped', onChopped);
    return () => window.removeEventListener('mountain-tree-chopped', onChopped);
  }, []);

  useLayoutEffect(() => {
    if (!trunkRef.current || !leafRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    MOUNTAIN_TREES.forEach((tree, index) => {
      const ground = heightAt(tree.x, tree.z);
      const trunkHeight = tree.alive ? tree.height : Math.min(0.9, tree.height * 0.14);
      dummy.position.set(tree.x, ground + trunkHeight / 2, tree.z);
      dummy.rotation.set(0, tree.seed * Math.PI * 2, 0);
      dummy.scale.set(1, trunkHeight, 1);
      dummy.updateMatrix();
      trunkRef.current.setMatrixAt(index, dummy.matrix);
      trunkRef.current.setColorAt(index, color.set('#6a4329'));

      const foliageHeight = tree.height;
      const offset = Math.floor(index * 2);
      if (tree.alive) {
        dummy.position.set(tree.x, ground + foliageHeight * 0.82, tree.z);
        dummy.rotation.set(0, tree.seed * 2.4, 0);
        dummy.scale.set(foliageHeight * 0.42, foliageHeight * 0.4, foliageHeight * 0.42);
        dummy.updateMatrix();
        leafRef.current.setMatrixAt(offset, dummy.matrix);
        leafRef.current.setColorAt(
          offset,
          color.set(foliageHeight < 7 ? '#71865d' : '#4f6c3d')
        );

        dummy.position.set(tree.x + 0.18, ground + foliageHeight * 1.06, tree.z - 0.12);
        dummy.rotation.set(0, tree.seed * 3.1, 0);
        dummy.scale.set(foliageHeight * 0.3, foliageHeight * 0.3, foliageHeight * 0.3);
        dummy.updateMatrix();
        leafRef.current.setMatrixAt(offset + 1, dummy.matrix);
        leafRef.current.setColorAt(
          offset + 1,
          color.set(foliageHeight < 7 ? '#84996f' : '#5e7c48')
        );
      } else {
        dummy.position.set(tree.x, -60, tree.z);
        dummy.scale.set(0.001, 0.001, 0.001);
        dummy.updateMatrix();
        leafRef.current.setMatrixAt(offset, dummy.matrix);
        leafRef.current.setMatrixAt(offset + 1, dummy.matrix);
      }
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    leafRef.current.instanceMatrix.needsUpdate = true;
    if (trunkRef.current.instanceColor) trunkRef.current.instanceColor.needsUpdate = true;
    if (leafRef.current.instanceColor) leafRef.current.instanceColor.needsUpdate = true;
  }, [version]);

  useFrame(() => {
    const scalar = 0.64 + worldTime.daylight * 0.46;
    trunkMaterial.color.setScalar(scalar);
    leafMaterial.color.setScalar(scalar);
    trunkMaterial.emissiveIntensity = 0.4 - worldTime.daylight * 0.18;
    leafMaterial.emissiveIntensity = 0.5 - worldTime.daylight * 0.22;
  });

  return (
    <group name="mountain-trees">
      <instancedMesh
        ref={trunkRef}
        args={[trunkGeometry, trunkMaterial, MOUNTAIN_TREES.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={leafRef}
        args={[leafGeometry, leafMaterial, MOUNTAIN_TREES.length * 2]}
        frustumCulled={false}
      />
    </group>
  );
}

function caveShape(type) {
  const width = TILE_SIZE * 0.86;
  const height = type === 'tiger' ? TILE_SIZE * 1.15 : type === 'snake' ? TILE_SIZE * 0.82 : TILE_SIZE * 0.46;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(-width / 2, height * 0.45);
  shape.quadraticCurveTo(0, height * 1.16, width / 2, height * 0.45);
  shape.lineTo(width / 2, 0);
  shape.lineTo(-width / 2, 0);
  return { shape, width, height };
}

function CaveEntrance({ cave }) {
  const darkMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#090b09', side: THREE.DoubleSide }),
    []
  );
  const rockColor = cave.type === 'mole' ? '#5b4a37' : cave.type === 'snake' ? '#5f6252' : '#6f675b';
  const rockMaterial = useMemo(() => new THREE.MeshLambertMaterial({ color: rockColor }), [rockColor]);
  const { shape, width, height } = useMemo(() => caveShape(cave.type), [cave.type]);
  const arch = useMemo(() => new THREE.ShapeGeometry(shape, 8), [shape]);
  const y = heightAt(cave.x, cave.z);
  const frame = cave.type === 'mole' ? 0.5 : 0.9;

  return (
    <group position={[cave.x, y + 0.02, cave.z]}>
      <mesh geometry={arch} material={darkMaterial} position={[0, 0, 0.06]} />
      <mesh position={[-(width / 2 + frame / 2), height * 0.42, 0]} material={rockMaterial}>
        <boxGeometry args={[frame, height * 0.9, 1.4]} />
      </mesh>
      <mesh position={[width / 2 + frame / 2, height * 0.42, 0]} material={rockMaterial}>
        <boxGeometry args={[frame, height * 0.9, 1.4]} />
      </mesh>
      <mesh position={[0, height * 0.98, 0]} material={rockMaterial}>
        <boxGeometry args={[width + frame * 2, frame, 1.4]} />
      </mesh>
      <mesh position={[0, height * 0.3, -TILE_SIZE * 0.55]} material={darkMaterial}>
        <boxGeometry args={[width * 0.9, height * 0.7, TILE_SIZE * 0.9]} />
      </mesh>
    </group>
  );
}

function MountainCaves() {
  return (
    <group name="mountain-caves">
      {CAVES.map((cave) => (
        <CaveEntrance key={cave.id} cave={cave} />
      ))}
    </group>
  );
}

const WATER_VERTEX = `
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAGMENT = `
  uniform float uTime;
  uniform float uDay;
  uniform float uEdge;
  varying vec3 vWorld;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 cell = floor(vWorld.xz * 2.0);
    float seed = hash(cell);
    float wave =
      sin(vWorld.x * 1.6 + vWorld.z * 1.2 + uTime * (0.8 + seed * 0.5)) * 0.6 +
      sin(vWorld.x * 3.7 - vWorld.z * 2.1 - uTime * (0.6 + seed * 0.4)) * 0.4;
    float mixValue = 0.5 + 0.5 * wave;
    vec3 deep = vec3(0.13, 0.26, 0.27);
    vec3 shallow = vec3(0.34, 0.56, 0.53);
    vec3 color = mix(deep, shallow, mixValue);
    float sparkle = step(0.9, hash(cell + vec2(floor(uTime * 0.7), 0.0)));
    color += vec3(0.45, 0.58, 0.54) * sparkle * 0.55;
    color *= 0.52 + uDay * 0.66;
    float edge = 1.0;
    if (uEdge > 0.5 && uEdge < 1.5) {
      edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    } else if (uEdge > 1.5) {
      // 圆形水岸：用角度噪声打散规则边缘，避免出现完美圆盘。
      vec2 centered = vUv - 0.5;
      float radial = length(centered) * 2.0;
      float angle = atan(centered.y, centered.x);
      float wobble = (hash(vec2(floor(angle * 5.0), 3.0)) - 0.5) * 0.22;
      wobble += (hash(vec2(floor(angle * 13.0), 9.0)) - 0.5) * 0.1;
      edge = smoothstep(1.06, 0.86, radial + wobble);
    }
    gl_FragColor = vec4(color, 0.88 * edge);
  }
`;

function makeWaterMaterial(edge) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDay: { value: 1 },
      uEdge: { value: edge === 'ribbon' ? 1 : edge === 'body' ? 2 : 0 },
    },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function buildRibbonGeometry(points, width) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const samples = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az, alevel] = points[i];
    const [bx, bz, blevel] = points[i + 1];
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / 2.5));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      samples.push([
        ax + (bx - ax) * t,
        az + (bz - az) * t,
        alevel + (blevel - alevel) * t,
      ]);
    }
  }
  const last = points[points.length - 1];
  samples.push([last[0], last[1], last[2]]);

  let distance = 0;
  samples.forEach((sample, index) => {
    const [x, z, level] = sample;
    const prev = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    const nx = -dz;
    const nz = dx;
    const half = width / 2;
    positions.push(x + nx * half, level + 0.08, z + nz * half);
    positions.push(x - nx * half, level + 0.08, z - nz * half);
    uvs.push(0, distance / width, 1, distance / width);
    if (index > 0) {
      const a = (index - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    if (index > 0) {
      distance += Math.hypot(x - prev[0], z - prev[1]);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const FALL_FRAGMENT = `
  uniform float uTime;
  uniform float uDay;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float stripe = 0.5 + 0.5 * sin(vUv.y * 34.0 - uTime * 5.0 + hash(vec2(floor(vUv.x * 18.0) * 0.37, 0.0)) * 6.28);
    vec3 color = mix(vec3(0.5, 0.72, 0.7), vec3(0.86, 0.96, 0.92), stripe);
    color *= 0.55 + uDay * 0.6;
    float alpha = (0.45 + stripe * 0.35) * smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    gl_FragColor = vec4(color, alpha);
  }
`;

const FALL_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function Waterfalls({ material }) {
  return (
    <group name="mountain-waterfalls">
      {WATERFALLS.map((fall) => {
        const height = fall.top - fall.bottom;
        return (
          <group key={fall.id} position={[fall.x, fall.bottom, fall.z]} rotation={[0, fall.yaw, 0]}>
            <mesh position={[0, height / 2, 0]} material={material}>
              <planeGeometry args={[fall.width, height]} />
            </mesh>
            <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[fall.width * 0.55, 16]} />
              <meshBasicMaterial color="#cfe4dd" transparent opacity={0.28} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function MountainWater() {
  const circleMaterial = useMemo(() => makeWaterMaterial('body'), []);
  const ribbonMaterial = useMemo(() => makeWaterMaterial('ribbon'), []);
  const fallMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uDay: { value: 1 } },
        vertexShader: FALL_VERTEX,
        fragmentShader: FALL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    []
  );

  const streamGeometries = useMemo(
    () => STREAMS.map((stream) => buildRibbonGeometry(stream.points, stream.width + 3)),
    []
  );
  const riverGeometries = useMemo(
    () => RIVERS.map((river) => buildRibbonGeometry(river.points, river.width + 3)),
    []
  );

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const daylight = worldTime.daylight;
    circleMaterial.uniforms.uTime.value = time;
    circleMaterial.uniforms.uDay.value = daylight;
    ribbonMaterial.uniforms.uTime.value = time;
    ribbonMaterial.uniforms.uDay.value = daylight;
    fallMaterial.uniforms.uTime.value = time;
    fallMaterial.uniforms.uDay.value = daylight;
  });

  return (
    <group name="mountain-water">
      {[...PONDS, ...LAKES].map((body) => (
        <mesh
          key={body.id}
          material={circleMaterial}
          position={[body.x, body.level + WATER_SURFACE_LIFT, body.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <circleGeometry args={[body.radius + 8.5, 32]} />
        </mesh>
      ))}
      {streamGeometries.map((geometry, index) => (
        <mesh
          key={`stream-${index}`}
          geometry={geometry}
          material={ribbonMaterial}
          renderOrder={2}
        />
      ))}
      {riverGeometries.map((geometry, index) => (
        <mesh
          key={`river-${index}`}
          geometry={geometry}
          material={ribbonMaterial}
          renderOrder={2}
        />
      ))}
      <Waterfalls material={fallMaterial} />
    </group>
  );
}

function MountainHidingSpots() {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#263521',
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    []
  );
  return (
    <group name="mountain-hiding-spots">
      {HIDING_SPOTS.map((spot) => (
        <mesh
          key={spot.id}
          material={material}
          position={[spot.x, heightAt(spot.x, spot.z) + 0.04, spot.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1}
        >
          <circleGeometry args={[spot.radius, 12]} />
        </mesh>
      ))}
    </group>
  );
}

export default function MountainWorld() {
  return (
    <group name="mountain-world">
      <MountainTerrain />
      <MountainGrass />
      <MountainTrees />
      <MountainWater />
      <MountainCaves />
      <MountainHidingSpots />
    </group>
  );
}
