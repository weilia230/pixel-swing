import { addItemStack } from './inventory';
import { STONE, STONE_SPOTS } from './survivalConfig';
import { player } from './runtime';

let nextId = 1;

// 地面碎石：可拾取、可堆叠（单格 60），样片里是固定的一小片
export const STONES = STONE_SPOTS.map((spot) => ({
  id: nextId++,
  x: spot.x,
  z: spot.z,
  taken: false,
  bob: Math.random() * Math.PI * 2,
}));

export function nearestStone(x, z, radius = STONE.pickRange) {
  let best = null;
  let bestDist = radius;
  STONES.forEach((stone) => {
    if (stone.taken) return;
    const dist = Math.hypot(stone.x - x, stone.z - z);
    if (dist < bestDist) {
      bestDist = dist;
      best = stone;
    }
  });
  return best;
}

export function collectStone(id) {
  const stone = STONES.find((item) => item.id === id);
  if (!stone || stone.taken) return null;
  if (!addItemStack('stone', 1, STONE.stackLimit)) return null;
  stone.taken = true;
  return stone;
}

// 每帧刷新玩家附近可拾取的碎石，供底部按钮显示
export function updateStones() {
  const stone = nearestStone(player.position.x, player.position.z);
  player.nearStoneId = stone ? stone.id : null;
}

export function snapshotStones() {
  return { items: STONES.map((stone) => ({ id: stone.id, taken: stone.taken })) };
}

export function restoreStones(saved = {}, fallback = {}) {
  const baseItems = Array.isArray(fallback.items) ? fallback.items : [];
  const savedItems = Array.isArray(saved?.items) ? saved.items : baseItems;
  const savedById = new Map(savedItems.filter((item) => item && typeof item === 'object').map((item) => [item.id, item]));
  const baseById = new Map(baseItems.map((item) => [item.id, item]));
  STONES.forEach((stone) => {
    const base = baseById.get(stone.id) || stone;
    const source = savedById.get(stone.id) || base;
    stone.taken = typeof source.taken === 'boolean' ? source.taken : !!base.taken;
  });
  nextId = STONES.reduce((value, stone) => Math.max(value, stone.id + 1), 1);
}
