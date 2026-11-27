import * as THREE from 'three';
import { mulberry32 } from '../utils/random';

// 基准单位 U：角色实测身高 3.84（Girl 本地 1.92 × PLAYER_SCALE 2），取身高 1/14。
// 全项目的植物尺寸、簇块大小、间距都按 U 的倍数表达，禁止再写死绝对值。
export const CHARACTER_HEIGHT = 3.84;
export const U = CHARACTER_HEIGHT / 14;
export const u = (n) => n * U;

// 单块尺寸：细节块 1U~2U，结构块 2U~4U，任何一块都不超过 4U。
export const BLOCK_LIMITS = {
  detail: [1, 2],
  structure: [2, 4],
  max: 4,
};

const MAX_SIZE = u(BLOCK_LIMITS.max);

// 4~6 档同色系：顶部最亮，底部压到 60% 明度。
function makeShades(hue, saturation, topLightness, steps = 5) {
  const bottom = topLightness * 0.6;
  const list = [];
  for (let i = 0; i < steps; i += 1) {
    const t = steps === 1 ? 1 : i / (steps - 1);
    const color = new THREE.Color();
    color.setHSL(hue / 360, saturation, bottom + (topLightness - bottom) * t, THREE.SRGBColorSpace);
    list.push(color);
  }
  return list;
}

const scratchHsl = {};
const scratchColor = new THREE.Color();

// 按高度选档，再叠 ±8% 明度抖动，避免整块死平；夜间不额外提亮。
function shadeAt(shades, ratio, random) {
  const index = Math.min(shades.length - 1, Math.max(0, Math.floor(ratio * shades.length)));
  const color = scratchColor.copy(shades[index]);
  color.getHSL(scratchHsl, THREE.SRGBColorSpace);
  const jitter = 1 + (random() * 2 - 1) * 0.08;
  color.setHSL(
    scratchHsl.h,
    scratchHsl.s,
    THREE.MathUtils.clamp(scratchHsl.l * jitter, 0.02, 0.9),
    THREE.SRGBColorSpace
  );
  return color.clone();
}

function addBlock(blocks, random, x, y, z, sx, sy, sz, shades, ratio) {
  blocks.push({
    x,
    y,
    z,
    sx: Math.min(MAX_SIZE, Math.max(U, sx)),
    sy: Math.min(MAX_SIZE, Math.max(U, sy)),
    sz: Math.min(MAX_SIZE, Math.max(U, sz)),
    color: shadeAt(shades, ratio, random),
  });
}

function heightRatio(y, bottom, top) {
  return THREE.MathUtils.clamp((y - bottom) / Math.max(0.0001, top - bottom), 0, 1);
}

// 阔叶树：树干分段错位堆叠，树冠由 30~80 块椭球簇构成，内部留透光孔。
export function buildBroadleaf({ seed = 11 } = {}) {
  const random = mulberry32(seed);
  const blocks = [];
  // 对标樱花：明度整体抬高，6 档同色系
  const leafShades = makeShades(104, 0.34, 0.58, 6);
  const barkShades = makeShades(25, 0.3, 0.3, 4);

  const trunkHeight = u(25);
  const blockEdge = u(1.5);
  const canopyCenterY = u(25);
  const radiusX = u(7);
  const radiusY = u(6.5);
  const radiusZ = u(7);
  const canopyBottom = canopyCenterY - radiusY;
  const canopyTop = canopyCenterY + radiusY;

  // 树干：1.5U 小块 2×2 堆叠，上段收成单块，避免出现单根大方柱
  const layers = Math.round(trunkHeight / blockEdge);
  for (let i = 0; i < layers; i += 1) {
    const t = i / (layers - 1);
    const y = (i + 0.5) * blockEdge;
    const offsets = t < 0.68
      ? [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]
      : [[0, 0]];
    offsets.forEach(([ox, oz]) => {
      addBlock(
        blocks,
        random,
        ox * blockEdge + (random() - 0.5) * u(0.08),
        y,
        oz * blockEdge + (random() - 0.5) * u(0.08),
        blockEdge,
        blockEdge,
        blockEdge,
        barkShades,
        0.25 + t * 0.5
      );
    });
  }

  // 四根枝杈，同样由 1.5U 小块拼成
  [
    [1, 0.25],
    [-0.9, -0.35],
    [0.15, 1],
    [-0.3, -0.95],
  ].forEach(([dx, dz], index) => {
    for (let k = 0; k < 3; k += 1) {
      const t = k / 2;
      addBlock(
        blocks,
        random,
        dx * u(1.2 + t * 3.4),
        u(19.5) + index * u(0.7) + t * u(2.4),
        dz * u(1.2 + t * 3.4),
        blockEdge,
        blockEdge,
        blockEdge,
        barkShades,
        0.55
      );
    }
  });

  const lattice = u(1.5);
  const extentX = Math.ceil(radiusX / lattice);
  const extentY = Math.ceil(radiusY / lattice);
  const extentZ = Math.ceil(radiusZ / lattice);
  let canopyBlocks = 0;
  let silhouetteBlocks = 0;
  let displacedBlocks = 0;

  for (let ix = -extentX; ix <= extentX; ix += 1) {
    for (let iy = -extentY; iy <= extentY; iy += 1) {
      for (let iz = -extentZ; iz <= extentZ; iz += 1) {
        const nx = (ix * lattice) / radiusX;
        const ny = (iy * lattice) / radiusY;
        const nz = (iz * lattice) / radiusZ;
        const distance = nx * nx + ny * ny + nz * nz;
        if (distance > 1) continue;
        // 透光孔：随机留空 20%，保持能看到天空和后面的东西
        if (random() < 0.2) continue;

        const onSilhouette = distance > 0.8;
        let ox = 0;
        let oy = 0;
        let oz = 0;
        if (onSilhouette) {
          silhouetteBlocks += 1;
          if (random() < 0.6) {
            displacedBlocks += 1;
            const amount = u(0.3 + random() * 0.5) * (random() < 0.5 ? -1 : 1);
            const length = Math.hypot(nx, ny, nz) || 1;
            ox = (nx / length) * amount;
            oy = (ny / length) * amount;
            oz = (nz / length) * amount;
          }
        }

        const x = ix * lattice + ox + (random() - 0.5) * u(0.1);
        const y = canopyCenterY + iy * lattice + oy + (random() - 0.5) * u(0.1);
        const z = iz * lattice + oz + (random() - 0.5) * u(0.1);
        const size = u(1.35 + random() * 0.15);
        addBlock(
          blocks,
          random,
          x,
          y,
          z,
          size,
          size,
          size,
          leafShades,
          heightRatio(y, canopyBottom, canopyTop)
        );
        canopyBlocks += 1;
      }
    }
  }

  return {
    kind: 'broadleaf',
    height: canopyTop,
    blocks,
    midBlocks: toMidLod(blocks, u(3.6), u(2.2)),
    stats: {
      canopyBlocks,
      gapRatio: 0.2,
      silhouetteDisplacedRatio: silhouetteBlocks ? displacedBlocks / silhouetteBlocks : 0,
      shadeSteps: leafShades.length,
    },
  };
}

// 针叶树：5 层错位环状枝块，中间补芯，顶部收窄。
export function buildConifer({ seed = 23 } = {}) {
  const random = mulberry32(seed);
  const blocks = [];
  const needleShades = makeShades(142, 0.28, 0.37, 6);
  const barkShades = makeShades(22, 0.28, 0.26, 4);

  const trunkHeight = u(26);
  const trunkWidth = u(3.2);
  const segments = 7;
  for (let i = 0; i < segments; i += 1) {
    const t = i / (segments - 1);
    addBlock(
      blocks,
      random,
      (random() - 0.5) * u(0.3),
      (trunkHeight / segments) * (i + 0.5),
      (random() - 0.5) * u(0.3),
      trunkWidth * (1 - t * 0.25),
      (trunkHeight / segments) * 1.06,
      trunkWidth * (1 - t * 0.25),
      barkShades,
      0.25 + t * 0.5
    );
  }

  // 细粒度锥形树冠：1.35~1.5U 小块按层堆叠，边缘随机透光
  const bottom = u(7);
  const top = u(32);
  const lattice = u(1.6);
  const maxRadius = u(8.2);
  let canopyBlocks = 0;
  let silhouetteBlocks = 0;
  let displacedBlocks = 0;

  for (let y = bottom; y <= top; y += lattice) {
    const t = (y - bottom) / Math.max(0.0001, top - bottom);
    const radius = maxRadius * (1 - t * 0.88);
    const extent = Math.ceil(radius / lattice);
    for (let ix = -extent; ix <= extent; ix += 1) {
      for (let iz = -extent; iz <= extent; iz += 1) {
        const nx = (ix * lattice) / Math.max(0.0001, radius);
        const nz = (iz * lattice) / Math.max(0.0001, radius);
        const distance = nx * nx + nz * nz;
        if (distance > 1) continue;

        const onRim = distance > 0.55;
        if (onRim) {
          silhouetteBlocks += 1;
          if (random() < 0.35) continue;
          if (random() < 0.6) displacedBlocks += 1;
        } else if (random() < 0.08) {
          continue;
        }

        const edge = onRim ? (random() - 0.5) * u(0.7) : 0;
        const size = u(1.35 + random() * 0.2);
        addBlock(
          blocks,
          random,
          ix * lattice + edge,
          y + (random() - 0.5) * u(0.2),
          iz * lattice + edge,
          size,
          size,
          size,
          needleShades,
          t
        );
        canopyBlocks += 1;
      }
    }
  }

  return {
    kind: 'conifer',
    height: top + u(1.4),
    blocks,
    midBlocks: toMidLod(blocks),
    stats: {
      canopyBlocks,
      gapRatio: 0,
      silhouetteDisplacedRatio: silhouetteBlocks ? displacedBlocks / silhouetteBlocks : 0,
      shadeSteps: needleShades.length,
    },
  };
}

// 灌木：8~20 块紧凑椭球簇，底部细枝，轮廓外凸内凹。
export function buildShrub({ seed = 37 } = {}) {
  const random = mulberry32(seed);
  const blocks = [];
  const leafShades = makeShades(96, 0.32, 0.4, 6);
  const stemShades = makeShades(26, 0.28, 0.26, 4);

  const centerY = u(3.6);
  const radiusX = u(5);
  const radiusY = u(3.4);
  const radiusZ = u(4.6);
  const lattice = u(2.8);

  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + 0.4;
    addBlock(
      blocks,
      random,
      Math.cos(angle) * u(0.6),
      u(1.2),
      Math.sin(angle) * u(0.6),
      u(1.1),
      u(2.2),
      u(1.1),
      stemShades,
      0.3
    );
  }

  const extentX = Math.ceil(radiusX / lattice);
  const extentY = Math.ceil(radiusY / lattice);
  const extentZ = Math.ceil(radiusZ / lattice);
  let canopyBlocks = 0;
  let silhouetteBlocks = 0;
  let displacedBlocks = 0;

  for (let ix = -extentX; ix <= extentX; ix += 1) {
    for (let iy = -extentY; iy <= extentY; iy += 1) {
      for (let iz = -extentZ; iz <= extentZ; iz += 1) {
        const nx = (ix * lattice) / radiusX;
        const ny = (iy * lattice) / radiusY;
        const nz = (iz * lattice) / radiusZ;
        const distance = nx * nx + ny * ny + nz * nz;
        if (distance > 1) continue;

        const onSilhouette = distance > 0.55;
        let ox = 0;
        let oy = 0;
        let oz = 0;
        if (onSilhouette) {
          silhouetteBlocks += 1;
          if (random() < 0.6) {
            displacedBlocks += 1;
            const amount = u(0.5 + random() * 0.7) * (random() < 0.5 ? -1 : 1);
            const length = Math.hypot(nx, ny, nz) || 1;
            ox = (nx / length) * amount;
            oy = (ny / length) * amount;
            oz = (nz / length) * amount;
          }
        }

        const x = ix * lattice + ox + (random() - 0.5) * u(0.4);
        const y = centerY + iy * lattice + oy + (random() - 0.5) * u(0.4);
        const z = iz * lattice + oz + (random() - 0.5) * u(0.4);
        const size = u(1.8 + random() * 0.9);
        addBlock(
          blocks,
          random,
          x,
          y,
          z,
          size,
          size * (0.85 + random() * 0.25),
          size * (0.85 + random() * 0.25),
          leafShades,
          heightRatio(y, centerY - radiusY, centerY + radiusY)
        );
        canopyBlocks += 1;
      }
    }
  }

  return {
    kind: 'shrub',
    height: centerY + radiusY,
    blocks,
    midBlocks: toMidLod(blocks),
    stats: {
      canopyBlocks,
      gapRatio: 0,
      silhouetteDisplacedRatio: silhouetteBlocks ? displacedBlocks / silhouetteBlocks : 0,
      shadeSteps: leafShades.length,
    },
  };
}

// 25 单位外的简化簇：按空间格合并邻近块，块数约降到 1/4。
export function toMidLod(blocks, cellXZ = u(9), cellY = cellXZ) {
  const groups = new Map();
  blocks.forEach((block) => {
    const key = `${Math.floor(block.x / cellXZ)}|${Math.floor(block.y / cellY)}|${Math.floor(block.z / cellXZ)}`;
    const group = groups.get(key);
    const minX = block.x - block.sx / 2;
    const maxX = block.x + block.sx / 2;
    const minY = block.y - block.sy / 2;
    const maxY = block.y + block.sy / 2;
    const minZ = block.z - block.sz / 2;
    const maxZ = block.z + block.sz / 2;
    if (!group) {
      groups.set(key, { minX, maxX, minY, maxY, minZ, maxZ, topY: block.y, color: block.color });
      return;
    }
    group.minX = Math.min(group.minX, minX);
    group.maxX = Math.max(group.maxX, maxX);
    group.minY = Math.min(group.minY, minY);
    group.maxY = Math.max(group.maxY, maxY);
    group.minZ = Math.min(group.minZ, minZ);
    group.maxZ = Math.max(group.maxZ, maxZ);
    if (block.y > group.topY) {
      group.topY = block.y;
      group.color = block.color;
    }
  });

  return [...groups.values()].map((group) => ({
    x: (group.minX + group.maxX) / 2,
    y: (group.minY + group.maxY) / 2,
    z: (group.minZ + group.maxZ) / 2,
    sx: group.maxX - group.minX,
    sy: group.maxY - group.minY,
    sz: group.maxZ - group.minZ,
    color: group.color,
  }));
}

// 60 单位外用的交叉面片：把体素簇正投影成一张像素剪影贴图。
export function createSilhouetteTexture(blocks, pixelSize = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, pixelSize, pixelSize);

  const padding = 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  blocks.forEach((block) => {
    minX = Math.min(minX, block.x - block.sx / 2);
    maxX = Math.max(maxX, block.x + block.sx / 2);
    maxY = Math.max(maxY, block.y + block.sy / 2);
  });
  const span = Math.max(maxX - minX, maxY, 0.0001);
  const scale = (pixelSize - padding * 2) / span;
  const originX = pixelSize / 2 - ((minX + maxX) / 2) * scale;

  [...blocks]
    .sort((a, b) => b.z - a.z)
    .forEach((block) => {
      const width = Math.max(1, Math.round(block.sx * scale));
      const height = Math.max(1, Math.round(block.sy * scale));
      const x = Math.round(originX + block.x * scale - width / 2);
      const y = Math.round(pixelSize - padding - block.y * scale - height / 2);
      ctx.fillStyle = `#${block.color.getHexString()}`;
      ctx.fillRect(x, y, width, height);
    });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------------------------------------------------------------------------
// 全场景植物体素化
// 果树 / 浆果 / 草本 / 作物 / 菌菇共用同一套块生成规则：
//   · 树冠按 1.35~1.5U 的块堆叠，内部留透光孔
//   · 矮植物的旧大块按 1.4U 目标重新切块，块数控制在预算内
//   · 每个物体 5 档同色系，顶部亮、底部 60% 明度，再叠 ±8% 抖动
// ---------------------------------------------------------------------------

const GROWTH = [0.42, 0.64, 0.84, 1];
const ladderCache = new Map();

function hexLadder(hex, steps = 6) {
  const key = `${hex}|${steps}`;
  const cached = ladderCache.get(key);
  if (cached) return cached;
  const base = new THREE.Color(hex);
  const hsl = {};
  base.getHSL(hsl, THREE.SRGBColorSpace);
  // 色阶整体提亮一档，步数提到 6，避免中矮植物发闷。
  const top = THREE.MathUtils.clamp(hsl.l * 1.5, 0.18, 0.64);
  const ladder = makeShades(hsl.h * 360, THREE.MathUtils.clamp(hsl.s, 0.1, 0.68), top, steps);
  ladderCache.set(key, ladder);
  return ladder;
}

const fruitLadderCache = new Map();

// 果实单独用更亮的一档色阶，不受植株底部压暗影响。
function fruitLadder(hex) {
  const key = hex.toLowerCase();
  const cached = fruitLadderCache.get(key);
  if (cached) return cached;
  const base = new THREE.Color(hex);
  const hsl = {};
  base.getHSL(hsl, THREE.SRGBColorSpace);
  const top = THREE.MathUtils.clamp(hsl.l * 1.35 + 0.16, 0.52, 0.84);
  // 白色鳞茎等中性色保持无色相，不能被果实饱和度下限染红。
  const saturation = hsl.s < 0.08 ? 0 : THREE.MathUtils.clamp(hsl.s, 0.4, 0.9);
  const ladder = makeShades(hsl.h * 360, saturation, top, 5);
  fruitLadderCache.set(key, ladder);
  return ladder;
}

export function summarizeBlocks(blocks) {
  let height = 0;
  let radius = 0;
  blocks.forEach((block) => {
    height = Math.max(height, block.y + block.sy / 2);
    radius = Math.max(radius, Math.hypot(block.x, block.z) + Math.max(block.sx, block.sz) / 2);
  });
  return { height, radius };
}

function treeTrunk(blocks, random, { height, width, shades }) {
  const edge = THREE.MathUtils.clamp(width, u(1.2), u(2));
  const layers = Math.max(2, Math.round(height / edge));
  const layerHeight = height / layers;
  for (let i = 0; i < layers; i += 1) {
    const t = layers === 1 ? 1 : i / (layers - 1);
    const offsets = t < 0.72
      ? [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]
      : [[0, 0]];
    offsets.forEach(([ox, oz]) => {
      addBlock(
        blocks,
        random,
        ox * edge + (random() - 0.5) * u(0.1),
        (i + 0.5) * layerHeight,
        oz * edge + (random() - 0.5) * u(0.1),
        edge,
        layerHeight * 1.04,
        edge,
        shades,
        0.22 + t * 0.42
      );
    });
  }
}

// 椭球树冠：1.35~1.5U 块按格点堆叠，边缘外凸内凹，内部随机留透光孔。
function clusterCrown(blocks, random, { cx, cy, cz, rx, ry, rz, lattice, shadesA, shadesB, gap = 0.2 }) {
  const extentX = Math.ceil(rx / lattice);
  const extentY = Math.ceil(ry / lattice);
  const extentZ = Math.ceil(rz / lattice);
  const bottom = cy - ry;
  const top = cy + ry;
  let count = 0;

  for (let ix = -extentX; ix <= extentX; ix += 1) {
    for (let iy = -extentY; iy <= extentY; iy += 1) {
      for (let iz = -extentZ; iz <= extentZ; iz += 1) {
        const nx = (ix * lattice) / rx;
        const ny = (iy * lattice) / ry;
        const nz = (iz * lattice) / rz;
        const distance = nx * nx + ny * ny + nz * nz;
        if (distance > 1) continue;
        if (random() < gap) continue;

        let ox = 0;
        let oy = 0;
        let oz = 0;
        if (distance > 0.7 && random() < 0.6) {
          const amount = u(0.25 + random() * 0.5) * (random() < 0.5 ? -1 : 1);
          const length = Math.hypot(nx, ny, nz) || 1;
          ox = (nx / length) * amount;
          oy = (ny / length) * amount;
          oz = (nz / length) * amount;
        }

        const x = cx + ix * lattice + ox + (random() - 0.5) * u(0.12);
        const y = cy + iy * lattice + oy + (random() - 0.5) * u(0.12);
        const z = cz + iz * lattice + oz + (random() - 0.5) * u(0.12);
        const size = u(1.35 + random() * 0.2);
        const shades = random() < 0.3 ? shadesB : shadesA;
        addBlock(blocks, random, x, y, z, size, size, size, shades, heightRatio(y, bottom, top));
        count += 1;
      }
    }
  }
  return count;
}

function addFruits(blocks, random, { cx, cy, cz, rx, ry, rz, count, colors }) {
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const ny = -0.15 + random() * 0.75;
    const ring = Math.sqrt(Math.max(0, 1 - ny * ny));
    const size = u(1.1 + random() * 0.3);
    const color = new THREE.Color(colors[i % colors.length]);
    color.offsetHSL(0, 0.02, 0.1);
    blocks.push({
      x: cx + Math.cos(angle) * rx * ring,
      y: cy + ny * ry,
      z: cz + Math.sin(angle) * rz * ring,
      sx: size,
      sy: size * 1.12,
      sz: size,
      color,
    });
  }
}

// 果树：柿子 / 苹果 / 桃 / 桂花 / 梧桐 / 松 / 芒果共用，尺寸全部按 U 表达。
export function buildFruitTree(species, stage, { seed = 7 } = {}) {
  const random = mulberry32(seed);
  const growth = GROWTH[stage] ?? GROWTH[3];
  const s = species.scale || 1;
  const form = species.form || 'round';
  const leafA = hexLadder(species.leaf[0], 6);
  const leafB = hexLadder(species.leaf[1] || species.leaf[0], 6);
  const bark = hexLadder(species.trunk || '#6b432a', 4);
  const blocks = [];
  const sizeFactor = 0.75 + 0.5 * s;

  const isParasol = form === 'parasol';
  const trunkHeight = (isParasol || form === 'pine' ? 3.2 : 2.6) * sizeFactor * (0.42 + 0.58 * growth);
  const trunkWidth = u(1.5) * (0.7 + 0.3 * growth);
  treeTrunk(blocks, random, { height: trunkHeight, width: trunkWidth, shades: bark });

  let canopyBlocks = 0;

  if (form === 'pine') {
    // 锥形树冠：与阔叶树同一粒度，块边长 1.35~1.5U
    const bottom = trunkHeight * 0.45;
    const top = trunkHeight * 1.5;
    const lattice = u(1.7);
    const maxRadius = 1.7 * sizeFactor * (0.55 + 0.45 * growth);
    for (let y = bottom; y <= top; y += lattice) {
      const t = (y - bottom) / Math.max(0.0001, top - bottom);
      const radius = maxRadius * (1 - t * 0.88);
      const extent = Math.ceil(radius / lattice);
      for (let ix = -extent; ix <= extent; ix += 1) {
        for (let iz = -extent; iz <= extent; iz += 1) {
          const nx = (ix * lattice) / Math.max(0.0001, radius);
          const nz = (iz * lattice) / Math.max(0.0001, radius);
          const distance = nx * nx + nz * nz;
          if (distance > 1) continue;
          const rim = distance > 0.55;
          if (rim && random() < 0.3) continue;
          if (!rim && random() < 0.06) continue;
          const size = u(1.35 + random() * 0.2);
          addBlock(
            blocks,
            random,
            ix * lattice + (rim ? (random() - 0.5) * u(0.5) : 0),
            y + (random() - 0.5) * u(0.2),
            iz * lattice + (rim ? (random() - 0.5) * u(0.5) : 0),
            size,
            size,
            size,
            random() < 0.25 ? leafB : leafA,
            t
          );
          canopyBlocks += 1;
        }
      }
    }
    if (stage >= 2) {
      addFruits(blocks, random, {
        cx: 0,
        cy: bottom,
        cz: 0,
        rx: u(2.2),
        ry: u(1.4),
        rz: u(2.2),
        count: stage === 3 ? 6 : 3,
        colors: species.fruit,
      });
    }
  } else {
    const radiusX = (isParasol ? 2.2 : 1 + 0.9 * growth) * sizeFactor;
    const radiusY = (isParasol ? 0.4 + 0.2 * growth : 0.8 + 0.5 * growth) * sizeFactor;
    const centerY = trunkHeight + radiusY * (isParasol ? 0.35 : 0.4);
    canopyBlocks = clusterCrown(blocks, random, {
      cx: 0,
      cy: centerY,
      cz: 0,
      rx: radiusX,
      ry: radiusY,
      rz: radiusX,
      lattice: u(1.85),
      shadesA: leafA,
      shadesB: leafB,
    });

    // 梧桐：原树冠上方叠加一层小一圈的树冠，保留下层垂叶。
    if (isParasol) {
      canopyBlocks += clusterCrown(blocks, random, {
        cx: 0,
        cy: centerY + radiusY * 1.05,
        cz: 0,
        rx: radiusX * 0.68,
        ry: radiusY * 0.78,
        rz: radiusX * 0.68,
        lattice: u(1.85),
        shadesA: leafA,
        shadesB: leafB,
        gap: 0.22,
      });

      const fronds = 14 + stage * 4;
      const leafSize = u(1.4);
      for (let i = 0; i < fronds; i += 1) {
        const angle = i * 2.39996;
        const ring = radiusX * (0.58 + random() * 0.4);
        const x = Math.cos(angle) * ring;
        const z = Math.sin(angle) * ring;
        const topY = centerY + radiusY * (random() * 0.7 - 0.15);
        const drop = 2 + Math.floor(random() * 2);
        for (let k = 0; k < drop; k += 1) {
          const size = leafSize * (1 - k * 0.07);
          addBlock(
            blocks,
            random,
            x + (random() - 0.5) * u(0.22),
            topY - k * size * 0.82,
            z + (random() - 0.5) * u(0.22),
            size * 0.58,
            size * 1.22,
            size * 0.58,
            k % 2 ? leafB : leafA,
            0.4 + random() * 0.45
          );
          canopyBlocks += 1;
        }
      }
    }

    // 桂花：树冠表面点缀细碎黄花
    if (form === 'osmanthus' && stage >= 1) {
      for (let i = 0; i < 10; i += 1) {
        const angle = random() * Math.PI * 2;
        const ny = random() * 2 - 1;
        const ring = Math.sqrt(Math.max(0, 1 - ny * ny));
        const size = u(1.05);
        const color = new THREE.Color(species.fruit[i % species.fruit.length]);
        color.offsetHSL(0, 0.02, 0.1);
        blocks.push({
          x: Math.cos(angle) * radiusX * ring,
          y: centerY + ny * radiusY,
          z: Math.sin(angle) * radiusX * ring,
          sx: size,
          sy: size,
          sz: size,
          color,
        });
      }
    }

    if (stage >= 2) {
      addFruits(blocks, random, {
        cx: 0,
        cy: centerY,
        cz: 0,
        rx: radiusX * 0.95,
        ry: radiusY * 0.85,
        rz: radiusX * 0.95,
        count: stage === 3 ? 9 : 4,
        colors: species.fruit,
      });
    }
  }

  const stats = summarizeBlocks(blocks);
  return { blocks, height: stats.height, radius: stats.radius, canopyBlocks };
}

// 把旧 glyph 的每个大块按目标边长切碎；块数超出预算时自动放大目标边长。
function voxelizeOnce(parts, factor, target) {
  const out = [];
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const offset = new THREE.Vector3();

  parts.forEach((partData) => {
    const partTarget = target * (partData.voxelScale || 1);
    const sx = Math.max(partTarget, partData.size[0] * factor);
    const sy = Math.max(partTarget, partData.size[1] * factor);
    const sz = Math.max(partTarget, partData.size[2] * factor);
    const nx = THREE.MathUtils.clamp(Math.round(sx / partTarget), 1, 12);
    const ny = THREE.MathUtils.clamp(Math.round(sy / partTarget), 1, 12);
    const nz = THREE.MathUtils.clamp(Math.round(sz / partTarget), 1, 12);
    euler.set(partData.rotation[0], partData.rotation[1], partData.rotation[2]);
    quat.setFromEuler(euler);

    for (let ix = 0; ix < nx; ix += 1) {
      for (let iy = 0; iy < ny; iy += 1) {
        for (let iz = 0; iz < nz; iz += 1) {
          offset
            .set(
              ((ix + 0.5) / nx - 0.5) * sx,
              ((iy + 0.5) / ny - 0.5) * sy,
              ((iz + 0.5) / nz - 0.5) * sz
            )
            .applyQuaternion(quat);
          out.push({
            x: partData.position[0] * factor + offset.x,
            y: partData.position[1] * factor + offset.y,
            z: partData.position[2] * factor + offset.z,
            sx: Math.max(u(0.45), sx / nx),
            sy: Math.max(u(0.45), sy / ny),
            sz: Math.max(u(0.45), sz / nz),
            q: quat.clone(),
            hex: partData.color,
          });
        }
      }
    }
  });

  return out;
}

function shadeBlocksByHeight(blocks, random, fruitColors) {
  let minY = Infinity;
  let maxY = -Infinity;
  blocks.forEach((block) => {
    minY = Math.min(minY, block.y);
    maxY = Math.max(maxY, block.y);
  });
  blocks.forEach((block) => {
    if (!block.hex) return;
    const isFruit = fruitColors && fruitColors.has(block.hex.toLowerCase());
    const ladder = isFruit ? fruitLadder(block.hex) : hexLadder(block.hex, 6);
    block.color = shadeAt(ladder, heightRatio(block.y, minY, maxY), random);
    delete block.hex;
  });
}

export function voxelizeParts(
  parts,
  { factor = 1, budget = 900, seed = 1, target = u(0.7), fruitColors } = {}
) {
  const random = mulberry32(seed);
  let step = target;
  let blocks = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    blocks = voxelizeOnce(parts, factor, step);
    if (blocks.length <= budget) break;
    step *= 1.18;
  }
  shadeBlocksByHeight(blocks, random, fruitColors);
  return blocks;
}

// 60 单位外的交叉面片：白色像素树冠，靠实例颜色染成各物种的叶色。
export function createPlantSpriteTexture(pixelSize = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, pixelSize, pixelSize);
  const random = mulberry32(9182);

  ctx.fillStyle = '#8a7a66';
  ctx.fillRect(pixelSize / 2 - 1, Math.floor(pixelSize * 0.5), 2, Math.floor(pixelSize * 0.44));
  for (let i = 0; i < 52; i += 1) {
    const x = Math.floor(pixelSize / 2 + (random() - 0.5) * 22);
    const y = Math.floor(pixelSize * 0.14 + random() * pixelSize * 0.5);
    const w = 1 + Math.floor(random() * 5);
    const h = 1 + Math.floor(random() * 4);
    ctx.fillStyle = random() > 0.42 ? '#ffffff' : '#b8b8b8';
    ctx.fillRect(x, y, w, h);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
