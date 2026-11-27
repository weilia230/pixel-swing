import * as THREE from 'three';
import { SPECIES_BY_ID } from './game/plantsCatalog.js';
import { PLANT_SCALE } from './game/terrain.js';
import { buildGlyph } from './scene/WildPlants.jsx';
import { buildFruitTree, summarizeBlocks, u, voxelizeParts } from './scene/voxelFlora.js';

// 只用于看例图：按类分组渲染成熟期模型，不参与游戏逻辑。
const GROUPS = {
  trees: { title: '果树 · 成熟期', ids: ['persimmon', 'apple', 'peach', 'osmanthus', 'parasol', 'pine'] },
  tropical: { title: '热带 / 旱生植物', ids: ['banana', 'cactus', 'mango'] },
  berries: { title: '浆果灌木', ids: ['raspberry', 'currant', 'blueberry'] },
  wild: { title: '野生草本', ids: ['wildVeg', 'scallion', 'burdock', 'wildCarrot'] },
  crops: { title: '农作物与菌菇', ids: ['pumpkin', 'greenBean', 'potato', 'purpleCabbage', 'carrot', 'mushroom'] },
};

const params = new URLSearchParams(window.location.search);
const group = GROUPS[params.get('group')] || GROUPS.trees;

const app = document.getElementById('app');

const header = document.createElement('h1');
header.textContent = group.title;
app.appendChild(header);

const hint = document.createElement('div');
hint.className = 'hint';
hint.textContent = '成熟期 · 矮植物 0.7U 颗粒 · 6 档色阶 · 果实提亮';
app.appendChild(hint);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b232c');

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);

scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5560, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.25);
sun.position.set(8, 18, 14);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc8d8ff, 0.4);
fill.position.set(-12, 8, -10);
scene.add(fill);

function seedOf(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 100000;
  return hash + 1;
}

const models = group.ids.map((id) => {
  const species = SPECIES_BY_ID[id];
  let model;
  if (species.family === 'tree') {
    model = buildFruitTree(species, 3, { seed: seedOf(id) });
  } else {
    const blocks = voxelizeParts(buildGlyph(species, 3), {
      factor: species.scale * 1.15 * PLANT_SCALE,
      budget: species.mushroom ? 260 : species.id === 'mango' ? 2600 : species.family === 'berry' ? 1400 : 1200,
      seed: seedOf(id),
      target: u(0.7),
      fruitColors: new Set((species.fruit || []).map((color) => color.toLowerCase())),
    });
    const stats = summarizeBlocks(blocks);
    model = { blocks, height: stats.height, radius: stats.radius };
  }
  return { species, ...model };
});

const cellW = Math.max(...models.map((model) => model.radius * 2)) + 1.8;
const cellH = Math.max(...models.map((model) => model.height)) + 2;
const cols = models.length <= 2 ? models.length : 2;
const rows = Math.ceil(models.length / cols);

models.forEach((model, index) => {
  const col = index % cols;
  const row = Math.floor(index / cols);
  model.slotX = (col - (cols - 1) / 2) * cellW;
  model.baseY = (rows - 1 - row) * cellH + 0.9;
});

// 所有模型的方块合并进一个 InstancedMesh，颜色靠实例色区分。
const totalBlocks = models.reduce((sum, model) => sum + model.blocks.length, 0);
const mesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ color: '#ffffff' }),
  totalBlocks
);
const dummy = new THREE.Object3D();
let cursor = 0;
models.forEach((model) => {
  model.blocks.forEach((block) => {
    dummy.position.set(block.x + model.slotX, block.y + model.baseY, block.z);
    if (block.q) dummy.quaternion.copy(block.q);
    else dummy.quaternion.identity();
    dummy.scale.set(block.sx, block.sy, block.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(cursor, dummy.matrix);
    mesh.setColorAt(cursor, block.color);
    cursor += 1;
  });
});
mesh.instanceMatrix.needsUpdate = true;
if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
scene.add(mesh);

// 每株下面的浅色底座，方便看清单株范围。
const plateGeometry = new THREE.BoxGeometry(1, 1, 1);
const plateMaterial = new THREE.MeshLambertMaterial({ color: '#33404b' });
models.forEach((model) => {
  const plate = new THREE.Mesh(plateGeometry, plateMaterial);
  plate.position.set(model.slotX, model.baseY - 0.16, 0);
  plate.scale.set(cellW * 0.82, 0.3, cellW * 0.5);
  scene.add(plate);
});

const labels = models.map((model) => {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = `${model.species.name} · ${model.blocks.length}块`;
  app.appendChild(el);
  return {
    el,
    position: new THREE.Vector3(model.slotX, model.baseY + model.height + 0.7, 0),
  };
});

function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  // 按实际模型包围盒收紧取景，避免植株在画面里太小。
  const minX = Math.min(...models.map((model) => model.slotX - model.radius));
  const maxX = Math.max(...models.map((model) => model.slotX + model.radius));
  const minY = Math.min(...models.map((model) => model.baseY)) - 0.4;
  const maxY = Math.max(...models.map((model) => model.baseY + model.height)) + 1.3;
  const boundsW = Math.max(0.1, maxX - minX);
  const boundsH = Math.max(0.1, maxY - minY);

  let viewH = boundsH * 1.14;
  let viewW = viewH * aspect;
  if (viewW < boundsW * 1.1) {
    viewW = boundsW * 1.1;
    viewH = viewW / aspect;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  camera.left = -viewW / 2;
  camera.right = viewW / 2;
  camera.top = viewH / 2;
  camera.bottom = -viewH / 2;
  camera.position.set(centerX, centerY, 80);
  camera.lookAt(centerX, centerY, 0);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

resize();
window.addEventListener('resize', resize);

const projected = new THREE.Vector3();
function render() {
  labels.forEach(({ el, position }) => {
    projected.copy(position).project(camera);
    el.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
  });
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
