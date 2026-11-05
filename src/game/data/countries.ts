import type { Country } from '../types';

// 26 negara dengan liga yang bisa dipilih + negara tambahan yang hanya
// muncul sebagai asal pemain asing.
export const COUNTRIES: Country[] = [
  // UEFA top 15 (koefisien 2026/27)
  { id: 'ENG', name: 'Inggris', confederation: 'UEFA', nameStyle: 'english', footballRep: 95 },
  { id: 'ITA', name: 'Italia', confederation: 'UEFA', nameStyle: 'italian', footballRep: 92 },
  { id: 'ESP', name: 'Spanyol', confederation: 'UEFA', nameStyle: 'spanish', footballRep: 96 },
  { id: 'GER', name: 'Jerman', confederation: 'UEFA', nameStyle: 'german', footballRep: 92 },
  { id: 'FRA', name: 'Prancis', confederation: 'UEFA', nameStyle: 'french', footballRep: 96 },
  { id: 'POR', name: 'Portugal', confederation: 'UEFA', nameStyle: 'portuguese', footballRep: 90 },
  { id: 'NED', name: 'Belanda', confederation: 'UEFA', nameStyle: 'dutch', footballRep: 88 },
  { id: 'BEL', name: 'Belgia', confederation: 'UEFA', nameStyle: 'belgian', footballRep: 86 },
  { id: 'TUR', name: 'Turki', confederation: 'UEFA', nameStyle: 'turkish', footballRep: 76 },
  { id: 'CZE', name: 'Ceko', confederation: 'UEFA', nameStyle: 'czech', footballRep: 70 },
  { id: 'GRE', name: 'Yunani', confederation: 'UEFA', nameStyle: 'greek', footballRep: 68 },
  { id: 'POL', name: 'Polandia', confederation: 'UEFA', nameStyle: 'polish', footballRep: 72 },
  { id: 'DEN', name: 'Denmark', confederation: 'UEFA', nameStyle: 'danish', footballRep: 76 },
  { id: 'NOR', name: 'Norwegia', confederation: 'UEFA', nameStyle: 'norwegian', footballRep: 74 },
  { id: 'CYP', name: 'Siprus', confederation: 'UEFA', nameStyle: 'cypriot', footballRep: 45 },
  // AFC top 10 + Indonesia
  { id: 'KSA', name: 'Arab Saudi', confederation: 'AFC', nameStyle: 'gulf', footballRep: 62 },
  { id: 'JPN', name: 'Jepang', confederation: 'AFC', nameStyle: 'japanese', footballRep: 78 },
  { id: 'KOR', name: 'Korea Selatan', confederation: 'AFC', nameStyle: 'korean', footballRep: 74 },
  { id: 'UAE', name: 'Uni Emirat Arab', confederation: 'AFC', nameStyle: 'gulf', footballRep: 50 },
  { id: 'IRN', name: 'Iran', confederation: 'AFC', nameStyle: 'iranian', footballRep: 66 },
  { id: 'QAT', name: 'Qatar', confederation: 'AFC', nameStyle: 'gulf', footballRep: 55 },
  { id: 'THA', name: 'Thailand', confederation: 'AFC', nameStyle: 'thai', footballRep: 45 },
  { id: 'AUS', name: 'Australia', confederation: 'AFC', nameStyle: 'australian', footballRep: 66 },
  { id: 'UZB', name: 'Uzbekistan', confederation: 'AFC', nameStyle: 'uzbek', footballRep: 55 },
  { id: 'MAS', name: 'Malaysia', confederation: 'AFC', nameStyle: 'malay', footballRep: 36 },
  { id: 'IDN', name: 'Indonesia', confederation: 'AFC', nameStyle: 'indonesian', footballRep: 42 },
  // Negara asal pemain asing (tanpa liga di game)
  { id: 'BRA', name: 'Brasil', confederation: 'CONMEBOL', nameStyle: 'brazilian', footballRep: 95 },
  { id: 'ARG', name: 'Argentina', confederation: 'CONMEBOL', nameStyle: 'latam', footballRep: 96 },
  { id: 'URU', name: 'Uruguay', confederation: 'CONMEBOL', nameStyle: 'latam', footballRep: 82 },
  { id: 'COL', name: 'Kolombia', confederation: 'CONMEBOL', nameStyle: 'latam', footballRep: 80 },
  { id: 'NGA', name: 'Nigeria', confederation: 'CAF', nameStyle: 'westafrican', footballRep: 72 },
  { id: 'GHA', name: 'Ghana', confederation: 'CAF', nameStyle: 'westafrican', footballRep: 68 },
  { id: 'SEN', name: 'Senegal', confederation: 'CAF', nameStyle: 'francoafrican', footballRep: 78 },
  { id: 'CIV', name: 'Pantai Gading', confederation: 'CAF', nameStyle: 'francoafrican', footballRep: 74 },
  { id: 'CMR', name: 'Kamerun', confederation: 'CAF', nameStyle: 'francoafrican', footballRep: 68 },
  { id: 'MAR', name: 'Maroko', confederation: 'CAF', nameStyle: 'maghreb', footballRep: 82 },
  { id: 'ALG', name: 'Aljazair', confederation: 'CAF', nameStyle: 'maghreb', footballRep: 66 },
  { id: 'CRO', name: 'Kroasia', confederation: 'UEFA', nameStyle: 'balkan', footballRep: 84 },
  { id: 'SRB', name: 'Serbia', confederation: 'UEFA', nameStyle: 'balkan', footballRep: 74 },
  { id: 'SWE', name: 'Swedia', confederation: 'UEFA', nameStyle: 'swedish', footballRep: 72 },
  { id: 'SUI', name: 'Swiss', confederation: 'UEFA', nameStyle: 'german', footballRep: 78 },
  { id: 'AUT', name: 'Austria', confederation: 'UEFA', nameStyle: 'german', footballRep: 76 },
  { id: 'SCO', name: 'Skotlandia', confederation: 'UEFA', nameStyle: 'english', footballRep: 66 },
  { id: 'USA', name: 'Amerika Serikat', confederation: 'CONCACAF', nameStyle: 'american', footballRep: 70 },
];

export const COUNTRY_BY_ID: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.id, c]),
);

// Kode bendera emoji dari kode negara (untuk tampilan)
const FLAG: Record<string, string> = {
  ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ITA: '🇮🇹', ESP: '🇪🇸', GER: '🇩🇪', FRA: '🇫🇷', POR: '🇵🇹', NED: '🇳🇱',
  BEL: '🇧🇪', TUR: '🇹🇷', CZE: '🇨🇿', GRE: '🇬🇷', POL: '🇵🇱', DEN: '🇩🇰', NOR: '🇳🇴',
  CYP: '🇨🇾', KSA: '🇸🇦', JPN: '🇯🇵', KOR: '🇰🇷', UAE: '🇦🇪', IRN: '🇮🇷', QAT: '🇶🇦',
  THA: '🇹🇭', AUS: '🇦🇺', UZB: '🇺🇿', MAS: '🇲🇾', IDN: '🇮🇩', BRA: '🇧🇷', ARG: '🇦🇷',
  URU: '🇺🇾', COL: '🇨🇴', NGA: '🇳🇬', GHA: '🇬🇭', SEN: '🇸🇳', CIV: '🇨🇮', CMR: '🇨🇲',
  MAR: '🇲🇦', ALG: '🇩🇿', CRO: '🇭🇷', SRB: '🇷🇸', SWE: '🇸🇪', SUI: '🇨🇭', AUT: '🇦🇹',
  SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', USA: '🇺🇸',
};
export const flagOf = (countryId: string) => FLAG[countryId] ?? '🏳️';
