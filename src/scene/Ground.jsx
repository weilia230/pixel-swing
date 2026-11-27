import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../utils/random';
import { createCrossedFoliageGeometry, createFoliageTexture } from './foliage';
import { homeGrassDensity, isInSkySample } from './skyGrassConfig';
import { MOLES } from '../game/moles';
import {
  FARM,
  FORESTS,
  GROUND,
  NEIGHBOR_FARMS,
  PATH_ROUTES,
  SAKURA,
  heightAt,
  isInsideBuilding,
  shorelineZ,
  streamDistance,
  terrainBaseHeightAt,
} from '../game/terrain';

// 地面与草根同色系的暗灰绿，低饱和、低对比
const PALETTE = ['#36472f', '#3d4e35', '#42543a', '#33432c', '#475a3e', '#3a4b32'];

const GRASS_COLORS = ['#374831', '#3f5137', '#465a3d', '#32422c', '#4c5f42', '#3d4e34'];
const GRASS_TINTS = ['#e8eee1', '#dfe7d6', '#eff3e9', '#d8e1cf', '#f2f5ec', '#e3eadb'];
const FLOWER_COLORS = ['#f4ecd2', '#f2c94c', '#df5f4a', '#e795a4', '#c9b6e6', '#f7f0d8', '#e8b84a', '#8a7fd0', '#7f8fd6', '#a08bd8'];
const LEAF_COLORS = ['#b5622f', '#c98a33', '#8a4a2c', '#d8a33c', '#7d5a34', '#a8743a'];
const ROCK_COLORS = ['#4b4340', '#514741', '#5a504a', '#6a5f55', '#443d3a'];
const SOIL_COLORS = ['#5d4229', '#4e3622', '#6b4a2c', '#3f2c1c'];

// 地面纹理统一降饱和、降对比，保留原有像素颗粒和透明度
function softenGroundTexture(canvas, saturationScale = 0.5, contrastScale = 0.5) {
  const ctx = canvas.getContext('2d');
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const color = new THREE.Color();
  const hsl = {};
  const rgb = {};
  for (let i = 0; i < data.length; i += 4) {
    color.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
    color.getHSL(hsl, THREE.SRGBColorSpace);
    color.setHSL(
      hsl.h,
      hsl.s * saturationScale,
      THREE.MathUtils.clamp(0.5 + (hsl.l - 0.5) * contrastScale, 0, 1),
      THREE.SRGBColorSpace
    );
    color.getRGB(rgb, THREE.SRGBColorSpace);
    data[i] = Math.round(rgb.r * 255);
    data[i + 1] = Math.round(rgb.g * 255);
    data[i + 2] = Math.round(rgb.b * 255);
  }
  ctx.putImageData(image, 0, 0);
}

function makeGrassTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#3a4b33';
  ctx.fillRect(0, 0, size, size);

  const random = mulberry32(3141);
  // 只保留少量柔和的大色块，整体接近一块平整的草色，不再有密集噪点。
  for (let i = 0; i < 130; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    ctx.fillStyle = PALETTE[Math.floor(random() * PALETTE.length)];
    ctx.globalAlpha = 0.05 + random() * 0.08;
    ctx.fillRect(x, y, 4 + Math.floor(random() * 8), 2 + Math.floor(random() * 5));
  }
  ctx.globalAlpha = 1;

  // 极少量细草纹，只提供一点方向感，不制造花斑。
  for (let i = 0; i < 900; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const length = 1 + Math.floor(random() * 3);
    ctx.fillStyle = GRASS_COLORS[Math.floor(random() * GRASS_COLORS.length)];
    ctx.fillRect(x, y, random() > 0.92 ? 2 : 1, length);
  }

  // 少量枯草斑点，透明度很低，避免形成对比强烈的杂色。
  for (let i = 0; i < 55; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    ctx.fillStyle = random() > 0.55 ? '#5a5440' : '#655f4a';
    ctx.globalAlpha = 0.14 + random() * 0.12;
    ctx.fillRect(x, y, 1 + Math.floor(random() * 2), 1);
  }
  ctx.globalAlpha = 1;

  softenGroundTexture(canvas, 0.95, 0.9);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    (GROUND.maxX - GROUND.minX) / 13.5,
    (GROUND.maxZ - GROUND.minZ) / 13.5
  );
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeDirtTexture() {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#806a46';
  ctx.fillRect(0, 0, size, size);
  const random = mulberry32(8821);
  for (let i = 0; i < 1500; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const colors = ['#9a8054', '#725d3d', '#8e754b', '#685438', '#aa9161'];
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    ctx.fillRect(x, y, random() > 0.88 ? 2 : 1, random() > 0.8 ? 2 : 1);
  }
  // 细碎砂砾和被踩进土里的草茎。
  for (let i = 0; i < 95; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    ctx.fillStyle = random() > 0.45 ? '#b2a079' : '#5f6537';
    ctx.fillRect(x, y, 2 + Math.floor(random() * 3), 1);
    if (random() > 0.55) ctx.fillRect(x + 1, y + 1, 1, 1);
  }
  const edge = ctx.createLinearGradient(0, 0, size, 0);
  edge.addColorStop(0, 'rgba(57, 54, 29, 0.5)');
  edge.addColorStop(0.15, 'rgba(70, 52, 30, 0)');
  edge.addColorStop(0.85, 'rgba(70, 52, 30, 0)');
  edge.addColorStop(1, 'rgba(57, 54, 29, 0.5)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);

  softenGroundTexture(canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function useGroundGeometry() {
  return useMemo(() => {
    const width = GROUND.maxX - GROUND.minX;
    const depth = GROUND.maxZ - GROUND.minZ;
    const geometry = new THREE.PlaneGeometry(width, depth, Math.ceil(width / 12), Math.ceil(depth / 12));
    geometry.rotateX(-Math.PI / 2);
    geometry.translate((GROUND.minX + GROUND.maxX) / 2, 0, (GROUND.minZ + GROUND.maxZ) / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      if (z < shorelineZ(x) + 0.1) {
        position.setY(i, -0.55);
      } else {
        position.setY(i, terrainBaseHeightAt(x, z));
      }
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, []);
}

// 土路：沿折线生成贴合地形的三角带，纹理自带深色收边
function buildPathGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  let base = 0;

  PATH_ROUTES.forEach((route) => {
    const points = route.points;
    const half = route.width / 2;
    const samples = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(length / 2.4));
      for (let s = 0; s < steps; s += 1) {
        const t = s / steps;
        samples.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      }
    }
    samples.push(points[points.length - 1]);

    let distance = 0;
    samples.forEach((sample, index) => {
      const [x, z] = sample;
      const prev = samples[Math.max(0, index - 1)];
      const next = samples[Math.min(samples.length - 1, index + 1)];
      let dx = next[0] - prev[0];
      let dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const nx = -dz;
      const nz = dx;
      const y = heightAt(x, z) + 0.045;
      positions.push(x + nx * half, y, z + nz * half);
      positions.push(x - nx * half, y, z - nz * half);
      uvs.push(0, distance / 3.2);
      uvs.push(1, distance / 3.2);
      if (index > 0) {
        const a = base + (index - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      if (index > 0) {
        distance += Math.hypot(x - prev[0], z - prev[1]);
      }
    });
    base += samples.length * 2;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 湿地带纹理：从草地一侧完全透明，到水边逐渐变成湿润的深色
function makeShoreTexture() {
  const width = 64;
  const height = 8;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.38)');
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.74)');
  gradient.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  // 细碎颗粒，避免湿地带变成一条平滑色带
  const random = mulberry32(9021);
  for (let i = 0; i < 90; i += 1) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    const tone = 150 + Math.floor(random() * 105);
    ctx.fillStyle = `rgba(${tone},${tone},${tone},${0.18 + random() * 0.24})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 湖岸：一条从草地平滑过渡到水下的湿地带，取代原来生硬的深色描边
const SHORE_ROWS = [
  { offset: 2.8, y: 0.078, u: 0, color: '#41543a' },
  { offset: 1.6, y: 0.074, u: 0.32, color: '#3d4f37' },
  { offset: 0.6, y: 0.066, u: 0.62, color: '#394a32' },
  { offset: -0.2, y: 0.048, u: 0.84, color: '#34432d' },
  { offset: -1.4, y: -0.26, u: 1, color: '#2f3b28' },
];

function useShoreApron() {
  return useMemo(() => {
    const xs = [];
    for (let x = GROUND.minX; x <= GROUND.maxX; x += 3) xs.push(x);

    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    const color = new THREE.Color();
    xs.forEach((x, xi) => {
      const z = shorelineZ(x);
      SHORE_ROWS.forEach((row) => {
        positions.push(x, row.y, z + row.offset);
        color.set(row.color);
        colors.push(color.r, color.g, color.b);
        uvs.push(row.u, x / 9);
      });
      if (xi > 0) {
        const base = (xi - 1) * SHORE_ROWS.length;
        for (let r = 0; r < SHORE_ROWS.length - 1; r += 1) {
          const a = base + r;
          const b = a + 1;
          const c = base + SHORE_ROWS.length + r;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, []);
}

function onFarm(x, z, pad = 1.2) {
  if (
    x > FARM.minX - pad && x < FARM.maxX + pad &&
    z > FARM.minZ - pad && z < FARM.maxZ + pad
  ) {
    return true;
  }
  return NEIGHBOR_FARMS.some(
    (farm) => Math.abs(x - farm.center.x) < 16 + pad && Math.abs(z - farm.center.z) < 21 + pad
  );
}

function inForest(x, z) {
  return FORESTS.some(
    (zone) => x > zone.minX && x < zone.maxX && z > zone.minZ && z < zone.maxZ
  );
}

// 近景丰富、远景简化的密度曲线
function detailDensity(x, z) {
  const distance = Math.hypot(x, z * 0.85);
  let density = distance < 150 ? 1 : distance < 360 ? 0.78 : distance < 680 ? 0.52 : 0.3;
  if (inForest(x, z)) density *= 1.2;
  return density;
}

// 生成所有地表细节实例
function buildDetail() {
  const random = mulberry32(20261122);
  const tufts = [];
  const pebbles = [];
  const leaves = [];
  const flowerStems = [];
  const flowerHeads = [];
  const rocks = [];
  const mossCaps = [];
  const shrubs = [];
  const pits = [];
  const steps = [];

  const inWater = (x, z) => z < shorelineZ(x) + 0.8 || streamDistance(x, z) < 0.2;
  const pick = (list) => list[Math.floor(random() * list.length)];

  const randomPoint = () => {
    if (random() < 0.82) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 180;
      const x = Math.cos(angle) * radius;
      const z = Math.max(2.4, 45 + Math.sin(angle) * radius * 0.92);
      return [x, z];
    }
    const x = GROUND.minX + random() * (GROUND.maxX - GROUND.minX);
    const z = shorelineZ(x) + 0.7 + random() * (GROUND.maxZ - shorelineZ(x) - 1.4);
    return [x, z];
  };

  // 草丛 / 草簇：样片区域内由原独立样片负责，避免两种草重叠。
  for (let i = 0; i < 52000 && tufts.length < 26000; i += 1) {
    const [x, z] = randomPoint();
    if (
      inWater(x, z) ||
      onFarm(x, z, 1.4) ||
      isInsideBuilding(x, z, 0.35) ||
      isInSkySample(x, z, 0.15)
    ) continue;
    // 鼹鼠周围留一小块裸土，避免被草丛挡住
    if (MOLES.some((mole) => Math.hypot(x - mole.x, z - mole.z) < 1.8)) continue;
    // 新旧草地在宽过渡带内按互补概率混合，不再沿矩形边界直接切换。
    const homeDensity = homeGrassDensity(x, z);
    if (homeDensity > 0 && random() < homeDensity) continue;
    if (random() > detailDensity(x, z)) continue;
    const h = heightAt(x, z);
    const scale = 0.5 + random() * 0.95;
    tufts.push({
      position: [x, h + 0.025, z],
      rotation: [0, random() * Math.PI * 2, (random() - 0.5) * 0.09],
      scale: [scale, scale * (0.55 + random() * 0.7), scale],
      color: pick(GRASS_TINTS),
    });
  }

  // 小石块 / 碎石
  for (let i = 0; i < 15000 && pebbles.length < 4800; i += 1) {
    const [x, z] = randomPoint();
    if (inWater(x, z) || onFarm(x, z, 0.8) || isInsideBuilding(x, z, 1.25)) continue;
    const h = heightAt(x, z);
    const nearHill = h > 0.6;
    if (random() > detailDensity(x, z) * (nearHill ? 1.25 : 0.7)) continue;
    const scale = 0.08 + random() * (nearHill ? 0.36 : 0.24);
    pebbles.push({
      position: [x, h + scale * 0.4, z],
      rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
      scale: [scale, scale * (0.55 + random() * 0.4), scale],
      color: pick(ROCK_COLORS),
    });
  }

  // 落叶
  for (let i = 0; i < 9000 && leaves.length < 3200; i += 1) {
    const [x, z] = randomPoint();
    if (inWater(x, z) || onFarm(x, z, 0.5)) continue;
    if (random() > detailDensity(x, z) * 0.9) continue;
    const scale = 0.11 + random() * 0.16;
    leaves.push({
      position: [x, heightAt(x, z) + 0.055, z],
      rotation: [0, random() * Math.PI * 2, 0],
      scale: [scale, 0.018, scale * 0.7],
      color: pick(LEAF_COLORS),
    });
  }

  // 小野花：成簇分布
  const clusters = 560;
  for (let c = 0; c < clusters; c += 1) {
    const [cx, cz] = randomPoint();
    if (inWater(cx, cz) || onFarm(cx, cz, 1)) continue;
    if (random() > detailDensity(cx, cz)) continue;
    const count = 2 + Math.floor(random() * 5);
    for (let i = 0; i < count && flowerHeads.length < 5200; i += 1) {
      const x = cx + (random() - 0.5) * 3.4;
      const z = cz + (random() - 0.5) * 3.4;
      if (inWater(x, z) || onFarm(x, z, 0.6)) continue;
      const h = heightAt(x, z);
      const color = pick(FLOWER_COLORS);
      flowerStems.push({
        position: [x, h, z],
        rotation: [0, 0, 0],
        scale: [0.05, 0.26 + random() * 0.16, 0.05],
        color: '#4f6f2f',
      });
      flowerHeads.push({
        position: [x, h + 0.28 + random() * 0.12, z],
        rotation: [0, random() * Math.PI, 0],
        scale: [0.15, 0.12, 0.15],
        color,
      });
    }
  }

  // 山体岩层 / 大石块
  for (let i = 0; i < 4200 && rocks.length < 900; i += 1) {
    const [x, z] = randomPoint();
    if (inWater(x, z) || onFarm(x, z, 1.5) || isInsideBuilding(x, z, 1.5)) continue;
    const h = heightAt(x, z);
    const onSlope = h > 0.7 || inForest(x, z);
    if (random() > detailDensity(x, z) * (onSlope ? 1 : 0.28)) continue;
    const scale = 0.22 + random() * (onSlope ? 1.05 : 0.5);
    rocks.push({
      position: [x, h + scale * 0.32, z],
      rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
      scale: [scale, scale * (0.55 + random() * 0.45), scale * (0.8 + random() * 0.4)],
      color: pick(ROCK_COLORS),
    });
    if (random() > 0.45) {
      mossCaps.push({
        position: [x, h + scale * 0.58, z],
        rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
        scale: [scale * 0.82, scale * 0.24, scale * 0.82],
        color: random() > 0.5 ? '#5f7a38' : '#6f8a40',
      });
    }
  }

  // 低矮灌木，主要长在山坡与林缘
  for (let i = 0; i < 3000 && shrubs.length < 620; i += 1) {
    const [x, z] = randomPoint();
    if (inWater(x, z) || onFarm(x, z, 1.5)) continue;
    const h = heightAt(x, z);
    if (h < 0.4 && !inForest(x, z)) continue;
    if (random() > detailDensity(x, z) * 0.9) continue;
    const scale = 0.35 + random() * 0.6;
    shrubs.push({
      position: [x, h + scale * 0.35, z],
      rotation: [0, random() * Math.PI * 2, 0],
      scale: [scale * 1.15, scale * 0.8, scale],
      color: random() > 0.5 ? '#456226' : '#527333',
    });
  }

  // 土坑：森林腐土与山地凹陷
  for (let i = 0; i < 2600 && pits.length < 420; i += 1) {
    const [x, z] = randomPoint();
    if (inWater(x, z) || onFarm(x, z, 1.5)) continue;
    if (!inForest(x, z) && heightAt(x, z) < 0.6) continue;
    if (random() > detailDensity(x, z)) continue;
    const scale = 0.5 + random() * 0.8;
    pits.push({
      position: [x, heightAt(x, z) + 0.022, z],
      rotation: [-Math.PI / 2, 0, random() * Math.PI],
      scale: [scale, scale * 0.8, 1],
      color: pick(SOIL_COLORS),
    });
  }

  // 山路台阶：缓坡上的石阶
  PATH_ROUTES.forEach((route) => {
    const points = route.points;
    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const count = Math.floor(length / 3.4);
      for (let s = 0; s < count; s += 1) {
        const t = (s + 0.5) / count;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        if (isInsideBuilding(x, z, route.width)) continue;
        const h = heightAt(x, z);
        const slope = Math.abs(heightAt(x + 1.2, z) - heightAt(x - 1.2, z)) +
          Math.abs(heightAt(x, z + 1.2) - heightAt(x, z - 1.2));
        if (slope < 0.45) continue;
        const yaw = Math.atan2(bx - ax, bz - az);
        steps.push({
          position: [x, h + 0.07, z],
          rotation: [0, yaw, 0],
          scale: [route.width * 0.92, 0.16, 1.15],
          color: random() > 0.5 ? '#6c655c' : '#5d5750',
        });
      }
    }
  });

  return { tufts, pebbles, leaves, flowerStems, flowerHeads, rocks, mossCaps, shrubs, pits, steps };
}

function Field({ items, geometry, color = '#ffffff', basic = false, opacity = 1, flatShading = false, map = null, alphaTest = 0, doubleSide = false, onBeforeCompile = null }) {
  const mesh = useRef();

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    mesh.current.count = items.length;
    items.forEach((item, index) => {
      dummy.position.set(...item.position);
      const rotation = item.rotation || [0, 0, 0];
      dummy.rotation.set(rotation[0], rotation[1], rotation[2]);
      const scale = item.scale;
      if (Array.isArray(scale)) dummy.scale.set(scale[0], scale[1], scale[2]);
      else dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
      if (item.color) mesh.current.setColorAt(index, tint.set(item.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [items]);

  return (
    <instancedMesh ref={mesh} args={[geometry, null, Math.max(items.length, 1)]} frustumCulled={false}>
      {basic ? (
        <meshBasicMaterial color={color} map={map} transparent={opacity < 1} opacity={opacity} alphaTest={alphaTest} side={doubleSide ? THREE.DoubleSide : THREE.FrontSide} />
      ) : (
        <meshLambertMaterial color={color} map={map} transparent={opacity < 1} opacity={opacity} alphaTest={alphaTest} side={doubleSide ? THREE.DoubleSide : THREE.FrontSide} flatShading={flatShading} onBeforeCompile={onBeforeCompile || undefined} />
      )}
    </instancedMesh>
  );
}

function Pets() {
  const mesh = useRef();
  const petals = useMemo(() => {
    const random = mulberry32(918);
    const colors = ['#f7b6cf', '#f2a2c2', '#ffd4e3', '#e98fb4', '#f9c9da'];
    const list = [];
    for (let i = 0; i < 420; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 12;
      const x = SAKURA.x + Math.cos(angle) * radius;
      const z = SAKURA.z + Math.sin(angle) * radius;
      if (z < shorelineZ(x) + 0.4) continue;
      list.push([x, 0, z]);
    }
    for (let i = 0; i < 900; i += 1) {
      const x = (random() - 0.5) * 900;
      const z = shorelineZ(x) + 0.7 + random() * 700;
      if (x > FARM.minX - 2 && x < FARM.maxX + 2 && z > FARM.minZ - 2 && z < FARM.maxZ + 2) continue;
      list.push([x, 0, z]);
    }
    return { list: list.map(([x, , z]) => [x, z, random() * Math.PI, 0.5 + random() * 0.65, colors[Math.floor(random() * colors.length)]]), colors };
  }, []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    petals.list.forEach((petal, index) => {
      const [x, z, rot, scale, c] = petal;
      dummy.position.set(x, heightAt(x, z) + 0.072, z);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
      mesh.current.setColorAt(index, color.set(c));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [petals]);

  return (
    <instancedMesh ref={mesh} args={[null, null, petals.list.length]} frustumCulled={false}>
      <boxGeometry args={[0.16, 0.016, 0.1]} />
      <meshBasicMaterial color="#ffffff" />
    </instancedMesh>
  );
}

// 手工点缀的大石块，近景构图用
const BOULDERS = [
  [-5.4, 7.9, 1.1, 0.62, 0.9, 0.2, 0.6, '#4b4340'],
  [5.2, 7.2, 0.62, 0.4, 0.56, 0.1, 1.4, '#514741'],
  [-3.7, 5.4, 0.46, 0.28, 0.4, 0.3, 0.2, '#4b4340'],
  [7.2, 4.4, 0.68, 0.44, 0.56, 0.2, 2.1, '#514741'],
  [-12.5, 13.5, 1.15, 0.62, 0.9, 0.15, 0.9, '#4b4340'],
  [10.5, 11.5, 0.8, 0.48, 0.68, 0.2, 1.8, '#514741'],
  [-7.5, 15.2, 0.6, 0.34, 0.5, 0.25, 0.4, '#4b4340'],
  [13.2, 6.4, 0.46, 0.28, 0.4, 0.3, 2.6, '#514741'],
  [19.5, 18.2, 0.8, 0.42, 0.66, 0.15, 2.3, '#514741'],
  [26.5, 28.0, 0.62, 0.36, 0.52, 0.3, 0.5, '#514741'],
  [-48.0, 52.0, 0.9, 0.5, 0.74, 0.2, 1.3, '#4b4340'],
  [24.0, 62.0, 0.72, 0.42, 0.6, 0.25, 2.7, '#514741'],
  [-8.0, 74.0, 0.8, 0.46, 0.66, 0.2, 0.8, '#4b4340'],
  [52.0, 44.0, 0.7, 0.4, 0.58, 0.25, 1.9, '#514741'],
];

export default function Ground() {
  const geometry = useGroundGeometry();
  const pathGeometry = useMemo(() => buildPathGeometry(), []);
  const shore = useShoreApron();
  const shoreTexture = useMemo(() => makeShoreTexture(), []);
  const grass = useMemo(() => makeGrassTexture(), []);
  const grassSprite = useMemo(() => createFoliageTexture('grass'), []);
  const dirt = useMemo(() => makeDirtTexture(), []);

  const detail = useMemo(() => buildDetail(), []);

  // 全图小草统一加一点微风：按实例世界位置错开相位，只让上半段轻摆
  const wind = useMemo(() => ({ value: 0 }), []);
  useFrame((state) => {
    wind.value = state.clock.elapsedTime;
  });
  const tuftWind = useMemo(
    () => (shader) => {
      shader.uniforms.uWindTime = wind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float windPhase = instanceMatrix[3][0] * 0.55 + instanceMatrix[3][2] * 0.4;
            float windSway = pow(uv.y, 1.8);
            transformed.x += sin(uWindTime + windPhase) * windSway * 0.05;
            transformed.z += cos(uWindTime * 0.8 + windPhase) * windSway * 0.02;
          #endif`
        );
    },
    [wind]
  );

  const tuftGeometry = useMemo(() => createCrossedFoliageGeometry(), []);
  const rockGeometry = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  const shrubGeometry = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const pebbleGeometry = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  const leafGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const flowerStemGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const flowerHeadGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const pitGeometry = useMemo(() => new THREE.CircleGeometry(1, 7), []);
  const stepGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  return (
    <group>
      <mesh geometry={geometry} position={[0, 0.05, 0]}>
        <meshLambertMaterial map={grass} color="#ffffff" />
      </mesh>

      {/* 草地明暗色斑，打散整片重复 */}

      {/* 土路 */}
      <mesh geometry={pathGeometry}>
        <meshLambertMaterial map={dirt} color="#ffffff" polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>

      {/* 草丛、野花、落叶、碎石 */}
      <Field items={detail.tufts} geometry={tuftGeometry} map={grassSprite} alphaTest={0.35} doubleSide onBeforeCompile={tuftWind} />
      <Field items={detail.leaves} geometry={leafGeometry} />
      <Field items={detail.flowerStems} geometry={flowerStemGeometry} />
      <Field items={detail.flowerHeads} geometry={flowerHeadGeometry} />
      <Field items={detail.pebbles} geometry={pebbleGeometry} flatShading />
      <Field items={detail.rocks} geometry={rockGeometry} flatShading />
      <Field items={detail.mossCaps} geometry={rockGeometry} flatShading />
      <Field items={detail.shrubs} geometry={shrubGeometry} flatShading />
      <Field items={detail.pits} geometry={pitGeometry} basic />
      <Field items={detail.steps} geometry={stepGeometry} flatShading />

      <mesh geometry={shore} renderOrder={1}>
        <meshLambertMaterial
          map={shoreTexture}
          vertexColors
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      {BOULDERS.filter(([x, z, sx, , sz]) => !isInsideBuilding(x, z, Math.max(sx, sz) + 0.6)).map(([x, z, sx, sy, sz, rx, ry, color], index) => (
        <mesh key={index} position={[x, heightAt(x, z) + sy * 0.5, z]} rotation={[rx, ry, 0]} scale={[sx, sy, sz]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshLambertMaterial color={color} flatShading />
        </mesh>
      ))}

      <Pets />
    </group>
  );
}
