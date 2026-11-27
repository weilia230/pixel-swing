import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { MoleBody } from './scene/Moles';

const VIEWS = [
  { label: '正面', rotation: 0, distance: 3.1 },
  { label: '侧面', rotation: Math.PI / 2, distance: 4.3 },
  { label: '背面', rotation: Math.PI, distance: 3.1 },
  { label: '3/4 视角', rotation: -Math.PI / 4, distance: 3.6 },
];

function Cell({ view }) {
  const k = view.distance / 2.95;
  return (
    <div className="cell">
      <div className="cell__label">{view.label}</div>
      <Canvas
        dpr={1}
        camera={{ position: [0, 0.33 + 0.59 * k, 2.95 * k], fov: 28 }}
        gl={{ antialias: false }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0.33, 0);
        }}
      >
        <color attach="background" args={['#2a1d26']} />
        <ambientLight intensity={1.4} color="#ffe2c0" />
        <directionalLight position={[2.5, 5, 3.5]} intensity={1.5} color="#ffd6a0" />
        <directionalLight position={[-3, 2.5, -2]} intensity={0.7} color="#8fa8d0" />
        <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
          <planeGeometry args={[9, 7]} />
          <meshLambertMaterial color="#4c5a47" />
        </mesh>
        <group rotation-y={view.rotation}>
          <group scale={0.06}>
            <MoleBody />
          </group>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
            <circleGeometry args={[0.42, 12]} />
            <meshBasicMaterial color="#1d241d" transparent opacity={0.35} depthWrite={false} />
          </mesh>
        </group>
      </Canvas>
    </div>
  );
}

function App() {
  return (
    <>
      <div className="grid">
        {VIEWS.map((view) => (
          <Cell key={view.label} view={view} />
        ))}
      </div>
      <div className="hint">像素鼹鼠 · 造型预览</div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
