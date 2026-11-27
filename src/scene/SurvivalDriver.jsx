import { useFrame } from '@react-three/fiber';
import { updateSurvival } from '../game/survival';

// 生存数值的每帧驱动：只做数值结算，不干预原有移动 / 场景逻辑
export default function SurvivalDriver() {
  useFrame((_, delta) => {
    updateSurvival(delta);
  });
  return null;
}
