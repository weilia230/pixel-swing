import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Sky from './Sky';
import Mountains from './Mountains';
import Lake from './Lake';
import Ground from './Ground';
import MountainWorld from './MountainWorld';
import SkyGrassSample from './SkyGrassSample';
import Sakura from './Sakura';
import SmallSakura from './SmallSakura';
import Swing from './Swing';
import Fireflies from './Fireflies';
import Player from './Player';
import House from './House';
import Warehouse from './Warehouse';
import Farm from './Farm';
import Forest from './Forest';
import NeighborFarms from './NeighborFarms';
import WildPlants from './WildPlants';
import Villagers from './Villagers';
import Rain from './Rain';
import Rabbits from './Rabbits';
import Moles from './Moles';
import Stones from './Stones';
import Pickups from './Pickups';
import Interior from './Interior';
import SurvivalDriver from './SurvivalDriver';
import RemotePlayers from './RemotePlayers';
import NameTagsDriver from './NameTagsDriver';
import TeleportFx from './TeleportFx';
import { bubble, autopilot, cameraView, HIP_HEIGHT, player, SPAWN, userActivity } from '../game/runtime';
import { CAMERA_LIMITS } from '../game/runtime';
import { SAKURA, HOUSE, WAREHOUSE, heightAt } from '../game/terrain';
import { nearestRabbit } from '../game/rabbits';
import { updateWeather, updateWorldTime, weather, worldTime } from '../game/time';
import { updateCrops } from '../game/crops';
import {
  applyRainToPlants,
  updateMushroomRespawns,
  updatePlants,
} from '../game/wildplants';

// 室外与室内两套相机基座：跟随角色时在两者间柔和过渡
const OUTDOOR_BASE = {
  position: new THREE.Vector3(0.6, 5.0, 17.6),
  target: new THREE.Vector3(0.9, 2.5, 1.0),
  fov: 38,
};
const OUTDOOR_BASE_PORTRAIT = {
  position: new THREE.Vector3(0.8, 6.2, 25.0),
  target: new THREE.Vector3(0.9, 3.0, 2.0),
  fov: 52,
};
// target 以房间中心为基准，室内只做轻量跟随（follow 系数 0.28），
// 这样整间卧室始终在画面里，角色走动时也有细微跟随感，不会走出视野
// 房子整体放大一倍后，室内相机相应抬高后退
const INDOOR_BASE = {
  position: new THREE.Vector3(HOUSE.x, 22.0, HOUSE.z + 21.0),
  target: new THREE.Vector3(HOUSE.x, 3.2, HOUSE.z),
  fov: 52,
};
// 竖屏时水平视野更窄，相机再后退抬高，保证整间卧室不被裁切
const INDOOR_BASE_PORTRAIT = {
  position: new THREE.Vector3(HOUSE.x, 29.0, HOUSE.z + 29.0),
  target: new THREE.Vector3(HOUSE.x, 3.4, HOUSE.z),
  fov: 54,
};

// 仓库更小，室内相机距离近一点
const WAREHOUSE_BASE = {
  position: new THREE.Vector3(WAREHOUSE.x, 8.8, WAREHOUSE.z + 8.6),
  target: new THREE.Vector3(WAREHOUSE.x, 1.3, WAREHOUSE.z),
  fov: 54,
};
const WAREHOUSE_BASE_PORTRAIT = {
  position: new THREE.Vector3(WAREHOUSE.x, 11.8, WAREHOUSE.z + 12.6),
  target: new THREE.Vector3(WAREHOUSE.x, 1.4, WAREHOUSE.z),
  fov: 54,
};

const PETAL_COLORS = [0xffc0d4, 0xffd6e2, 0xffeaf0, 0xffaac4];

function CameraSetup() {
  const { camera, size } = useThree();
  const base = useRef({
    position: OUTDOOR_BASE.position.clone(),
    target: OUTDOOR_BASE.target.clone(),
    fov: OUTDOOR_BASE.fov,
    portrait: false,
  });
  const followRef = useRef({ x: SPAWN.x, z: SPAWN.z, y: HIP_HEIGHT + 0.55 });

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    base.current.portrait = aspect < 1;
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // 阻尼：视角转到目标值的速度更快一些，跟手但不飘
    const look = Math.min(1, dt * 11);
    const smooth = Math.min(1, dt * 6); // 基座过渡用的柔阻尼

    // yaw 不做取模，允许连续转圈（sin/cos 天然周期）
    cameraView.yaw += (cameraView.yawTarget - cameraView.yaw) * look;
    cameraView.pitch += (cameraView.pitchTarget - cameraView.pitch) * look;
    cameraView.zoom += (cameraView.zoomTarget - cameraView.zoom) * look;

    const insideKind = player.insideKind;
    const inside = !!insideKind;
    const portrait = base.current.portrait;
    const outdoor = portrait ? OUTDOOR_BASE_PORTRAIT : OUTDOOR_BASE;
    const indoor =
      insideKind === 'warehouse'
        ? portrait
          ? WAREHOUSE_BASE_PORTRAIT
          : WAREHOUSE_BASE
        : portrait
        ? INDOOR_BASE_PORTRAIT
        : INDOOR_BASE;
    const desired = inside ? indoor : outdoor;
    base.current.position.lerp(desired.position, smooth * 0.6);
    base.current.target.lerp(desired.target, smooth * 0.6);

    const targetFov = inside ? indoor.fov : outdoor.fov;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * smooth;
      camera.updateProjectionMatrix();
    }

    const { position, target } = base.current;
    // 平滑跟随：角色走动、进出房间、瞬移时镜头都不会猛冲
    const follow = followRef.current;
    const centerX = insideKind === 'warehouse' ? WAREHOUSE.x : HOUSE.x;
    const centerZ = insideKind === 'warehouse' ? WAREHOUSE.z : HOUSE.z;
    // 室外：焦点始终等于角色位置，人物稳定停在画面正中；室内保留轻量跟随
    const wantX = inside ? (player.position.x - centerX) * 0.45 : player.position.x;
    const wantZ = inside ? (player.position.z - centerZ) * 0.45 : player.position.z;
    const followK = Math.min(1, dt * 12);
    follow.x += (wantX - follow.x) * followK;
    follow.z += (wantZ - follow.z) * followK;
    // 高度也做平滑，跳跃时镜头不会上下弹动
    follow.y += (player.position.y + 0.55 - follow.y) * followK;
    const targetX = inside ? target.x + follow.x : follow.x;
    const targetZ = inside ? target.z + follow.z : follow.z;

    const offsetX = position.x - target.x;
    const offsetY = position.y - target.y;
    const offsetZ = position.z - target.z;
    const horizontal = Math.hypot(offsetX, offsetZ);
    const baseElevation = Math.atan2(offsetY, horizontal);
    const elevation = THREE.MathUtils.clamp(
      baseElevation + cameraView.pitch,
      CAMERA_LIMITS.ELEVATION_MIN,
      CAMERA_LIMITS.ELEVATION_MAX
    );

    const cos = Math.cos(cameraView.yaw);
    const sin = Math.sin(cameraView.yaw);
    const nx = offsetX / horizontal;
    const nz = offsetZ / horizontal;
    const rotX = nx * cos + nz * sin;
    const rotZ = -nx * sin + nz * cos;
    const distance = horizontal * cameraView.zoom;
    const cosElevation = Math.cos(elevation);
    // 室外焦点跟随角色胸口（已平滑），室内沿用基座高度
    const targetY = inside ? target.y : follow.y;

    camera.position.set(
      targetX + rotX * distance * cosElevation,
      targetY + Math.sin(elevation) * distance,
      targetZ + rotZ * distance * cosElevation
    );
    // 检查镜头到角色之间的地形视线，避免镜头穿山或被中间台阶挡住
    if (inside) {
      if (camera.position.y < 0.9) camera.position.y = 0.9;
    } else {
      for (let i = 1; i <= 6; i += 1) {
        const t = i / 6;
        const sampleX = targetX + (camera.position.x - targetX) * t;
        const sampleZ = targetZ + (camera.position.z - targetZ) * t;
        const floorY = heightAt(sampleX, sampleZ) + 1.0;
        const lineY = targetY + (camera.position.y - targetY) * t;
        if (lineY < floorY) camera.position.y += (floorY - lineY) / t;
      }
    }
    camera.lookAt(targetX, targetY, targetZ);
  });

  return null;
}

// 双击小女孩：由手势层派发事件，这里用射线确认是否真的点到她
function GirlPicker({ onGirlDoubleClick }) {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const hitsGirl = (event) => {
      const rect = gl.domElement.getBoundingClientRect();
      pointer.x = ((event.detail.x - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.detail.y - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (let i = 0; i < hits.length; i += 1) {
        let node = hits[i].object;
        while (node) {
          if (node.name === 'girl') return true;
          node = node.parent;
        }
      }
      return false;
    };

    const onPick = (event) => {
      if (hitsGirl(event)) onGirlDoubleClick();
    };

    // 长按角色：命中才派发，交给 App 执行进食
    const onLongPress = (event) => {
      if (hitsGirl(event)) {
        window.dispatchEvent(new CustomEvent('girl-longpress'));
      }
    };

    window.addEventListener('scene-girl-pick', onPick);
    window.addEventListener('scene-girl-longpress', onLongPress);
    return () => {
      window.removeEventListener('scene-girl-pick', onPick);
      window.removeEventListener('scene-girl-longpress', onLongPress);
    };
  }, [camera, gl, scene, onGirlDoubleClick]);

  return null;
}

// 关键词花瓣彩蛋：监听到 petal-burst 事件时，从樱花树上空洒落一波动态花瓣
function PetalBurst() {
  const COUNT = 72;
  const meshRef = useRef();
  const dummy = useRef(new THREE.Object3D());
  const color = useRef(new THREE.Color());
  const petals = useRef(
    Array.from({ length: COUNT }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, life: 0, max: 0, scale: 1, c: 0,
    }))
  ).current;
  const active = useRef(false);

  useEffect(() => {
    const trigger = () => {
      for (let i = 0; i < COUNT; i += 1) {
        const p = petals[i];
        p.x = SAKURA.x + (Math.random() - 0.5) * 11;
        p.z = SAKURA.z + (Math.random() - 0.5) * 11;
        p.y = 4.5 + Math.random() * 5.5;
        p.vx = (Math.random() - 0.5) * 0.5;
        p.vy = -(0.55 + Math.random() * 0.8);
        p.vz = (Math.random() - 0.5) * 0.5;
        p.rx = Math.random() * Math.PI;
        p.rz = Math.random() * Math.PI;
        p.life = 0;
        p.max = 3.5 + Math.random() * 2.5;
        p.scale = 0.7 + Math.random() * 0.8;
        p.c = PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0];
      }
      active.current = true;
      if (meshRef.current) meshRef.current.visible = true;
    };
    window.addEventListener('petal-burst', trigger);
    return () => window.removeEventListener('petal-burst', trigger);
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!active.current) {
      mesh.visible = false;
      return;
    }
    let alive = false;
    for (let i = 0; i < COUNT; i += 1) {
      const p = petals[i];
      if (p.life >= p.max) {
        dummy.current.visible = false;
        dummy.current.updateMatrix();
        mesh.setMatrixAt(i, dummy.current.matrix);
        continue;
      }
      alive = true;
      p.life += dt;
      p.x += p.vx * dt + Math.sin(p.life * 2 + i) * 0.006;
      p.z += p.vz * dt + Math.cos(p.life * 1.6 + i) * 0.006;
      p.y += p.vy * dt;
      p.rx += dt * 2.1;
      p.rz += dt * 1.4;
      if (p.y < 0.18) {
        p.y = 0.18;
        p.vy = 0;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      const fade = p.life > p.max - 0.8 ? Math.max(0, (p.max - p.life) / 0.8) : 1;
      dummy.current.visible = true;
      dummy.current.position.set(p.x, p.y, p.z);
      dummy.current.rotation.set(p.rx, 0, p.rz);
      dummy.current.scale.setScalar(p.scale * fade);
      dummy.current.updateMatrix();
      mesh.setMatrixAt(i, dummy.current.matrix);
      color.current.setHex(p.c);
      mesh.setColorAt(i, color.current);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    active.current = alive;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, COUNT]}
      visible={false}
      frustumCulled={false}
    >
      <planeGeometry args={[0.13, 0.13]} />
      <meshBasicMaterial color={0xffffff} side={THREE.DoubleSide} transparent opacity={0.95} toneMapped={false} />
    </instancedMesh>
  );
}

// 世界时间推进：昼夜、天气、作物与山野植物生长
function TimeDriver() {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.25);
    updateWorldTime(dt);
    updateCrops(dt);
    updatePlants(dt);
    updateMushroomRespawns(dt);
    const before = weather.raining;
    updateWeather(dt);
    if (!before && weather.raining) applyRainToPlants();
  });
  return null;
}

const DAY_AMBIENT = new THREE.Color('#ffe4c8');
const NIGHT_AMBIENT = new THREE.Color('#97a4d8');
const DAY_SUN = new THREE.Color('#ffc193');
const NIGHT_SUN = new THREE.Color('#9db0e0');
const DAY_WARM = new THREE.Color('#ff8f6b');
const NIGHT_WARM = new THREE.Color('#6c7bb8');

function Lighting() {
  const ambient = useRef();
  const sun = useRef();
  const warm = useRef();
  const front = useRef();

  useFrame(() => {
    const day = worldTime.daylight;
    if (ambient.current) {
      ambient.current.intensity = 0.2 + 0.76 * day;
      ambient.current.color.copy(NIGHT_AMBIENT).lerp(DAY_AMBIENT, day);
    }
    if (sun.current) {
      sun.current.intensity = 0.1 + 0.46 * day;
      sun.current.color.copy(NIGHT_SUN).lerp(DAY_SUN, day);
    }
    if (warm.current) {
      warm.current.intensity = 0.06 + 0.35 * day;
      warm.current.color.copy(NIGHT_WARM).lerp(DAY_WARM, day);
    }
    if (front.current) {
      front.current.intensity = 0.08 + 0.38 * day;
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.95} color="#ffe4c8" />
      <directionalLight ref={sun} position={[-9, 10, 7]} intensity={0.55} color="#ffc193" />
      <directionalLight ref={warm} position={[6, 6, -9]} intensity={0.4} color="#ff8f6b" />
      <directionalLight ref={front} position={[1, 5, 14]} intensity={0.45} color="#ffd8b0" />
    </>
  );
}

// 小樱头顶气泡：自主活动时念当前任务，空闲时夜晚催睡、靠近兔子说可爱
const TASK_LINES = {
  water: {
    go: ['去田里看看…', '田里的菜该浇水了…'],
    act: ['喝点水，快快长大～', '再浇一点点…'],
  },
  harvest: {
    go: ['去田里收菜…', '熟了吧？去看看…'],
    act: ['收进背包啦～', '今天收成不错…'],
  },
  feed: {
    go: ['给小兔子送萝卜…', '小兔子在哪呢…'],
    act: ['慢慢吃，小兔子～', '好可爱呀…'],
  },
  swing: {
    go: ['去荡一会儿秋千…', '想荡秋千了…'],
    act: ['自己荡起来～', '风好舒服…'],
  },
  bed: {
    go: ['该睡觉了…', '好困呀，去睡觉…'],
    act: ['躺下来睡一会儿…', '被子软软的…'],
  },
  computer: {
    go: ['去看一会儿电脑…', '黄昏电台今天放什么歌呢…'],
    act: ['这首歌真好听…', '再听一会儿…'],
  },
  forage: {
    go: ['外面好像有能采的东西…', '去采点野果野菜…'],
    act: ['采到啦～', '今天的收获真好…'],
  },
  mushroom: {
    go: ['去林子里看看蘑菇…', '说不定又冒出蘑菇了…'],
    act: ['蘑菇冒出来啦～', '留着再长一会儿…'],
  },
  waterWild: {
    go: ['野花也该喝点水…', '去给野花浇浇水…'],
    act: ['喝点水，长得更好看～'],
  },
  lake: {
    go: ['去湖边吹吹风…', '湖面应该很好看…'],
    act: ['夕阳落在水里了…', '风里有水草的味道…'],
  },
  sakura: {
    go: ['去樱花树下站一会儿…', '樱花好像又开了…'],
    act: ['花瓣落在肩上…', '樱花开得真好…'],
  },
  wander: {
    go: ['去草地上走走…', '散散步吧…'],
    act: ['风好舒服…'],
  },
};

function pickLine(kind, phase) {
  const group = TASK_LINES[kind] || TASK_LINES.wander;
  const lines = phase === 'act' ? group.act : group.go;
  return lines[Math.floor(Math.random() * lines.length)];
}

function BubbleDirector() {
  const nightNext = useRef(0);
  const cuteNext = useRef(0);
  const taskNext = useRef(0);
  const idleNext = useRef(0);

  useFrame(() => {
    const now = performance.now();
    const happy = now < (player.happyUntil || 0);

    // 自主活动：碎碎念与正在做的事保持一致
    if (autopilot.active) {
      if (now > taskNext.current) {
        bubble.text = happy ? '今天也超级开心～' : pickLine(autopilot.kind, autopilot.phase);
        bubble.until = now + 3000;
        taskNext.current = now + (happy ? 7000 : 15000);
      }
      return;
    }
    taskNext.current = now + 3000;

    if (worldTime.phase === 'night') {
      if (now > nightNext.current) {
        const lines = ['该睡觉了…', '好困呀…该睡觉了', '夜深了，该睡觉了…'];
        bubble.text = lines[Math.floor(Math.random() * lines.length)];
        bubble.until = now + 3000;
        nightNext.current = now + 55000 + Math.random() * 50000;
      }
    } else if (nightNext.current < now + 15000) {
      nightNext.current = now + 15000;
    }

    // 长时间没人操作时，偶尔自言自语一句，像自己在打发时间
    const idleLong = now - userActivity.lastInput > 25000;
    if (idleLong && !player.inside && worldTime.phase !== 'night' && now > idleNext.current) {
      const lines = [
        '风里有樱花味…',
        '今晚的云像棉花糖…',
        '小兔子都躲哪儿去了…',
        '湖面亮亮的，真好看…',
        '远处的山好像画出来的…',
        '溪水的声音好好听…',
        '有点想荡秋千了…',
        '草丛里好像有东西在动…',
      ];
      bubble.text = lines[Math.floor(Math.random() * lines.length)];
      bubble.until = now + 3000;
      idleNext.current = now + 28000 + Math.random() * 26000;
    }

    const rabbit = nearestRabbit(player.position.x, player.position.z, 2.2);
    if (rabbit && now > cuteNext.current) {
      const lines = happy
        ? ['小兔子好可爱～', '再喂一个吧～', '软软的，好开心～']
        : ['好可爱…'];
      if (happy || Math.random() < 0.5) {
        bubble.text = lines[Math.floor(Math.random() * lines.length)];
        bubble.until = now + 3000;
      }
      cuteNext.current = now + (happy ? 9000 : 26000);
    }
  });

  return null;
}

// 把气泡锚点投影到屏幕上，UI 层用 DOM 直接跟随
function BubbleAnchor() {
  const { camera, size } = useThree();
  const vec = useRef(new THREE.Vector3());

  useFrame(() => {
    const element = document.getElementById('sakura-bubble');
    if (!element) return;
    const now = performance.now();
    const active = bubble.text && now < bubble.until;
    if (!active) {
      element.classList.remove('is-on');
      return;
    }
    vec.current.set(player.position.x, player.position.y + 1.05, player.position.z);
    vec.current.project(camera);
    if (vec.current.z > 1) {
      element.classList.remove('is-on');
      return;
    }
    if (element.textContent !== bubble.text) element.textContent = bubble.text;
    const x = (vec.current.x * 0.5 + 0.5) * size.width;
    const y = (-vec.current.y * 0.5 + 0.5) * size.height;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.classList.add('is-on');
  });

  return null;
}

// 采集反馈：像素粒子从植物位置迸出，配合 UI 层的获得提示
const BURST_COUNT = 56;
function HarvestBurst() {
  const meshRef = useRef();
  const particles = useRef(
    Array.from({ length: BURST_COUNT }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, size: 1, color: '#ffe08a',
    }))
  ).current;
  const active = useRef(false);

  useEffect(() => {
    const onBurst = (event) => {
      const { x = 0, z = 0, color = '#ffe08a' } = event.detail || {};
      const baseY = heightAt(x, z) + 1.6;
      particles.forEach((p) => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.0 + Math.random() * 2.6;
        p.x = x + (Math.random() - 0.5) * 0.7;
        p.y = baseY + Math.random() * 0.7;
        p.z = z + (Math.random() - 0.5) * 0.7;
        p.vx = Math.cos(angle) * speed;
        p.vz = Math.sin(angle) * speed;
        p.vy = 2.2 + Math.random() * 3.2;
        p.life = 0;
        p.max = 0.55 + Math.random() * 0.55;
        p.size = 0.5 + Math.random() * 0.9;
        p.color = Math.random() > 0.35 ? color : '#fff3c8';
      });
      active.current = true;
      if (meshRef.current) meshRef.current.visible = true;
    };
    window.addEventListener('harvest-burst', onBurst);
    return () => window.removeEventListener('harvest-burst', onBurst);
  }, [particles]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!active.current) {
      mesh.visible = false;
      return;
    }
    let alive = false;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let i = 0; i < BURST_COUNT; i += 1) {
      const p = particles[i];
      if (p.life >= p.max) {
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      alive = true;
      p.life += dt;
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const fade = Math.max(0, 1 - p.life / p.max);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.life * 4, p.life * 3, 0);
      dummy.scale.setScalar(p.size * fade);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tint.set(p.color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    active.current = alive;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, BURST_COUNT]} visible={false} frustumCulled={false}>
      <boxGeometry args={[0.18, 0.18, 0.18]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </instancedMesh>
  );
}

export default function Scene({ seated, activity, onGirlDoubleClick }) {
  return (
    <>
      <CameraSetup />
      <TimeDriver />
      <BubbleDirector />
      <SurvivalDriver />

      <Sky />
      <Mountains />
      <Lake />
      <Ground />
      <MountainWorld />
      <SkyGrassSample />
      <Forest />
      <NeighborFarms />
      <WildPlants />
      <Villagers />
      <House />
      <Warehouse />
      <Interior />
      <Farm />
      <Sakura />
      <SmallSakura />
      <Swing />
      <Rabbits />
      {/* 鼹鼠暂不投放，等场景确认后再放 */}
      <Stones />
      <Pickups />
      <Fireflies />
      <Rain />
      <Player seated={seated} activity={activity} />
      <HarvestBurst />
      <PetalBurst />
      <GirlPicker onGirlDoubleClick={onGirlDoubleClick} />
      <BubbleAnchor />

      {/* 联机：远程玩家渲染 + 头顶名牌投影 + 传送特效；离线时空渲染，不影响单机 */}
      <RemotePlayers />
      <NameTagsDriver />
      <TeleportFx />

      <Lighting />
    </>
  );
}
