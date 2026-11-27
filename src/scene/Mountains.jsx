import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../utils/random';
import {
  HILLS,
  MOUNTAIN_CELL,
  RING,
  STREAM_ROUTES,
  heightAt,
  isInsideBuilding,
  mountainLayersAt,
  ringHeightAt,
} from '../game/terrain';
import { makeGrassTileTexture } from './MountainWorld';

const TOP_GRASS = ['#596d43', '#64754a', '#6f7c52', '#727a55', '#7c8060'].map((c) => new THREE.Color(c));
const TOP_ROCK = ['#77776c', '#858376', '#8f8b7b', '#747268'].map((c) => new THREE.Color(c));
const SIDE_ROCK = ['#625c50', '#6c6456', '#756b5b', '#5b574d', '#7a7160'].map((c) => new THREE.Color(c));
// 远山与脚下山地同一套草色：山麓深绿 → 山腰中绿 → 峰顶浅雾绿（无紫色）
const RING_GRASS_LOW = ['#556a40', '#5e7347', '#677b4d', '#4d6339'].map((c) => new THREE.Color(c));
const RING_GRASS_MID = ['#647a4b', '#6f8754', '#7a905d', '#5d7446'].map((c) => new THREE.Color(c));
const RING_GRASS_HIGH = ['#84957a', '#8fa083', '#9aa98e', '#7c8d73'].map((c) => new THREE.Color(c));
const RING_FOG = new THREE.Color('#aebfa3');
const RING_STEP = 20;
const CELL = MOUNTAIN_CELL;

function hillStrength(x, z, hill) {
  const distance = Math.hypot(x - hill.x, z - hill.z);
  if (distance >= hill.radius) return 0;
  const t = 1 - distance / hill.radius;
  return hill.height * t * t * (3 - 2 * t);
}

function ownerAt(x, z) {
  let owner = -1;
  let strongest = 0;
  for (let i = 0; i < HILLS.length; i += 1) {
    const strength = hillStrength(x, z, HILLS[i]);
    if (strength > strongest) {
      strongest = strength;
      owner = i;
    }
  }
  return owner;
}

function hash(ix, iz, layer) {
  const value = Math.sin(ix * 12.9898 + iz * 78.233 + layer * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function blockColor(ix, iz, layer, top) {
  const variation = hash(ix, iz, layer);
  const palette = top
    ? layer * CELL > 28 && variation > 0.38 ? TOP_ROCK : TOP_GRASS
    : SIDE_ROCK;
  return palette[Math.floor(variation * palette.length) % palette.length];
}

// 每个可见方格都来自一个 2.6U 立方体；只剔除被相邻体素挡住的面。
function buildMountainGeometry(index) {
  const hill = HILLS[index];
  const columns = [];
  let quadCount = 0;
  const minIX = Math.floor((hill.x - hill.radius) / CELL);
  const maxIX = Math.ceil((hill.x + hill.radius) / CELL);
  const minIZ = Math.floor((hill.z - hill.radius) / CELL);
  const maxIZ = Math.ceil((hill.z + hill.radius) / CELL);

  for (let ix = minIX; ix <= maxIX; ix += 1) {
    const x = (ix + 0.5) * CELL;
    for (let iz = minIZ; iz <= maxIZ; iz += 1) {
      const z = (iz + 0.5) * CELL;
      if (ownerAt(x, z) !== index) continue;
      const layers = mountainLayersAt(x, z);
      if (layers <= 0) continue;
      const px = layers - mountainLayersAt(x + CELL, z);
      const nx = layers - mountainLayersAt(x - CELL, z);
      const pz = layers - mountainLayersAt(x, z + CELL);
      const nz = layers - mountainLayersAt(x, z - CELL);
      const sides = [Math.max(0, px), Math.max(0, nx), Math.max(0, pz), Math.max(0, nz)];
      quadCount += 1 + sides[0] + sides[1] + sides[2] + sides[3];
      columns.push({ ix, iz, x, z, layers, sides });
    }
  }

  const positions = new Float32Array(quadCount * 12);
  const normals = new Float32Array(quadCount * 12);
  const colors = new Float32Array(quadCount * 12);
  const indices = new Uint32Array(quadCount * 6);
  let vertexCursor = 0;
  let quadCursor = 0;

  const vertex = (x, y, z, nx, ny, nz, color) => {
    const offset = vertexCursor * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    normals[offset] = nx;
    normals[offset + 1] = ny;
    normals[offset + 2] = nz;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
    vertexCursor += 1;
  };

  const quad = (
    a, b, c, d,
    nx, ny, nz,
    color
  ) => {
    vertex(a[0], a[1], a[2], nx, ny, nz, color);
    vertex(b[0], b[1], b[2], nx, ny, nz, color);
    vertex(c[0], c[1], c[2], nx, ny, nz, color);
    vertex(d[0], d[1], d[2], nx, ny, nz, color);
    const base = quadCursor * 4;
    const offset = quadCursor * 6;
    indices[offset] = base;
    indices[offset + 1] = base + 1;
    indices[offset + 2] = base + 2;
    indices[offset + 3] = base;
    indices[offset + 4] = base + 2;
    indices[offset + 5] = base + 3;
    quadCursor += 1;
  };

  columns.forEach(({ ix, iz, x, z, layers, sides }) => {
    const x0 = x - CELL / 2;
    const x1 = x + CELL / 2;
    const z0 = z - CELL / 2;
    const z1 = z + CELL / 2;
    const top = layers * CELL;
    quad(
      [x0, top, z0], [x0, top, z1], [x1, top, z1], [x1, top, z0],
      0, 1, 0,
      blockColor(ix, iz, layers, true)
    );

    for (let direction = 0; direction < 4; direction += 1) {
      const start = layers - sides[direction];
      for (let layer = start; layer < layers; layer += 1) {
        const y0 = layer * CELL;
        const y1 = y0 + CELL;
        const color = blockColor(ix, iz, layer, false);
        if (direction === 0) {
          quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], 1, 0, 0, color);
        } else if (direction === 1) {
          quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], -1, 0, 0, color);
        } else if (direction === 2) {
          quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], 0, 0, 1, color);
        } else {
          quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], 0, 0, -1, color);
        }
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function ringVertexColor(x, z, height, color) {
  const variation = hash(x * 0.37, z * 0.41, height * 0.013);
  const palette = height < 26 ? RING_GRASS_LOW : height < 95 ? RING_GRASS_MID : RING_GRASS_HIGH;
  color.copy(palette[Math.floor(variation * palette.length) % palette.length]);
  // 空气透视：越高越淡，远山轮廓与天空自然衔接
  color.lerp(RING_FOG, Math.min(0.42, height / 620));
  return color;
}

// 外围环山与脚下山地采用同一套标准：连续高度场顶面 + 海拔草色 + 草地贴图，
// 不再堆体素方块，因此不会出现紫色方块墙，坡面也能连续起伏。
function buildRingGeometry() {
  const outerMinX = RING.inner.minX - RING.width;
  const outerMaxX = RING.inner.maxX + RING.width;
  const outerMinZ = RING.inner.minZ - RING.width;
  const outerMaxZ = RING.inner.maxZ + RING.width;
  const nx = Math.ceil((outerMaxX - outerMinX) / RING_STEP);
  const nz = Math.ceil((outerMaxZ - outerMinZ) / RING_STEP);
  const stride = nx + 1;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const heights = new Float32Array(stride * (nz + 1));
  const color = new THREE.Color();

  for (let iz = 0; iz <= nz; iz += 1) {
    const z = outerMinZ + iz * RING_STEP;
    for (let ix = 0; ix <= nx; ix += 1) {
      const x = outerMinX + ix * RING_STEP;
      const height = ringHeightAt(x, z);
      heights[iz * stride + ix] = height;
      positions.push(x, height, z);
      ringVertexColor(x, z, height, color);
      colors.push(color.r, color.g, color.b);
      uvs.push(x / 12, z / 12);
    }
  }

  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const a = iz * stride + ix;
      if (
        heights[a] <= 0 &&
        heights[a + 1] <= 0 &&
        heights[a + stride] <= 0 &&
        heights[a + stride + 1] <= 0
      ) {
        continue;
      }
      indices.push(a, a + stride + 1, a + 1, a, a + stride, a + stride + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// 环山上的成片树林：铺满整条山带（含朝向地图内侧的坡面），
// 这样从湖边和山脚望过去，远处的山林不会只剩光秃秃的山脊。
function buildRingForest() {
  const random = mulberry32(44711);
  const trees = [];
  const spanX = RING.inner.maxX - RING.inner.minX;
  const spanZ = RING.inner.maxZ - RING.inner.minZ;
  const clusters = 430;

  for (let c = 0; c < clusters; c += 1) {
    const side = Math.floor(random() * 4);
    // 允许一小段落在内圈平地上，形成从平地到山脚的连续林带
    const d = RING.width * (-0.14 + random() * 1.12);
    const t = random();
    let cx;
    let cz;
    if (side === 0) {
      cx = RING.inner.minX - d;
      cz = RING.inner.minZ + t * spanZ;
    } else if (side === 1) {
      cx = RING.inner.maxX + d;
      cz = RING.inner.minZ + t * spanZ;
    } else if (side === 2) {
      cx = RING.inner.minX + t * spanX;
      cz = RING.inner.minZ - d;
    } else {
      cx = RING.inner.minX + t * spanX;
      cz = RING.inner.maxZ + d;
    }

    const count = 9 + Math.floor(random() * 10);
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 26;
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      const h = ringHeightAt(x, z);
      if (h < -0.5 || h > 360) continue;
      if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 6.6)) continue;
      const height = 20 + random() * 24;
      trees.push({
        x,
        z,
        y: heightAt(x, z),
        height,
        width: height * (0.32 + random() * 0.14),
        rot: random() * Math.PI * 2,
        shade: Math.floor(random() * 4),
      });
    }
  }
  return trees;
}

// 环山灌木与地被：贴在内侧坡面上，补足树木之间的绿色层次。
function buildRingBushes() {
  const random = mulberry32(63317);
  const bushes = [];
  const spanX = RING.inner.maxX - RING.inner.minX;
  const spanZ = RING.inner.maxZ - RING.inner.minZ;
  for (let i = 0; i < 2100; i += 1) {
    const side = Math.floor(random() * 4);
    const d = RING.width * (-0.16 + random() * 1.14);
    const t = random();
    let x;
    let z;
    if (side === 0) {
      x = RING.inner.minX - d;
      z = RING.inner.minZ + t * spanZ;
    } else if (side === 1) {
      x = RING.inner.maxX + d;
      z = RING.inner.minZ + t * spanZ;
    } else if (side === 2) {
      x = RING.inner.minX + t * spanX;
      z = RING.inner.minZ - d;
    } else {
      x = RING.inner.minX + t * spanX;
      z = RING.inner.maxZ + d;
    }
    x += (random() - 0.5) * 18;
    z += (random() - 0.5) * 18;
    const h = ringHeightAt(x, z);
    if (h < -0.5 || h > 300) continue;
    bushes.push({
      x,
      z,
      y: heightAt(x, z),
      size: 2.6 + random() * 4.2,
      rot: random() * Math.PI * 2,
      shade: Math.floor(random() * 3),
    });
  }
  return bushes;
}

const RING_TREE_GREENS = ['#4e6a40', '#587546', '#627f4c', '#46603a'].map((c) => new THREE.Color(c));

function RingForest({ trees }) {
  const trunk = useRef();
  const lower = useRef();
  const upper = useRef();

  useLayoutEffect(() => {
    if (!trunk.current || !lower.current || !upper.current) return;
    const dummy = new THREE.Object3D();
    trees.forEach((tree, index) => {
      const { x, y, z, height, width, rot, shade } = tree;
      dummy.rotation.set(0, rot, 0);

      dummy.position.set(x, y + height * 0.24, z);
      dummy.scale.set(width * 0.16, height * 0.48, width * 0.16);
      dummy.updateMatrix();
      trunk.current.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, y + height * 0.5, z);
      dummy.scale.set(width, height * 0.52, width);
      dummy.updateMatrix();
      lower.current.setMatrixAt(index, dummy.matrix);
      lower.current.setColorAt(index, RING_TREE_GREENS[shade]);

      dummy.position.set(x, y + height * 0.8, z);
      dummy.scale.set(width * 0.66, height * 0.4, width * 0.66);
      dummy.updateMatrix();
      upper.current.setMatrixAt(index, dummy.matrix);
      upper.current.setColorAt(index, RING_TREE_GREENS[(shade + 1) % RING_TREE_GREENS.length]);
    });
    [trunk, lower, upper].forEach((ref) => {
      if (!ref.current) return;
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    });
  }, [trees]);

  const count = Math.max(1, trees.length);
  return (
    <group name="ring-mountain-forest">
      <instancedMesh ref={trunk} args={[null, null, count]} frustumCulled={false} renderOrder={-9}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color="#59493a" transparent opacity={1} depthWrite flatShading />
      </instancedMesh>
      <instancedMesh ref={lower} args={[null, null, count]} frustumCulled={false} renderOrder={-9}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color="#ffffff" transparent opacity={1} depthWrite flatShading />
      </instancedMesh>
      <instancedMesh ref={upper} args={[null, null, count]} frustumCulled={false} renderOrder={-9}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color="#ffffff" transparent opacity={1} depthWrite flatShading />
      </instancedMesh>
    </group>
  );
}

const RING_BUSH_GREENS = ['#3f5733', '#48613a', '#526b40'].map((c) => new THREE.Color(c));

function RingBushes({ bushes }) {
  const mesh = useRef();

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    bushes.forEach((bush, index) => {
      dummy.position.set(bush.x, bush.y + bush.size * 0.32, bush.z);
      dummy.rotation.set(0, bush.rot, 0);
      dummy.scale.set(bush.size, bush.size * 0.7, bush.size);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
      mesh.current.setColorAt(index, RING_BUSH_GREENS[bush.shade]);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [bushes]);

  return (
    <instancedMesh
      ref={mesh}
      args={[null, null, Math.max(bushes.length, 1)]}
      frustumCulled={false}
      renderOrder={-9}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial color="#ffffff" transparent opacity={1} depthWrite flatShading />
    </instancedMesh>
  );
}

function buildStreamGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  let base = 0;

  STREAM_ROUTES.forEach((route) => {
    for (let i = 0; i < route.points.length - 1; i += 1) {
      const [ax, az] = route.points[i];
      const [bx, bz] = route.points[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.ceil(length / (CELL * 2)));
      const nx = -dz / length;
      const nz = dx / length;
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = ax + dx * t;
        const z = az + dz * t;
        const y = heightAt(x, z) + 0.095;
        const v = (i * 10 + t * length) / 4;
        positions.push(x + nx * route.width / 2, y, z + nz * route.width / 2);
        positions.push(x - nx * route.width / 2, y, z - nz * route.width / 2);
        uvs.push(0, v, 1, v);
        if (step > 0) {
          const a = base + (step - 1) * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      base += (steps + 1) * 2;
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 河水两侧羽化用的透明度贴图：中间实、两边虚
function makeStreamEdgeTexture() {
  const width = 64;
  const height = 8;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'rgb(0,0,0)');
  gradient.addColorStop(0.14, 'rgb(120,120,120)');
  gradient.addColorStop(0.34, 'rgb(235,235,235)');
  gradient.addColorStop(0.66, 'rgb(235,235,235)');
  gradient.addColorStop(0.86, 'rgb(120,120,120)');
  gradient.addColorStop(1, 'rgb(0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

// 河岸羽化：靠水一侧实、靠草地一侧渐渐消失
function makeBankTexture() {
  const width = 64;
  const height = 8;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'rgb(255,255,255)');
  gradient.addColorStop(0.45, 'rgb(225,225,225)');
  gradient.addColorStop(0.78, 'rgb(105,105,105)');
  gradient.addColorStop(1, 'rgb(0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

// 河岸湿土带：从草地颜色平滑过渡到贴近水面的深色湿土
const BANK_ROWS = [
  { offset: 2.6, y: 0.02, u: 1, color: '#41543a' },
  { offset: 1.5, y: 0.014, u: 0.62, color: '#3c4e36' },
  { offset: 0.55, y: -0.02, u: 0.29, color: '#374831' },
  { offset: -0.3, y: -0.16, u: 0, color: '#313f2b' },
];

function buildStreamBankApron() {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const color = new THREE.Color();
  let base = 0;

  STREAM_ROUTES.forEach((route) => {
    const samples = [];
    for (let i = 0; i < route.points.length - 1; i += 1) {
      const [ax, az] = route.points[i];
      const [bx, bz] = route.points[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.ceil(length / (CELL * 2)));
      const nx = -dz / length;
      const nz = dx / length;
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        samples.push({ x: ax + dx * t, z: az + dz * t, nx, nz });
      }
    }
    const last = route.points[route.points.length - 1];
    const prev = route.points[route.points.length - 2];
    const dx = last[0] - prev[0];
    const dz = last[1] - prev[1];
    const length = Math.hypot(dx, dz) || 1;
    samples.push({ x: last[0], z: last[1], nx: -dz / length, nz: dx / length });

    [-1, 1].forEach((side) => {
      let travelled = 0;
      const start = base;
      samples.forEach((sample, index) => {
        const h = heightAt(sample.x, sample.z);
        BANK_ROWS.forEach((row) => {
          const off = side * (route.width / 2 + row.offset);
          positions.push(sample.x + sample.nx * off, h + row.y, sample.z + sample.nz * off);
          color.set(row.color);
          colors.push(color.r, color.g, color.b);
          uvs.push(row.u, travelled / 4);
        });
        if (index > 0) {
          const a = start + (index - 1) * BANK_ROWS.length;
          const b = start + index * BANK_ROWS.length;
          for (let r = 0; r < BANK_ROWS.length - 1; r += 1) {
            indices.push(a + r, b + r, a + r + 1, a + r + 1, b + r, b + r + 1);
          }
          const p = samples[index - 1];
          travelled += Math.hypot(sample.x - p.x, sample.z - p.z);
        }
      });
      base += samples.length * BANK_ROWS.length;
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function StreamBanks() {
  const mesh = useRef();
  const stones = useMemo(() => {
    const random = mulberry32(8128);
    const list = [];
    STREAM_ROUTES.forEach((route) => {
      for (let i = 0; i < route.points.length - 1; i += 1) {
        const [ax, az] = route.points[i];
        const [bx, bz] = route.points[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const length = Math.hypot(dx, dz);
        const nx = -dz / length;
        const nz = dx / length;
        const count = Math.max(1, Math.floor(length / (CELL * 2.4)));
        for (let step = 0; step < count; step += 1) {
          const t = (step + random() * 0.7) / count;
          for (const side of [-1, 1]) {
            if (random() < 0.55) continue;
            const offset = side * (route.width / 2 + CELL * (1.0 + random() * 1.0));
            const x = ax + dx * t + nx * offset;
            const z = az + dz * t + nz * offset;
            if (isInsideBuilding(x, z, CELL * 1.5)) continue;
            list.push({
              x,
              z,
              y: heightAt(x, z) + CELL * 0.3,
              rot: random() * Math.PI / 2,
              size: 0.55 + random() * 0.4,
            });
          }
        }
      }
    });
    return list;
  }, []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    const colors = SIDE_ROCK.map((color) => color.clone().multiplyScalar(0.96));
    stones.forEach((stone, index) => {
      dummy.position.set(stone.x, stone.y, stone.z);
      dummy.rotation.set(0, stone.rot, 0);
      dummy.scale.setScalar(CELL * (stone.size || 1));
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
      mesh.current.setColorAt(index, colors[index % colors.length]);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [stones]);

  return (
    <instancedMesh ref={mesh} args={[null, null, Math.max(1, stones.length)]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial color="#ffffff" />
    </instancedMesh>
  );
}

export default function Mountains() {
  const mountains = useMemo(() => HILLS.map((_, index) => buildMountainGeometry(index)), []);
  const ring = useMemo(() => buildRingGeometry(), []);
  const ringTexture = useMemo(() => makeGrassTileTexture(), []);
  const ringTrees = useMemo(() => buildRingForest(), []);
  const ringBushes = useMemo(() => buildRingBushes(), []);
  const streams = useMemo(() => buildStreamGeometry(), []);
  const streamEdge = useMemo(() => makeStreamEdgeTexture(), []);
  const bankApron = useMemo(() => buildStreamBankApron(), []);
  const bankTexture = useMemo(() => makeBankTexture(), []);

  return (
    <group name="voxel-mountains-and-streams">
      {mountains.map((geometry, index) => (
        <mesh key={index} geometry={geometry}>
          <meshLambertMaterial color="#ffffff" vertexColors />
        </mesh>
      ))}
      {/* 环山在天空圆筒之外：放进透明队列并抬高 renderOrder，天空之后绘制才不会被盖住 */}
      <mesh geometry={ring} name="perimeter-mountains" renderOrder={-10}>
        <meshLambertMaterial
          color="#ffffff"
          vertexColors
          map={ringTexture}
          emissive="#1d2818"
          emissiveIntensity={0.5}
          transparent
          opacity={1}
          depthWrite
        />
      </mesh>
      <RingForest trees={ringTrees} />
      <RingBushes bushes={ringBushes} />
      {/* 河岸湿土带：先铺一层渐变，再让水面在两侧羽化，避免生硬的直线交界 */}
      <mesh geometry={bankApron} renderOrder={1}>
        <meshLambertMaterial
          vertexColors
          transparent
          alphaMap={bankTexture}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh geometry={streams} renderOrder={2}>
        <meshLambertMaterial
          color="#729b9b"
          transparent
          opacity={0.84}
          alphaMap={streamEdge}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <StreamBanks />
    </group>
  );
}
