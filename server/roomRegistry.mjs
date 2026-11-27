// 房间与聊天的纯逻辑模块，不依赖网络层，便于用 node:test 验证边界条件。
import { randomInt } from 'node:crypto';

export const ROOM_CODE_LENGTH = 6;
export const MAX_ROOM_MEMBERS = 4;
export const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;
export const MAX_CHAT_LENGTH = 80;

export class RoomError extends Error {
  constructor(code, message, left = null) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
    this.left = left;
  }
}

function sliceCharacters(text, limit) {
  return Array.from(text).slice(0, limit).join('');
}

export function sanitizeName(value) {
  if (typeof value !== 'string') return '玩家';
  const cleaned = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return sliceCharacters(cleaned, 16) || '玩家';
}

export function sanitizeChatText(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value
    // 换行、制表符等先转为空格，避免清理后把两个词粘在一起。
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return sliceCharacters(cleaned, MAX_CHAT_LENGTH);
}

export class ChatRateLimiter {
  constructor({ intervalMs = 1000, now = Date.now } = {}) {
    this.intervalMs = intervalMs;
    this.now = now;
    this.lastSent = new Map();
  }

  allow(id) {
    const current = this.now();
    const previous = this.lastSent.get(id);
    if (previous !== undefined && current - previous < this.intervalMs) return false;
    this.lastSent.set(id, current);
    return true;
  }

  remove(id) {
    this.lastSent.delete(id);
  }
}

export class RoomRegistry {
  constructor({
    maxMembers = MAX_ROOM_MEMBERS,
    emptyTtlMs = EMPTY_ROOM_TTL_MS,
    random = randomInt,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {}) {
    this.maxMembers = maxMembers;
    this.emptyTtlMs = emptyTtlMs;
    this.random = random;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.rooms = new Map();
    this.clientRooms = new Map();
  }

  get size() {
    return this.rooms.size;
  }

  makeCode() {
    return String(this.random(0, 10 ** ROOM_CODE_LENGTH)).padStart(ROOM_CODE_LENGTH, '0');
  }

  create(clientId) {
    const left = this.leave(clientId);
    let code = this.makeCode();
    let attempts = 1;
    while (this.rooms.has(code)) {
      if (attempts >= 100) throw new RoomError('ROOM_GENERATION_FAILED', '暂时无法分配房号', left);
      code = this.makeCode();
      attempts += 1;
    }
    this.rooms.set(code, { members: new Set([clientId]), emptyTimer: null });
    this.clientRooms.set(clientId, code);
    return { code, left };
  }

  join(clientId, value) {
    const code = String(value ?? '').trim();
    if (!new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(code)) {
      throw new RoomError('INVALID_ROOM_CODE', '房号必须是 6 位数字');
    }

    // 即使目标房不存在或已满，也不会让连接继续留在旧房间。
    const left = this.leave(clientId);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('ROOM_NOT_FOUND', '房间不存在', left);
    if (room.members.size >= this.maxMembers) throw new RoomError('ROOM_FULL', '房间已满', left);

    if (room.emptyTimer !== null) {
      this.clearTimer(room.emptyTimer);
      room.emptyTimer = null;
    }
    room.members.add(clientId);
    this.clientRooms.set(clientId, code);
    return { code, left };
  }

  leave(clientId) {
    const code = this.clientRooms.get(clientId);
    if (!code) return null;
    this.clientRooms.delete(clientId);
    const room = this.rooms.get(code);
    if (!room) return null;

    room.members.delete(clientId);
    const left = { code, members: Array.from(room.members) };
    if (room.members.size === 0) this.scheduleDestroy(code, room);
    return left;
  }

  scheduleDestroy(code, room) {
    if (room.emptyTimer !== null) this.clearTimer(room.emptyTimer);
    room.emptyTimer = this.setTimer(() => {
      const current = this.rooms.get(code);
      if (current === room && current.members.size === 0) this.rooms.delete(code);
      room.emptyTimer = null;
    }, this.emptyTtlMs);
    // 空房计时器不应阻止 Node 进程自然退出。
    if (typeof room.emptyTimer?.unref === 'function') room.emptyTimer.unref();
  }

  getMembers(code) {
    return Array.from(this.rooms.get(code)?.members ?? []);
  }

  getRoomCode(clientId) {
    return this.clientRooms.get(clientId) ?? null;
  }

  has(code) {
    return this.rooms.has(code);
  }

  close() {
    for (const room of this.rooms.values()) {
      if (room.emptyTimer !== null) this.clearTimer(room.emptyTimer);
    }
    this.rooms.clear();
    this.clientRooms.clear();
  }
}
