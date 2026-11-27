import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { mulberry32 } from '../utils/random';
import {
  heightAt,
  isInsideBuilding,
  nearFarmOrHouse,
  shorelineZ,
  streamDistance,
} from '../game/terrain';
import { worldTime } from '../game/time';
import { MOLES } from '../game/moles';
import {
  HOME_GRASS_OUTER_REGION,
  HOME_GRASS_REGION,
  SAKURA_GRASS,
  SKY_GRASS_SAMPLE,
  homeGrassDensity,
  isInHomeGrass,
  isInSkySample,
  skyGrassDensity,
} from './skyGrassConfig';

// 原样片的独立几何与着色器：等宽、方头、阶梯状像素彩带。
export function buildBladeGeometry() {
  const rows = 7;
  const halfWidth = 0.035;
  const positions = [];
  const colors = [];
  const heights = [];
  const indices = [];
  const root = new THREE.Color('#33473a');
  const middle = new THREE.Color('#405747');
  const top = new THREE.Color('#61745e');
  const color = new THREE.Color();

  for (let i = 0; i < rows; i += 1) {
    const t = i / (rows - 1);
    const bend = Math.floor(t * 4) * 0.035;
    positions.push(-halfWidth + bend, t, 0, halfWidth + bend, t, 0);
    if (t < 0.55) color.copy(root).lerp(middle, t / 0.55);
    else color.copy(middle).lerp(top, (t - 0.55) / 0.45);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    heights.push(t, t);
  }
  for (let i = 0; i < rows - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildBlades() {
  const random = mulberry32(77123);
  const list = [];
  for (let t = 0; t < 900; t += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * SKY_GRASS_SAMPLE.radius;
    const cx = SKY_GRASS_SAMPLE.x + Math.cos(angle) * radius;
    const cz = SKY_GRASS_SAMPLE.z + Math.sin(angle) * radius;
    const blades = 6 + Math.floor(random() * 4);
    for (let b = 0; b < blades; b += 1) {
      const x = cx + (random() - 0.5) * 0.32;
      const z = cz + (random() - 0.5) * 0.32;
      const leanAngle = random() * Math.PI * 2;
      const lean = 0.1 + random() * 0.22;
      list.push({
        x,
        y: heightAt(x, z) + 0.03,
        z,
        rotationY: random() * Math.PI * 2,
        leanX: Math.cos(leanAngle) * lean,
        leanZ: Math.sin(leanAngle) * lean,
        height: 0.24 + random() * 0.22,
        width: 0.8 + random() * 0.4,
      });
    }
  }
  return list;
}

function isHomeGrassSpot(x, z, excludeSample = true) {
  return (
    isInHomeGrass(x, z) &&
    z > shorelineZ(x) + 0.8 &&
    streamDistance(x, z) > 0.25 &&
    !nearFarmOrHouse(x, z, 0.8) &&
    !isInsideBuilding(x, z, 0.5) &&
    !MOLES.some((mole) => Math.hypot(x - mole.x, z - mole.z) < 1.8) &&
    (!excludeSample || !isInSkySample(x, z, 0.35))
  );
}

const HOME_DENSE_ZONES = [
  { minX: -50, maxX: 35, minZ: 2.2, maxZ: 72 },
  { minX: -125, maxX: -75, minZ: 45, maxZ: 92 },
  { minX: 145, maxX: 192, minZ: 88, maxZ: 140 },
  { minX: -85, maxX: -35, minZ: 190, maxZ: 242 },
];

function randomHomePoint(random) {
  const zone = random() < 0.6
    ? HOME_DENSE_ZONES[Math.floor(random() * HOME_DENSE_ZONES.length)]
    : HOME_GRASS_REGION;
  return [
    zone.minX + random() * (zone.maxX - zone.minX),
    zone.minZ + random() * (zone.maxZ - zone.minZ),
  ];
}

// 已确认的几房屋版基底保持不动，只在樱花树密草核心内逐渐让位。
function buildBaseBlades() {
  const random = mulberry32(77125);
  const list = [];
  let tufts = 0;
  for (let attempt = 0; attempt < 320000 && tufts < 60000; attempt += 1) {
    const [cx, cz] = randomHomePoint(random);
    if (!isHomeGrassSpot(cx, cz)) continue;
    const coreDensity = skyGrassDensity(cx, cz);
    if (coreDensity > 0 && random() < coreDensity) continue;
    tufts += 1;
    const y = heightAt(cx, cz) + 0.03;
    const blades = 6 + Math.floor(random() * 4);
    for (let b = 0; b < blades; b += 1) {
      const x = cx + (random() - 0.5) * 0.32;
      const z = cz + (random() - 0.5) * 0.32;
      const leanAngle = random() * Math.PI * 2;
      const lean = 0.1 + random() * 0.22;
      list.push({
        x,
        y,
        z,
        rotationY: random() * Math.PI * 2,
        leanX: Math.cos(leanAngle) * lean,
        leanZ: Math.sin(leanAngle) * lean,
        height: 0.24 + random() * 0.22,
        width: 0.8 + random() * 0.4,
      });
    }
  }

  // 住宅基底向外延伸 36U，新旧草叶以互补密度交错，消除有草/无草硬边界。
  let fringeTufts = 0;
  for (let attempt = 0; attempt < 160000 && fringeTufts < 24000; attempt += 1) {
    const cx = HOME_GRASS_OUTER_REGION.minX + random() * (HOME_GRASS_OUTER_REGION.maxX - HOME_GRASS_OUTER_REGION.minX);
    const cz = HOME_GRASS_OUTER_REGION.minZ + random() * (HOME_GRASS_OUTER_REGION.maxZ - HOME_GRASS_OUTER_REGION.minZ);
    if (
      cx > HOME_GRASS_REGION.minX && cx < HOME_GRASS_REGION.maxX &&
      cz > HOME_GRASS_REGION.minZ && cz < HOME_GRASS_REGION.maxZ
    ) continue;
    if (!isHomeGrassSpot(cx, cz)) continue;
    const density = homeGrassDensity(cx, cz);
    if (density <= 0 || random() > density) continue;
    const coreDensity = skyGrassDensity(cx, cz);
    if (coreDensity > 0 && random() < coreDensity) continue;
    fringeTufts += 1;
    const y = heightAt(cx, cz) + 0.03;
    const blades = 6 + Math.floor(random() * 4);
    for (let b = 0; b < blades; b += 1) {
      const x = cx + (random() - 0.5) * 0.32;
      const z = cz + (random() - 0.5) * 0.32;
      const leanAngle = random() * Math.PI * 2;
      const lean = 0.1 + random() * 0.22;
      list.push({
        x,
        y,
        z,
        rotationY: random() * Math.PI * 2,
        leanX: Math.cos(leanAngle) * lean,
        leanZ: Math.sin(leanAngle) * lean,
        height: 0.24 + random() * 0.22,
        width: 0.8 + random() * 0.4,
      });
    }
  }
  return list;
}

function buildBaseMotes() {
  const random = mulberry32(4413);
  const count = 220;
  const positions = new Float32Array(count * 3);
  const baseY = new Float32Array(count);
  const seeds = new Float32Array(count);
  let placed = 0;
  for (let attempt = 0; attempt < 4000 && placed < count; attempt += 1) {
    const x = HOME_GRASS_REGION.minX + random() * (HOME_GRASS_REGION.maxX - HOME_GRASS_REGION.minX);
    const z = HOME_GRASS_REGION.minZ + random() * (HOME_GRASS_REGION.maxZ - HOME_GRASS_REGION.minZ);
    if (!isHomeGrassSpot(x, z)) continue;
    const coreDensity = skyGrassDensity(x, z);
    if (coreDensity > 0 && random() < coreDensity) continue;
    baseY[placed] = heightAt(x, z) + 0.25;
    positions[placed * 3] = x;
    positions[placed * 3 + 1] = baseY[placed] + random() * 1.5;
    positions[placed * 3 + 2] = z;
    seeds[placed] = random();
    placed += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, placed);
  return { geometry, baseY, seeds, count: placed };
}

function randomSakuraPoint(random) {
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * (SAKURA_GRASS.transitionRadius + 6);
  return [
    SAKURA_GRASS.x + Math.cos(angle) * radius,
    SAKURA_GRASS.z + Math.sin(angle) * radius,
  ];
}

// 核心密度与原样片一致；40～88U 的宽过渡带按平滑曲线逐渐融入疏草。
function buildHomeBlades() {
  const random = mulberry32(77124);
  const list = [];
  const sampleDensity = 900 / (Math.PI * SKY_GRASS_SAMPLE.radius ** 2);
  const candidates = Math.round(Math.PI * (SAKURA_GRASS.transitionRadius + 6) ** 2 * sampleDensity);
  for (let i = 0; i < candidates; i += 1) {
    const [cx, cz] = randomSakuraPoint(random);
    if (random() > skyGrassDensity(cx, cz) || !isHomeGrassSpot(cx, cz)) continue;
    const y = heightAt(cx, cz) + 0.03;
    const blades = 6 + Math.floor(random() * 4);
    for (let b = 0; b < blades; b += 1) {
      const x = cx + (random() - 0.5) * 0.32;
      const z = cz + (random() - 0.5) * 0.32;
      const leanAngle = random() * Math.PI * 2;
      const lean = 0.1 + random() * 0.22;
      list.push({
        x,
        y,
        z,
        rotationY: random() * Math.PI * 2,
        leanX: Math.cos(leanAngle) * lean,
        leanZ: Math.sin(leanAngle) * lean,
        height: 0.24 + random() * 0.22,
        width: 0.8 + random() * 0.4,
      });
    }
  }
  return list;
}

function buildHomeMotes() {
  const random = mulberry32(4412);
  const count = 1000;
  const positions = new Float32Array(count * 3);
  const baseY = new Float32Array(count);
  const seeds = new Float32Array(count);
  let placed = 0;
  for (let attempt = 0; attempt < 20000 && placed < count; attempt += 1) {
    const [x, z] = randomSakuraPoint(random);
    if (random() > skyGrassDensity(x, z) || !isHomeGrassSpot(x, z)) continue;
    baseY[placed] = heightAt(x, z) + 0.25;
    positions[placed * 3] = x;
    positions[placed * 3 + 1] = baseY[placed] + random() * 1.5;
    positions[placed * 3 + 2] = z;
    seeds[placed] = random();
    placed += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, placed);
  return { geometry, baseY, seeds, count: placed };
}

// 只在主樱花树周围一小片草地增强上浮光点，不改变其他区域的夜间密度。
function buildSakuraMotes() {
  const random = mulberry32(4414);
  const count = 180;
  const positions = new Float32Array(count * 3);
  const baseY = new Float32Array(count);
  const seeds = new Float32Array(count);
  let placed = 0;
  for (let attempt = 0; attempt < 4000 && placed < count; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 12;
    const x = SAKURA_GRASS.x + Math.cos(angle) * radius;
    const z = SAKURA_GRASS.z + Math.sin(angle) * radius;
    if (!isHomeGrassSpot(x, z, false)) continue;
    baseY[placed] = heightAt(x, z) + 0.25;
    positions[placed * 3] = x;
    positions[placed * 3 + 1] = baseY[placed] + random() * 1.5;
    positions[placed * 3 + 2] = z;
    seeds[placed] = random();
    placed += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, placed);
  return { geometry, baseY, seeds, count: placed };
}

function updateMotes(points, data, time) {
  if (!points) return;
  const array = data.geometry.attributes.position.array;
  for (let i = 0; i < data.count; i += 1) {
    const seed = data.seeds[i];
    const rise = (time * (0.1 + seed * 0.08) + seed) % 1;
    array[i * 3 + 1] = (data.baseY ? data.baseY[i] : 0.25) + rise * 1.9;
    array[i * 3] += Math.sin(time * 0.6 + seed * 9) * 0.0015;
  }
  data.geometry.attributes.position.needsUpdate = true;
}

function makeHomeGroundTexture() {
  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const random = mulberry32(6622);
  for (let py = 0; py < height; py += 1) {
    const z = HOME_GRASS_OUTER_REGION.minZ + ((py + 0.5) / height) * (HOME_GRASS_OUTER_REGION.maxZ - HOME_GRASS_OUTER_REGION.minZ);
    for (let px = 0; px < width; px += 1) {
      const x = HOME_GRASS_OUTER_REGION.minX + ((px + 0.5) / width) * (HOME_GRASS_OUTER_REGION.maxX - HOME_GRASS_OUTER_REGION.minX);
      if (!isHomeGrassSpot(x, z, false)) continue;
      const coreDensity = skyGrassDensity(x, z);
      const homeDensity = homeGrassDensity(x, z);
      const index = (py * width + px) * 4;
      const noise = (random() - 0.5) * 5;
      image.data[index] = 62 + noise;
      image.data[index + 1] = 80 + noise;
      image.data[index + 2] = 70 + noise;
      image.data[index + 3] = Math.round(Math.max(225 * homeDensity, 240 * coreDensity));
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMoteTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const VERTEX_SHADER = `
  uniform float uTime;
  attribute vec3 aColor;
  attribute float aHeight;
  varying vec3 vColor;
  varying float vHeight;
  varying vec3 vWorld;

  void main() {
    vColor = aColor;
    vHeight = aHeight;
    #ifdef USE_INSTANCING
      vec4 localPos = instanceMatrix * vec4(position, 1.0);
    #else
      vec4 localPos = vec4(position, 1.0);
    #endif
    float sway = pow(aHeight, 1.65);
    float phase = localPos.x * 0.6 + localPos.z * 0.45;
    float wave = sin(uTime * 1.05 + phase) * 0.6 + sin(uTime * 2.2 + phase * 1.7) * 0.18;
    localPos.x += sway * wave * 0.05;
    localPos.z += sway * cos(uTime * 0.85 + phase) * 0.02;
    vec4 world = modelMatrix * localPos;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uDaylight;
  varying vec3 vColor;
  varying float vHeight;
  varying vec3 vWorld;

  void main() {
    vec3 col = vColor * mix(0.18, 1.0, uDaylight);
    float tip = smoothstep(0.72, 1.0, vHeight);
    float shimmer = 0.5 + 0.5 * sin(uTime * 1.2 + vWorld.x * 1.9 + vWorld.z * 1.4);
    col += vec3(0.06, 0.09, 0.055) * tip * shimmer * 0.045 * (1.0 - uDaylight * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export default function SkyGrassSample() {
  const meshRef = useRef();
  const baseMeshRef = useRef();
  const homeMeshRef = useRef();
  const moteRef = useRef();
  const baseMoteRef = useRef();
  const homeMoteRef = useRef();
  const sakuraMoteRef = useRef();
  const homeGroundMaterialRef = useRef();
  const blades = useMemo(() => buildBlades(), []);
  const baseBlades = useMemo(() => buildBaseBlades(), []);
  const homeBlades = useMemo(() => buildHomeBlades(), []);
  const bladeGeometry = useMemo(() => buildBladeGeometry(), []);
  const homeGroundTexture = useMemo(() => makeHomeGroundTexture(), []);
  const moteTexture = useMemo(() => makeMoteTexture(), []);
  const baseMotes = useMemo(() => buildBaseMotes(), []);
  const homeMotes = useMemo(() => buildHomeMotes(), []);
  const sakuraMotes = useMemo(() => buildSakuraMotes(), []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDaylight: { value: 1 } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
  }), []);
  const motes = useMemo(() => {
    const random = mulberry32(4411);
    const count = 64;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * SKY_GRASS_SAMPLE.radius;
      positions[i * 3] = SKY_GRASS_SAMPLE.x + Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.4 + random() * 1.5;
      positions[i * 3 + 2] = SKY_GRASS_SAMPLE.z + Math.sin(angle) * radius;
      seeds[i] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry, seeds, count };
  }, []);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    [[meshRef.current, blades], [baseMeshRef.current, baseBlades], [homeMeshRef.current, homeBlades]].forEach(([mesh, items]) => {
      if (!mesh) return;
      items.forEach((blade, index) => {
        dummy.position.set(blade.x, blade.y, blade.z);
        dummy.rotation.set(blade.leanX, blade.rotationY, blade.leanZ);
        dummy.scale.set(blade.width, blade.height, blade.width);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [blades, baseBlades, homeBlades]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    material.uniforms.uTime.value = time;
    const daylight = worldTime.daylight;
    material.uniforms.uDaylight.value = daylight;
    if (homeGroundMaterialRef.current) homeGroundMaterialRef.current.color.setScalar(0.18 + daylight * 0.82);
    updateMotes(moteRef.current, motes, time);
    updateMotes(baseMoteRef.current, baseMotes, time);
    updateMotes(homeMoteRef.current, homeMotes, time);
    updateMotes(sakuraMoteRef.current, sakuraMotes, time);
  });

  return (
    <group name="approved-sky-grass-sample">
      <mesh
        position={[
          (HOME_GRASS_OUTER_REGION.minX + HOME_GRASS_OUTER_REGION.maxX) / 2,
          0.068,
          (HOME_GRASS_OUTER_REGION.minZ + HOME_GRASS_OUTER_REGION.maxZ) / 2,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[
          HOME_GRASS_OUTER_REGION.maxX - HOME_GRASS_OUTER_REGION.minX,
          HOME_GRASS_OUTER_REGION.maxZ - HOME_GRASS_OUTER_REGION.minZ,
        ]} />
        <meshBasicMaterial
          ref={homeGroundMaterialRef}
          map={homeGroundTexture}
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <instancedMesh ref={baseMeshRef} args={[bladeGeometry, material, baseBlades.length]} frustumCulled={false} />
      <instancedMesh ref={homeMeshRef} args={[bladeGeometry, material, homeBlades.length]} frustumCulled={false} />
      <instancedMesh ref={meshRef} args={[bladeGeometry, material, blades.length]} frustumCulled={false} />
      <points ref={moteRef} geometry={motes.geometry}>
        <pointsMaterial
          map={moteTexture}
          size={0.13}
          transparent
          opacity={0.44}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
          color="#61745e"
        />
      </points>
      <points ref={baseMoteRef} geometry={baseMotes.geometry}>
        <pointsMaterial
          map={moteTexture}
          size={0.13}
          transparent
          opacity={0.44}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
          color="#61745e"
        />
      </points>
      <points ref={homeMoteRef} geometry={homeMotes.geometry}>
        <pointsMaterial
          map={moteTexture}
          size={0.13}
          transparent
          opacity={0.44}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
          color="#61745e"
        />
      </points>
      <points ref={sakuraMoteRef} geometry={sakuraMotes.geometry}>
        <pointsMaterial
          map={moteTexture}
          size={0.18}
          transparent
          opacity={0.72}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
          color="#819174"
        />
      </points>
    </group>
  );
}
