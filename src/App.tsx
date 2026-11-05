import { useGame } from './ui/store';
import { StartScreen } from './ui/StartScreen';
import { WorldBrowser } from './ui/WorldBrowser';

export default function App() {
  const world = useGame((s) => s.world);
  return world ? <WorldBrowser /> : <StartScreen />;
}
