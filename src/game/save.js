import { player, restoreRuntime, snapshotRuntime } from './runtime';
import { restoreSurvival, snapshotSurvival } from './survival';
import { restoreInventory, snapshotInventory } from './inventory';
import { restoreCrops, snapshotCrops } from './crops';
import { restoreWildPlants, snapshotWildPlants } from './wildplants';
import { restoreStones, snapshotStones } from './stones';
import {
  isInMountain,
  restoreMountainWorld,
  snapshotMountainWorld,
} from './mountainWorld';
import { restoreRabbits, snapshotRabbits } from './rabbits';
import { restoreMoles, snapshotMoles } from './moles';
import { restoreTime, snapshotTime } from './time';

export const SAVE_VERSION = 1;
export const SAVE_STORAGE_KEY = 'pixel-swing:save:v1';

const ID_STORAGE_KEY = 'pixel-swing:save:id:v1';
const CORRUPT_STORAGE_KEY = 'pixel-swing:save:v1:corrupt';
const CODE_PREFIX = 'PS1.';
const AUTOSAVE_MS = 30000;
const DIRTY_DEBOUNCE_MS = 350;
const CLOUD_THROTTLE_MS = 10000;
const CLOUD_RETRY_MS = 30000;
const REQUEST_TIMEOUT_MS = 6500;
const ENV = import.meta.env || {};
const SAVE_API_URL = String(
  ENV.VITE_SAVE_API_URL || (ENV.DEV ? 'http://localhost:8787/api/saves' : '/api/saves')
).replace(/\/+$/, '');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BYTE_PERMUTATION = [3, 7, 11, 15, 2, 6, 10, 14, 1, 5, 9, 13, 0, 4, 8, 12];

function currentScene() {
  if (player.insideKind) return player.insideKind;
  return isInMountain(player.position.x, player.position.z) ? 'mountain' : 'overworld';
}

function createPayload() {
  return {
    player: snapshotRuntime(currentScene()),
    survival: snapshotSurvival(),
    inventory: snapshotInventory(),
    crops: snapshotCrops(),
    wildplants: snapshotWildPlants(),
    stones: snapshotStones(),
    mountainWorld: snapshotMountainWorld(),
    rabbits: snapshotRabbits(),
    moles: snapshotMoles(),
    time: snapshotTime(),
  };
}

const DEFAULT_PAYLOAD = createPayload();

function restorePayload(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  restoreTime(source.time, DEFAULT_PAYLOAD.time);
  restoreInventory(source.inventory, DEFAULT_PAYLOAD.inventory);
  restoreCrops(source.crops, DEFAULT_PAYLOAD.crops);
  restoreWildPlants(source.wildplants, DEFAULT_PAYLOAD.wildplants);
  restoreStones(source.stones, DEFAULT_PAYLOAD.stones);
  restoreMountainWorld(source.mountainWorld, DEFAULT_PAYLOAD.mountainWorld);
  restoreRabbits(source.rabbits, DEFAULT_PAYLOAD.rabbits);
  restoreMoles(source.moles, DEFAULT_PAYLOAD.moles);
  restoreSurvival(source.survival, DEFAULT_PAYLOAD.survival);
  restoreRuntime(source.player, DEFAULT_PAYLOAD.player);
}

function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(value)) throw new Error('invalid save code');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(24, '=');
  const binary = atob(base64);
  if (binary.length !== 16) throw new Error('invalid save code');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeSaveCode(uuid) {
  const bytes = uuidToBytes(uuid);
  const permuted = Uint8Array.from(BYTE_PERMUTATION, (index) => bytes[index]);
  return CODE_PREFIX + base64UrlEncode(permuted);
}

function decodeSaveCode(code) {
  try {
    const normalized = String(code || '').trim();
    if (!normalized.startsWith(CODE_PREFIX)) return null;
    const encoded = normalized.slice(CODE_PREFIX.length);
    const permuted = base64UrlDecode(encoded);
    const bytes = new Uint8Array(16);
    BYTE_PERMUTATION.forEach((sourceIndex, index) => { bytes[sourceIndex] = permuted[index]; });
    const uuid = bytesToUuid(bytes);
    if (!UUID_PATTERN.test(uuid) || encodeSaveCode(uuid) !== normalized) return null;
    return uuid;
  } catch {
    return null;
  }
}

function generateUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error('当前浏览器无法生成安全存档 ID');
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

let saveId = null;

function ensureSaveId() {
  if (saveId) return saveId;
  let stored = null;
  try { stored = localStorage.getItem(ID_STORAGE_KEY); } catch { /* 使用内存 ID */ }
  saveId = stored && UUID_PATTERN.test(stored) ? stored.toLowerCase() : generateUuid();
  if (saveId !== stored) {
    try { localStorage.setItem(ID_STORAGE_KEY, saveId); } catch { /* 仍可本次会话存档 */ }
  }
  return saveId;
}

export function getSaveCode() {
  return encodeSaveCode(ensureSaveId());
}

export function validateSaveCode(code) {
  return decodeSaveCode(code) !== null;
}

const listeners = new Set();
let saveStatus = {
  initialized: false,
  cloud: 'idle',
  message: '存档准备中',
  savedAt: null,
  lastCloudSavedAt: null,
  source: null,
  dirty: false,
  pendingCloud: false,
  localError: '',
};

function setStatus(patch) {
  saveStatus = { ...saveStatus, ...patch };
  listeners.forEach((listener) => listener());
}

export function getSaveStatus() {
  return saveStatus;
}

export function subscribeSaveStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function normalizeSavedAt(value) {
  if (Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeEnvelope(value, expectedId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('存档结构损坏');
  const version = Number.isInteger(value.version) && value.version >= 0 ? value.version : 0;
  if (version > SAVE_VERSION) throw new Error('存档版本过新');
  if (expectedId && value.id != null && value.id !== expectedId) throw new Error('云端存档 ID 不匹配');
  const payload = value.payload === undefined ? {} : value.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('存档内容损坏');
  return {
    id: expectedId || value.id,
    version: SAVE_VERSION,
    savedAt: normalizeSavedAt(value.savedAt),
    payload,
  };
}

let corruptLocalRaw = null;
let lastEnvelope = null;
let lastSavedSignature = '';
let dirty = false;

function readLocalEnvelope(id) {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_STORAGE_KEY); } catch {
    setStatus({ localError: '本地存储不可用，当前进度仅保留在内存中' });
    return null;
  }
  if (raw == null) return null;
  try {
    return normalizeEnvelope(JSON.parse(raw), id);
  } catch {
    corruptLocalRaw = raw;
    setStatus({ localError: '本地存档损坏，原内容未清空；保存时将先保留副本' });
    return null;
  }
}

function writeLocalEnvelope(envelope) {
  try {
    if (corruptLocalRaw !== null) {
      localStorage.setItem(CORRUPT_STORAGE_KEY, corruptLocalRaw);
      corruptLocalRaw = null;
      setStatus({ localError: '' });
    }
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify({
      version: SAVE_VERSION,
      savedAt: envelope.savedAt,
      payload: envelope.payload,
    }));
    return true;
  } catch {
    setStatus({ localError: '本地存储空间不足或不可用，请保留存档码并检查浏览器设置' });
    return false;
  }
}

function announceRestore(source, savedAt) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pixel-swing:save-restored', {
      detail: { source, savedAt },
    }));
  }
}

function applyEnvelope(envelope, source) {
  restorePayload(envelope.payload);
  const normalized = {
    id: saveId,
    version: SAVE_VERSION,
    savedAt: envelope.savedAt,
    payload: createPayload(),
  };
  lastEnvelope = normalized;
  lastSavedSignature = JSON.stringify(normalized.payload);
  dirty = false;
  writeLocalEnvelope(normalized);
  setStatus({
    savedAt: normalized.savedAt,
    source,
    dirty: false,
  });
  announceRestore(source, normalized.savedAt);
  return normalized;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cloudUrl(id) {
  return `${SAVE_API_URL}/${encodeURIComponent(id)}`;
}

async function fetchCloudEnvelope(id) {
  if (!SAVE_API_URL) throw new Error('未配置云存档接口');
  const response = await request(cloudUrl(id), { headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`云存档读取失败：${response.status}`);
  return normalizeEnvelope(await response.json(), id);
}

async function putCloudEnvelope(envelope) {
  if (!SAVE_API_URL) throw new Error('未配置云存档接口');
  const response = await request(cloudUrl(envelope.id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      id: envelope.id,
      savedAt: envelope.savedAt,
      payload: envelope.payload,
      version: SAVE_VERSION,
    }),
    keepalive: true,
  });
  if (!response.ok) throw new Error(`云存档写入失败：${response.status}`);
}

let cloudReady = false;
let pendingUpload = null;
let cloudTimer = null;
let cloudInFlight = null;
let lastCloudAttemptAt = 0;

function clearCloudTimer() {
  if (cloudTimer !== null) clearTimeout(cloudTimer);
  cloudTimer = null;
}

function scheduleCloudFlush(delay) {
  if (!cloudReady || !pendingUpload || cloudInFlight || cloudTimer !== null) return;
  const throttleDelay = Math.max(0, CLOUD_THROTTLE_MS - (Date.now() - lastCloudAttemptAt));
  const wait = delay === undefined ? throttleDelay : Math.max(0, delay);
  cloudTimer = setTimeout(() => {
    cloudTimer = null;
    flushCloud();
  }, wait);
}

function queueCloud(envelope, { immediate = false, retry = false } = {}) {
  pendingUpload = envelope;
  if (envelope.id === saveId) {
    const offline = saveStatus.cloud === 'offline';
    setStatus({
      pendingCloud: true,
      ...(offline ? {} : {
        cloud: 'pending',
        message: '本地已保存，等待云端同步',
      }),
    });
  }
  scheduleCloudFlush(immediate ? 0 : retry ? CLOUD_RETRY_MS : undefined);
}

async function flushCloud() {
  if (!cloudReady || !pendingUpload || cloudInFlight) return cloudInFlight;
  clearCloudTimer();
  const envelope = pendingUpload;
  pendingUpload = null;
  let succeeded = false;

  cloudInFlight = (async () => {
    lastCloudAttemptAt = Date.now();
    try {
      await putCloudEnvelope(envelope);
      succeeded = true;
      if (envelope.id === saveId) {
        const hasPending = !!pendingUpload;
        setStatus({
          cloud: hasPending ? 'pending' : 'online',
          message: hasPending ? '本地已保存，等待云端同步' : '云端已同步',
          pendingCloud: hasPending,
          lastCloudSavedAt: Math.max(saveStatus.lastCloudSavedAt || 0, envelope.savedAt),
        });
      }
      return true;
    } catch {
      if (!pendingUpload || pendingUpload.savedAt < envelope.savedAt) pendingUpload = envelope;
      if (envelope.id === saveId) {
        setStatus({
          cloud: 'offline',
          message: '云端未连接，本地存档中',
          pendingCloud: true,
        });
      }
      return false;
    } finally {
      cloudInFlight = null;
      if (pendingUpload) scheduleCloudFlush(succeeded ? undefined : CLOUD_RETRY_MS);
    }
  })();
  return cloudInFlight;
}

async function drainCloudUpload() {
  clearCloudTimer();
  if (cloudInFlight) {
    const ok = await cloudInFlight;
    if (!ok) return false;
  }
  if (pendingUpload) {
    const ok = await flushCloud();
    clearCloudTimer();
    if (!ok) return false;
  }
  return !pendingUpload;
}

function persistPayload(payload, { cloud = true, immediateCloud = false } = {}) {
  const id = ensureSaveId();
  const savedAt = Math.max(Date.now(), (lastEnvelope?.savedAt || 0) + 1);
  const envelope = { id, version: SAVE_VERSION, savedAt, payload };
  lastEnvelope = envelope;
  lastSavedSignature = JSON.stringify(payload);
  dirty = false;
  writeLocalEnvelope(envelope);
  setStatus({
    savedAt,
    source: saveStatus.source || 'local',
    dirty: false,
    pendingCloud: cloud || saveStatus.pendingCloud,
  });
  if (cloud) {
    queueCloud(envelope, { immediate: immediateCloud });
    if (immediateCloud) flushCloud();
  }
  return envelope;
}

export function saveNow(options = {}) {
  if (!initPromise) initSave();
  if (!saveId) return null;
  if (dirtyTimer !== null) {
    clearTimeout(dirtyTimer);
    dirtyTimer = null;
  }
  return persistPayload(createPayload(), options);
}

let dirtyTimer = null;

export function markSaveDirty() {
  if (!initPromise) initSave();
  if (!saveId) return;
  dirty = true;
  setStatus({ dirty: true });
  if (dirtyTimer !== null) clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(() => {
    dirtyTimer = null;
    persistPayload(createPayload());
  }, DIRTY_DEBOUNCE_MS);
}

let initPromise = null;
let autoSaveTimer = null;

function autoSaveTick() {
  if (!saveId) return;
  const payload = createPayload();
  if (!dirty && JSON.stringify(payload) !== lastSavedSignature) {
    dirty = true;
    setStatus({ dirty: true });
  }
  if (dirty) persistPayload(payload);
  else if (pendingUpload) scheduleCloudFlush();
}

function installLifecycleHandlers() {
  if (typeof window === 'undefined' || autoSaveTimer !== null) return;
  autoSaveTimer = setInterval(autoSaveTick, AUTOSAVE_MS);
  const saveOnExit = () => saveNow({ immediateCloud: true });
  window.addEventListener('pagehide', saveOnExit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveOnExit();
  });
}

export function initSave() {
  if (initPromise) return initPromise;
  try {
    ensureSaveId();
  } catch (error) {
    setStatus({ cloud: 'offline', message: '云端未连接，本地存档中', localError: error.message });
    initPromise = Promise.resolve(getSaveStatus());
    return initPromise;
  }

  installLifecycleHandlers();
  setStatus({ cloud: 'syncing', message: '正在恢复本地存档' });
  const local = readLocalEnvelope(saveId);
  if (local) {
    applyEnvelope(local, 'local');
    setStatus({ cloud: 'syncing', message: '已恢复本地存档，正在检查云端' });
  } else {
    lastSavedSignature = JSON.stringify(createPayload());
    setStatus({ cloud: 'syncing', message: '正在检查云端存档' });
  }

  initPromise = (async () => {
    try {
      const remote = await fetchCloudEnvelope(saveId);
      if (remote) {
        if (!lastEnvelope || remote.savedAt > lastEnvelope.savedAt) {
          applyEnvelope(remote, 'cloud');
        } else if (remote.savedAt < lastEnvelope.savedAt) {
          queueCloud(lastEnvelope);
        }
        setStatus({
          cloud: pendingUpload ? 'pending' : 'online',
          message: pendingUpload ? '本地存档较新，等待云端同步' : '云端已同步',
          pendingCloud: !!pendingUpload,
          lastCloudSavedAt: remote.savedAt,
        });
      } else {
        if (lastEnvelope) queueCloud(lastEnvelope);
        setStatus({
          cloud: pendingUpload ? 'pending' : 'online',
          message: pendingUpload ? '本地已保存，等待云端同步' : '云端暂无存档，本地存档中',
          pendingCloud: !!pendingUpload,
        });
      }
    } catch {
      setStatus({
        cloud: 'offline',
        message: '云端未连接，本地存档中',
        pendingCloud: !!pendingUpload,
      });
    } finally {
      cloudReady = true;
      setStatus({ initialized: true });
      if (pendingUpload) scheduleCloudFlush();
    }
    return getSaveStatus();
  })();
  return initPromise;
}

export async function importSaveCode(code) {
  const importedId = decodeSaveCode(code);
  if (!importedId) return { ok: false, error: '存档码无效，请检查后重试' };
  if (!initPromise) initSave();
  await initPromise;
  if (!saveId) return { ok: false, error: '无法建立本地存档 ID' };

  if (importedId !== saveId) {
    saveNow({ immediateCloud: true });
    const uploaded = await drainCloudUpload();
    if (!uploaded) {
      return { ok: false, error: '当前存档尚未上传，已停止导入以避免覆盖进度' };
    }
  }

  setStatus({ cloud: 'syncing', message: '正在读取导入的云端存档' });
  let remote;
  try {
    remote = await fetchCloudEnvelope(importedId);
  } catch {
    setStatus({ cloud: 'offline', message: '云端未连接，本地存档中' });
    return { ok: false, error: '云端未连接，本地存档中' };
  }
  if (!remote) {
    setStatus({ cloud: 'online', message: '没有找到该存档码对应的云存档' });
    return { ok: false, error: '没有找到该存档码对应的云存档' };
  }

  if (importedId !== saveId) {
    saveId = importedId;
    try { localStorage.setItem(ID_STORAGE_KEY, saveId); } catch { /* 本次会话仍可导入 */ }
    applyEnvelope(remote, 'import');
    setStatus({
      cloud: 'online',
      message: '存档码导入成功',
      pendingCloud: false,
      lastCloudSavedAt: remote.savedAt,
    });
  } else if (!lastEnvelope || remote.savedAt > lastEnvelope.savedAt) {
    applyEnvelope(remote, 'import');
    setStatus({
      cloud: 'online',
      message: '已恢复较新的云端存档',
      pendingCloud: false,
      lastCloudSavedAt: remote.savedAt,
    });
  } else {
    setStatus({
      cloud: 'online',
      message: '本地存档较新，未覆盖当前进度',
      lastCloudSavedAt: remote.savedAt,
    });
  }
  return { ok: true, code: getSaveCode(), savedAt: remote.savedAt, status: getSaveStatus() };
}
