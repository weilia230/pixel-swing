import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NEIGHBOR_FARMS, heightAt } from '../game/terrain';
import { worldTime } from '../game/time';

const SKIN = '#f0c9a0';
const HAIR = '#c9c9c4';
const PANTS = '#4a4a52';

function makeTextSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}

function drawBubble(sprite, text) {
  const { ctx, texture, canvas } = sprite;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!text) {
    texture.needsUpdate = true;
    return;
  }
  ctx.font = 'bold 22px "Courier New", monospace';
  const width = Math.min(canvas.width - 12, ctx.measureText(text).width + 28);
  ctx.fillStyle = 'rgba(38, 22, 30, 0.88)';
  ctx.fillRect((canvas.width - width) / 2, 16, width, 44);
  ctx.strokeStyle = '#ffd79a';
  ctx.lineWidth = 3;
  ctx.strokeRect((canvas.width - width) / 2, 16, width, 44);
  ctx.fillStyle = '#ffe9c9';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, 39);
  texture.needsUpdate = true;
}

function drawName(sprite, name) {
  const { ctx, texture, canvas } = sprite;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 24px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(30, 18, 24, 0.72)';
  ctx.fillRect(68, 24, 120, 38);
  ctx.fillStyle = '#ffeacb';
  ctx.fillText(name, 128, 43);
  texture.needsUpdate = true;
}

function VillagerBody({ accent, hair }) {
  return (
    <group>
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[0.55, 0.62, 0.34]} />
        <meshLambertMaterial color={accent} />
      </mesh>
      <mesh position={[0, 1.38, 0]}>
        <boxGeometry args={[0.4, 0.38, 0.36]} />
        <meshLambertMaterial color={SKIN} />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <boxGeometry args={[0.44, 0.14, 0.4]} />
        <meshLambertMaterial color={hair} />
      </mesh>
      <mesh position={[-0.17, 1.38, 0.19]}>
        <boxGeometry args={[0.07, 0.07, 0.03]} />
        <meshLambertMaterial color="#3a2a24" />
      </mesh>
      <mesh position={[0.17, 1.38, 0.19]}>
        <boxGeometry args={[0.07, 0.07, 0.03]} />
        <meshLambertMaterial color="#3a2a24" />
      </mesh>
      <mesh position={[-0.34, 0.94, 0]}>
        <boxGeometry args={[0.16, 0.52, 0.2]} />
        <meshLambertMaterial color={accent} />
      </mesh>
      <mesh position={[0.34, 0.94, 0]}>
        <boxGeometry args={[0.16, 0.52, 0.2]} />
        <meshLambertMaterial color={accent} />
      </mesh>
      <mesh position={[-0.14, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.5, 0.22]} />
        <meshLambertMaterial color={PANTS} />
      </mesh>
      <mesh position={[0.14, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.5, 0.22]} />
        <meshLambertMaterial color={PANTS} />
      </mesh>
      <mesh position={[-0.14, 0.05, 0.05]}>
        <boxGeometry args={[0.22, 0.1, 0.28]} />
        <meshLambertMaterial color="#5a3a2a" />
      </mesh>
      <mesh position={[0.14, 0.05, 0.05]}>
        <boxGeometry args={[0.22, 0.1, 0.28]} />
        <meshLambertMaterial color="#5a3a2a" />
      </mesh>
    </group>
  );
}

function isMealTime() {
  const [h, m] = worldTime.clock.split(':').map(Number);
  const t = h + m / 60;
  return (t >= 7 && t < 9) || (t >= 11.5 && t < 13.5) || (t >= 17.5 && t < 19.5);
}

// 农户：白天在自家田里走动念叨，夜里走回屋睡觉，饭点回家吃饭
function Villager({ farm }) {
  const group = useRef();
  const body = useRef();
  const nameSprite = useMemo(() => makeTextSprite(), []);
  const talkSprite = useMemo(() => makeTextSprite(), []);
  const nameRef = useRef();
  const talkRef = useRef();
  const state = useRef({
    x: farm.center.x + 2,
    z: farm.center.z + 2,
    targetX: farm.center.x + 2,
    targetZ: farm.center.z + 2,
    mode: 'wander', // wander | home | eat | idle
    idle: 1 + Math.random() * 3,
    talk: '',
    talkUntil: 0,
    nextTalk: performance.now() + 6000,
    nextWander: 0,
    visible: true,
    yaw: 0,
  });

  useMemo(() => {
    drawName(nameSprite, farm.npc);
    drawBubble(talkSprite, '');
  }, [farm.npc, nameSprite, talkSprite]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const s = state.current;
    const now = performance.now();
    const door = { x: farm.house.x, z: farm.house.z + farm.house.depth / 2 + 0.9 };
    const night = worldTime.phase === 'night' || worldTime.phase === 'dusk';
    const meal = isMealTime();

    if (night && s.mode !== 'home' && s.mode !== 'sleeping') {
      s.mode = 'home';
      s.talk = '该睡觉了…';
      s.talkUntil = now + 3000;
      drawBubble(talkSprite, s.talk);
    } else if (!night && meal && s.mode === 'wander' && now > s.nextTalk) {
      s.talk = '该吃饭了…';
      s.talkUntil = now + 3000;
      drawBubble(talkSprite, s.talk);
      s.nextTalk = now + 20000;
    } else if (!night && !meal && s.mode === 'wander' && now > s.nextTalk) {
      const chatter = farm.chatter[Math.floor(Math.random() * farm.chatter.length)];
      s.talk = chatter;
      s.talkUntil = now + 3000;
      drawBubble(talkSprite, s.talk);
      s.nextTalk = now + 13000 + Math.random() * 9000;
    }

    if (s.talk && now > s.talkUntil) {
      s.talk = '';
      drawBubble(talkSprite, '');
    }

    // 夜间回家：连续走到门口后进屋（不做坐标瞬移）
    if (s.mode === 'home' || s.mode === 'sleeping') {
      if (s.mode === 'home') {
        const dx = door.x - s.x;
        const dz = door.z - s.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.6) {
          s.x += (dx / dist) * dt * 2.6;
          s.z += (dz / dist) * dt * 2.6;
          s.yaw = Math.atan2(dx, dz);
        } else {
          s.mode = 'sleeping';
          s.visible = false;
        }
      } else if (!night) {
        // 天亮后从门口走出来，继续到田里干活
        s.mode = 'wander';
        s.visible = true;
        s.x = door.x;
        s.z = door.z;
        s.talk = '天亮啦，去看看庄稼…';
        s.talkUntil = now + 3000;
        drawBubble(talkSprite, s.talk);
      }
    } else if (s.mode === 'wander') {
      if (s.idle > 0) {
        s.idle -= dt;
      } else {
        const dx = s.targetX - s.x;
        const dz = s.targetZ - s.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.8) {
          s.idle = 2 + Math.random() * 4;
          const angle = Math.random() * Math.PI * 2;
          const reach = 4 + Math.random() * 6;
          s.targetX = farm.center.x + Math.cos(angle) * reach;
          s.targetZ = farm.center.z + 1 + Math.sin(angle) * 4.6;
        } else {
          s.x += (dx / dist) * dt * 2.3;
          s.z += (dz / dist) * dt * 2.3;
          s.yaw = Math.atan2(dx, dz);
        }
      }
    }

    if (group.current) {
      group.current.visible = s.visible;
      group.current.position.set(s.x, heightAt(s.x, s.z), s.z);
      group.current.rotation.y = s.yaw;
      if (body.current) body.current.position.y = Math.abs(Math.sin(now * 0.004)) * 0.03;
    }
    if (talkRef.current) talkRef.current.visible = !!s.talk;
  });

  return (
    <group ref={group}>
      <group ref={body} scale={2}>
        <VillagerBody accent={farm.accent} hair={HAIR} />
      </group>
      <sprite ref={nameRef} position={[0, 4.7, 0]} scale={[4.8, 1.8, 1]}>
        <spriteMaterial map={nameSprite.texture} transparent depthTest={false} />
      </sprite>
      <sprite ref={talkRef} position={[0, 6.0, 0]} scale={[7.2, 2.7, 1]} visible={false}>
        <spriteMaterial map={talkSprite.texture} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

export default function Villagers() {
  return (
    <group>
      {NEIGHBOR_FARMS.map((farm) => (
        <Villager key={farm.id} farm={farm} />
      ))}
    </group>
  );
}
