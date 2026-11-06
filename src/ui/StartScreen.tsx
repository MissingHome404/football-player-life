import { useState } from 'react';
import { LEAGUES } from '../game/data/leagues';
import { COUNTRY_BY_ID } from '../game/data/countries';
import { randomSeed } from '../game/rng';
import { useGame } from './store';
import { Flag } from './components';
import { SavePanel } from './SavePanel';
import { HallOfFame } from './RetirementView';

export function StartScreen() {
  const generate = useGame((s) => s.generate);
  const generating = useGame((s) => s.generating);
  const [seed, setSeed] = useState(randomSeed);
  const [active, setActive] = useState<Set<string>>(() => new Set(LEAGUES.map((l) => l.id)));

  const toggle = (id: string) => {
    const next = new Set(active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setActive(next);
  };

  const europe = LEAGUES.filter((l) => COUNTRY_BY_ID[l.countryId].confederation === 'UEFA');
  const asia = LEAGUES.filter((l) => COUNTRY_BY_ID[l.countryId].confederation === 'AFC');
  const clubCount = LEAGUES.filter((l) => active.has(l.id)).reduce((s, l) => s + l.clubs.length, 0);

  const group = (title: string, list: typeof LEAGUES) => (
    <div className="league-group">
      <div className="group-head">
        <h3>{title}</h3>
        <button className="link" onClick={() => setActive(new Set([...active, ...list.map((l) => l.id)]))}>
          Pilih semua
        </button>
        <button
          className="link"
          onClick={() => setActive(new Set([...active].filter((id) => !list.some((l) => l.id === id))))}
        >
          Kosongkan
        </button>
      </div>
      <div className="league-pick">
        {list.map((l) => (
          <label key={l.id} className={active.has(l.id) ? 'on' : ''}>
            <input type="checkbox" checked={active.has(l.id)} onChange={() => toggle(l.id)} />
            <Flag id={l.countryId} /> <span className="lname">{COUNTRY_BY_ID[l.countryId].name}</span>
            <small>{l.name}</small>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="start">
      <header className="start-head">
        <div className="logo">⚽</div>
        <div>
          <h1>Football Player Life</h1>
          <p className="muted">Karier pemain sepak bola, dari umur belasan sampai pensiun</p>
        </div>
      </header>

      <SavePanel />
      <HallOfFame />

      <h2 className="section-title">Karier baru</h2>
      <section className="panel">
        <h2>Liga yang aktif</h2>
        <p className="muted">
          Liga aktif disimulasikan penuh. Liga yang tidak dipilih tetap ada dalam versi ringan, supaya klubnya
          masih bisa mengirim tawaran.
        </p>
        {group('Eropa (UEFA)', europe)}
        {group('Asia (AFC)', asia)}
      </section>

      <section className="panel seed-row">
        <div>
          <h2>Seed dunia</h2>
          <p className="muted">Seed yang sama selalu menghasilkan dunia yang sama persis.</p>
        </div>
        <div className="seed-input">
          <input value={seed} onChange={(e) => setSeed(e.target.value.toUpperCase())} maxLength={16} />
          <button onClick={() => setSeed(randomSeed())} title="Acak seed baru">
            🎲
          </button>
        </div>
      </section>

      <div className="start-actions">
        <span className="muted">
          {active.size} liga aktif · {LEAGUES.length} liga total · {clubCount} klub aktif
        </span>
        <button
          className="primary"
          disabled={generating || !seed}
          onClick={() => generate({ seed, activeLeagues: [...active] })}
        >
          {generating ? 'Membuat dunia…' : 'Buat dunia'}
        </button>
      </div>
    </div>
  );
}
