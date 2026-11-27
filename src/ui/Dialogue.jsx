import { useEffect, useRef, useState } from 'react';
import { askCompanion } from '../game/companion';

const GREETING = '你好呀，欢迎来到小樱的世界！';
// 上下文连结上限：达到后小樱会「累了」，停止继续对话
const MAX_MESSAGES = 40;

function cleanName(raw) {
  return String(raw)
    .replace(/[。，,.!！?？~～\s]/g, '')
    .slice(0, 8);
}

// 从对话里认出对方的名字（「我叫…」「我是…」「叫我…」，或刚被问名字时的简短回答）
function extractName(text, lastGirlText) {
  const matched = text.match(
    /(?:我叫|我的名字(?:叫|是)|名字叫|叫我|我是)\s*([\u4e00-\u9fa5A-Za-z·]{1,8})/
  );
  if (matched) {
    const name = cleanName(matched[1]);
    if (name) return name;
  }
  if (lastGirlText && /你叫什么|怎么称呼|你的名字/.test(lastGirlText)) {
    const name = cleanName(text);
    if (name && name.length <= 8 && /^[\u4e00-\u9fa5A-Za-z·]+$/.test(name)) return name;
  }
  return null;
}

export default function Dialogue({ open, onClose }) {
  const [messages, setMessages] = useState([{ from: 'girl', text: GREETING }]);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [userName, setUserName] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const sendingRef = useRef(false);
  const messagesRef = useRef(messages);
  const nameRef = useRef('');

  // 始终保存最新消息，避免 send 闭包拿到旧历史导致重复 / 丢失上下文
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    nameRef.current = userName;
  }, [userName]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending, open]);

  const tired = messages.length >= MAX_MESSAGES;

  const send = async () => {
    const text = value.trim();
    if (!text || sendingRef.current || tired) return;

    sendingRef.current = true;
    setSending(true);
    setValue('');

    const history = messagesRef.current;
    const lastGirl = [...history].reverse().find((message) => message.from === 'girl');
    const foundName = extractName(text, lastGirl?.text);
    if (foundName) setUserName(foundName);

    setMessages((prev) => [...prev, { from: 'me', text }]);

    const reply = await askCompanion(history, text, nameRef.current || foundName || '');

    setMessages((prev) => [...prev, { from: 'girl', text: reply }]);
    sendingRef.current = false;
    setSending(false);

    // 聊到关键词「兔子 / 秋千 / 樱花」→ 触发一波花瓣飘落彩蛋
    if (/兔子|秋千|樱花/.test(text + (reply || ''))) {
      window.dispatchEvent(new CustomEvent('petal-burst'));
    }

    inputRef.current?.focus();
  };

  return (
    <div
      className={`dialogue ${open ? 'dialogue--open' : ''}`}
      role="dialog"
      aria-label="和湖边的小姑娘说话"
      aria-hidden={!open}
    >
      <div className="dialogue__head">
        <span className="dialogue__dot" />
        <span className="dialogue__name">小樱</span>
        <button type="button" className="dialogue__close" onClick={onClose} aria-label="关闭对话">
          ×
        </button>
      </div>

      <div className="dialogue__log" ref={listRef}>
        {messages.map((message, index) => (
          <div
            key={index}
            className={`dialogue__msg dialogue__msg--${message.from === 'girl' ? 'girl' : 'me'}`}
          >
            {message.text}
          </div>
        ))}
        {sending && <div className="dialogue__msg dialogue__msg--girl dialogue__typing">……</div>}
      </div>

      <form
        className="dialogue__row"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <input
          ref={inputRef}
          className="dialogue__input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
          }}
          maxLength={80}
          disabled={tired}
          placeholder={tired ? '小樱休息了…' : '和小樱说点什么…'}
          aria-label="对话输入框"
        />
        <button
          type="submit"
          className="dialogue__send"
          disabled={tired || sending || value.trim().length === 0}
        >
          发送
        </button>
      </form>

      {tired && <div className="dialogue__tired">小樱累了，下次再聊吧</div>}
    </div>
  );
}
