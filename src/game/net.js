// 客户端联机单例：管理 WebSocket 连接、房间、远程玩家状态与好友名册。
// 沿用项目的「全局可变对象」范式，UI 层用 200ms 轮询读取 net 渲染。
// 从不连接时 net.peers 为空，所有联机组件空渲染，单机玩法不受影响。
import { player } from './runtime';
import { TILE_SIZE } from './gridConfig';
import { isInMountain } from './mountainWorld';

const LS_NAME = 'pixel-swing:name';
const LS_SERVER = 'pixel-swing:serverUrl';
const LS_ROOM = 'pixel-swing:room';
const LS_FRIENDS = 'pixel-swing:friends';
const LS_PARTY = 'pixel-swing:party';

const SEND_HZ = 12;
const PING_INTERVAL = 15000;
const PONG_TIMEOUT = 6000;
const CHAT_TTL = 5000;
const CHAT_COOLDOWN = 1000;
const MAX_CHAT_LENGTH = 80;

// 小队标记色：接受邀请后按顺序分配
const PARTY_COLORS = ['#6cf0a8', '#ffd166', '#f08cff', '#6ad0ff', '#ff9a6c'];

function defaultServerUrl() {
  const host = (typeof location !== 'undefined' && location.hostname) || '127.0.0.1';
  if (import.meta.env.DEV) return `ws://${host}:8787`;
  const configured = String(import.meta.env.VITE_WS_URL || '').trim();
  const url = configured || `wss://${(typeof location !== 'undefined' && location.host) || host}`;
  return url.replace(/^ws:\/\//i, 'wss://');
}

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式等忽略 */
  }
}
function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function randomName() {
  return '小樱' + Math.floor(1000 + Math.random() * 9000);
}

export function getSceneId() {
  if (player.insideKind) return player.insideKind; // house | warehouse
  if (isInMountain(player.position.x, player.position.z)) return 'mountain';
  return 'overworld';
}

const PARTY = readJSON(LS_PARTY, {}); // name -> colorIndex
const ROSTER = readJSON(LS_FRIENDS, {}); // name -> { lastSeen }

// 对外暴露的可变状态对象
export const net = {
  status: 'offline', // offline | connecting | online | error
  error: '',
  myId: null,
  myName: readLS(LS_NAME, '') || randomName(),
  serverUrl: readLS(LS_SERVER, '') || defaultServerUrl(),
  roomCode: '',
  savedRoom: readLS(LS_ROOM, ''),
  peers: {}, // id -> { id, name, scene, state, render, lastSeen }
  chat: {}, // speakerId -> 服务端广播的最新气泡
  lastChatAt: 0,
  friends: [], // 排序后的好友列表（供 UI）
  invites: [], // [{ from, name }]
  party: PARTY, // name -> colorIndex
  lastTeleportAt: 0,
  teleportTarget: null, // peerId
  reconnectAttempts: 0,
  lastPong: 0,
  // 内部
  _ws: null,
  _sendTimer: null,
  _pingTimer: null,
  _pongTimer: null,
  _reconnectTimer: null,
  _manualClose: false,
  _pendingAction: null,
  _roomRetryBlocked: false,
};

// 与 UI 共享的聊天状态；替换 bubbles 的引用会触发不必要的整树更新，因此始终原地修改。
export const chatState = {
  bubbles: net.chat,
  lastSentAt: 0,
};

function setStatus(s, error = '') {
  net.status = s;
  net.error = error;
}

function savePrefs() {
  writeLS(LS_NAME, net.myName);
  writeLS(LS_SERVER, net.serverUrl);
  if (net.roomCode) writeLS(LS_ROOM, net.roomCode);
}

function buildSnapshot() {
  const p = player.position;
  return {
    x: Math.round(p.x * 100) / 100,
    y: Math.round(p.y * 100) / 100,
    z: Math.round(p.z * 100) / 100,
    yaw: Math.round(player.yaw * 1000) / 1000,
    speed: Math.round(player.speed * 100) / 100,
    speedMul: player.speedMul || 1,
    walkPhase: Math.round(player.walkPhase * 100) / 100,
    swimPhase: Math.round(player.swimPhase * 100) / 100,
    swimming: !!player.swimming,
    sitting: Math.round(player.sitting * 100) / 100,
    lying: Math.round(player.lying * 100) / 100,
    mode: player.mode || 'walk',
    activity: player.activity || 'walk',
    scene: getSceneId(),
  };
}

function send(obj) {
  const ws = net._ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

function clearChat() {
  Object.keys(net.chat).forEach((id) => delete net.chat[id]);
  net.lastChatAt = 0;
  chatState.lastSentAt = 0;
}

export function sendChat(text) {
  const value = String(text ?? '').trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (value.length > MAX_CHAT_LENGTH) return { ok: false, reason: 'too_long' };
  if (!net.roomCode || !net._ws || net._ws.readyState !== WebSocket.OPEN) {
    return { ok: false, reason: 'offline' };
  }
  const now = Date.now();
  const wait = CHAT_COOLDOWN - (now - net.lastChatAt);
  if (wait > 0) return { ok: false, reason: 'rate_limited', wait };
  // 本地不直接生成气泡，只有服务端 chat 广播才会进入 net.chat。
  if (!send({ type: 'chat', text: value })) return { ok: false, reason: 'offline' };
  net.lastChatAt = now;
  chatState.lastSentAt = now;
  return { ok: true };
}

export function getChatBubbles(limit = 3) {
  if (!net.roomCode) return [];
  const now = Date.now();
  const myScene = getSceneId();
  const myId = String(net.myId ?? '');
  const active = [];
  Object.entries(net.chat).forEach(([speakerId, bubble]) => {
    if (bubble.expiresAt <= now) {
      delete net.chat[speakerId];
      return;
    }
    if (speakerId !== myId) {
      const peer = net.peers[speakerId];
      if (!peer?.state || (peer.state.scene || 'overworld') !== myScene) return;
    }
    active.push(bubble);
  });
  return active.sort((a, b) => b.receivedAt - a.receivedAt).slice(0, limit);
}

function clearTimers() {
  if (net._sendTimer) {
    clearInterval(net._sendTimer);
    net._sendTimer = null;
  }
  if (net._pingTimer) {
    clearInterval(net._pingTimer);
    net._pingTimer = null;
  }
  if (net._pongTimer) {
    clearTimeout(net._pongTimer);
    net._pongTimer = null;
  }
}

function startStateLoop() {
  clearTimers();
  net._sendTimer = setInterval(() => {
    if (net.roomCode) send({ type: 'state', ...buildSnapshot() });
  }, 1000 / SEND_HZ);
  net._pingTimer = setInterval(() => {
    net.lastPong = 0;
    send({ type: 'ping' });
    net._pongTimer = setTimeout(() => {
      // 超时未收到 pong，判定连接已死，触发重连
      if (net._ws) net._ws.close();
    }, PONG_TIMEOUT);
  }, PING_INTERVAL);
}

// 把当前 peers + 本地名册合并成排序后的好友列表
export function refreshFriends() {
  const myScene = getSceneId();
  const myPos = player.position;
  const onlineByName = {};
  Object.values(net.peers).forEach((peer) => {
    const name = peer.name;
    onlineByName[name] = peer;
    // 见到新玩家自动记入名册
    if (!ROSTER[name]) {
      ROSTER[name] = { lastSeen: Date.now() };
      writeJSON(LS_FRIENDS, ROSTER);
    } else {
      ROSTER[name].lastSeen = Date.now();
    }
  });

  const list = [];
  const allNames = new Set([...Object.keys(ROSTER), ...Object.keys(onlineByName)]);
  allNames.forEach((name) => {
    const peer = onlineByName[name];
    if (peer) {
      const sameScene = (peer.state?.scene || 'overworld') === myScene;
      let distance = null;
      if (sameScene && peer.state) {
        const dx = peer.state.x - myPos.x;
        const dz = peer.state.z - myPos.z;
        distance = Math.round(Math.hypot(dx, dz) / TILE_SIZE);
      }
      list.push({
        name,
        online: true,
        sameScene,
        scene: peer.state?.scene || 'overworld',
        peerId: peer.id,
        distance,
        lastSeen: Date.now(),
        inParty: Object.prototype.hasOwnProperty.call(net.party, name),
        partyColor: partyColorOf(name),
      });
    } else {
      list.push({
        name,
        online: false,
        sameScene: false,
        scene: null,
        peerId: null,
        distance: null,
        lastSeen: ROSTER[name]?.lastSeen || 0,
        inParty: Object.prototype.hasOwnProperty.call(net.party, name),
        partyColor: partyColorOf(name),
      });
    }
  });

  list.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.online) return a.name.localeCompare(b.name, 'zh');
    return b.lastSeen - a.lastSeen;
  });
  net.friends = list;
  return list;
}

export function partyColorOf(name) {
  const idx = net.party[name];
  if (idx == null) return null;
  return PARTY_COLORS[idx % PARTY_COLORS.length];
}

function addParty(name) {
  if (Object.prototype.hasOwnProperty.call(net.party, name)) return;
  const used = new Set(Object.values(net.party));
  let idx = 0;
  while (used.has(idx)) idx += 1;
  net.party[name] = idx;
  writeJSON(LS_PARTY, net.party);
  refreshFriends();
}

function markOffline(id) {
  const peer = net.peers[id];
  if (!peer) return;
  const name = peer.name;
  delete net.peers[id];
  delete net.chat[id];
  if (net.teleportTarget === id) net.teleportTarget = null;
  if (ROSTER[name]) {
    ROSTER[name].lastSeen = Date.now();
    writeJSON(LS_FRIENDS, ROSTER);
  }
  refreshFriends();
}

function receiveChat(msg) {
  if (
    !net.roomCode ||
    msg.mid == null ||
    msg.from == null ||
    typeof msg.name !== 'string' ||
    typeof msg.text !== 'string' ||
    msg.at == null
  ) return;
  if (!msg.text.trim() || msg.text.length > MAX_CHAT_LENGTH) return;
  const from = String(msg.from);
  const receivedAt = Date.now();
  const previous = net.chat[from];
  if (previous?.mid === msg.mid) return;
  const peerName = from === String(net.myId) ? net.myName : net.peers[from]?.name;
  net.chat[from] = {
    mid: msg.mid,
    from,
    name: String(msg.name || peerName || '玩家'),
    text: msg.text,
    at: msg.at,
    receivedAt,
    expiresAt: receivedAt + CHAT_TTL,
  };
}

function forgetSavedRoom() {
  net.roomCode = '';
  net.savedRoom = '';
  net._pendingAction = null;
  try { localStorage.removeItem(LS_ROOM); } catch { /* noop */ }
  net.peers = {};
  net.teleportTarget = null;
  clearChat();
  refreshFriends();
}

function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  switch (msg.type) {
    case 'welcome': {
      net.myId = String(msg.id);
      if (msg.name) net.myName = msg.name;
      setStatus('online');
      net.reconnectAttempts = 0;
      const pending = net._pendingAction;
      net._pendingAction = null;
      if (pending?.type === 'create') {
        send({ type: 'create_room' });
      } else if (pending?.type === 'join') {
        send({ type: 'join_room', code: pending.code });
      } else if (net.savedRoom && !net.roomCode) {
        // 断线后的旧 peers 已清空，只能通过 join 返回的完整名册恢复。
        send({ type: 'join_room', code: net.savedRoom });
      }
      break;
    }
    case 'room_created':
    case 'room_joined': {
      net.roomCode = String(msg.code);
      net.savedRoom = net.roomCode;
      net._roomRetryBlocked = false;
      setStatus('online');
      writeLS(LS_ROOM, net.roomCode);
      clearChat();
      // 每次入房都以完整名册替换，避免合并重连前的幽灵玩家。
      const roster = {};
      (msg.members || []).forEach((m) => {
        if (String(m.id) === String(net.myId)) return;
        const id = String(m.id);
        const state = m.state || null;
        roster[id] = {
          id,
          name: m.name,
          scene: state?.scene || m.scene || 'overworld',
          state,
          render: state
            ? { x: state.x, y: state.y, z: state.z, yaw: state.yaw }
            : null,
          lastSeen: Date.now(),
        };
      });
      net.peers = roster;
      startStateLoop();
      refreshFriends();
      break;
    }
    case 'peer_joined': {
      const id = String(msg.id);
      if (id !== String(net.myId) && !net.peers[id]) {
        net.peers[id] = {
          id,
          name: msg.name,
          scene: 'overworld',
          state: null,
          render: null,
          lastSeen: Date.now(),
        };
      }
      refreshFriends();
      break;
    }
    case 'peer_state': {
      const id = String(msg.id);
      let peer = net.peers[id];
      if (!peer) {
        peer = { id, name: msg.name || '玩家', scene: msg.scene || 'overworld', state: null, render: null, lastSeen: Date.now() };
        net.peers[id] = peer;
      }
      if (msg.name) peer.name = msg.name;
      const st = {
        x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw,
        speed: msg.speed, speedMul: msg.speedMul, walkPhase: msg.walkPhase,
        swimPhase: msg.swimPhase, swimming: msg.swimming, sitting: msg.sitting,
        lying: msg.lying, mode: msg.mode, activity: msg.activity, scene: msg.scene,
      };
      peer.state = st;
      peer.scene = st.scene || 'overworld';
      peer.lastSeen = Date.now();
      if (!peer.render) {
        peer.render = { x: st.x, y: st.y, z: st.z, yaw: st.yaw };
      }
      break;
    }
    case 'peer_left':
      markOffline(String(msg.id));
      break;
    case 'peer_profile': {
      const id = String(msg.id ?? msg.from ?? '');
      const peer = net.peers[id];
      if (peer && msg.name) {
        peer.name = String(msg.name).slice(0, 16);
        if (net.chat[id]) net.chat[id].name = peer.name;
        refreshFriends();
      }
      break;
    }
    case 'chat':
      receiveChat(msg);
      break;
    case 'invite':
      if (!net.invites.some((i) => i.from === msg.from)) {
        net.invites.push({ from: msg.from, name: msg.name });
      }
      break;
    case 'invite_reply':
      if (msg.accept) {
        addParty(msg.name);
      }
      break;
    case 'error': {
      const code = String(msg.code || '').toUpperCase().replace(/-/g, '_');
      const terminalRoomError = ['ROOM_FULL', 'FULL', 'ROOM_NOT_FOUND', 'NOT_FOUND'].includes(code);
      if (terminalRoomError) {
        net._roomRetryBlocked = true;
        forgetSavedRoom();
        clearTimers();
        const fallback = code === 'ROOM_FULL' || code === 'FULL' ? '房间已满' : '房间不存在';
        setStatus('error', msg.message || fallback);
      } else {
        setStatus('error', msg.message || '连接出错');
      }
      break;
    }
    case 'pong':
      net.lastPong = Date.now();
      if (net._pongTimer) {
        clearTimeout(net._pongTimer);
        net._pongTimer = null;
      }
      break;
    default:
      break;
  }
}

function scheduleReconnect() {
  if (net._manualClose || net._roomRetryBlocked) return;
  net.reconnectAttempts += 1;
  const delay = Math.min(10000, 1000 * 2 ** (net.reconnectAttempts - 1));
  setStatus('error', `连接已断开，${Math.round(delay / 1000)} 秒后重试…`);
  net._reconnectTimer = setTimeout(() => {
    net._reconnectTimer = null;
    connect(net.serverUrl);
  }, delay);
}

export function connect(url) {
  if (net._reconnectTimer) {
    clearTimeout(net._reconnectTimer);
    net._reconnectTimer = null;
  }
  clearTimers();
  if (net._ws) {
    const previous = net._ws;
    net._ws = null;
    try { previous.close(); } catch { /* noop */ }
  }
  // 连接实例变更后旧名册不再可信，房间号由 room_joined 的完整名册恢复。
  net.roomCode = '';
  net.peers = {};
  net.teleportTarget = null;
  clearChat();
  refreshFriends();
  net.serverUrl = url || net.serverUrl || defaultServerUrl();
  savePrefs();
  setStatus('connecting');

  let ws;
  try {
    ws = new WebSocket(net.serverUrl);
  } catch (err) {
    setStatus('error', err?.message || '无法建立连接');
    scheduleReconnect();
    return;
  }
  net._ws = ws;

  ws.onopen = () => {
    if (net._ws !== ws) return;
    send({ type: 'hello', name: net.myName });
  };
  ws.onmessage = (ev) => {
    if (net._ws === ws && typeof ev.data === 'string') handleMessage(ev.data);
  };
  ws.onerror = () => {
    // 错误信息在浏览器里通常拿不到具体原因，只切状态
    if (net._ws === ws && net.status === 'connecting') setStatus('error', '连接失败，请检查服务器地址');
  };
  ws.onclose = () => {
    if (net._ws !== ws) return;
    net._ws = null;
    clearTimers();
    net.roomCode = '';
    net.peers = {};
    net.teleportTarget = null;
    clearChat();
    refreshFriends();
    if (net._manualClose) setStatus('offline');
    else scheduleReconnect();
  };
}

export function disconnect() {
  net._manualClose = true;
  net._pendingAction = null;
  net._roomRetryBlocked = false;
  if (net._reconnectTimer) {
    clearTimeout(net._reconnectTimer);
    net._reconnectTimer = null;
  }
  clearTimers();
  if (net._ws) {
    const ws = net._ws;
    net._ws = null;
    try { ws.close(); } catch { /* noop */ }
  }
  net.roomCode = '';
  net.peers = {};
  net.teleportTarget = null;
  clearChat();
  net.reconnectAttempts = 0;
  setStatus('offline');
  refreshFriends();
  net._manualClose = false;
}

export function reconnectNow() {
  net.reconnectAttempts = 0;
  net._roomRetryBlocked = false;
  if (net._reconnectTimer) {
    clearTimeout(net._reconnectTimer);
    net._reconnectTimer = null;
  }
  connect(net.serverUrl);
}

export function createRoom() {
  net._roomRetryBlocked = false;
  if (!net._ws || net._ws.readyState !== WebSocket.OPEN) {
    net._pendingAction = { type: 'create' };
    connect(net.serverUrl);
    return;
  }
  setStatus('online');
  send({ type: 'create_room' });
}

export function joinRoom(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return;
  net._roomRetryBlocked = false;
  net.savedRoom = c;
  writeLS(LS_ROOM, c);
  if (!net._ws || net._ws.readyState !== WebSocket.OPEN) {
    net._pendingAction = { type: 'join', code: c };
    connect(net.serverUrl);
    return;
  }
  net._pendingAction = null;
  setStatus('online');
  send({ type: 'join_room', code: c });
}

export function leaveRoom() {
  send({ type: 'leave_room' });
  forgetSavedRoom();
  net._roomRetryBlocked = false;
  clearTimers();
  if (net._ws?.readyState === WebSocket.OPEN) setStatus('online');
}

export function setName(name) {
  net.myName = String(name || '').trim().slice(0, 16) || randomName();
  savePrefs();
  if (net._ws && net._ws.readyState === WebSocket.OPEN) {
    send({ type: 'profile', name: net.myName });
  }
}

export function sendInvite(peerId) {
  send({ type: 'invite', to: peerId });
}

export function replyInvite(fromId, accept) {
  send({ type: 'invite_reply', from: fromId, accept });
  const inv = net.invites.find((i) => i.from === fromId);
  if (inv && accept) addParty(inv.name);
  net.invites = net.invites.filter((i) => i.from !== fromId);
  refreshFriends();
}

export function openTeleport(peerId) {
  net.teleportTarget = peerId;
}
export function closeTeleport() {
  net.teleportTarget = null;
}

export function teleportCooldownLeft() {
  return Math.max(0, 3000 - (Date.now() - net.lastTeleportAt));
}

// 初始计算一次好友列表（可能有本地离线名册）
refreshFriends();

// 六位数字邀请链接只自动加入一次；普通访问仍保持单机，不主动连接。
if (typeof window !== 'undefined') {
  const inviteRoom = new URLSearchParams(window.location.search).get('room') || '';
  if (/^\d{6}$/.test(inviteRoom)) joinRoom(inviteRoom);
}
