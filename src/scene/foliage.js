import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../utils/random';

// 两片交叉的透明像素叶片，比实心圆锥更接近真实草簇，也更省三角形。
export function createCrossedFoliageGeometry() {
  const positions = [
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
    0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5,
  ];
  const uvs = [
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeVertexNormals();
  return geometry;
}

function drawBlade(ctx, random, baseX, baseY, height, width, drift, colors) {
  const steps = Math.ceil(height / 2);
  for (let step = 0; step < steps; step += 1) {
    const y = step * 2;
    const t = y / height;
    const x = Math.round(baseX + drift * t * t + Math.sin(t * 4.2) * 0.7);
    const bladeWidth = t > 0.82 ? 1 : width;
    ctx.fillStyle = colors[Math.min(colors.length - 1, Math.floor(t * colors.length))];
    ctx.fillRect(x, baseY - y, bladeWidth, 2);
    if (step % 3 === 0 && t < 0.8) {
      ctx.fillStyle = colors[colors.length - 1];
      ctx.fillRect(x + bladeWidth, baseY - y, 1, 1);
    }
  }
}

function drawGrass(ctx, random, reed) {
  if (reed) {
    // 湖边芦苇：保留成丛的高秆和穗子
    const colors = ['#35552a', '#4e7334', '#6f9445', '#9bb85d'];
    for (let i = 0; i < 8; i += 1) {
      const baseX = 8 + random() * 32;
      const height = 29 + random() * 17;
      const width = random() > 0.62 ? 3 : 2;
      const drift = (random() - 0.5) * 8;
      drawBlade(ctx, random, baseX, 47, height, width, drift, colors);
      if (i % 3 === 0) {
        const tipX = Math.round(baseX + drift);
        const tipY = Math.round(47 - height);
        ctx.fillStyle = '#66502d';
        ctx.fillRect(tipX, tipY, 2, 6);
        ctx.fillStyle = '#9b7b43';
        ctx.fillRect(tipX, tipY, 2, 1);
      }
    }
    for (let i = 0; i < 10; i += 1) {
      const x = Math.floor(5 + random() * 35);
      const y = Math.floor(33 + random() * 13);
      const leafWidth = 3 + Math.floor(random() * 6);
      ctx.fillStyle = colors[1 + Math.floor(random() * 2)];
      ctx.fillRect(x, y, leafWidth, 2);
      ctx.fillRect(x + (random() > 0.5 ? 1 : -2), y - 2, 2 + Math.floor(random() * 4), 2);
      if (random() > 0.42) ctx.fillRect(x + leafWidth - 2, y - 4, 2, 3);
    }
    return;
  }

  // 草地上的小草：等宽方头的像素彩带，上下一样宽，不再收尖
  const colors = ['#2e3d2a', '#34442f', '#3a4a33'];
  const count = 5 + Math.floor(random() * 3);
  for (let i = 0; i < count; i += 1) {
    const x = Math.round(4 + i * 7 + random() * 2);
    const width = 2 + Math.floor(random() * 2);
    const height = 20 + Math.floor(random() * 16);
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    ctx.fillRect(x, 47 - height, width, height);
    // 方头顶端一条极淡的亮色
    ctx.fillStyle = '#41533a';
    ctx.fillRect(x, 47 - height, width, 1);
  }
}

function drawFern(ctx, random) {
  const tones = ['#294d29', '#3c6b32', '#5b8b40', '#83a94e'];
  for (let frond = 0; frond < 7; frond += 1) {
    const angle = -Math.PI * 0.88 + (frond / 6) * Math.PI * 0.76;
    const length = 22 + random() * 19;
    const baseX = 24 + (random() - 0.5) * 5;
    const baseY = 47;
    for (let step = 0; step < 10; step += 1) {
      const t = step / 9;
      const x = Math.round(baseX + Math.cos(angle) * length * t);
      const y = Math.round(baseY + Math.sin(angle) * length * t - Math.sin(t * Math.PI) * 6);
      const leafSize = Math.max(2, Math.round((1 - t * 0.7) * 6));
      ctx.fillStyle = tones[Math.min(3, Math.floor(t * 4))];
      ctx.fillRect(x, y, 2, 3);
      ctx.fillRect(x - leafSize, y - 1, leafSize, 2);
      ctx.fillRect(x + 2, y - 3, leafSize, 2);
      if (step % 2 === 0) {
        ctx.fillStyle = '#91b65a';
        ctx.fillRect(x + 2, y - 3, Math.max(1, leafSize - 2), 1);
      }
    }
  }
}

export function createFoliageTexture(kind = 'grass') {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 48, 48);
  const random = mulberry32(kind === 'fern' ? 7813 : kind === 'reed' ? 9927 : 4421);
  if (kind === 'fern') drawFern(ctx, random);
  else drawGrass(ctx, random, kind === 'reed');

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 针叶树的每一层都由错位的扁平枝块构成，轮廓不再是规则圆锥。
export function createPineBoughGeometry() {
  const parts = [
    { size: [1.95, 0.25, 1.2], pos: [-0.08, -0.36, 0.04] },
    { size: [1.18, 0.25, 1.9], pos: [0.1, -0.28, -0.08] },
    { size: [1.52, 0.28, 1.35], pos: [-0.13, -0.06, 0.1] },
    { size: [0.98, 0.3, 1.12], pos: [0.1, 0.2, -0.08] },
    { size: [0.55, 0.24, 0.64], pos: [-0.04, 0.44, 0.02] },
  ];
  const geometries = parts.map(({ size, pos }) => {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.translate(...pos);
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}
