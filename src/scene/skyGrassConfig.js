import { SAKURA } from '../game/terrain';

// 光遇风草地样片：只恢复出生点旁原先确认的一小块
export const SKY_GRASS_SAMPLE = {
  x: 2,
  z: 8.5,
  radius: 5.6,
};

export function isInSkySample(x, z, pad = 0) {
  return Math.hypot(x - SKY_GRASS_SAMPLE.x, z - SKY_GRASS_SAMPLE.z) < SKY_GRASS_SAMPLE.radius + pad;
}

// 小樱的樱花树：密草覆盖整棵主树与小樱家，再向外平滑融入疏草。
export const SAKURA_GRASS = {
  x: SAKURA.x,
  z: SAKURA.z,
  denseRadius: 40,
  transitionRadius: 88,
};

function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function skyGrassDensity(x, z) {
  // 低频扰动打散圆环轮廓，宽过渡带使用五次平滑曲线，两端没有突变。
  const edgeNoise = (
    Math.sin(x * 0.073 + z * 0.041) +
    Math.sin(x * 0.031 - z * 0.089 + 1.7)
  ) * 2.4;
  const distance = Math.hypot(x - SAKURA_GRASS.x, z - SAKURA_GRASS.z) + edgeNoise;
  if (distance <= SAKURA_GRASS.denseRadius) return 1;
  if (distance >= SAKURA_GRASS.transitionRadius) return 0;
  const t = (distance - SAKURA_GRASS.denseRadius) / (SAKURA_GRASS.transitionRadius - SAKURA_GRASS.denseRadius);
  return 1 - smootherstep(t);
}

// 保留已确认的住宅草地基底：小樱家、仓库与附近三组邻居住宅。
export const HOME_GRASS_REGION = {
  minX: -140,
  maxX: 205,
  minZ: 2.2,
  maxZ: 250,
};

export const HOME_GRASS_FADE = 36;
export const HOME_GRASS_OUTER_REGION = {
  minX: HOME_GRASS_REGION.minX - HOME_GRASS_FADE - 6,
  maxX: HOME_GRASS_REGION.maxX + HOME_GRASS_FADE + 6,
  minZ: HOME_GRASS_REGION.minZ - HOME_GRASS_FADE - 6,
  maxZ: HOME_GRASS_REGION.maxZ + HOME_GRASS_FADE + 6,
};

export function isInHomeGrass(x, z, pad = 0) {
  return (
    x > HOME_GRASS_OUTER_REGION.minX - pad &&
    x < HOME_GRASS_OUTER_REGION.maxX + pad &&
    z > HOME_GRASS_OUTER_REGION.minZ - pad &&
    z < HOME_GRASS_OUTER_REGION.maxZ + pad
  );
}

// 原住宅范围内保持已确认的密度，外围 36U 逐渐融入旧草地与裸土。
export function homeGrassDensity(x, z) {
  const dx = Math.max(HOME_GRASS_REGION.minX - x, 0, x - HOME_GRASS_REGION.maxX);
  const dz = Math.max(HOME_GRASS_REGION.minZ - z, 0, z - HOME_GRASS_REGION.maxZ);
  const distance = Math.hypot(dx, dz);
  if (distance <= 0) return 1;
  if (distance >= HOME_GRASS_FADE + 6) return 0;
  const noise = (
    Math.sin(x * 0.052 + z * 0.067) +
    Math.sin(x * 0.091 - z * 0.036 + 0.8)
  ) * 1.5;
  const t = Math.max(0, Math.min(1, (distance + noise) / HOME_GRASS_FADE));
  return 1 - smootherstep(t);
}
