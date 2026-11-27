import { useEffect, useState } from 'react';
import { net, sendChat } from '../game/net';

export default function ChatPanel() {
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [inRoom, setInRoom] = useState(!!net.roomCode);

  useEffect(() => {
    const tick = () => setInRoom(!!net.roomCode);
    const timer = window.setInterval(tick, 200);
    tick();
    return () => window.clearInterval(timer);
  }, []);

  if (!inRoom) return null;

  const submit = (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      setHint('不能发送空白消息');
      return;
    }
    if (value.length > 80) {
      setHint('消息最多 80 字');
      return;
    }
    const result = sendChat(value);
    if (!result.ok) {
      if (result.reason === 'rate_limited') setHint('发送太快了，请间隔 1 秒');
      else if (result.reason === 'offline') setHint('连接已断开，暂时无法发送');
      else if (result.reason === 'too_long') setHint('消息最多 80 字');
      else setHint('不能发送空白消息');
      return;
    }
    setText('');
    setHint('');
  };

  return (
    <form
      className="chat-panel"
      onSubmit={submit}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        className="chat-input"
        value={text}
        maxLength={80}
        autoComplete="off"
        spellCheck={false}
        placeholder="说点什么…"
        aria-label="聊天消息"
        onChange={(event) => {
          setText(event.target.value);
          if (hint) setHint('');
        }}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
      />
      <button className="chat-send" type="submit">
        发送
      </button>
      {hint && <div className="chat-hint" role="status">{hint}</div>}
    </form>
  );
}
