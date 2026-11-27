// DOM 覆盖层：同场景名牌、聊天气泡、传送淡入淡出、联机 toast 与聊天输入。
import { useEffect, useRef, useState } from 'react';
import { getChatBubbles, getSceneId, net, openTeleport } from '../game/net';
import ChatPanel from './ChatPanel';

function RemoteNameTag({ peer }) {
  const lastTap = useRef({ at: 0, x: 0, y: 0 });

  const onPointerUp = (event) => {
    event.stopPropagation();
    if (event.pointerType !== 'touch') return;
    const now = performance.now();
    const previous = lastTap.current;
    const isDoubleTap =
      now - previous.at <= 340 &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 28;
    if (isDoubleTap) {
      event.preventDefault();
      openTeleport(peer.id);
      lastTap.current = { at: 0, x: 0, y: 0 };
    } else {
      lastTap.current = { at: now, x: event.clientX, y: event.clientY };
    }
  };

  return (
    <div
      id={`net-label-${peer.id}`}
      className="net-label"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { lastTap.current = { at: 0, x: 0, y: 0 }; }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        openTeleport(peer.id);
      }}
      title={`双击传送到 ${peer.name} 身边`}
    >
      <span className="net-label__arrow" style={{ background: 'var(--party)' }} />
      <span className="net-label__name" style={{ '--party': 'var(--party)' }}>
        {peer.name}
      </span>
    </div>
  );
}

export default function NetOverlay() {
  const [peers, setPeers] = useState([]);
  const [bubbles, setBubbles] = useState([]);
  const [toast, setToast] = useState(null);
  const [fadeOn, setFadeOn] = useState(false);

  // 只挂载同场景名牌；气泡状态已按说话者去重、过期并限制为三条。
  useEffect(() => {
    const tick = () => {
      const scene = getSceneId();
      const nextPeers = net.roomCode
        ? Object.values(net.peers)
            .filter((peer) => peer.state && (peer.state.scene || 'overworld') === scene)
            .map((peer) => ({ id: peer.id, name: peer.name }))
        : [];
      setPeers((previous) =>
        previous.length === nextPeers.length &&
        previous.every((peer, index) =>
          peer.id === nextPeers[index].id && peer.name === nextPeers[index].name
        )
          ? previous
          : nextPeers
      );

      const nextBubbles = getChatBubbles();
      setBubbles((previous) =>
        previous.length === nextBubbles.length &&
        previous.every((bubble, index) => bubble.mid === nextBubbles[index].mid)
          ? previous
          : nextBubbles
      );
    };
    const timer = window.setInterval(tick, 80);
    tick();
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onToast = (event) => {
      const { text, color } = event.detail || {};
      setToast({ text: text || '', color: color || '#ffd166', key: Date.now() });
      window.setTimeout(() => {
        setToast((current) => (current && current.key ? null : current));
      }, 2200);
    };
    const onFx = () => {
      setFadeOn(true);
      window.setTimeout(() => setFadeOn(false), 520);
    };
    window.addEventListener('net-toast', onToast);
    window.addEventListener('teleport-fx', onFx);
    return () => {
      window.removeEventListener('net-toast', onToast);
      window.removeEventListener('teleport-fx', onFx);
    };
  }, []);

  return (
    <>
      <div className="chat-bubbles">
        {bubbles.map((bubble) => (
          <div
            key={bubble.mid}
            id={`chat-bubble-${bubble.from}`}
            className="chat-bubble"
            data-from={bubble.from}
          >
            {bubble.text}
          </div>
        ))}
      </div>

      <div id="net-labels">
        {peers.map((peer) => <RemoteNameTag key={peer.id} peer={peer} />)}
      </div>

      <div id="teleport-fade" className={fadeOn ? 'is-on' : ''} />

      {toast && (
        <div className="net-toast" key={toast.key} style={{ borderColor: toast.color }}>
          <span className="net-toast__dot" style={{ background: toast.color }} />
          {toast.text}
        </div>
      )}

      <ChatPanel />
    </>
  );
}
