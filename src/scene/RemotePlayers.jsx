// 渲染房间内其他玩家：位置 / 朝向插值平滑，y 强制贴地（禁浮空），
// 动画状态写入一个 character 对象交给复用的 Girl 组件驱动。
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Girl from './Girl';
import { getSceneId, net } from '../game/net';
import { HIP_HEIGHT } from '../game/runtime';
import { heightAt, waterLevelAt, PLAYER_SCALE } from '../game/terrain';

const SWIM_HIP_DROP = 0.78; // 与本地玩家游泳下沉量一致
const LERP = 12; // 位置插值阻尼系数（越大越快）

function makeCharacter() {
  return {
    sitting: 0,
    lying: 0,
    walkPhase: 0,
    speed: 0,
    speedMul: 1,
    swimming: false,
    swimPhase: 0,
    activity: 'walk',
    mode: 'walk',
    happyUntil: 0,
  };
}

function RemotePeer({ peerId }) {
  const group = useRef();
  const shadow = useRef();
  const character = useRef(makeCharacter()).current;

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const g = group.current;
    if (!g) return;
    const peer = net.peers[peerId];
    if (
      !net.roomCode ||
      !peer ||
      !peer.state ||
      (peer.state.scene || 'overworld') !== getSceneId()
    ) {
      g.visible = false;
      if (shadow.current) shadow.current.visible = false;
      return;
    }
    g.visible = true;
    const st = peer.state;
    if (!peer.render) peer.render = { x: st.x, y: st.y, z: st.z, yaw: st.yaw };
    const r = peer.render;
    const k = Math.min(1, dt * LERP);

    r.x += (st.x - r.x) * k;
    r.z += (st.z - r.z) * k;
    let dyaw = st.yaw - r.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    r.yaw += dyaw * k;

    // y 贴地：同步 y 明显高于地面时视为跳跃，否则贴地形；游泳时浮在水面
    const ground = heightAt(r.x, r.z);
    let wantY;
    if (st.swimming) {
      const wl = waterLevelAt(r.x, r.z);
      wantY = wl != null ? wl - SWIM_HIP_DROP : HIP_HEIGHT + ground;
    } else if (st.y > ground + 0.4) {
      wantY = st.y;
    } else {
      wantY = HIP_HEIGHT + ground;
    }
    r.y += (wantY - r.y) * k;

    g.position.set(r.x, r.y, r.z);
    g.rotation.y = r.yaw;

    if (shadow.current) {
      shadow.current.visible = !st.swimming;
      shadow.current.position.set(r.x, ground + 0.07, r.z);
    }

    // 把动画状态同步给 Girl 读取的 character 对象
    character.sitting = st.sitting;
    character.lying = st.lying;
    character.walkPhase = st.walkPhase;
    character.speed = st.speed;
    character.speedMul = st.speedMul;
    character.swimming = st.swimming;
    character.swimPhase = st.swimPhase;
    character.activity = st.activity;
    character.mode = st.mode;
  });

  return (
    <group ref={group} scale={PLAYER_SCALE} visible={false}>
      <Girl character={character} />
      <mesh ref={shadow} rotation-x={-Math.PI / 2} visible={false}>
        <circleGeometry args={[0.68, 14]} />
        <meshBasicMaterial color="#241a2b" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function RemotePlayers() {
  const [ids, setIds] = useState([]);

  useEffect(() => {
    const tick = () => {
      const scene = getSceneId();
      const current = net.roomCode
        ? Object.values(net.peers)
            .filter((peer) => peer.state && (peer.state.scene || 'overworld') === scene)
            .map((peer) => peer.id)
        : [];
      setIds((prev) => {
        if (prev.length === current.length && prev.every((id, i) => id === current[i])) {
          return prev;
        }
        return current;
      });
    };
    const t = window.setInterval(tick, 200);
    tick();
    return () => window.clearInterval(t);
  }, []);

  return (
    <>
      {ids.map((id) => (
        <RemotePeer key={id} peerId={id} />
      ))}
    </>
  );
}
