// ──────────────────────────────────────────────────────────────
//  AI 接口位置说明（安全）
//  · 自定义大模型走 callEndpoint()，端点 / 密钥来自 Vite 环境变量：
//    VITE_AI_ENDPOINT / VITE_AI_KEY / VITE_AI_MODEL，写入 .env（不要提交到仓库）。
//  · 前端环境变量仍会被打进客户端包，生产环境请把密钥放到后端代理，
//    前端只调用自家后端，绝不要把 API Key 硬编码在前端代码里。
//  · 默认公共模型走 Vite 代理 /api/ai（见 vite.config.js），前端无需密钥。
// ──────────────────────────────────────────────────────────────

// 每次请求带上的上下文长度（消息条数），够长但不会超出 URL / 模型限制
const CONTEXT_WINDOW = 16;

const PERSONA =
  '你是黄昏湖畔的小姑娘「小樱」，戴红色贝雷帽、穿蓝色背带裤。' +
  '性格温柔安静，带一点灵动，像傍晚在湖边偶遇的女孩子。' +
  '说话自然清爽、简洁，一次只说一到两句话，不用颜文字，不堆砌可爱的修饰，不刻意撒娇。' +
  '可以聊樱花、兔子、秋千和黄昏的湖面，语气松弛，像正常聊天，偶尔有一点点小浪漫但不过分。' +
  '如果对方问你是不是叫小樱，就回答：是的呀，小小的小，樱花的樱。你叫什么名字呀？' +
  '记住对方说过的话和名字，之后可以自然地叫对方的名字。' +
  '只回一段话，不要列表，不要提自己是 AI。';

const FALLBACKS = [
  '嗯，我在听。',
  '湖面今天很安静，风也很轻。',
  '我听着呢，你慢慢说。',
  '这样啊……那你现在感觉怎么样？',
  '要不要坐下来，一起看看湖边的晚霞？',
  '你说到这儿，我想起傍晚的风了。',
  '嗯，我记住了。',
  '我在的，你接着说就好。',
];

function pickFallback(text, userName) {
  const call = userName ? `${userName}，` : '';
  if (/累|难过|烦|压力|哭|焦虑|孤独/.test(text)) {
    return `${call}那就先歇一会儿吧。湖边的风很轻，慢慢呼吸就好。`;
  }
  if (/樱花|花/.test(text)) {
    return '樱花又落了几片，风一吹就散开，很好看。';
  }
  if (/秋千|荡/.test(text)) {
    return '秋千在树下轻轻晃，我一直想找个伴一起荡。';
  }
  if (/兔|小动物/.test(text)) {
    return '刚才有只白兔子从草里跑过去，跑得很快，耳朵一直抖。';
  }
  if (/萤火虫|星星|夜/.test(text)) {
    return '天黑以后萤火虫会亮起来，像把星星放得很低。';
  }
  if (/你好|在吗|嗨|hi|hello/i.test(text)) {
    return '你好呀，欢迎来到小樱的世界！';
  }
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 9973;
  return call + FALLBACKS[hash % FALLBACKS.length];
}

function cleanup(text) {
  return String(text)
    .replace(/^小樱[:：]\s*/, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function systemPrompt(userName) {
  if (!userName) return PERSONA;
  return `${PERSONA}\n对方的名字是「${userName}」，回应时可以自然地叫对方的名字。`;
}

function buildPrompt(history, text, userName) {
  const lines = history
    .slice(-CONTEXT_WINDOW)
    .map((message) => `${message.from === 'girl' ? '小樱' : '对方'}：${message.text}`)
    .join('\n');
  return `${systemPrompt(userName)}\n\n最近的对话：\n${lines}\n\n对方刚刚说：${text}\n\n请以小樱的口吻自然回应（60 字以内）：`;
}

async function requestWithTimeout(run, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function callEndpoint(history, text, userName) {
  const endpoint = import.meta.env.VITE_AI_ENDPOINT;
  if (!endpoint) return null;

  const apiKey = import.meta.env.VITE_AI_KEY;
  const model = import.meta.env.VITE_AI_MODEL || 'gpt-4o-mini';
  const data = await requestWithTimeout(async (signal) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        max_tokens: 180,
        messages: [
          { role: 'system', content: systemPrompt(userName) },
          ...history.slice(-CONTEXT_WINDOW).map((message) => ({
            role: message.from === 'girl' ? 'assistant' : 'user',
            content: message.text,
          })),
          { role: 'user', content: text },
        ],
      }),
      signal,
    });
    if (!response.ok) throw new Error(`endpoint ${response.status}`);
    return response.json();
  }, 12000);

  const reply = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
  return reply ? cleanup(reply) : null;
}

async function callPublicAi(history, text, userName) {
  const prompt = buildPrompt(history, text, userName);
  const seed = Math.floor(Math.random() * 100000);
  // 走 Vite 代理，避免浏览器端接口的人机校验
  const url = `/api/ai/${encodeURIComponent(prompt)}?model=openai&seed=${seed}`;
  const reply = await requestWithTimeout(async (signal) => {
    const response = await fetch(url, { signal, headers: { Accept: 'text/plain' } });
    if (!response.ok) throw new Error(`public ai ${response.status}`);
    return response.text();
  }, 12000);

  const cleaned = cleanup(reply);
  return cleaned.length > 1 && !cleaned.startsWith('{') ? cleaned : null;
}

// 依次尝试自定义接口、免费公共接口，最后落到本地治愈回复
export async function askCompanion(history, text, userName) {
  try {
    const reply = await callEndpoint(history, text, userName);
    if (reply) return reply;
  } catch {
    // 忽略，继续尝试下一种
  }

  try {
    const reply = await callPublicAi(history, text, userName);
    if (reply) return reply;
  } catch {
    // 离线或限流时使用本地回复
  }

  await new Promise((resolve) => setTimeout(resolve, 380));
  return pickFallback(text, userName);
}
