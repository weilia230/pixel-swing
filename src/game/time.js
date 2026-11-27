// 世界时间：30 分钟白天 + 30 分钟黑夜，清晨与黄昏各有一小段过渡光
export const DAY_SECONDS = 1800;
export const NIGHT_SECONDS = 1800;
export const FULL_CYCLE = DAY_SECONDS + NIGHT_SECONDS;

// 周期内的关键时间点（0~1）
const DAWN_END = 0.06; // 清晨结束，进入白天
const DUSK_START = 0.44; // 白天结束，进入黄昏
const NIGHT_START = 0.5; // 黄昏结束，进入黑夜

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth(from, to, value) {
  const k = clamp01((value - from) / Math.max(to - from, 0.0001));
  return k * k * (3 - 2 * k);
}

export const worldTime = {
  elapsed: FULL_CYCLE * 0.46, // 默认停在黄昏，保持整体黄昏像素氛围
  t: 0.46,
  day: 1,
  phase: 'dusk', // dawn | day | dusk | night
  daylight: 0.74, // 1 白天，0 黑夜（含清晨/黄昏过渡）
  night: 0.26,
  dusk: 1,
  dawn: 0,
  clock: '11:02',
};

function applyPhase(t) {
  worldTime.t = t;

  if (t < DAWN_END) {
    worldTime.phase = 'dawn';
    worldTime.daylight = smooth(0, DAWN_END, t);
  } else if (t < DUSK_START) {
    worldTime.phase = 'day';
    worldTime.daylight = 1;
  } else if (t < NIGHT_START) {
    worldTime.phase = 'dusk';
    worldTime.daylight = 1 - smooth(DUSK_START, NIGHT_START, t);
  } else {
    worldTime.phase = 'night';
    worldTime.daylight = 0;
  }

  worldTime.night = 1 - worldTime.daylight;
  worldTime.dusk = worldTime.phase === 'dusk' ? 1 : 0;
  worldTime.dawn = worldTime.phase === 'dawn' ? 1 : 0;

  // 游戏内时钟：一个周期 24 小时（白/黑各 12 小时）
  const hours = t * 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  worldTime.clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

applyPhase(worldTime.t);

export function updateWorldTime(delta) {
  worldTime.elapsed += delta;
  worldTime.day = 1 + Math.floor(worldTime.elapsed / FULL_CYCLE);
  applyPhase((worldTime.elapsed % FULL_CYCLE) / FULL_CYCLE);
}

// 天气：地图偶尔自然下雨，淋雨会缩短山里植物的生长周期
export const weather = {
  raining: false,
  rain: 0, // 0~1 用于雨滴透明度
  left: 0,
  nextIn: 75,
};

export function updateWeather(delta) {
  if (weather.raining) {
    weather.left -= delta;
    weather.rain = Math.min(1, weather.rain + delta * 0.8);
    if (weather.left <= 0) {
      weather.raining = false;
      weather.nextIn = 100 + Math.random() * 90;
    }
  } else {
    weather.rain = Math.max(0, weather.rain - delta * 0.6);
    weather.nextIn -= delta;
    if (weather.nextIn <= 0) {
      // 每次天气变化只有 15% 概率开始下雨，其余情况继续保持晴朗。
      if (Math.random() < 0.15) {
        weather.raining = true;
        weather.left = 28 + Math.random() * 22;
      } else {
        weather.nextIn = 60 + Math.random() * 90;
      }
    }
  }
}

// 傍晚之后（黄昏 + 黑夜）
export function isEvening() {
  return worldTime.phase === 'dusk' || worldTime.phase === 'night';
}

// 夜间躺睡三十秒后切到白天清晨
export function setMorning() {
  const cycles = Math.floor(worldTime.elapsed / FULL_CYCLE);
  worldTime.elapsed = cycles * FULL_CYCLE + FULL_CYCLE * 0.07;
  worldTime.day = 1 + Math.floor(worldTime.elapsed / FULL_CYCLE);
  applyPhase((worldTime.elapsed % FULL_CYCLE) / FULL_CYCLE);
}

export function snapshotTime() {
  return {
    elapsed: worldTime.elapsed,
    day: worldTime.day,
    weather: {
      raining: weather.raining,
      rain: weather.rain,
      left: weather.left,
      nextIn: weather.nextIn,
    },
  };
}

export function restoreTime(saved = {}, fallback = {}) {
  const source = saved && typeof saved === 'object' ? saved : fallback;
  const elapsed = Number.isFinite(source?.elapsed) ? source.elapsed : fallback.elapsed;
  worldTime.elapsed = Math.max(0, Number.isFinite(elapsed) ? elapsed : FULL_CYCLE * 0.46);
  worldTime.day = 1 + Math.floor(worldTime.elapsed / FULL_CYCLE);
  applyPhase((worldTime.elapsed % FULL_CYCLE) / FULL_CYCLE);

  const savedWeather = source?.weather && typeof source.weather === 'object'
    ? source.weather
    : fallback.weather || {};
  const baseWeather = fallback.weather || {};
  const finite = (value, defaultValue) => (Number.isFinite(value) ? value : defaultValue);
  weather.raining = typeof savedWeather.raining === 'boolean'
    ? savedWeather.raining
    : !!baseWeather.raining;
  weather.rain = Math.max(0, Math.min(1, finite(savedWeather.rain, finite(baseWeather.rain, 0))));
  weather.left = Math.max(0, finite(savedWeather.left, finite(baseWeather.left, 0)));
  weather.nextIn = Math.max(0, finite(savedWeather.nextIn, finite(baseWeather.nextIn, 75)));
}
