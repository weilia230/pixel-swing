import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { player, swing } from '../game/runtime';
import { SWING_PIVOT, SWING_ROPE_LENGTH } from '../game/terrain';

const PIVOT = [SWING_PIVOT.x, SWING_PIVOT.y, SWING_PIVOT.z];
const ROPE_LENGTH = SWING_ROPE_LENGTH;
const ROPE_X = 0.33;

// 吊线拉长后，把角速度/推力按比例调小，避免长绳下摆幅过猛
const VEL_CLAMP = 0.55;
const ANGLE_CLAMP = 1.12;
const PUSH_GAIN = 0.5;
const DAMPING = 0.35;

export default function Swing() {
  const pivot = useRef();
  const seat = useRef();
  const ring = useRef();
  const temp = useRef(new THREE.Vector3());

  swing.seat.set(PIVOT[0], 0, PIVOT[2]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 1 / 30);

    if (swing.pushing) {
      const direction = Math.abs(swing.velocity) > 0.2 ? Math.sign(swing.velocity) : 1;
      swing.velocity += direction * PUSH_GAIN * dt;
    }

    swing.velocity += (-(9.8 / ROPE_LENGTH) * Math.sin(swing.angle) - DAMPING * swing.velocity) * dt;
    swing.velocity = THREE.MathUtils.clamp(swing.velocity, -VEL_CLAMP, VEL_CLAMP);
    swing.angle += swing.velocity * dt;
    swing.angle = THREE.MathUtils.clamp(swing.angle, -ANGLE_CLAMP, ANGLE_CLAMP);

    if (pivot.current) pivot.current.rotation.x = swing.angle;

    if (seat.current) {
      seat.current.getWorldPosition(temp.current);
      swing.seatTop.copy(temp.current);
      swing.seatTop.y += 0.14;
    }

    if (ring.current) {
      const visible = player.nearSwing && player.mode === 'walk';
      ring.current.visible = visible;
      if (visible) {
        ring.current.material.opacity = 0.2 + 0.08 * Math.sin(clock.elapsedTime * 3);
      }
    }
  });

  return (
    <group>
      <group position={PIVOT} rotation={[0, swing.yaw, 0]}>
        <group ref={pivot}>
          {[-ROPE_X, ROPE_X].map((x) => (
            <mesh key={x} position={[x, -ROPE_LENGTH / 2, 0]}>
              <cylinderGeometry args={[0.024, 0.024, ROPE_LENGTH, 4]} />
              <meshLambertMaterial color="#a87c4e" />
            </mesh>
          ))}
          <mesh position={[-ROPE_X, -0.03, 0]}>
            <boxGeometry args={[0.07, 0.06, 0.07]} />
            <meshLambertMaterial color="#6b482e" />
          </mesh>
          <mesh position={[ROPE_X, -0.03, 0]}>
            <boxGeometry args={[0.07, 0.06, 0.07]} />
            <meshLambertMaterial color="#6b482e" />
          </mesh>

          <group ref={seat} position={[0, -ROPE_LENGTH, 0]}>
            <mesh>
              <boxGeometry args={[1.0, 0.08, 0.4]} />
              <meshLambertMaterial color="#a06a3f" />
            </mesh>
            <mesh position={[0, -0.05, 0]}>
              <boxGeometry args={[1.02, 0.03, 0.42]} />
              <meshLambertMaterial color="#6f4526" />
            </mesh>
          </group>
        </group>
      </group>

      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[PIVOT[0], 0.08, PIVOT[2]]}>
        <ringGeometry args={[0.72, 0.86, 16]} />
        <meshBasicMaterial color="#ffe3a8" transparent opacity={0.24} depthWrite={false} />
      </mesh>
    </group>
  );
}
