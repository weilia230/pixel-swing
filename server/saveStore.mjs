// Supabase Postgres REST 存档适配器：仅使用 Node 原生 fetch，不保存内存副本。
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_BODY_LIMIT = 512 * 1024;
const DEFAULT_WRITE_INTERVAL = 1000;
const UPSTREAM_TIMEOUT_MS = 10000;

export function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? ''));
}

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, body, headers = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function sendError(res, status, code, message, headers = {}) {
  sendJson(res, status, { error: { code, message }, code, message }, headers);
}

async function readJsonBody(req, limit) {
  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > limit) {
    req.resume();
    throw new HttpError(413, 'SAVE_TOO_LARGE', `存档不能超过 ${limit} 字节`);
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    if (!tooLarge) chunks.push(chunk);
  }
  if (tooLarge) throw new HttpError(413, 'SAVE_TOO_LARGE', `存档不能超过 ${limit} 字节`);
  if (size === 0) throw new HttpError(400, 'INVALID_SAVE', '请求体不能为空');

  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', '请求体不是有效 JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_SAVE', '存档必须是 JSON 对象');
  }
  return value;
}

function requestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export class SaveStore {
  constructor({
    url = process.env.SUPABASE_URL,
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket = process.env.SUPABASE_SAVE_BUCKET || 'pixel-swing-saves',
    fetchImpl = globalThis.fetch,
    maxBodyBytes = DEFAULT_BODY_LIMIT,
    writeIntervalMs = DEFAULT_WRITE_INTERVAL,
    now = Date.now,
  } = {}) {
    this.url = url?.replace(/\/+$/, '');
    this.serviceRoleKey = serviceRoleKey;
    this.bucket = bucket;
    this.fetch = fetchImpl;
    this.maxBodyBytes = maxBodyBytes;
    this.writeIntervalMs = writeIntervalMs;
    this.now = now;
    this.lastWrites = new Map();
    this.backend = null;
    this.bucketReady = false;
  }

  get configured() {
    return Boolean(this.url && this.serviceRoleKey && this.fetch);
  }

  headers() {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }

  async upstream(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      return await this.fetch(`${this.url}${path}`, {
        ...options,
        headers: { ...this.headers(), ...options.headers },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  allowWrite(req) {
    const ip = requestIp(req);
    const current = this.now();
    const previous = this.lastWrites.get(ip);
    if (previous !== undefined && current - previous < this.writeIntervalMs) return false;
    this.lastWrites.set(ip, current);
    return true;
  }

  // 优先 Postgres（执行过 supabaseSchema.sql 时）；表不存在则自动退到同项目的 Storage 桶，
  // 保证只有 service_role 密钥也能立即持久化，绝不落到进程内存。
  async resolveBackend() {
    if (this.backend) return this.backend;
    try {
      const probe = await this.upstream('/rest/v1/saves?select=uuid&limit=1');
      this.backend = probe.ok ? 'postgres' : 'storage';
    } catch {
      this.backend = 'storage';
    }
    if (this.backend === 'storage') await this.ensureBucket();
    return this.backend;
  }

  async ensureBucket() {
    if (this.bucketReady) return;
    const head = await this.upstream(`/storage/v1/bucket/${encodeURIComponent(this.bucket)}`, { method: 'GET' });
    if (!head.ok) {
      const created = await this.upstream('/storage/v1/bucket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
      });
      if (!created.ok && created.status !== 409) {
        throw new HttpError(502, 'SAVE_UPSTREAM_ERROR', '无法创建云存档存储桶');
      }
    }
    this.bucketReady = true;
  }

  objectPath(uuid) {
    return `${this.bucket}/saves/${uuid}.json`;
  }

  async storageGet(uuid) {
    const response = await this.upstream(`/storage/v1/object/${this.objectPath(uuid)}`, { method: 'GET' });
    if (response.status === 404) return null;
    // Supabase Storage 对不存在的对象返回 HTTP 400 + body.statusCode 404
    if (response.status === 400) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (body && (body.statusCode === 404 || body.statusCode === '404' || body.code === 'NoSuchKey')) {
        return null;
      }
      throw new HttpError(502, 'SAVE_UPSTREAM_ERROR', '读取存档失败');
    }
    if (!response.ok) throw new HttpError(502, 'SAVE_UPSTREAM_ERROR', '读取存档失败');
    try {
      return await response.json();
    } catch {
      throw new HttpError(502, 'SAVE_UPSTREAM_ERROR', '云存档格式损坏');
    }
  }

  async storagePut(uuid, data) {
    // 先读后写：旧时间戳不允许覆盖较新的云存档；单人存档场景下冲突窗口极小。
    const current = await this.storageGet(uuid);
    if (current && Number(current.savedAt) >= Number(data.savedAt)) return current;
    const response = await this.upstream(`/storage/v1/object/${this.objectPath(uuid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'no-cache' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new HttpError(502, 'SAVE_UPSTREAM_ERROR', '写入存档失败');
    return data;
  }

  async get(uuid) {
    if ((await this.resolveBackend()) === 'storage') return this.storageGet(uuid);
    const query = new URLSearchParams({ uuid: `eq.${uuid}`, select: 'data', limit: '1' });
    const response = await this.upstream(`/rest/v1/saves?${query}`, { method: 'GET' });
    if (!response.ok) throw new HttpError(502, 'SAVE_UPSTREAM_ERROR', '读取存档失败');
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? rows[0].data : null;
  }

  async put(uuid, data) {
    if ((await this.resolveBackend()) === 'storage') return this.storagePut(uuid, data);
    const response = await this.upstream('/rest/v1/rpc/upsert_save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_uuid: uuid, p_data: data, p_saved_at: data.savedAt }),
    });
    if (!response.ok) throw new HttpError(502, 'SAVE_UPSTREAM_ERROR', '写入存档失败');
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]?.data) {
      throw new HttpError(502, 'SAVE_UPSTREAM_ERROR', '存档服务返回格式错误');
    }
    return rows[0].data;
  }

  async handle(req, res, uuid) {
    if (!isUuid(uuid)) {
      sendError(res, 400, 'INVALID_UUID', '存档 ID 不是有效 UUID');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'PUT') {
      sendError(res, 405, 'METHOD_NOT_ALLOWED', '仅支持 GET 或 PUT', { Allow: 'GET, PUT' });
      return;
    }
    if (!this.configured) {
      sendError(res, 503, 'SAVE_NOT_CONFIGURED', '服务端未配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    try {
      if (req.method === 'GET') {
        const data = await this.get(uuid.toLowerCase());
        if (data === null || data === undefined) {
          sendError(res, 404, 'SAVE_NOT_FOUND', '存档不存在');
        } else {
          sendJson(res, 200, data);
        }
        return;
      }

      if (!this.allowWrite(req)) {
        req.resume();
        sendError(res, 429, 'SAVE_RATE_LIMIT', '写入过于频繁，请稍后再试', { 'Retry-After': '1' });
        return;
      }
      const data = await readJsonBody(req, this.maxBodyBytes);
      if (!Number.isSafeInteger(data.savedAt) || data.savedAt < 0) {
        throw new HttpError(400, 'INVALID_SAVED_AT', 'savedAt 必须是非负安全整数时间戳');
      }
      const saved = await this.put(uuid.toLowerCase(), data);
      sendJson(res, 200, saved);
    } catch (error) {
      if (error instanceof HttpError) {
        sendError(res, error.status, error.code, error.message);
      } else if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        sendError(res, 504, 'SAVE_UPSTREAM_TIMEOUT', '存档服务响应超时');
      } else {
        sendError(res, 502, 'SAVE_UPSTREAM_ERROR', '存档服务暂时不可用');
      }
    }
  }
}

export function createSaveStore(options) {
  return new SaveStore(options);
}
