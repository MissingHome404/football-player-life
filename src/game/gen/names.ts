import { NAME_POOLS } from '../data/names';
import { COUNTRY_BY_ID } from '../data/countries';
import type { Rng } from '../rng';

// Kombinasi yang sama persis dengan pemain bintang asli dihindari,
// supaya tidak ada "Erling Haaland" umur 17 di klub antah berantah.
const FAMOUS = new Set([
  'Harry Kane', 'Declan Rice', 'Bukayo Saka', 'Jude Bellingham', 'Phil Foden', 'Cole Palmer',
  'Trent Alexander-Arnold', 'Erling Haaland', 'Martin Ødegaard', 'Alexander Sørloth',
  'Kylian Mbappé', 'Antoine Griezmann', 'Olivier Giroud', 'Ousmane Dembélé', 'Lionel Messi',
  'Cristiano Ronaldo', 'Bruno Fernandes', 'Bernardo Silva', 'Rúben Dias', 'Kevin De_Bruyne',
  'Kevin De Bruyne', 'Romelu Lukaku', 'Thibaut Courtois', 'Virgil Van Dijk', 'Frenkie De Jong',
  'Luka Modrić', 'Heung-min Son', 'Kang-in Lee', 'Min-jae Kim', 'Takefusa Kubo', 'Kaoru Mitoma',
  'Vinícius Júnior', 'Lautaro Martínez', 'Julián Álvarez', 'Robert Lewandowski',
  'Christian Eriksen', 'Kasper Schmeichel', 'Thomas Müller', 'Manuel Neuer', 'Joshua Kimmich',
  'Mohamed Salah', 'Achraf Hakimi', 'Sadio Mané', 'Victor Osimhen', 'Riyad Mahrez',
  'Arda Güler', 'Hakan Çalhanoğlu', 'Salem Al-Dawsari', 'Mehdi Taremi', 'Sardar Azmoun',
  'Alexander Isak', 'Dušan Vlahović', 'Khvicha Kvaratskhelia', 'Nicolò Barella',
  'Gianluigi Donnarumma', 'Pedri González', 'Rodrigo Hernández', 'Lamine Yamal',
]);

export function generateName(
  rng: Rng,
  countryId: string,
): { firstName: string; lastName: string } {
  const style = COUNTRY_BY_ID[countryId]?.nameStyle ?? 'english';
  const pool = NAME_POOLS[style] ?? NAME_POOLS.english;
  for (let tries = 0; tries < 10; tries++) {
    const first = rng.pick(pool.first);
    if (pool.mono && rng.chance(pool.mono)) {
      return { firstName: first, lastName: '' };
    }
    let last = rng.pick(pool.last);
    // Hindari nama depan = nama belakang (mis. "Ridho Ridho")
    if (last === first) last = rng.pick(pool.last);
    if (FAMOUS.has(`${first} ${last}`)) continue;
    return { firstName: first, lastName: last };
  }
  return { firstName: rng.pick(pool.first), lastName: rng.pick(pool.last) };
}

export const fullName = (p: { firstName: string; lastName: string }) =>
  p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName;

/** Nama pendek ala FM: "H. Kane" atau nama tunggal */
export const shortName = (p: { firstName: string; lastName: string }) =>
  p.lastName ? `${p.firstName[0]}. ${p.lastName}` : p.firstName;
