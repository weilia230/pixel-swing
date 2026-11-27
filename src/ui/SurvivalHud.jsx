import { useEffect, useState } from 'react';
import { survival } from '../game/survival';
import { SURVIVAL } from '../game/survivalConfig';

const ROWS = [
  { key: 'hp', color: '#e04b3c', name: '生命' },
  { key: 'hunger', color: '#e08c34', name: '饱腹' },
  { key: 'cold', color: '#4a86c8', name: '寒冷' },
  { key: 'stamina', color: '#7aa32f', name: '体力' },
  { key: 'sleep', color: '#8a6fae', name: '睡眠' },
];

function readSnapshot() {
  return {
    hp: survival.hp,
    hunger: survival.hunger,
    cold: survival.cold,
    stamina: survival.stamina,
    sleep: survival.sleep,
    down: survival.downTimer > 0,
  };
}

function lowOpacity(value, threshold = 30) {
  if (value >= threshold) return 0;
  return Math.min(0.7, 0.22 + ((threshold - value) / threshold) * 0.5);
}

// 左上角五项生存条：像素进度条 + 数字，颜色对应生命 / 饥饿 / 寒冷 / 体力 / 睡眠
export default function SurvivalHud() {
  const [state, setState] = useState(readSnapshot);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = readSnapshot();
      setState((prev) => {
        if (
          Math.round(prev.hp) === Math.round(next.hp) &&
          Math.round(prev.hunger) === Math.round(next.hunger) &&
          Math.round(prev.cold) === Math.round(next.cold) &&
          Math.round(prev.stamina) === Math.round(next.stamina) &&
          Math.round(prev.sleep) === Math.round(next.sleep) &&
          prev.down === next.down
        ) {
          return prev;
        }
        return next;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  const hpLow = lowOpacity(state.hp);
  const hungerLow = lowOpacity(state.hunger);
  const coldLow = lowOpacity(state.cold);
  const sleepLow = lowOpacity(state.sleep);

  return (
    <>
      <div className="survival-hud" aria-label="生存状态">
        {ROWS.map((row) => {
          const value = Math.max(0, Math.min(SURVIVAL.max, state[row.key]));
          const percent = (value / SURVIVAL.max) * 100;
          return (
            <div className="sv-row" key={row.key}>
              <span className="sv-label">{row.name}</span>
              <span className="sv-icon" style={{ background: row.color }} title={row.name} />
              <div className="sv-bar">
                <div
                  className="sv-fill"
                  style={{ width: `${percent}%`, backgroundColor: row.color }}
                />
                <div className="sv-notch" />
              </div>
              <span className="sv-num">{Math.round(value)}</span>
            </div>
          );
        })}
      </div>

      <div className="sv-vignette sv-vignette--hp" style={{ opacity: hpLow }} />
      <div className="sv-vignette sv-vignette--hunger" style={{ opacity: hungerLow }} />
      <div className="sv-vignette sv-vignette--cold" style={{ opacity: coldLow }} />
      <div className="sv-vignette sv-vignette--sleep" style={{ opacity: sleepLow }} />

      <div className={`sv-downed ${state.down ? 'is-on' : ''}`}>眼前一黑…</div>
    </>
  );
}
