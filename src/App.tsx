import { useGame } from './ui/store';
import { StartScreen } from './ui/StartScreen';
import { WorldBrowser } from './ui/WorldBrowser';
import { CharacterScreen } from './ui/CharacterScreen';
import { GlobalLayer } from './ui/SavePanel';

export default function App() {
  const world = useGame((s) => s.world);
  const career = useGame((s) => s.career);
  const screen = !world ? <StartScreen /> : !career ? <CharacterScreen /> : <WorldBrowser />;
  return (
    <>
      {screen}
      <GlobalLayer />
    </>
  );
}
