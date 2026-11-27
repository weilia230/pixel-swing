import * as THREE from 'three';
import { mulberry32 } from '../utils/random';
import {
  FARM,
  HOUSE,
  LAND,
  RABBIT_HOLES,
  SAKURA,
  SMALL_SAKURA,
  SWING_SPOT,
  WAREHOUSE,
  shorelineZ,
} from './terrain';
import { worldTime } from './time';

const PINK = { coat: '#efb3c4', belly: '#fbdae3', ear: '#df859c', eye: '#2a1a16', whisker: '#fff1e5' };
const WHITE = { coat: '#f7f1e4', belly: '#fffaf0', ear: '#eaa9b5', eye: '#2a1a16', whisker: '#d9c9bb' };
const BLACK = { coat: '#3b333a', belly: '#56505a', ear: '#7a5a64', eye: '#efd9dd', whisker: '#cdbfc4' };
const GREY = { coat: '#9b969c', belly: '#c2bcc2', ear: '#d2a5ac', eye: '#2a1a16', whisker: '#f3e9df' };

// 前 12 只是草地上的大兔子，后 3 只是田埂外围出生的小兔子
export const RABBIT_STYLES = [
  PINK, PINK, PINK, WHITE, WHITE, BLACK, BLACK, GREY, GREY,
  PINK, WHITE, GREY,
  PINK, WHITE, GREY,
];

function isFree(x, z) {
  if (x < LAND.minX + 0.8 || x > LAND.maxX - 0.8) return false;
  if (z < shorelineZ(x) + 1.1 || z > LAND.maxZ - 1.0) return false;
  if (Math.hypot(x - SAKURA.x, z - SAKURA.z) < SAKURA.radius + 0.2) return false;
  if (Math.hypot(x - SWING_SPOT.x, z - SWING_SPOT.z) < 1.7) return false;
  if (x > FARM.minX - 1 && x < FARM.maxX + 1 && z > FARM.minZ - 1 && z < FARM.maxZ + 1) return false;
  if (RABBIT_HOLES.some((hole) => Math.hypot(x - hole.x, z - hole.z) < 2.2)) return false;
  if (SMALL_SAKURA.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 1.1)) return false;

  const nearHouse =
    Math.abs(x - HOUSE.x) < HOUSE.width / 2 + 1.4 &&
    Math.abs(z - HOUSE.z) < HOUSE.depth / 2 + 2.2;
  if (nearHouse) return false;

  const nearWarehouse =
    Math.abs(x - WAREHOUSE.x) < WAREHOUSE.width / 2 + 1.2 &&
    Math.abs(z - WAREHOUSE.z) < WAREHOUSE.depth / 2 + 2.0;
  return !nearWarehouse;
}

export function pickRabbitTarget(random) {
  for (let i = 0; i < 40; i += 1) {
    const x = LAND.minX + 0.9 + random() * (LAND.maxX - LAND.minX - 1.8);
    const z = shorelineZ(x) + 1.3 + random() * (LAND.maxZ - shorelineZ(x) - 2.4);
    if (isFree(x, z)) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(0, 0, 8);
}

export const RABBITS = [];

let nextId = 1;
let version = 0;
const listeners = new Set();

export function subscribeRabbits(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRabbitsVersion() {
  return version;
}

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function makeRabbit(style, seed, overrides = {}) {
  const random = mulberry32(seed);
  const start = overrides.position || pickRabbitTarget(random);
  const target = pickRabbitTarget(random);
  return {
    id: nextId++,
    style,
    random,
    position: start.clone ? start.clone() : new THREE.Vector3(start.x, 0, start.z),
    target,
    heading: random() * Math.PI * 2,
    speed: 0.42 + random() * 0.35,
    hop: random() * Math.PI * 2,
    pause: random() * 1.5,
    stuck: 0,
    moving: 0,
    scale: 1,
    visualScale: 1,
    bornAt: 0,
    isBaby: false,
    fed: 0,
    heartUntil: 0,
    holeIndex: 0,
    resting: false,
    ...overrides,
  };
}

// 初始化：12 只草地兔子 + 3 只田埂外的小兔子
(() => {
  const random = mulberry32(2027);
  RABBIT_STYLES.forEach((style, index) => {
    const seed = Math.floor(random() * 100000) + 1;
    const isBaby = index >= 12;
    const babySpots = [
      { x: -44, z: 28.6 },
      { x: -61, z: 28.9 },
      { x: -73, z: 31.2 },
    ];
    const spot = babySpots[index - 12];
    const rabbit = makeRabbit(
      style,
      seed,
      isBaby
        ? {
            position: new THREE.Vector3(spot.x, 0, spot.z),
            scale: 0.5,
            visualScale: 0.5,
            isBaby: true,
            bornAt: worldTime.day,
            speed: 0.3 + random() * 0.15,
          }
        : {}
    );
    rabbit.holeIndex = (index + 1) % RABBIT_HOLES.length;
    RABBITS.push(rabbit);
  });
})();

export function nearestRabbit(x, z, radius = 2.6) {
  let best = null;
  let bestDist = radius * radius;
  RABBITS.forEach((rabbit) => {
    if (rabbit.resting) return;
    const dx = rabbit.position.x - x;
    const dz = rabbit.position.z - z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = rabbit;
    }
  });
  return best;
}

export function showHeart(id, duration = 3000) {
  const rabbit = RABBITS.find((item) => item.id === id);
  if (rabbit) rabbit.heartUntil = performance.now() + duration;
}

function spawnBaby(parent) {
  const random = parent.random;
  const angle = random() * Math.PI * 2;
  const position = new THREE.Vector3(
    parent.position.x + Math.cos(angle) * 0.7,
    parent.position.z + Math.sin(angle) * 0.7
  );
  const style = RABBIT_STYLES[Math.floor(random() * RABBIT_STYLES.length)];
  const baby = makeRabbit(style, Math.floor(random() * 100000) + 1, {
    position,
    scale: 0.5,
    visualScale: 0.5,
    isBaby: true,
    bornAt: worldTime.day,
    speed: 0.32,
    pause: 0.8,
  });
  baby.holeIndex = parent.holeIndex;
  RABBITS.push(baby);
  notify();
  return baby;
}

// 喂一只兔子：冒出爱心；连续喂三次（非小兔子）有 30% 概率生小兔子
export function feedRabbit(id) {
  const rabbit = RABBITS.find((item) => item.id === id);
  if (!rabbit) return { ok: false, born: false };
  rabbit.heartUntil = performance.now() + 3000;
  if (rabbit.isBaby) return { ok: true, born: false };
  rabbit.fed += 1;
  if (rabbit.fed % 3 === 0 && Math.random() < 0.3) {
    spawnBaby(rabbit);
    return { ok: true, born: true };
  }
  return { ok: true, born: false };
}

// 小兔子两个游戏日后长大；长大的兔子才开始计入繁殖
export function updateRabbitGrowth() {
  RABBITS.forEach((rabbit) => {
    if (!rabbit.isBaby) return;
    if (worldTime.day - rabbit.bornAt >= 2) {
      rabbit.isBaby = false;
      rabbit.scale = 1;
      rabbit.fed = 0;
      notify();
    }
  });
}

// 兔子洞旁的位置：洞前一小块草地，不同兔子错开一点
export function holeSpot(rabbit) {
  const hole = RABBIT_HOLES[rabbit.holeIndex];
  const spread = ((rabbit.id * 37) % 100) / 100 - 0.5;
  return {
    x: hole.x + spread * 2.4,
    z: hole.z + 1.25 + (rabbit.id % 3) * 0.35,
  };
}

export function snapshotRabbits() {
  return {
    items: RABBITS.map((rabbit) => ({
      id: rabbit.id,
      styleIndex: Math.max(0, RABBIT_STYLES.indexOf(rabbit.style)),
      position: { x: rabbit.position.x, z: rabbit.position.z },
      target: { x: rabbit.target.x, z: rabbit.target.z },
      heading: rabbit.heading,
      speed: rabbit.speed,
      scale: rabbit.scale,
      bornAt: rabbit.bornAt,
      isBaby: rabbit.isBaby,
      fed: rabbit.fed,
      holeIndex: rabbit.holeIndex,
    })),
  };
}

export function restoreRabbits(saved = {}, fallback = {}) {
  const baseItems = Array.isArray(fallback.items) ? fallback.items : [];
  const savedItems = Array.isArray(saved?.items) ? saved.items : baseItems;
  const mergedById = new Map(baseItems.map((item) => [item.id, item]));
  savedItems.forEach((item) => {
    if (!item || typeof item !== 'object' || !Number.isInteger(item.id)) return;
    mergedById.set(item.id, { ...mergedById.get(item.id), ...item });
  });

  const restored = [];
  mergedById.forEach((source, id) => {
    if (!Number.isInteger(id) || id <= 0) return;
    const finite = (value, defaultValue) => (Number.isFinite(value) ? value : defaultValue);
    const position = source.position && typeof source.position === 'object' ? source.position : {};
    const target = source.target && typeof source.target === 'object' ? source.target : position;
    const styleIndex = Number.isInteger(source.styleIndex) && RABBIT_STYLES[source.styleIndex]
      ? source.styleIndex
      : 0;
    const scale = Math.max(0.1, finite(source.scale, 1));
    restored.push({
      id,
      style: RABBIT_STYLES[styleIndex],
      random: mulberry32((Math.imul(id, 1103515245) + 2027) >>> 0),
      position: new THREE.Vector3(finite(position.x, 0), 0, finite(position.z, 8)),
      target: new THREE.Vector3(finite(target.x, 0), 0, finite(target.z, 8)),
      heading: finite(source.heading, 0),
      speed: Math.max(0.01, finite(source.speed, 0.5)),
      hop: 0,
      pause: 0.5,
      stuck: 0,
      moving: 0,
      scale,
      visualScale: scale,
      bornAt: finite(source.bornAt, 0),
      isBaby: !!source.isBaby,
      fed: Math.max(0, Math.floor(finite(source.fed, 0))),
      heartUntil: 0,
      holeIndex: Math.max(0, Math.min(RABBIT_HOLES.length - 1, Math.floor(finite(source.holeIndex, 0)))),
      resting: false,
    });
  });

  RABBITS.splice(0, RABBITS.length, ...restored);
  nextId = RABBITS.reduce((value, rabbit) => Math.max(value, rabbit.id + 1), 1);
  notify();
}
