import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SPECIES_BY_ID } from '../game/plantsCatalog';
import { PLANT_SCALE } from '../game/terrain';
import { WILD_PLANTS, getPlantsVersion, subscribePlants } from '../game/wildplants';
import { buildFruitTree, u, voxelizeParts } from './voxelFlora';

// 各家族共用一套“部件”描述，再由体素器切成小块。
function part(size, position, color, rotation = [0, 0, 0]) {
  return { size, position, color: color || '#6b432a', rotation };
}

function lightColor(hex, amount = 1.22) {
  const color = new THREE.Color(hex);
  color.multiplyScalar(amount);
  return `#${color.getHexString()}`;
}

function beamPart(start, end, width, color, depth = width) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const delta = to.clone().sub(from);
  const rotation = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize())
  );
  return part(
    [width, delta.length(), depth],
    from.add(to).multiplyScalar(0.5).toArray(),
    color,
    [rotation.x, rotation.y, rotation.z]
  );
}

function wildGlyph(species, stage) {
  const { leaf, accent, fruit } = species;
  const form = species.form || 'leafy';
  const parts = [];

  if (form === 'scallion') {
    // 白鳞茎上伸出极长的扁锥叶，逐段收窄并向外弯曲。
    const bulbs = stage === 0 ? 1 : 3;
    for (let i = 0; i < bulbs; i += 1) {
      const angle = (i / bulbs) * Math.PI * 2;
      const radius = i === 0 ? 0 : 0.09;
      parts.push(part(
        [0.17, 0.16, 0.17],
        [Math.cos(angle) * radius, 0.08, Math.sin(angle) * radius],
        fruit[0]
      ));
    }

    const blades = 2 + stage * 2;
    for (let i = 0; i < blades; i += 1) {
      const angle = (i / blades) * Math.PI * 2 + 0.2;
      const height = 0.48 + stage * 0.16 + (i % 3) * 0.08;
      const spread = 0.24 + stage * 0.14 + (i % 2) * 0.1;
      const baseAngle = (i % bulbs) * 2.1;
      const baseRadius = i % bulbs === 0 ? 0 : 0.07;
      const baseX = Math.cos(baseAngle) * baseRadius;
      const baseZ = Math.sin(baseAngle) * baseRadius;
      const pointAt = (t) => [
        baseX + Math.cos(angle) * spread * t,
        0.13 + height * Math.sin(t * Math.PI * 0.68),
        baseZ + Math.sin(angle) * spread * t,
      ];
      for (let k = 0; k < 5; k += 1) {
        const t = k / 5;
        const width = 0.13 * (1 - t * 0.82);
        parts.push(beamPart(
          pointAt(t),
          pointAt((k + 1) / 5),
          width,
          leaf[(i + k) % leaf.length],
          width * 0.3
        ));
      }
    }
    return parts;
  }

  if (form === 'burdock') {
    const leaves = 4 + stage;
    for (let i = 0; i < leaves; i += 1) {
      const angle = i * 2.39996;
      const ring = i % 3;
      // 最下层保持 0.3 rad，其余叶片由 0.3 抬高到 0.9 rad。
      const tilt = ring === 0 ? 0.3 : 0.9;
      const length = 0.52 + stage * 0.15 + (i % 2) * 0.04;
      const mainLength = length * 0.64;
      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);
      const pointAt = (distance) => [
        Math.cos(angle) * (0.04 + cosTilt * distance),
        0.07 + sinTilt * distance,
        Math.sin(angle) * (0.04 + cosTilt * distance),
      ];
      parts.push(part(
        [0.38, 0.075, mainLength],
        pointAt(mainLength / 2),
        leaf[i % 2],
        [-tilt, angle, 0]
      ));
      parts.push(part(
        [0.25, 0.065, length - mainLength],
        pointAt(mainLength + (length - mainLength) / 2),
        leaf[(i + 1) % 2],
        [-tilt, angle, 0]
      ));
    }

    if (stage >= 2) {
      // 结果期花茎与花头的整体高度减半，宽度和细粒度保持不变。
      const headY = (0.9 + stage * 0.18) * 0.5;
      parts.push({
        ...part([0.035, headY, 0.035], [0.04, headY / 2, -0.02], leaf[2]),
        voxelScale: 0.65,
      });
      parts.push({
        ...part([0.07, 0.045, 0.07], [0.04, headY, -0.02], '#6f5a3f'),
        voxelScale: 0.65,
      });
      parts.push({
        ...part(
          [0.09, 0.075, 0.09],
          [0.04, headY + 0.055, -0.02],
          stage === 3 ? accent : '#9d9571'
        ),
        voxelScale: 0.65,
      });
    }
    return parts;
  }

  if (form === 'wildCarrot') {
    const rootCell = u(0.7) / (species.scale * 1.15 * PLANT_SCALE);
    if (stage === 3) {
      // 红色萝卜头严格为 5 × 5 × 5 个完整体素。
      for (let ix = 0; ix < 5; ix += 1) {
        for (let iy = 0; iy < 5; iy += 1) {
          for (let iz = 0; iz < 5; iz += 1) {
            parts.push(part(
              [rootCell, rootCell, rootCell],
              [(ix - 2) * rootCell, (iy + 0.5) * rootCell, (iz - 2) * rootCell],
              fruit[0]
            ));
          }
        }
      }
    }

    const leafBase = stage === 3 ? rootCell * 4.6 : 0.06;
    for (let i = 0; i < 5 + stage * 2; i += 1) {
      const angle = i * 1.1;
      const height = 0.3 + stage * 0.07 + (i % 3) * 0.04;
      const start = [Math.cos(angle) * 0.04, leafBase, Math.sin(angle) * 0.04];
      const end = [Math.cos(angle) * 0.2, leafBase + height, Math.sin(angle) * 0.2];
      parts.push(beamPart(start, end, 0.035, leaf[i % 3]));
      for (let k = 1; k <= 2; k += 1) {
        const t = k / 3;
        const cx = start[0] + (end[0] - start[0]) * t;
        const cy = start[1] + (end[1] - start[1]) * t;
        const cz = start[2] + (end[2] - start[2]) * t;
        const side = k % 2 ? 1 : -1;
        parts.push(part(
          [0.13, 0.035, 0.06],
          [cx + Math.cos(angle + side * 1.2) * 0.06, cy, cz + Math.sin(angle + side * 1.2) * 0.06],
          leaf[(i + k) % 3],
          [0.18, angle + side * 1.2, side * 0.25]
        ));
      }
    }
    return parts;
  }

  // 野菜：只保留参考图中的分层斜生叶，不再抽苔开花。
  const leafCount = 5 + stage * 2;
  for (let i = 0; i < leafCount; i += 1) {
    const angle = i * 2.39996;
    const ring = i % 3;
    const y = 0.1 + ring * 0.1;
    const reach = 0.12 + ring * 0.05;
    const cx = Math.cos(angle) * reach;
    const cz = Math.sin(angle) * reach;
    parts.push(part(
      [0.2, 0.16, 0.07],
      [cx, y + 0.08, cz],
      leaf[i % leaf.length],
      [0.32, angle, 0.42 - ring * 0.1]
    ));
    parts.push(part(
      [0.12, 0.1, 0.06],
      [cx * 1.45, y + 0.17, cz * 1.45],
      leaf[(i + 1) % leaf.length],
      [0.38, angle, 0.58 - ring * 0.1]
    ));
  }
  return parts;
}

function mushroomGlyph() {
  return [
    // 腐土与潮湿泥土
    part([1.05, 0.14, 0.9], [0, 0.07, 0], '#412b1b'),
    part([0.8, 0.1, 0.66], [0, 0.16, 0], '#33210f'),
    part([0.2, 0.05, 0.16], [-0.34, 0.12, 0.16], '#2a1a10'),
    part([0.16, 0.04, 0.14], [0.32, 0.12, -0.12], '#2a1a10'),
    // 菌柄
    part([0.16, 0.36, 0.16], [0, 0.36, 0], '#cdc8b8'),
    part([0.2, 0.06, 0.2], [0, 0.2, 0], '#b6b1a0'),
    // 菌盖与菌褶
    part([0.62, 0.28, 0.56], [0, 0.62, 0], '#d9d4c6'),
    part([0.46, 0.12, 0.42], [0, 0.76, 0], '#ece8dc'),
    part([0.5, 0.04, 0.46], [0, 0.5, 0], '#a9a494'),
    part([0.1, 0.05, 0.1], [-0.16, 0.68, 0.12], '#b9b4a6'),
    part([0.08, 0.04, 0.08], [0.14, 0.71, -0.08], '#b9b4a6'),
    part([0.06, 0.04, 0.06], [0.02, 0.66, 0.2], '#c9c4b6'),
  ];
}

function cropGlyph(species, stage) {
  const { leaf, accent, fruit } = species;
  const form = species.form || 'root';
  const parts = [];

  if (form === 'pumpkin') {
    // 匍匐藤蔓 + 大叶
    for (let i = 0; i < 3; i += 1) {
      parts.push(part([1.0, 0.06, 0.1], [0, 0.06, -0.34 + i * 0.34], leaf[2], [0, i * 0.6, 0]));
    }
    const leaves = 3 + stage;
    for (let i = 0; i < leaves; i += 1) {
      const angle = i * 1.9;
      parts.push(part(
        [0.48, 0.09, 0.48],
        [Math.cos(angle) * 0.42, 0.2 + (i % 2) * 0.06, Math.sin(angle) * 0.34],
        leaf[i % 3],
        [0, angle, 0.1]
      ));
      parts.push(part([0.26, 0.04, 0.2], [Math.cos(angle) * 0.44, 0.25, Math.sin(angle) * 0.36], leaf[(i + 1) % 3], [0, angle, 0.2]));
    }
    if (stage >= 2) {
      const size = stage === 3 ? 0.62 : 0.3;
      parts.push(part([size, size * 0.8, size], [0.24, size * 0.4, 0.36], stage === 3 ? fruit[0] : '#a9b06a'));
      parts.push(part([size * 0.13, size * 0.82, size * 1.02], [0.24, size * 0.4, 0.36], darken(fruit[0])));
      parts.push(part([0.08, 0.16, 0.08], [0.24, size * 0.8, 0.36], leaf[2]));
      if (stage === 3) {
        parts.push(part([size * 0.3, size * 0.22, size * 0.05], [0.1, size * 0.62, 0.62], lightColor(fruit[1])));
      }
    } else if (stage === 1) {
      parts.push(part([0.18, 0.12, 0.18], [0.24, 0.34, 0.36], '#d8c25a'));
    }
    return parts;
  }

  if (form === 'bean') {
    // 主蔓连续左右弯行，叶柄和三出复叶从藤蔓节点生出。
    const height = 0.34 + stage * 0.34;
    const segments = 4 + stage * 3;
    const vinePoint = (t) => [
      Math.sin(t * Math.PI * 2.4) * (0.035 + stage * 0.025),
      0.05 + height * t,
      Math.cos(t * Math.PI * 2.1) * (0.025 + stage * 0.012),
    ];
    for (let i = 0; i < segments; i += 1) {
      parts.push(beamPart(
        vinePoint(i / segments),
        vinePoint((i + 1) / segments),
        0.032,
        leaf[2]
      ));
    }

    const nodes = 2 + stage * 2;
    for (let i = 0; i < nodes; i += 1) {
      const start = vinePoint((i + 1) / (nodes + 1));
      const angle = i * 2.39996;
      const petioleEnd = [
        start[0] + Math.cos(angle) * 0.13,
        start[1] + 0.025,
        start[2] + Math.sin(angle) * 0.13,
      ];
      parts.push(beamPart(start, petioleEnd, 0.022, leaf[2]));
      for (let j = -1; j <= 1; j += 1) {
        const leafAngle = angle + j * 0.72;
        const length = j === 0 ? 0.22 : 0.18;
        parts.push(part(
          [j === 0 ? 0.16 : 0.14, 0.045, length],
          [
            petioleEnd[0] + Math.cos(leafAngle) * length * 0.34,
            petioleEnd[1] + (j === 0 ? 0.025 : 0),
            petioleEnd[2] + Math.sin(leafAngle) * length * 0.34,
          ],
          leaf[(i + j + 3) % 2],
          [-0.18, leafAngle, 0]
        ));
      }
    }

    if (stage >= 2) {
      const podCount = stage === 3 ? 6 : 3;
      for (let i = 0; i < podCount; i += 1) {
        const anchor = vinePoint(0.25 + (i / Math.max(1, podCount - 1)) * 0.62);
        const side = i % 2 ? 1 : -1;
        let previous = [anchor[0] + side * 0.12, anchor[1], anchor[2] + 0.14];
        for (let k = 0; k < 4; k += 1) {
          const t = (k + 1) / 4;
          const next = [
            anchor[0] + side * (0.12 + 0.1 * t * t),
            anchor[1] - 0.4 * t,
            anchor[2] + 0.14 + 0.04 * t,
          ];
          const width = (stage === 3 ? 0.085 : 0.065) * (1 - k * 0.08);
          parts.push(beamPart(previous, next, width, fruit[(i + k) % 2], width * 0.55));
          if (stage === 3 && k < 3) {
            parts.push(part(
              [0.045, 0.05, 0.04],
              [
                (previous[0] + next[0]) / 2,
                (previous[1] + next[1]) / 2,
                (previous[2] + next[2]) / 2 + 0.035,
              ],
              fruit[1]
            ));
          }
          previous = next;
        }
      }
    }

    // 顶部两根短卷须，强化藤蔓而非直立支架的轮廓。
    for (let i = 0; i < 2; i += 1) {
      let previous = vinePoint(0.86 + i * 0.1);
      for (let k = 0; k < 3; k += 1) {
        const angle = i * Math.PI + k * 0.9;
        const next = [
          previous[0] + Math.cos(angle) * 0.06,
          previous[1] + 0.03 - k * 0.012,
          previous[2] + Math.sin(angle) * 0.06,
        ];
        parts.push(beamPart(previous, next, 0.018, leaf[2]));
        previous = next;
      }
    }
    return parts;
  }

  if (form === 'cabbage') {
    // 灰绿外叶托住紫色叶球，球面保留细小凹凸和叶片色块。
    const outerLeaf = ['#5d6a58', '#74806a', '#4d5b4e'];
    const outerCount = 6 + stage * 2;
    for (let i = 0; i < outerCount; i += 1) {
      const angle = i * 2.39996;
      const reach = 0.17 + (i % 2) * 0.035;
      parts.push(part(
        [0.26, 0.06, 0.36],
        [Math.cos(angle) * reach, 0.09 + (i % 3) * 0.018, Math.sin(angle) * reach],
        outerLeaf[i % 3],
        [-0.22, angle, 0]
      ));
      parts.push(part(
        [0.18, 0.05, 0.22],
        [Math.cos(angle) * (reach + 0.2), 0.13, Math.sin(angle) * (reach + 0.2)],
        outerLeaf[(i + 1) % 3],
        [-0.36, angle, 0]
      ));
    }

    // 外叶上方再托一圈更小、更陡的紫色叶片，包住叶球下半部。
    const innerCount = 4 + stage * 2;
    for (let i = 0; i < innerCount; i += 1) {
      const angle = i * 2.39996 + 0.28;
      const reach = 0.14 + (i % 2) * 0.02;
      const y = 0.17 + (i % 3) * 0.015;
      parts.push(part(
        [0.2, 0.055, 0.28],
        [Math.cos(angle) * reach, y, Math.sin(angle) * reach],
        leaf[i % 2],
        [-0.58, angle, 0]
      ));
      parts.push(part(
        [0.14, 0.045, 0.18],
        [Math.cos(angle) * (reach + 0.13), y + 0.08, Math.sin(angle) * (reach + 0.13)],
        leaf[(i + 1) % 2],
        [-0.76, angle, 0]
      ));
    }

    if (stage >= 2) {
      const cell = u(0.7) / (species.scale * 1.15 * PLANT_SCALE);
      const radiusCells = stage === 3 ? 4 : 3;
      const centerY = (radiusCells + 1.5) * cell;
      for (let ix = -radiusCells; ix <= radiusCells; ix += 1) {
        for (let iy = -radiusCells; iy <= radiusCells; iy += 1) {
          for (let iz = -radiusCells; iz <= radiusCells; iz += 1) {
            const distance = Math.hypot(ix, iy * 1.03, iz);
            const bump = ((((ix * 13 + iy * 7 + iz * 11) % 5) + 5) % 5) * 0.035;
            if (distance > radiusCells + 0.12 + bump) continue;
            const surface = distance > radiusCells - 1.15;
            const seam = surface && ((ix * 3 + iy * 5 + iz * 7) % 9 === 0);
            const color = seam ? leaf[0] : fruit[Math.abs(ix + iy * 2 + iz * 3) % fruit.length];
            parts.push(part(
              [cell * 1.02, cell * 1.02, cell * 1.02],
              [ix * cell, centerY + iy * cell, iz * cell],
              color
            ));
          }
        }
      }
    } else {
      for (let i = 0; i < 2 + stage; i += 1) {
        const angle = i * 2.39996;
        parts.push(part(
          [0.13, 0.055, 0.22],
          [Math.cos(angle) * 0.06, 0.18 + i * 0.035, Math.sin(angle) * 0.06],
          leaf[i % 2],
          [-0.75, angle, 0]
        ));
      }
    }
    return parts;
  }

  if (form === 'potato') {
    parts.push(part([0.56, 0.14, 0.46], [0, 0.08, 0], '#6b4c31'));
    const leaves = 2 + stage * 2;
    for (let i = 0; i < leaves; i += 1) {
      const angle = i * 1.7;
      parts.push(part(
        [0.26, 0.09, 0.22],
        [Math.cos(angle) * 0.2, 0.18 + (i % 2) * 0.12, Math.sin(angle) * 0.2],
        leaf[i % 2],
        [0, angle, 0.2]
      ));
    }
    if (stage >= 2) {
      const size = stage === 3 ? 0.2 : 0.12;
      parts.push(part([size, size * 0.75, size], [-0.2, 0.08, 0.16], stage === 3 ? fruit[0] : '#9a8a5a'));
      parts.push(part([size * 0.86, size * 0.7, size * 0.86], [0.18, 0.07, -0.12], stage === 3 ? fruit[1] : '#9a8a5a'));
      if (stage === 3) {
        parts.push(part([0.04, 0.04, 0.04], [-0.24, 0.12, 0.2], '#5a4328'));
      }
    } else if (stage === 1) {
      parts.push(part([0.09, 0.09, 0.09], [0, 0.4, 0], '#efe7c0'));
    }
    return parts;
  }

  // 胡萝卜：低矮羽叶 + 露出的橙色根
  for (let i = 0; i < 5 + stage * 2; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    parts.push(part(
      [0.18, 0.3, 0.07],
      [Math.cos(angle) * 0.1, 0.24 + stage * 0.03, Math.sin(angle) * 0.1],
      leaf[i % 3],
      [Math.cos(angle) * 0.18, 0, Math.sin(angle) * -0.18]
    ));
  }
  if (stage >= 2) {
    const size = stage === 3 ? 0.24 : 0.14;
    parts.push(part([size, size * 1.1, size], [0, size * 0.4, 0], stage === 3 ? fruit[1] : '#a9a06a'));
    if (stage === 3) {
      parts.push(part([size * 0.3, size * 0.5, size * 0.3], [size * 0.28, size * 0.42, 0.02], lightColor(fruit[1])));
    }
  } else if (stage === 1) {
    parts.push(part([0.1, 0.1, 0.1], [0.02, 0.42, 0], '#d9d6a8'));
  }
  return parts;
}

function darken(hex) {
  const color = new THREE.Color(hex);
  color.multiplyScalar(0.68);
  return `#${color.getHexString()}`;
}

// 覆盆子：直立多枝、复叶、红色聚合果
function raspberryGlyph(species, stage) {
  const { leaf, accent, fruit } = species;
  const parts = [];
  const growth = 0.46 + stage * 0.18;
  const height = 0.74 * growth;
  const stemColor = accent || '#7a3f30';

  parts.push(part([0.44, 0.06, 0.38], [0, 0.03, 0], '#43301f'));

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.35;
    const lean = 0.07 + (i % 3) * 0.05;
    const caneHeight = height * (0.72 + (i % 4) * 0.09);
    for (let k = 0; k < 3; k += 1) {
      const t = (k + 0.5) / 3;
      parts.push(part(
        [0.04, (caneHeight / 3) * 1.15, 0.04],
        [Math.cos(angle) * lean * t, 0.06 + caneHeight * t, Math.sin(angle) * lean * t],
        i % 2 ? stemColor : '#5c3a2c'
      ));
    }
    // 枝顶补叶，避免露出光杆
    const tipX = Math.cos(angle) * lean;
    const tipZ = Math.sin(angle) * lean;
    const tipY = 0.06 + caneHeight;
    parts.push(part([0.13, 0.026, 0.11], [tipX, tipY, tipZ], leaf[i % 3], [0.22, angle, 0.1]));
    parts.push(part(
      [0.095, 0.024, 0.085],
      [tipX + Math.cos(angle + 1) * 0.08, tipY - 0.02, tipZ + Math.sin(angle + 1) * 0.08],
      leaf[(i + 1) % 3],
      [0.18, angle + 1, -0.2]
    ));
  }

  for (let i = 0; i < 13; i += 1) {
    const angle = i * 2.39996;
    const y = 0.2 + (i % 5) * 0.1;
    const radius = 0.15 + (i % 3) * 0.055;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    parts.push(part([0.17, 0.028, 0.13], [cx, y + 0.05, cz], leaf[i % 3], [0.28, angle, 0.12]));
    parts.push(part(
      [0.115, 0.026, 0.1],
      [cx + Math.cos(angle + 1) * 0.1, y + 0.02, cz + Math.sin(angle + 1) * 0.1],
      leaf[(i + 1) % 3],
      [0.24, angle + 1, -0.2]
    ));
    parts.push(part(
      [0.115, 0.026, 0.1],
      [cx + Math.cos(angle - 1) * 0.1, y, cz + Math.sin(angle - 1) * 0.1],
      leaf[(i + 2) % 3],
      [0.24, angle - 1, 0.2]
    ));
  }

  if (stage >= 2) {
    const berries = stage === 3 ? 13 : 6;
    const size = stage === 3 ? 0.075 : 0.05;
    for (let i = 0; i < berries; i += 1) {
      const angle = i * 2.1 + 0.4;
      const y = 0.17 + (i % 4) * 0.115;
      const radius = 0.14 + (i % 2) * 0.07;
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;
      parts.push(part([size, size * 0.92, size], [px, y, pz], i % 2 ? fruit[0] : fruit[1]));
      parts.push(part(
        [size * 0.28, size * 0.28, size * 0.28],
        [px - size * 0.25, y + size * 0.28, pz + size * 0.28],
        lightColor(fruit[1], 1.3)
      ));
    }
  }
  return parts;
}

// 醋栗：拱形枝条、三裂叶、成串垂果
function currantGlyph(species, stage) {
  const { leaf, accent, fruit } = species;
  const parts = [];
  const growth = 0.52 + stage * 0.16;
  const height = 0.6 * growth;
  const stemColor = '#4f3426';

  parts.push(part([0.5, 0.06, 0.42], [0, 0.03, 0], '#43301f'));

  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + 0.2;
    for (let k = 0; k < 3; k += 1) {
      const t = (k + 1) / 3;
      const reach = 0.26 * t * t;
      parts.push(part(
        [0.032, (height / 3) * 1.08, 0.032],
        [Math.cos(angle) * reach, 0.06 + height * t * 0.72, Math.sin(angle) * reach],
        stemColor
      ));
    }
    // 枝顶叶片盖住枝条末端
    const tipX = Math.cos(angle) * 0.26;
    const tipZ = Math.sin(angle) * 0.26;
    const tipY = height * 0.8;
    parts.push(part([0.15, 0.028, 0.15], [tipX, tipY, tipZ], leaf[i % 3], [0.15, angle, 0.1]));
    parts.push(part([0.1, 0.026, 0.1], [tipX * 1.12, tipY - 0.04, tipZ * 1.12], leaf[(i + 1) % 3], [0.16, angle + 1, -0.16]));
  }

  for (let i = 0; i < 22; i += 1) {
    const angle = i * 2.39996;
    const y = 0.16 + (i % 7) * 0.075;
    const radius = 0.15 + (i % 3) * 0.06;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    parts.push(part([0.17, 0.028, 0.17], [cx, y, cz], leaf[i % 3], [0.18, angle, 0.1]));
    parts.push(part(
      [0.12, 0.026, 0.11],
      [cx + Math.cos(angle + 1.1) * 0.11, y + 0.01, cz + Math.sin(angle + 1.1) * 0.11],
      leaf[(i + 1) % 3],
      [0.16, angle + 1.1, -0.18]
    ));
    parts.push(part(
      [0.12, 0.026, 0.11],
      [cx + Math.cos(angle - 1.1) * 0.11, y + 0.01, cz + Math.sin(angle - 1.1) * 0.11],
      leaf[(i + 2) % 3],
      [0.16, angle - 1.1, 0.18]
    ));
  }
  parts.push(part([0.17, 0.03, 0.17], [0, height * 0.9, 0], leaf[1], [0.12, 0.4, 0]));

  if (stage >= 2) {
    const strigs = stage === 3 ? 6 : 3;
    const size = stage === 3 ? 0.06 : 0.04;
    for (let i = 0; i < strigs; i += 1) {
      const angle = i * 1.9 + 0.5;
      const radius = 0.24 + (i % 2) * 0.05;
      const baseX = Math.cos(angle) * radius;
      const baseZ = Math.sin(angle) * radius;
      const topY = 0.36 + (i % 3) * 0.07;
      parts.push(part([0.022, 0.15, 0.022], [baseX, topY, baseZ], '#5a4230'));
      for (let k = 0; k < 4; k += 1) {
        const t = (k + 1) / 4;
        parts.push(part(
          [size, size, size],
          [baseX + Math.cos(angle) * t * 0.05, topY - t * 0.19, baseZ + Math.sin(angle) * t * 0.05],
          k % 2 ? fruit[0] : fruit[1]
        ));
      }
    }
  }
  return parts;
}

// 蓝莓：矮圆密叶、蓝紫大果铺满冠面
function blueberryGlyph(species, stage) {
  const { leaf, accent, fruit } = species;
  const parts = [];
  const growth = 0.52 + stage * 0.16;
  const height = 0.58 * growth;
  const width = 0.72 * growth;
  const stemColor = accent || '#5c4a3a';

  parts.push(part([0.46, 0.06, 0.42], [0, 0.03, 0], '#3f2d1f'));
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    parts.push(part(
      [0.038, height * 0.42, 0.038],
      [Math.cos(angle) * 0.07, height * 0.21, Math.sin(angle) * 0.07],
      stemColor
    ));
  }

  const layerCounts = [10, 11, 9, 5];
  for (let layer = 0; layer < 4; layer += 1) {
    const y = height * (0.14 + layer * 0.2);
    const radius = width * (0.52 - layer * 0.06);
    const count = layerCounts[layer];
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + layer * 0.5;
      const rr = radius * (0.72 + (i % 3) * 0.13);
      parts.push(part(
        [0.105, 0.032, 0.085],
        [Math.cos(angle) * rr, y + (i % 3) * 0.03, Math.sin(angle) * rr],
        leaf[(i + layer) % 3],
        [0.16, angle, 0.22 - (i % 2) * 0.44]
      ));
    }
  }
  parts.push(part([0.12, 0.03, 0.11], [0, height * 0.9, 0], leaf[1], [0.2, 0.3, 0]));

  if (stage >= 2) {
    const berries = stage === 3 ? 20 : 10;
    const size = stage === 3 ? 0.07 : 0.045;
    for (let i = 0; i < berries; i += 1) {
      const angle = i * 2.39996;
      const layer = i % 4;
      const y = height * (0.18 + layer * 0.19);
      const radius = width * (0.54 - layer * 0.05);
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;
      parts.push(part([size, size, size], [px, y, pz], i % 2 ? fruit[0] : fruit[1]));
      if (stage === 3) {
        parts.push(part(
          [size * 0.28, size * 0.28, size * 0.28],
          [px - size * 0.2, y + size * 0.3, pz + size * 0.24],
          lightColor(fruit[1], 1.35)
        ));
      }
    }
  }
  return parts;
}

function berryGlyph(species, stage) {
  const { leaf, accent, fruit, trunk } = species;
  const form = species.form || 'bush';
  if (species.id === 'raspberry') return raspberryGlyph(species, stage);
  if (species.id === 'currant') return currantGlyph(species, stage);
  if (species.id === 'blueberry') return blueberryGlyph(species, stage);
  const parts = [];

  if (form === 'banana') {
    const stemH = 1.3 + stage * 0.2;
    parts.push(part([0.18, stemH, 0.18], [0, stemH / 2, 0], '#7a8a4a'));
    parts.push(part([0.28, 0.12, 0.28], [0, 0.06, 0], '#5f6b3a'));
    for (let i = 0; i < 5 + stage; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      parts.push(part([0.7, 0.09, 0.3], [Math.cos(angle) * 0.3, stemH * 0.86 + i * 0.05, Math.sin(angle) * 0.3], leaf[i % 2], [0.2, angle, 0]));
      parts.push(part([0.4, 0.05, 0.18], [Math.cos(angle) * 0.45, stemH * 0.84 + i * 0.05, Math.sin(angle) * 0.45], leaf[(i + 1) % 2], [0.24, angle, 0]));
    }
    if (stage >= 2) {
      const size = stage === 3 ? 0.2 : 0.12;
      parts.push(part([size, size * 2.2, size], [0.18, stemH * 0.62, 0.16], stage === 3 ? fruit[0] : '#b0b07a'));
      parts.push(part([size * 0.9, size * 2.0, size * 0.9], [-0.16, stemH * 0.6, 0.16], stage === 3 ? fruit[1] : '#b0b07a'));
      parts.push(part([0.06, 0.26, 0.06], [0, stemH * 0.78, 0.16], '#7a8a4a'));
    }
    return parts;
  }

  if (form === 'cactus') {
    parts.push(part([0.26, 0.9 + stage * 0.14, 0.26], [0, 0.48, 0], leaf[0]));
    parts.push(part([0.2, 0.36, 0.2], [-0.2, 0.62, 0], leaf[1]));
    parts.push(part([0.18, 0.28, 0.18], [0.2, 0.46, 0.02], leaf[2]));
    for (let i = 0; i < 8; i += 1) {
      parts.push(part([0.03, 0.04, 0.03], [((i % 2) - 0.5) * 0.24, 0.28 + i * 0.1, 0.14], '#e8e2c8'));
    }
    if (stage >= 2) {
      const size = stage === 3 ? 0.18 : 0.1;
      parts.push(part([size, size, size], [0, 1.0, 0], stage === 3 ? fruit[0] : '#b9a06a'));
      if (stage === 3) {
        parts.push(part([size * 0.9, size * 0.9, size * 0.9], [-0.2, 0.86, 0], fruit[1]));
        parts.push(part([0.04, 0.04, 0.04], [-0.24, 0.9, 0.06], '#f0d9a0'));
      }
    }
    return parts;
  }

  if (form === 'mangoTree') {
    const trunkH = 1.15 + stage * 0.16;
    parts.push(part([0.17, trunkH, 0.17], [0, trunkH / 2, 0], trunk));
    // 三层长叶向外展开，增加叶片数量并扩大树冠横向范围。
    const leaves = 8 + stage * 3;
    for (let i = 0; i < leaves; i += 1) {
      const angle = i * 2.39996;
      const ring = i % 3;
      const reach = 0.38 + ring * 0.1;
      parts.push(part(
        [0.42, 0.1, 0.34],
        [
          Math.cos(angle) * reach,
          trunkH + 0.02 + ring * 0.13,
          Math.sin(angle) * reach,
        ],
        leaf[i % 2],
        [-0.12 - ring * 0.05, angle, 0]
      ));
    }
    if (stage >= 2) {
      const size = stage === 3 ? 0.18 : 0.1;
      parts.push(part([size, size * 1.3, size], [0.26, trunkH + 0.02, 0.18], stage === 3 ? fruit[0] : '#a9b06a'));
      parts.push(part([size, size * 1.3, size], [-0.22, trunkH + 0.08, 0.14], stage === 3 ? fruit[1] : '#a9b06a'));
      if (stage === 3) {
        parts.push(part([size * 0.3, size * 0.6, size * 0.3], [0.3, trunkH + 0.1, 0.22], lightColor(fruit[0])));
      }
    }
    return parts;
  }

  // 灌木浆果：细枝 + 密集叶片 + 成串小果
  const stemH = 0.5 + stage * 0.14;
  parts.push(part([0.06, stemH, 0.06], [0, stemH / 2, 0], accent || trunk || '#6b432a'));
  const leaves = 4 + stage * 2;
  for (let i = 0; i < leaves; i += 1) {
    const angle = (i / leaves) * Math.PI * 2;
    parts.push(part(
      [0.3, 0.07, 0.2],
      [Math.cos(angle) * 0.18, 0.32 + i * 0.06, Math.sin(angle) * 0.18],
      leaf[i % 3],
      [0, angle, 0.18]
    ));
  }
  if (stage >= 2) {
    const berries = stage === 3 ? 8 : 4;
    const size = stage === 3 ? 0.13 : 0.08;
    for (let i = 0; i < berries; i += 1) {
      const angle = i * 2.1;
      const color = stage === 3 ? fruit[i % 2] : '#c9c39a';
      const x = Math.cos(angle) * 0.22;
      const z = Math.sin(angle) * 0.22;
      const y = 0.44 + (i % 3) * 0.14;
      parts.push(part([size, size, size], [x, y, z], color));
      if (stage === 3) {
        parts.push(part([size * 0.32, size * 0.32, size * 0.32], [x - size * 0.2, y + size * 0.24, z + size * 0.3], lightColor(color, 1.4)));
      }
    }
  } else if (stage === 1) {
    parts.push(part([0.1, 0.08, 0.1], [0.1, 0.66, 0.04], '#d8d2a8'));
  }
  return parts;
}

export function buildGlyph(species, stage) {
  if (species.mushroom) return mushroomGlyph();
  if (species.family === 'wild') return wildGlyph(species, stage);
  if (species.family === 'crop') return cropGlyph(species, stage);
  return berryGlyph(species, stage);
}

// 所有距离都使用同一套完整体素，不再按相机距离替换模型或交叉面片
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const MODEL_CACHE = new Map();

function speciesSeed(speciesId) {
  let hash = 0;
  for (let i = 0; i < speciesId.length; i += 1) {
    hash = (hash * 31 + speciesId.charCodeAt(i)) % 100000;
  }
  return hash + 1;
}

function getModel(speciesId, stage) {
  const key = `${speciesId}-${stage}`;
  const cached = MODEL_CACHE.get(key);
  if (cached) return cached;

  const species = SPECIES_BY_ID[speciesId];
  const seed = speciesSeed(speciesId) + stage * 37;
  let blocks;
  if (species.family === 'tree') {
    blocks = buildFruitTree(species, stage, { seed }).blocks;
  } else {
    const factor = species.scale * 1.15 * PLANT_SCALE;
    const budget = species.mushroom ? 260 : species.id === 'mango' ? 2600 : species.family === 'berry' ? 1400 : 1200;
    const fruitColors = new Set((species.fruit || []).map((color) => color.toLowerCase()));
    blocks = voxelizeParts(buildGlyph(species, stage), {
      factor,
      budget,
      seed,
      target: u(0.7),
      fruitColors,
    });
  }

  const entry = { blocks };
  MODEL_CACHE.set(key, entry);
  return entry;
}

function PlantField({ items }) {
  const meshRef = useRef();
  const plants = useMemo(
    () => items.map((item) => ({ item, model: getModel(item.speciesId, item.stage) })),
    [items]
  );
  const capacity = useMemo(
    () => plants.reduce((total, plant) => total + plant.model.blocks.length, 0),
    [plants]
  );
  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const blockMaterial = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff' }), []);

  useEffect(
    () => () => {
      boxGeometry.dispose();
      blockMaterial.dispose();
    },
    [boxGeometry, blockMaterial]
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const yaw = new THREE.Quaternion();
    let cursor = 0;

    plants.forEach(({ item, model }) => {
      const scale = item.scale;
      const cos = Math.cos(item.rot);
      const sin = Math.sin(item.rot);
      const groundY = item.y + (item.soil ? 0.02 : 0);
      yaw.setFromAxisAngle(Y_AXIS, item.rot);
      model.blocks.forEach((block) => {
        dummy.position.set(
          item.x + (block.x * cos + block.z * sin) * scale,
          groundY + block.y * scale,
          item.z + (-block.x * sin + block.z * cos) * scale
        );
        dummy.quaternion.copy(yaw);
        if (block.q) dummy.quaternion.multiply(block.q);
        dummy.scale.set(block.sx * scale, block.sy * scale, block.sz * scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(cursor, dummy.matrix);
        mesh.setColorAt(cursor, block.color);
        cursor += 1;
      });
    });

    mesh.count = cursor;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [plants]);

  return (
    <group name="voxel-wild-plants">
      <instancedMesh
        ref={meshRef}
        args={[boxGeometry, blockMaterial, Math.max(capacity, 1)]}
        frustumCulled={false}
      />
    </group>
  );
}

export default function WildPlants() {
  const [version, setVersion] = useState(getPlantsVersion);

  useEffect(() => subscribePlants(() => setVersion(getPlantsVersion())), []);

  const items = useMemo(
    () => WILD_PLANTS.items.filter((plant) => plant.alive),
    [version]
  );

  return <PlantField key={version} items={items} />;
}
