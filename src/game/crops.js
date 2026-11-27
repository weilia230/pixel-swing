import { mulberry32 } from '../utils/random';
import { FARM } from './terrain';

export const CROP_DURATIONS = {
  seed: 300,
  seedling: 480,
  flowering: 300,
  fruiting: 180,
};

export const CROP_STAGE_NAMES = {
  empty: '空田埂',
  seed: '种子',
  seedling: '幼苗期',
  flowering: '开花期',
  fruiting: '结果期',
  mature: '成熟期',
};

const NEXT_STAGE = {
  seed: 'seedling',
  seedling: 'flowering',
  flowering: 'fruiting',
  fruiting: 'mature',
};

let version = 0;
const listeners = new Set();

export function subscribeCrops(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCropsVersion() {
  return version;
}

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function resetStage(item, stage) {
  item.stage = stage;
  item.remaining = CROP_DURATIONS[stage] ?? 0;
  item.started = stage !== 'seed' && stage !== 'empty';
  item.watered = false;
}

// 初始田块保留空地与各阶段，方便直接观察完整的种植循环。
function buildCrops() {
  const random = mulberry32(5150);
  const midX = (FARM.minX + FARM.maxX) / 2;
  const items = [];
  const stages = ['mature', 'fruiting', 'seedling', 'flowering', 'empty', 'mature', 'seed', 'fruiting'];
  let id = 1;
  let index = 0;
  for (let x = FARM.minX + 3.2; x <= FARM.maxX - 3.0; x += 4.6) {
    for (let z = FARM.minZ + 3.0; z <= FARM.maxZ - 3.0; z += 4.6) {
      const item = {
        id: id++,
        type: x < midX ? 'radish' : 'cabbage',
        x: x + (random() - 0.5) * 1.1,
        z: z + (random() - 0.5) * 0.9,
        rot: random() * Math.PI,
        scale: 0.86 + random() * 0.3,
        stage: 'empty',
        remaining: 0,
        started: false,
        watered: false,
      };
      resetStage(item, stages[index % stages.length]);
      index += 1;
      items.push(item);
    }
  }
  return items;
}

export const CROPS = { items: buildCrops() };

export function harvestProduct(item) {
  if (!item) return null;
  if (item.stage === 'fruiting') return item.type === 'radish' ? 'radishSeed' : 'cabbageSeed';
  if (item.stage === 'mature') return item.type;
  return null;
}

// 调用方在采摘前检查背包容量，避免作物消失而产物没有入包。
export function harvestCrop(id) {
  const item = CROPS.items.find((crop) => crop.id === id);
  const product = harvestProduct(item);
  if (!item || !product) return null;
  const result = { ...item, product };
  resetStage(item, 'empty');
  notify();
  return result;
}

export function sowCrop(id, seedType) {
  const item = CROPS.items.find((crop) => crop.id === id);
  if (!item || item.stage !== 'empty') return false;
  if (seedType !== 'radishSeed' && seedType !== 'cabbageSeed') return false;
  item.type = seedType === 'radishSeed' ? 'radish' : 'cabbage';
  resetStage(item, 'seed');
  notify();
  return true;
}

export function waterCrop(id) {
  const item = CROPS.items.find((crop) => crop.id === id);
  if (!item || item.stage === 'empty' || item.stage === 'mature' || item.watered) return false;
  item.watered = true;
  if (item.stage === 'seed') item.started = true;
  item.remaining = Math.max(0, item.remaining - 120);
  if (item.remaining === 0) resetStage(item, NEXT_STAGE[item.stage]);
  notify();
  return true;
}

export function updateCrops(delta) {
  let changed = false;
  CROPS.items.forEach((item) => {
    if (item.stage === 'empty' || item.stage === 'mature') return;
    if (item.stage === 'seed' && !item.started) return;
    item.remaining = Math.max(0, item.remaining - delta);
    if (item.remaining === 0) {
      resetStage(item, NEXT_STAGE[item.stage]);
      changed = true;
    }
  });
  if (changed) notify();
  return changed;
}

// 空地也纳入最近检测，手持种子时才能显示撒种按钮。
export function nearestCrop(x, z, radius = 1.55) {
  let best = null;
  let bestDist = radius * radius;
  CROPS.items.forEach((item) => {
    const dx = item.x - x;
    const dz = item.z - z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  });
  return best;
}

export function findCropForTask(x, z, { harvestOnly = false, wateringOnly = false, type = null } = {}) {
  let best = null;
  let bestDist = Infinity;
  CROPS.items.forEach((item) => {
    if (type && item.type !== type) return;
    const growable = ['seed', 'seedling', 'flowering', 'fruiting'].includes(item.stage);
    const useful = harvestOnly
      ? item.stage === 'mature' || item.stage === 'fruiting'
      : wateringOnly
      ? growable && !item.watered
      : item.stage === 'mature' || item.stage === 'fruiting' || (growable && !item.watered);
    if (!useful) return;
    const dist = (item.x - x) ** 2 + (item.z - z) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  });
  return best;
}

export function snapshotCrops() {
  return {
    items: CROPS.items.map((item) => ({
      id: item.id,
      type: item.type,
      stage: item.stage,
      remaining: item.remaining,
      started: item.started,
      watered: item.watered,
    })),
  };
}

export function restoreCrops(saved = {}, fallback = {}) {
  const baseItems = Array.isArray(fallback.items) ? fallback.items : [];
  const savedItems = Array.isArray(saved?.items) ? saved.items : baseItems;
  const savedById = new Map(savedItems.filter((item) => item && typeof item === 'object').map((item) => [item.id, item]));
  const baseById = new Map(baseItems.map((item) => [item.id, item]));

  CROPS.items.forEach((item) => {
    const base = baseById.get(item.id) || item;
    const source = savedById.get(item.id) || base;
    item.type = source.type === 'radish' || source.type === 'cabbage' ? source.type : base.type;
    item.stage = Object.hasOwn(CROP_STAGE_NAMES, source.stage) ? source.stage : base.stage;
    const remaining = Number.isFinite(source.remaining) ? source.remaining : base.remaining;
    item.remaining = Math.max(0, Number.isFinite(remaining) ? remaining : 0);
    item.started = typeof source.started === 'boolean' ? source.started : !!base.started;
    item.watered = typeof source.watered === 'boolean' ? source.watered : !!base.watered;
  });
  notify();
}
