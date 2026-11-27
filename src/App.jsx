import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import Scene from './scene/Scene';
import Controls from './ui/Controls';
import Dialogue from './ui/Dialogue';
import FriendsPanel from './ui/FriendsPanel';
import NetOverlay from './ui/NetOverlay';
import TeleportPanel from './ui/TeleportPanel';
import { SavePanel } from './ui/SavePanel';
import Computer from './ui/Computer';
import Inventory from './ui/Inventory';
import SurvivalHud from './ui/SurvivalHud';
import {
  autopilot,
  bubble,
  cameraView,
  CAMERA_LIMITS,
  gate,
  HIP_HEIGHT,
  houseDoor,
  input,
  player,
  resetInput,
  swing,
  userActivity,
  warehouseDoor,
} from './game/runtime';
import { DOOR, INTERIOR, WAREHOUSE_DOOR, WAREHOUSE_INTERIOR, waterLevelAt } from './game/terrain';
import {
  ITEMS,
  addItem,
  addItemStack,
  consumeWater,
  fillWaterCan,
  hasBagSpace,
  held,
  removeOne,
  waterCan,
} from './game/inventory';
import { healPlayer, survival } from './game/survival';
import { SURVIVAL } from './game/survivalConfig';
import { harvestCrop, sowCrop, waterCrop } from './game/crops';
import { collectPlant, pokeMushroom, waterPlant } from './game/wildplants';
import { PLANT_STAGE_NAMES } from './game/plantsCatalog';
import { feedRabbit } from './game/rabbits';
import { feedMole, moleFeedInfo } from './game/moles';
import { collectStone } from './game/stones';
import { initSave, markSaveDirty } from './game/save';
import { MOUNTAIN_ENTRY, chopMountainTree } from './game/mountainWorld';
import './index.css';

const { PITCH_MIN, PITCH_MAX, ZOOM_MIN, ZOOM_MAX } = CAMERA_LIMITS;

// 渲染分辨率：目标像素数越大画布越锐利；上限保持像素风不过度采样
function computePixelRatio() {
  const smallest = Math.min(window.innerWidth, window.innerHeight);
  return Math.min(1, 700 / Math.max(smallest, 1));
}

// 玩家脚下或周围 2.6U 内是否有水面（舀水判定）
function isWaterNearby() {
  const { x, z } = player.position;
  if (waterLevelAt(x, z) != null) return true;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    if (waterLevelAt(x + Math.cos(angle) * 2.6, z + Math.sin(angle) * 2.6) != null) {
      return true;
    }
  }
  return false;
}

const KEY_FIELD = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

const FIELD_PAD = {
  forward: '.pad--up',
  back: '.pad--down',
  left: '.pad--left',
  right: '.pad--right',
};

function clearPadHighlights() {
  document.querySelectorAll('.pad.is-down').forEach((element) => {
    element.classList.remove('is-down');
  });
}

export default function App() {
  const [seated, setSeated] = useState(false);
  const [activity, setActivity] = useState('walk');
  const [computerOpen, setComputerOpen] = useState(false);
  const [pixelRatio, setPixelRatio] = useState(() => computePixelRatio());
  const [inside, setInside] = useState(false);
  const [nearDoor, setNearDoor] = useState(false);
  const [nearBed, setNearBed] = useState(false);
  const [nearChair, setNearChair] = useState(false);
  const [nearComputer, setNearComputer] = useState(false);
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [moveMode, setMoveMode] = useState('walk'); // walk | brisk | run
  const [nearGate, setNearGate] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  const [bagOpen, setBagOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [houseDoorOpen, setHouseDoorOpen] = useState(false);
  const [warehouseDoorOpen, setWarehouseDoorOpen] = useState(false);
  const [nearWarehouseDoor, setNearWarehouseDoor] = useState(false);
  const [nearCrop, setNearCrop] = useState(null);
  const [nearPlant, setNearPlant] = useState(null);
  const [nearRabbitId, setNearRabbitId] = useState(null);
  const [nearMoleId, setNearMoleId] = useState(null);
  const [nearStoneId, setNearStoneId] = useState(null);
  const [nearTreeId, setNearTreeId] = useState(null);
  const [moleFeed, setMoleFeed] = useState(null);
  const [nearChest, setNearChest] = useState(-1);
  const [insideKind, setInsideKind] = useState(null);
  const [heldType, setHeldType] = useState(null);
  const [nearWater, setNearWater] = useState(false);
  const [waterAmount, setWaterAmount] = useState(waterCan.amount);
  const [gain, setGain] = useState(null);
  const gainTimer = useRef(0);

  const seatedRef = useRef(false);
  const activityRef = useRef('walk');
  const computerRef = useRef(false);
  const insideRef = useRef(false);
  const dialogueRef = useRef(false);
  const layerRef = useRef(null);

  const press = useRef({
    active: false,
    x: 0,
    y: 0,
    lastX: 0,
    lastY: 0,
    time: 0,
    moved: false,
    long: false,
    mode: '',
    timer: 0,
    eatTimer: 0,
  });
  const lastTap = useRef({ time: 0, x: 0, y: 0 });

  seatedRef.current = seated;
  activityRef.current = activity;
  computerRef.current = computerOpen;
  insideRef.current = inside;
  dialogueRef.current = dialogueOpen;

  const locked = seated || activity !== 'walk' || dialogueOpen || computerOpen || bagOpen || storageOpen || saveOpen;

  // 竞走 / 跑步是互斥的开关：竞走 ×2 速度，跑步 ×3 速度
  useEffect(() => {
    player.speedMul = moveMode === 'brisk' ? 2 : moveMode === 'run' ? 3 : 1;
  }, [moveMode]);

  // 启动即恢复本地/云端存档，并开启 30 秒自动保存
  useEffect(() => {
    initSave();
  }, []);

  // 任意操作都算「用户在动」：取消小樱的自由活动，并重新开始三分钟计时
  useEffect(() => {
    const wake = () => {
      userActivity.lastInput = performance.now();
      autopilot.active = false;
      autopilot.resume = false;
      autopilot.cooldown = 0;
    };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    window.addEventListener('wheel', wake, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
      window.removeEventListener('wheel', wake);
    };
  }, []);

  // 打开对话框 / 电脑 / 背包时，小樱不会自己乱跑
  useEffect(() => {
    userActivity.paused = dialogueOpen || computerOpen || bagOpen || storageOpen;
  }, [dialogueOpen, computerOpen, bagOpen, storageOpen]);

  // 自由活动到达目的地后，只切换姿势或开关门，绝不瞬移角色坐标
  useEffect(() => {
    const onAuto = (event) => {
      const kind = event.detail?.kind;
      if (kind === 'swingSit') {
        setSeated(true);
      } else if (kind === 'swingLeave') {
        setSeated(false);
      } else if (kind === 'openDoor') {
        setHouseDoorOpen(true);
      } else if (kind === 'openGate') {
        setGateOpen(true);
      } else if (kind === 'bedSit') {
        setActivity('bedSit');
      } else if (kind === 'bedLie') {
        setActivity('bedLie');
      } else if (kind === 'computerSit') {
        setActivity('chair');
      } else if (kind === 'computerLeave') {
        setActivity('walk');
      } else if (kind === 'wakeUp') {
        setComputerOpen(false);
        setActivity('walk');
      }
    };
    window.addEventListener('sakura-auto-act', onAuto);
    return () => window.removeEventListener('sakura-auto-act', onAuto);
  }, []);

  // 自主活动过程中的碎碎念
  useEffect(() => {
    const onSay = (event) => {
      const text = event.detail?.text;
      if (!text) return;
      bubble.text = text;
      bubble.until = performance.now() + 3000;
    };
    window.addEventListener('sakura-say', onSay);
    return () => window.removeEventListener('sakura-say', onSay);
  }, []);

  // 房门 / 仓库门开关状态同步给 3D 场景
  useEffect(() => {
    houseDoor.open = houseDoorOpen;
  }, [houseDoorOpen]);

  useEffect(() => {
    warehouseDoor.open = warehouseDoorOpen;
  }, [warehouseDoorOpen]);

  const toggleMoveMode = useCallback((mode) => {
    setMoveMode((prev) => (prev === mode ? 'walk' : mode));
  }, []);

  const cycleGroundPose = useCallback(() => {
    resetInput();
    clearPadHighlights();
    setActivity((prev) => (
      prev === 'groundSit' ? 'groundLie' : prev === 'groundLie' ? 'walk' : 'groundSit'
    ));
  }, []);

  // 田埂围栏门开关：状态同步给 3D 场景（碰撞与开合动画都读它）
  useEffect(() => {
    gate.open = gateOpen;
  }, [gateOpen]);

  useEffect(() => {
    const onResize = () => setPixelRatio(computePixelRatio());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 滚轮缩放
  useEffect(() => {
    const element = layerRef.current;
    if (!element) return;
    const onWheel = (event) => {
      event.preventDefault();
      if (dialogueRef.current || computerRef.current) return;
      cameraView.zoomTarget = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, cameraView.zoomTarget + event.deltaY * 0.0016)
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // 同步玩家接近/室内状态到 UI
  useEffect(() => {
    const id = window.setInterval(() => {
      setNearDoor(player.nearDoor);
      setNearBed(player.nearBed);
      setNearChair(player.nearChair);
      setNearComputer(player.nearComputer);
      setInside(player.inside);
      setNearGate(player.nearGate);
      setNearWarehouseDoor(player.nearWarehouseDoor);
      setInsideKind(player.insideKind);
      setNearRabbitId(player.nearRabbitId);
      setNearMoleId(player.nearMoleId ?? null);
      setNearStoneId(player.nearStoneId ?? null);
      setNearTreeId(player.nearTreeId ?? null);
      setMoleFeed((prev) => {
        const next = moleFeedInfo(player.nearMoleId ?? null);
        if (!prev && !next) return prev;
        if (
          prev && next && prev.progress === next.progress &&
          prev.tamed === next.tamed && prev.following === next.following
        ) return prev;
        return next;
      });
      setNearChest(player.nearChest);
      setHeldType(held.type);
      setWaterAmount(waterCan.amount);
      setNearWater((prev) => {
        const next = isWaterNearby();
        return prev === next ? prev : next;
      });
      setNearCrop((prev) => {
        const next = player.nearCrop
          ? {
              id: player.nearCrop.id,
              name: player.nearCrop.name,
              type: player.nearCrop.type,
              stage: player.nearCrop.stage,
              watered: player.nearCrop.watered,
            }
          : null;
        if (!prev && !next) return prev;
        if (
          prev && next && prev.id === next.id && prev.type === next.type &&
          prev.stage === next.stage && prev.watered === next.watered
        ) return prev;
        return next;
      });
      setNearPlant((prev) => {
        const next = player.nearPlant
          ? {
              id: player.nearPlant.id,
              name: player.nearPlant.name,
              stage: player.nearPlant.stage,
              mushroom: player.nearPlant.mushroom,
              ready: player.nearPlant.ready,
              cooldown: player.nearPlant.cooldown,
              watered: player.nearPlant.watered,
            }
          : null;
        if (!prev && !next) return prev;
        if (
          prev && next && prev.id === next.id && prev.stage === next.stage &&
          prev.ready === next.ready && prev.mushroom === next.mushroom &&
          prev.cooldown === next.cooldown &&
          prev.watered === next.watered
        ) return prev;
        return next;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  // 键盘：WASD / 方向键移动，空格跳跃
  useEffect(() => {
    const setPad = (selector, on) => {
      const element = document.querySelector(selector);
      if (element) element.classList.toggle('is-down', on);
    };

    const blocked = (event) =>
      dialogueRef.current ||
      computerRef.current ||
      activityRef.current !== 'walk' ||
      event.target?.tagName === 'INPUT' ||
      event.target?.tagName === 'TEXTAREA';

    const onKeyDown = (event) => {
      // 按键即视为操作：躺在床上 / 秋千上时先起身再走
      if (
        !computerRef.current &&
        !dialogueRef.current &&
        (activityRef.current !== 'walk' || seatedRef.current)
      ) {
        activityRef.current = 'walk';
        seatedRef.current = false;
        setActivity('walk');
        setSeated(false);
      }
      if (blocked(event)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat || seatedRef.current) return;
        input.jump = true;
        setPad('.pad--jump', true);
        return;
      }
      const field = KEY_FIELD[event.code];
      if (!field) return;
      event.preventDefault();
      if (seatedRef.current) return;
      input[field] = true;
      setPad(FIELD_PAD[field], true);
    };

    const onKeyUp = (event) => {
      if (event.code === 'Space') {
        setPad('.pad--jump', false);
        return;
      }
      const field = KEY_FIELD[event.code];
      if (!field) return;
      input[field] = false;
      setPad(FIELD_PAD[field], false);
    };

    const clearKeys = () => {
      resetInput();
      clearPadHighlights();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
    };
  }, []);

  const sitDown = useCallback(() => {
    if (player.nearSwing) setSeated(true);
  }, []);

  const standUp = useCallback(() => {
    setSeated(false);
  }, []);

  const closeDialogue = useCallback(() => setDialogueOpen(false), []);

  const openDialogue = useCallback(() => {
    resetInput();
    clearPadHighlights();
    setDialogueOpen(true);
  }, []);

  const enterHouse = useCallback(() => {
    if (!houseDoor.open) return;
    resetInput();
    clearPadHighlights();
    setDialogueOpen(false);
    player.position.set(DOOR.x, HIP_HEIGHT, INTERIOR.maxZ - 0.7);
    player.inside = true;
  }, []);

  const exitHouse = useCallback(() => {
    resetInput();
    clearPadHighlights();
    player.position.set(DOOR.x, HIP_HEIGHT, DOOR.z + 1.5);
    player.inside = false;
    player.nearDoor = true;
  }, []);

  const enterWarehouse = useCallback(() => {
    if (!warehouseDoor.open) return;
    resetInput();
    clearPadHighlights();
    player.position.set(WAREHOUSE_DOOR.x, HIP_HEIGHT, WAREHOUSE_INTERIOR.maxZ - 0.7);
    player.inside = true;
    player.insideKind = 'warehouse';
  }, []);

  const exitWarehouse = useCallback(() => {
    resetInput();
    clearPadHighlights();
    setStorageOpen(false);
    player.position.set(WAREHOUSE_DOOR.x, HIP_HEIGHT, WAREHOUSE_DOOR.z + 1.4);
    player.inside = false;
    player.insideKind = null;
  }, []);

  // 结果期收种子、成熟期收农作物；背包满时保留作物。
  // 采集 / 采摘反馈：像素粒子 + 背包获得提示
  const showGain = useCallback((text, color) => {
    setGain({ text, color });
    window.clearTimeout(gainTimer.current);
    gainTimer.current = window.setTimeout(() => setGain(null), 2200);
    const x = player.position.x;
    const z = player.position.z;
    window.dispatchEvent(new CustomEvent('harvest-burst', { detail: { x, z, color } }));
    markSaveDirty();
  }, []);

  const doHarvest = useCallback(() => {
    if (!player.nearCrop || !hasBagSpace()) return;
    const item = harvestCrop(player.nearCrop.id);
    if (!item || !addItem(item.product)) return;
    const info = ITEMS[item.product];
    showGain(`获得 ${info?.name || '作物'} ×1`, info?.color || '#ffcf6a');
    userActivity.lastInput = performance.now();
  }, [showGain]);

  const doSow = useCallback(() => {
    if (!player.nearCrop || (held.type !== 'radishSeed' && held.type !== 'cabbageSeed')) return;
    if (sowCrop(player.nearCrop.id, held.type)) removeOne(held.type);
    userActivity.lastInput = performance.now();
    markSaveDirty();
  }, []);

  const doWater = useCallback(() => {
    if (!player.nearCrop || held.type !== 'wateringCan') return;
    if (!consumeWater()) {
      showGain('水壶空了，去水边舀水', '#6ad0ff');
      return;
    }
    waterCrop(player.nearCrop.id);
    showGain(`浇了水，水壶剩 ${waterCan.amount}/${waterCan.max}`, '#6ad0ff');
    userActivity.lastInput = performance.now();
  }, [showGain]);

  // 山野植物采集：按当前阶段产出幼苗+树枝 / 种子 / 果实
  const doCollectPlant = useCallback(() => {
    if (!player.nearPlant || !player.nearPlant.ready || !hasBagSpace()) return;
    const result = collectPlant(player.nearPlant.id);
    if (!result) return;
    result.products.forEach((type) => addItem(type));
    const first = ITEMS[result.products[0]];
    showGain(`获得 ${result.products.map((type) => ITEMS[type]?.name || '物品').join('、')}`, first?.color || '#ffe08a');
    userActivity.lastInput = performance.now();
  }, [showGain]);

  const doPokeMushroom = useCallback(() => {
    if (!player.nearPlant || !player.nearPlant.mushroom) return;
    pokeMushroom(player.nearPlant.id);
    userActivity.lastInput = performance.now();
  }, []);

  const doPlantWater = useCallback(() => {
    if (!player.nearPlant || held.type !== 'wateringCan') return;
    if (player.nearPlant.watered) return; // 已浇过就不再浪费水
    if (!consumeWater()) {
      showGain('水壶空了，去水边舀水', '#6ad0ff');
      return;
    }
    waterPlant(player.nearPlant.id);
    showGain(`浇了水，水壶剩 ${waterCan.amount}/${waterCan.max}`, '#6ad0ff');
    userActivity.lastInput = performance.now();
  }, [showGain]);

  // 舀水：手持水壶且靠近水面时把水壶灌满
  const doFillWater = useCallback(() => {
    if (held.type !== 'wateringCan') return;
    if (!isWaterNearby()) {
      showGain('要走到水边才能舀水', '#6ad0ff');
      return;
    }
    if (!fillWaterCan()) {
      showGain('水壶已经是满的', '#6ad0ff');
      return;
    }
    showGain('水壶装满了水', '#6ad0ff');
    userActivity.lastInput = performance.now();
  }, [showGain]);

  // 长按角色进食：消耗一个手持果实，补充饱腹并少量回血
  const doEat = useCallback(() => {
    const type = held.type;
    const info = type ? ITEMS[type] : null;
    if (!info || info.category !== 'fruit') {
      showGain('手上没有能吃的食物', '#e08b6a');
      return;
    }
    if (!removeOne(type)) return;
    survival.hunger = Math.min(SURVIVAL.max, survival.hunger + 18);
    healPlayer(4);
    player.happyUntil = performance.now() + 2600;
    showGain(`吃掉了${info.name}，饱腹 +18`, info.color || '#ffcf6a');
    userActivity.lastInput = performance.now();
  }, [showGain]);

  // 长按角色进食：3D 射线确认命中小樱后由 Scene 派发
  useEffect(() => {
    const onEat = () => doEat();
    window.addEventListener('girl-longpress', onEat);
    return () => window.removeEventListener('girl-longpress', onEat);
  }, [doEat]);

  // 投喂：消耗背包里的萝卜，兔子冒爱心，连续三次有机会生小兔子
  const doFeed = useCallback(() => {
    if (!player.nearRabbitId) return;
    if (!removeOne('radish')) return;
    feedRabbit(player.nearRabbitId);
    if (Math.random() < 0.3) player.happyUntil = performance.now() + 14000;
    userActivity.lastInput = performance.now();
    markSaveDirty();
  }, []);

  // 拾取地面碎石（可堆叠，单格 60）
  const doPickStone = useCallback(() => {
    if (!player.nearStoneId) return;
    const stone = collectStone(player.nearStoneId);
    if (!stone) return;
    showGain('获得 碎石 ×1', ITEMS.stone.color);
    userActivity.lastInput = performance.now();
  }, [showGain]);

  // 喂食田鼠：手持萝卜 / 白菜，累计 6 次驯服
  const doFeedMole = useCallback(() => {
    if (!player.nearMoleId) return;
    const result = feedMole(player.nearMoleId);
    if (!result.ok) return;
    if (result.tamed) showGain('田鼠被驯服了，会跟在你身后', '#ff9fb4');
    else showGain(`田鼠好感 ${result.progress}/${result.need}`, '#ffcf6a');
    userActivity.lastInput = performance.now();
    markSaveDirty();
  }, [showGain]);

  // 山地开发传送：先把所有交互状态收起，再落到中央草甸
  const teleportToMountain = useCallback(() => {
    resetInput();
    clearPadHighlights();
    autopilot.active = false;
    autopilot.resume = false;
    setSeated(false);
    setActivity('walk');
    setComputerOpen(false);
    setDialogueOpen(false);
    setBagOpen(false);
    setStorageOpen(false);
    player.inside = false;
    player.insideKind = null;
    player.mode = 'walk';
    player.jumpHeight = 0;
    player.jumpVelocity = 0;
    player.position.set(MOUNTAIN_ENTRY.x, HIP_HEIGHT, MOUNTAIN_ENTRY.z);
    window.dispatchEvent(new CustomEvent('sakura-say', { detail: { text: '到山里看看…' } }));
  }, []);

  // 调试快捷键：T 一键上山
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'KeyT' || event.repeat) return;
      if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA') return;
      teleportToMountain();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [teleportToMountain]);

  const doChopTree = useCallback(() => {
    if (!nearTreeId) return;
    const tree = chopMountainTree(nearTreeId);
    if (!tree) return;
    if (addItemStack('branch', 2)) {
      showGain('砍下木材 ×2', '#b98a5a');
    } else {
      showGain('背包已满，木材掉在地上', '#e08b6a');
    }
    userActivity.lastInput = performance.now();
  }, [nearTreeId, showGain]);

  const useBed = useCallback(() => {
    if (nearBed && activity === 'walk') setActivity('bedSit');
  }, [nearBed, activity]);

  const lieDown = useCallback(() => setActivity('bedLie'), []);
  const sitUpBed = useCallback(() => setActivity('bedSit'), []);
  const leaveBed = useCallback(() => setActivity('walk'), []);

  const useChair = useCallback(() => {
    if (nearChair && activity === 'walk') setActivity('chair');
  }, [nearChair, activity]);

  const leaveChair = useCallback(() => {
    setComputerOpen(false);
    setActivity('walk');
  }, []);

  const openComputer = useCallback(() => {
    if (activity === 'chair' && nearComputer) setComputerOpen(true);
  }, [activity, nearComputer]);

  const closeComputer = useCallback(() => setComputerOpen(false), []);

  const onPointerDown = useCallback(
    (event) => {
      if (dialogueRef.current || computerRef.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const state = press.current;
      state.active = true;
      state.x = event.clientX;
      state.y = event.clientY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      state.time = performance.now();
      state.moved = false;
      state.long = false;
      state.mode = '';
      state.timer = 0;
      window.clearTimeout(state.eatTimer);
      state.eatTimer = 0;
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // 合成事件可能没有可捕获的指针，忽略
      }

      if (seated) {
        state.timer = window.setTimeout(() => {
          if (!state.moved) {
            state.long = true;
            swing.startPush();
          }
        }, 280);
      } else {
        // 长按角色进食：静止按住 620ms 才触发（松手太早或拖动都会取消）
        state.eatTimer = window.setTimeout(() => {
          if (!state.active || state.moved || state.mode) return;
          window.dispatchEvent(
            new CustomEvent('scene-girl-longpress', {
              detail: { x: state.x, y: state.y },
            })
          );
        }, 620);
      }
    },
    [seated]
  );

  const onPointerMove = useCallback(
    (event) => {
      const state = press.current;
      if (!state.active) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;

      if (!state.mode) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx > 7 || ady > 7) {
          // 只有「靠近秋千时的竖直上/下滑」保留给坐下/起身，其余拖动都进入自由视角
          const verticalSwipe =
            ady > adx * 1.3 &&
            ((!seated && activityRef.current === 'walk' && player.nearSwing && dy < 0) ||
              (seated && dy > 0));
          state.mode = verticalSwipe ? 'swipe' : 'look';
          state.moved = true;
          state.lastX = event.clientX;
          state.lastY = event.clientY;
          window.clearTimeout(state.timer);
          window.clearTimeout(state.eatTimer);
          state.eatTimer = 0;
          if (state.long) {
            state.long = false;
            swing.stopPush();
          }
        }
      } else if (state.mode === 'look') {
        const dx2 = event.clientX - state.lastX;
        const dy2 = event.clientY - state.lastY;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        // 水平不设限、可连续转圈；竖直与水平同时生效，斜向拖动也能顺滑转向
        cameraView.yawTarget -= dx2 * 0.006;
        cameraView.pitchTarget = Math.max(
          PITCH_MIN,
          Math.min(PITCH_MAX, cameraView.pitchTarget + dy2 * 0.0032)
        );
      }

      const distance = Math.hypot(dx, dy);
      if (distance > 14) state.moved = true;
      if (state.long && distance > 46) {
        state.long = false;
        swing.stopPush();
      }
    },
    [seated]
  );

  const onPointerUp = useCallback(
    (event) => {
      const state = press.current;
      if (!state.active) return;
      state.active = false;
      window.clearTimeout(state.timer);
      window.clearTimeout(state.eatTimer);
      state.eatTimer = 0;

      if (state.mode === 'look') {
        state.mode = '';
        return;
      }

      if (state.long) {
        swing.stopPush();
        state.mode = '';
        return;
      }

      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      const distance = Math.hypot(dx, dy);
      const duration = performance.now() - state.time;
      const mode = state.mode;
      state.mode = '';

      if (distance < 18 && duration < 400) {
        const now = performance.now();
        const last = lastTap.current;
        if (
          now - last.time < 340 &&
          Math.hypot(event.clientX - last.x, event.clientY - last.y) < 32
        ) {
          lastTap.current = { time: 0, x: 0, y: 0 };
          window.dispatchEvent(
            new CustomEvent('scene-girl-pick', {
              detail: { x: event.clientX, y: event.clientY },
            })
          );
        } else {
          lastTap.current = { time: now, x: event.clientX, y: event.clientY };
        }

        // 轻点场景：尝试拾取地上的掉落物
        window.dispatchEvent(
          new CustomEvent('scene-pickup-click', {
            detail: { x: event.clientX, y: event.clientY },
          })
        );

        if (seated) swing.impulse();
        return;
      }

      if (mode === 'swipe' || (Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx) * 1.15)) {
        if (dy < 0) {
          if (!seated && activityRef.current === 'walk' && player.nearSwing) sitDown();
        } else if (seated) {
          standUp();
        }
      }
    },
    [seated, sitDown, standUp]
  );

  const onDoubleClick = useCallback((event) => {
    if (dialogueRef.current || computerRef.current) return;
    window.dispatchEvent(
      new CustomEvent('scene-girl-pick', {
        detail: { x: event.clientX, y: event.clientY },
      })
    );
  }, []);

  const onPointerCancel = useCallback(() => {
    const state = press.current;
    state.active = false;
    state.mode = '';
    window.clearTimeout(state.timer);
    window.clearTimeout(state.eatTimer);
    state.eatTimer = 0;
    swing.stopPush();
  }, []);

  // 情境操作按钮：门、仓库门、围栏门、采摘、箱子、投喂共用一行
  const showPrompt =
    activity === 'walk' &&
    !seated &&
    !dialogueOpen &&
    !computerOpen &&
    !bagOpen &&
    !storageOpen;

  // 点击画面空白处关闭对话框（点在对话框内部不关闭）
  const onAppPointerDown = useCallback(
    (event) => {
      if (!dialogueOpen) return;
      if (event.target?.closest?.('.dialogue')) return;
      closeDialogue();
    },
    [dialogueOpen, closeDialogue]
  );

  return (
    <div className="app" onPointerDownCapture={onAppPointerDown}>
      <Canvas
        flat
        dpr={pixelRatio}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ fov: 38, near: 0.15, far: 12000, position: [0.6, 4.2, 16.5] }}
      >
        <Scene seated={seated} activity={activity} onGirlDoubleClick={openDialogue} />
      </Canvas>

      <div
        ref={layerRef}
        className="gesture-layer"
        role="region"
        aria-label="场景手势区"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onDoubleClick={onDoubleClick}
      />

      <button
        type="button"
        className={`bag-btn ${bagOpen ? 'is-on' : ''}`}
        aria-pressed={bagOpen}
        aria-label="背包"
        onClick={() => setBagOpen((value) => !value)}
      >
        背包
      </button>

      <button
        type="button"
        className={`save-btn ${saveOpen ? 'is-on' : ''}`}
        aria-pressed={saveOpen}
        aria-label="存档"
        onClick={() => setSaveOpen((value) => !value)}
      >
        存档
      </button>

      <button
        type="button"
        className="mountain-btn"
        aria-label="传送到山地场景"
        onClick={teleportToMountain}
      >
        上山
      </button>

      {showPrompt && (
        <div className="prompt-row">
          {insideKind === 'house' && nearDoor && (
            <button type="button" className="act-btn" onClick={exitHouse}>出门</button>
          )}
          {!insideKind && nearDoor && !houseDoorOpen && (
            <button type="button" className="act-btn" onClick={() => setHouseDoorOpen(true)}>开门</button>
          )}
          {!insideKind && nearDoor && houseDoorOpen && (
            <>
              <button type="button" className="act-btn" onClick={enterHouse}>进门</button>
              <button type="button" className="act-btn act-btn--ghost" onClick={() => setHouseDoorOpen(false)}>关门</button>
            </>
          )}

          {insideKind === 'warehouse' && nearWarehouseDoor && (
            <button type="button" className="act-btn" onClick={exitWarehouse}>出门</button>
          )}
          {!insideKind && nearWarehouseDoor && !warehouseDoorOpen && (
            <button type="button" className="act-btn" onClick={() => setWarehouseDoorOpen(true)}>开仓库门</button>
          )}
          {!insideKind && nearWarehouseDoor && warehouseDoorOpen && (
            <>
              <button type="button" className="act-btn" onClick={enterWarehouse}>进仓库</button>
              <button type="button" className="act-btn act-btn--ghost" onClick={() => setWarehouseDoorOpen(false)}>关仓库门</button>
            </>
          )}

          {nearGate && (
            <button type="button" className="act-btn" onClick={() => setGateOpen((value) => !value)}>
              {gateOpen ? '关上围栏门' : '打开围栏门'}
            </button>
          )}

          {nearCrop?.stage === 'empty' && (heldType === 'radishSeed' || heldType === 'cabbageSeed') && (
            <button type="button" className="act-btn" onClick={doSow}>撒种</button>
          )}

          {nearCrop && nearCrop.stage !== 'empty' && nearCrop.stage !== 'mature' && heldType === 'wateringCan' && (
            <button type="button" className="act-btn" onClick={doWater} disabled={nearCrop.watered}>
              {nearCrop.watered ? '本阶段已灌溉' : `灌溉（水 ${waterAmount}/${waterCan.max}）`}
            </button>
          )}

          {nearCrop && (nearCrop.stage === 'fruiting' || nearCrop.stage === 'mature') && (
            <button type="button" className="act-btn act-btn--harvest" onClick={doHarvest}>
              {nearCrop.stage === 'fruiting' ? `采收${nearCrop.name}种子` : `采摘${nearCrop.name}`}
            </button>
          )}

          {nearPlant && nearPlant.mushroom && nearPlant.ready && (
            <button type="button" className="act-btn act-btn--harvest" onClick={doPokeMushroom}>拍一拍</button>
          )}

          {nearPlant && !nearPlant.mushroom && nearPlant.ready && (
            <button type="button" className="act-btn act-btn--harvest" onClick={doCollectPlant}>
              采集{nearPlant.name}（{PLANT_STAGE_NAMES[nearPlant.stage]}）
            </button>
          )}

          {nearPlant && !nearPlant.mushroom && !nearPlant.ready && (
            <button type="button" className="act-btn act-btn--cool" disabled>
              {nearPlant.name}恢复中 {Math.ceil(nearPlant.cooldown)}s
            </button>
          )}

          {nearPlant && !nearPlant.mushroom && heldType === 'wateringCan' && (
            <button type="button" className="act-btn" onClick={doPlantWater}>
              {nearPlant.watered ? '已浇水' : `浇水（水 ${waterAmount}/${waterCan.max}）`}
            </button>
          )}

          {heldType === 'wateringCan' && nearWater && (
            <button
              type="button"
              className="act-btn"
              onClick={doFillWater}
              disabled={waterAmount >= waterCan.max}
            >
              {waterAmount >= waterCan.max ? '水壶已满' : '舀水'}
            </button>
          )}

          {insideKind === 'warehouse' && nearChest >= 0 && (
            <button type="button" className="act-btn" onClick={() => setStorageOpen(true)}>打开箱子</button>
          )}

          {heldType === 'radish' && nearRabbitId && (
            <button type="button" className="act-btn act-btn--feed" onClick={doFeed}>投喂</button>
          )}

          {nearStoneId && (
            <button type="button" className="act-btn" onClick={doPickStone}>拾取碎石</button>
          )}

          {nearTreeId && (
            <button type="button" className="act-btn" onClick={doChopTree}>砍树</button>
          )}

          {(heldType === 'radish' || heldType === 'cabbage') && nearMoleId && moleFeed && !moleFeed.tamed && (
            <button type="button" className="act-btn act-btn--feed" onClick={doFeedMole}>
              喂食田鼠 {moleFeed.progress}/{moleFeed.need}
            </button>
          )}
        </div>
      )}

      <div className="activity-buttons">
        {activity === 'walk' && nearBed && (
          <button type="button" className="act-btn" onClick={useBed}>上床</button>
        )}
        {activity === 'walk' && nearChair && (
          <button type="button" className="act-btn" onClick={useChair}>坐椅子</button>
        )}
        {activity === 'bedSit' && (
          <>
            <button type="button" className="act-btn" onClick={lieDown}>躺下</button>
            <button type="button" className="act-btn act-btn--ghost" onClick={leaveBed}>下床</button>
          </>
        )}
        {activity === 'bedLie' && (
          <>
            <button type="button" className="act-btn" onClick={sitUpBed}>坐起</button>
            <button type="button" className="act-btn act-btn--ghost" onClick={leaveBed}>下床</button>
          </>
        )}
        {activity === 'chair' && (
          <>
            {nearComputer && (
              <button type="button" className="act-btn" onClick={openComputer}>开电脑</button>
            )}
            <button type="button" className="act-btn act-btn--ghost" onClick={leaveChair}>离椅</button>
          </>
        )}
      </div>

      <div className="speed-switch" role="group" aria-label="移动方式">
        <button
          type="button"
          className={`speed-btn ${moveMode === 'brisk' ? 'is-on' : ''}`}
          aria-pressed={moveMode === 'brisk'}
          onClick={() => toggleMoveMode('brisk')}
        >
          竞走
        </button>
        <button
          type="button"
          className={`speed-btn ${moveMode === 'run' ? 'is-on' : ''}`}
          aria-pressed={moveMode === 'run'}
          onClick={() => toggleMoveMode('run')}
        >
          跑
        </button>
      </div>

      {gain && (
        <div className="gain-toast">
          <span className="gain-toast__dot" style={{ background: gain.color }} />
          {gain.text}
        </div>
      )}

      <SurvivalHud />

      <div id="sakura-bubble" className="sakura-bubble" aria-live="polite" />

      <Inventory
        bagOpen={bagOpen}
        storageOpen={storageOpen}
        onCloseBag={() => setBagOpen(false)}
        onCloseStorage={() => setStorageOpen(false)}
      />

      <Controls
        disabled={locked}
        pose={activity}
        canPose={!seated && (activity === 'walk' || activity === 'groundSit' || activity === 'groundLie')}
        onCyclePose={cycleGroundPose}
      />

      <Computer open={computerOpen} onClose={closeComputer} />

      <Dialogue open={dialogueOpen} onClose={closeDialogue} />

      {/* 联机：好友列表面板 + 名牌/传送闪光 DOM 覆盖层 + 双击传送弹窗 */}
      <NetOverlay />
      <TeleportPanel />
      <FriendsPanel />

      {saveOpen && (
        <div className="save-panel-wrap">
          <SavePanel />
        </div>
      )}
    </div>
  );
}
