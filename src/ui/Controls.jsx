import { useCallback, useEffect, useRef, useState } from 'react';
import { input, resetInput } from '../game/runtime';

const BUTTONS = [
  { key: 'up', label: '▲', input: 'forward', area: '1 / 2 / 2 / 3' },
  { key: 'left', label: '◀', input: 'left', area: '2 / 1 / 3 / 2' },
  { key: 'down', label: '▼', input: 'back', area: '2 / 2 / 3 / 3' },
  { key: 'right', label: '▶', input: 'right', area: '2 / 3 / 3 / 4' },
];

export default function Controls({ disabled, pose, canPose, onCyclePose }) {
  const rootRef = useRef(null);
  const joystickRef = useRef(null);
  const knobRef = useRef(null);
  const joystickPointer = useRef(null);
  const [isTouch, setIsTouch] = useState(() => (
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse), (any-pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  ));

  const resetJoystick = useCallback(() => {
    const pointerId = joystickPointer.current;
    const joystick = joystickRef.current;
    joystickPointer.current = null;
    if (pointerId !== null && joystick?.hasPointerCapture(pointerId)) {
      joystick.releasePointerCapture(pointerId);
    }
    input.moveX = 0;
    input.moveZ = 0;
    if (knobRef.current) knobRef.current.style.transform = 'translate3d(0px, 0px, 0)';
  }, []);

  const updateJoystick = useCallback((event) => {
    const joystick = joystickRef.current;
    const knob = knobRef.current;
    if (!joystick || !knob) return;

    const rect = joystick.getBoundingClientRect();
    const travel = Math.max(1, (Math.min(rect.width, rect.height) - knob.offsetWidth) / 2);
    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    if (distance > travel) {
      x = (x / distance) * travel;
      y = (y / distance) * travel;
    }

    input.moveX = x / travel;
    input.moveZ = -y / travel;
    knob.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse), (any-pointer: coarse)');
    const updateTouch = () => setIsTouch(query.matches || navigator.maxTouchPoints > 0);
    updateTouch();
    query.addEventListener('change', updateTouch);
    return () => query.removeEventListener('change', updateTouch);
  }, []);

  useEffect(() => {
    if (!disabled) return;
    rootRef.current?.querySelectorAll('.pad.is-down').forEach((element) => {
      element.classList.remove('is-down');
    });
    resetInput();
    resetJoystick();
  }, [disabled, resetJoystick]);

  useEffect(() => () => resetJoystick(), [resetJoystick]);

  const bind = (field) => ({
    onPointerDown: (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('is-down');
      if (field === 'jump') {
        input.jump = true;
      } else {
        input[field] = true;
      }
    },
    onPointerUp: (event) => {
      event.stopPropagation();
      event.currentTarget.classList.remove('is-down');
      if (field !== 'jump') input[field] = false;
    },
    onPointerCancel: (event) => {
      event.currentTarget.classList.remove('is-down');
      if (field !== 'jump') input[field] = false;
    },
    onPointerLeave: (event) => {
      if (event.buttons === 0) return;
      event.currentTarget.classList.remove('is-down');
      if (field !== 'jump') input[field] = false;
    },
    onContextMenu: (event) => event.preventDefault(),
  });

  return (
    <div
      ref={rootRef}
      className={`controls${isTouch ? ' controls--touch' : ''}${disabled ? ' controls--disabled' : ''}`}
    >
      <div className="dpad">
        {BUTTONS.map((button) => (
          <button
            key={button.key}
            type="button"
            className={`pad pad--${button.key}`}
            style={{ gridArea: button.area }}
            aria-label={button.key}
            {...bind(button.input)}
          >
            {button.label}
          </button>
        ))}
      </div>

      <div
        ref={joystickRef}
        className="touch-joystick"
        role="group"
        aria-label="移动摇杆"
        aria-disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isTouch || disabled || joystickPointer.current !== null) return;
          joystickPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateJoystick(event);
        }}
        onPointerMove={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isTouch || disabled || joystickPointer.current !== event.pointerId) return;
          updateJoystick(event);
        }}
        onPointerUp={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (joystickPointer.current !== event.pointerId) return;
          resetJoystick();
        }}
        onPointerCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (joystickPointer.current !== event.pointerId) return;
          resetJoystick();
        }}
        onLostPointerCapture={(event) => {
          event.stopPropagation();
          if (joystickPointer.current !== event.pointerId) return;
          resetJoystick();
        }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div
          ref={knobRef}
          className="touch-joystick__knob"
          style={{ transform: 'translate3d(0px, 0px, 0)' }}
        />
      </div>

      <div className="action-stack">
        {canPose && (
          <button
            type="button"
            className="pose-btn"
            aria-label={pose === 'groundSit' ? '躺下' : pose === 'groundLie' ? '站起来' : '坐下'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onCyclePose}
          >
            {pose === 'groundSit' ? '躺' : pose === 'groundLie' ? '起' : '坐'}
          </button>
        )}
        <button
          type="button"
          className="pad pad--jump"
          aria-label="跳跃"
          {...bind('jump')}
        >
          跳
        </button>
      </div>
    </div>
  );
}
