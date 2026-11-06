import { NAME_POOLS } from '../data/names';
import { COUNTRY_BY_ID } from '../data/countries';
import type { Rng } from '../rng';

// Pool nama sudah dibersihkan dari nama khas pemain asli (lihat data/names.ts), tapi nama umum
// tetap bisa kebetulan sama persis dengan pemain terkenal. Kombinasi itu dihindari supaya tidak
// ada "Sergio Ramos" umur 17 di klub antah berantah.
export const FAMOUS = new Set([
  'Harry Kane', 'Declan Rice', 'Jude Bellingham', 'Cole Palmer', 'Kyle Walker', 'Jordan Henderson',
  'Callum Wilson', 'Ben White', 'Luke Shaw', 'Lewis Hall', 'Erling Haaland', 'Patrick Berg',
  'Marcus Pedersen', 'Kylian Mbappé', 'Antoine Griezmann', 'Lionel Messi', 'Cristiano Ronaldo',
  'Bruno Fernandes', 'Bernardo Silva', 'Rúben Dias', 'Rúben Neves', 'Diogo Costa', 'Pedro Neto',
  'Nuno Mendes', 'Rafael Leão', 'João Neves', 'Danilo Pereira', 'Ricardo Pereira', 'André Silva',
  'Pedro Gonçalves', 'José Sá', 'Rui Silva', 'Matheus Nunes', 'António Silva', 'Vinícius Júnior',
  'Thiago Silva', 'Gabriel Magalhães', 'Bruno Guimarães', 'Matheus Cunha', 'Julián Álvarez',
  'Enzo Fernández', 'Emiliano Martínez', 'Federico Valverde', 'Ronald Araújo', 'Luis Suárez',
  'Luis Díaz', 'Richard Ríos', 'Santiago Arias', 'Cristian Romero', 'Nicolás González',
  'Ángel Correa', 'Joaquín Correa', 'Facundo Torres', 'Camilo Vargas', 'Santiago Giménez',
  'Sergio Ramos', 'Marcos Alonso', 'Íñigo Martínez', 'Fabián Ruiz', 'Pau Torres', 'Borja Iglesias',
  'Rodrigo Hernández', 'Lorenzo Pellegrini', 'Gianluca Mancini', 'Samuele Ricci', 'Thomas Müller',
  'Pascal Groß', 'Julian Brandt', 'Robin Koch', 'Jonas Hofmann', 'Timo Werner', 'Luuk De Jong',
  'Mateo Kovačić', 'Aleksandar Mitrović', 'Filip Kostić', 'Strahinja Pavlović', 'Luka Jović',
  'Ivan Ilić', 'Christian Eriksen', 'Joachim Andersen', 'Andreas Christensen', 'Rasmus Kristensen',
  'Victor Kristiansen', 'Mathias Jensen', 'Oliver Christensen', 'Emil Forsberg', 'Jesper Karlsson',
  'Robin Olsen', 'Hugo Larsson', 'Gustaf Nilsson', 'Jakub Kamiński', 'Ladislav Krejčí', 'David Zima',
  'Václav Černý', 'Matěj Kovář', 'Arda Güler', 'Barış Yılmaz', 'Burak Yılmaz', 'Uğurcan Çakır',
  'Salih Özcan', 'Zeki Çelik', 'İsmail Yüksek', 'Kenan Yıldız', 'Oğuz Aydın', 'Enes Ünal',
  'Cenk Tosun', 'Salem Al-Dawsari', 'Yasser Al-Shahrani', 'Abdulaziz Hatem', 'Sultan Al-Ghannam',
  'Abdullah Al-Hamdan', 'Saleh Al-Shehri', 'Milad Mohammadi', 'Majid Hosseini', 'Ali Karimi',
  'Wataru Endo', 'Junya Ito', 'Hiroki Ito', 'Keito Nakamura', 'Ao Tanaka', 'Kento Hashimoto',
  'Koki Ogawa', 'Yuma Suzuki', 'Takefusa Kubo', 'Heung-min Son', 'Min-jae Kim', 'Kang-in Lee',
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
