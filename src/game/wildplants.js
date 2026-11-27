import { mulberry32 } from '../utils/random';
import {
  FARM,
  FORESTS,
  HILLS,
  LAND,
  NEIGHBOR_FARMS,
  PLANT_SCALE,
  TREE_SCALE,
  STREAM_ROUTES,
  heightAt,
  isHomeTreeClearing,
  neighborBeds,
  pathDistance,
  shorelineZ,
  streamDistance,
} from './terrain';
import { STAGE_SECONDS, SPECIES, SPECIES_BY_ID, productsForStage } from './plantsCatalog';
import {
  MOUNTAIN_REGION,
  MOUNTAIN_TREES,
  isMountainCaveAt,
  isMountainWaterAt,
} from './mountainWorld';

let version = 0;
const listeners = new Set();

export function subscribePlants(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPlantsVersion() {
  return version;
}

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function nearNeighborFarm(x, z, pad = 10) {
  return NEIGHBOR_FARMS.some(
    (farm) => Math.abs(x - farm.center.x) < 15 + pad && Math.abs(z - farm.center.z) < 20 + pad
  );
}

function onOwnFarm(x, z) {
  return x > FARM.minX - 4 && x < FARM.maxX + 4 && z > FARM.minZ - 4 && z < FARM.maxZ + 4;
}

function isTreeLike(species) {
  return species.family === 'tree' || species.form === 'mangoTree';
}

function validSpot(x, z, species) {
  const tree = isTreeLike(species);
  if (x < LAND.minX + 5 || x > LAND.maxX - 5 || z > LAND.maxZ - 5) return false;
  if (z < shorelineZ(x) + 4) return false;
  if (pathDistance(x, z) < (tree ? 5 : 2.6)) return false;
  if (streamDistance(x, z) < (tree ? 2.4 : 0.9)) return false;
  if (nearNeighborFarm(x, z) || onOwnFarm(x, z)) return false;
  if (Math.abs(x + 15) < 18 && Math.abs(z - 21) < 16) return false;
  if (Math.abs(x + 38) < 8 && Math.abs(z - 21) < 7) return false;
  if (Math.hypot(x - 9, z - 7) < (tree ? 16 : 10)) return false;
  if (tree && isHomeTreeClearing(x, z)) return false;
  return true;
}

function forestSpot(random, species) {
  for (let i = 0; i < 100; i += 1) {
    const zone = FORESTS[Math.floor(random() * FORESTS.length)];
    const x = zone.minX + 4 + random() * (zone.maxX - zone.minX - 8);
    const z = zone.minZ + 4 + random() * (zone.maxZ - zone.minZ - 8);
    if (validSpot(x, z, species)) return { x, z };
  }
  return grasslandSpot(random, species);
}

function hillSpot(random, species) {
  for (let i = 0; i < 100; i += 1) {
    const hill = HILLS[Math.floor(random() * HILLS.length)];
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * hill.radius * 0.88;
    const x = hill.x + Math.cos(angle) * radius;
    const z = hill.z + Math.sin(angle) * radius;
    if (heightAt(x, z) >= 0.2 && validSpot(x, z, species)) return { x, z };
  }
  return grasslandSpot(random, species);
}

// 山脚 / 山林 / 矮山：按海拔分层落点，让新增植物真正长在山地场景里。
function mountainSpot(random, species, minHeight, maxHeight) {
  for (let i = 0; i < 140; i += 1) {
    const x = MOUNTAIN_REGION.minX + 12 + random() * (MOUNTAIN_REGION.maxX - MOUNTAIN_REGION.minX - 24);
    const z = MOUNTAIN_REGION.minZ + 12 + random() * (MOUNTAIN_REGION.maxZ - MOUNTAIN_REGION.minZ - 24);
    const height = heightAt(x, z);
    if (height < minHeight || height > maxHeight) continue;
    if (isMountainWaterAt(x, z, 2.6)) continue;
    if (isMountainCaveAt(x, z, 3.2)) continue;
    if (!validSpot(x, z, species)) continue;
    if (
      isTreeLike(species) &&
      MOUNTAIN_TREES.some((tree) => tree.alive && Math.hypot(tree.x - x, tree.z - z) < 7)
    ) {
      continue;
    }
    return { x, z };
  }
  return null;
}

function mountainFoothillSpot(random, species) {
  return mountainSpot(random, species, 0.9, 6.5);
}

function mountainForestSpot(random, species) {
  return mountainSpot(random, species, 6.5, 26);
}

function mountainLowSpot(random, species) {
  return mountainSpot(random, species, 0.9, 8.5);
}

function grasslandSpot(random, species) {
  for (let i = 0; i < 120; i += 1) {
    const x = LAND.minX + 8 + random() * (LAND.maxX - LAND.minX - 16);
    const z = shorelineZ(x) + 5 + random() * (LAND.maxZ - shorelineZ(x) - 12);
    if (validSpot(x, z, species)) return { x, z };
  }
  return { x: 720, z: 760 };
}

function streamSpot(random, species) {
  for (let i = 0; i < 100; i += 1) {
    const route = STREAM_ROUTES[Math.floor(random() * STREAM_ROUTES.length)];
    const segment = Math.floor(random() * (route.points.length - 1));
    const a = route.points[segment];
    const b = route.points[segment + 1];
    const t = random();
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz) || 1;
    const side = random() < 0.5 ? -1 : 1;
    const offset = side * (route.width / 2 + 2 + random() * 6);
    const x = a[0] + dx * t - (dz / length) * offset;
    const z = a[1] + dz * t + (dx / length) * offset;
    if (validSpot(x, z, species)) return { x, z };
  }
  return grasslandSpot(random, species);
}

function spotFor(random, species, index) {
  if (species.mushroom) {
    // 裸盖蘑菇：森林腐土，山地林下同样成片生长
    if (index % 5 !== 4) {
      const spot = mountainForestSpot(random, species);
      if (spot) return spot;
    }
    return forestSpot(random, species);
  }
  if (species.family === 'crop') {
    // 南瓜 / 青豆 / 土豆 / 紫甘蓝：菜地与山脚小片菜地
    if (index % 4 === 0) {
      const spot = mountainFoothillSpot(random, species);
      if (spot) return spot;
    }
    return index % 4 === 0 ? streamSpot(random, species) : grasslandSpot(random, species);
  }
  if (species.id === 'cactus' || species.id === 'banana') {
    // 香蕉树、仙人掌：矮山
    if (index % 4 !== 3) {
      const spot = mountainLowSpot(random, species);
      if (spot) return spot;
    }
    return index % 3 === 0 ? grasslandSpot(random, species) : hillSpot(random, species);
  }
  if (isTreeLike(species)) {
    // 果树（柿 / 苹果 / 桃 / 桂 / 梧桐 / 松 / 芒果）：森林与山脚
    if (index % 5 === 0) {
      const spot = mountainFoothillSpot(random, species);
      if (spot) return spot;
    }
    if (index % 5 === 2) {
      const spot = mountainForestSpot(random, species);
      if (spot) return spot;
    }
    if (index % 4 === 1) return hillSpot(random, species);
    if (index % 4 === 3) return grasslandSpot(random, species);
    return forestSpot(random, species);
  }
  // 灌木浆果与野菜：森林边缘、山脚
  if (index % 3 === 0) {
    const spot = mountainFoothillSpot(random, species);
    if (spot) return spot;
  }
  if (index % 5 === 1) return hillSpot(random, species);
  if (index % 5 === 3) return streamSpot(random, species);
  if (index % 5 === 0 || index % 5 === 2) return forestSpot(random, species);
  return grasslandSpot(random, species);
}

function buildPlants() {
  const random = mulberry32(7301);
  const list = [];
  const treeSites = [];
  let id = 1;

  const add = (speciesId, x, z, stage, extra = {}) => {
    const species = SPECIES_BY_ID[speciesId];
    list.push({
      id: id++,
      speciesId,
      x,
      z,
      y: heightAt(x, z),
      rot: random() * Math.PI * 2,
      scale: (0.85 + random() * 0.4) * (isTreeLike(species) ? TREE_SCALE : 1),
      stage,
      timer: STAGE_SECONDS[species.category] * (0.2 + random() * 0.8),
      cooldown: 0,
      alive: true,
      watered: false,
      mushroom: !!species.mushroom,
      soil: extra.soil || 0,
    });
  };

  const counts = {
    persimmon: 62, apple: 58, peach: 58, osmanthus: 54, parasol: 50, pine: 66,
    wildVeg: 110, scallion: 100, burdock: 96, wildCarrot: 104,
    raspberry: 78, currant: 70, blueberry: 74, banana: 42, cactus: 44, mango: 56,
    carrot: 30, potato: 28, pumpkin: 26, greenBean: 28, purpleCabbage: 30,
  };

  SPECIES.forEach((species) => {
    if (species.mushroom) return;
    const tree = isTreeLike(species);
    const count = counts[species.id] || 24;
    for (let i = 0; i < count; i += 1) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const spot = spotFor(random, species, i + attempt);
        if (tree && treeSites.some((site) => Math.hypot(site.x - spot.x, site.z - spot.z) < 8)) continue;
        const stage = tree ? 1 + Math.floor(random() * 3) : Math.floor(random() * 4);
        add(species.id, spot.x, spot.z, stage);
        if (tree) treeSites.push(spot);
        break;
      }
    }
  });

  // 农田中的作物继续沿用原有田垄、成熟度和采集逻辑
  neighborBeds().forEach((bed, bedIndex) => {
    [-4.6, 0, 4.6].forEach((dx, index) => {
      add(bed.crop, bed.x + dx, bed.z, (bedIndex + index) % 4);
    });
  });

  for (let i = 0; i < 220; i += 1) {
    const spot = forestSpot(random, SPECIES_BY_ID.mushroom);
    list.push({
      id: id++,
      speciesId: 'mushroom',
      x: spot.x,
      z: spot.z,
      y: heightAt(spot.x, spot.z),
      rot: random() * Math.PI * 2,
      scale: 0.85 + random() * 0.35,
      stage: 3,
      timer: 0,
      cooldown: 0,
      alive: true,
      watered: false,
      mushroom: true,
      soil: 1,
    });
  }

  return list;
}

export const WILD_PLANTS = { items: buildPlants() };

let nextMushroomId = 1;

function stageDuration(species) {
  return STAGE_SECONDS[species.category];
}

// 生长推进：冷却或未清除的蘑菇不生长；阶段变化时才通知 React
export function updatePlants(delta) {
  let changed = false;
  WILD_PLANTS.items.forEach((plant) => {
    if (!plant.alive) return;
    if (plant.cooldown > 0) {
      plant.cooldown = Math.max(0, plant.cooldown - delta);
      return;
    }
    if (plant.mushroom || plant.stage >= 3) return;
    plant.timer -= delta;
    if (plant.timer <= 0) {
      plant.stage += 1;
      plant.timer = stageDuration(SPECIES_BY_ID[plant.speciesId]);
      plant.watered = false;
      changed = true;
    }
  });
  if (changed) notify();
}

// 山里植物淋雨后，当前生长周期减少两分钟
export function applyRainToPlants() {
  let changed = false;
  WILD_PLANTS.items.forEach((plant) => {
    if (!plant.alive || plant.mushroom || plant.stage >= 3) return;
    if (plant.z < 30) return;
    if (plant.cooldown > 0) return;
    plant.timer = Math.max(0, plant.timer - 120);
    if (plant.timer === 0) {
      plant.stage += 1;
      plant.timer = stageDuration(SPECIES_BY_ID[plant.speciesId]);
      plant.watered = false;
      changed = true;
    }
  });
  if (changed) notify();
}

// 浇水不缩短生长时间，只标记湿润
export function waterPlant(id) {
  const plant = WILD_PLANTS.items.find((item) => item.id === id && item.alive);
  if (!plant || plant.mushroom) return false;
  plant.watered = true;
  return true;
}

export function collectPlant(id) {
  const plant = WILD_PLANTS.items.find((item) => item.id === id && item.alive);
  if (!plant || plant.mushroom || plant.cooldown > 0) return null;
  const species = SPECIES_BY_ID[plant.speciesId];
  const products = productsForStage(species, plant.stage);
  plant.stage = Math.min(1, Math.max(0, plant.stage - 1));
  plant.timer = stageDuration(species);
  plant.cooldown = 24;
  notify();
  return { plant, products };
}

// 拍一拍蘑菇：原地 70% 重新长出，周边再冒出几颗
export function pokeMushroom(id) {
  const plant = WILD_PLANTS.items.find((item) => item.id === id && item.alive);
  if (!plant || !plant.mushroom || plant.cooldown > 0) return null;
  plant.alive = false;
  plant.cooldown = 0;
  const regrew = Math.random() < 0.7;
  const spawned = [];
  const random = Math.random;
  if (regrew) {
    spawned.push({ x: plant.x, z: plant.z, delay: 5 });
  }
  const extra = Math.floor(random() * 3) + 1;
  for (let i = 0; i < extra; i += 1) {
    const angle = random() * Math.PI * 2;
    const dist = 1.6 + random() * 3.2;
    const x = plant.x + Math.cos(angle) * dist;
    const z = plant.z + Math.sin(angle) * dist;
    if (z < 2) continue;
    spawned.push({ x, z, delay: 4 + random() * 6 });
  }
  spawned.forEach((spot) => {
    WILD_PLANTS.items.push({
      id: 50000 + nextMushroomId++,
      speciesId: 'mushroom',
      x: spot.x,
      z: spot.z,
      y: heightAt(spot.x, spot.z),
      rot: random() * Math.PI * 2,
      scale: 0.8 + random() * 0.3,
      stage: 3,
      timer: 0,
      cooldown: 0,
      alive: false,
      watered: false,
      mushroom: true,
      soil: 1,
      respawnIn: spot.delay,
    });
  });
  notify();
  return { regrew, count: spawned.length };
}

// 延迟冒出的蘑菇
export function updateMushroomRespawns(delta) {
  let changed = false;
  WILD_PLANTS.items.forEach((plant) => {
    if (plant.alive || plant.respawnIn == null) return;
    plant.respawnIn -= delta;
    if (plant.respawnIn <= 0) {
      plant.alive = true;
      plant.respawnIn = null;
      changed = true;
    }
  });
  if (changed) notify();
}

export function nearestPlant(x, z, radius = 1.9) {
  let best = null;
  let bestDist = radius * radius;
  WILD_PLANTS.items.forEach((plant) => {
    if (!plant.alive) return;
    const dx = plant.x - x;
    const dz = plant.z - z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = plant;
    }
  });
  return best;
}

export function plantInfo(plant) {
  if (!plant) return null;
  const species = SPECIES_BY_ID[plant.speciesId];
  return {
    id: plant.id,
    name: species.name,
    stage: plant.stage,
    mushroom: plant.mushroom,
    ready: plant.cooldown <= 0,
    cooldown: plant.cooldown,
    watered: plant.watered,
  };
}

export function plantsOfSpecies(speciesId) {
  return WILD_PLANTS.items.filter((item) => item.alive && item.speciesId === speciesId);
}

// 果树类山野植物也有树干碰撞，避免角色穿过树身
export function plantCircleColliders() {
  return WILD_PLANTS.items
    .filter((plant) => plant.alive && isTreeLike(SPECIES_BY_ID[plant.speciesId]))
    .map((plant) => {
      const species = SPECIES_BY_ID[plant.speciesId];
      const radius = 0.095 * species.scale * 0.9 * plant.scale * PLANT_SCALE + 0.55;
      return { x: plant.x, z: plant.z, radius: Math.max(0.85, radius) };
    });
}

export const HILL_SAMPLES = HILLS;

export function snapshotWildPlants() {
  return {
    items: WILD_PLANTS.items.map((plant) => ({
      id: plant.id,
      speciesId: plant.speciesId,
      x: plant.x,
      z: plant.z,
      y: plant.y,
      rot: plant.rot,
      scale: plant.scale,
      stage: plant.stage,
      timer: plant.timer,
      cooldown: plant.cooldown,
      alive: plant.alive,
      watered: plant.watered,
      soil: plant.soil,
      respawnIn: plant.respawnIn ?? null,
    })),
  };
}

export function restoreWildPlants(saved = {}, fallback = {}) {
  const baseItems = Array.isArray(fallback.items) ? fallback.items : [];
  const savedItems = Array.isArray(saved?.items) ? saved.items : baseItems;
  const mergedById = new Map(baseItems.map((item) => [item.id, item]));
  savedItems.forEach((item) => {
    if (!item || typeof item !== 'object' || !Number.isInteger(item.id)) return;
    mergedById.set(item.id, { ...mergedById.get(item.id), ...item });
  });
  const existingById = new Map(WILD_PLANTS.items.map((item) => [item.id, item]));
  const restored = [];
  let largestMushroomId = 0;

  mergedById.forEach((source, id) => {
    const species = SPECIES_BY_ID[source.speciesId];
    if (!Number.isInteger(id) || id <= 0 || !species) return;
    const finite = (value, defaultValue) => (Number.isFinite(value) ? value : defaultValue);
    const x = finite(source.x, 0);
    const z = finite(source.z, 0);
    const plant = existingById.get(id) || {};
    Object.assign(plant, {
      id,
      speciesId: source.speciesId,
      x,
      z,
      y: finite(source.y, heightAt(x, z)),
      rot: finite(source.rot, 0),
      scale: Math.max(0.01, finite(source.scale, 1)),
      stage: Math.max(0, Math.min(3, Math.floor(finite(source.stage, 0)))),
      timer: Math.max(0, finite(source.timer, 0)),
      cooldown: Math.max(0, finite(source.cooldown, 0)),
      alive: typeof source.alive === 'boolean' ? source.alive : true,
      watered: !!source.watered,
      mushroom: !!species.mushroom,
      soil: finite(source.soil, 0),
      respawnIn: Number.isFinite(source.respawnIn) ? Math.max(0, source.respawnIn) : null,
    });
    restored.push(plant);
    if (id >= 50000) largestMushroomId = Math.max(largestMushroomId, id - 50000);
  });

  WILD_PLANTS.items.splice(0, WILD_PLANTS.items.length, ...restored);
  nextMushroomId = largestMushroomId + 1;
  notify();
}
