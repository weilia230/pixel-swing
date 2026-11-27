// 生存 / 田鼠 / 碎石的统一样片数值配置。
// 后续新增生物、物品、状态时，优先在这里扩展，避免把数字散落到组件里。

export const SURVIVAL = {
  max: 100,
  start: 80,

  // 饥饿
  hungerDayDrain: 0.08,
  hungerNightDrain: 0.12,
  hungerExertScale: 2, // 奔跑 / 战斗 / 砍伐时翻倍
  hungerSlowThreshold: 30,
  hungerSlowMul: 0.75,
  hungerHurtThreshold: 10,
  hungerHurtPerSec: 1.5,
  hungerEmptyPerSec: 3,

  // 寒冷
  coldRainDrain: 0.05,
  coldRainNightDrain: 0.2,
  coldHurtThreshold: 10,
  coldHurtPerSec: 1.5,
  coldEmptyPerSec: 2.5,

  // 生命恢复
  healHungerNeed: 60,
  healSleepNeed: 50,
  healPerSec: 1,

  // 体力
  staminaRunDrain: 2.2,
  staminaRegen: 1.1,

  // 睡眠：一个昼夜周期缓慢下降
  sleepDrainPerSec: 0.02, // 漏夜时再乘 1.5
  sleepLowThreshold: 30,

  // 死亡结算
  respawnDelay: 1.5,
  respawnValues: 40,
};

export const MOLE = {
  count: 2,
  maxHp: 40,
  patrolSpeed: 1.5,
  raidSpeed: 2.5,
  attackDamage: 10,
  tamedDamage: 4,
  attackCooldown: 1.0,
  attackRange: 1.8,
  lungeRange: 2.2,
  windup: 0.45,
  knockback: 1.0,
  followDistance: 1.5,
  feedRange: 2.6,
  feedNeed: 6,
  feedResetSeconds: 10,
  heartSeconds: 3,
  guardRange: 4.0,
  // 样片里田鼠活动的小片区域（出生点前方草地）
  zone: { minX: -9, maxX: 11, minZ: 2.0, maxZ: 13 },
};

export const STONE = {
  stackLimit: 60,
  pickRange: 3.0,
  bob: 0.045,
};

// 样片：出生点附近散落的一小片碎石
export const STONE_SPOTS = [
  { x: -4.2, z: 4.6 },
  { x: -2.1, z: 2.6 },
  { x: 2.4, z: 3.2 },
  { x: 4.6, z: 5.4 },
  { x: 1.1, z: 7.4 },
  { x: -5.6, z: 8.0 },
  { x: 6.2, z: 9.2 },
  { x: -1.0, z: 10.6 },
];
