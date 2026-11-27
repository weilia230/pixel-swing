import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { worldTime } from '../game/time';
import { LAKE_WATER_LEVEL, heightAt, shorelineZ } from '../game/terrain';
import { mulberry32 } from '../utils/random';
import { createCrossedFoliageGeometry, createFoliageTexture } from './foliage';

const DAY_DEEP = new THREE.Color('#2f6752');
const DAY_SHALLOW = new THREE.Color('#759652');
const DAY_GLINT = new THREE.Color('#ffe4a3');
const NIGHT_DEEP = new THREE.Color('#111d31');
const NIGHT_SHALLOW = new THREE.Color('#263d46');
const NIGHT_GLINT = new THREE.Color('#a7bce0');

const waterShader = {
  name: 'PixelLakeReflector',
  uniforms: {
    color: { value: DAY_DEEP.clone() },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uNight: { value: 0 },
    uShallow: { value: DAY_SHALLOW.clone() },
    uGlint: { value: DAY_GLINT.clone() },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vReflectUv;
    varying vec3 vWorld;

    #include <common>
    #include <logdepthbuf_pars_vertex>

    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vReflectUv = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * world;
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uNight;
    uniform vec3 uShallow;
    uniform vec3 uGlint;

    varying vec4 vReflectUv;
    varying vec3 vWorld;

    #include <logdepthbuf_pars_fragment>

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      #include <logdepthbuf_fragment>

      // 世界坐标先量化再生成波纹，倒影会碎成清晰的小像素，而非塑料般平滑。
      vec2 p = floor(vWorld.xz * 4.0) / 4.0;
      float waveA = sin(p.y * 2.2 + uTime * 0.85 + sin(p.x * 0.72));
      float waveB = sin(p.y * 6.1 - uTime * 1.15 + p.x * 0.48);
      float waveC = sin(p.x * 1.35 + p.y * 3.4 + uTime * 0.55);

      vec2 uv = vReflectUv.xy / vReflectUv.w;
      uv += vec2(waveA * 0.0082 + waveB * 0.0031, waveB * 0.0044 + waveC * 0.0018);
      uv = (floor(clamp(uv, 0.002, 0.998) * vec2(1600.0, 900.0)) + 0.5) / vec2(1600.0, 900.0);
      vec3 reflected = texture2D(tDiffuse, uv).rgb;
      reflected = min(reflected * vec3(0.28, 0.72, 0.48), vec3(0.65, 0.85, 0.68));

      float shoreDistance = max(0.0, -vWorld.z);
      float nearShore = 1.0 - smoothstep(0.0, 38.0, shoreDistance);
      vec3 water = mix(color, uShallow, nearShore * 0.5);
      // 倒影只作为淡淡的水色参考，避免低分辨率反射碎成大块
      vec3 result = mix(water, reflected, 0.035 + nearShore * 0.03);
      // 用细波纹明暗代替大块倒影，保留湖面质感
      result *= 0.965 + 0.055 * (waveA * 0.5 + 0.5);

      // 多尺度的小亮块散布整条湖面，夕阳方向更密集。
      float depth = clamp(shoreDistance / 110.0, 0.0, 1.0);
      float sunColumn = exp(-pow(vWorld.x / (5.0 + depth * 17.0), 2.0));
      float ribbon = smoothstep(0.68, 0.97, sin(p.y * 8.2 + waveA * 2.4 - uTime * 1.4) * 0.5 + 0.5);
      float broken = step(0.7, hash21(vec2(floor(p.x * 2.4), floor(p.y * 4.2 - uTime * 0.9))));
      float tiny = step(0.92, hash21(floor(p * 5.0 + vec2(0.0, uTime * 0.7))));
      float glints = ribbon * broken * (0.035 + sunColumn * 0.14) + tiny * (0.02 + sunColumn * 0.05);
      result += uGlint * glints * (1.0 - uNight * 0.42);

      // 暗色细波把亮斑切开，形成湖面而非发光平面。
      float darkRipple = smoothstep(0.76, 0.98, sin(p.y * 10.5 - uTime * 1.1 + waveC) * 0.5 + 0.5);
      result *= 1.0 - darkRipple * 0.075;

      // 岸边只有零星的浅色像素，不画一条生硬的白色描边。
      float shoreline = 0.9 + sin(vWorld.x * 0.5) * 0.22 + sin(vWorld.x * 0.19 + 1.3) * 0.28;
      float edgeDistance = shoreline - vWorld.z;
      float edge = (1.0 - smoothstep(0.0, 1.5, edgeDistance)) * step(0.0, edgeDistance);
      float edgePixels = step(0.7, hash21(floor(p * vec2(3.0, 5.0) + vec2(0.0, uTime * 0.4))));
      result += uGlint * edge * edgePixels * 0.13;

      result = mix(result, result * vec3(0.38, 0.48, 0.72), uNight * 0.58);
      gl_FragColor = vec4(result, 1.0);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

function WaterInstances({ geometry, items, map = null, alphaTest = 0, doubleSide = false, basic = false }) {
  const mesh = useRef();

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    mesh.current.count = items.length;
    items.forEach((item, index) => {
      dummy.position.set(...item.pos);
      dummy.rotation.set(...(item.rot || [0, 0, 0]));
      dummy.scale.set(...item.scale);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
      if (item.color) mesh.current.setColorAt(index, tint.set(item.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [items]);

  return (
    <instancedMesh ref={mesh} args={[geometry, null, Math.max(1, items.length)]} frustumCulled={false}>
      {basic ? (
        <meshBasicMaterial color="#ffffff" map={map} alphaTest={alphaTest} side={doubleSide ? THREE.DoubleSide : THREE.FrontSide} />
      ) : (
        <meshLambertMaterial color="#ffffff" map={map} alphaTest={alphaTest} side={doubleSide ? THREE.DoubleSide : THREE.FrontSide} />
      )}
    </instancedMesh>
  );
}

function makeLilyGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  const points = [
    [0.22, -0.18], [0.42, -0.7], [0.86, -0.68], [1.0, -0.2],
    [0.94, 0.34], [0.6, 0.8], [0.12, 0.98], [-0.45, 0.86],
    [-0.88, 0.48], [-1.0, -0.05], [-0.82, -0.58], [-0.35, -0.86], [0, 0],
  ];
  points.forEach(([x, y]) => shape.lineTo(x, y));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function buildWaterPlants() {
  const random = mulberry32(7719);
  const pads = [];
  const duckweed = [];
  const petals = [];
  const centers = [];
  const reeds = [];
  const padColors = ['#3f713b', '#4f853f', '#659844', '#789f48', '#527f38'];
  const duckColors = ['#6d993c', '#87ad43', '#9dbb4b', '#4f7c37', '#b0c65a'];

  const nearClusters = [[-12, -7], [16, -12], [-28, -18], [35, -8], [-4, -27], [48, -25]];
  for (let cluster = 0; cluster < 46; cluster += 1) {
    const anchor = nearClusters[cluster];
    const cx = anchor ? anchor[0] : (random() - 0.5) * (random() > 0.35 ? 190 : 420);
    const cz = anchor ? anchor[1] : -3 - random() * 48;
    const padCount = 3 + Math.floor(random() * 8);
    for (let i = 0; i < padCount; i += 1) {
      const x = cx + (random() - 0.5) * 12;
      const z = cz + (random() - 0.5) * 10;
      if (z > shorelineZ(x) - 0.7) continue;
      const scale = 0.42 + random() * 0.85;
      pads.push({
        pos: [x, 0.065 + random() * 0.012, z],
        rot: [0, random() * Math.PI * 2, 0],
        scale: [scale, scale, scale * (0.8 + random() * 0.25)],
        color: padColors[Math.floor(random() * padColors.length)],
      });

      if (random() > 0.86 && petals.length < 180) {
        const flowerColor = random() > 0.45 ? '#f2a8b5' : '#f6d7d0';
        for (let petal = 0; petal < 5; petal += 1) {
          const angle = (petal / 5) * Math.PI * 2;
          petals.push({
            pos: [x + Math.cos(angle) * 0.15, 0.19, z + Math.sin(angle) * 0.15],
            rot: [0, -angle, 0.25],
            scale: [0.16, 0.12, 0.28],
            color: flowerColor,
          });
        }
        centers.push({ pos: [x, 0.24, z], scale: [0.15, 0.13, 0.15], color: '#f3d36b' });
      }
    }

    const duckCount = 30 + Math.floor(random() * 55);
    for (let i = 0; i < duckCount; i += 1) {
      const x = cx + (random() - 0.5) * 17;
      const z = cz + (random() - 0.5) * 14;
      if (z > shorelineZ(x) - 0.35) continue;
      const scale = 0.07 + random() * 0.22;
      duckweed.push({
        pos: [x, 0.035 + random() * 0.012, z],
        rot: [0, random() * Math.PI, 0],
        scale: [scale * (1 + random()), 1, scale],
        color: duckColors[Math.floor(random() * duckColors.length)],
      });
    }
  }

  for (let i = 0; i < 760; i += 1) {
    const x = (random() - 0.5) * (random() > 0.3 ? 250 : 620);
    const shore = shorelineZ(x);
    const z = shore + (random() - 0.68) * 2.3;
    const scale = 0.42 + random() * 0.65;
    reeds.push({
      pos: [x, Math.max(0.02, heightAt(x, z) + 0.02), z],
      rot: [0, random() * Math.PI * 2, (random() - 0.5) * 0.08],
      scale: [scale, scale * (1.1 + random() * 1.35), scale],
      color: random() > 0.5 ? '#d0d9a0' : '#b5c88a',
    });
  }

  return { pads, duckweed, petals, centers, reeds };
}

export default function Lake() {
  const water = useMemo(() => {
    const reflector = new Reflector(new THREE.PlaneGeometry(1920, 300), {
      textureWidth: 768,
      textureHeight: 512,
      clipBias: 0.003,
      multisample: 0,
      color: '#2f6752',
      shader: waterShader,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, LAKE_WATER_LEVEL, -148.5);

    // 倒影每两帧更新一次，像素波纹仍逐帧流动，降低整片森林的重复渲染开销。
    const renderReflection = reflector.onBeforeRender;
    let frame = 0;
    reflector.onBeforeRender = (...args) => {
      frame += 1;
      if (frame < 3 || frame % 2 === 0) renderReflection(...args);
    };
    return reflector;
  }, []);

  const plants = useMemo(() => buildWaterPlants(), []);
  const lilyGeometry = useMemo(() => makeLilyGeometry(), []);
  const duckGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, []);
  const flowerGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const reedGeometry = useMemo(() => createCrossedFoliageGeometry(), []);
  const reedTexture = useMemo(() => createFoliageTexture('reed'), []);

  useEffect(() => () => {
    water.geometry.dispose();
    water.dispose();
  }, [water]);

  useFrame(({ clock }) => {
    const uniforms = water.material.uniforms;
    const day = worldTime.daylight;
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uNight.value = worldTime.night;
    uniforms.color.value.copy(NIGHT_DEEP).lerp(DAY_DEEP, day);
    uniforms.uShallow.value.copy(NIGHT_SHALLOW).lerp(DAY_SHALLOW, day);
    uniforms.uGlint.value.copy(NIGHT_GLINT).lerp(DAY_GLINT, day);
  });

  return (
    <group>
      <primitive object={water} />
      <WaterInstances geometry={duckGeometry} items={plants.duckweed} />
      <WaterInstances geometry={lilyGeometry} items={plants.pads} />
      <WaterInstances geometry={flowerGeometry} items={plants.petals} />
      <WaterInstances geometry={flowerGeometry} items={plants.centers} />
      <WaterInstances geometry={reedGeometry} items={plants.reeds} map={reedTexture} alphaTest={0.35} doubleSide />
    </group>
  );
}
