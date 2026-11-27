import * as THREE from 'three';

// 角色整体放大一倍后，腰部基准高度同步 ×2
export const HIP_HEIGHT = 1.16;
export const SPAWN = { x: 0, z: 6 };

// 相机自由视角的限制：水平不限角度（可连续转圈），俯仰只防穿地
export const CAMERA_LIMITS = {
  PITCH_MIN: -0.34,
  PITCH_MAX: 1.3,
  ELEVATION_MIN: -0.05,
  ELEVATION_MAX: 1.42,
  ZOOM_MIN: 0.32,
  ZOOM_MAX: 4.6,
};

// 虚拟按键与键盘写入，角色在 useFrame 中读取
export const input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  moveX: 0,
  moveZ: 0,
  jump: false,
};

export const player = {
  position: new THREE.Vector3(SPAWN.x, HIP_HEIGHT, SPAWN.z),
  yaw: 0,
  speed: 0,
  speedMul: 1, // 1 正常 / 2 竞走 / 3 跑步
  walkPhase: 0,
  swimPhase: 0,
  swimming: false,
  jumpHeight: 0,
  jumpVelocity: 0,
  sitting: 0,
  lying: 0,
  nearSwing: false,
  nearDoor: false,
  nearGate: false,
  nearWarehouseDoor: false,
  nearBed: false,
  nearChair: false,
  nearComputer: false,
  nearCrop: null, // { id, type, name, stage, watered } 最近的地块
  nearPlant: null, // { id, name, stage, mushroom, ready } 最近的山野植物
  nearChest: -1, // 仓库里靠近的箱子序号
  nearRabbitId: null, // 最近的兔子（喂食判定）
  nearMoleId: null, // 最近的野生田鼠（喂食判定）
  nearStoneId: null, // 最近的碎石（拾取判定）
  nearTreeId: null, // 最近的可砍伐山树
  speedScale: 1, // 生存状态（低饥饿）带来的移动速度倍率
  inside: false,
  insideKind: null, // null | house | warehouse
  mode: 'walk', // walk | ground | sitIn | sitting | standUp | furnMove | furnHere | furnLeave
  activity: 'walk', // walk | groundSit | groundLie | bedSit | bedLie | chair
  transition: 0,
  happyUntil: 0, // 喂兔后开心表情的结束时间
  sleepSeconds: 0, // 完整躺在床上的累计秒数
  teleportLockedUntil: 0, // 传送落地后短时间锁输入，防卡 / 防重叠
};

// 相机轨道：水平拖动改 yaw，上下拖动改 pitch，滚轮改 zoom
export const cameraView = {
  yaw: 0,
  yawTarget: 0,
  pitch: 0,
  pitchTarget: 0,
  zoom: 1,
  zoomTarget: 1,
};


// 田埂围栏门：open 由 UI 开关控制，angle 是开合动画的角度
export const gate = {
  open: false,
  angle: 0,
};

// 房子与仓库的门：open 为当前是否开着，angle 是门板旋转动画
export const houseDoor = { open: false, angle: 0 };
export const warehouseDoor = { open: false, angle: 0 };

// 小樱头顶气泡：text 为空或超过 until 时不显示
export const bubble = { text: '', until: 0 };

// 三分钟无操作后的自由活动：小樱自己走过去完成，不瞬移
export const autopilot = {
  active: false,
  kind: '', // harvest | water | feed | swing | bed | computer | wander
  phase: '', // 当前动作阶段
  route: [], // 依次经过的路径点
  wp: 0,
  target: { x: 0, z: 0 },
  speedMul: 1, // 本任务使用走 / 竞走 / 跑
  wait: 0, // 到达后的停留倒计时
  elapsed: 0,
  stuck: 0,
  lastX: 0,
  lastZ: 0,
  rabbitId: null,
  cropId: null,
  plantId: null,
  impulseAt: 0,
  cooldown: 0, // 一件活动结束后、下一件开始前的随机间隔
  lastKind: '', // 上一件活动，避免连续重复
  resume: false, // 进入自由活动后一直循环，直到用户操作
};

// 最近一次用户操作时间；pause 在对话/电脑界面打开时置 true
export const userActivity = {
  lastInput: typeof performance !== 'undefined' ? performance.now() : 0,
  paused: false,
};

export const swing = {
  angle: 0,
  velocity: 0,
  pushing: false,
  yaw: -0.5,
  seat: new THREE.Vector3(),
  seatTop: new THREE.Vector3(),
  impulse(strength = 0.32) {
    const dir = Math.abs(this.velocity) > 0.12 ? Math.sign(this.velocity) : 1;
    this.velocity += dir * strength;
  },
  startPush() {
    this.pushing = true;
  },
  stopPush() {
    this.pushing = false;
  },
};

export function resetInput() {
  input.forward = false;
  input.back = false;
  input.left = false;
  input.right = false;
  input.moveX = 0;
  input.moveZ = 0;
  input.jump = false;
}

export function snapshotRuntime(scene = player.insideKind || 'overworld') {
  return {
    position: { x: player.position.x, y: player.position.y, z: player.position.z },
    yaw: player.yaw,
    scene,
  };
}

export function restoreRuntime(saved = {}, fallback = {}) {
  const source = saved && typeof saved === 'object' ? saved : fallback;
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const position = source.position && typeof source.position === 'object' ? source.position : base.position;
  const basePosition = base.position || { x: SPAWN.x, y: HIP_HEIGHT, z: SPAWN.z };
  const finite = (value, defaultValue) => (Number.isFinite(value) ? value : defaultValue);

  player.position.set(
    finite(position?.x, basePosition.x),
    finite(position?.y, basePosition.y),
    finite(position?.z, basePosition.z)
  );
  player.yaw = finite(source.yaw, finite(base.yaw, 0));

  const scene = ['overworld', 'mountain', 'house', 'warehouse'].includes(source.scene)
    ? source.scene
    : base.scene || 'overworld';
  player.insideKind = scene === 'house' || scene === 'warehouse' ? scene : null;
  player.inside = !!player.insideKind;

  Object.assign(player, {
    speed: 0,
    speedMul: 1,
    walkPhase: 0,
    swimPhase: 0,
    swimming: false,
    jumpHeight: 0,
    jumpVelocity: 0,
    sitting: 0,
    lying: 0,
    nearSwing: false,
    nearDoor: false,
    nearGate: false,
    nearWarehouseDoor: false,
    nearBed: false,
    nearChair: false,
    nearComputer: false,
    nearCrop: null,
    nearPlant: null,
    nearChest: -1,
    nearRabbitId: null,
    nearMoleId: null,
    nearStoneId: null,
    nearTreeId: null,
    speedScale: 1,
    mode: 'walk',
    activity: 'walk',
    transition: 0,
    happyUntil: 0,
    sleepSeconds: 0,
    teleportLockedUntil: 0,
  });

  resetInput();
  Object.assign(autopilot, {
    active: false,
    kind: '',
    phase: '',
    route: [],
    wp: 0,
    speedMul: 1,
    wait: 0,
    elapsed: 0,
    stuck: 0,
    lastX: player.position.x,
    lastZ: player.position.z,
    rabbitId: null,
    cropId: null,
    plantId: null,
    impulseAt: 0,
    cooldown: 0,
    lastKind: '',
    resume: false,
  });
  autopilot.target.x = 0;
  autopilot.target.z = 0;
  userActivity.lastInput = typeof performance !== 'undefined' ? performance.now() : 0;
  userActivity.paused = false;
  bubble.text = '';
  bubble.until = 0;
  swing.pushing = false;
  swing.velocity = 0;
}
