import { bubble, HIP_HEIGHT, player, SPAWN } from './runtime';
import { weather, worldTime } from './time';
import { SURVIVAL } from './survivalConfig';

// 五项生存指标：HP / 饥饿 / 寒冷 / 体力 / 睡眠
export const survival = {
  hp: SURVIVAL.start,
  hunger: SURVIVAL.start,
  cold: SURVIVAL.start,
  stamina: SURVIVAL.start,
  sleep: SURVIVAL.start,
  downTimer: 0, // 倒地读条，>0 时忽略后续伤害
  downedAt: 0,
  hurtAt: 0, // 最近一次受伤时间，供屏幕边缘红闪
  cause: '',
};

function clamp01to100(value) {
  return Math.max(0, Math.min(SURVIVAL.max, value));
}

export function isDowned() {
  return survival.downTimer > 0;
}

// 统一扣血入口：田鼠等生物只调用这里，不直接改数值
export function damagePlayer(amount, cause = '') {
  if (survival.downTimer > 0 || amount <= 0) return;
  survival.hp = clamp01to100(survival.hp - amount);
  survival.hurtAt = performance.now();
  survival.cause = cause;
}

export function healPlayer(amount) {
  survival.hp = clamp01to100(survival.hp + amount);
}

function respawn() {
  survival.hp = SURVIVAL.respawnValues;
  survival.hunger = SURVIVAL.respawnValues;
  survival.cold = SURVIVAL.respawnValues;
  survival.stamina = SURVIVAL.respawnValues;
  survival.sleep = Math.max(survival.sleep, 30);
  survival.downTimer = 0;
  survival.downedAt = 0;
  if (player.mode === 'walk') {
    player.position.set(SPAWN.x, HIP_HEIGHT, SPAWN.z);
  }
  bubble.text = '眼前一黑…回到出生点了';
  bubble.until = performance.now() + 3200;
}

export function updateSurvival(delta) {
  const dt = Math.min(delta, 0.1);

  if (survival.downTimer > 0) {
    survival.downTimer -= dt;
    if (survival.downTimer <= 0) respawn();
    return;
  }

  const night = worldTime.phase === 'night';
  const exerting = (player.speed || 0) > 8;

  // 饥饿：白天 / 夜晚不同基础消耗，跑动时翻倍
  const hungerRate = (night ? SURVIVAL.hungerNightDrain : SURVIVAL.hungerDayDrain)
    * (exerting ? SURVIVAL.hungerExertScale : 1);
  survival.hunger = clamp01to100(survival.hunger - hungerRate * dt);

  // 寒冷：雨天 / 雨夜，夜间再略快一点
  let coldRate = 0;
  if (weather.raining) coldRate += night ? SURVIVAL.coldRainNightDrain : SURVIVAL.coldRainDrain;
  else if (night) coldRate += 0.02;
  survival.cold = clamp01to100(survival.cold - coldRate * dt);

  // 体力：跑动消耗，静止 / 步行缓慢恢复
  if (exerting) survival.stamina = clamp01to100(survival.stamina - SURVIVAL.staminaRunDrain * dt);
  else survival.stamina = clamp01to100(survival.stamina + SURVIVAL.staminaRegen * dt);

  // 睡眠：随昼夜缓慢下降，夜里更快
  survival.sleep = clamp01to100(
    survival.sleep - SURVIVAL.sleepDrainPerSec * (night ? 1.5 : 1) * dt
  );

  // 低饥饿 / 低寒冷时体力上限被压到 85
  const exhausted = survival.hunger <= SURVIVAL.hungerSlowThreshold || survival.cold <= 30;
  if (exhausted && survival.stamina > 85) survival.stamina = Math.max(85, survival.stamina - dt * 3);

  // 生命：饱食 + 睡眠足时才缓慢恢复
  if (survival.hunger >= SURVIVAL.healHungerNeed && survival.sleep >= SURVIVAL.healSleepNeed) {
    survival.hp = clamp01to100(survival.hp + SURVIVAL.healPerSec * dt);
  }

  // 持续透支扣血，多项同时过低会叠加
  let drain = 0;
  if (survival.hunger <= 0) drain += SURVIVAL.hungerEmptyPerSec;
  else if (survival.hunger <= SURVIVAL.hungerHurtThreshold) drain += SURVIVAL.hungerHurtPerSec;

  if (survival.cold <= 0) drain += SURVIVAL.coldEmptyPerSec;
  else if (survival.cold <= SURVIVAL.coldHurtThreshold) drain += SURVIVAL.coldHurtPerSec;

  if (drain > 0) {
    survival.hp = clamp01to100(survival.hp - drain * dt);
    survival.hurtAt = performance.now();
  }

  // 饥饿过低会拖慢脚步（只改速度倍率，不动原有移动逻辑）
  player.speedScale = survival.hunger <= SURVIVAL.hungerSlowThreshold ? SURVIVAL.hungerSlowMul : 1;

  if (survival.hp <= 0) {
    survival.downTimer = SURVIVAL.respawnDelay;
    survival.downedAt = performance.now();
    bubble.text = '撑不住了…';
    bubble.until = performance.now() + 1600;
  }
}

export function snapshotSurvival() {
  return {
    hp: survival.hp,
    hunger: survival.hunger,
    cold: survival.cold,
    stamina: survival.stamina,
    sleep: survival.sleep,
  };
}

export function restoreSurvival(saved = {}, fallback = {}) {
  const source = saved && typeof saved === 'object' ? saved : fallback;
  ['hp', 'hunger', 'cold', 'stamina', 'sleep'].forEach((key) => {
    const value = Number.isFinite(source?.[key]) ? source[key] : fallback[key];
    survival[key] = Number.isFinite(value) ? clamp01to100(value) : SURVIVAL.start;
  });
  survival.downTimer = 0;
  survival.downedAt = 0;
  survival.hurtAt = 0;
  survival.cause = '';
}
