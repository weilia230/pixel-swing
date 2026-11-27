import { player } from './runtime';
import { CROPS, harvestCrop } from './crops';
import { FARM, HOUSE, LAND, SAKURA, SWING_SPOT, WAREHOUSE, clampToLand, shorelineZ } from './terrain';
import { damagePlayer } from './survival';
import { MOLE } from './survivalConfig';
import { held, removeOne } from './inventory';

// 田鼠实体：位置与速度都用简单数值，渲染层只负责把状态画出来。
// 状态机：patrol → raid / alert → cool → patrol；tamed 后走 follow / guard。
const ZONE = MOLE.zone;

let nextId = 1;

function makeMole(x, z, heading) {
  return {
    id: nextId++,
    x,
    z,
    heading,
    hp: MOLE.maxHp,
    state: 'patrol',
    target: { x, z },
    pause: 0.5 + Math.random() * 1.4,
    step: Math.random() * 6,
    moving: 0,
    sniff: 0,
    attackTimer: 0,
    cropId: null,
    eatTimer: 0,
    feedProgress: 0,
    lastFeedAt: 0,
    tamed: false,
    following: false,
    heartUntil: 0,
    fleeUntil: 0,
    guardTimer: 0,
  };
}

export const MOLES = [makeMole(-2.5, 5.0, 0.12), makeMole(2.4, 4.8, -0.15)];

function randomPatrol(mole) {
  mole.target.x = ZONE.minX + Math.random() * (ZONE.maxX - ZONE.minX);
  mole.target.z = ZONE.minZ + Math.random() * (ZONE.maxZ - ZONE.minZ);
}

// 把田鼠推离房屋 / 仓库 / 樱花树 / 秋千 / 农田，避免穿模
// useZone 为 false 时（驯服跟随）不限制在样片小区域内
function keepClear(mole, useZone = true) {
  if (useZone) {
    mole.x = Math.max(ZONE.minX, Math.min(ZONE.maxX, mole.x));
    mole.z = Math.max(ZONE.minZ, Math.min(ZONE.maxZ, mole.z));
  }

  const pushCircle = (cx, cz, radius) => {
    const dx = mole.x - cx;
    const dz = mole.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist < radius && dist > 0.0001) {
      mole.x = cx + (dx / dist) * radius;
      mole.z = cz + (dz / dist) * radius;
    }
  };
  pushCircle(SAKURA.x, SAKURA.z, SAKURA.radius + 0.4);
  pushCircle(SWING_SPOT.x, SWING_SPOT.z, 1.5);

  const pushRect = (cx, cz, halfW, halfD) => {
    const minX = cx - halfW;
    const maxX = cx + halfW;
    const minZ = cz - halfD;
    const maxZ = cz + halfD;
    if (mole.x <= minX || mole.x >= maxX || mole.z <= minZ || mole.z >= maxZ) return;
    const left = mole.x - minX;
    const right = maxX - mole.x;
    const back = mole.z - minZ;
    const front = maxZ - mole.z;
    const min = Math.min(left, right, back, front);
    if (min === left) mole.x = minX;
    else if (min === right) mole.x = maxX;
    else if (min === back) mole.z = minZ;
    else mole.z = maxZ;
  };
  pushRect(HOUSE.x, HOUSE.z, HOUSE.width / 2 + 0.6, HOUSE.depth / 2 + 0.6);
  pushRect(WAREHOUSE.x, WAREHOUSE.z, WAREHOUSE.width / 2 + 0.5, WAREHOUSE.depth / 2 + 0.5);
  pushRect(
    (FARM.minX + FARM.maxX) / 2,
    (FARM.minZ + FARM.maxZ) / 2,
    (FARM.maxX - FARM.minX) / 2 + 0.5,
    (FARM.maxZ - FARM.minZ) / 2 + 0.5
  );

  mole.x = Math.max(LAND.minX, Math.min(LAND.maxX, mole.x));
  mole.z = Math.min(LAND.maxZ, Math.max(shorelineZ(mole.x) + 0.8, mole.z));
}

function moveToward(mole, tx, tz, speed, dt, useZone = true) {
  const dx = tx - mole.x;
  const dz = tz - mole.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.001) return 0;
  const step = Math.min(distance, speed * dt);
  mole.x += (dx / distance) * step;
  mole.z += (dz / distance) * step;
  const targetHeading = Math.atan2(dx, dz);
  let diff = targetHeading - mole.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  mole.heading += diff * Math.min(1, dt * 8);
  keepClear(mole, useZone);
  mole.step += dt * 11;
  mole.moving += (1 - mole.moving) * Math.min(1, dt * 8);
  return distance;
}

// 找到田鼠附近最近的一株成熟作物（偷菜寻路用）
function findMatureCrop(x, z, radius) {
  let best = null;
  let bestDist = radius * radius;
  CROPS.items.forEach((crop) => {
    if (crop.stage !== 'mature') return;
    const dist = (crop.x - x) ** 2 + (crop.z - z) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = crop;
    }
  });
  return best;
}

// 命中后把玩家沿反方向推开 1 格（直接位移，不改原有移动控制器）
function knockPlayer(mole) {
  const dx = player.position.x - mole.x;
  const dz = player.position.z - mole.z;
  const distance = Math.hypot(dx, dz) || 1;
  const vector = {
    x: player.position.x + (dx / distance) * MOLE.knockback,
    z: player.position.z + (dz / distance) * MOLE.knockback,
  };
  clampToLand(vector);
  player.position.x = vector.x;
  player.position.z = vector.z;
}

function updateWild(mole, dt, now) {
  const px = player.position.x;
  const pz = player.position.z;
  const playerDist = Math.hypot(mole.x - px, mole.z - pz);
  const canReachPlayer = !player.inside;

  // 被驱赶：短暂逃离玩家
  if (now < mole.fleeUntil) {
    moveToward(mole, mole.x * 2 - px, mole.z * 2 - pz, MOLE.raidSpeed, dt);
    mole.heading = Math.atan2(mole.x - px, mole.z - pz);
    return;
  }

  if (mole.state === 'patrol') {
    const crop = findMatureCrop(mole.x, mole.z, 15);
    if (crop) {
      mole.cropId = crop.id;
      mole.state = 'raid';
      return;
    }
    if (canReachPlayer && playerDist < MOLE.attackRange) {
      mole.state = 'alert';
      mole.attackTimer = MOLE.windup;
      return;
    }
    const distance = moveToward(mole, mole.target.x, mole.target.z, MOLE.patrolSpeed, dt);
    if (distance < 0.35) {
      mole.moving += (0 - mole.moving) * Math.min(1, dt * 8);
      mole.pause -= dt;
      mole.sniff += dt;
      if (mole.pause <= 0) {
        randomPatrol(mole);
        mole.pause = 1.0 + Math.random() * 2.6;
        mole.sniff = 0;
      }
    }
    return;
  }

  if (mole.state === 'raid') {
    const crop = CROPS.items.find((item) => item.id === mole.cropId && item.stage === 'mature');
    if (!crop) {
      mole.state = 'patrol';
      mole.cropId = null;
      randomPatrol(mole);
      return;
    }
    const distance = moveToward(mole, crop.x, crop.z, MOLE.raidSpeed, dt);
    if (distance < 1.0) {
      mole.moving += (0 - mole.moving) * Math.min(1, dt * 8);
      mole.eatTimer += dt;
      mole.sniff = 0.4;
      if (mole.eatTimer >= 1.5) {
        mole.eatTimer = 0;
        harvestCrop(crop.id); // 作物直接从地块消失，不产出物品
        mole.state = 'patrol';
        mole.cropId = null;
        randomPatrol(mole);
      }
      return;
    }
    // 偷菜途中被玩家挡住 / 贴近，先打人
    if (canReachPlayer && playerDist < MOLE.attackRange) {
      mole.state = 'alert';
      mole.attackTimer = MOLE.windup;
    }
    return;
  }

  if (mole.state === 'alert') {
    // 面向玩家蓄力
    mole.heading = Math.atan2(px - mole.x, pz - mole.z);
    mole.attackTimer -= dt;
    mole.moving += (0 - mole.moving) * Math.min(1, dt * 8);
    if (mole.attackTimer <= 0) {
      if (canReachPlayer && playerDist <= MOLE.lungeRange) {
        damagePlayer(MOLE.attackDamage, 'mole');
        knockPlayer(mole);
      }
      mole.state = 'cool';
      mole.attackTimer = MOLE.attackCooldown;
    }
    return;
  }

  if (mole.state === 'cool') {
    mole.attackTimer -= dt;
    moveToward(mole, px, pz, MOLE.raidSpeed, dt);
    if (mole.attackTimer <= 0) {
      mole.state = canReachPlayer && playerDist < MOLE.attackRange + 0.8 ? 'alert' : 'patrol';
      if (mole.state === 'alert') mole.attackTimer = MOLE.windup;
      else randomPatrol(mole);
    }
  }
}

function updateTamed(mole, dt, now) {
  // 主动驱赶靠近菜地 / 玩家的野生田鼠
  let threat = null;
  let threatDist = MOLE.guardRange;
  MOLES.forEach((other) => {
    if (other === mole || other.tamed) return;
    const dist = Math.hypot(other.x - player.position.x, other.z - player.position.z);
    if (dist < threatDist) {
      threatDist = dist;
      threat = other;
    }
  });

  if (!mole.following) {
    // 不跟随：停在原地，偶尔小步挪动
    mole.moving += (0 - mole.moving) * Math.min(1, dt * 6);
    return;
  }

  if (threat) {
    mole.guardTimer -= dt;
    const distance = moveToward(mole, threat.x, threat.z, MOLE.raidSpeed, dt, false);
    if (distance < 1.0 && mole.guardTimer <= 0) {
      mole.guardTimer = 1.2;
      threat.hp -= MOLE.tamedDamage;
      const dx = threat.x - mole.x;
      const dz = threat.z - mole.z;
      const len = Math.hypot(dx, dz) || 1;
      threat.x += (dx / len) * 1.2;
      threat.z += (dz / len) * 1.2;
      threat.fleeUntil = now + 4000;
      keepClear(threat);
      if (threat.hp <= 0) {
        threat.hp = MOLE.maxHp;
        threat.state = 'patrol';
        threat.fleeUntil = now + 8000;
      }
    }
    return;
  }
  mole.guardTimer = 0;

  // 跟在玩家身后 1.5 格
  const behindX = player.position.x - Math.sin(player.yaw) * MOLE.followDistance;
  const behindZ = player.position.z - Math.cos(player.yaw) * MOLE.followDistance;
  const distance = moveToward(mole, behindX, behindZ, MOLE.raidSpeed, dt, false);
  if (distance < 0.25) mole.moving += (0 - mole.moving) * Math.min(1, dt * 8);
}

export function updateMoles(delta) {
  const dt = Math.min(delta, 1 / 30);
  const now = performance.now();

  MOLES.forEach((mole) => {
    mole.target.x = Math.max(ZONE.minX, Math.min(ZONE.maxX, mole.target.x));
    mole.target.z = Math.max(ZONE.minZ, Math.min(ZONE.maxZ, mole.target.z));
    if (mole.tamed) updateTamed(mole, dt, now);
    else updateWild(mole, dt, now);
    if (mole.heartUntil && mole.heartUntil < now) mole.heartUntil = 0;
  });

  // 供 UI 显示「喂食田鼠」按钮
  let near = null;
  let nearDist = MOLE.feedRange;
  MOLES.forEach((mole) => {
    if (mole.tamed) return;
    const dist = Math.hypot(mole.x - player.position.x, mole.z - player.position.z);
    if (dist < nearDist) {
      nearDist = dist;
      near = mole;
    }
  });
  player.nearMoleId = near ? near.id : null;
}

export function getMole(id) {
  return MOLES.find((mole) => mole.id === id) || null;
}

// 喂食：手持萝卜 / 白菜，靠近后点击；6 次驯服，间隔超过 10 秒进度清零
export function feedMole(id) {
  const mole = getMole(id);
  if (!mole || mole.tamed) return { ok: false, reason: 'invalid' };
  if (held.type !== 'radish' && held.type !== 'cabbage') return { ok: false, reason: 'item' };
  const dist = Math.hypot(mole.x - player.position.x, mole.z - player.position.z);
  if (dist > MOLE.feedRange) return { ok: false, reason: 'far' };
  if (!removeOne(held.type)) return { ok: false, reason: 'item' };

  const now = performance.now();
  if (now - mole.lastFeedAt > MOLE.feedResetSeconds * 1000) mole.feedProgress = 0;
  mole.lastFeedAt = now;
  mole.feedProgress += 1;

  if (mole.feedProgress >= MOLE.feedNeed) {
    mole.tamed = true;
    mole.feedProgress = MOLE.feedNeed;
    mole.heartUntil = now + MOLE.heartSeconds * 1000;
    mole.state = 'patrol';
    // 同时只允许 1 只跟随，之前的驯服田鼠停在原地
    MOLES.forEach((other) => {
      if (other !== mole && other.tamed) other.following = false;
    });
    mole.following = true;
    return { ok: true, tamed: true, progress: mole.feedProgress, need: MOLE.feedNeed };
  }

  return { ok: true, tamed: false, progress: mole.feedProgress, need: MOLE.feedNeed };
}

export function moleFeedInfo(id) {
  if (id == null) return null;
  const mole = getMole(id);
  if (!mole) return null;
  return {
    progress: mole.feedProgress,
    need: MOLE.feedNeed,
    tamed: mole.tamed,
    following: mole.following,
  };
}

export function snapshotMoles() {
  return {
    items: MOLES.map((mole) => ({
      id: mole.id,
      x: mole.x,
      z: mole.z,
      heading: mole.heading,
      hp: mole.hp,
      feedProgress: mole.feedProgress,
      tamed: mole.tamed,
      following: mole.following,
    })),
  };
}

export function restoreMoles(saved = {}, fallback = {}) {
  const baseItems = Array.isArray(fallback.items) ? fallback.items : [];
  const savedItems = Array.isArray(saved?.items) ? saved.items : baseItems;
  const savedById = new Map(savedItems.filter((item) => item && typeof item === 'object').map((item) => [item.id, item]));
  const baseById = new Map(baseItems.map((item) => [item.id, item]));
  let followingFound = false;

  MOLES.forEach((mole) => {
    const base = baseById.get(mole.id) || mole;
    const source = savedById.get(mole.id) || base;
    const finite = (value, defaultValue) => (Number.isFinite(value) ? value : defaultValue);
    mole.x = finite(source.x, base.x);
    mole.z = finite(source.z, base.z);
    mole.heading = finite(source.heading, base.heading);
    mole.hp = Math.max(0, Math.min(MOLE.maxHp, finite(source.hp, base.hp)));
    mole.feedProgress = Math.max(0, Math.min(MOLE.feedNeed, Math.floor(finite(source.feedProgress, base.feedProgress))));
    mole.tamed = typeof source.tamed === 'boolean' ? source.tamed : !!base.tamed;
    mole.following = mole.tamed && !!source.following && !followingFound;
    if (mole.following) followingFound = true;
    mole.state = 'patrol';
    mole.target.x = mole.x;
    mole.target.z = mole.z;
    mole.pause = 0.5;
    mole.step = 0;
    mole.moving = 0;
    mole.sniff = 0;
    mole.attackTimer = 0;
    mole.cropId = null;
    mole.eatTimer = 0;
    mole.lastFeedAt = 0;
    mole.heartUntil = 0;
    mole.fleeUntil = 0;
    mole.guardTimer = 0;
  });
  nextId = MOLES.reduce((value, mole) => Math.max(value, mole.id + 1), 1);
}
