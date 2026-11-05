// Relasi pemain kita: manajer, rekan setim (sahabat, mentor, rival), fans per klub,
// media, dan pasangan. Nilainya -100 sampai 100, diubah lewat performa, kebiasaan,
// dan pilihan di inbox. Manajer bisa dipecat, jadi relasi harus dibangun ulang.

import type { Career, Club, MatchRecord, MateTag, Player, Relations, Staff, World } from '../types';
import type { EventCtx, EventDef } from './events';
import { Rng, clamp } from '../rng';
import { addDays } from '../date';
import { ageOn } from '../gen/player';
import { fullName, generateName } from '../gen/names';
import { COUNTRY_BY_ID } from '../data/countries';
import { econOf } from './economy';
import { groupOf, recentForm } from './match';
import { squadOf, standings } from './season';
import { makeOffer, roleAt, transferWindow } from './transfer';

export const relLabel = (v: number) =>
  v >= 60 ? 'Sangat baik' : v >= 20 ? 'Baik' : v > -20 ? 'Biasa' : v > -60 ? 'Buruk' : 'Sangat buruk';

const bound = (v: number) => clamp(Math.round(v * 10) / 10, -100, 100);

export function emptyRelations(): Relations {
  return { manager: null, fans: {}, media: 0, partner: null, mates: [] };
}

// --- pengubah kecil (dipakai event, transfer, dan simulasi mingguan) ---------------

export function addManager(career: Career, d: number) {
  if (career.rel.manager) career.rel.manager.value = bound(career.rel.manager.value + d);
}
export function addFans(career: Career, clubId: string | undefined, d: number) {
  if (clubId) career.rel.fans[clubId] = bound((career.rel.fans[clubId] ?? 0) + d);
}
export function addMedia(career: Career, d: number) {
  career.rel.media = bound(career.rel.media + d);
}
export function addPartner(career: Career, d: number) {
  if (career.rel.partner) career.rel.partner.value = bound(career.rel.partner.value + d);
}
export function addMate(career: Career, tag: MateTag, d: number) {
  for (const m of career.rel.mates) if (m.tag === tag && m.clubId === career.rel.clubId) m.value = bound(m.value + d);
}
export const mateAtClub = (career: Career, tag: MateTag) =>
  career.rel.mates.find((m) => m.tag === tag && m.clubId === career.rel.clubId);

export function setMate(career: Career, q: Player, tag: MateTag, value: number) {
  career.rel.mates = career.rel.mates.filter((m) => m.playerId !== q.id && !(m.tag === tag && tag !== 'sahabat'));
  career.rel.mates.push({ playerId: q.id, name: fullName(q), tag, value, clubId: q.contract?.clubId });
  // simpan paling banyak 6 orang, yang terbaru di belakang
  if (career.rel.mates.length > 6) career.rel.mates = career.rel.mates.slice(-6);
}

/** Minta dijual: manajer dan fans tidak senang */
export function applyWish(prev: Career, patch: Partial<Pick<Career, 'listed' | 'wantsLoan'>>, clubId?: string): Career {
  const career: Career = { ...prev, ...patch, rel: structuredClone(prev.rel) };
  if (patch.listed && !prev.listed) {
    addManager(career, -8);
    addFans(career, clubId, -8);
  }
  return career;
}

// --- pindah klub: manajer baru, rekan setim baru ---------------------------------

function pickMates(world: World, career: Career, p: Player, club: Club, rng: Rng) {
  const date = career.currentDate;
  const age = ageOn(p.birthDate, date);
  const g = groupOf(p.mainPosition);
  const squad = squadOf(world, club.id).filter((q) => !q.isUser);
  const same = squad.filter((q) => q.isYouth === p.isYouth);
  const used = new Set(career.rel.mates.map((m) => m.playerId));

  const friends = same.filter((q) => !used.has(q.id) && Math.abs(ageOn(q.birthDate, date) - age) <= 3);
  if (friends.length) {
    const f = rng.weighted(friends.map((q) => [q, q.nationalityId === p.nationalityId ? 3 : 1] as const));
    setMate(career, f, 'sahabat', rng.int(25, 45));
    used.add(f.id);
  }
  const mentors = squad
    .filter((q) => !q.isYouth && !used.has(q.id) && ageOn(q.birthDate, date) >= 27 && q.personality.Professionalism >= 13)
    .sort((a, b) => (groupOf(b.mainPosition) === g ? 4 : 0) + b.personality.Professionalism - ((groupOf(a.mainPosition) === g ? 4 : 0) + a.personality.Professionalism));
  if (mentors.length && rng.chance(0.6)) {
    setMate(career, mentors[0], 'mentor', rng.int(15, 30));
    used.add(mentors[0].id);
  }
  const rivals = same
    .filter((q) => !used.has(q.id) && groupOf(q.mainPosition) === g)
    .sort((a, b) => Math.abs(a.ca - p.ca) - Math.abs(b.ca - p.ca));
  if (rivals.length) setMate(career, rivals[0], 'rival', rng.int(-25, -5));
}

/**
 * Samakan relasi dengan klub sekarang: manajer baru dan rekan setim baru kalau
 * pemain pindah klub (sahabat lama tetap diingat).
 */
export function syncClub(world: World, career: Career, p: Player, rng: Rng) {
  const clubId = p.contract?.clubId;
  if (career.rel.clubId === clubId) return;
  career.rel.clubId = clubId;
  career.rel.mates = career.rel.mates.filter((m) => m.tag === 'sahabat');
  const club = clubId ? world.clubs.find((c) => c.id === clubId) : undefined;
  if (!club) {
    career.rel.manager = null;
    return;
  }
  career.rel.manager = { staffId: club.managerId, value: 5, since: career.currentDate };
  if (career.rel.fans[club.id] === undefined) career.rel.fans[club.id] = 0;
  pickMates(world, career, p, club, rng);
}

/** Relasi awal untuk karier baru atau save lama */
export function initRelations(world: World, career: Career, p: Player): Relations {
  const c: Career = { ...career, rel: emptyRelations() };
  syncClub(world, c, p, new Rng(`${career.characterSeed}:rel`));
  return c.rel;
}

// --- manajer dipecat -----------------------------------------------------------

const STYLES: Staff['preferredStyle'][] = ['Possession', 'Gegenpress', 'Counter', 'Direct', 'Wing Play', 'Defensive'];

function sackManager(world: World, career: Career, club: Club, rng: Rng): World {
  const old = world.staff.find((s) => s.id === club.managerId);
  const country = rng.chance(0.6) ? club.countryId : rng.pick(['ENG', 'ESP', 'ITA', 'POR', 'GER', 'NED', 'FRA', 'ARG', 'BRA']);
  const name = generateName(rng, COUNTRY_BY_ID[country] ? country : club.countryId);
  const year = Number(career.currentDate.slice(0, 4));
  const fresh: Staff = {
    id: `S${world.staff.length + 1}-${career.week}`,
    ...name,
    nationalityId: COUNTRY_BY_ID[country] ? country : club.countryId,
    birthDate: `${year - rng.int(38, 62)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
    role: 'Manager',
    clubId: club.id,
    reputation: clamp(Math.round(club.reputation * 0.8 + rng.normal(0, 8)), 1, 100),
    manManagement: rng.int(6, 18),
    workingWithYoungsters: rng.int(5, 18),
    tacticalKnowledge: rng.int(7, 18),
    preferredStyle: rng.pick(STYLES),
  };
  career.rel.manager = { staffId: fresh.id, value: 0, since: career.currentDate };
  career.inbox.unshift({
    id: `w${career.week}-sacked`,
    date: career.currentDate,
    from: club.name,
    title: 'Manajer dipecat',
    body: `${old ? fullName(old) : 'Manajer'} dipecat setelah hasil buruk. ${fullName(fresh)} ditunjuk sebagai manajer baru. Semua pemain harus membuktikan diri lagi, termasuk kamu.`,
  });
  return {
    ...world,
    staff: [...world.staff.map((s) => (s.id === club.managerId ? { ...s, clubId: null } : s)), fresh],
    clubs: world.clubs.map((c) => (c.id === club.id ? { ...c, managerId: fresh.id } : c)),
  };
}

// --- simulasi mingguan ----------------------------------------------------------

/**
 * Relasi minggu ini (setelah pertandingan dan urusan kontrak). Mengubah `career`
 * langsung; mengembalikan dunia baru kalau manajer klub diganti.
 */
export function relationsWeek(world: World, career: Career, p: Player, match: MatchRecord | null, rng: Rng): World {
  syncClub(world, career, p, rng);
  const rel = career.rel;
  const club = rel.clubId ? world.clubs.find((c) => c.id === rel.clubId) : undefined;
  const plan = career.plan;

  // Manajer: perlahan menuju penilaiannya soal performa dan sikapmu
  if (rel.manager && club) {
    const form = recentForm(career, 5) ?? 6.6;
    const target = clamp(
      (form - 6.6) * 40 +
        (p.personality.Professionalism - 10) * 3 +
        (plan.focus === 'istirahat' ? -5 : plan.intensity === 'berat' ? 10 : plan.intensity === 'ringan' ? -10 : 0),
      -60,
      80,
    );
    rel.manager.value = bound(rel.manager.value + (target - rel.manager.value) * 0.05);

    // Hasil buruk: manajer bisa dipecat (setelah setidaknya 20 minggu)
    const season = world.seasons[club.leagueId];
    const settled = rel.manager.since <= addDays(career.currentDate, -140);
    if (season && settled) {
      const table = standings(season);
      const played = table[0]?.p ?? 0;
      const pos = table.findIndex((r) => r.clubId === club.id);
      const bottom = table.length - pos; // 1 = juru kunci
      if (played >= season.rounds.length / 3 && bottom <= 3 && rng.chance(bottom === 1 ? 0.07 : 0.04)) {
        world = sackManager(world, career, club, rng);
      }
    }
  }

  // Fans klub: gol, assist, dan rating
  if (match && club && match.comp === 'Liga' && match.minutes > 0) {
    const d = match.goals * 1.5 + match.assists * 0.8 + (match.rating! - 6.6) * 2 + (match.motm ? 1.5 : 0);
    addFans(career, club.id, clamp(d, -4, 6));
  }
  // Bertemu bekas klub: disambut atau dicemooh
  if (match?.opponentId && match.comp === 'Liga' && rel.fans[match.opponentId] !== undefined && match.opponentId !== club?.id) {
    const v = rel.fans[match.opponentId];
    const name = world.clubs.find((c) => c.id === match.opponentId)?.name ?? match.opponent;
    if (v >= 20 || v <= -20) {
      career.stress = clamp(career.stress + (v >= 20 ? -3 : 4), 0, 100);
      career.inbox.unshift({
        id: `w${career.week}-oldclub`,
        date: career.currentDate,
        from: `Fans ${name}`,
        title: v >= 20 ? `Disambut hangat fans ${name}` : `Dicemooh fans ${name}`,
        body:
          v >= 20
            ? `Fans ${name} berdiri dan bertepuk tangan saat namamu disebut. Mereka belum lupa jasamu.`
            : `Setiap kali kamu menyentuh bola, fans ${name} bersiul dan mencemooh. Mereka belum memaafkan caramu pergi.`,
      });
    }
  }

  // Rekan setim: yang pensiun dihapus, sahabat yang pindah klub mengabari
  const byId = new Map<string, Player>();
  for (const m of rel.mates) {
    const q = world.players.find((x) => x.id === m.playerId);
    if (q) byId.set(m.playerId, q);
  }
  rel.mates = rel.mates.filter((m) => byId.has(m.playerId));
  for (const m of rel.mates) {
    const q = byId.get(m.playerId)!;
    const now = q.contract?.clubId;
    if (now !== m.clubId) {
      const wasHere = m.clubId === rel.clubId;
      m.clubId = now;
      if (m.tag === 'sahabat' && wasHere && now && m.value >= 25) {
        const to = world.clubs.find((c) => c.id === now)!;
        const ctx = { career, player: p, club, world, rng } as EventCtx;
        career.inbox.unshift({
          id: `w${career.week}-friend_moved-${q.id}`,
          date: career.currentDate,
          ...FRIEND_MOVED.create(ctx),
          title: `${m.name} pindah ke ${to.name}`,
          body: `Sahabatmu ${m.name} resmi pindah ke ${to.name}. Dia mengirim pesan: "Di sini butuh pemain sepertimu. Mau aku bilang ke pelatih?"`,
          data: { clubId: to.id, mateId: q.id },
        });
      }
    }
    if (m.clubId === rel.clubId) {
      if (m.tag === 'sahabat') m.value = bound(m.value + (m.value < 60 ? 0.5 : 0));
      if (m.tag === 'mentor' && m.value >= 0) {
        // mentor yang baik menularkan kebiasaan dan cara berpikir
        for (const a of ['Decisions', 'Composure', 'Teamwork']) career.progress[a] = (career.progress[a] ?? 0) + 0.02;
        if (q.personality.Professionalism > p.personality.Professionalism && rng.chance(0.01)) p.personality.Professionalism++;
      }
    }
  }

  // Pasangan: butuh waktu dan perhatian
  const partner = rel.partner;
  if (partner) {
    const act = { keluarga: 2.5, nongkrong: 1, rumah: 1, pesta: -2, video: 0, kerja: -1 }[plan.activity];
    partner.value = bound(partner.value + act - 1.5 - (career.stress > 75 ? 1 : 0) + (partner.stage === 'menikah' ? 0.5 : 0));
    if (partner.value <= -40) {
      career.stress = clamp(career.stress + 12, 0, 100);
      career.inbox.unshift({
        id: `w${career.week}-breakup`,
        date: career.currentDate,
        from: partner.name,
        title: partner.stage === 'menikah' ? 'Pernikahanmu berakhir' : 'Hubunganmu berakhir',
        body: `${partner.name} merasa kamu tidak pernah punya waktu untuknya dan memutuskan untuk berpisah.`,
      });
      rel.partner = null;
    } else if (partner.stage === 'tunangan' && partner.stageSince <= addDays(career.currentDate, -280)) {
      const cost = Math.round(3000 * econOf(p.nationalityId) + Math.max(0, career.money) * 0.05);
      career.money -= cost;
      partner.stage = 'menikah';
      partner.stageSince = career.currentDate;
      partner.value = bound(partner.value + 20);
      career.inbox.unshift({
        id: `w${career.week}-wedding`,
        date: career.currentDate,
        from: 'Keluarga',
        title: `Kamu menikah dengan ${partner.name}!`,
        body: `Pesta pernikahan sederhana bersama keluarga dan rekan setim. Biaya €${cost.toLocaleString('id-ID')}.`,
      });
    }
  }

  // Media cepat lupa, fans perlahan menilai dari performa terbaru
  rel.media = bound(rel.media * 0.98);
  if (club && rel.fans[club.id] !== undefined) rel.fans[club.id] = bound(rel.fans[club.id] * 0.995);
  return world;
}

/** Bagian stres dari relasi (dipakai stressTarget) */
export function relationStress(career: Career, p: Player, clubCountry?: string): [string, number][] {
  const rel = career.rel;
  const parts: [string, number][] = [];
  if (rel.manager && rel.manager.value <= -40) parts.push(['Manajer tidak suka padamu', 8]);
  const fans = rel.clubId ? rel.fans[rel.clubId] : undefined;
  if (fans !== undefined && fans >= 50) parts.push(['Dicintai fans', -4]);
  else if (fans !== undefined && fans <= -30) parts.push(['Fans kecewa', 8]);
  if (rel.media <= -40) parts.push(['Kritik media', 6]);
  if (rel.partner) {
    if (rel.partner.value >= 40) parts.push([rel.partner.stage === 'menikah' ? 'Keluarga kecilmu' : 'Pasangan', -5]);
    else if (rel.partner.value <= 0) parts.push(['Masalah dengan pasangan', 8]);
  }
  if (rel.mates.some((m) => m.tag === 'sahabat' && m.clubId === rel.clubId && m.value >= 50)) parts.push(['Punya sahabat di tim', -3]);
  if (clubCountry && clubCountry !== p.nationalityId) {
    let v = 10 - p.personality.Adaptability / 2.5;
    if (rel.partner && rel.partner.value >= 30) v -= 4;
    if (v >= 1) parts.push(['Jauh dari rumah', Math.round(v)]);
  }
  return parts;
}

// --- event relasi ---------------------------------------------------------------

const lastMatch = (c: EventCtx) => {
  const m = c.career.matches[0];
  return m && m.comp === 'Liga' && m.date > addDays(c.career.currentDate, -7) ? m : undefined;
};

type Kind = 'good' | 'bad' | 'bench';
function interviewKind(c: EventCtx): Kind | null {
  const m = lastMatch(c);
  if (!m || c.age < 17) return null;
  if (m.minutes > 0 && (m.goals > 0 || m.motm || (m.rating ?? 0) >= 7.6)) return 'good';
  if (m.minutes > 0 && (m.rating ?? 7) <= 5.7) return 'bad';
  const benched = c.career.matches.slice(0, 3).filter((x) => x.comp === 'Liga' && x.minutes === 0 && x.status !== 'Cedera');
  if (benched.length === 3) return 'bench';
  return null;
}

const QUOTES: Record<Kind, [string, string, string]> = {
  good: [
    '"Semua berkat kerja keras tim. Aku cuma menyelesaikan peluang."',
    '"Aku sudah bilang, aku pantas main setiap minggu."',
    '"Yang dulu meragukanku sekarang bisa diam."',
  ],
  bad: [
    '"Aku tidak bermain bagus. Minggu depan harus lebih baik."',
    '"Satu laga buruk tidak mengubah apa-apa. Aku tetap percaya diri."',
    '"Wasitnya aneh hari ini, susah main dengan keputusan seperti itu."',
  ],
  bench: [
    '"Aku akan terus kerja keras dan menunggu kesempatan."',
    '"Aku siap kapan saja dipanggil. Pelatih tahu kemampuanku."',
    '"Tanya saja ke manajer kenapa aku tidak dimainkan."',
  ],
};

const INTERVIEW: EventDef = {
  id: 'interview',
  cooldown: 2,
  weight: (c) => (c.club && interviewKind(c) ? 4 : 0),
  create: (c) => {
    const kind = interviewKind(c)!;
    const m = lastMatch(c)!;
    const situation =
      kind === 'good'
        ? `Setelah laga melawan ${m.opponent} (rating ${m.rating!.toFixed(1)}${m.goals ? `, ${m.goals} gol` : ''}), wartawan mengerubungimu.`
        : kind === 'bad'
          ? `Setelah laga melawan ${m.opponent}, wartawan bertanya soal penampilanmu yang kurang bagus (rating ${m.rating!.toFixed(1)}).`
          : 'Wartawan menanyakan kenapa kamu tidak dimainkan tiga laga terakhir.';
    const q = QUOTES[kind];
    return {
      from: 'Media',
      title: 'Wawancara setelah laga',
      body: situation,
      eventId: 'interview',
      data: { kind },
      choices: [
        { label: 'Rendah hati', hint: q[0] },
        { label: 'Percaya diri', hint: q[1] },
        { label: 'Menyindir', hint: q[2] },
      ],
    };
  },
  resolve: (c, choice, msg) => {
    const kind = msg.data!.kind as Kind;
    const k = c.career;
    const fans = c.club?.id;
    if (choice === 0) {
      addMedia(k, 4);
      addManager(k, kind === 'bench' ? 5 : 3);
      addMate(k, 'sahabat', 3);
      return 'Media menyukai sikapmu. Manajer juga membaca wawancaramu.';
    }
    if (choice === 1) {
      addMedia(k, kind === 'bad' ? -1 : 2);
      addFans(k, fans, kind === 'bad' ? 1 : 4);
      if (kind === 'good') c.player.reputation.home = clamp(c.player.reputation.home + 1, 1, 100);
      return kind === 'bad' ? 'Sebagian media menganggapmu terlalu santai.' : 'Fans suka pemain yang percaya diri.';
    }
    addMedia(k, kind === 'bad' ? -6 : 6);
    addFans(k, fans, kind === 'bench' ? 4 : 2);
    addManager(k, kind === 'bench' ? -15 : -4);
    k.stress = clamp(k.stress - 2, 0, 100);
    if (c.rng.chance(0.3)) c.player.personality.Controversy = clamp(c.player.personality.Controversy + 1, 1, 20);
    return kind === 'bench'
      ? 'Kutipanmu jadi judul besar. Manajer tidak senang dibicarakan di media.'
      : kind === 'bad'
        ? 'Media menganggapmu mencari kambing hitam.'
        : 'Kutipanmu viral, tapi tidak semua orang suka.';
  },
};

const FRIEND_MOVED: EventDef = {
  id: 'friend_moved',
  cooldown: 0,
  weight: () => 0,
  create: () => ({
    from: 'Sahabat',
    title: '',
    body: '',
    eventId: 'friend_moved',
    choices: [
      { label: 'Iya, tolong bilang', hint: 'Klubnya bisa mengirim tawaran kalau bursa transfer buka' },
      { label: 'Ucapkan selamat saja', hint: 'Persahabatan tetap jalan' },
    ],
  }),
  resolve: (c, choice, msg) => {
    const mate = c.career.rel.mates.find((m) => m.playerId === msg.data!.mateId);
    if (choice === 1) {
      if (mate) mate.value = bound(mate.value + 5);
      return 'Kalian janji tetap sering kontak.';
    }
    const club = c.world.clubs.find((k) => k.id === msg.data!.clubId);
    if (!club || club.id === c.player.contract?.clubId) return 'Ternyata tidak ada yang perlu diurus.';
    if (c.career.loan || (!transferWindow(c.career.currentDate).open && c.player.contract)) {
      return 'Bursa transfer sedang tutup. Mungkin di bursa berikutnya.';
    }
    const role = roleAt(c.world, club.id, c.player, c.career.currentDate);
    if (role === 'Pelapis' || c.career.offers.some((o) => o.clubId === club.id)) {
      return `${club.name} belum butuh pemain di posisimu sekarang.`;
    }
    const o = makeOffer(c.world, c.career, c.player, club, c.player.contract ? 'transfer' : 'bebas', role, c.rng);
    c.career.offers.push(o);
    return `${mate?.name ?? 'Sahabatmu'} membujuk pelatihnya. ${club.name} mengirim tawaran, lihat di panel Kontrak & transfer.`;
  },
};

const FEMALE: Record<string, string[]> = {
  indonesian: ['Ayu', 'Dewi', 'Putri', 'Rina', 'Sari', 'Nadia', 'Intan', 'Laras', 'Citra', 'Anisa'],
  malay: ['Aisyah', 'Nurul', 'Siti', 'Farah', 'Aina', 'Izzah'],
  english: ['Emily', 'Sophie', 'Chloe', 'Olivia', 'Grace', 'Lucy', 'Hannah', 'Ella'],
  spanish: ['Lucía', 'Marta', 'Paula', 'Carmen', 'Elena', 'Sara'],
  latam: ['Valentina', 'Camila', 'Sofía', 'Daniela', 'Mariana'],
  portuguese: ['Inês', 'Beatriz', 'Mariana', 'Catarina', 'Joana'],
  brazilian: ['Ana', 'Larissa', 'Bruna', 'Juliana', 'Camila'],
  italian: ['Giulia', 'Chiara', 'Francesca', 'Sara', 'Martina'],
  french: ['Camille', 'Léa', 'Manon', 'Chloé', 'Inès'],
  german: ['Lena', 'Hannah', 'Laura', 'Julia', 'Anna'],
  dutch: ['Sanne', 'Lotte', 'Eva', 'Fleur', 'Noor'],
  japanese: ['Yui', 'Haruka', 'Sakura', 'Aoi', 'Misaki'],
  korean: ['Ji-woo', 'Seo-yeon', 'Min-ji', 'Ha-eun', 'Soo-ah'],
  thai: ['Ploy', 'Nok', 'Fah', 'Mint', 'Pim'],
  gulf: ['Noura', 'Mariam', 'Fatima', 'Layla', 'Huda'],
  maghreb: ['Yasmine', 'Salma', 'Amira', 'Imane', 'Rania'],
  turkish: ['Elif', 'Zeynep', 'Ece', 'Defne', 'Selin'],
};

function partnerName(rng: Rng, countryId: string): string {
  const style = COUNTRY_BY_ID[countryId]?.nameStyle ?? 'english';
  return rng.pick(FEMALE[style] ?? FEMALE.english);
}

export const RELATION_EVENTS: EventDef[] = [
  INTERVIEW,
  {
    id: 'mate_dinner',
    cooldown: 10,
    weight: (c) => (mateAtClub(c.career, 'sahabat') ? 0.8 : 0),
    create: (c) => {
      const m = mateAtClub(c.career, 'sahabat')!;
      return {
        from: m.name,
        title: 'Ajakan makan malam',
        body: `${m.name} mengajakmu makan malam bareng beberapa pemain setelah latihan.`,
        eventId: 'mate_dinner',
        choices: [
          { label: 'Ikut', hint: 'Stres turun, makin akrab' },
          { label: 'Tidak bisa', hint: 'Mau istirahat' },
        ],
      };
    },
    resolve: (c, choice) => {
      if (choice === 1) {
        addMate(c.career, 'sahabat', -4);
        return 'Dia bilang tidak apa-apa, lain kali saja.';
      }
      addMate(c.career, 'sahabat', 10);
      c.career.stress = clamp(c.career.stress - 6, 0, 100);
      c.career.money -= Math.round(20 * c.econ);
      return 'Malam yang seru. Kalian makin akrab.';
    },
  },
  {
    id: 'rival_jab',
    cooldown: 12,
    weight: (c) => {
      const r = mateAtClub(c.career, 'rival');
      return r ? (r.value <= -30 ? 1.2 : 0.5) : 0;
    },
    create: (c) => {
      const r = mateAtClub(c.career, 'rival')!;
      return {
        from: r.name,
        title: 'Rival posisi menyindirmu',
        body: `Saat latihan, ${r.name} (sainganmu di posisi yang sama) menyindirmu di depan pemain lain: "Kamu di sini cuma pelengkap."`,
        eventId: 'rival_jab',
        choices: [
          { label: 'Balas', hint: 'Bisa jadi ribut' },
          { label: 'Abaikan', hint: 'Buktikan di lapangan' },
          { label: 'Ajak bicara baik-baik', hint: 'Mungkin dia cuma tertekan' },
        ],
      };
    },
    resolve: (c, choice) => {
      const k = c.career;
      if (choice === 0) {
        addMate(k, 'rival', -12);
        if (c.player.personality.Temperament <= 9 && c.rng.chance(0.6)) {
          addManager(k, -10);
          return 'Adu mulut berubah jadi dorong-dorongan. Manajer marah besar pada kalian berdua.';
        }
        k.stress = clamp(k.stress - 3, 0, 100);
        return 'Kamu membalas dengan tajam. Dia diam, tapi suasana jadi dingin.';
      }
      if (choice === 1) {
        k.stress = clamp(k.stress + 3, 0, 100);
        addManager(k, 2);
        if (c.rng.chance(0.2)) c.player.personality.Professionalism = clamp(c.player.personality.Professionalism + 1, 1, 20);
        return 'Kamu fokus latihan. Manajer melihat sikapmu.';
      }
      addMate(k, 'rival', 18);
      return 'Ternyata dia juga takut kehilangan tempat. Hubungan kalian membaik.';
    },
  },
  {
    id: 'late_training',
    cooldown: 10,
    weight: (c) =>
      c.club ? 0.25 + (c.career.plan.activity === 'pesta' ? 1.5 : 0) + (c.player.personality.Professionalism <= 8 ? 0.5 : 0) : 0,
    create: () => ({
      from: 'Dirimu sendiri',
      title: 'Terlambat latihan',
      body: 'Kamu bangun kesiangan dan datang terlambat ke latihan. Manajer menunggumu di pinggir lapangan.',
      eventId: 'late_training',
      choices: [
        { label: 'Jujur dan minta maaf', hint: 'Manajer sedikit kecewa' },
        { label: 'Cari alasan', hint: 'Kalau ketahuan, lebih parah' },
        { label: 'Diam saja', hint: 'Manajer kesal' },
      ],
    }),
    resolve: (c, choice) => {
      if (choice === 0) {
        addManager(c.career, -3);
        return 'Manajer menerima permintaan maafmu, tapi memintamu tidak mengulanginya.';
      }
      if (choice === 1) {
        if (c.rng.chance(0.5)) return 'Alasanmu diterima. Kali ini kamu lolos.';
        addManager(c.career, -12);
        return 'Alasanmu ketahuan bohong. Manajer marah dan mendendamu.';
      }
      addManager(c.career, -8);
      return 'Manajer menganggapmu tidak menghargai tim.';
    },
  },
  {
    id: 'celebration',
    cooldown: 6,
    weight: (c) => ((lastMatch(c)?.goals ?? 0) > 0 && c.club ? 1.2 : 0),
    create: (c) => ({
      from: 'Media sosial',
      title: 'Selebrasi golmu',
      body: `Golmu melawan ${lastMatch(c)!.opponent} ramai dibicarakan. Bagaimana kamu merayakannya di media sosial?`,
      eventId: 'celebration',
      choices: [
        { label: 'Persembahkan untuk fans', hint: 'Fans makin cinta' },
        { label: 'Video selebrasi khas', hint: 'Media dan reputasi naik' },
        { label: 'Ejek fans lawan', hint: 'Fans sendiri suka, media tidak' },
      ],
    }),
    resolve: (c, choice) => {
      const k = c.career;
      if (choice === 0) {
        addFans(k, c.club?.id, 6);
        return 'Fans membalas dengan ribuan komentar penuh cinta.';
      }
      if (choice === 1) {
        addMedia(k, 5);
        addFans(k, c.club?.id, 2);
        c.player.reputation.home = clamp(c.player.reputation.home + 1, 1, 100);
        return 'Selebrasimu mulai ditiru anak-anak di lapangan kampung.';
      }
      addFans(k, c.club?.id, 4);
      addMedia(k, -8);
      addManager(k, -3);
      return 'Postinganmu memancing keributan. Media menyebutmu tidak sportif.';
    },
  },
  {
    id: 'meet_someone',
    cooldown: 20,
    weight: (c) =>
      !c.career.rel.partner && c.age >= 17 ? 0.35 + (['nongkrong', 'pesta'].includes(c.career.plan.activity) ? 0.6 : 0) : 0,
    create: (c) => {
      const name = partnerName(c.rng, c.club?.countryId ?? c.player.nationalityId);
      return {
        from: name,
        title: 'Kenalan dengan seseorang',
        body: `Kamu berkenalan dengan ${name}. Obrolan kalian nyambung dan dia memberi nomornya.`,
        eventId: 'meet_someone',
        data: { name },
        choices: [
          { label: 'Ajak kencan', hint: 'Mulai pacaran: dukungan, tapi butuh waktu dan perhatian' },
          { label: 'Fokus karier dulu', hint: 'Tidak ada perubahan' },
        ],
      };
    },
    resolve: (c, choice, msg) => {
      if (choice === 1) return 'Kamu memilih fokus ke sepak bola dulu.';
      const d = c.career.currentDate;
      c.career.rel.partner = { name: String(msg.data!.name), since: d, value: 35, stage: 'pacaran', stageSince: d };
      c.career.stress = clamp(c.career.stress - 4, 0, 100);
      return `Kamu dan ${msg.data!.name} resmi pacaran. Luangkan waktu untuknya (kegiatan keluarga atau nongkrong).`;
    },
  },
  {
    id: 'partner_attention',
    cooldown: 6,
    weight: (c) => (c.career.rel.partner && c.career.rel.partner.value < 15 ? 4 : 0),
    create: (c) => {
      const p = c.career.rel.partner!;
      return {
        from: p.name,
        title: `${p.name} merasa diabaikan`,
        body: `${p.name} bilang kamu terlalu sibuk dan jarang punya waktu untuknya.`,
        eventId: 'partner_attention',
        choices: [
          { label: 'Ajak liburan singkat', hint: `Biaya sekitar €${Math.round(250 * c.econ).toLocaleString('id-ID')}` },
          { label: 'Ngobrol baik-baik', hint: 'Sedikit membantu' },
          { label: 'Putus', hint: 'Hubungan berakhir' },
        ],
      };
    },
    resolve: (c, choice) => {
      const k = c.career;
      const name = k.rel.partner!.name;
      if (choice === 0) {
        k.money -= Math.round(250 * c.econ);
        addPartner(k, 25);
        k.stress = clamp(k.stress - 6, 0, 100);
        return `Liburan singkat bersama ${name} membuat kalian dekat lagi.`;
      }
      if (choice === 1) {
        addPartner(k, 8);
        return `${name} menghargai kejujuranmu, tapi butuh bukti.`;
      }
      k.rel.partner = null;
      k.stress = clamp(k.stress + 6, 0, 100);
      return 'Kalian berpisah. Rasanya berat, tapi mungkin ini yang terbaik.';
    },
  },
  {
    id: 'propose',
    cooldown: 26,
    weight: (c) => {
      const p = c.career.rel.partner;
      return p && p.stage === 'pacaran' && p.value >= 60 && c.age >= 21 && p.since <= addDays(c.career.currentDate, -730) ? 2 : 0;
    },
    create: (c) => {
      const p = c.career.rel.partner!;
      return {
        from: 'Dirimu sendiri',
        title: `Melamar ${p.name}?`,
        body: `Sudah lebih dari dua tahun bersama ${p.name}. Keluargamu bertanya kapan kalian serius.`,
        eventId: 'propose',
        choices: [
          { label: 'Lamar', hint: `Cincin sekitar €${Math.round(800 * c.econ).toLocaleString('id-ID')}, menikah tahun depan` },
          { label: 'Belum siap', hint: 'Dia sedikit kecewa' },
        ],
      };
    },
    resolve: (c, choice) => {
      const p = c.career.rel.partner!;
      if (choice === 1) {
        addPartner(c.career, -5);
        return `${p.name} bilang dia mengerti, tapi wajahnya kecewa.`;
      }
      c.career.money -= Math.round(800 * c.econ);
      p.stage = 'tunangan';
      p.stageSince = c.career.currentDate;
      addPartner(c.career, 15);
      c.career.family.support = clamp(c.career.family.support + 1, 1, 20);
      return `${p.name} menerima lamaranmu! Pernikahan direncanakan sekitar sembilan bulan lagi.`;
    },
  },
];

export const RELATION_EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(
  [...RELATION_EVENTS, FRIEND_MOVED].map((e) => [e.id, e]),
);

/** Komentar manajer dan reaksi fans setelah laga (untuk kartu laga terakhir) */
export function matchReactions(m: MatchRecord): { manager: string; fans: string } | null {
  if (m.comp !== 'Liga' || m.minutes === 0 || m.rating === undefined) return null;
  const r = m.rating;
  const manager =
    r >= 8 ? '"Penampilan luar biasa. Pertahankan."' : r >= 7 ? '"Bagus, kamu bekerja keras untuk tim."' : r >= 6.2 ? '"Cukup. Masih bisa lebih baik."' : '"Itu jauh di bawah standarmu."';
  const fans =
    m.goals >= 2 || m.motm ? 'Namamu dinyanyikan di tribun.' : m.goals ? 'Fans merayakan golmu.' : r >= 7 ? 'Fans puas dengan kerja kerasmu.' : r < 6 ? 'Beberapa fans mengkritikmu di media sosial.' : 'Fans biasa saja.';
  return { manager, fans };
}
