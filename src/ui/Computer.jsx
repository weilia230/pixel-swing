import { useEffect, useState } from 'react';
import {
  addTracks,
  currentTrack,
  playTrack,
  radio,
  setLoop,
  subscribeRadio,
  togglePlay,
} from '../game/radio';

// 黄昏电台：添加本地歌曲、点播、单曲循环或播完结束；关闭电脑后仍继续播放
function RadioApp() {
  const [, force] = useState(0);
  useEffect(() => subscribeRadio(() => force((value) => value + 1)), []);
  const track = currentTrack();

  return (
    <div className="pc-app-body">
      <p>♪ {track ? `${radio.playing ? '正在播放' : '已暂停'}：${track.name}` : '还没有添加歌曲'} ♪</p>
      <div className={`pc-eq ${radio.playing ? '' : 'is-idle'}`}>
        {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.45, 0.7].map((h, i) => (
          <i key={i} style={{ height: `${h * 100}%` }} />
        ))}
      </div>

      <div className="pc-radio-actions">
        <label className="pc-radio-add">
          添加歌曲
          <input
            type="file"
            accept="audio/*"
            multiple
            onChange={(event) => {
              addTracks(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" className="pc-radio-play" onClick={togglePlay}>
          {radio.playing ? '暂停' : '播放'}
        </button>
        <label className="pc-radio-loop">
          <input
            type="checkbox"
            checked={radio.loop}
            onChange={(event) => setLoop(event.target.checked)}
          />
          单曲循环
        </label>
      </div>

      <ul className="pc-radio-list">
        {radio.tracks.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`pc-radio-track ${radio.currentId === item.id ? 'is-active' : ''}`}
              onClick={() => playTrack(item.id)}
            >
              {radio.currentId === item.id && radio.playing ? '▶' : '♪'} {item.name}
            </button>
          </li>
        ))}
      </ul>
      {!radio.loop && <p className="pc-hint">播完结束；关闭电脑后音乐会继续作为背景音乐。</p>}
      {radio.loop && <p className="pc-hint">单曲循环中；关闭电脑后音乐会继续播放。</p>}
    </div>
  );
}

// 像素电脑桌面：点击图标打开小内容窗，点遮罩或关机键关闭
const APPS = {
  album: {
    name: '樱花相册',
    icon: '🌸',
    body: (
      <div className="pc-app-body">
        <p>黄昏的风一吹，樱花就簌簌地落。</p>
        <p>小樱把最喜欢的花瓣都夹进了这本相册里 ♡</p>
        <div className="pc-photos">
          <span style={{ background: '#ffc0d4' }} />
          <span style={{ background: '#ffd6e2' }} />
          <span style={{ background: '#ffe7c2' }} />
          <span style={{ background: '#ffb3c6' }} />
        </div>
      </div>
    ),
  },
  diary: {
    name: '兔子日记',
    icon: '🐇',
    body: (
      <div className="pc-app-body">
        <p>今天草地上来了好多小兔子～</p>
        <p>一只灰灰的最爱追着樱花跑，软软的！</p>
        <p>给它们取了名字：团子、麻薯、奶糖……</p>
      </div>
    ),
  },
  radio: {
    name: '黄昏电台',
    icon: '📻',
    body: null,
  },
};

export default function Computer({ open, onClose }) {
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!open) setActive(null);
  }, [open]);

  if (!open) return null;

  return (
    <div className="pc-overlay" onPointerDown={onClose}>
      <div className="pc-monitor" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pc-bezel">
          <div className="pc-screen">
            <div className="pc-topbar">
              <span className="pc-dot pc-dot--r" />
              <span className="pc-dot pc-dot--y" />
              <span className="pc-dot pc-dot--g" />
              <span className="pc-title">小樱的电脑</span>
              <button type="button" className="pc-close" onClick={onClose}>关机</button>
            </div>

            <div className="pc-desktop">
              {Object.entries(APPS).map(([key, app]) => (
                <button
                  key={key}
                  type="button"
                  className={`pc-icon ${active === key ? 'is-active' : ''}`}
                  onClick={() => setActive(key)}
                >
                  <span className="pc-icon-img">{app.icon}</span>
                  <span className="pc-icon-label">{app.name}</span>
                </button>
              ))}

              {active && APPS[active] && (
                <div className="pc-window">
                  <div className="pc-window-title">
                    <span>{APPS[active].name}</span>
                    <button type="button" onClick={() => setActive(null)}>×</button>
                  </div>
                  {active === 'radio' ? <RadioApp /> : APPS[active].body}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="pc-stand" />
        <div className="pc-base" />
      </div>
    </div>
  );
}
