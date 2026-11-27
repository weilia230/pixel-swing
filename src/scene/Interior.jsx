import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HOUSE, HOUSE_LOCAL, HOUSE_SCALE, INTERIOR, INTERIOR_LOCAL } from '../game/terrain';
import { mulberry32 } from '../utils/random';

const WALL = '#f2dfba';
const WALL_SHADE = '#dcc394';
const WAINSCOT = '#b98a5c';
const BEAM = '#6b4529';
const BED_FRAME = '#a06b3d';
const BED_FRAME_DARK = '#7d4f2a';
const MATTRESS = '#fff3e0';
const BLANKET = '#f0a7b6';
const BLANKET_LIGHT = '#f8c3cd';
const PILLOW = '#fff8ec';
const PILLOW_PINK = '#f6bccb';
const RUG = '#c46a78';
const RUG_LIGHT = '#dd8a96';
const DESK = '#a9764a';
const DESK_DARK = '#7c5230';
const MONITOR = '#2a2430';
const SCREEN = '#a8dcff';
const WHITE = '#f7f1e4';

const FLOOR_Y = 0.1;
// 房子加高 2/3 后室内墙也同步加高（3.9 → 6.5）
const WALL_H = 6.5;
const INNER_HALF_X = (INTERIOR_LOCAL.maxX - INTERIOR_LOCAL.minX) / 2;
const INNER_HALF_Z = (INTERIOR_LOCAL.maxZ - INTERIOR_LOCAL.minZ) / 2;

// 参考图 1 的木地板：暖棕长条木板、错缝横接、深色板缝
function makeFloorTexture() {
  const px = 192;
  const pz = 144;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = pz;
  const ctx = canvas.getContext('2d');
  const random = mulberry32(20260921);

  ctx.fillStyle = '#8a6344';
  ctx.fillRect(0, 0, px, pz);

  const tones = ['#c99a6e', '#c0925f', '#d3a878', '#bd8e5c', '#cfa172'];
  let x = 0;
  while (x < px) {
    const pw = 12 + Math.floor(random() * 8);
    ctx.fillStyle = tones[Math.floor(random() * tones.length)];
    ctx.fillRect(x + 1, 0, pw - 1, pz);
    ctx.fillStyle = 'rgba(255, 236, 202, 0.2)';
    ctx.fillRect(x + 1, 0, 1, pz);

    let y = Math.floor(random() * 40);
    while (y < pz - 10) {
      ctx.fillStyle = '#8a6344';
      ctx.fillRect(x + 1, y, pw - 1, 2);
      ctx.fillStyle = 'rgba(255, 238, 208, 0.16)';
      ctx.fillRect(x + 1, y + 2, pw - 1, 1);
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = 'rgba(122, 84, 52, 0.22)';
        ctx.fillRect(
          x + 2 + Math.floor(random() * Math.max(1, pw - 4)),
          y + 4 + Math.floor(random() * 10),
          1,
          2
        );
      }
      y += 36 + Math.floor(random() * 26);
    }
    if (pw > 6) {
      ctx.fillStyle = 'rgba(140, 96, 60, 0.16)';
      ctx.fillRect(x + Math.floor(pw / 2), 0, 1, pz);
    }
    x += pw;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function Box({ size, position, color, ...rest }) {
  return (
    <mesh position={position} {...rest}>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} side={2} />
    </mesh>
  );
}

// 室内坐标为「房子局部坐标」：group 定位在 HOUSE 原点，局部 x/z 加上 HOUSE 即世界坐标
export default function Interior() {
  const lantern = useRef();
  const flame = useRef();
  const northWall = useRef();
  const southWall = useRef();
  const westWall = useRef();
  const eastWall = useRef();
  const floorTexture = useMemo(() => makeFloorTexture(), []);

  useFrame(({ clock, camera }) => {
    const time = clock.elapsedTime;
    if (lantern.current) lantern.current.rotation.z = Math.sin(time * 1.1) * 0.04;
    if (flame.current) {
      const flicker = 0.88 + Math.sin(time * 7.3) * 0.07 + Math.sin(time * 3.1) * 0.05;
      flame.current.scale.setScalar(flicker);
    }

    // 娃娃屋视角：挡住相机的那面墙自动隐藏，旋转视角时始终能看进房间
    const cam = camera.position;
    const pad = 0.25;
    if (northWall.current) northWall.current.visible = cam.z > INTERIOR.minZ - pad;
    if (southWall.current) southWall.current.visible = cam.z < INTERIOR.maxZ + pad;
    if (westWall.current) westWall.current.visible = cam.x > INTERIOR.minX - pad;
    if (eastWall.current) eastWall.current.visible = cam.x < INTERIOR.maxX + pad;
  });

  return (
    <group position={[HOUSE.x, 0, HOUSE.z]} scale={HOUSE_SCALE}>
      {/* 木地板（一整块贴图，避免多块地板互相穿插） */}
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, 0]}>
        <planeGeometry args={[INNER_HALF_X * 2 + 0.4, INNER_HALF_Z * 2 + 0.4]} />
        <meshLambertMaterial map={floorTexture} />
      </mesh>

      {/* 北墙 + 白色百叶窗 + 挂画 */}
      <group ref={northWall}>
        <Box size={[INNER_HALF_X * 2 + 0.3, WALL_H, 0.16]} position={[0, FLOOR_Y + WALL_H / 2, -INNER_HALF_Z - 0.08]} color={WALL} />
        <Box size={[INNER_HALF_X * 2 + 0.3, 0.26, 0.2]} position={[0, FLOOR_Y + 0.13, -INNER_HALF_Z - 0.06]} color={WAINSCOT} />
        <Box size={[INNER_HALF_X * 2 + 0.3, 0.1, 0.19]} position={[0, FLOOR_Y + WALL_H - 0.05, -INNER_HALF_Z - 0.06]} color={BEAM} />

        {/* 百叶窗 */}
        <group position={[-1.2, FLOOR_Y + 3.2, -INNER_HALF_Z + 0.02]}>
          <Box size={[2.4, 1.9, 0.12]} position={[0, 0, 0]} color={WHITE} />
          <Box size={[2.08, 1.62, 0.06]} position={[0, 0, 0.05]} color="#ffe6bd" />
          {[-0.62, -0.42, -0.22, -0.02, 0.18, 0.38, 0.58].map((y) => (
            <group key={y}>
              <Box size={[2.08, 0.13, 0.05]} position={[0, y, 0.09]} color="#fdf7ea" />
              <Box size={[2.08, 0.03, 0.04]} position={[0, y - 0.08, 0.1]} color="#d8cbb4" />
            </group>
          ))}
          <Box size={[2.52, 0.12, 0.24]} position={[0, -1.02, 0.03]} color={WHITE} />
        </group>

        {/* 小挂画 */}
        <group position={[-4.35, FLOOR_Y + 3.5, -INNER_HALF_Z + 0.02]}>
          <Box size={[0.78, 0.94, 0.07]} position={[0, 0, 0]} color="#c9b08a" />
          <Box size={[0.64, 0.8, 0.03]} position={[0, 0, 0.045]} color="#f7ecda" />
          <Box size={[0.16, 0.16, 0.02]} position={[-0.1, 0.12, 0.06]} color="#efa9bf" />
          <Box size={[0.09, 0.2, 0.02]} position={[0.12, 0.04, 0.06]} color="#7fa06a" />
        </group>

        {/* 壁架 + 小摆件 */}
        <group position={[3.75, FLOOR_Y + 3.4, -INNER_HALF_Z + 0.02]}>
          <Box size={[1.7, 0.12, 0.46]} position={[0, 0, 0]} color={DESK} />
          <Box size={[0.42, 0.3, 0.36]} position={[-0.35, 0.21, 0.02]} color="#d1605f" />
          <Box size={[0.12, 0.34, 0.26]} position={[0.34, 0.23, 0.02]} color="#5f8f6b" />
        </group>
      </group>

      {/* 南墙（门洞两侧 + 门楣），进门时隐藏以让相机看到房间 */}
      <group ref={southWall}>
        <Box
          size={[INNER_HALF_X - 0.95 + 0.02, WALL_H, 0.16]}
          position={[-(INNER_HALF_X + 0.95) / 2, FLOOR_Y + WALL_H / 2, INNER_HALF_Z + 0.08]}
          color={WALL}
        />
        <Box
          size={[INNER_HALF_X - 0.95 + 0.02, WALL_H, 0.16]}
          position={[(INNER_HALF_X + 0.95) / 2, FLOOR_Y + WALL_H / 2, INNER_HALF_Z + 0.08]}
          color={WALL_SHADE}
        />
        <Box
          size={[1.9, WALL_H - HOUSE_LOCAL.doorHeight, 0.16]}
          position={[0, FLOOR_Y + HOUSE_LOCAL.doorHeight + (WALL_H - HOUSE_LOCAL.doorHeight) / 2, INNER_HALF_Z + 0.08]}
          color={WALL_SHADE}
        />
        <Box size={[0.2, WALL_H, 0.2]} position={[-0.98, FLOOR_Y + WALL_H / 2, INNER_HALF_Z + 0.06]} color={BEAM} />
        <Box size={[0.2, WALL_H, 0.2]} position={[0.98, FLOOR_Y + WALL_H / 2, INNER_HALF_Z + 0.06]} color={BEAM} />
      </group>

      {/* 西墙 / 东墙 */}
      <group ref={westWall}>
        <Box size={[0.16, WALL_H, INNER_HALF_Z * 2 + 0.3]} position={[-INNER_HALF_X - 0.08, FLOOR_Y + WALL_H / 2, 0]} color={WALL} />
        <Box size={[0.2, 0.26, INNER_HALF_Z * 2 + 0.3]} position={[-INNER_HALF_X - 0.06, FLOOR_Y + 0.13, 0]} color={WAINSCOT} />
        <Box size={[0.19, 0.1, INNER_HALF_Z * 2 + 0.3]} position={[-INNER_HALF_X - 0.06, FLOOR_Y + WALL_H - 0.05, 0]} color={BEAM} />
      </group>
      <group ref={eastWall}>
        <Box size={[0.16, WALL_H, INNER_HALF_Z * 2 + 0.3]} position={[INNER_HALF_X + 0.08, FLOOR_Y + WALL_H / 2, 0]} color={WALL} />
        <Box size={[0.2, 0.26, INNER_HALF_Z * 2 + 0.3]} position={[INNER_HALF_X + 0.06, FLOOR_Y + 0.13, 0]} color={WAINSCOT} />
        <Box size={[0.19, 0.1, INNER_HALF_Z * 2 + 0.3]} position={[INNER_HALF_X + 0.06, FLOOR_Y + WALL_H - 0.05, 0]} color={BEAM} />
        {/* 东墙小画 */}
        <group position={[INNER_HALF_X + 0.02, FLOOR_Y + 3.4, 1.7]} rotation={[0, -Math.PI / 2, 0]}>
          <Box size={[0.7, 0.86, 0.06]} position={[0, 0, 0]} color="#c9b08a" />
          <Box size={[0.56, 0.72, 0.03]} position={[0, 0, 0.04]} color="#f7ecda" />
          <Box size={[0.28, 0.2, 0.02]} position={[0, 0.1, 0.055]} color="#efc07f" />
        </group>
      </group>

      {/* 顶部横梁（无天花，供吊灯悬挂） */}
      {[-2.6, 0.2, 2.8].map((z) => (
        <Box key={z} size={[INNER_HALF_X * 2 + 0.3, 0.16, 0.2]} position={[0, FLOOR_Y + WALL_H - 0.02, z]} color={BEAM} />
      ))}

      {/* 中间地毯 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y + 0.012, 1.15]}>
        <planeGeometry args={[4.7, 3.1]} />
        <meshLambertMaterial color={RUG} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y + 0.018, 1.15]}>
        <planeGeometry args={[4.0, 2.5]} />
        <meshLambertMaterial color={RUG_LIGHT} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y + 0.024, 1.15]}>
        <planeGeometry args={[2.7, 1.5]} />
        <meshLambertMaterial color="#e8b0b8" />
      </mesh>

      {/* 左侧床：床头靠北，床尾朝南 */}
      <group position={[-4.45, 0, -1.0]}>
        {[-0.95, 0.95].map((x) =>
          [-1.5, 1.5].map((z) => (
            <Box key={`bl-${x}-${z}`} size={[0.17, 0.26, 0.17]} position={[x, 0.13, z]} color={BED_FRAME_DARK} />
          ))
        )}
        <Box size={[2.4, 0.3, 3.5]} position={[0, 0.32, 0]} color={BED_FRAME} />
        <Box size={[2.28, 0.24, 3.36]} position={[0, 0.56, 0]} color={MATTRESS} />
        {/* 被子 */}
        <Box size={[2.3, 0.17, 2.25]} position={[0, 0.72, 0.52]} color={BLANKET} />
        <Box size={[2.32, 0.1, 0.32]} position={[0, 0.78, -0.5]} color={BLANKET_LIGHT} />
        <Box size={[2.31, 0.09, 0.2]} position={[0, 0.66, 1.6]} color={BLANKET_LIGHT} />
        {/* 枕头（带笑脸） */}
        <Box size={[1.62, 0.22, 0.66]} position={[-0.18, 0.79, -1.18]} color={PILLOW_PINK} />
        <Box size={[1.2, 0.14, 0.4]} position={[0.62, 0.8, -1.2]} color={PILLOW} />
        <Box size={[0.07, 0.02, 0.06]} position={[-0.42, 0.91, -1.22]} color="#5a3230" />
        <Box size={[0.07, 0.02, 0.06]} position={[-0.2, 0.91, -1.22]} color="#5a3230" />
        <Box size={[0.12, 0.02, 0.04]} position={[-0.31, 0.9, -1.16]} color="#c4737d" />
        {/* 床头板 / 床尾板 */}
        <Box size={[2.42, 1.02, 0.18]} position={[0, 0.55, -1.74]} color={BED_FRAME} />
        <Box size={[2.2, 0.12, 0.2]} position={[0, 1.02, -1.74]} color={BED_FRAME_DARK} />
        <Box size={[2.42, 0.7, 0.16]} position={[0, 0.4, 1.74]} color={BED_FRAME} />
        {[-0.74, -0.37, 0, 0.37, 0.74].map((x) => (
          <Box key={`fb-${x}`} size={[0.09, 0.34, 0.18]} position={[x, 0.42, 1.74]} color={BED_FRAME_DARK} />
        ))}
        {/* 小熊玩偶 */}
        <group position={[0.5, 0.9, -1.1]}>
          <Box size={[0.3, 0.26, 0.22]} position={[0, 0, 0]} color="#e0ab72" />
          <Box size={[0.24, 0.2, 0.2]} position={[0, 0.2, 0]} color="#e8b87f" />
          <Box size={[0.07, 0.07, 0.05]} position={[-0.14, 0.29, 0]} color="#c98f57" />
          <Box size={[0.07, 0.07, 0.05]} position={[0.14, 0.29, 0]} color="#c98f57" />
          <Box size={[0.03, 0.035, 0.02]} position={[-0.06, 0.22, 0.11]} color="#3a2a20" />
          <Box size={[0.03, 0.035, 0.02]} position={[0.06, 0.22, 0.11]} color="#3a2a20" />
          <Box size={[0.06, 0.04, 0.02]} position={[0, 0.17, 0.11]} color="#b2764a" />
        </group>
      </group>

      {/* 右侧书桌 + 电脑 */}
      <group position={[4.35, 0, -1.0]}>
        <Box size={[3.3, 0.14, 1.85]} position={[0, 1.0, 0]} color={DESK} />
        <Box size={[3.3, 0.06, 1.85]} position={[0, 0.92, 0]} color={DESK_DARK} />
        {[-1.48, 1.48].map((x) =>
          [-0.72, 0.72].map((z) => (
            <Box key={`dl-${x}-${z}`} size={[0.13, 0.95, 0.13]} position={[x, 0.48, z]} color={DESK_DARK} />
          ))
        )}
        {/* 抽屉柜 */}
        <Box size={[0.82, 0.6, 1.62]} position={[1.18, 0.62, 0]} color={DESK_DARK} />
        <Box size={[0.06, 0.24, 1.5]} position={[0.78, 0.72, 0]} color={DESK} />
        <Box size={[0.06, 0.24, 1.5]} position={[0.78, 0.42, 0]} color={DESK} />
        <Box size={[0.07, 0.07, 0.07]} position={[0.75, 0.72, 0]} color="#d8a94a" />
        <Box size={[0.07, 0.07, 0.07]} position={[0.75, 0.42, 0]} color="#d8a94a" />

        {/* 显示器（朝南） */}
        <group position={[-0.1, 1.78, -0.4]}>
          <Box size={[1.62, 1.04, 0.14]} position={[0, 0, 0]} color={MONITOR} />
          <Box size={[1.44, 0.86, 0.06]} position={[0, 0, 0.07]} color={SCREEN} />
          {/* 屏幕里的像素桌面图标 */}
          <Box size={[0.14, 0.14, 0.02]} position={[-0.44, 0.2, 0.1]} color="#f7a8c0" />
          <Box size={[0.14, 0.14, 0.02]} position={[-0.2, 0.2, 0.1]} color="#ffd782" />
          <Box size={[0.14, 0.14, 0.02]} position={[0.04, 0.2, 0.1]} color="#b6e3a8" />
          <Box size={[0.9, 0.06, 0.02]} position={[-0.24, -0.24, 0.1]} color="#7fb6e0" />
          <Box size={[0.5, 0.05, 0.02]} position={[-0.44, -0.34, 0.1]} color="#a9d4ef" />
          <mesh position={[0, 0, 0.12]}>
            <planeGeometry args={[1.44, 0.86]} />
            <meshBasicMaterial color="#e6f6ff" transparent opacity={0.22} toneMapped={false} />
          </mesh>
          <Box size={[0.18, 0.22, 0.16]} position={[0, -0.62, 0]} color={MONITOR} />
          <Box size={[0.64, 0.08, 0.42]} position={[0, -0.76, 0]} color={MONITOR} />
        </group>
        {/* 键盘 / 鼠标 */}
        <Box size={[1.12, 0.06, 0.36]} position={[0, 1.1, 0.52]} color="#3a2c3a" />
        <Box size={[0.9, 0.02, 0.24]} position={[0, 1.14, 0.52]} color="#57465a" />
        <Box size={[0.17, 0.06, 0.23]} position={[0.86, 1.1, 0.54]} color={WHITE} />
        {/* 台灯 */}
        <group position={[-1.24, 1.07, -0.52]}>
          <Box size={[0.32, 0.06, 0.32]} position={[0, 0.03, 0]} color={DESK_DARK} />
          <Box size={[0.05, 0.46, 0.05]} position={[0, 0.28, 0]} color={DESK_DARK} />
          <Box size={[0.34, 0.24, 0.34]} position={[0, 0.56, 0]} color="#ffd894" />
          <Box size={[0.26, 0.06, 0.26]} position={[0, 0.44, 0]} color="#ffe9b8" />
        </group>
        {/* 书堆 + 小花瓶 */}
        <Box size={[0.36, 0.09, 0.26]} position={[0.95, 1.12, -0.55]} color="#c95f5f" />
        <Box size={[0.32, 0.08, 0.24]} position={[0.95, 1.2, -0.55]} color="#5f86c2" />
        <Box size={[0.28, 0.07, 0.22]} position={[0.95, 1.27, -0.55]} color="#d9a94e" />
        <group position={[1.28, 1.14, 0.5]}>
          <Box size={[0.16, 0.2, 0.16]} position={[0, 0, 0]} color="#e8e2d2" />
          <Box size={[0.03, 0.2, 0.03]} position={[0, 0.18, 0]} color="#6f9e72" />
          <Box size={[0.1, 0.08, 0.1]} position={[0, 0.3, 0]} color="#efa9bf" />
        </group>
        {/* 杯子 */}
        <Box size={[0.16, 0.18, 0.16]} position={[0.2, 1.12, 0.78]} color="#f7f0e2" />
      </group>

      {/* 椅子（书桌前，红色） */}
      <group position={[4.3, 0, 0.55]}>
        <Box size={[0.84, 0.1, 0.84]} position={[0, 0.51, 0]} color="#b8434a" />
        <Box size={[0.84, 0.06, 0.84]} position={[0, 0.45, 0]} color="#8e2f38" />
        <group position={[0, 0.95, 0.34]} rotation={[-0.08, 0, 0]}>
          <Box size={[0.78, 0.86, 0.12]} position={[0, 0, 0]} color="#b8434a" />
          <Box size={[0.64, 0.62, 0.06]} position={[0, 0.02, 0.07]} color="#cf5a60" />
        </group>
        {[-0.32, 0.32].map((x) =>
          [-0.32, 0.32].map((z) => (
            <Box key={`cl-${x}-${z}`} size={[0.08, 0.46, 0.08]} position={[x, 0.23, z]} color={DESK_DARK} />
          ))
        )}
        <Box size={[0.72, 0.06, 0.06]} position={[0, 0.14, 0]} color={DESK_DARK} />
      </group>

      {/* 北墙书架 */}
      <group position={[-4.6, 0, -INNER_HALF_Z + 0.36]}>
        <Box size={[1.56, 2.5, 0.12]} position={[0, FLOOR_Y + 1.25, -0.28]} color={BEAM} />
        <Box size={[0.12, 2.5, 0.56]} position={[-0.78, FLOOR_Y + 1.25, 0]} color={BEAM} />
        <Box size={[0.12, 2.5, 0.56]} position={[0.78, FLOOR_Y + 1.25, 0]} color={BEAM} />
        {[0.02, 0.62, 1.22, 1.82, 2.42].map((y) => (
          <Box key={`sh-${y}`} size={[1.58, 0.07, 0.56]} position={[0, FLOOR_Y + y, 0]} color={DESK_DARK} />
        ))}
        {[
          ['#c95f5f', -0.5, 0.72],
          ['#5f86c2', -0.32, 0.72],
          ['#d9a94e', -0.14, 0.74],
          ['#6f9e72', 0.1, 0.7],
          ['#b46ca8', 0.28, 0.73],
          ['#c95f5f', -0.45, 1.32],
          ['#6f9e72', -0.26, 1.34],
          ['#5f86c2', 0.0, 1.3],
          ['#d9a94e', 0.24, 1.33],
        ].map(([color, x, y], i) => (
          <Box key={`bk-${i}`} size={[0.14, 0.42, 0.3]} position={[x, FLOOR_Y + y, 0.02]} color={color} />
        ))}
      </group>

      {/* 床边收纳箱 + 角落绿植，让房间更充盈 */}
      <group position={[-4.9, 0, 2.3]}>
        <Box size={[1.24, 0.5, 0.66]} position={[0, 0.35, 0]} color={DESK} />
        <Box size={[1.28, 0.12, 0.7]} position={[0, 0.64, 0]} color={DESK_DARK} />
        <Box size={[0.1, 0.16, 0.06]} position={[0, 0.46, 0.35]} color="#d8a94a" />
        <Box size={[0.66, 0.08, 0.42]} position={[0, 0.74, 0]} color={BLANKET_LIGHT} />
      </group>
      <group position={[-5.05, 0, 3.65]}>
        <Box size={[0.54, 0.46, 0.54]} position={[0, 0.33, 0]} color="#c0704a" />
        <Box size={[0.58, 0.08, 0.58]} position={[0, 0.58, 0]} color="#a85d3c" />
        <Box size={[0.08, 0.56, 0.08]} position={[0, 0.86, 0]} color="#4f6a35" />
        <Box size={[0.34, 0.16, 0.34]} position={[0, 1.1, 0]} color="#5d7a3c" />
        <Box size={[0.26, 0.14, 0.26]} position={[0.1, 1.24, 0.04]} color="#4f6a35" />
        <Box size={[0.1, 0.1, 0.1]} position={[-0.12, 1.2, 0.08]} color="#f2a2c2" />
        <Box size={[0.09, 0.09, 0.09]} position={[0.16, 1.32, -0.06]} color="#f7b6cf" />
      </group>

      {/* 门口地垫 */}
      <Box size={[1.9, 0.03, 0.9]} position={[0, FLOOR_Y + 0.01, INNER_HALF_Z - 0.55]} color="#8f5f3c" />

      {/* 吊灯 */}
      <group position={[-0.1, 0, 0.35]}>
        <Box size={[0.04, 2.3, 0.04]} position={[0, 5.45, 0]} color={BEAM} />
        <group ref={lantern} position={[0, 4.0, 0]}>
          <Box size={[0.56, 0.06, 0.56]} position={[0, 0.2, 0]} color={BEAM} />
          <Box size={[0.44, 0.4, 0.44]} position={[0, 0, 0]} color="#ffd690" />
          <Box size={[0.54, 0.06, 0.54]} position={[0, -0.21, 0]} color={BEAM} />
          {[-0.24, 0.24].map((x) =>
            [-0.24, 0.24].map((z) => (
              <Box key={`ln-${x}-${z}`} size={[0.05, 0.4, 0.05]} position={[x, 0, z]} color={BEAM} />
            ))
          )}
          <mesh ref={flame} position={[0, -0.02, 0]}>
            <boxGeometry args={[0.22, 0.24, 0.22]} />
            <meshBasicMaterial color="#fff2c1" toneMapped={false} />
          </mesh>
        </group>
      </group>
      <pointLight position={[-0.1, 2.9, 0.6]} color="#ffbe7c" intensity={1.25} distance={11} />
      <pointLight position={[3.1, 1.7, -1.3]} color="#ffd9a0" intensity={0.5} distance={4.5} />
    </group>
  );
}
