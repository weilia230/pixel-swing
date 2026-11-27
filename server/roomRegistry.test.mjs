import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ChatRateLimiter,
  EMPTY_ROOM_TTL_MS,
  MAX_CHAT_LENGTH,
  RoomRegistry,
  sanitizeChatText,
} from './roomRegistry.mjs';

function createScheduler() {
  let nextId = 1;
  const timers = new Map();
  return {
    timers,
    setTimer(fn, delay) {
      const id = nextId++;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    runAll() {
      for (const [id, timer] of timers) {
        timers.delete(id);
        timer.fn();
      }
    },
  };
}

test('房号始终为 6 位数字并保留前导零', () => {
  const scheduler = createScheduler();
  const rooms = new RoomRegistry({ random: () => 42, ...scheduler });
  const { code } = rooms.create('player-1');
  assert.equal(code, '000042');
  assert.match(code, /^\d{6}$/);
  rooms.close();
});

test('每房最多 4 人，满员和不存在均返回稳定错误码', () => {
  const scheduler = createScheduler();
  const rooms = new RoomRegistry({ random: () => 123456, ...scheduler });
  const { code } = rooms.create('player-1');
  rooms.join('player-2', code);
  rooms.join('player-3', code);
  rooms.join('player-4', code);
  assert.equal(rooms.getMembers(code).length, 4);
  assert.throws(() => rooms.join('player-5', code), { code: 'ROOM_FULL' });
  assert.throws(() => rooms.join('player-5', '654321'), { code: 'ROOM_NOT_FOUND' });
  rooms.close();
});

test('create/join 自动离开旧房，失败加入也不会遗留旧成员关系', () => {
  const scheduler = createScheduler();
  let value = 100000;
  const rooms = new RoomRegistry({ random: () => value++, ...scheduler });
  const { code: oldCode } = rooms.create('player-1');
  const { code: newCode } = rooms.create('player-2');
  rooms.join('player-1', newCode);
  assert.equal(rooms.getRoomCode('player-1'), newCode);
  assert.deepEqual(rooms.getMembers(oldCode), []);
  assert.throws(() => rooms.join('player-1', '999999'), { code: 'ROOM_NOT_FOUND' });
  assert.equal(rooms.getRoomCode('player-1'), null);
  assert.deepEqual(rooms.getMembers(newCode), ['player-2']);
  rooms.close();
});

test('空房保留 5 分钟，重新加入取消销毁，再次空置后到期销毁', () => {
  const scheduler = createScheduler();
  const rooms = new RoomRegistry({ random: () => 7, ...scheduler });
  const { code } = rooms.create('player-1');
  rooms.leave('player-1');

  assert.equal(rooms.size, 1);
  assert.equal(scheduler.timers.size, 1);
  assert.equal([...scheduler.timers.values()][0].delay, EMPTY_ROOM_TTL_MS);
  rooms.join('player-1', code);
  assert.equal(scheduler.timers.size, 0);
  scheduler.runAll();
  assert.equal(rooms.has(code), true);

  rooms.leave('player-1');
  scheduler.runAll();
  assert.equal(rooms.has(code), false);
  assert.throws(() => rooms.join('player-2', code), { code: 'ROOM_NOT_FOUND' });
  rooms.close();
});

test('聊天清理控制字符、折叠空白并按字符截取 80 字', () => {
  assert.equal(sanitizeChatText(' \n 你好\u0000\t世界  '), '你好 世界');
  assert.equal(sanitizeChatText('甲\u200b乙'), '甲乙');
  assert.equal(sanitizeChatText('a'.repeat(100)), 'a'.repeat(MAX_CHAT_LENGTH));
  assert.equal(Array.from(sanitizeChatText('🎮'.repeat(100))).length, MAX_CHAT_LENGTH);
  assert.equal(sanitizeChatText(' \n\t '), '');
  assert.equal(sanitizeChatText({ text: '不是字符串' }), '');
});

test('聊天每连接每秒最多一条，恰好一秒后恢复，断线可清理', () => {
  let now = 1000;
  const limiter = new ChatRateLimiter({ now: () => now });
  assert.equal(limiter.allow('player-1'), true);
  assert.equal(limiter.allow('player-1'), false);
  assert.equal(limiter.allow('player-2'), true);
  now = 1999;
  assert.equal(limiter.allow('player-1'), false);
  now = 2000;
  assert.equal(limiter.allow('player-1'), true);
  limiter.remove('player-1');
  assert.equal(limiter.allow('player-1'), true);
});
