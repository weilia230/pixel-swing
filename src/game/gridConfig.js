// 全场景统一网格配置：只在这里定义一次，地形 / 草 / 树 / 水 / 洞穴 / 掉落物都从这里取值。
// 一格 3 世界单位，对应 32×32 像素贴图，1 美术像素 ≈ 0.094 世界单位。
export const TILE_SIZE = 3;
export const TILE_PIXELS = 32;
export const PIXEL_UNIT = TILE_SIZE / TILE_PIXELS;

export function tileIndex(value) {
  return Math.floor(value / TILE_SIZE);
}

export function snapTile(value) {
  return Math.floor(value / TILE_SIZE) * TILE_SIZE;
}

export function tileCenter(index) {
  return (index + 0.5) * TILE_SIZE;
}

export function snapToTileCenter(value) {
  return tileCenter(tileIndex(value));
}
