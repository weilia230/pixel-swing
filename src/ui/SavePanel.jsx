import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getSaveCode,
  getSaveStatus,
  importSaveCode,
  initSave,
  saveNow,
  subscribeSaveStatus,
} from '../game/save';

function formatSavedAt(savedAt) {
  if (!savedAt) return '尚未保存';
  return new Date(savedAt).toLocaleString('zh-CN', { hour12: false });
}

export function SavePanel() {
  const status = useSyncExternalStore(subscribeSaveStatus, getSaveStatus);
  const [code, setCode] = useState(() => {
    try { return getSaveCode(); } catch { return ''; }
  });
  const [importCode, setImportCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    initSave().then(() => {
      try { setCode(getSaveCode()); } catch { /* 状态栏会显示 ID 创建错误 */ }
    });
  }, []);

  const copyCode = async () => {
    if (!code) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(code);
      setNotice('存档码已复制');
    } catch {
      setNotice('无法自动复制，请选中存档码手动复制');
    }
  };

  const importFromCode = async (event) => {
    event.preventDefault();
    if (busy || !importCode.trim()) return;
    setBusy(true);
    setNotice('正在导入存档…');
    const result = await importSaveCode(importCode);
    if (result.ok) {
      setCode(result.code);
      setImportCode('');
      setNotice('存档导入完成');
    } else {
      setNotice(result.error);
    }
    setBusy(false);
  };

  return (
    <section className="save-panel" aria-label="本地与云存档">
      <div className="save-status" data-cloud={status.cloud} role="status">
        <span>{status.message}</span>
        <span>最近保存：{formatSavedAt(status.savedAt)}</span>
        {status.pendingCloud && <span>有更改等待上传</span>}
        {status.localError && <span>{status.localError}</span>}
      </div>

      <label>
        存档码
        <textarea
          className="save-code"
          readOnly
          rows={2}
          value={code}
          onFocus={(event) => event.target.select()}
          aria-label="当前存档码"
        />
      </label>
      <button type="button" onClick={copyCode} disabled={!code}>复制存档码</button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          saveNow();
          setNotice('已保存到本地，云端将按队列同步');
        }}
      >
        立即保存
      </button>

      <form onSubmit={importFromCode}>
        <label>
          导入存档码
          <input
            className="save-code"
            value={importCode}
            onChange={(event) => setImportCode(event.target.value)}
            placeholder="PS1."
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" disabled={busy || !importCode.trim()}>
          {busy ? '导入中…' : '导入'}
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

export default SavePanel;
