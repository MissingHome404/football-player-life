import { useMemo, useState } from 'react';
import { useGame } from './store';
import { AttrBlock, Badge, Flag, RolePanel, Stars, caStars, money, roleHighlight } from './components';
import { POSITION_ROLES, ROLES } from '../game/data/roles';
import { COUNTRY_BY_ID } from '../game/data/countries';
import {
  GOALKEEPING,
  HIDDEN,
  MENTAL,
  PERSONALITY,
  PHYSICAL,
  POSITIONS,
  POSITION_LABEL,
  TECHNICAL,
  type Position,
} from '../game/data/attributes';
import {
  FAMILY_INFO,
  ORIGIN_INFO,
  PLAYABLE_COUNTRIES,
  injuryHint,
  randomName,
  renameCharacter,
  rollCharacter,
} from '../game/gen/character';
import { personalityLabel, PERSONALITY_INFO } from '../game/gen/personality';
import { fullName } from '../game/gen/names';
import { randomSeed } from '../game/rng';

const foot = (v: number) =>
  v >= 18 ? 'sangat kuat' : v >= 15 ? 'kuat' : v >= 11 ? 'cukup' : v >= 6 ? 'lemah' : 'sangat lemah';

export function CharacterScreen() {
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const startCareer = useGame((s) => s.startCareer);
  const reset = useGame((s) => s.reset);
  const devMode = useGame((s) => s.devMode);
  const toggleDev = useGame((s) => s.toggleDev);

  const [seed, setSeed] = useState(randomSeed);
  const [rolls, setRolls] = useState(1);
  const [countryId, setCountryId] = useState<string>('IDN');
  const [position, setPosition] = useState<Position | ''>('');
  const [role, setRole] = useState('');
  const [viewRole, setViewRole] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<{ first: string; last: string } | null>(null);

  const rolled = useMemo(
    () =>
      rollCharacter(
        world,
        { countryId: countryId || undefined, position: position || undefined, role: role || undefined },
        seed,
      ),
    [world, countryId, position, role, seed],
  );
  const roll = nameOverride ? renameCharacter(rolled, nameOverride.first, nameOverride.last) : rolled;
  const p = roll.player;
  const club = roll.clubId ? idx.clubById.get(roll.clubId) : undefined;
  const label = personalityLabel(p);
  const pinfo = PERSONALITY_INFO[label];
  const isGK = p.mainPosition === 'GK';
  const shownRole = viewRole && POSITION_ROLES[p.mainPosition].includes(viewRole) ? viewRole : p.preferredRole;
  const hl = roleHighlight(shownRole);
  const sortedCountries = [...PLAYABLE_COUNTRIES].sort((a, b) =>
    COUNTRY_BY_ID[a].name.localeCompare(COUNTRY_BY_ID[b].name, 'id'),
  );

  const reroll = () => {
    setSeed(randomSeed());
    setRolls((r) => r + 1);
    setViewRole(null);
  };

  return (
    <div className="start char">
      <header className="char-head">
        <div>
          <h1>Buat pemainmu</h1>
          <p className="muted">
            Negara, posisi, dan nama boleh kamu pilih. Sisanya ditentukan RNG: umur, asal sepak bola, keluarga,
            personality, fisik, dan potensi. Tidak suka hasilnya? Re-roll.
          </p>
        </div>
        <div className="char-head-actions">
          <label className="dev-toggle">
            <input id="dev-toggle" type="checkbox" checked={devMode} onChange={toggleDev} /> Mode developer
          </label>
          <button className="ghost" onClick={reset}>
            Dunia baru
          </button>
        </div>
      </header>

      <div className="char-grid">
        <section className="panel char-choices">
          <h2>Pilihanmu</h2>
          <label className="field">
            <span>Negara</span>
            <select
              id="char-country"
              value={countryId}
              onChange={(e) => {
                setCountryId(e.target.value);
                setNameOverride(null);
              }}
            >
              <option value="">Acak</option>
              {sortedCountries.map((c) => (
                <option key={c} value={c}>
                  {COUNTRY_BY_ID[c].name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Posisi</span>
            <select
              id="char-position"
              value={position}
              onChange={(e) => {
                setPosition(e.target.value as Position | '');
                setRole('');
                setViewRole(null);
              }}
            >
              <option value="">Acak</option>
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos} · {POSITION_LABEL[pos]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Peran</span>
            <select
              id="char-role"
              value={role}
              disabled={!position}
              onChange={(e) => {
                setRole(e.target.value);
                setViewRole(null);
              }}
            >
              <option value="">{position ? 'Acak' : 'Pilih posisi dulu'}</option>
              {position &&
                POSITION_ROLES[position].map((id) => (
                  <option key={id} value={id}>
                    {ROLES[id].name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Nama depan</span>
            <input
              id="char-first"
              value={p.firstName}
              onChange={(e) => setNameOverride({ first: e.target.value, last: p.lastName })}
            />
          </label>
          <label className="field">
            <span>Nama belakang</span>
            <input
              id="char-last"
              value={p.lastName}
              placeholder="(boleh kosong)"
              onChange={(e) => setNameOverride({ first: p.firstName, last: e.target.value })}
            />
          </label>
          <button
            className="link"
            onClick={() => {
              const n = randomName(p.nationalityId, randomSeed());
              setNameOverride({ first: n.firstName, last: n.lastName });
            }}
          >
            Acak nama
          </button>

          <div className="roll-box">
            <button className="roll-btn" onClick={reroll}>
              🎲 Re-roll
            </button>
            <span className="muted small">Roll ke-{rolls}</span>
          </div>
          <button
            className="primary wide"
            disabled={!p.firstName.trim()}
            onClick={() => startCareer(roll, rolls - 1)}
          >
            Mulai karier
          </button>
        </section>

        <div className="char-result" key={seed}>
          <div
            className="club-head"
            style={
              club
                ? { background: `linear-gradient(110deg, ${club.colors[0]} 0%, ${club.colors[0]} 80%, ${club.colors[1]} 80%)` }
                : undefined
            }
          >
            <div className="club-head-inner">
              {club ? <Badge club={club} size={64} /> : <div className="no-club">⚽</div>}
              <div>
                <h1>{fullName(p) || '—'}</h1>
                <div className="small">
                  {roll.age} tahun · <Flag id={p.nationalityId} withName /> · {POSITION_LABEL[p.mainPosition]} (
                  {ROLES[p.preferredRole].name})
                </div>
                <div className="small">Main di: {roll.teamLabel}</div>
              </div>
            </div>
          </div>

          <div className="cards">
            <div className="card">
              <div className="muted small">Asal sepak bola</div>
              <div className="card-v">
                <b>{ORIGIN_INFO[roll.origin].label}</b>
                <div className="muted small">{ORIGIN_INFO[roll.origin].desc}</div>
              </div>
            </div>
            <div className="card">
              <div className="muted small">Latar keluarga</div>
              <div className="card-v">
                <b>{FAMILY_INFO[roll.family.wealth].label}</b>
                <div className="muted small">{FAMILY_INFO[roll.family.wealth].desc}</div>
              </div>
            </div>
            <div className="card">
              <div className="muted small">Personality</div>
              <div className="card-v">
                <b>{label}</b>
                <div className="muted small">
                  + {pinfo.good}
                  <br />− {pinfo.risk}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="muted small">Fisik bawaan</div>
              <div className="card-v">
                {p.heightCm} cm · {p.weightKg} kg
                <div className="muted small">
                  Kaki kiri {foot(p.leftFoot)}, kanan {foot(p.rightFoot)}
                  <br />
                  {injuryHint(p.hidden['Injury Proneness'])}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="muted small">Kemampuan saat ini</div>
              <div className="card-v">
                <Stars value={caStars(p.ca)} />
                {devMode && <div className="muted small">CA {p.ca}</div>}
              </div>
            </div>
            <div className="card">
              <div className="muted small">Potensi (perkiraan scout)</div>
              <div className="card-v">
                <Stars value={caStars(roll.scoutPA[0])} /> <span className="muted">s/d</span>{' '}
                <Stars value={caStars(roll.scoutPA[1])} />
                {devMode && <div className="muted small">PA asli {p.pa}</div>}
              </div>
            </div>
            <div className="card">
              <div className="muted small">Uang awal</div>
              <div className="card-v">
                <b>{money(roll.money)}</b>
              </div>
            </div>
            <div className="card">
              <div className="muted small">Stres</div>
              <div className="card-v">
                <div className="stress">
                  <div
                    className={`stress-fill ${roll.stress >= 70 ? 'hi' : roll.stress >= 40 ? 'mid' : ''}`}
                    style={{ width: `${roll.stress}%` }}
                  />
                </div>
                <span className="muted small">{roll.stress} / 100</span>
              </div>
            </div>
          </div>

          <RolePanel player={p} selected={shownRole} onSelect={setViewRole} />

          <section className="panel attrs">
            <AttrBlock
              title={isGK ? 'Goalkeeping' : 'Technical'}
              keys={isGK ? GOALKEEPING : TECHNICAL}
              values={isGK ? p.goalkeeping : p.technical}
              hl={hl}
            />
            <AttrBlock title="Mental" keys={MENTAL} values={p.mental} hl={hl} />
            <AttrBlock title="Physical" keys={PHYSICAL} values={p.physical} hl={hl} />
          </section>

          {devMode && (
            <section className="panel attrs dev">
              <AttrBlock title="Personality (tersembunyi)" keys={PERSONALITY} values={p.personality} />
              <AttrBlock title="Hidden attributes" keys={HIDDEN} values={p.hidden} />
              <div className="muted small dev-note">Seed karakter: {roll.seed}</div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
