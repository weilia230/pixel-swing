import * as THREE from 'three';
import { gate, houseDoor, warehouseDoor } from './runtime';
import { u } from '../scene/voxelFlora';
import {
  isInMountain,
  mountainCaveColliders,
  mountainHeightAt,
  mountainTreeColliders,
  mountainWaterLevelAt,
} from './mountainWorld';

// 全局体型倍率：角色 ×2、普通植物保持原始大小、树 ×3、房子 ×2
export const PLAYER_SCALE = 2;
export const PLANT_SCALE = 1;
export const TREE_SCALE = 3;
export const HOUSE_SCALE = 2;

// 湖岸线，z 越大越靠近镜头；扩张只向东、西、北进行
export function shorelineZ(x) {
  return 0.9 + Math.sin(x * 0.5) * 0.22 + Math.sin(x * 0.19 + 1.3) * 0.28;
}

export const LAND = {
  minX: -1750,
  maxX: 1750,
  maxZ: 2900,
};

export const GROUND = {
  minX: -1700,
  maxX: 1700,
  minZ: -560,
  maxZ: 2900,
};

// 所有山体共用 2.6U 完整体素网格，渲染、行走与植物落点使用同一高度
export const MOUNTAIN_CELL = u(2.6);
export const HOME_TREE_CLEARING = { x: -15, z: 21, radius: 52 };

// 外围高山：整体向内收，紧贴可玩区域包住前湖和内部山地。
// 宽度同步收窄，但山体本身不再缩小，因此从湖边就能看到连绵山脊。
export const RING = {
  inner: { minX: -1300, maxX: 1300, minZ: -420, maxZ: 2450 },
  width: 620,
};

// 到内圈矩形外沿的距离，内部与草地上为负
export function ringDistance(x, z) {
  return Math.max(
    RING.inner.minX - x,
    x - RING.inner.maxX,
    RING.inner.minZ - z,
    z - RING.inner.maxZ
  );
}

// 环山高度：靠内缓起坡，越往外越高；多层山脊叠加出高峰 / 低谷 / 鞍部
export function ringHeightAt(x, z) {
  const d = ringDistance(x, z);
  if (d <= 0 || d >= RING.width) return 0;
  const t = d / RING.width;
  // 起伏的内缘：山脚线本身也不笔直，避免出现一条直的分界
  const bend = 0.06 * Math.sin(x * 0.0061 + z * 0.0043) + 0.03 * Math.sin(x * 0.0017 - z * 0.0021);
  const rise = Math.min(1, Math.max(0, t + bend));
  const eased = rise * rise * (3 - 2 * rise);
  // 三层山脊叠加：大峰、肩部、棱线，形成高度差明显的连绵山脉
  const nx = x * 0.0021;
  const nz = z * 0.0019;
  const big = Math.sin(nx * 1.7 + 0.9) * Math.cos(nz * 1.5 - 0.4);
  const mid = Math.sin(nx * 4.1 - 1.3) * 0.6 + Math.cos(nz * 3.6 + 1.1) * 0.4;
  const fine = Math.sin(x * 0.0143 + z * 0.0118) * 0.5 + Math.cos(x * 0.0091 - z * 0.0163) * 0.5;
  const ridge = 0.5 + 0.5 * (big * 0.55 + mid * 0.3 + fine * 0.15);
  // 鞍部：压低但不塌到地面，保证整圈山脊始终有清晰的山形轮廓
  const saddle = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(x * 0.0026 + z * 0.0033 + 1.9));
  // 山体高度控制在可直接攀爬的坡度内，避免出现走不上去的隐形墙
  // 山体高度回到原来的量级：内移而不是缩小，山脊依旧高耸
  const craggy = 0.5 + 0.5 * Math.sin(x * 0.031 - z * 0.026);
  // 高出地面一点点，避免与草地网格在接缝处共面闪烁
  return 0.06 + eased * ((101 + 189 * ridge) * saddle + 18 * craggy);
}

export function isHomeTreeClearing(x, z, pad = 0) {
  return Math.hypot(x - HOME_TREE_CLEARING.x, z - HOME_TREE_CLEARING.z) < HOME_TREE_CLEARING.radius + pad;
}

// 近处是缓坡，远处的大山小错落分布；山体之间留有大片草地与林缘
// 山地场景占用区域内的旧丘陵让位，由 mountainWorld 的逐格高度地图接管。
const HILLS_ALL = [
  { x: -52, z: 88, radius: 24, height: 2.6 },
  { x: 285, z: 285, radius: 58, height: 15 },
  { x: -425, z: 355, radius: 62, height: 18 },
  { x: 80, z: 535, radius: 68, height: 22 },
  { x: -165, z: 735, radius: 72, height: 27 },
  { x: 455, z: 770, radius: 70, height: 24 },
  { x: -550, z: 590, radius: 64, height: 16 },
  { x: 85, z: 1030, radius: 78, height: 30 },
  { x: -365, z: 1080, radius: 70, height: 23 },
  { x: 650, z: 1210, radius: 76, height: 27 },
  { x: -680, z: 1300, radius: 74, height: 25 },
  { x: 1120, z: 420, radius: 72, height: 26 },
  { x: -1130, z: 480, radius: 74, height: 25 },
  { x: 1080, z: 1120, radius: 86, height: 36 },
  { x: -1100, z: 1120, radius: 82, height: 32 },
  { x: 220, z: 1780, radius: 92, height: 44 },
  { x: -650, z: 1990, radius: 86, height: 39 },
  { x: 980, z: 2200, radius: 90, height: 46 },
  { x: -300, z: 2500, radius: 96, height: 48 },
];

export const HILLS = HILLS_ALL.filter((hill) => !isInMountain(hill.x, hill.z, hill.radius));

export const FORESTS = [
  { id: 'east', minX: 60, maxX: 330, minZ: 68, maxZ: 390 },
  { id: 'north', minX: -250, maxX: 90, minZ: 410, maxZ: 700 },
  { id: 'west', minX: -540, maxX: -170, minZ: 90, maxZ: 470 },
  { id: 'farnorth', minX: 110, maxX: 580, minZ: 750, maxZ: 1080 },
  { id: 'farwest', minX: -760, maxX: -400, minZ: 620, maxZ: 960 },
  { id: 'fareast', minX: 620, maxX: 820, minZ: 300, maxZ: 700 },
  { id: 'north2', minX: -220, maxX: 400, minZ: 1120, maxZ: 1400 },
  { id: 'southeast', minX: 520, maxX: 820, minZ: 80, maxZ: 320 },
  { id: 'eastedge', minX: 880, maxX: 1370, minZ: 100, maxZ: 620 },
  { id: 'westedge', minX: -1370, maxX: -880, minZ: 100, maxZ: 650 },
  { id: 'northwest', minX: -1300, maxX: -700, minZ: 1450, maxZ: 2200 },
  { id: 'northeast', minX: 650, maxX: 1300, minZ: 1450, maxZ: 2250 },
  { id: 'farnorth2', minX: -550, maxX: 550, minZ: 2050, maxZ: 2700 },
];

// 兼容旧的单森林引用
export const FOREST = FORESTS[0];

// 林间与村庄之间的土路：既用于地面绘制，也用于树木 / 细节避让
export const PATH_ROUTES = [
  { id: 'north', width: 3.2, points: [[0, 10], [6, 60], [2, 120], [-12, 200], [-40, 280], [-72, 360], [-90, 430]] },
  { id: 'east', width: 2.8, points: [[10, 12], [52, 32], [96, 58], [150, 96], [212, 148], [286, 208], [330, 270]] },
  { id: 'west', width: 2.6, points: [[-14, 30], [-42, 42], [-72, 58], [-100, 70]] },
  { id: 'farm', width: 2.8, points: [[-17, 33], [-34, 38], [-56, 36], [-76, 28], [-80, 24]] },
  { id: 'zhang', width: 2.6, points: [[22, 40], [72, 64], [112, 92], [156, 118]] },
  { id: 'xu', width: 2.6, points: [[-22, 62], [-40, 104], [-54, 158], [-60, 204]] },
  { id: 'wang', width: 2.4, points: [[-120, 260], [-210, 280], [-290, 296], [-326, 300]] },
  { id: 'chen', width: 2.4, points: [[210, 250], [270, 310], [318, 356], [338, 378]] },
  { id: 'far', width: 2.4, points: [[-90, 520], [-60, 640], [20, 760], [54, 900], [40, 1010]] },
  { id: 'fareast2', width: 2.6, points: [[330, 270], [500, 400], [690, 580], [900, 760], [1100, 990], [1120, 1300], [1050, 1600], [980, 1900]] },
  { id: 'farwest2', width: 2.6, points: [[-326, 300], [-520, 440], [-720, 680], [-920, 930], [-1080, 1250], [-1020, 1650], [-850, 2020]] },
  { id: 'north3', width: 2.8, points: [[40, 1010], [20, 1280], [90, 1530], [40, 1810], [130, 2110], [40, 2460], [-120, 2700]] },
];

// 三条蜿蜒小溪：从北坡与东西两侧草地穿过，不占用湖面扩张方向
export const STREAM_ROUTES = [
  { id: 'eaststream', width: 3.4, points: [[440, 980], [390, 860], [420, 740], [350, 620], [390, 510], [300, 430], [260, 320], [185, 235], [125, 150], [82, 86]] },
  { id: 'weststream', width: 3.0, points: [[-690, 1100], [-610, 970], [-650, 850], [-560, 730], [-590, 610], [-470, 510], [-410, 420], [-285, 345], [-245, 230], [-185, 155], [-172, 92]] },
  { id: 'northstream', width: 3.6, points: [[180, 2690], [90, 2510], [140, 2300], [40, 2090], [105, 1880], [-30, 1660], [45, 1450], [-45, 1240], [-10, 1050], [-75, 860], [-30, 690], [20, 540], [-15, 390], [25, 250], [48, 115]] },
];

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const len = vx * vx + vz * vz;
  let t = len > 0 ? (wx * vx + wz * vz) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + vx * t);
  const dz = pz - (az + vz * t);
  return Math.hypot(dx, dz);
}

// 点到所有土路的最短距离
export function pathDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < PATH_ROUTES.length; i += 1) {
    const points = PATH_ROUTES[i].points;
    for (let j = 0; j < points.length - 1; j += 1) {
      const d = pointSegmentDistance(x, z, points[j][0], points[j][1], points[j + 1][0], points[j + 1][1]);
      if (d < best) best = d;
      if (best < 0.5) return best;
    }
  }
  return best;
}

// 返回到溪岸边缘的距离，负数表示在溪水中
export function streamDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < STREAM_ROUTES.length; i += 1) {
    const route = STREAM_ROUTES[i];
    for (let j = 0; j < route.points.length - 1; j += 1) {
      const a = route.points[j];
      const b = route.points[j + 1];
      const edge = pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]) - route.width / 2;
      if (edge < best) best = edge;
    }
  }
  return best;
}

// 别人家的农田与房子：散布在扩张后的地图上
export const NEIGHBOR_FARMS = [
  {
    id: 'liu', npc: '刘奶奶', accent: '#c9645a',
    center: { x: -100, z: 78 },
    house: { x: -100, z: 62, width: 14.8, depth: 12.4, wallHeight: 7.2 },
    crops: ['pumpkin', 'greenBean', 'carrot'],
    chatter: ['我家的南瓜该浇水了…', '该给青豆施点肥了…'],
  },
  {
    id: 'zhang', npc: '张爷爷', accent: '#5b7fa3',
    center: { x: 168, z: 122 },
    house: { x: 168, z: 106, width: 14.0, depth: 12.0, wallHeight: 7.0 },
    crops: ['potato', 'purpleCabbage', 'pumpkin'],
    chatter: ['土豆该松松土了…', '紫甘蓝得浇点水了…'],
  },
  {
    id: 'xu', npc: '徐阿姨', accent: '#7b9a5b',
    center: { x: -60, z: 224 },
    house: { x: -60, z: 208, width: 14.4, depth: 12.0, wallHeight: 6.8 },
    crops: ['carrot', 'greenBean', 'purpleCabbage'],
    chatter: ['胡萝卜该浇水了…', '青豆要搭架子啦…'],
  },
  {
    id: 'wang', npc: '王大叔', accent: '#a07b4a',
    center: { x: -330, z: 300 },
    house: { x: -330, z: 284, width: 15.0, depth: 12.4, wallHeight: 7.0 },
    crops: ['potato', 'pumpkin', 'greenBean'],
    chatter: ['南瓜藤又长长了…', '这片地该翻一翻了…'],
  },
  {
    id: 'chen', npc: '陈婶', accent: '#8a6a8f',
    center: { x: 340, z: 380 },
    house: { x: 340, z: 364, width: 14.2, depth: 12.0, wallHeight: 6.8 },
    crops: ['purpleCabbage', 'potato', 'carrot'],
    chatter: ['紫甘蓝长得真好…', '该给土豆培土了…'],
  },
];

const NEIGHBOR_BED_GAP = 5.6;
const NEIGHBOR_BED_WIDTH = 14;
const NEIGHBOR_BED_DEPTH = 3.6;

// 邻居家的田垄：每条田垄是一个低矮土床，只有田埂和垄间可以通行
export function neighborBeds() {
  const beds = [];
  NEIGHBOR_FARMS.forEach((farm) => {
    farm.crops.forEach((crop, row) => {
      beds.push({
        farmId: farm.id,
        crop,
        x: farm.center.x,
        z: farm.center.z + row * NEIGHBOR_BED_GAP - NEIGHBOR_BED_GAP,
        width: NEIGHBOR_BED_WIDTH,
        depth: NEIGHBOR_BED_DEPTH,
      });
    });
  });
  return beds;
}

// 房屋、农田与田垄需要保持平缓
const FLATTEN_PADS = (() => {
  const pads = [
    { x: -15, z: 21, w: 34, d: 28 }, // 小樱家
    { x: -38, z: 21, w: 14, d: 14 }, // 仓库
    { x: -115, z: 24, w: 82, d: 52 }, // 萝卜白菜田
    { x: 9, z: 7, w: 26, d: 26 }, // 樱花树
  ];
  NEIGHBOR_FARMS.forEach((farm) => {
    pads.push({ x: farm.center.x, z: farm.center.z - 8, w: 24, d: 36 });
  });
  return pads;
})();

function isFlattened(x, z) {
  for (let i = 0; i < FLATTEN_PADS.length; i += 1) {
    const pad = FLATTEN_PADS[i];
    if (Math.abs(x - pad.x) < pad.w / 2 && Math.abs(z - pad.z) < pad.d / 2) return true;
  }
  return false;
}

// 前湖：挖出真正的湖盆，湖面不再和地面共面，避免水面出现斑驳与中空。
export const LAKE_WATER_LEVEL = 0.04;
// 玩家可以游到的最远水面（再远就是远岸与环山）
export const LAKE_SWIM_MIN_Z = -200;
const LAKE_DEPTH = 2.6;
const LAKE_MIN_Z = -298;
const LAKE_MAX_X = 950;

function lakeBedHeightAt(x, z) {
  if (Math.abs(x) > LAKE_MAX_X || z < LAKE_MIN_Z) return 0;
  const shore = shorelineZ(x);
  if (z > shore - 0.3) return 0;
  const t = Math.min(1, Math.max(0, (shore - z) / 18));
  return -LAKE_DEPTH * t * t * (3 - 2 * t);
}

// 前湖水面：只在真实水域返回水位，供游泳判定使用
export function lakeWaterLevelAt(x, z) {
  if (Math.abs(x) > LAKE_MAX_X || z < LAKE_MIN_Z) return null;
  if (z > shorelineZ(x) - 0.4) return null;
  return LAKE_WATER_LEVEL;
}

// 所有水域（前湖 + 山地水塘 / 湖 / 溪 / 河）的水面高度
export function waterLevelAt(x, z) {
  const lake = lakeWaterLevelAt(x, z);
  if (lake != null) return lake;
  return mountainWaterLevelAt(x, z);
}

function hillAt(x, z, hill) {
  const dist = Math.hypot(x - hill.x, z - hill.z);
  if (dist >= hill.radius) return 0;
  const k = 1 - dist / hill.radius;
  return hill.height * k * k * (3 - 2 * k);
}

// 连续地面仅作为山体体素的底层，可见表面与碰撞使用下面的台阶高度
export function terrainBaseHeightAt(x, z) {
  if (isFlattened(x, z)) return 0;
  if (z < shorelineZ(x) + 1.2) return lakeBedHeightAt(x, z);
  let h = 0;
  for (let i = 0; i < HILLS.length; i += 1) {
    h += hillAt(x, z, HILLS[i]);
  }
  const core = Math.min(
    1,
    Math.max(0, (Math.max(Math.abs(x) - 70, z - 70)) / 120)
  );
  h += core * (0.34 * Math.sin(x * 0.031) * Math.cos(z * 0.027) + 0.2 * Math.sin(x * 0.071 + z * 0.043));
  const edge = Math.max(
    0,
    Math.min(1, (Math.abs(x) - (LAND.maxX - 180)) / 180),
    Math.min(1, (z - (LAND.maxZ - 220)) / 220)
  );
  h += edge * edge * 5.0;
  return Math.max(0, h);
}

function mountainOwnerAt(x, z) {
  if (z < shorelineZ(x) + 1.2 || isFlattened(x, z)) return -1;
  let owner = -1;
  let strongest = 0;
  for (let i = 0; i < HILLS.length; i += 1) {
    const contribution = hillAt(x, z, HILLS[i]);
    if (contribution > strongest) {
      strongest = contribution;
      owner = i;
    }
  }
  return owner;
}

export function mountainLayersAt(x, z) {
  if (mountainOwnerAt(x, z) < 0) return 0;
  return Math.max(1, Math.ceil(terrainBaseHeightAt(x, z) / MOUNTAIN_CELL));
}

export function heightAt(x, z) {
  // 外围环山优先：它只在地图边界之外起坡，不干扰内部草地。
  // 渲染与行走共用同一连续高度，不再按网格量化成台阶。
  const ring = ringHeightAt(x, z);
  if (ring > 0) return ring;
  // 山地场景接管自己的逐格高度，边界平滑接回原有地面
  if (isInMountain(x, z)) return mountainHeightAt(x, z, terrainBaseHeightAt(x, z));
  if (isFlattened(x, z)) return 0;
  if (mountainOwnerAt(x, z) < 0) return terrainBaseHeightAt(x, z);
  const cellX = (Math.floor(x / MOUNTAIN_CELL) + 0.5) * MOUNTAIN_CELL;
  const cellZ = (Math.floor(z / MOUNTAIN_CELL) + 0.5) * MOUNTAIN_CELL;
  const layers = mountainLayersAt(cellX, cellZ);
  return layers > 0 ? layers * MOUNTAIN_CELL : terrainBaseHeightAt(x, z);
}

// 农田外围保护带（供建树 / 地面细节避让，先于 FARM 定义以便立即使用）
const FARM_PAD = {
  minX: -162,
  maxX: -72,
  minZ: -2,
  maxZ: 50,
};

// 萝卜白菜田：房子西侧的大片农地，一直铺到西边草地
export const FARM = {
  minX: -152,
  maxX: -82,
  minZ: 8,
  maxZ: 40,
  fenceHeight: 2.4,
  // 围栏门开在东侧，正对房子方向，宽 5.0 供小女孩自由进出
  gate: { x: -82, z: 24, width: 5.0 },
};


// 三个兔子洞：都在围栏外侧（南侧），朝向草地
export const RABBIT_HOLES = [
  { x: -90.5, z: 43.4, yaw: 0.32 },
  { x: -112.0, z: 44.2, yaw: -0.12 },
  { x: -136.0, z: 43.6, yaw: -0.38 },
];

// 樱花树：模型整体放大 3 倍，碰撞半径同步 ×3
export const SAKURA_SCALE = 3;
export const SAKURA = { x: 9, z: 7, radius: 0.8 * SAKURA_SCALE };

// 草地外围的小樱花树：整体放大到原来的 3 倍，位置不规则散落
export const SMALL_SAKURA = [
  { x: -46, z: 60, scale: 1.7, rot: 0.4 },
  { x: -20, z: 70, scale: 1.35, rot: 1.1 },
  { x: 6, z: 78, scale: 1.55, rot: 2.4 },
  { x: 34, z: 66, scale: 1.25, rot: 0.8 },
  { x: 62, z: 46, scale: 1.6, rot: 1.8 },
  { x: 70, z: 18, scale: 1.4, rot: 2.9 },
  { x: -68, z: 60, scale: 1.5, rot: 0.2 },
  { x: -30, z: 44, scale: 1.3, rot: 2.1 },
  { x: 44, z: 34, scale: 1.45, rot: 1.4 },
  { x: 22, z: 48, scale: 1.2, rot: 0.6 },
]
  .filter((tree) => !isHomeTreeClearing(tree.x, tree.z))
  .map((tree) => ({ ...tree, scale: tree.scale * TREE_SCALE }));

// 秋千挂点（世界坐标）：取自樱花树枝末端局部 (-1.9, 3.45, 0.7) × 缩放
const SWING_LOCAL = new THREE.Vector3(-1.9, 3.45, 0.7);
export const SWING_PIVOT = {
  x: SAKURA.x + SWING_LOCAL.x * SAKURA_SCALE,
  y: SWING_LOCAL.y * SAKURA_SCALE,
  z: SAKURA.z + SWING_LOCAL.z * SAKURA_SCALE,
};
// 吊线拉长：秋千本身尺寸不变，仅绳索更长
export const SWING_ROPE_LENGTH = 9.4;
// 兔子避开秋千的大致落点（挂点正下方附近）
export const SWING_SPOT = { x: SWING_PIVOT.x, z: SWING_PIVOT.z };

// 小屋：整体放大一倍。HOUSE 是世界尺寸，HOUSE_LOCAL 是建模用的局部尺寸
export const HOUSE = {
  x: -15,
  z: 21,
  width: 24.8,
  depth: 19.2,
  wall: 0.84,
  wallHeight: 14.0,
  doorWidth: 3.8,
  doorHeight: 5.2,
};

export const HOUSE_LOCAL = {
  width: 12.4,
  depth: 9.6,
  wall: 0.42,
  wallHeight: 7.0,
  doorWidth: 1.9,
  doorHeight: 2.6,
};

// 门口（南墙 +z 外表面）
export const DOOR = {
  x: HOUSE.x,
  y: 0,
  z: HOUSE.z + HOUSE.depth / 2,
  width: HOUSE.doorWidth,
};

// 室内（世界坐标，墙内表面）
export const INTERIOR = {
  minX: HOUSE.x - HOUSE.width / 2 + HOUSE.wall,
  maxX: HOUSE.x + HOUSE.width / 2 - HOUSE.wall,
  minZ: HOUSE.z - HOUSE.depth / 2 + HOUSE.wall,
  maxZ: HOUSE.z + HOUSE.depth / 2 - HOUSE.wall,
  wall: HOUSE.wall,
  doorWidth: HOUSE.doorWidth,
  doorX: DOOR.x,
};

// 室内建模用局部尺寸（未乘 HOUSE_SCALE）
export const INTERIOR_LOCAL = {
  minX: -HOUSE_LOCAL.width / 2 + HOUSE_LOCAL.wall,
  maxX: HOUSE_LOCAL.width / 2 - HOUSE_LOCAL.wall,
  minZ: -HOUSE_LOCAL.depth / 2 + HOUSE_LOCAL.wall,
  maxZ: HOUSE_LOCAL.depth / 2 - HOUSE_LOCAL.wall,
  wall: HOUSE_LOCAL.wall,
  doorWidth: HOUSE_LOCAL.doorWidth,
  doorX: 0,
};

// 家具：碰撞矩形 + 交互站位（世界坐标，随房子一起放大）
export const FURNITURE = {
  // 床靠西墙，床尾朝南；角色从东侧上下床
  bed: {
    collider: { minX: -26.5, maxX: -21.3, minZ: 15.3, maxZ: 22.7 },
    approach: { x: -20.4, z: 19.0, radius: 2.9 },
    sit: { x: -22.24, y: 1.64, z: 19.0, yaw: Math.PI / 2 },
    lie: { x: -23.4, y: 1.4, z: 19.5, yaw: Math.PI / 2 },
    leave: { x: -20.2, y: 1.16, z: 19.0 },
  },
  // 书桌靠东墙，桌面朝南
  desk: {
    collider: { minX: -9.6, maxX: -3.0, minZ: 17.15, maxZ: 20.85 },
  },
  computer: {
    approach: { x: -6.4, z: 22.0, radius: 3.6 },
    screen: { x: -6.4, y: 3.28, z: 18.3 },
  },
  // 椅子在书桌南侧，坐上去面对显示器
  chair: {
    collider: { minX: -7.3, maxX: -5.5, minZ: 21.2, maxZ: 23.0 },
    approach: { x: -6.4, z: 23.7, radius: 2.6 },
    sit: { x: -6.4, y: 0.96, z: 22.1, yaw: Math.PI },
    leave: { x: -6.4, y: 1.16, z: 23.8 },
  },
};

// 小仓库：在房子西侧，位置左移，避免与放大后的房子重叠
export const WAREHOUSE = {
  x: -38,
  z: 21,
  width: 8.8,
  depth: 6.8,
  wall: 0.36,
  wallHeight: HOUSE.wallHeight,
  doorWidth: 1.7,
  doorHeight: 2.4,
};

export const WAREHOUSE_DOOR = {
  x: WAREHOUSE.x,
  y: 0,
  z: WAREHOUSE.z + WAREHOUSE.depth / 2,
  width: WAREHOUSE.doorWidth,
};

export const WAREHOUSE_INTERIOR = {
  minX: WAREHOUSE.x - WAREHOUSE.width / 2 + WAREHOUSE.wall,
  maxX: WAREHOUSE.x + WAREHOUSE.width / 2 - WAREHOUSE.wall,
  minZ: WAREHOUSE.z - WAREHOUSE.depth / 2 + WAREHOUSE.wall,
  maxZ: WAREHOUSE.z + WAREHOUSE.depth / 2 - WAREHOUSE.wall,
  doorX: WAREHOUSE_DOOR.x,
};

// 仓库里的三个箱子（北侧靠墙），带靠近判定点
export const CHESTS = [
  { x: -40.6, z: 18.7, approach: { x: -40.6, z: 19.9, radius: 1.25 } },
  { x: -38.0, z: 18.7, approach: { x: -38.0, z: 19.9, radius: 1.25 } },
  { x: -35.4, z: 18.7, approach: { x: -35.4, z: 19.9, radius: 1.25 } },
];

// 室内墙体碰撞段（南墙留门洞），屋外也用同一组墙段阻挡
export function interiorWallColliders() {
  const { minX, maxX, minZ, maxZ, wall, doorWidth, doorX } = INTERIOR;
  const half = doorWidth / 2;
  return [
    // 北墙
    { minX: minX - wall, maxX: maxX + wall, minZ: minZ - wall, maxZ: minZ },
    // 西墙
    { minX: minX - wall, maxX: minX, minZ: minZ, maxZ: maxZ },
    // 东墙
    { minX: maxX, maxX: maxX + wall, minZ: minZ, maxZ: maxZ },
    // 南墙左段（门洞左侧）
    { minX: minX - wall, maxX: doorX - half, minZ: maxZ, maxZ: maxZ + wall },
    // 南墙右段（门洞右侧）
    { minX: doorX + half, maxX: maxX + wall, minZ: maxZ, maxZ: maxZ + wall },
  ];
}

// 田埂围栏碰撞：四边木栅栏，东侧留门洞，门关着时才补上挡板
export function farmColliders() {
  const t = 0.3;
  const { minX, maxX, minZ, maxZ, gate: g } = FARM;
  const half = g.width / 2;
  const list = [
    { minX: minX - t, maxX: maxX + t, minZ: minZ - t, maxZ: minZ + t }, // 北
    { minX: minX - t, maxX: maxX + t, minZ: maxZ - t, maxZ: maxZ + t }, // 南
    { minX: minX - t, maxX: minX + t, minZ: minZ, maxZ: maxZ }, // 西
    { minX: maxX - t, maxX: maxX + t, minZ: minZ, maxZ: g.z - half }, // 东·北段
    { minX: maxX - t, maxX: maxX + t, minZ: g.z + half, maxZ: maxZ }, // 东·南段
  ];
  if (!gate.open) {
    list.push({ minX: maxX - t, maxX: maxX + t, minZ: g.z - half, maxZ: g.z + half });
  }
  return list;
}

export function isInsideFarm(x, z) {
  return x > FARM.minX && x < FARM.maxX && z > FARM.minZ && z < FARM.maxZ;
}

// 仓库四面墙（南墙留门洞）
export function warehouseWallColliders() {
  const { minX, maxX, minZ, maxZ, wall, doorWidth, doorX } = WAREHOUSE_INTERIOR;
  const half = doorWidth / 2;
  return [
    { minX: minX - wall, maxX: maxX + wall, minZ: minZ - wall, maxZ: minZ },
    { minX: minX - wall, maxX: minX, minZ: minZ, maxZ: maxZ },
    { minX: maxX, maxX: maxX + wall, minZ: minZ, maxZ: maxZ },
    { minX: minX - wall, maxX: doorX - half, minZ: maxZ, maxZ: maxZ + wall },
    { minX: doorX + half, maxX: maxX + wall, minZ: maxZ, maxZ: maxZ + wall },
  ];
}

// 关着的门变成挡板（房子 / 仓库）
function doorColliders() {
  const list = [];
  if (!houseDoor.open) {
    list.push({
      minX: DOOR.x - DOOR.width / 2,
      maxX: DOOR.x + DOOR.width / 2,
      minZ: INTERIOR.maxZ,
      maxZ: INTERIOR.maxZ + INTERIOR.wall,
    });
  }
  if (!warehouseDoor.open) {
    list.push({
      minX: WAREHOUSE_DOOR.x - WAREHOUSE_DOOR.width / 2,
      maxX: WAREHOUSE_DOOR.x + WAREHOUSE_DOOR.width / 2,
      minZ: WAREHOUSE_INTERIOR.maxZ,
      maxZ: WAREHOUSE_INTERIOR.maxZ + WAREHOUSE.wall,
    });
  }
  return list;
}

// 邻居家的房子与田垄：房子是实心体，田垄只留出垄间小路
function neighborColliders() {
  const list = [];
  NEIGHBOR_FARMS.forEach((farm) => {
    const h = farm.house;
    list.push({
      minX: h.x - h.width / 2,
      maxX: h.x + h.width / 2,
      minZ: h.z - h.depth / 2,
      maxZ: h.z + h.depth / 2,
    });
  });
  neighborBeds().forEach((bed) => {
    list.push({
      minX: bed.x - bed.width / 2,
      maxX: bed.x + bed.width / 2,
      minZ: bed.z - bed.depth / 2,
      maxZ: bed.z + bed.depth / 2,
    });
  });
  return list;
}

// 所有固体碰撞矩形（墙 + 家具 + 田埂围栏 + 关着的门 + 邻居建筑/田垄）
export function solidColliders() {
  const walls = interiorWallColliders();
  return [
    ...walls,
    ...warehouseWallColliders(),
    ...doorColliders(),
    ...farmColliders(),
    ...neighborColliders(),
    FURNITURE.bed.collider,
    FURNITURE.desk.collider,
    FURNITURE.chair.collider,
    ...mountainTreeColliders(),
    ...mountainCaveColliders(),
  ];
}

// 点是否在室内（墙内表面围合区域）
export function isInsideHouse(x, z) {
  return (
    x > INTERIOR.minX &&
    x < INTERIOR.maxX &&
    z > INTERIOR.minZ &&
    z < INTERIOR.maxZ
  );
}

export function isInsideWarehouse(x, z) {
  const room = WAREHOUSE_INTERIOR;
  return x > room.minX && x < room.maxX && z > room.minZ && z < room.maxZ;
}

const BUILDING_FOOTPRINTS = [HOUSE, WAREHOUSE, ...NEIGHBOR_FARMS.map((farm) => farm.house)];

// 草地与雨滴共用的完整建筑占地，pad 可同时覆盖屋檐边缘。
export function isInsideBuilding(x, z, pad = 0) {
  return BUILDING_FOOTPRINTS.some((building) => (
    Math.abs(x - building.x) < building.width / 2 + pad &&
    Math.abs(z - building.z) < building.depth / 2 + pad
  ));
}

export function clampToLand(v) {
  v.x = THREE.MathUtils.clamp(v.x, LAND.minX, LAND.maxX);
  v.z = Math.min(v.z, LAND.maxZ);
  v.z = Math.max(v.z, shorelineZ(v.x) + 0.55);
  return v;
}

// 供地面细节使用：判断某点是否在农田 / 房屋范围
export function nearFarmOrHouse(x, z, pad = 3) {
  if (x > FARM_PAD.minX - pad && x < FARM_PAD.maxX + pad && z > FARM_PAD.minZ - pad && z < FARM_PAD.maxZ + pad) {
    return true;
  }
  return NEIGHBOR_FARMS.some(
    (farm) => Math.abs(x - farm.center.x) < 15 + pad && Math.abs(z - farm.center.z) < 20 + pad
  );
}
