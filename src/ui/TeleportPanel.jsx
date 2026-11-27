// 双击好友名牌弹出的传送面板。与好友列表共用 teleportToPeer 逻辑。
// 传送有 3 秒冷却；可关闭取消，避免误点。
import { useEffect, useState } from 'react';
import { net, closeTeleport, getSceneId, teleportCooldownLeft } from '../game/net';
import { teleportToPeer } from '../game/teleport';

export default function TeleportPanel() {
  const [targetId, setTargetId] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const tick = () => {
      setTargetId(net.teleportTarget);
      setCooldown(teleportCooldownLeft());
    };
    const t = window.setInterval(tick, 120);
    tick();
    return () => window.clearInterval(t);
  }, []);

  if (!targetId) return null;
  const peer = net.peers[targetId];
  const name = peer?.name || '好友';
  const scene = peer?.state?.scene || 'overworld';
  const sameScene = !!peer?.state && scene === getSceneId();
  const onCooldown = cooldown > 0;

  const doTeleport = () => {
    const ok = teleportToPeer(targetId);
    if (ok) closeTeleport();
  };

  return (
    <div className="tp-backdrop" onPointerDown={(e) => e.stopPropagation()}>
      <div className="tp-panel">
        <button className="tp-close" onClick={closeTeleport} aria-label="关闭">
          ✕
        </button>
        <div className="tp-title">传送到好友身边</div>
        <div className="tp-row">
          <span className="tp-avatar" style={{ background: avatarColor(name) }} />
          <div className="tp-info">
            <div className="tp-name">{name}</div>
            <div className="tp-scene">{sceneLabel(scene)}</div>
          </div>
        </div>
        <button className="tp-go" disabled={onCooldown || !peer || !sameScene} onClick={doTeleport}>
          {onCooldown ? `冷却 ${Math.ceil(cooldown / 1000)}s` : '传送'}
        </button>
        <div className="tp-hint">
          {sameScene ? '落点在好友侧方 1 格，自动校验地形并避开其他玩家' : '仅可传送到同一场景的好友身边'}
        </div>
      </div>
    </div>
  );
}

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 62%)`;
}

function sceneLabel(scene) {
  switch (scene) {
    case 'house':
      return '在屋里';
    case 'warehouse':
      return '在仓库';
    case 'mountain':
      return '在山林';
    default:
      return '在原野';
  }
}
