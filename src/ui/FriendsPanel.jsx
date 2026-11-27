// 右上角「好友」按钮 + 好友列表面板 + 联机连接 UI。
// 未连接时面板内显示创建 / 加入房间；连接后显示好友名册、在线状态、距离、传送 / 邀请。
import { useEffect, useState } from 'react';
import {
  net,
  connect,
  createRoom,
  joinRoom,
  leaveRoom,
  setName,
  sendInvite,
  replyInvite,
  reconnectNow,
  disconnect,
  refreshFriends,
  partyColorOf,
  teleportCooldownLeft,
} from '../game/net';
import { teleportToPeer } from '../game/teleport';

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 62%)`;
}

function sceneLabel(scene) {
  switch (scene) {
    case 'house':
      return '屋里';
    case 'warehouse':
      return '仓库';
    case 'mountain':
      return '山林';
    default:
      return '原野';
  }
}

function timeAgo(ts) {
  if (!ts) return '未知';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function makeInviteLink(roomCode) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', roomCode);
  return url.toString();
}

async function copyText(text) {
  if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持剪贴板');
  await navigator.clipboard.writeText(text);
}

export default function FriendsPanel() {
  const [open, setOpen] = useState(false);
  const [name, setNameLocal] = useState(net.myName);
  const [serverUrl, setServerUrlLocal] = useState(net.serverUrl);
  const [joinCode, setJoinCode] = useState('');
  const [search, setSearch] = useState('');
  const [showLastSeen, setShowLastSeen] = useState({});
  const [actionError, setActionError] = useState('');

  const [tick, setTick] = useState({
    status: net.status,
    error: net.error,
    roomCode: net.roomCode,
    friends: [],
    invites: [],
    cooldown: 0,
  });

  useEffect(() => {
    const t = window.setInterval(() => {
      refreshFriends();
      setTick({
        status: net.status,
        error: net.error,
        roomCode: net.roomCode,
        friends: net.friends.slice(),
        invites: net.invites.slice(),
        cooldown: teleportCooldownLeft(),
      });
    }, 250);
    refreshFriends();
    return () => window.clearInterval(t);
  }, []);

  const onlineCount = tick.friends.filter((f) => f.online).length;
  const filtered = tick.friends.filter((f) =>
    !search.trim() ? true : f.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const doConnect = () => {
    setActionError('');
    setName(name);
    net.serverUrl = serverUrl;
    connect(serverUrl);
  };
  const doCreate = () => {
    setActionError('');
    setName(name);
    net.serverUrl = serverUrl;
    createRoom();
  };
  const doJoin = () => {
    if (!joinCode.trim()) {
      setActionError('请输入房间号');
      return;
    }
    setActionError('');
    setName(name);
    net.serverUrl = serverUrl;
    joinRoom(joinCode);
  };

  const copyRoom = async () => {
    try {
      await copyText(tick.roomCode);
      setActionError('');
      window.dispatchEvent(new CustomEvent('net-toast', { detail: { text: '房间号已复制', color: '#6cf0a8' } }));
    } catch {
      setActionError('房间号复制失败，请检查浏览器剪贴板权限');
    }
  };

  const copyInvite = async () => {
    try {
      await copyText(makeInviteLink(tick.roomCode));
      setActionError('');
      window.dispatchEvent(new CustomEvent('net-toast', { detail: { text: '邀请链接已复制', color: '#6cf0a8' } }));
    } catch {
      setActionError('邀请链接复制失败，请检查浏览器剪贴板权限');
    }
  };

  return (
    <>
      <button
        className={`friends-btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        好友
        {onlineCount > 0 && <span className="friends-btn__badge">{onlineCount}</span>}
      </button>

      {open && (
        <div className="friends-backdrop" onClick={() => setOpen(false)}>
          <div className="friends-panel" onClick={(e) => e.stopPropagation()}>
            <div className="friends-head">
              <span className="friends-title">好友</span>
              <span className="friends-count">
                在线 {onlineCount}/{tick.friends.length}
              </span>
              <div className="friends-head-right">
                <button className="friends-mini" onClick={() => refreshFriends()} title="刷新">
                  ⟳
                </button>
                <button className="friends-mini" onClick={() => setOpen(false)}>
                  ✕
                </button>
              </div>
            </div>

            {/* 连接区：未进房时显示 */}
            {!tick.roomCode && (
              <div className="friends-connect">
                <div className="friends-row">
                  <label>昵称</label>
                  <input
                    value={name}
                    maxLength={16}
                    onChange={(e) => setNameLocal(e.target.value)}
                  />
                </div>
                <div className="friends-row">
                  <label>服务器</label>
                  <input
                    value={serverUrl}
                    onChange={(e) => setServerUrlLocal(e.target.value)}
                    placeholder="ws://..."
                  />
                </div>
                <div className="friends-row">
                  <label>房间号</label>
                  <input
                    value={joinCode}
                    maxLength={6}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="加入时填写"
                  />
                </div>
                <div className="friends-connect-actions">
                  <button className="friends-act" onClick={doCreate}>
                    创建房间
                  </button>
                  <button className="friends-act" onClick={doJoin}>
                    加入房间
                  </button>
                </div>
                <div className="friends-status">
                  {tick.status === 'connecting' && '连接中…'}
                  {tick.status === 'online' && '已连接，等待进入房间…'}
                  {tick.status === 'error' && (
                    <span>
                      {tick.error || '连接失败'}
                      <button className="friends-link" onClick={reconnectNow}>
                        重试
                      </button>
                    </span>
                  )}
                  {tick.status === 'offline' && '未连接'}
                </div>
              </div>
            )}

            {/* 已在房间：房间号 + 离开 */}
            {tick.roomCode && (
              <div className="friends-roombar">
                房间号
                <span className="friends-roomcode" onClick={copyRoom} title="点击复制">
                  {tick.roomCode}
                </span>
                <button className="friends-copy-invite" onClick={copyInvite}>
                  复制邀请链接
                </button>
                <button className="friends-leave" onClick={leaveRoom}>
                  离开
                </button>
              </div>
            )}

            {actionError && <div className="friends-error" role="alert">{actionError}</div>}
            {tick.roomCode && tick.error && (
              <div className="friends-error" role="alert">{tick.error}</div>
            )}

            {/* 收到的邀请 */}
            {tick.invites.length > 0 && (
              <div className="friends-invites">
                {tick.invites.map((inv) => (
                  <div className="friends-invite" key={inv.from}>
                    <span className="friends-invite-name">{inv.name} 邀请你组队</span>
                    <button className="friends-yes" onClick={() => replyInvite(inv.from, true)}>
                      接受
                    </button>
                    <button className="friends-no" onClick={() => replyInvite(inv.from, false)}>
                      拒绝
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 搜索 */}
            {tick.friends.length > 0 && (
              <input
                className="friends-search"
                placeholder="搜索昵称…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}

            {/* 好友列表 */}
            <div className="friends-list">
              {filtered.length === 0 && (
                <div className="friends-empty">
                  {tick.friends.length === 0
                    ? '还没有好友，创建或加入房间后会自动记录遇见的玩家'
                    : '没有匹配的好友'}
                </div>
              )}
              {filtered.map((f) => {
                const cooldown = tick.cooldown;
                const inParty = f.inParty;
                return (
                  <div
                    className={`friends-item ${f.online ? '' : 'is-offline'}`}
                    key={f.name}
                  >
                    <span
                      className="friends-avatar"
                      style={{ background: avatarColor(f.name), boxShadow: inParty ? `0 0 0 2px ${f.partyColor}` : undefined }}
                    />
                    <div className="friends-main">
                      <div className="friends-name">
                        <span className={`friends-dot friends-dot--${dotClass(f)}`} />
                        {f.name}
                        {inParty && (
                          <span
                            className="friends-party-tag"
                            style={{ background: f.partyColor }}
                          >
                            队
                          </span>
                        )}
                      </div>
                      <div className="friends-sub">
                        {f.online ? (
                          f.sameScene ? (
                            <>
                              距你 {f.distance} 格 · {sceneLabel(f.scene)}
                            </>
                          ) : (
                            <>在其他区域（{sceneLabel(f.scene)}）</>
                          )
                        ) : (
                          <>
                            离线
                            <button
                              className="friends-link"
                              onClick={() =>
                                setShowLastSeen((s) => ({ ...s, [f.name]: !s[f.name] }))
                              }
                            >
                              {showLastSeen[f.name] ? '收起' : '查看上次在线时间'}
                            </button>
                            {showLastSeen[f.name] && (
                              <span className="friends-lastseen"> · {timeAgo(f.lastSeen)}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="friends-actions">
                      <button
                        className="friends-tp"
                        disabled={!f.online || !f.peerId || cooldown > 0}
                        onClick={() => f.peerId && teleportToPeer(f.peerId)}
                      >
                        {cooldown > 0 ? `${Math.ceil(cooldown / 1000)}s` : '传送'}
                      </button>
                      <button
                        className="friends-inv"
                        disabled={!f.online || !f.peerId || inParty}
                        onClick={() => f.peerId && sendInvite(f.peerId)}
                      >
                        {inParty ? '已组队' : '邀请'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {tick.status !== 'offline' && (
              <div className="friends-foot">
                <span className={`friends-statusdot friends-statusdot--${tick.status}`} />
                {statusText(tick)}
                {tick.roomCode && (
                  <button className="friends-link" onClick={disconnect}>
                    断开连接
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function dotClass(f) {
  if (!f.online) return 'off';
  return f.sameScene ? 'on' : 'ingame';
}

function statusText(t) {
  switch (t.status) {
    case 'connecting':
      return '连接中…';
    case 'online':
      return t.roomCode ? `已连接 · 房间 ${t.roomCode}` : '已连接';
    case 'error':
      return t.error || '连接异常，正在重试';
    default:
      return '未连接';
  }
}
