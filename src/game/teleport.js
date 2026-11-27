// 双击名牌 / 好友列表「传送」共用的落点逻辑。
// 规则：落在好友侧方 1 格（TILE_SIZE=3U），依次尝试相邻格 / 外圈；
// 禁止落到水里、山体洞穴、地图外，以及与友方高差过大（避免卡进山体内部）。
import { player, resetInput, autopilot, HIP_HEIGHT } from './runtime';
import { heightAt, waterLevelAt, LAND } from './terrain';
import { isMountainCaveAt } from './mountainWorld';
import { TILE_SIZE } from './gridConfig';
import { getSceneId, net } from './net';

const TELEPORT_COOLDOWN = 3000;
const LOCK_MS = 420;
const PLAYER_CLEARANCE = 1.8;

function toast(text, color = '#ffd166') {
  window.dispatchEvent(new CustomEvent('net-toast', { detail: { text, color } }));
}

function isValidSpot(cx, cz, friendH) {
  if (cx < LAND.minX || cx > LAND.maxX) return false;
  if (cz > LAND.maxZ) return false;
  if (cz < -560) return false; // 地图南侧下限，避免落到前湖湖心外
  // 禁止落到水里
  if (waterLevelAt(cx, cz) != null) return false;
  // 禁止落到山体洞穴内部
  if (isMountainCaveAt(cx, cz, 1.2)) return false;
  const h = heightAt(cx, cz);
  if (!Number.isFinite(h)) return false;
  // 与友方当前地面高差过大 → 很可能在山壁另一侧或悬空，放弃
  if (Math.abs(h - friendH) > 6) return false;
  return true;
}

// 生成候选偏移：先侧方（垂直于好友朝向），再八方，逐圈外扩
function candidateOffsets(fyaw) {
  const out = [];
  const fx = -Math.sin(fyaw);
  const fz = -Math.cos(fyaw);
  const px = -fz; // 右方垂直
  const pz = fx;
  for (let ring = 1; ring <= 3; ring += 1) {
    const dist = TILE_SIZE * ring;
    out.push([px * dist, pz * dist]);
    out.push([-px * dist, -pz * dist]);
    for (let a = 0; a < 8; a += 1) {
      const ang = (a * Math.PI) / 4;
      out.push([Math.cos(ang) * dist, Math.sin(ang) * dist]);
    }
  }
  return out;
}

export function findLandingSpot(friendX, friendZ, friendYaw, occupied = []) {
  const friendH = heightAt(friendX, friendZ);
  const offsets = candidateOffsets(friendYaw || 0);
  for (const [ox, oz] of offsets) {
    const cx = friendX + ox;
    const cz = friendZ + oz;
    const overlapsPlayer = occupied.some((position) =>
      Number.isFinite(position.x) &&
      Number.isFinite(position.z) &&
      (position.x - cx) ** 2 + (position.z - cz) ** 2 < PLAYER_CLEARANCE ** 2
    );
    if (!overlapsPlayer && isValidSpot(cx, cz, friendH)) {
      return { x: cx, z: cz, y: heightAt(cx, cz) };
    }
  }
  return null;
}

export function teleportToPeer(peerId) {
  if (Date.now() - net.lastTeleportAt < TELEPORT_COOLDOWN) {
    const left = Math.ceil((TELEPORT_COOLDOWN - (Date.now() - net.lastTeleportAt)) / 1000);
    toast(`传送冷却中，${left} 秒后可再次传送`, '#ff9a6c');
    return false;
  }
  const peer = net.peers[peerId];
  if (!net.roomCode || !peer || !peer.state) {
    toast('该好友当前不在线', '#ff9a6c');
    return false;
  }
  const targetScene = peer.state.scene || 'overworld';
  if (targetScene !== getSceneId()) {
    toast('只能传送到同一场景的好友身边', '#ff9a6c');
    return false;
  }
  const occupied = Object.values(net.peers)
    .filter((other) => other.state && (other.state.scene || 'overworld') === targetScene)
    .map((other) => other.state);
  const spot = findLandingSpot(peer.state.x, peer.state.z, peer.state.yaw, occupied);
  if (!spot) {
    toast('附近没有可站立且不拥挤的落点，无法传送', '#ff9a6c');
    return false;
  }

  net.lastTeleportAt = Date.now();
  // 重置所有交互状态，避免传送到一半卡姿势
  resetInput();
  autopilot.active = false;
  autopilot.resume = false;
  autopilot.cooldown = 0;
  player.inside = false;
  player.insideKind = null;
  player.mode = 'walk';
  player.activity = 'walk';
  player.jumpHeight = 0;
  player.jumpVelocity = 0;
  player.position.set(spot.x, HIP_HEIGHT + spot.y, spot.z);
  player.teleportLockedUntil = performance.now() + LOCK_MS;

  // 触发像素闪光 + 全屏淡入淡出
  window.dispatchEvent(new CustomEvent('teleport-fx', { detail: { x: spot.x, z: spot.z } }));
  window.dispatchEvent(new CustomEvent('net-toast', { detail: { text: `已传送到 ${peer.name} 身边`, color: '#6cf0a8' } }));
  return true;
}
