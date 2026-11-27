// 零依赖 WebSocket 房间中继：只用 node:http + node:crypto 完成握手与帧读写。
// 直接运行：node server/wsRelay.mjs（Railway 使用 PORT，本地仍兼容 WS_PORT）。
// 第一行导入即加载 .env，必须排在其它服务模块之前。
import './env.mjs';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ChatRateLimiter,
  RoomError,
  RoomRegistry,
  sanitizeChatText,
  sanitizeName,
} from './roomRegistry.mjs';
import { createSaveStore } from './saveStore.mjs';

const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_PORT = 8787;
const MAX_MESSAGE_LENGTH = 16 * 1024;
const AI_TIMEOUT_MS = 15000;
const LOCAL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp',
};

// 生产环境由同一个 Node 服务托管打包后的前端；没有 dist 时返回 false 交给 404。
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (relative === '/') relative = '/index.html';
  let file = path.normalize(path.join(DIST_DIR, relative));
  if (!file.startsWith(DIST_DIR)) return false;
  let stat = fs.existsSync(file) ? fs.statSync(file) : null;
  if (!stat || stat.isDirectory()) {
    // SPA 回退：未知路径交给前端
    file = path.join(DIST_DIR, 'index.html');
    stat = fs.existsSync(file) ? fs.statSync(file) : null;
  }
  if (!stat || !stat.isFile()) return false;
  const extension = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': STATIC_MIME[extension] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
  return true;
}

// ---- 帧编码（server -> client，不掩码） ----
function encodeFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, data]);
}

// ---- 帧解码（client -> server，浏览器发送的帧必须掩码） ----
function parseFrames(buf) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const b0 = buf[offset];
    const b1 = buf[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let headerLen = 2;
    if (len === 126) {
      if (offset + 4 > buf.length) break;
      len = buf.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (len === 127) {
      if (offset + 10 > buf.length) break;
      len = Number(buf.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }
    const maskStart = offset + headerLen;
    const payloadStart = maskStart + (masked ? 4 : 0);
    if (payloadStart + len > buf.length) break;
    let payload;
    if (masked) {
      const mask = buf.subarray(maskStart, maskStart + 4);
      payload = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i += 1) payload[i] = buf[payloadStart + i] ^ mask[i % 4];
    } else {
      payload = buf.subarray(payloadStart, payloadStart + len);
    }
    frames.push({ opcode, payload });
    offset = payloadStart + len;
  }
  return { frames, rest: buf.subarray(offset) };
}

function genId() {
  return crypto.randomBytes(4).toString('hex');
}

function isOriginAllowed(origin, configured) {
  if (!origin) return true;
  if (configured?.trim()) {
    const allowed = configured.split(',').map((item) => item.trim()).filter(Boolean);
    return allowed.includes('*') || allowed.includes(origin);
  }
  // 未配置时只放行本机开发页面；生产环境用逗号分隔的精确 Origin 白名单。
  return LOCAL_ORIGIN.test(origin);
}

function jsonResponse(res, status, body, headers = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function httpError(res, status, code, message) {
  jsonResponse(res, status, { error: { code, message }, code, message });
}

function validToken(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value || value.length > 32 || /\p{Cc}/u.test(value)) return null;
  return value;
}

function parseState(msg) {
  const defaults = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    speedMul: 1,
    walkPhase: 0,
    swimPhase: 0,
    sitting: 0,
    lying: 0,
  };
  const state = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = msg[key] === undefined ? fallback : msg[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000) return null;
    state[key] = value;
  }
  if (msg.swimming !== undefined && typeof msg.swimming !== 'boolean') return null;
  state.swimming = Boolean(msg.swimming);
  state.mode = validToken(msg.mode, 'walk');
  state.activity = validToken(msg.activity, 'walk');
  state.scene = validToken(msg.scene, 'overworld');
  if (state.mode === null || state.activity === null || state.scene === null) return null;
  state.t = Date.now();
  return state;
}

export function startWsRelay({
  port = Number(process.env.PORT) || Number(process.env.WS_PORT) || DEFAULT_PORT,
  host = '0.0.0.0',
  allowedOrigin = process.env.ALLOWED_ORIGIN,
  saveStore = createSaveStore(),
  fetchImpl = globalThis.fetch,
  roomRegistry = new RoomRegistry(),
} = {}) {
  const clients = new Map();
  const rooms = roomRegistry;
  const chatLimiter = new ChatRateLimiter();

  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, allowedOrigin)) {
      httpError(res, 403, 'ORIGIN_NOT_ALLOWED', '请求来源不在允许列表中');
      return false;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return true;
  }

  async function proxyAi(req, res, url) {
    if (req.method !== 'GET') {
      httpError(res, 405, 'METHOD_NOT_ALLOWED', 'AI 接口仅支持 GET');
      return;
    }
    if (!fetchImpl) {
      httpError(res, 503, 'AI_NOT_AVAILABLE', '当前 Node 运行环境不支持 fetch');
      return;
    }
    const promptPath = url.pathname.slice('/api/ai/'.length);
    if (!promptPath) {
      httpError(res, 400, 'INVALID_AI_PROMPT', '提示词路径不能为空');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    const abortUpstream = () => controller.abort();
    req.once('aborted', abortUpstream);
    try {
      const upstream = await fetchImpl(`https://text.pollinations.ai/${promptPath}${url.search}`, {
        method: 'GET',
        headers: { Accept: 'text/plain', 'User-Agent': 'pixel-swing-server/1.0' },
        signal: controller.signal,
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        httpError(res, upstream.status === 429 ? 429 : 502, 'AI_UPSTREAM_ERROR', 'AI 服务暂时不可用');
        return;
      }
      const text = await upstream.text();
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(text);
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        httpError(res, 504, 'AI_UPSTREAM_TIMEOUT', 'AI 服务响应超时');
      } else {
        httpError(res, 502, 'AI_UPSTREAM_ERROR', '无法连接 AI 服务');
      }
    } finally {
      clearTimeout(timer);
      req.removeListener('aborted', abortUpstream);
    }
  }

  const server = http.createServer((req, res) => {
    (async () => {
      if (!applyCors(req, res)) return;
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      let url;
      try {
        url = new URL(req.url, 'http://localhost');
      } catch {
        httpError(res, 400, 'BAD_URL', '请求路径无效');
        return;
      }

      if (url.pathname === '/health') {
        if (req.method !== 'GET') {
          httpError(res, 405, 'METHOD_NOT_ALLOWED', '健康检查仅支持 GET');
          return;
        }
        jsonResponse(res, 200, { ok: true, rooms: rooms.size, clients: clients.size });
        return;
      }

      const saveMatch = url.pathname.match(/^\/api\/saves\/([^/]+)\/?$/);
      if (saveMatch) {
        let uuid;
        try {
          uuid = decodeURIComponent(saveMatch[1]);
        } catch {
          httpError(res, 400, 'INVALID_UUID', '存档 ID 不是有效 UUID');
          return;
        }
        await saveStore.handle(req, res, uuid);
        return;
      }

      if (url.pathname.startsWith('/api/ai/')) {
        await proxyAi(req, res, url);
        return;
      }
      if (serveStatic(req, res, url.pathname)) return;
      httpError(res, 404, 'NOT_FOUND', '接口不存在');
    })().catch(() => {
      httpError(res, 500, 'INTERNAL_ERROR', '服务端处理请求失败');
    });
  });

  function send(ws, obj) {
    if (ws.destroyed) return;
    try {
      ws.write(encodeFrame(JSON.stringify(obj)));
    } catch {
      // 写入失败时由 close 事件统一清理连接。
    }
  }

  function sendWsError(ws, code, message) {
    send(ws, { type: 'error', code, message });
  }

  function broadcastRoom(code, obj, exceptId = null) {
    for (const id of rooms.getMembers(code)) {
      if (id === exceptId) continue;
      const client = clients.get(id);
      if (client) send(client.ws, obj);
    }
  }

  function memberInfo(id) {
    const client = clients.get(id);
    if (!client) return null;
    return { id, name: client.name, scene: client.state?.scene || 'overworld' };
  }

  function memberList(code) {
    const list = [];
    for (const id of rooms.getMembers(code)) {
      const info = memberInfo(id);
      if (info) list.push({ ...info, state: clients.get(id).state || null });
    }
    return list;
  }

  function notifyLeft(left, id, name) {
    if (left) broadcastRoom(left.code, { type: 'peer_left', id, name });
  }

  function leaveCurrentRoom(id) {
    const client = clients.get(id);
    const left = rooms.leave(id);
    if (client) notifyLeft(left, id, client.name);
    return left;
  }

  function removeClient(id) {
    const client = clients.get(id);
    if (!client) return;
    leaveCurrentRoom(id);
    clients.delete(id);
    chatLimiter.remove(id);
  }

  function handleMessage(id, text) {
    const client = clients.get(id);
    if (!client) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      sendWsError(client.ws, 'MESSAGE_TOO_LARGE', '消息体过大');
      return;
    }
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      sendWsError(client.ws, 'BAD_JSON', '消息不是有效 JSON');
      return;
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') {
      sendWsError(client.ws, 'BAD_MESSAGE', '消息体格式无效');
      return;
    }

    switch (msg.type) {
      case 'hello':
        client.name = sanitizeName(msg.name);
        send(client.ws, { type: 'welcome', id, name: client.name });
        break;
      case 'profile': {
        client.name = sanitizeName(msg.name);
        const code = rooms.getRoomCode(id);
        if (code) broadcastRoom(code, { type: 'peer_profile', id, name: client.name });
        break;
      }
      case 'create_room': {
        try {
          const { code, left } = rooms.create(id);
          notifyLeft(left, id, client.name);
          send(client.ws, { type: 'room_created', code, members: memberList(code) });
        } catch (error) {
          if (!(error instanceof RoomError)) throw error;
          notifyLeft(error.left, id, client.name);
          sendWsError(client.ws, error.code, error.message);
        }
        break;
      }
      case 'join_room': {
        try {
          const { code, left } = rooms.join(id, msg.code);
          notifyLeft(left, id, client.name);
          send(client.ws, { type: 'room_joined', code, members: memberList(code) });
          broadcastRoom(code, { type: 'peer_joined', id, name: client.name }, id);
        } catch (error) {
          if (!(error instanceof RoomError)) throw error;
          notifyLeft(error.left, id, client.name);
          sendWsError(client.ws, error.code, error.message);
        }
        break;
      }
      case 'leave_room':
        leaveCurrentRoom(id);
        break;
      case 'state': {
        const state = parseState(msg);
        if (!state) {
          sendWsError(client.ws, 'INVALID_STATE', '状态消息包含无效数值或字段');
          return;
        }
        client.state = state;
        const code = rooms.getRoomCode(id);
        if (code) broadcastRoom(code, { type: 'peer_state', id, ...state }, id);
        break;
      }
      case 'chat': {
        const code = rooms.getRoomCode(id);
        if (!code) {
          sendWsError(client.ws, 'NOT_IN_ROOM', '加入房间后才能聊天');
          return;
        }
        const text = sanitizeChatText(msg.text);
        if (!text) {
          sendWsError(client.ws, 'CHAT_EMPTY', '聊天内容不能为空');
          return;
        }
        if (!chatLimiter.allow(id)) {
          sendWsError(client.ws, 'CHAT_RATE_LIMIT', '每秒最多发送一条聊天');
          return;
        }
        broadcastRoom(code, {
          type: 'chat',
          mid: crypto.randomUUID(),
          from: id,
          name: client.name,
          text,
          at: Date.now(),
        });
        break;
      }
      case 'invite': {
        const code = rooms.getRoomCode(id);
        if (!code || typeof msg.to !== 'string') return;
        const target = clients.get(msg.to);
        if (target && rooms.getRoomCode(msg.to) === code) {
          send(target.ws, { type: 'invite', from: id, name: client.name });
        }
        break;
      }
      case 'invite_reply': {
        const code = rooms.getRoomCode(id);
        if (!code || typeof msg.from !== 'string' || typeof msg.accept !== 'boolean') return;
        const target = clients.get(msg.from);
        if (target && rooms.getRoomCode(msg.from) === code) {
          send(target.ws, { type: 'invite_reply', from: id, name: client.name, accept: msg.accept });
        }
        break;
      }
      case 'ping':
        send(client.ws, { type: 'pong' });
        break;
      default:
        break;
    }
  }

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || !isOriginAllowed(req.headers.origin, allowedOrigin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + MAGIC).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n',
    ].join('\r\n'));

    const id = genId();
    const client = { ws: socket, name: '玩家', state: null, buffer: Buffer.alloc(0) };
    clients.set(id, client);

    socket.on('data', (chunk) => {
      client.buffer = Buffer.concat([client.buffer, chunk]);
      if (client.buffer.length > MAX_MESSAGE_LENGTH * 2) {
        socket.destroy();
        return;
      }
      const { frames, rest } = parseFrames(client.buffer);
      client.buffer = rest;
      for (const frame of frames) {
        if (frame.opcode === 0x8) {
          try {
            socket.write(encodeFrame(Buffer.alloc(0), 0x8));
          } catch {
            // 对端已关闭时无需再发送关闭帧。
          }
          socket.end();
          return;
        }
        if (frame.opcode === 0x9) {
          socket.write(encodeFrame(frame.payload, 0xa));
          continue;
        }
        if (frame.opcode === 0x1 || frame.opcode === 0x2) {
          handleMessage(id, frame.payload.toString('utf8'));
        }
      }
    });

    socket.on('close', () => removeClient(id));
    socket.on('error', () => removeClient(id));
  });

  server.once('close', () => rooms.close());

  // 本地端口被占用时自动 +1 重试，最多试 10 个。
  let tryPort = port;
  const start = () => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && tryPort < port + 10) {
        tryPort += 1;
        setTimeout(start, 100);
      } else {
        console.error('[wsRelay] 启动失败:', err.message);
      }
    });
    server.listen(tryPort, host, () => {
      console.log(`[wsRelay] 联机与 API 服务已启动: http://${host}:${tryPort}`);
    });
  };
  start();

  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  startWsRelay();
}
