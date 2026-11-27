import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  bag,
  dropStack,
  getStoreVersion,
  held,
  ITEM_CATEGORIES,
  ITEMS,
  itemCategory,
  moveStack,
  setHeld,
  storage,
  subscribeStore,
} from '../game/inventory';

function ItemChip({ type }) {
  const info = ITEMS[type];
  if (!info) return null;
  return (
    <span
      className="inv-item"
      data-cat={info.category}
      style={{ '--item-color': info.color, '--item-leaf': info.leaf }}
    >
      <span className="inv-item__stem" />
      <span className="inv-item__body" />
      <span className="inv-item__leaf" />
      <span className="inv-item__shine" />
      <span className="inv-item__name">{info.name}</span>
    </span>
  );
}

export default function Inventory({ bagOpen, storageOpen, onCloseBag, onCloseStorage }) {
  const version = useSyncExternalStore(subscribeStore, getStoreVersion);
  const [drag, setDrag] = useState(null);
  const [filter, setFilter] = useState('all');
  const pressRef = useRef(null);

  useEffect(() => {
    const onMove = (event) => {
      const active = pressRef.current;
      if (!active) return;
      if (!active.moved && Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 7) {
        active.moved = true;
      }
      if (active.moved) {
        setDrag({ kind: active.kind, index: active.index, type: active.type, x: event.clientX, y: event.clientY });
      }
    };

    const onUp = (event) => {
      const active = pressRef.current;
      pressRef.current = null;
      setDrag(null);
      if (!active) return;

      if (!active.moved) {
        if (active.kind === 'bag') setHeld(held.type === active.type ? null : active.type);
        return;
      }

      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest?.('[data-slot]');
      if (target) {
        const kind = target.getAttribute('data-kind');
        const index = Number(target.getAttribute('data-index'));
        if (kind && Number.isInteger(index)) moveStack(active.kind, active.index, kind, index);
      } else {
        dropStack(active.kind, active.index);
      }
    };

    const onCancel = () => {
      pressRef.current = null;
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  const beginPress = (event, kind, index) => {
    const source = kind === 'storage' ? storage : bag;
    const item = source.slots[index];
    if (!item) return;
    event.preventDefault();
    pressRef.current = {
      kind,
      index,
      type: item.type,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const renderSlots = (source, kind, count) =>
    Array.from({ length: count }, (_, index) => {
      const item = source.slots[index];
      if (kind === 'bag' && filter !== 'all' && (!item || itemCategory(item.type) !== filter)) {
        return null;
      }
      const dragging = drag && drag.kind === kind && drag.index === index;
      const isHeld = kind === 'bag' && item && held.type === item.type;
      return (
        <button
          type="button"
          key={`${kind}-${index}`}
          className={`inv-slot ${dragging ? 'is-dragging' : ''} ${isHeld ? 'is-held' : ''}`}
          data-slot="1"
          data-kind={kind}
          data-index={index}
          onPointerDown={(event) => beginPress(event, kind, index)}
        >
          {item && !dragging && <ItemChip type={item.type} />}
        </button>
      );
    });

  return (
    <>
      {bagOpen && (
        <section className="inv-panel inv-panel--bag" aria-label="背包">
          <header className="inv-panel__head">
            <span>背包</span>
            <button type="button" className="inv-panel__close" onClick={onCloseBag}>×</button>
          </header>
          <div className="inv-tabs">
            {ITEM_CATEGORIES.map((category) => (
              <button
                type="button"
                key={category.id}
                className={`inv-tab ${filter === category.id ? 'is-on' : ''}`}
                onClick={() => setFilter(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
          <div className="inv-grid">{renderSlots(bag, 'bag', bag.slots.length)}</div>
          <p className="inv-panel__hint">点击手持/收起 · 拖拽换位 · 拖到格子外丢弃</p>
        </section>
      )}

      {storageOpen && (
        <section className="inv-panel inv-panel--storage" aria-label="仓库">
          <header className="inv-panel__head">
            <span>仓库</span>
            <button type="button" className="inv-panel__close" onClick={onCloseStorage}>×</button>
          </header>
          <div className="inv-grid inv-grid--storage">
            {renderSlots(storage, 'storage', storage.slots.length)}
          </div>
          <p className="inv-panel__hint">滚轮上下翻找 · 可以和背包互相拖拽</p>
        </section>
      )}

      {drag && (
        <div className="inv-ghost" style={{ left: drag.x, top: drag.y }}>
          <ItemChip type={drag.type} />
        </div>
      )}
      <span hidden data-version={version} />
    </>
  );
}
