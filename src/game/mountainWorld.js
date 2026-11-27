import { mulberry32 } from '../utils/random';
import { TILE_SIZE, snapToTileCenter } from './gridConfig';

// 山地场景：独立的一块逐格高度地图，全部按 TILE_SIZE 对齐。
// 它通过 terrain.heightAt 接管区域高度，住宅草地和樱花树一带保持原样。
export const MOUNTAIN_REGION = {
  minX: -300,
  maxX: 300,
  minZ: 700,
  maxZ: 1300,
};

const MIN_X = MOUNTAIN_REGION.minX;
const MAX_X = MOUNTAIN_REGION.maxX;
const MIN_Z = MOUNTAIN_REGION.minZ;
const MAX_Z = MOUNTAIN_REGION.maxZ;
const CENTER_Z = 1000;
// 相邻格高差上限 1U：正好是角色可以直接走上去的台阶
const STEP = 1;

// 开发调试传送点：山地中央开阔草甸。
export const MOUNTAIN_ENTRY = { x: 0, z: 1000 };

export function isInMountain(x, z, pad = 0) {
  return (
    x > MIN_X - pad &&
    x < MAX_X + pad &&
    z > MIN_Z - pad &&
    z < MAX_Z + pad
  );
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// 平滑阶梯：把 0~1 的坡面压成几级台地，台阶之间仍是连续斜面，避免出现垂直方块墙。
function smoothStair(t, steps, flat = 0.52) {
  const clamped = Math.min(0.9999, Math.max(0, t));
  const scaled = clamped * steps;
  const index = Math.floor(scaled);
  const fraction = scaled - index;
  const ramp = smoothstep(flat, 1, fraction);
  return Math.min(1, (index + ramp) / steps);
}

export function mountainTileStep() {
  return STEP;
}

// 水坑：山顶 / 山腰的低洼小水塘，半径与位置均对齐网格。
export const PONDS = [
  { id: 'pond-a', x: -120, z: 880, radius: 15, level: 10.5 },
  { id: 'pond-b', x: 108, z: 1116, radius: 18, level: 13.5 },
  { id: 'pond-c', x: 150, z: 795, radius: 12, level: 9 },
];

// 山地湖泊：低处汇聚，主湖与两个小湖。
export const LAKES = [
  { id: 'lake-main', x: 0, z: 1211, radius: 42, level: 6 },
  { id: 'lake-west', x: -174, z: 1152, radius: 27, level: 8 },
  { id: 'lake-east', x: 177, z: 1197, radius: 27, level: 7 },
];

const WATER_BODIES = [...PONDS, ...LAKES];

// 小溪：从水坑沿山势向下汇入湖泊。
export const STREAMS = [
  {
    id: 'stream-a',
    width: 3,
    points: [
      [150, 795, 9],
      [126, 900, 8.4],
      [84, 1000, 7.2],
      [40, 1100, 6.6],
      [12, 1180, 6],
    ],
  },
  {
    id: 'stream-b',
    width: 3,
    points: [
      [-120, 880, 10.5],
      [-140, 980, 9.6],
      [-150, 1080, 8.9],
      [-168, 1146, 8],
    ],
  },
  {
    id: 'stream-c',
    width: 3,
    points: [
      [108, 1116, 13.5],
      [130, 1160, 11.4],
      [152, 1182, 9],
      [174, 1197, 7],
    ],
  },
];

// 河流：湖泊向场景边缘的出水口。
export const RIVERS = [
  {
    id: 'river-a',
    width: 6,
    points: [
      [42, 1211, 6],
      [120, 1242, 5],
      [218, 1282, 4],
      [292, 1296, 3.5],
    ],
  },
  {
    id: 'river-b',
    width: 6,
    points: [
      [196, 1200, 7],
      [244, 1252, 5.4],
      [282, 1288, 4],
    ],
  },
  {
    id: 'river-c',
    width: 6,
    points: [
      [-198, 1152, 8],
      [-248, 1214, 6],
      [-292, 1272, 4.2],
    ],
  },
];

// 瀑布：溪流落差处的垂直水幕，底部带溅水圈。
export const WATERFALLS = [
  { id: 'fall-a', x: 100, z: 960, top: 8.8, bottom: 6.4, width: 4, yaw: 0.35 },
  { id: 'fall-b', x: -145, z: 1030, top: 10.2, bottom: 7.8, width: 4, yaw: -0.2 },
  { id: 'fall-c', x: 145, z: 1192, top: 10.8, bottom: 7.6, width: 5, yaw: 0.9 },
];

// 三类洞穴入口：老虎洞在高处岩壁，蛇洞贴近高草与石块，鼹鼠洞在低处土层。
export const CAVES = [
  { id: 'tiger-1', type: 'tiger', x: snapToTileCenter(-201), z: snapToTileCenter(762), yaw: 0 },
  { id: 'tiger-2', type: 'tiger', x: snapToTileCenter(201), z: snapToTileCenter(768), yaw: 0 },
  { id: 'tiger-3', type: 'tiger', x: snapToTileCenter(-42), z: snapToTileCenter(732), yaw: 0 },
  { id: 'snake-1', type: 'snake', x: snapToTileCenter(-111), z: snapToTileCenter(972), yaw: 0 },
  { id: 'snake-2', type: 'snake', x: snapToTileCenter(162), z: snapToTileCenter(900), yaw: 0 },
  { id: 'snake-3', type: 'snake', x: snapToTileCenter(51), z: snapToTileCenter(1161), yaw: 0 },
  { id: 'mole-1', type: 'mole', x: snapToTileCenter(-72), z: snapToTileCenter(1032), yaw: 0 },
  { id: 'mole-2', type: 'mole', x: snapToTileCenter(81), z: snapToTileCenter(1041), yaw: 0 },
  { id: 'mole-3', type: 'mole', x: snapToTileCenter(-18), z: snapToTileCenter(1104), yaw: 0 },
];

// 洞穴接口：本次只留空场景与接口，不生成老虎 / 蛇 / 鼹鼠。
export const CAVE_INTERFACES = CAVES.map((cave) => ({
  id: cave.id,
  type: cave.type,
  entrance: { x: cave.x, z: cave.z },
  interior: {
    width: TILE_SIZE * 1.2,
    depth: TILE_SIZE * 1.6,
    height: TILE_SIZE * 1.1,
    spawnPoint: null,
    creatures: [],
  },
  creatureSpawn: null,
}));

// 高草丛：高度接近小女孩，随机成片，内部可藏匿。
export const TALL_GRASS_PATCHES = [
  { id: 'tall-a', x: -150, z: 980, radius: 39 },
  { id: 'tall-b', x: 132, z: 888, radius: 36 },
  { id: 'tall-c', x: 18, z: 1152, radius: 42 },
  // 传送落点东侧的一片高草，进山就能直接看到藏匿区。
  { id: 'tall-d', x: 66, z: 990, radius: 28 },
];

// 藏匿点：供后续敌人 AI 使用的空位，本次不放生物。
export const HIDING_SPOTS = TALL_GRASS_PATCHES.flatMap((patch, patchIndex) => {
  const random = mulberry32(7710 + patchIndex);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2 + random() * 0.5;
    const radius = patch.radius * (0.34 + random() * 0.42);
    return {
      id: `hide-${patchIndex}-${index}`,
      patchId: patch.id,
      x: snapToTileCenter(patch.x + Math.cos(angle) * radius),
      z: snapToTileCenter(patch.z + Math.sin(angle) * radius),
      radius: TILE_SIZE * 1.5,
      occupant: null,
    };
  });
});

// 给场景渲染与摆放使用的避让判断。
export function isMountainWaterAt(x, z, pad = 0) {
  return isNearWater(x, z, pad);
}

export function isMountainCaveAt(x, z, pad = 0) {
  return CAVES.some((cave) => Math.hypot(x - cave.x, z - cave.z) < TILE_SIZE * 1.6 + pad);
}

// 水面统一抬高一点，避免与湖床、坡面共面造成闪烁和缺口。
export const WATER_SURFACE_LIFT = 0.08;

// 山地水域的水面高度：水塘 / 湖按圆形范围，溪流 / 河按带状范围。
export function mountainWaterLevelAt(x, z) {
  for (let i = 0; i < WATER_BODIES.length; i += 1) {
    const body = WATER_BODIES[i];
    if (Math.hypot(x - body.x, z - body.z) < body.radius + 8.4) {
      return body.level + WATER_SURFACE_LIFT;
    }
  }
  const routes = STREAMS.concat(RIVERS);
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    const info = nearestRoute(x, z, route.points);
    if (info.dist < route.width / 2 + 0.4) return info.level + WATER_SURFACE_LIFT;
  }
  return null;
}

function nearestRoute(x, z, points) {
  let best = { dist: Infinity, level: 0 };
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az, alevel] = points[i];
    const [bx, bz, blevel] = points[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSq));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best.dist) {
      best = { dist, level: alevel + (blevel - alevel) * t };
    }
  }
  return best;
}

// 未挖水盆、未切水槽的原始坡面高度，用来推算贴合地形的水位。
function rawHeightCore(x, z) {
  const dx = x;
  const dz = z - CENTER_Z;
  const distance = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const base = 3.4;
  // 台地：径向升坡分成 4 级，级内接近平台，级间是平缓斜面。
  const rim = smoothStair(smoothstep(62, 282, distance), 4, 0.52);
  // 山脊与台地：低频起伏，避免规则同心圆。
  const ridge =
    Math.sin(angle * 3 + 1.1) * 7.2 +
    Math.sin(angle * 5.7 - 0.6) * 4.4 +
    Math.sin(x * 0.017 + z * 0.013) * 4.4 +
    Math.cos(z * 0.021 - x * 0.011) * 3.4;
  let height = base + rim * (36 + ridge * 1.5);

  // 两条自然冲沟，形成凹谷。
  height -= 11.5 * Math.exp(-Math.pow((x * 0.82 - dz * 0.57 + 120) / 72, 2));
  height -= 8.5 * Math.exp(-Math.pow((x * 0.5 + dz * 0.86 - 60) / 86, 2));
  height += Math.sin(x * 0.061) * Math.cos(z * 0.053) * 2.6 * rim;

  // 传送落点附近保持平整，方便直接查看。
  const entryDistance = Math.hypot(x - MOUNTAIN_ENTRY.x, z - MOUNTAIN_ENTRY.z);
  if (entryDistance < 26) {
    const t = smoothstep(16, 26, entryDistance);
    height = 3.2 + (height - 3.2) * t;
  }
  // 地面最低保持在 0.8U，避免出现低于场景地面的坑洞。
  return Math.max(0.8, height);
}

// 水位贴合地形：水坑、湖面落在坡面下方 0.5U，溪流、河流沿地面下 0.35U 流淌。
// 这样无论台地怎么变，水面都不会悬在半空。
WATER_BODIES.forEach((body) => {
  body.level = rawHeightCore(body.x, body.z) - 0.5;
});
STREAMS.concat(RIVERS).forEach((route) => {
  route.points.forEach((point) => {
    point[2] = rawHeightCore(point[0], point[1]) - 0.35;
  });
});
WATERFALLS.forEach((fall) => {
  const ground = rawHeightCore(fall.x, fall.z);
  fall.bottom = ground + 0.15;
  fall.top = ground + 2.6;
});

function rawHeight(x, z) {
  let height = rawHeightCore(x, z);

  // 水坑与湖泊：挖出浅盆，边缘用平滑曲线接回坡面。
  for (let i = 0; i < WATER_BODIES.length; i += 1) {
    const body = WATER_BODIES[i];
    const bodyDistance = Math.hypot(x - body.x, z - body.z);
    if (bodyDistance < body.radius + 9) {
      const bed = body.level - 1.1;
      const t = smoothstep(body.radius, body.radius + 9, bodyDistance);
      height = Math.min(height, bed + (height - bed) * t);
    }
  }

  // 溪流与河流：沿折线切出浅槽。
  const routes = STREAMS.concat(RIVERS);
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    const half = route.width / 2;
    const info = nearestRoute(x, z, route.points);
    if (info.dist < half + 5) {
      const t = smoothstep(half, half + 5, info.dist);
      const bed = info.level - 0.6;
      height = Math.min(height, bed + (height - bed) * t);
    }
  }

  return height;
}

// 对外高度：边界平滑接回场景原有地面。高度保持连续，渲染网格与行走共用同一函数，
// 因此不会出现竖直方块墙，也不会出现角色悬空或陷进地里。
export function mountainHeightAt(x, z, baseHeight = 0) {
  const height = rawHeight(x, z);
  const edge = Math.min(x - MIN_X, MAX_X - x, z - MIN_Z, MAX_Z - z);
  const t = smoothstep(0, 80, edge);
  return baseHeight + (height - baseHeight) * t;
}

// 山地树木：真实落在地形格上，高处更矮，形成林线。
function isNearWater(x, z, pad = 0) {
  for (let i = 0; i < WATER_BODIES.length; i += 1) {
    const body = WATER_BODIES[i];
    if (Math.hypot(x - body.x, z - body.z) < body.radius + pad) return true;
  }
  const routes = STREAMS.concat(RIVERS);
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    if (nearestRoute(x, z, route.points).dist < route.width / 2 + pad) return true;
  }
  return false;
}

export const MOUNTAIN_TREES = (() => {
  const random = mulberry32(55201);
  const trees = [];
  const used = [];
  for (let attempt = 0; attempt < 20000 && trees.length < 300; attempt += 1) {
    const x = snapToTileCenter(MIN_X + 9 + random() * (MAX_X - MIN_X - 18));
    const z = snapToTileCenter(MIN_Z + 9 + random() * (MAX_Z - MIN_Z - 18));
    const centerDistance = Math.hypot(x, z - CENTER_Z);
    if (centerDistance < 56) continue; // 中央草甸留给传送落点
    if (isNearWater(x, z, 5)) continue;
    if (CAVES.some((cave) => Math.hypot(x - cave.x, z - cave.z) < 9)) continue;
    if (TALL_GRASS_PATCHES.some((patch) => Math.hypot(x - patch.x, z - patch.z) < patch.radius * 0.7)) continue;
    const approximateHeight = rawHeight(x, z);
    if (approximateHeight < 7 || approximateHeight > 50) continue;
    if (used.some((point) => Math.hypot(x - point[0], z - point[1]) < 6.4)) continue;
    used.push([x, z]);
    const high = approximateHeight > 32;
    trees.push({
      id: `tree-${trees.length}`,
      x,
      z,
      height: high ? 8.4 + random() * 3.4 : 12.4 + random() * 6.2,
      radius: 0.62,
      alive: true,
      seed: random(),
    });
  }
  return trees;
})();

export function mountainTreeColliders() {
  const list = [];
  for (let i = 0; i < MOUNTAIN_TREES.length; i += 1) {
    const tree = MOUNTAIN_TREES[i];
    if (!tree.alive) continue;
    const half = tree.radius + 0.22;
    list.push({
      minX: tree.x - half,
      maxX: tree.x + half,
      minZ: tree.z - half,
      maxZ: tree.z + half,
    });
  }
  return list;
}

export function nearestMountainTree(x, z, maxDistance = 3.8) {
  let best = null;
  let bestDistance = maxDistance * maxDistance;
  for (let i = 0; i < MOUNTAIN_TREES.length; i += 1) {
    const tree = MOUNTAIN_TREES[i];
    if (!tree.alive) continue;
    const dx = tree.x - x;
    const dz = tree.z - z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistance) {
      bestDistance = distSq;
      best = tree;
    }
  }
  return best;
}

export function chopMountainTree(id) {
  const tree = MOUNTAIN_TREES.find((item) => item.id === id);
  if (!tree || !tree.alive) return null;
  tree.alive = false;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mountain-tree-chopped', { detail: { id } }));
  }
  return tree;
}

// 洞口的侧壁与后壁碰撞，正面留出可以走进去的开口。
export function mountainCaveColliders() {
  const list = [];
  for (let i = 0; i < CAVES.length; i += 1) {
    const cave = CAVES[i];
    const width = TILE_SIZE * 1.2;
    const depth = TILE_SIZE * 1.6;
    const left = cave.x - width / 2;
    const right = cave.x + width / 2;
    const back = cave.z - depth;
    list.push({ minX: left - 0.9, maxX: left, minZ: back - 0.9, maxZ: cave.z });
    list.push({ minX: right, maxX: right + 0.9, minZ: back - 0.9, maxZ: cave.z });
    list.push({ minX: left, maxX: right, minZ: back - 0.9, maxZ: back });
  }
  return list;
}

export function snapshotMountainWorld() {
  return { trees: MOUNTAIN_TREES.map((tree) => ({ id: tree.id, alive: tree.alive })) };
}

export function restoreMountainWorld(saved = {}, fallback = {}) {
  const baseTrees = Array.isArray(fallback.trees) ? fallback.trees : [];
  const savedTrees = Array.isArray(saved?.trees) ? saved.trees : baseTrees;
  const savedById = new Map(savedTrees.filter((tree) => tree && typeof tree === 'object').map((tree) => [tree.id, tree]));
  const baseById = new Map(baseTrees.map((tree) => [tree.id, tree]));
  MOUNTAIN_TREES.forEach((tree) => {
    const base = baseById.get(tree.id) || tree;
    const source = savedById.get(tree.id) || base;
    tree.alive = typeof source.alive === 'boolean' ? source.alive : !!base.alive;
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mountain-tree-chopped', { detail: { restored: true } }));
  }
}
