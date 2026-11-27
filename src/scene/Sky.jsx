import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../utils/random';
import { worldTime } from '../game/time';

// 整圈天空贴图：横向 360° 环绕，纵向是从天顶到地平线的渐变
// 三张天空（白天 / 黄昏 / 黑夜）叠在一起，按世界时间交叉淡入淡出
const TEXTURE_W = 2560;
const TEXTURE_H = 160;
const SKY_RADIUS = 330;

const SKY_STOPS = {
  sunset: [
    [0.0, '#ffd28c'],
    [0.04, '#ffb664'],
    [0.1, '#f9915c'],
    [0.18, '#e06a68'],
    [0.28, '#c04f6e'],
    [0.4, '#8e3b67'],
    [0.55, '#65305a'],
    [0.75, '#472449'],
    [1.0, '#2d1933'],
  ],
  day: [
    [0.0, '#8ec7e6'],
    [0.08, '#a6d8ee'],
    [0.22, '#c3e6f3'],
    [0.42, '#dff1f4'],
    [0.6, '#f2f3e4'],
    [0.76, '#ffeecb'],
    [1.0, '#ffe0b0'],
  ],
  night: [
    [0.0, '#131a33'],
    [0.12, '#1a2240'],
    [0.3, '#222b4c'],
    [0.5, '#2b3355'],
    [0.68, '#303a5c'],
    [0.84, '#2a3050'],
    [1.0, '#1d2138'],
  ],
};

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const STOP_RGB = {
  sunset: SKY_STOPS.sunset.map(([pos, hex]) => [pos, hexToRgb(hex)]),
  day: SKY_STOPS.day.map(([pos, hex]) => [pos, hexToRgb(hex)]),
  night: SKY_STOPS.night.map(([pos, hex]) => [pos, hexToRgb(hex)]),
};

function skyColorAt(variant, t) {
  const stops = STOP_RGB[variant];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (t >= p0 && t <= p1) {
      const k = (t - p0) / Math.max(p1 - p0, 0.0001);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

const CLOUD_PALETTES = {
  sunset: {
    high: { rim: '#f6c6cb', body: '#c07a95', shade: '#844a6c', pale: '#ffe6ec' },
    mid: { rim: '#ffd9cb', body: '#e0949f', shade: '#9c5876', pale: '#fff0e2' },
    low: { rim: '#ffe1c4', body: '#e89d90', shade: '#a96072', pale: '#fff4d8' },
  },
  day: {
    high: { rim: '#ffffff', body: '#f3f6f8', shade: '#c8d7e2', pale: '#ffffff' },
    mid: { rim: '#fffaf0', body: '#f7f1e6', shade: '#d4d6d0', pale: '#ffffff' },
    low: { rim: '#fff4dc', body: '#f0e5cf', shade: '#cbb9a4', pale: '#fffaf0' },
  },
  night: {
    high: { rim: '#3b4468', body: '#2f3757', shade: '#242b47', pale: '#4a5478' },
    mid: { rim: '#38415f', body: '#2c3452', shade: '#222944', pale: '#434c6d' },
    low: { rim: '#333b58', body: '#29304b', shade: '#1f253c', pale: '#3d4664' },
  },
};

// 方块像素云：阶梯状轮廓 + 亮边 + 暗底
function drawCloud(ctx, cx, cy, width, height, random, tones) {
  const grid = 2;
  const baseY = cy - height / 2;
  const rows = [
    [0.36, 0.0, 0.27],
    [0.64, 0.2, 0.32],
    [1.0, 0.47, 0.32],
    [0.84, 0.77, 0.23],
  ];
  const rects = rows.map(([w, dy, h]) => {
    const rw = Math.max(grid, Math.round((width * w) / grid) * grid);
    const rh = Math.max(grid, Math.round((height * h) / grid) * grid);
    return {
      x: Math.round((cx - rw / 2) / grid) * grid,
      y: Math.round((baseY + height * dy) / grid) * grid,
      w: rw,
      h: rh,
    };
  });

  const bumps = 1 + Math.floor(random() * 3);
  for (let i = 0; i < bumps; i += 1) {
    const bw = Math.max(grid, Math.round((width * (0.16 + random() * 0.22)) / grid) * grid);
    const bh = Math.max(grid, Math.round((height * (0.16 + random() * 0.14)) / grid) * grid);
    rects.push({
      x: Math.round((cx + (random() - 0.5) * width * 0.62 - bw / 2) / grid) * grid,
      y: Math.round((baseY - random() * height * 0.32) / grid) * grid,
      w: bw,
      h: bh,
    });
  }

  const paint = (color, offsetX, offsetY) => {
    ctx.fillStyle = color;
    rects.forEach((rect) => ctx.fillRect(rect.x + offsetX, rect.y + offsetY, rect.w, rect.h));
  };

  paint(tones.shade, 3, 3);
  paint(tones.rim, -1, -1);
  paint(tones.body, 0, 0);

  ctx.fillStyle = tones.pale;
  rects.slice(0, 2).forEach((rect) => ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, 2));

  ctx.fillStyle = tones.shade;
  const bottom = rects[2];
  ctx.fillRect(bottom.x + 2, bottom.y + bottom.h - 2, bottom.w - 4, 2);
}

function drawSun(ctx, sunX, sunY, night) {
  if (night) {
    // 月亮 + 月晕
    for (let radius = 26; radius > 6; radius -= 2) {
      ctx.globalAlpha = 0.04 + (26 - radius) * 0.006;
      ctx.fillStyle = '#cfd8ff';
      ctx.beginPath();
      ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#eef1ff';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 7.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9d1ee';
    ctx.beginPath();
    ctx.arc(sunX - 2, sunY + 1.5, 6.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6f8ff';
    ctx.beginPath();
    ctx.arc(sunX + 1.2, sunY - 1.6, 6.0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let radius = 30; radius > 6; radius -= 2) {
    ctx.globalAlpha = 0.05 + (30 - radius) * 0.005;
    ctx.fillStyle = '#ffbf72';
    ctx.beginPath();
    ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffe7a6';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff6cf';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 5, 0, Math.PI * 2);
  ctx.fill();
}

function createSkyTexture(variant) {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_W;
  canvas.height = TEXTURE_H;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < TEXTURE_H; y += 1) {
    const t = 1 - y / TEXTURE_H;
    const quantized = Math.round(t * 46) / 46;
    const [r, g, b] = skyColorAt(variant, quantized);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, y, TEXTURE_W, 1);
  }

  // 圆筒的 u = 0.5 正对北方（湖面）
  const sunX = TEXTURE_W * 0.5;
  const sunY = variant === 'night' ? 26 : TEXTURE_H * 0.795;

  drawSun(ctx, sunX, sunY, variant === 'night');

  const random = mulberry32(77);

  if (variant === 'night') {
    // 星星：只落在天空上半部分，避免和湖面倒影混在一起
    for (let i = 0; i < 300; i += 1) {
      const x = Math.floor(random() * TEXTURE_W);
      const y = Math.floor(random() * 78);
      const bright = random();
      ctx.fillStyle = bright > 0.82 ? '#ffffff' : bright > 0.5 ? '#cfd8ff' : '#8f9dc7';
      const size = bright > 0.92 ? 2 : 1;
      ctx.fillRect(x, y, size, size);
    }
  }

  const cloudBands = [
    { y: 14, tone: 'high', count: 6, h: 17 },
    { y: 52, tone: 'mid', count: 6, h: 12 },
    { y: 82, tone: 'low', count: 6, h: 9 },
  ];
  const palettes = CLOUD_PALETTES[variant];
  cloudBands.forEach(({ y, tone, count, h }) => {
    for (let i = 0; i < count; i += 1) {
      const slot = TEXTURE_W / count;
      const cx = Math.round(slot * (i + 0.5) + (random() - 0.5) * slot * 0.5);
      const w = 56 + random() * 62;
      drawCloud(ctx, cx, y + (random() - 0.5) * 8, w, h + random() * 4, random, palettes[tone]);
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function SkyLayer({ texture, renderOrder, layerRef }) {
  return (
    <mesh position={[0, 90, 0]} renderOrder={renderOrder}>
      <cylinderGeometry args={[SKY_RADIUS, SKY_RADIUS, 300, 64, 1, true]} />
      <meshBasicMaterial
        ref={layerRef}
        map={texture}
        side={THREE.BackSide}
        depthWrite={false}
        transparent
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}

export default function Sky() {
  const group = useRef();
  const { camera } = useThree();
  const textures = useMemo(
    () => ({
      day: createSkyTexture('day'),
      sunset: createSkyTexture('sunset'),
      night: createSkyTexture('night'),
    }),
    []
  );
  const dayRef = useRef();
  const duskRef = useRef();
  const nightRef = useRef();

  useFrame(() => {
    // 天空圆筒跟随相机，地图扩大到五十倍后仍能覆盖任何位置
    if (group.current) {
      group.current.position.x = camera.position.x;
      group.current.position.z = camera.position.z;
    }
    const { daylight, night } = worldTime;
    const dusk = Math.max(worldTime.dusk, worldTime.dawn);
    // 黄昏/黎明叠一层暖色，白天保留一点晚霞氛围
    const duskAmount = Math.min(1, dusk * 0.95 + daylight * 0.1);
    if (dayRef.current) dayRef.current.opacity = Math.min(1, daylight * 0.95);
    if (nightRef.current) nightRef.current.opacity = Math.min(1, night * 0.97);
    if (duskRef.current) duskRef.current.opacity = duskAmount;
  });

  return (
    // 三层圆筒天空交叉淡入淡出，任何角度旋转都不会出现接缝
    <group ref={group}>
      <SkyLayer texture={textures.night} renderOrder={-14} layerRef={nightRef} />
      <SkyLayer texture={textures.day} renderOrder={-13} layerRef={dayRef} />
      <SkyLayer texture={textures.sunset} renderOrder={-12} layerRef={duskRef} />
    </group>
  );
}
