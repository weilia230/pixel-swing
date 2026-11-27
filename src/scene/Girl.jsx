import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { player } from '../game/runtime';
import { held } from '../game/inventory';
import ItemModel from './ItemModel';

const SKIN = '#f7cfa9';
const SKIN_SHADE = '#eab98f';
const HAIR = '#3b241c';
const HAIR_LIGHT = '#4a2d22';
const WHITE = '#faf6ec';
const WHITE_DARK = '#e4dccb';
const DENIM = '#2f66a4';
const DENIM_DARK = '#27548a';
const DENIM_LIGHT = '#3f7ab6';
const CUFF = '#5b8fc6';
const RED = '#c31f2b';
const RED_DARK = '#8e1520';
const SHOE = '#b3262c';
const SOLE = '#6b141a';
const BRASS = '#d8a94a';
const EYE = '#2a1a16';
const BLUSH = '#f19a86';

function Box({ size, position, color, ...rest }) {
  return (
    <mesh position={position} {...rest}>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

// 两根麻花辫：四段辫节 + 红色发绳 + 发尾
function Braid({ side, braidRef }) {
  const s = side < 0 ? -1 : 1;
  return (
    <group ref={braidRef} position={[s * 0.3, -0.05, -0.06]}>
      <Box size={[0.125, 0.115, 0.13]} position={[s * 0.015, 0, 0]} color={HAIR} />
      <Box size={[0.12, 0.115, 0.125]} position={[s * 0.055, -0.1, 0.01]} color={HAIR_LIGHT} />
      <Box size={[0.11, 0.11, 0.115]} position={[s * 0.085, -0.2, 0.02]} color={HAIR} />
      <Box size={[0.075, 0.045, 0.09]} position={[s * 0.095, -0.265, 0.02]} color={RED} />
      <Box size={[0.085, 0.075, 0.085]} position={[s * 0.1, -0.325, 0.02]} color={HAIR} />
      <Box size={[0.07, 0.06, 0.07]} position={[s * 0.105, -0.39, 0.02]} color={HAIR_LIGHT} />
    </group>
  );
}

export default function Girl({ character = player } = {}) {
  const leftLeg = useRef();
  const rightLeg = useRef();
  const leftKnee = useRef();
  const rightKnee = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const body = useRef();
  const head = useRef();
  const leftBraid = useRef();
  const rightBraid = useRef();
  const handItems = useRef({});
  const normalMouth = useRef();
  const happyMouth = useRef();

  useFrame(({ clock }) => {
    const isLocal = character === player;
    const sit = character.sitting;
    const phase = character.walkPhase;
    const moving = Math.min(1, character.speed / 2.4);
    const stride = Math.sin(phase) * 0.55 * moving;
    const time = clock.elapsedTime;
    // 跑得越快，辫子越往后飘，并带一点上下甩动（惯性）
    const run = Math.min(2, Math.max(0, (character.speedMul || 1) - 1));
    const swim = character.swimming ? 1 : 0;
    const swimTime = time * 2.6;

    // 手持物品与喂兔后的张嘴笑表情：仅本地玩家有，远程玩家保持常态
    if (isLocal) {
      Object.entries(handItems.current).forEach(([type, item]) => {
        if (item) item.visible = held.type === type;
      });
      const happy = performance.now() < (character.happyUntil || 0);
      if (normalMouth.current) normalMouth.current.visible = !happy;
      if (happyMouth.current) happyMouth.current.visible = happy;
    } else {
      Object.values(handItems.current).forEach((item) => {
        if (item) item.visible = false;
      });
      if (normalMouth.current) normalMouth.current.visible = true;
      if (happyMouth.current) happyMouth.current.visible = false;
    }

    if (leftLeg.current) {
      const base = THREE.MathUtils.lerp(stride, -1.35, sit);
      leftLeg.current.rotation.x =
        base * (1 - swim) + (0.1 + Math.sin(swimTime) * 0.3) * swim;
    }
    if (rightLeg.current) {
      const base = THREE.MathUtils.lerp(-stride, -1.35, sit);
      rightLeg.current.rotation.x =
        base * (1 - swim) + (0.1 + Math.sin(swimTime + Math.PI) * 0.3) * swim;
    }
    if (leftKnee.current) {
      const base = THREE.MathUtils.lerp(
        0.08 + Math.max(0, -Math.sin(phase)) * 0.6 * moving,
        1.25,
        sit
      );
      leftKnee.current.rotation.x =
        base * (1 - swim) + (0.42 + Math.max(0, Math.sin(swimTime)) * 0.32) * swim;
    }
    if (rightKnee.current) {
      const base = THREE.MathUtils.lerp(
        0.08 + Math.max(0, Math.sin(phase)) * 0.6 * moving,
        1.25,
        sit
      );
      rightKnee.current.rotation.x =
        base * (1 - swim) + (0.42 + Math.max(0, -Math.sin(swimTime)) * 0.32) * swim;
    }
    if (leftArm.current) {
      const baseX = THREE.MathUtils.lerp(-stride * 0.85, -2.25, sit);
      const baseZ = THREE.MathUtils.lerp(0.1, 0.2, sit);
      leftArm.current.rotation.x =
        baseX * (1 - swim) + (-0.28 + Math.sin(swimTime) * 0.3) * swim;
      // 游泳时两臂向两侧张开，像在水里划水
      leftArm.current.rotation.z = baseZ * (1 - swim) + -1.28 * swim;
    }
    if (rightArm.current) {
      const baseX = THREE.MathUtils.lerp(stride * 0.85, -2.25, sit);
      const baseZ = THREE.MathUtils.lerp(-0.1, -0.2, sit);
      rightArm.current.rotation.x =
        baseX * (1 - swim) + (-0.28 - Math.sin(swimTime) * 0.3) * swim;
      rightArm.current.rotation.z = baseZ * (1 - swim) + 1.28 * swim;
    }
    if (body.current) {
      const base = THREE.MathUtils.lerp(0.03 * moving, -0.08, sit);
      body.current.rotation.x = base * (1 - swim) + -0.16 * swim;
    }
    if (head.current) {
      head.current.position.y = 0.79 + Math.abs(Math.sin(phase)) * 0.02 * moving;
      head.current.rotation.z = Math.sin(time * 1.2) * 0.01 * (1 - sit);
      head.current.rotation.x = THREE.MathUtils.lerp(0, 0.06, sit);
    }
    // 辫子惯性：移动 / 跑步时向后飘，静止时自然垂下
    const inertia = moving * (0.16 + run * 0.14);
    const flap = Math.sin(phase * 1.15) * 0.12 * moving * (0.5 + run * 0.5);
    [
      [leftBraid, -1],
      [rightBraid, 1],
    ].forEach(([ref, dir]) => {
      if (!ref.current) return;
      ref.current.rotation.x = inertia + flap * 0.55;
      ref.current.rotation.z = dir * (0.05 * moving + flap * 0.45);
    });
  });

  return (
    <group>
      {/* 白 T 恤 + 蓝色背带裤 */}
      <group ref={body}>
        {/* T 恤 */}
        <Box size={[0.44, 0.28, 0.30]} position={[0, 0.34, 0]} color={WHITE} />
        <Box size={[0.45, 0.05, 0.31]} position={[0, 0.205, 0]} color={WHITE_DARK} />
        <Box size={[0.18, 0.04, 0.30]} position={[0, 0.49, 0]} color={WHITE_DARK} />
        <Box size={[0.21, 0.05, 0.24]} position={[0, 0.505, 0.01]} color="#efe6d3" />

        {/* 背带裤裤身（宽松） */}
        <Box size={[0.46, 0.24, 0.32]} position={[0, 0.09, 0]} color={DENIM} />
        <Box size={[0.02, 0.22, 0.325]} position={[-0.225, 0.10, 0]} color={DENIM_DARK} />
        <Box size={[0.02, 0.22, 0.325]} position={[0.225, 0.10, 0]} color={DENIM_DARK} />
        <Box size={[0.47, 0.045, 0.33]} position={[0, 0.235, 0]} color={DENIM_DARK} />

        {/* 胸兜 + 肩带 + 铜扣 */}
        <Box size={[0.34, 0.26, 0.07]} position={[0, 0.36, 0.16]} color={DENIM} />
        <Box size={[0.25, 0.16, 0.025]} position={[0, 0.335, 0.197]} color="#244d80" />
        <Box size={[0.26, 0.022, 0.03]} position={[0, 0.41, 0.199]} color={DENIM_LIGHT} />
        <Box size={[0.07, 0.22, 0.06]} position={[-0.13, 0.5, 0.2]} color={DENIM} />
        <Box size={[0.07, 0.22, 0.06]} position={[0.13, 0.5, 0.2]} color={DENIM} />
        <Box size={[0.075, 0.16, 0.06]} position={[-0.13, 0.46, -0.16]} color={DENIM_DARK} />
        <Box size={[0.075, 0.16, 0.06]} position={[0.13, 0.46, -0.16]} color={DENIM_DARK} />
        <Box size={[0.055, 0.055, 0.022]} position={[-0.12, 0.43, 0.206]} color={BRASS} />
        <Box size={[0.055, 0.055, 0.022]} position={[0.12, 0.43, 0.206]} color={BRASS} />
      </group>

      {/* 头部 */}
      <group ref={head} position={[0, 0.79, 0]} scale={[1.07, 1.04, 1.03]}>
        {/* 脖子 */}
        <Box size={[0.14, 0.1, 0.14]} position={[0, -0.26, 0]} color={SKIN_SHADE} />

        {/* 脸 */}
        <Box size={[0.50, 0.46, 0.44]} position={[0, 0, 0]} color={SKIN} />

        {/* 后脑头发 */}
        <Box size={[0.54, 0.34, 0.30]} position={[0, 0.10, -0.13]} color={HAIR} />
        <Box size={[0.53, 0.17, 0.44]} position={[0, 0.18, 0.005]} color={HAIR} />
        <Box size={[0.1, 0.3, 0.36]} position={[-0.25, 0.0, -0.03]} color={HAIR} />
        <Box size={[0.1, 0.3, 0.36]} position={[0.25, 0.0, -0.03]} color={HAIR} />

        {/* 齐刘海（三块，边缘略错落） */}
        <Box size={[0.21, 0.19, 0.08]} position={[0, 0.15, 0.195]} color={HAIR} />
        <Box size={[0.17, 0.18, 0.08]} position={[-0.175, 0.14, 0.19]} color={HAIR} />
        <Box size={[0.17, 0.18, 0.08]} position={[0.175, 0.14, 0.19]} color={HAIR} />
        <Box size={[0.055, 0.17, 0.06]} position={[-0.235, 0.03, 0.20]} color={HAIR} />
        <Box size={[0.055, 0.17, 0.06]} position={[0.235, 0.03, 0.20]} color={HAIR} />

        {/* 发丝高光 */}
        <Box size={[0.05, 0.13, 0.014]} position={[-0.09, 0.17, 0.238]} color={HAIR_LIGHT} />
        <Box size={[0.032, 0.1, 0.014]} position={[0.07, 0.16, 0.238]} color={HAIR_LIGHT} />
        <Box size={[0.038, 0.07, 0.014]} position={[-0.19, 0.08, 0.238]} color={HAIR_LIGHT} />
        <Box size={[0.04, 0.16, 0.012]} position={[-0.245, 0.0, 0.172]} color={HAIR_LIGHT} />
        <Box size={[0.04, 0.16, 0.012]} position={[0.245, 0.0, 0.172]} color={HAIR_LIGHT} />
        <Box size={[0.2, 0.03, 0.012]} position={[0, 0.2, 0.238]} color="#56342a" />

        {/* 眉毛 */}
        <Box size={[0.085, 0.02, 0.014]} position={[-0.1, 0.062, 0.228]} color="#4b2c22" />
        <Box size={[0.085, 0.02, 0.014]} position={[0.1, 0.062, 0.228]} color="#4b2c22" />

        {/* 红色贝雷帽：宽帽檐 + 压扁帽身 + 帽梗 */}
        <mesh position={[0, 0.268, 0]} rotation={[0.06, 0.16, -0.06]}>
          <cylinderGeometry args={[0.315, 0.295, 0.055, 14]} />
          <meshLambertMaterial color={RED_DARK} />
        </mesh>
        <mesh
          position={[0.005, 0.296, 0]}
          scale={[1, 0.58, 1]}
          rotation={[0.06, 0.16, -0.06]}
        >
          <sphereGeometry args={[0.3, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshLambertMaterial color={RED} />
        </mesh>
        <Box size={[0.05, 0.05, 0.05]} position={[0.03, 0.487, -0.01]} color={RED_DARK} />

        {/* 五官 */}
        <Box size={[0.078, 0.105, 0.02]} position={[-0.1, -0.005, 0.222]} color={EYE} />
        <Box size={[0.078, 0.105, 0.02]} position={[0.1, -0.005, 0.222]} color={EYE} />
        <Box size={[0.03, 0.034, 0.012]} position={[-0.118, 0.022, 0.232]} color="#ffffff" />
        <Box size={[0.03, 0.034, 0.012]} position={[0.082, 0.022, 0.232]} color="#ffffff" />
        <Box size={[0.016, 0.018, 0.012]} position={[-0.086, -0.032, 0.232]} color="#ffffff" />
        <Box size={[0.016, 0.018, 0.012]} position={[0.114, -0.032, 0.232]} color="#ffffff" />

        {/* 腮红 */}
        <Box size={[0.085, 0.036, 0.014]} position={[-0.17, -0.065, 0.222]} color={BLUSH} />
        <Box size={[0.085, 0.036, 0.014]} position={[0.17, -0.065, 0.222]} color={BLUSH} />

        {/* 鼻子 + 普通微笑 / 开心张嘴笑 */}
        <Box size={[0.026, 0.022, 0.014]} position={[0, -0.035, 0.224]} color={SKIN_SHADE} />
        <group ref={normalMouth}>
          <Box size={[0.055, 0.018, 0.014]} position={[0, -0.105, 0.224]} color="#a85242" />
          <Box size={[0.018, 0.014, 0.014]} position={[-0.036, -0.092, 0.224]} color="#a85242" />
          <Box size={[0.018, 0.014, 0.014]} position={[0.036, -0.092, 0.224]} color="#a85242" />
        </group>
        <group ref={happyMouth} visible={false}>
          <Box size={[0.14, 0.105, 0.018]} position={[0, -0.105, 0.226]} color="#8e2638" />
          <Box size={[0.095, 0.035, 0.012]} position={[0, -0.135, 0.239]} color="#ef7f87" />
          <Box size={[0.026, 0.025, 0.014]} position={[-0.082, -0.065, 0.224]} color="#a85242" />
          <Box size={[0.026, 0.025, 0.014]} position={[0.082, -0.065, 0.224]} color="#a85242" />
        </group>

        <Braid side={-1} braidRef={leftBraid} />
        <Braid side={1} braidRef={rightBraid} />
      </group>

      {/* 手臂：短袖 + 肤色小臂 */}
      <group ref={leftArm} position={[-0.272, 0.46, 0.03]}>
        <Box size={[0.135, 0.15, 0.16]} position={[0, -0.055, 0]} color={WHITE} />
        <Box size={[0.145, 0.04, 0.17]} position={[0, -0.14, 0]} color={WHITE_DARK} />
        <Box size={[0.112, 0.022, 0.122]} position={[0, -0.178, 0]} color={CUFF} />
        <Box size={[0.105, 0.18, 0.115]} position={[0, -0.245, 0]} color={SKIN} />
        <Box size={[0.115, 0.095, 0.12]} position={[0, -0.365, 0]} color={SKIN} />
      </group>
      <group ref={rightArm} position={[0.272, 0.46, 0.03]}>
        <Box size={[0.135, 0.15, 0.16]} position={[0, -0.055, 0]} color={WHITE} />
        <Box size={[0.145, 0.04, 0.17]} position={[0, -0.14, 0]} color={WHITE_DARK} />
        <Box size={[0.112, 0.022, 0.122]} position={[0, -0.178, 0]} color={CUFF} />
        <Box size={[0.105, 0.18, 0.115]} position={[0, -0.245, 0]} color={SKIN} />
        <Box size={[0.115, 0.095, 0.12]} position={[0, -0.365, 0]} color={SKIN} />
      </group>

      {/* 点击背包装备的手持物品 */}
      {['radish', 'cabbage', 'radishSeed', 'cabbageSeed', 'wateringCan'].map((type) => (
        <group
          key={type}
          ref={(element) => {
            handItems.current[type] = element;
          }}
          position={[0.3, -0.17, 0.16]}
          scale={[0.8, 0.8, 0.8]}
          visible={false}
        >
          <ItemModel type={type} />
        </group>
      ))}

      {/* 双腿：宽松裤腿 + 卷边 + 红色玛丽珍鞋 */}
      <group ref={leftLeg} position={[-0.12, -0.02, 0]}>
        <Box size={[0.185, 0.22, 0.195]} position={[0, -0.11, 0]} color={DENIM} />
        <group ref={leftKnee} position={[0, -0.22, 0]}>
          <Box size={[0.175, 0.16, 0.185]} position={[0, -0.08, 0]} color={DENIM} />
          <Box size={[0.2, 0.075, 0.205]} position={[0, -0.16, 0]} color={CUFF} />
          <Box size={[0.205, 0.10, 0.30]} position={[0, -0.26, 0.045]} color={SHOE} />
          <Box size={[0.21, 0.028, 0.075]} position={[0, -0.20, 0.13]} color={SOLE} />
          <Box size={[0.165, 0.03, 0.06]} position={[0, -0.218, 0.175]} color="#cc3a3f" />
          <Box size={[0.05, 0.045, 0.02]} position={[0, -0.206, 0.178]} color={BRASS} />
          <Box size={[0.205, 0.055, 0.06]} position={[0, -0.268, -0.088]} color="#8e1520" />
          <Box size={[0.215, 0.035, 0.31]} position={[0, -0.325, 0.045]} color={SOLE} />
        </group>
      </group>
      <group ref={rightLeg} position={[0.12, -0.02, 0]}>
        <Box size={[0.185, 0.22, 0.195]} position={[0, -0.11, 0]} color={DENIM} />
        <group ref={rightKnee} position={[0, -0.22, 0]}>
          <Box size={[0.175, 0.16, 0.185]} position={[0, -0.08, 0]} color={DENIM} />
          <Box size={[0.2, 0.075, 0.205]} position={[0, -0.16, 0]} color={CUFF} />
          <Box size={[0.205, 0.10, 0.30]} position={[0, -0.26, 0.045]} color={SHOE} />
          <Box size={[0.21, 0.028, 0.075]} position={[0, -0.20, 0.13]} color={SOLE} />
          <Box size={[0.165, 0.03, 0.06]} position={[0, -0.218, 0.175]} color="#cc3a3f" />
          <Box size={[0.05, 0.045, 0.02]} position={[0, -0.206, 0.178]} color={BRASS} />
          <Box size={[0.205, 0.055, 0.06]} position={[0, -0.268, -0.088]} color="#8e1520" />
          <Box size={[0.215, 0.035, 0.31]} position={[0, -0.325, 0.045]} color={SOLE} />
        </group>
      </group>
    </group>
  );
}
