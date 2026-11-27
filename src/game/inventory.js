import { player } from './runtime';
import { SPECIES, fruitId, saplingId, seedId } from './plantsCatalog';

// 背包 36 格（像我的世界一样 9 × 4），仓库 200 格（10 × 20）
export const BAG_SIZE = 36;
export const STORAGE_SIZE = 200;
export const PICKUP_LIFETIME = 180; // 地面物品 3 分钟没人捡就消失

export const ITEM_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'seed', name: '种子' },
  { id: 'fruit', name: '果实' },
  { id: 'sapling', name: '幼苗' },
  { id: 'material', name: '材料' },
];

export const ITEMS = {
  radish: { name: '萝卜', color: '#cf3a41', leaf: '#5f9b3a', category: 'fruit' },
  cabbage: { name: '白菜', color: '#7fb246', leaf: '#eef3c6', category: 'fruit' },
  radishSeed: { name: '萝卜种子', color: '#b85132', leaf: '#df7a3c', category: 'seed' },
  cabbageSeed: { name: '白菜种子', color: '#ddd68b', leaf: '#eff0ae', category: 'seed' },
  wateringCan: { name: '水壶', color: '#6f9fb0', leaf: '#b9d9d8', category: 'tool' },
  branch: { name: '树枝', color: '#8a5a35', leaf: '#6b432a', category: 'material' },
  stone: { name: '碎石', color: '#8d8b93', leaf: '#5f5d66', category: 'material' },
  mushroom: { name: '裸盖蘑菇', color: '#e6e2d8', leaf: '#6b4a32', category: 'fruit' },
};

// 图鉴里的每种植物都注册幼苗 / 种子 / 果实三种物品
SPECIES.forEach((species) => {
  if (species.mushroom) return;
  ITEMS[seedId(species)] = {
    name: `${species.name}种子`,
    color: species.fruit[0],
    leaf: species.leaf[1],
    category: 'seed',
  };
  ITEMS[saplingId(species)] = {
    name: `${species.name}幼苗`,
    color: species.leaf[1],
    leaf: species.leaf[0],
    category: 'sapling',
  };
  ITEMS[fruitId(species)] = {
    name: species.produceName,
    color: species.fruit[0],
    leaf: species.leaf[1],
    category: 'fruit',
  };
});

export function itemCategory(type) {
  return ITEMS[type]?.category || 'fruit';
}

export const bag = { slots: new Array(BAG_SIZE).fill(null) };
export const storage = { slots: new Array(STORAGE_SIZE).fill(null) };
export const pickups = [];
export const held = { type: null };

// 水壶水量：必须走到水边舀水才能灌溉，每浇一次消耗 1 格
export const waterCan = { amount: 0, max: 4 };

export function fillWaterCan() {
  if (waterCan.amount >= waterCan.max) return false;
  waterCan.amount = waterCan.max;
  notify();
  return true;
}

export function consumeWater() {
  if (waterCan.amount <= 0) return false;
  waterCan.amount -= 1;
  notify();
  return true;
}

// 生存样片试玩补给：初始背包放一组萝卜，方便当场演示喂食田鼠
bag.slots[0] = { type: 'radish', count: 6 };
held.type = 'radish';

let nextPickupId = 1;
// 田边的初始水壶固定在草地上，未拾取前不参与三分钟消失计时。
pickups.push({
  id: nextPickupId++,
  type: 'wateringCan',
  count: 1,
  x: -74,
  z: 24,
  age: 0,
  y: 0.12,
  fixed: true,
});
let version = 0;
const listeners = new Set();

export function subscribeStore(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStoreVersion() {
  return version;
}

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function countInBag(type) {
  return bag.slots.reduce((sum, slot) => (slot && slot.type === type ? sum + slot.count : sum), 0);
}

export function hasBagSpace() {
  return bag.slots.some((slot) => !slot);
}

function syncHeld() {
  if (held.type && countInBag(held.type) === 0) held.type = null;
}

export function setHeld(type) {
  if (type !== null && countInBag(type) === 0) return false;
  held.type = type;
  notify();
  return true;
}

export function addItem(type, { hold = true } = {}) {
  const index = bag.slots.findIndex((slot) => !slot);
  if (index < 0) return false;
  bag.slots[index] = { type, count: 1 };
  if (hold) held.type = type;
  notify();
  return true;
}

export function removeOne(type) {
  const index = bag.slots.findIndex((slot) => slot && slot.type === type);
  if (index < 0) return false;
  const slot = bag.slots[index];
  if (slot.count > 1) slot.count -= 1;
  else bag.slots[index] = null;
  syncHeld();
  notify();
  return true;
}

// 可堆叠材料：先填已有同类堆叠，再占用空格，单格上限 limit（碎石 60）
export function addItemStack(type, count = 1, limit = 60) {
  let left = count;
  for (let i = 0; i < bag.slots.length && left > 0; i += 1) {
    const slot = bag.slots[i];
    if (!slot || slot.type !== type || slot.count >= limit) continue;
    const put = Math.min(limit - slot.count, left);
    slot.count += put;
    left -= put;
  }
  for (let i = 0; i < bag.slots.length && left > 0; i += 1) {
    if (bag.slots[i]) continue;
    const put = Math.min(limit, left);
    bag.slots[i] = { type, count: put };
    left -= put;
  }
  if (left < count) {
    notify();
    return true;
  }
  return false;
}

// 拖拽：支持背包 ⇄ 仓库互换（同位置交换，空位则移动）
export function moveStack(fromKind, fromIndex, toKind, toIndex) {
  const from = fromKind === 'storage' ? storage : bag;
  const to = toKind === 'storage' ? storage : bag;
  if (fromIndex === toIndex && from === to) return;
  const moved = from.slots[fromIndex];
  if (!moved) return;
  const target = to.slots[toIndex];
  to.slots[toIndex] = moved;
  from.slots[fromIndex] = target || null;
  syncHeld();
  notify();
}

export function dropStack(kind, index) {
  const source = kind === 'storage' ? storage : bag;
  const item = source.slots[index];
  if (!item) return;
  source.slots[index] = null;
  syncHeld();
  const yaw = player.yaw;
  const distance = 1.15;
  const x = player.position.x + Math.sin(yaw) * distance;
  const z = player.position.z + Math.cos(yaw) * distance;
  pickups.push({
    id: nextPickupId++,
    type: item.type,
    count: item.count,
    x,
    z,
    age: 0,
    y: 0.12,
  });
  notify();
}

export function collectPickup(id) {
  const index = pickups.findIndex((item) => item.id === id);
  if (index < 0) return false;
  const item = pickups[index];
  if (!addItem(item.type)) return false;
  pickups.splice(index, 1);
  notify();
  return true;
}

export function updatePickups(delta) {
  let changed = false;
  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    if (pickups[i].fixed) continue;
    pickups[i].age += delta;
    if (pickups[i].age > PICKUP_LIFETIME) {
      pickups.splice(i, 1);
      changed = true;
    }
  }
  if (changed) notify();
}

export function snapshotInventory() {
  return {
    bag: bag.slots.map((slot) => (slot ? { type: slot.type, count: slot.count } : null)),
    storage: storage.slots.map((slot) => (slot ? { type: slot.type, count: slot.count } : null)),
    held: held.type,
    waterCan: { amount: waterCan.amount },
    pickups: pickups.map((item) => ({
      id: item.id,
      type: item.type,
      count: item.count,
      x: item.x,
      z: item.z,
      age: item.age,
      y: item.y,
      ...(item.fixed ? { fixed: true } : {}),
    })),
  };
}

function restoreSlots(savedSlots, fallbackSlots, size) {
  const source = Array.isArray(savedSlots) ? savedSlots : fallbackSlots;
  return Array.from({ length: size }, (_, index) => {
    const fallbackSlot = Array.isArray(fallbackSlots) ? fallbackSlots[index] : null;
    const slot = index < source?.length ? source[index] : fallbackSlot;
    if (slot === null) return null;
    if (!slot || typeof slot !== 'object' || !ITEMS[slot.type]) {
      return fallbackSlot ? { type: fallbackSlot.type, count: fallbackSlot.count } : null;
    }
    const count = Number.isFinite(slot.count) && slot.count > 0
      ? Math.floor(slot.count)
      : fallbackSlot?.count || 1;
    return { type: slot.type, count };
  });
}

export function restoreInventory(saved = {}, fallback = {}) {
  const source = saved && typeof saved === 'object' ? saved : fallback;
  bag.slots.splice(0, bag.slots.length, ...restoreSlots(source?.bag, fallback.bag, BAG_SIZE));
  storage.slots.splice(0, storage.slots.length, ...restoreSlots(source?.storage, fallback.storage, STORAGE_SIZE));

  const savedWater = source?.waterCan && typeof source.waterCan === 'object' ? source.waterCan : fallback.waterCan;
  const amount = Number.isFinite(savedWater?.amount) ? savedWater.amount : fallback.waterCan?.amount;
  waterCan.amount = Math.max(0, Math.min(waterCan.max, Number.isFinite(amount) ? amount : 0));

  const basePickups = Array.isArray(fallback.pickups) ? fallback.pickups : [];
  const savedPickups = Array.isArray(source?.pickups) ? source.pickups : basePickups;
  const baseById = new Map(basePickups.map((item) => [item.id, item]));
  const restoredPickups = [];
  savedPickups.forEach((item) => {
    if (!item || typeof item !== 'object' || !Number.isInteger(item.id) || item.id <= 0 || !ITEMS[item.type]) return;
    const base = baseById.get(item.id) || {};
    const finite = (value, defaultValue) => (Number.isFinite(value) ? value : defaultValue);
    restoredPickups.push({
      id: item.id,
      type: item.type,
      count: Math.max(1, Math.floor(finite(item.count, finite(base.count, 1)))),
      x: finite(item.x, finite(base.x, player.position.x)),
      z: finite(item.z, finite(base.z, player.position.z)),
      age: Math.max(0, finite(item.age, finite(base.age, 0))),
      y: finite(item.y, finite(base.y, 0.12)),
      ...(item.fixed || base.fixed ? { fixed: true } : {}),
    });
  });
  pickups.splice(0, pickups.length, ...restoredPickups);
  nextPickupId = pickups.reduce((value, item) => Math.max(value, item.id + 1), 1);

  const requestedHeld = source?.held === null || typeof source?.held === 'string'
    ? source.held
    : fallback.held;
  held.type = requestedHeld && countInBag(requestedHeld) > 0 ? requestedHeld : null;
  notify();
}
