import { ITEMS, itemCategory } from '../game/inventory';

function Box({ size, position, color, ...rest }) {
  return (
    <mesh position={position} {...rest}>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

// 新图鉴物品按分类使用统一的像素小模型
function GenericModel({ type }) {
  const info = ITEMS[type] || { color: '#b98f52', leaf: '#6b432a' };
  const category = itemCategory(type);
  if (category === 'seed') {
    return (
      <group>
        {[[-0.07, 0.06, 0], [0.04, 0.05, 0.05], [0.02, 0.12, -0.04], [-0.05, 0.1, -0.06]].map((position, index) => (
          <Box key={index} size={[0.075, 0.07, 0.075]} position={position} color={index % 2 ? info.leaf : info.color} />
        ))}
      </group>
    );
  }
  if (category === 'sapling') {
    return (
      <group>
        <Box size={[0.05, 0.28, 0.05]} position={[0, 0.14, 0]} color="#6b432a" />
        <Box size={[0.16, 0.07, 0.1]} position={[-0.08, 0.26, 0]} rotation={[0, 0, -0.4]} color={info.color} />
        <Box size={[0.16, 0.07, 0.1]} position={[0.08, 0.28, 0]} rotation={[0, 0, 0.4]} color={info.leaf} />
      </group>
    );
  }
  if (category === 'material') {
    return (
      <group>
        <Box size={[0.34, 0.07, 0.07]} position={[0, 0.2, 0]} rotation={[0, 0, 0.28]} color={info.color} />
        <Box size={[0.12, 0.06, 0.06]} position={[-0.1, 0.26, 0]} rotation={[0, 0, -0.6]} color={info.leaf} />
        <Box size={[0.1, 0.05, 0.05]} position={[0.08, 0.26, 0]} rotation={[0, 0, 0.7]} color={info.leaf} />
      </group>
    );
  }
  return (
    <group>
      <Box size={[0.26, 0.26, 0.26]} position={[0, 0.16, 0]} color={info.color} />
      <Box size={[0.1, 0.1, 0.1]} position={[-0.14, 0.2, 0.02]} color={info.leaf} />
      <Box size={[0.08, 0.12, 0.08]} position={[0, 0.3, 0]} color={info.leaf} />
    </group>
  );
}

export default function ItemModel({ type }) {
  if (type === 'radish' || type === 'cabbage') {
    return (
      <group>
        <Box size={[0.34, 0.22, 0.34]} position={[0, 0.14, 0]} color={ITEMS[type].color} />
        <Box size={[0.24, 0.18, 0.24]} position={[0, 0.29, 0]} color={ITEMS[type].leaf} />
        <Box size={[0.15, 0.1, 0.15]} position={[0, 0.41, 0]} color={type === 'radish' ? '#7fbc4e' : '#eef3c6'} />
      </group>
    );
  }
  if (type === 'radishSeed' || type === 'cabbageSeed') {
    const colors = type === 'radishSeed'
      ? ['#b85132', '#df7a3c', '#75402b', '#c96337', '#e18a4c']
      : ['#ddd68b', '#eff0ae', '#bdc778', '#e7dfa0', '#aeba6b'];
    const spots = [[-0.1, 0.07, 0], [0.02, 0.06, 0.08], [0.11, 0.07, -0.02], [-0.03, 0.08, -0.09], [0.02, 0.15, 0]];
    return (
      <group>
        {spots.map((position, index) => (
          <Box key={index} size={[0.09, 0.08, 0.09]} position={position} color={colors[index]} />
        ))}
      </group>
    );
  }
  if (type === 'wateringCan') {
    return (
      <group>
        <Box size={[0.3, 0.26, 0.25]} position={[0, 0.2, 0]} color="#6f9fb0" />
        <Box size={[0.24, 0.06, 0.21]} position={[0, 0.36, 0]} color="#b9d9d8" />
        <Box size={[0.11, 0.05, 0.11]} position={[0, 0.41, 0]} color="#456f7d" />
        <Box size={[0.26, 0.08, 0.09]} position={[0.24, 0.24, 0]} rotation={[0, 0, 0.42]} color="#6f9fb0" />
        <Box size={[0.09, 0.12, 0.14]} position={[0.37, 0.3, 0]} rotation={[0, 0, 0.42]} color="#b9d9d8" />
        <Box size={[0.07, 0.28, 0.07]} position={[-0.21, 0.24, 0]} color="#456f7d" />
        <Box size={[0.18, 0.07, 0.07]} position={[-0.14, 0.39, 0]} color="#456f7d" />
        <Box size={[0.18, 0.07, 0.07]} position={[-0.14, 0.09, 0]} color="#456f7d" />
      </group>
    );
  }
  if (type === 'stone') {
    return (
      <group>
        <Box size={[0.3, 0.2, 0.26]} position={[0, 0.12, 0]} color="#8d8b93" />
        <Box size={[0.18, 0.14, 0.18]} position={[-0.13, 0.18, 0.03]} rotation={[0, 0.4, 0.1]} color="#a3a1a8" />
        <Box size={[0.14, 0.12, 0.15]} position={[0.12, 0.15, -0.04]} rotation={[0.1, -0.3, 0]} color="#6d6b74" />
      </group>
    );
  }
  return <GenericModel type={type} />;
}
