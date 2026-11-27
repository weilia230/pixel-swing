// 每帧复用同一组 Vector3 投影同场景名牌和最多三条聊天气泡。
// DOM 层不参与深度测试，因此远处和被地形遮挡的说话者仍然可见。
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getChatBubbles, getSceneId, net, partyColorOf } from '../game/net';
import { player } from '../game/runtime';

const HEAD_OFFSET = 1.9;
const BUBBLE_HEAD_OFFSET = HEAD_OFFSET + 0.6;
const CHAT_FADE_MS = 650;

export default function NameTagsDriver() {
  const { camera, size } = useThree();
  const vec = useRef(new THREE.Vector3());
  const cam = useRef(new THREE.Vector3());
  const previousBubbleElements = useRef(new Set());

  useFrame(() => {
    const w = size.width;
    const h = size.height;
    const myScene = getSceneId();
    cam.current.copy(camera.position);

    for (const peer of Object.values(net.peers)) {
      const el = document.getElementById(`net-label-${peer.id}`);
      if (!el) continue;
      if (
        !net.roomCode ||
        !peer.render ||
        !peer.state ||
        (peer.state.scene || 'overworld') !== myScene
      ) {
        el.style.display = 'none';
        continue;
      }
      const r = peer.render;
      vec.current.set(r.x, r.y + HEAD_OFFSET, r.z);
      vec.current.project(camera);
      const behind = vec.current.z > 1;
      let nx = vec.current.x;
      let ny = vec.current.y;
      const onScreen = !behind && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;

      const party = partyColorOf(peer.name) || 'transparent';
      el.style.setProperty('--party', party);

      if (onScreen) {
        const dist = Math.hypot(
          r.x - cam.current.x,
          r.y + HEAD_OFFSET - cam.current.y,
          r.z - cam.current.z
        );
        const fs = Math.max(10, Math.round(13 - dist / 180));
        const x = (nx * 0.5 + 0.5) * w;
        const y = (-ny * 0.5 + 0.5) * h;
        el.style.display = '';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.setProperty('--fs', `${fs}px`);
        el.classList.remove('is-offscreen');
      } else {
        if (behind) {
          nx = -nx;
          ny = -ny;
        }
        const ang = Math.atan2(ny, nx);
        const cx = Math.max(-0.93, Math.min(0.93, nx));
        const cy = Math.max(-0.93, Math.min(0.93, ny));
        const x = (cx * 0.5 + 0.5) * w;
        const y = (-cy * 0.5 + 0.5) * h;
        el.style.display = '';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.setProperty('--arrow-rot', `${ang}rad`);
        el.style.setProperty('--fs', '12px');
        el.classList.add('is-offscreen');
      }
    }

    const now = Date.now();
    const currentBubbleElements = new Set();
    for (const bubble of getChatBubbles()) {
      const el = document.getElementById(`chat-bubble-${bubble.from}`);
      if (!el) continue;
      currentBubbleElements.add(el);
      const isLocal = String(bubble.from) === String(net.myId);
      const peer = isLocal ? null : net.peers[bubble.from];
      const position = isLocal ? player.position : peer?.render || peer?.state;
      if (!position) {
        el.style.display = 'none';
        continue;
      }

      vec.current.set(position.x, position.y + BUBBLE_HEAD_OFFSET, position.z);
      vec.current.project(camera);
      const onScreen =
        vec.current.z <= 1 &&
        vec.current.z >= -1 &&
        Math.abs(vec.current.x) <= 1.08 &&
        Math.abs(vec.current.y) <= 1.08;
      if (!onScreen) {
        el.style.display = 'none';
        continue;
      }

      const remaining = Math.max(0, bubble.expiresAt - now);
      el.style.display = '';
      el.style.left = `${(vec.current.x * 0.5 + 0.5) * w}px`;
      el.style.top = `${(-vec.current.y * 0.5 + 0.5) * h}px`;
      el.style.opacity = String(Math.min(1, remaining / CHAT_FADE_MS));
      el.classList.toggle('is-fading', remaining <= CHAT_FADE_MS);
    }

    previousBubbleElements.current.forEach((el) => {
      if (!currentBubbleElements.has(el)) el.style.display = 'none';
    });
    previousBubbleElements.current = currentBubbleElements;
  });

  return null;
}
