import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  autopilot,
  cameraView,
  gate,
  HIP_HEIGHT,
  houseDoor,
  input,
  player,
  resetInput,
  swing,
  SPAWN,
  userActivity,
} from '../game/runtime';
import {
  CHESTS,
  clampToLand,
  DOOR,
  FARM,
  FURNITURE,
  INTERIOR,
  isInsideHouse,
  isInsideWarehouse,
  LAND,
  LAKE_SWIM_MIN_Z,
  PLAYER_SCALE,
  SAKURA,
  heightAt,
  shorelineZ,
  SMALL_SAKURA,
  solidColliders,
  streamDistance,
  waterLevelAt,
  WAREHOUSE,
  WAREHOUSE_DOOR,
  WAREHOUSE_INTERIOR,
} from '../game/terrain';
import {
  findCropForTask,
  harvestCrop,
  nearestCrop,
  waterCrop,
} from '../game/crops';
import {
  collectPlant,
  nearestPlant,
  plantCircleColliders,
  plantInfo,
  pokeMushroom,
  waterPlant,
  WILD_PLANTS,
} from '../game/wildplants';
import { addItem, countInBag, hasBagSpace, ITEMS, removeOne } from '../game/inventory';
import { feedRabbit, nearestRabbit, RABBITS, showHeart } from '../game/rabbits';
import { isEvening, setMorning } from '../game/time';
import { nearestMountainTree } from '../game/mountainWorld';
import Girl from './Girl';

const WALK_SPEED = 15.0;
const JUMP_VELOCITY = 9.0;
const GRAVITY = 26;
// 浮在水面时，髋部相对水面的下沉量（肩膀刚好没入水中）
const SWIM_HIP_DROP = 0.78;
const SIT_DURATION = 0.45;
const STAND_DURATION = 0.4;
const FURN_DURATION = 0.42;
const PLAYER_R = 0.52;
const IDLE_LIMIT = 180000; // 三分钟无操作后小樱自己活动
const SLEEP_TO_DAY = 30; // 躺下即睡觉，夜间只需三十秒就天亮

const PLANT_COLLIDERS = plantCircleColliders();

const scratch = { x: 0, z: 0 };

function bubbleSay(text) {
  window.dispatchEvent(new CustomEvent('sakura-say', { detail: { text } }));
}

// 自由活动：三分钟没有操作时，小樱随机去劳作、喂兔子、荡秋千、睡觉或看电脑
function wanderSpot() {
  for (let i = 0; i < 30; i += 1) {
    // 在当前位置附近散步，离家太远就往回带，避免一路走进深山
    let x = player.position.x + (Math.random() - 0.5) * 60;
    let z = player.position.z + (Math.random() - 0.5) * 60;
    const homeX = x - SPAWN.x;
    const homeZ = z - SPAWN.z;
    const homeDist = Math.hypot(homeX, homeZ);
    if (homeDist > 260) {
      const k = 260 / homeDist;
      x = SPAWN.x + homeX * k;
      z = SPAWN.z + homeZ * k;
    }
    if (x < LAND.minX + 6 || x > LAND.maxX - 6) continue;
    if (z < shorelineZ(x) + 4 || z > LAND.maxZ - 6) continue;
    if (streamDistance(x, z) < 1.6) continue;
    if (x > FARM.minX - 2 && x < FARM.maxX + 2 && z > FARM.minZ - 2 && z < FARM.maxZ + 2) continue;
    if (Math.abs(x - WAREHOUSE.x) < WAREHOUSE.width / 2 + 2 && Math.abs(z - WAREHOUSE.z) < WAREHOUSE.depth / 2 + 2) {
      continue;
    }
    if (Math.abs(x - FURNITURE.bed.approach.x) < 1 && Math.abs(z - FURNITURE.bed.approach.z) < 1) continue;
    return { x, z };
  }
  return { x: SPAWN.x, z: SPAWN.z + 6 };
}

// 在附近找一株适合自由活动的山野植物：采摘要结果期以上，浇水要未浇过，蘑菇单独判定
function findWildTarget(mode) {
  const maxDist = mode === 'forage' ? 150 : mode === 'mushroom' ? 240 : 130;
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < WILD_PLANTS.items.length; i += 1) {
    const plant = WILD_PLANTS.items[i];
    if (!plant.alive || plant.cooldown > 0) continue;
    if (mode === 'mushroom') {
      if (!plant.mushroom) continue;
    } else if (plant.mushroom) {
      continue;
    } else if (mode === 'waterWild') {
      if (plant.watered || plant.stage >= 3) continue;
    } else if (plant.stage < 2) {
      continue;
    }
    const dist = Math.hypot(plant.x - player.position.x, plant.z - player.position.z);
    if (dist > maxDist || dist < 2.5) continue;
    // 距离近的优先，但保留随机性，免得每次都去同一株
    const score = dist + Math.random() * 45;
    if (score < bestScore) {
      bestScore = score;
      best = plant;
    }
  }
  return best;
}

// 湖岸看夕阳的落脚点
function lakeSpot() {
  const x = Math.max(LAND.minX + 6, Math.min(LAND.maxX - 6, player.position.x + (Math.random() - 0.5) * 24));
  return { x, z: shorelineZ(x) + 4 + Math.random() * 2 };
}

// 樱花树下绕树干一圈的落脚点
function sakuraSpot() {
  const angle = Math.random() * Math.PI * 2;
  const dist = SAKURA.radius + 1.5 + Math.random() * 0.8;
  return { x: SAKURA.x + Math.cos(angle) * dist, z: SAKURA.z + Math.sin(angle) * dist };
}

function nearestForFeed() {
  let best = null;
  let bestDist = Infinity;
  RABBITS.forEach((rabbit) => {
    if (rabbit.resting) return;
    const dist = Math.hypot(
      rabbit.position.x - player.position.x,
      rabbit.position.z - player.position.z
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = rabbit;
    }
  });
  return best;
}

// 进屋统一路线：门外 → 门内 → 室内目标，全程碰撞移动
function indoorRoute(spot) {
  return [
    { x: DOOR.x, z: DOOR.z + 1.1 },
    { x: DOOR.x, z: INTERIOR.maxZ - 0.9 },
    { x: spot.x, z: spot.z },
  ];
}

// 进田统一路线：围栏门外 → 门内 → 目标田垄
function farmRoute(crop) {
  return [
    { x: FARM.gate.x + 1.4, z: FARM.gate.z },
    { x: FARM.gate.x - 1.4, z: FARM.gate.z },
    { x: crop.x + 1.35, z: crop.z + 0.35 },
  ];
}

// 按「距离 + 权重」挑下一件事：近的多做，远的也能偶尔去一趟
function pickTask() {
  const px = player.position.x;
  const pz = player.position.z;
  const evening = isEvening();
  const radishes = countInBag('radish');
  const waterTarget = findCropForTask(px, pz, { wateringOnly: true });
  const harvestTarget = findCropForTask(px, pz, { harvestOnly: true });
  const feedable = radishes > 0 ? nearestForFeed() : null;
  const forageTarget = hasBagSpace() ? findWildTarget('forage') : null;
  const mushroomTarget = findWildTarget('mushroom');
  const wildWaterTarget = findWildTarget('waterWild');

  const dist = (x, z) => Math.hypot(x - px, z - pz);
  const candidates = [];
  const add = (kind, weight, d) => candidates.push({ kind, weight, dist: d });

  if (waterTarget) add('water', 3, dist(waterTarget.x, waterTarget.z));
  if (harvestTarget && hasBagSpace()) add('harvest', 3, dist(harvestTarget.x, harvestTarget.z));
  if (feedable) add('feed', 2, dist(feedable.position.x, feedable.position.z));
  if (forageTarget) add('forage', 3, dist(forageTarget.x, forageTarget.z));
  if (mushroomTarget) add('mushroom', 2, dist(mushroomTarget.x, mushroomTarget.z));
  if (wildWaterTarget) add('waterWild', 1, dist(wildWaterTarget.x, wildWaterTarget.z));
  add('sakura', 1, dist(SAKURA.x, SAKURA.z));
  if (pz < 600) add('lake', 1, Math.abs(shorelineZ(px) + 4 - pz));
  if (evening) add('bed', 2, dist(FURNITURE.bed.approach.x, FURNITURE.bed.approach.z));
  add('swing', 2, dist(swing.seat.x, swing.seat.z));
  add('computer', 1, dist(FURNITURE.chair.approach.x, FURNITURE.chair.approach.z));
  add('wander', 3, 30);
  if (!candidates.length) return 'wander';

  // 池子按权重展开；尽量避免连续做同一件事
  const pool = [];
  candidates.forEach((item) => {
    for (let i = 0; i < item.weight; i += 1) pool.push(item);
  });
  const varied = pool.filter((item) => item.kind !== autopilot.lastKind);
  const source = varied.length ? varied : pool;

  // 多抽几次取最近的一件，越近的事越容易被选中
  let best = null;
  for (let i = 0; i < 3; i += 1) {
    const pick = source[Math.floor(Math.random() * source.length)];
    if (!best || pick.dist < best.dist) best = pick;
  }
  return best.kind;
}

function startAutopilot() {
  const kind = pickTask();
  autopilot.active = true;
  autopilot.kind = kind;
  autopilot.phase = '';
  autopilot.route = [];
  autopilot.wp = 0;
  autopilot.wait = 0;
  autopilot.elapsed = 0;
  autopilot.stuck = 0;
  autopilot.lastX = player.position.x;
  autopilot.lastZ = player.position.z;
  autopilot.cropId = null;
  autopilot.rabbitId = null;
  autopilot.plantId = null;
  autopilot.resume = true;
  autopilot.cooldown = 0;
  autopilot.speedMul = [1, 2, 3][Math.floor(Math.random() * 3)];

  if (kind === 'bed') {
    if (!houseDoor.open) window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'openDoor' } }));
    autopilot.route = indoorRoute({
      x: FURNITURE.bed.approach.x,
      z: FURNITURE.bed.approach.z,
    });
    bubbleSay('该睡觉了…');
  } else if (kind === 'computer') {
    if (!houseDoor.open) window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'openDoor' } }));
    autopilot.route = indoorRoute({
      x: FURNITURE.chair.approach.x,
      z: FURNITURE.chair.approach.z,
    });
    bubbleSay('去看一会儿电脑…');
  } else if (kind === 'swing') {
    autopilot.route = [{ x: swing.seat.x, z: swing.seat.z }];
    bubbleSay('去荡一会儿秋千…');
  } else if (kind === 'feed') {
    const rabbit = nearestForFeed();
    if (rabbit) {
      autopilot.rabbitId = rabbit.id;
      autopilot.route = [{ x: rabbit.position.x, z: rabbit.position.z }];
      bubbleSay('给小兔子送萝卜…');
    }
  } else if (kind === 'water' || kind === 'harvest') {
    const crop = kind === 'harvest'
      ? findCropForTask(player.position.x, player.position.z, { harvestOnly: true })
      : findCropForTask(player.position.x, player.position.z, { wateringOnly: true });
    if (crop) {
      if (!gate.open) window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'openGate' } }));
      autopilot.cropId = crop.id;
      autopilot.route = farmRoute(crop);
      bubbleSay(kind === 'harvest' ? '去田里收菜…' : '去田里浇浇水…');
    }
  } else if (kind === 'forage' || kind === 'waterWild' || kind === 'mushroom') {
    const plant = findWildTarget(kind);
    if (plant) {
      autopilot.plantId = plant.id;
      autopilot.route = [{ x: plant.x, z: plant.z }];
      bubbleSay(
        kind === 'forage'
          ? '外面好像有能采的东西…'
          : kind === 'mushroom'
          ? '去林子里看看蘑菇…'
          : '野花也该喝点水…'
      );
    }
  } else if (kind === 'lake') {
    const spot = lakeSpot();
    autopilot.route = [{ x: spot.x, z: spot.z }];
    bubbleSay('去湖边吹吹风…');
  } else if (kind === 'sakura') {
    const spot = sakuraSpot();
    autopilot.route = [{ x: spot.x, z: spot.z }];
    bubbleSay('去樱花树下站一会儿…');
  }

  if (!autopilot.route.length && kind !== 'bed' && kind !== 'computer') {
    const spot = wanderSpot();
    autopilot.kind = 'wander';
    autopilot.route = [{ x: spot.x, z: spot.z }];
    bubbleSay('去草地上走走…');
  }

  autopilot.target.x = autopilot.route[0]?.x ?? player.position.x;
  autopilot.target.z = autopilot.route[0]?.z ?? player.position.z;
}

// 结束一件活动后不重置三分钟，改成随机小憩，然后继续下一件
function finishAutopilot() {
  autopilot.active = false;
  autopilot.lastKind = autopilot.kind;
  autopilot.kind = '';
  autopilot.phase = '';
  autopilot.route = [];
  autopilot.wp = 0;
  autopilot.wait = 0;
  autopilot.cropId = null;
  autopilot.rabbitId = null;
  autopilot.plantId = null;
  autopilot.cooldown = 6 + Math.random() * 14;
}

// 轴分离碰撞：把点（带角色半径）推出所有固体矩形，先 x 后 z 分别试探实现贴墙滑动
function pushOutOfRects(p) {
  const rects = solidColliders();
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (
      p.x + PLAYER_R > r.minX &&
      p.x - PLAYER_R < r.maxX &&
      p.z + PLAYER_R > r.minZ &&
      p.z - PLAYER_R < r.maxZ
    ) {
      const left = p.x + PLAYER_R - r.minX;
      const right = r.maxX - (p.x - PLAYER_R);
      const back = p.z + PLAYER_R - r.minZ;
      const front = r.maxZ - (p.z - PLAYER_R);
      const min = Math.min(left, right, back, front);
      if (min === left) p.x = r.minX - PLAYER_R;
      else if (min === right) p.x = r.maxX + PLAYER_R;
      else if (min === back) p.z = r.minZ - PLAYER_R;
      else p.z = r.maxZ + PLAYER_R;
    }
  }
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export default function Player({ seated, activity }) {
  const group = useRef();
  const shadow = useRef();
  const trans = useRef({
    active: false,
    t: 0,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    yawFrom: 0,
    yawTo: 0,
    kind: '', // 'swing' | 'furn'
  });
  const targetYaw = useRef(0);

  // 家具活动切换：走上床 / 躺下 / 坐椅子 / 下床 / 离椅
  useEffect(() => {
    if (activity === player.activity) return;
    const prev = player.activity;
    player.activity = activity;

    if (activity === 'groundSit' || activity === 'groundLie') {
      trans.current.active = false;
      player.mode = 'ground';
      resetInput();
      player.speed = 0;
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
    } else if (activity === 'bedSit' || activity === 'bedLie' || activity === 'chair') {
      const spot =
        activity === 'chair'
          ? FURNITURE.chair.sit
          : activity === 'bedLie'
          ? FURNITURE.bed.lie
          : FURNITURE.bed.sit;
      trans.current.active = true;
      trans.current.t = 0;
      trans.current.kind = 'furn';
      trans.current.from.copy(player.position);
      trans.current.to.set(spot.x, spot.y, spot.z);
      trans.current.yawFrom = player.yaw;
      trans.current.yawTo = spot.yaw;
      player.mode = 'furnMove';
      resetInput();
      player.speed = 0;
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
    } else if (activity === 'walk' && prev !== 'walk') {
      resetInput();
      if (prev === 'groundSit' || prev === 'groundLie') {
        trans.current.active = false;
        player.mode = 'walk';
      } else {
        const leave = prev === 'chair' ? FURNITURE.chair.leave : FURNITURE.bed.leave;
        trans.current.active = true;
        trans.current.t = 0;
        trans.current.kind = 'furn';
        trans.current.from.copy(player.position);
        trans.current.to.set(leave.x, HIP_HEIGHT, leave.z);
        trans.current.yawFrom = player.yaw;
        trans.current.yawTo = prev === 'chair' ? Math.PI : Math.PI / 2;
        player.mode = 'furnLeave';
      }
    }
  }, [activity]);

  // 秋千坐 / 起（保留原有逻辑）
  useEffect(() => {
    if (seated && player.mode === 'walk' && player.activity === 'walk') {
      player.mode = 'sitIn';
      trans.current.active = true;
      trans.current.t = 0;
      trans.current.kind = 'swing';
      trans.current.from.copy(player.position);
      resetInput();
      player.speed = 0;
    } else if (!seated && (player.mode === 'sitting' || player.mode === 'sitIn')) {
      const from = player.position.clone();
      const to = new THREE.Vector3(from.x - 1.35, HIP_HEIGHT, from.z + 1.15);
      clampToLand(to);
      player.mode = 'standUp';
      trans.current.active = true;
      trans.current.t = 0;
      trans.current.kind = 'swing';
      trans.current.from.copy(from);
      trans.current.to.copy(to);
    }
  }, [seated]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = trans.current;
    player.swimming = false;

    // 三分钟没有操作开始自由活动；进入后按小憩间隔连续进行，直到用户操作
    if (
      !autopilot.active &&
      !userActivity.paused &&
      !player.inside &&
      player.mode === 'walk' &&
      player.activity === 'walk'
    ) {
      if (autopilot.resume) {
        autopilot.cooldown -= dt;
        if (autopilot.cooldown <= 0) startAutopilot();
      } else if (performance.now() - userActivity.lastInput > IDLE_LIMIT) {
        startAutopilot();
      }
    }

    if (autopilot.active) {
      autopilot.elapsed += dt;
      if (autopilot.kind === 'feed' && autopilot.phase === '') {
        const rabbit = RABBITS.find((item) => item.id === autopilot.rabbitId);
        if (rabbit) {
          const wp = autopilot.route[autopilot.wp];
          if (wp) {
            wp.x = rabbit.position.x;
            wp.z = rabbit.position.z;
          }
        }
      }

      // 用位移判断是否卡住：只在赶路阶段检查，动作阶段原地停留是正常的
      const moved = Math.hypot(player.position.x - autopilot.lastX, player.position.z - autopilot.lastZ);
      autopilot.lastX = player.position.x;
      autopilot.lastZ = player.position.z;
      if (autopilot.route.length > 0) {
        autopilot.stuck = moved < 0.004 ? autopilot.stuck + dt : 0;
        if (autopilot.stuck > 6) finishAutopilot();
      }

      if (autopilot.active) {
        const wp = autopilot.route[autopilot.wp];
        if (wp) {
          autopilot.target.x = wp.x;
          autopilot.target.z = wp.z;
          const targetDist = Math.hypot(wp.x - player.position.x, wp.z - player.position.z);
          const last = autopilot.wp === autopilot.route.length - 1;
          let arrive = 0.7;
          if (last) {
            const kind = autopilot.kind;
            if (kind === 'feed' || kind === 'forage' || kind === 'mushroom' || kind === 'waterWild') arrive = 1.6;
            else if (kind === 'sakura') arrive = 1.8;
            else if (kind === 'lake') arrive = 1.2;
            else arrive = 1.1;
          }
          const arrived = targetDist < arrive || autopilot.elapsed > 120;
          if (arrived) {
            if (!last) {
              autopilot.wp += 1;
              autopilot.elapsed = 0;
              autopilot.stuck = 0;
            } else {
              autopilot.route = [];
              autopilot.phase = 'act';
              autopilot.wait = 0;
              if (autopilot.kind === 'bed') {
                // 先坐上床，再躺下；App 只切换姿势，不改坐标
                window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'bedSit' } }));
                bubbleSay('好困…躺下来睡一会儿');
                autopilot.wait = 1.4;
                autopilot.phase = 'bed';
              } else if (autopilot.kind === 'computer') {
                window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'computerSit' } }));
                bubbleSay('看一会儿黄昏电台…');
                autopilot.wait = 10 + Math.random() * 10;
              } else if (autopilot.kind === 'swing') {
                window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'swingSit' } }));
                bubbleSay('自己荡一会儿～');
                autopilot.wait = 8 + Math.random() * 7;
                autopilot.impulseAt = 0;
              } else if (autopilot.kind === 'feed') {
                const rabbit = RABBITS.find((item) => item.id === autopilot.rabbitId);
                if (rabbit && removeOne('radish')) {
                  feedRabbit(rabbit.id);
                  showHeart(rabbit.id, 3000);
                  if (Math.random() < 0.3) {
                    player.happyUntil = performance.now() + 14000;
                    bubbleSay('小兔子好可爱呀～');
                  } else {
                    bubbleSay('慢慢吃，小兔子～');
                  }
                  autopilot.wait = 3.2;
                } else {
                  finishAutopilot();
                }
              } else if (autopilot.kind === 'water') {
                const crop = autopilot.cropId != null ? { id: autopilot.cropId } : null;
                if (crop && waterCrop(crop.id)) bubbleSay('喝点水，快快长大～');
                autopilot.wait = 2.2;
              } else if (autopilot.kind === 'harvest') {
                const crop = autopilot.cropId != null ? { id: autopilot.cropId } : null;
                if (crop && hasBagSpace()) {
                  const result = harvestCrop(crop.id);
                  if (result && addItem(result.product)) bubbleSay('收进背包啦～');
                }
                autopilot.wait = 2.2;
              } else if (autopilot.kind === 'forage') {
                const plant = WILD_PLANTS.items.find((item) => item.id === autopilot.plantId && item.alive);
                if (plant && hasBagSpace()) {
                  const result = collectPlant(plant.id);
                  if (result) {
                    result.products.forEach((type) => addItem(type));
                    const names = result.products.map((type) => ITEMS[type]?.name || '东西');
                    bubbleSay(`采到${names.join('、')}啦～`);
                    player.happyUntil = performance.now() + 9000;
                  }
                }
                autopilot.wait = 2.4;
              } else if (autopilot.kind === 'mushroom') {
                const plant = WILD_PLANTS.items.find((item) => item.id === autopilot.plantId && item.alive);
                if (plant) {
                  const result = pokeMushroom(plant.id);
                  if (result) {
                    bubbleSay(result.regrew ? '过几天还会再冒出来的～' : '蘑菇散开啦～');
                    if (Math.random() < 0.5) player.happyUntil = performance.now() + 8000;
                  }
                }
                autopilot.wait = 2.2;
              } else if (autopilot.kind === 'waterWild') {
                const plant = WILD_PLANTS.items.find((item) => item.id === autopilot.plantId && item.alive);
                if (plant) {
                  waterPlant(plant.id);
                  bubbleSay('喝点水，长得更好看～');
                }
                autopilot.wait = 2.0;
              } else if (autopilot.kind === 'lake') {
                const lines = ['夕阳落在水里了…', '水面亮闪闪的…', '风里有水草的味道…'];
                bubbleSay(lines[Math.floor(Math.random() * lines.length)]);
                if (Math.random() < 0.4) player.happyUntil = performance.now() + 12000;
                autopilot.wait = 8 + Math.random() * 6;
              } else if (autopilot.kind === 'sakura') {
                window.dispatchEvent(new CustomEvent('petal-burst'));
                const lines = ['花瓣落在肩上…', '樱花开得真好…', '再站一会儿吧…'];
                bubbleSay(lines[Math.floor(Math.random() * lines.length)]);
                if (Math.random() < 0.5) player.happyUntil = performance.now() + 10000;
                autopilot.wait = 6 + Math.random() * 4;
              } else {
                finishAutopilot();
              }
            }
          }
        }

        if (autopilot.active && autopilot.wait > 0) {
          autopilot.wait -= dt;
          if (autopilot.wait <= 0) {
            if (autopilot.kind === 'bed' && autopilot.phase === 'bed') {
              window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'bedLie' } }));
              finishAutopilot();
            } else if (autopilot.kind === 'computer') {
              window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'computerLeave' } }));
              finishAutopilot();
            } else if (autopilot.kind === 'swing') {
              window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'swingLeave' } }));
              finishAutopilot();
            } else {
              finishAutopilot();
            }
          }
        }

        // 自主荡秋千：坐下后周期补力，形成真正前后摆动
        if (autopilot.active && autopilot.kind === 'swing' && autopilot.phase === 'act') {
          autopilot.impulseAt += dt;
          if (autopilot.impulseAt > 0.9) {
            autopilot.impulseAt = 0;
            swing.impulse(0.34);
          }
        }
      }
    }

    // 躺下即进入睡眠；傍晚或夜间躺满三十秒后天亮并起身
    if (player.activity === 'bedLie' && player.mode === 'furnHere') {
      player.sleepSeconds += dt;
      if (player.sleepSeconds >= SLEEP_TO_DAY && isEvening()) {
        player.sleepSeconds = 0;
        setMorning();
        bubbleSay('天亮了…睡饱啦');
        window.dispatchEvent(new CustomEvent('sakura-auto-act', { detail: { kind: 'wakeUp' } }));
      }
    } else {
      player.sleepSeconds = 0;
    }

    if (player.mode === 'walk') {
      // 水域判定：水足够深时浮在水面，浅水溪流仍然可以趟水走过
      const waterLevel = waterLevelAt(player.position.x, player.position.z);
      const waterDepth = waterLevel != null ? waterLevel - heightAt(player.position.x, player.position.z) : 0;
      const swimming = waterLevel != null && waterDepth > 0.9;
      player.swimming = swimming;
      // 移动方向基于相机当前视角：相机在角色侧面时，"前进"也是朝画面深处走
      // 相机在 yaw 下的水平朝向为 (-sin, -cos)，右方向为 (-fz, fx)
      const camYaw = cameraView.yaw;
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      // 传送落地后的短时间输入锁：禁止移动 / 跳跃 / 自主活动，防卡进地形或与好友重叠
      const teleportLocked = performance.now() < (player.teleportLockedUntil || 0);
      let axisX = teleportLocked
        ? 0
        : (input.right ? 1 : 0) - (input.left ? 1 : 0) + (input.moveX || 0);
      let axisZ = teleportLocked
        ? 0
        : (input.forward ? 1 : 0) - (input.back ? 1 : 0) + (input.moveZ || 0);
      const axisLength = Math.hypot(axisX, axisZ);
      if (axisLength > 1) {
        axisX /= axisLength;
        axisZ /= axisLength;
      }
      let dirX = fx * axisZ - fz * axisX;
      let dirZ = fz * axisZ + fx * axisX;
      let length = Math.hypot(dirX, dirZ);

      // 小樱自己活动时没有按键输入，直接朝目标走
      if (length === 0 && autopilot.active && !teleportLocked) {
        const autoX = autopilot.target.x - player.position.x;
        const autoZ = autopilot.target.z - player.position.z;
        const autoDist = Math.hypot(autoX, autoZ);
        if (autoDist > 0.001) {
          dirX = autoX / autoDist;
          dirZ = autoZ / autoDist;
          length = 1;
        }
      }

      if (length > 0) {
        targetYaw.current = Math.atan2(dirX, dirZ);
        // 自主活动使用本任务随机选定的走 / 竞走 / 跑，不改玩家的速度开关
        const speedMul = autopilot.active ? autopilot.speedMul : player.speedMul || 1;
        const targetSpeed = WALK_SPEED * speedMul * (player.speedScale || 1) * (swimming ? 0.62 : 1);
        player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 12);
        const step = player.speed * dt;
        const dx = (dirX / length) * step;
        const dz = (dirZ / length) * step;

        // X 轴试探
        const groundBefore = heightAt(player.position.x, player.position.z);
        scratch.x = player.position.x + dx;
        scratch.z = player.position.z;
        scratch.x = THREE.MathUtils.clamp(scratch.x, LAND.minX, LAND.maxX);
        pushOutOfRects(scratch);
        // 相邻格高差超过 1U 视为不可直接攀爬（跳跃中例外）
        if (player.jumpHeight > 0 || heightAt(scratch.x, scratch.z) - groundBefore <= 1.0) {
          player.position.x = scratch.x;
        }

        // Z 轴试探
        const groundMid = heightAt(player.position.x, player.position.z);
        scratch.x = player.position.x;
        scratch.z = player.position.z + dz;
        scratch.z = Math.min(scratch.z, LAND.maxZ);
        scratch.z = Math.max(scratch.z, LAKE_SWIM_MIN_Z);
        pushOutOfRects(scratch);
        if (player.jumpHeight > 0 || heightAt(scratch.x, scratch.z) - groundMid <= 1.0) {
          player.position.z = scratch.z;
        }

        // 樱花树树干阻挡（圆形）
        const offX = player.position.x - SAKURA.x;
        const offZ = player.position.z - SAKURA.z;
        const d = Math.hypot(offX, offZ);
        if (d < SAKURA.radius) {
          const nx = d > 0.0001 ? offX / d : 1;
          const nz = d > 0.0001 ? offZ / d : 0;
          player.position.x = SAKURA.x + nx * SAKURA.radius;
          player.position.z = SAKURA.z + nz * SAKURA.radius;
        }

        // 草地外围的小樱花树树干
        SMALL_SAKURA.forEach((tree) => {
          const dx = player.position.x - tree.x;
          const dz = player.position.z - tree.z;
          const dist = Math.hypot(dx, dz);
          const keep = 0.5 * tree.scale;
          if (dist < keep && dist > 0.0001) {
            player.position.x = tree.x + (dx / dist) * keep;
            player.position.z = tree.z + (dz / dist) * keep;
          }
        });

        // 最终植物目录中的树干碰撞
        for (let i = 0; i < PLANT_COLLIDERS.length; i += 1) {
          const tree = PLANT_COLLIDERS[i];
          const dx = player.position.x - tree.x;
          const dz = player.position.z - tree.z;
          const dist = Math.hypot(dx, dz);
          if (dist < tree.radius && dist > 0.0001) {
            player.position.x = tree.x + (dx / dist) * tree.radius;
            player.position.z = tree.z + (dz / dist) * tree.radius;
          }
        }

        player.walkPhase += dt * 9 * (autopilot.active ? autopilot.speedMul : player.speedMul || 1);
      } else {
        player.speed += (0 - player.speed) * Math.min(1, dt * 14);
      }

      if (input.jump && !swimming && !teleportLocked) {
        if (player.jumpHeight === 0 && player.jumpVelocity === 0) {
          player.jumpVelocity = JUMP_VELOCITY;
        }
        input.jump = false;
      }

      if (player.jumpVelocity !== 0 || player.jumpHeight > 0) {
        player.jumpVelocity -= GRAVITY * dt;
        player.jumpHeight += player.jumpVelocity * dt;
        if (player.jumpHeight <= 0) {
          player.jumpHeight = 0;
          player.jumpVelocity = 0;
        }
      }

      const bob = Math.abs(Math.sin(player.walkPhase)) * 0.04 * Math.min(1.6, player.speed / WALK_SPEED);
      if (swimming) {
        // 浮在水面：肩膀齐水，轻微上下起伏表现浮力
        player.jumpHeight = 0;
        player.jumpVelocity = 0;
        player.swimPhase += dt * 2.0;
        const floatY = waterLevel - SWIM_HIP_DROP + Math.sin(player.swimPhase) * 0.07;
        player.position.y += (floatY - player.position.y) * Math.min(1, dt * 8);
      } else {
        player.position.y = HIP_HEIGHT + heightAt(player.position.x, player.position.z) + player.jumpHeight + bob;
      }
    } else if (player.mode === 'ground') {
      player.speed = 0;
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
      const surface = heightAt(player.position.x, player.position.z);
      const sittingHeight = THREE.MathUtils.lerp(HIP_HEIGHT, 0.52, player.sitting);
      player.position.y = surface + THREE.MathUtils.lerp(sittingHeight, 0.28, player.lying);
    } else if (player.mode === 'furnMove') {
      t.t = Math.min(1, t.t + dt / FURN_DURATION);
      const eased = 1 - Math.pow(1 - t.t, 3);
      player.position.lerpVectors(t.from, t.to, eased);
      let yawDiff = t.yawTo - t.yawFrom;
      yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
      player.yaw = t.yawFrom + yawDiff * eased;
      if (t.t >= 1) {
        player.position.copy(t.to);
        player.yaw = t.yawTo;
        player.mode = 'furnHere';
      }
    } else if (player.mode === 'furnHere') {
      const spot =
        player.activity === 'chair'
          ? FURNITURE.chair.sit
          : player.activity === 'bedLie'
          ? FURNITURE.bed.lie
          : FURNITURE.bed.sit;
      player.position.set(spot.x, spot.y, spot.z);
      player.yaw = spot.yaw;
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
      player.speed = 0;
    } else if (player.mode === 'furnLeave') {
      t.t = Math.min(1, t.t + dt / FURN_DURATION);
      const eased = 1 - Math.pow(1 - t.t, 3);
      player.position.lerpVectors(t.from, t.to, eased);
      let yawDiff = t.yawTo - t.yawFrom;
      yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
      player.yaw = t.yawFrom + yawDiff * eased;
      if (t.t >= 1) {
        player.position.copy(t.to);
        player.position.y = HIP_HEIGHT + heightAt(player.position.x, player.position.z);
        player.mode = 'walk';
      }
    } else if (player.mode === 'sitIn' || player.mode === 'sitting') {
      if (player.mode === 'sitIn') {
        t.t = Math.min(1, t.t + dt / SIT_DURATION);
        const eased = 1 - Math.pow(1 - t.t, 3);
        player.position.lerpVectors(t.from, swing.seatTop, eased);
        if (t.t >= 1) player.mode = 'sitting';
      } else {
        player.position.copy(swing.seatTop);
      }
      targetYaw.current = swing.yaw;
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
      player.speed = 0;
    } else if (player.mode === 'standUp') {
      t.t = Math.min(1, t.t + dt / STAND_DURATION);
      const eased = 1 - Math.pow(1 - t.t, 3);
      player.position.lerpVectors(t.from, t.to, eased);
      if (t.t >= 1) {
        player.mode = 'walk';
        player.position.y = HIP_HEIGHT + heightAt(player.position.x, player.position.z);
      }
    }

    // 坐姿 / 躺姿混合
    let sitTarget = 0;
    if (player.mode === 'sitting' || player.mode === 'sitIn') sitTarget = 1;
    else if (player.mode === 'ground' && player.activity === 'groundSit') sitTarget = 1;
    else if (player.mode === 'furnHere' && player.activity !== 'bedLie') sitTarget = 1;
    else if (player.mode === 'furnMove' && player.activity !== 'walk') sitTarget = 0.5;
    player.sitting += (sitTarget - player.sitting) * Math.min(1, dt * 9);

    const lieTarget =
      (player.activity === 'bedLie' && (player.mode === 'furnHere' || player.mode === 'furnMove')) ||
      (player.mode === 'ground' && player.activity === 'groundLie') ? 1 : 0;
    player.lying += (lieTarget - player.lying) * Math.min(1, dt * 9);

    // yaw 平滑（行走时朝向输入方向）
    if (player.mode === 'walk') {
      let yawDiff = targetYaw.current - player.yaw;
      yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
      player.yaw += yawDiff * Math.min(1, dt * 12);
    }

    // 接近检测
    const bedA = FURNITURE.bed.approach;
    player.nearBed =
      player.activity === 'walk' &&
      dist2(player.position.x, player.position.z, bedA.x, bedA.z) < bedA.radius * bedA.radius;
    const chA = FURNITURE.chair.approach;
    player.nearChair =
      player.activity === 'walk' &&
      dist2(player.position.x, player.position.z, chA.x, chA.z) < chA.radius * chA.radius;
    player.nearComputer = player.activity === 'chair';

    // 室内判定：房子 / 仓库（相机基座会随之切换）
    const inHouse = isInsideHouse(player.position.x, player.position.z);
    const inWarehouse = isInsideWarehouse(player.position.x, player.position.z);
    player.insideKind = inHouse ? 'house' : inWarehouse ? 'warehouse' : null;
    player.inside = !!player.insideKind;

    // 地块：空地也记录，手持种子时才能出现撒种按钮
    player.nearCrop = null;
    if (!player.inside && player.activity === 'walk' && player.mode === 'walk') {
      const crop = nearestCrop(player.position.x, player.position.z, 4.0);
      if (crop) {
        player.nearCrop = {
          id: crop.id,
          type: crop.type,
          stage: crop.stage,
          watered: crop.watered,
          name: crop.type === 'radish' ? '萝卜' : '白菜',
        };
      }
    }

    // 山野植物：进入范围后可采集 / 拍蘑菇 / 浇水
    player.nearPlant = null;
    if (!player.inside && player.activity === 'walk' && player.mode === 'walk') {
      const plant = nearestPlant(player.position.x, player.position.z, 5.7);
      if (plant) player.nearPlant = plantInfo(plant);
    }

    // 最近的兔子（投喂判定）与仓库箱子
    const rabbit = nearestRabbit(player.position.x, player.position.z, 5.2);
    player.nearRabbitId = rabbit ? rabbit.id : null;

    // 山地树木的砍伐判定
    const tree = nearestMountainTree(player.position.x, player.position.z, 4.2);
    player.nearTreeId = tree ? tree.id : null;

    player.nearChest = -1;
    if (inWarehouse) {
      CHESTS.forEach((chest, index) => {
        const dx = player.position.x - chest.approach.x;
        const dz = player.position.z - chest.approach.z;
        if (dx * dx + dz * dz < chest.approach.radius * chest.approach.radius) {
          player.nearChest = index;
        }
      });
    }

    const outD = dist2(player.position.x, player.position.z, DOOR.x, DOOR.z);
    const inD = dist2(player.position.x, player.position.z, DOOR.x, INTERIOR.maxZ);
    player.nearDoor =
      (!player.inside && outD < 4.0 * 4.0) || (player.inside && inD < 3.4 * 3.4);

    const wOutD = dist2(player.position.x, player.position.z, WAREHOUSE_DOOR.x, WAREHOUSE_DOOR.z);
    const wInD = dist2(
      player.position.x,
      player.position.z,
      WAREHOUSE_DOOR.x,
      WAREHOUSE_INTERIOR.maxZ
    );
    player.nearWarehouseDoor =
      (!inWarehouse && wOutD < 4.2 * 4.2) || (inWarehouse && wInD < 3.2 * 3.2);

    const seatX = player.position.x - swing.seat.x;
    const seatZ = player.position.z - swing.seat.z;
    player.nearSwing =
      player.activity === 'walk' &&
      player.mode === 'walk' &&
      seatX * seatX + seatZ * seatZ < 3.8 * 3.8;

    // 田埂围栏门：站在门口附近就能开关
    const gateD = dist2(player.position.x, player.position.z, FARM.gate.x, FARM.gate.z);
    player.nearGate = player.activity === 'walk' && gateD < 5.2 * 5.2;

    // 模型变换
    if (group.current) {
      group.current.position.copy(player.position);
      group.current.rotation.y = player.yaw;
      if (player.lying > 0.01) {
        group.current.rotation.x = THREE.MathUtils.lerp(0, -1.5, player.lying);
      } else {
        group.current.rotation.x = seated ? player.sitting * swing.angle * 0.28 : 0;
      }
    }

    if (shadow.current) {
      shadow.current.position.x = player.position.x;
      shadow.current.position.z = player.position.z;
      const scale = 1 - Math.min(player.jumpHeight * 0.35, 0.4);
      shadow.current.scale.setScalar(scale);
      shadow.current.material.opacity = 0.34 * scale;
      shadow.current.visible = !player.swimming;
    }
  });

  return (
    <>
      <group ref={group} name="girl" position={[SPAWN.x, HIP_HEIGHT, SPAWN.z]} scale={PLAYER_SCALE}>
        <Girl />
      </group>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[SPAWN.x, 0.07, SPAWN.z]}>
        <circleGeometry args={[0.68, 14]} />
        <meshBasicMaterial color="#241a2b" transparent opacity={0.34} depthWrite={false} />
      </mesh>
    </>
  );
}
