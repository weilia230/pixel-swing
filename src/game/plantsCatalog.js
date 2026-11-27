// 新增可采集植物的图鉴数据：造型分组、配色、生长时长与产出命名。
// 故意保持为纯数据，供地形、背包、渲染与采集逻辑共同引用。
export const PLANT_STAGE_NAMES = ['幼苗期', '茁壮期', '结果期', '成熟期'];

// 每个阶段的基准秒数：果树 +8 分钟、野生 +5 分钟、农作物/浆果 +4 分钟
export const STAGE_SECONDS = {
  fruitTree: 300 + 480,
  wild: 300 + 300,
  crop: 300 + 240,
  berry: 240 + 240,
};

// family 决定基础造型，form 用于同族里的特殊外观
export const SPECIES = [
  // 果树类
  {
    id: 'persimmon', name: '柿子', family: 'tree', category: 'fruitTree', produceName: '柿子',
    leaf: ['#4b6b2f', '#5f7d38', '#3f5c28'], trunk: '#6b3b2a', fruit: ['#e2662f', '#ef8b3c'],
    scale: 1.55, zones: ['hill', 'forest'],
  },
  {
    id: 'apple', name: '苹果', family: 'tree', category: 'fruitTree', produceName: '苹果',
    leaf: ['#51733a', '#668946', '#456530'], trunk: '#6a4128', fruit: ['#cc3b3b', '#e05a45'],
    scale: 1.35, zones: ['hill', 'forest'],
  },
  {
    id: 'peach', name: '桃子', family: 'tree', category: 'fruitTree', produceName: '桃子',
    leaf: ['#5d7f3e', '#725f3f', '#4f6f34'], trunk: '#71452c', fruit: ['#ef98a0', '#f7b6b9'],
    scale: 1.25, zones: ['hill', 'forest'],
  },
  {
    id: 'osmanthus', name: '桂花', family: 'tree', category: 'fruitTree', produceName: '桂花',
    leaf: ['#3d5c2c', '#4f7536', '#355024'], trunk: '#5f3b28', fruit: ['#f2cf5b', '#f7e08c'],
    scale: 1.2, zones: ['hill', 'forest'], form: 'osmanthus',
  },
  {
    id: 'parasol', name: '梧桐', family: 'tree', category: 'fruitTree', produceName: '梧桐籽',
    leaf: ['#6c8a45', '#839d54', '#5b7738'], trunk: '#7a5334', fruit: ['#a9814a', '#c39a5d'],
    scale: 1.6, zones: ['hill', 'forest'], form: 'parasol',
  },
  {
    id: 'pine', name: '松树', family: 'tree', category: 'fruitTree', produceName: '松果',
    leaf: ['#33502f', '#41633a', '#284226'], trunk: '#5c3a26', fruit: ['#8a5a32', '#a06c3e'],
    scale: 1.5, zones: ['hill', 'forest'], form: 'pine',
  },
  // 野生植物
  {
    id: 'wildVeg', name: '野菜', family: 'wild', category: 'wild', produceName: '野菜',
    leaf: ['#2f5527', '#3f6b31', '#25451f'], accent: '#6f8f46', fruit: ['#3f6b31'],
    scale: 0.9, zones: ['forest', 'hill'],
  },
  {
    id: 'scallion', name: '野葱', family: 'wild', category: 'wild', produceName: '野葱',
    leaf: ['#4e7d35', '#6a9a45', '#3d6529'], accent: '#e8e6c8', fruit: ['#eeeeee'],
    scale: 0.9, zones: ['forest', 'hill'], form: 'scallion',
  },
  {
    id: 'burdock', name: '牛蒡', family: 'wild', category: 'wild', produceName: '牛蒡',
    leaf: ['#4c7137', '#628a44', '#3b5a2b'], accent: '#8a6a4a', fruit: ['#7b5a3c'],
    scale: 1.0, zones: ['forest', 'hill'], form: 'burdock',
  },
  {
    id: 'wildCarrot', name: '野胡萝卜', family: 'wild', category: 'wild', produceName: '野胡萝卜',
    leaf: ['#5f8a3d', '#7aa650', '#4a6f31'], accent: '#c84a3c', fruit: ['#c84a3c'],
    scale: 0.85, zones: ['forest', 'hill'], form: 'wildCarrot',
  },
  {
    id: 'mushroom', name: '裸盖蘑菇', family: 'mushroom', category: 'wild', produceName: '蘑菇',
    leaf: ['#6b4a32', '#7d5a3c'], accent: '#e6e2d8', fruit: ['#e6e2d8'], cap: '#d9d4c6',
    scale: 0.8, zones: ['forest'], mushroom: true,
  },
  // 农作物
  {
    id: 'carrot', name: '胡萝卜', family: 'crop', category: 'crop', produceName: '胡萝卜',
    leaf: ['#5f9b3a', '#7fbc4e', '#4d7f2f'], accent: '#e08a35', fruit: ['#e08a35', '#f0a04a'],
    scale: 0.9, zones: ['farm'],
  },
  {
    id: 'potato', name: '土豆', family: 'crop', category: 'crop', produceName: '土豆',
    leaf: ['#4f7f39', '#628f45', '#3f692e'], accent: '#c9a86a', fruit: ['#b98f52', '#caa46a'],
    scale: 0.85, zones: ['farm'], form: 'potato',
  },
  {
    id: 'pumpkin', name: '南瓜', family: 'crop', category: 'crop', produceName: '南瓜',
    leaf: ['#4d7a32', '#689345', '#3c6328'], accent: '#e9a33c', fruit: ['#e2812c', '#ef9d3f'],
    scale: 1.0, zones: ['farm'], form: 'pumpkin',
  },
  {
    id: 'greenBean', name: '青豆', family: 'crop', category: 'crop', produceName: '青豆',
    leaf: ['#4f7f39', '#6b9c4a', '#3f692e'], accent: '#8fc25a', fruit: ['#7fb24a', '#a3cc62'],
    scale: 1.0, zones: ['farm'], form: 'bean',
  },
  {
    id: 'purpleCabbage', name: '紫甘蓝', family: 'crop', category: 'crop', produceName: '紫甘蓝',
    leaf: ['#6c4b7a', '#7d5a8c', '#584060'], accent: '#c9a3d6', fruit: ['#8a5a99', '#b989c4'],
    scale: 0.9, zones: ['farm'], form: 'cabbage',
  },
  // 浆果类
  {
    id: 'raspberry', name: '覆盆子', family: 'berry', category: 'berry', produceName: '覆盆子',
    leaf: ['#3f6b31', '#5a8a3f', '#2f5527'], accent: '#8a4a3f', fruit: ['#c22f45', '#e05064'],
    scale: 1.0, zones: ['forest', 'hill'],
  },
  {
    id: 'currant', name: '醋栗', family: 'berry', category: 'berry', produceName: '醋栗',
    leaf: ['#446f33', '#5f8a42', '#355c29'], accent: '#7a4a3f', fruit: ['#c94b3f', '#e07a5f'],
    scale: 0.95, zones: ['forest', 'hill'],
  },
  {
    id: 'blueberry', name: '蓝莓', family: 'berry', category: 'berry', produceName: '蓝莓',
    leaf: ['#3d6532', '#527d3f', '#2f5127'], accent: '#5c4a3a', fruit: ['#4a5c96', '#6478b4'],
    scale: 0.9, zones: ['forest', 'hill'],
  },
  {
    id: 'banana', name: '香蕉', family: 'berry', category: 'berry', produceName: '香蕉',
    leaf: ['#4d7f35', '#6b9c45', '#3c6528'], accent: '#c9a84a', fruit: ['#e8d06a', '#f2df8c'],
    scale: 1.35, zones: ['hill'], form: 'banana',
  },
  {
    id: 'cactus', name: '仙人掌', family: 'berry', category: 'berry', produceName: '仙人掌果',
    leaf: ['#4f7a45', '#628f55', '#3f6338'], accent: '#d6c48a', fruit: ['#d2577a', '#e8809b'],
    scale: 1.0, zones: ['hill'], form: 'cactus',
  },
  {
    id: 'mango', name: '芒果', family: 'berry', category: 'berry', produceName: '芒果',
    leaf: ['#4a6f34', '#5f8a42', '#3a5a29'], trunk: '#7a5334', accent: '#7a5334', fruit: ['#e0a53c', '#efc35f'],
    scale: 1.2, zones: ['hill', 'forest'], form: 'mangoTree',
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((item) => [item.id, item]));

export function seedId(species) {
  return `${species.id}Seed`;
}

export function saplingId(species) {
  return `${species.id}Sapling`;
}

export function fruitId(species) {
  return `${species.id}Fruit`;
}

// 每阶段产出的物品：幼苗/茁壮给幼苗+树枝，结果给种子，成熟给果实
export function productsForStage(species, stage) {
  if (species.mushroom) return ['mushroom'];
  if (stage <= 1) return [saplingId(species), 'branch'];
  if (stage === 2) return [seedId(species)];
  return [fruitId(species)];
}
