import { useGame } from './ui/store';
import { StartScreen } from './ui/StartScreen';
import { WorldBrowser } from './ui/WorldBrowser';
import { CharacterScreen } from './ui/CharacterScreen';

export default function App() {
  const world = useGame((s) => s.world);
  const career = useGame((s) => s.career);
  if (!world) return <StartScreen />;
  if (!career) return <CharacterScreen />;
  return <WorldBrowser />;
}
