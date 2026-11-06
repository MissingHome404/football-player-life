// Transfer, pinjaman, kontrak, dan agent pemain kita.
// Tawaran datang saat bursa transfer buka (pemain bebas bisa dikontrak kapan saja),
// dari klub yang levelnya cocok dan cukup mengenalmu. Agent memperluas jangkauan
// dan menaikkan gaji, tapi memotong penghasilan.

import { badgeValue } from './badges';
import type { AgentTier, Career, Club, ClubSpell, Message, Offer, Player, SquadRole, World } from '../types';
import type { EventCtx, EventDef } from './events';
import { Rng, clamp } from '../rng';
import { addDays, yearOf } from '../date';
import { ageOn } from '../gen/player';
import { wageFor } from '../gen/world';
import { generateName, fullName } from '../gen/names';
import { COUNTRY_BY_ID } from '../data/countries';
import { groupOf, recentForm } from './match';
import { clubStrengths, replacePlayer, seasonEnd, squadOf } from './season';
import { addFans, addManager, syncClub } from './relations';

export const AGENT_INFO: Record<
  AgentTier,
  { label: string; fee: number; desc: string; wage: number; chance: number; reach: number; need: string }
> = {
  lokal: {
    label: 'Agent lokal',
    fee: 0.05,
    desc: 'Kenal klub-klub di liga negaramu.',
    wage: 1,
    chance: 0.1,
    reach: 5,
    need: 'Bisa disewa siapa saja.',
  },
  regional: {
    label: 'Agent regional',
    fee: 0.08,
    desc: 'Punya akses ke liga-liga tetangga, negosiasi lumayan.',
    wage: 1.07,
    chance: 0.15,
    reach: 12,
    need: 'Butuh reputasi lokal 30+ atau kemampuan ★★½.',
  },
  super: {
    label: 'Super agent',
    fee: 0.12,
    desc: 'Bisa membuka pintu klub elite di mana saja, tapi kadang memaksamu pindah demi komisi.',
    wage: 1.15,
    chance: 0.2,
    reach: 22,
    need: 'Butuh reputasi dunia 25+ atau kemampuan ★★★½.',
  },
};

export function agentAvailable(tier: AgentTier, p: Player): boolean {
  if (tier === 'lokal') return true;
  if (tier === 'regional') return p.reputation.home >= 30 || p.ca >= 100;
  return p.reputation.world >= 25 || p.ca >= 140;
}

export function hireAgent(career: Career, p: Player, tier: AgentTier, seed: string): Career {
  const rng = new Rng(`agent:${seed}:${tier}:${career.week}`);
  const country = tier === 'lokal' ? p.nationalityId : rng.pick(['ENG', 'ESP', 'ITA', 'POR', 'NED', p.nationalityId]);
  const name = fullName(generateName(rng, country));
  return { ...career, agent: { tier, name, fee: AGENT_INFO[tier].fee, since: career.currentDate } };
}

/** Setelah tanda tangan kontrak, klub lain menunggu sekitar 5 bulan sebelum menawar */
export const SETTLE_DAYS = 150;

/** Bursa transfer: musim panas 15 Jun - 31 Agu, Januari sebulan penuh */
export function transferWindow(date: string): { open: boolean; label: string; until: string } {
  const y = yearOf(date);
  const md = date.slice(5);
  if (md >= '06-15' && md <= '08-31') return { open: true, label: 'Bursa transfer buka', until: `${y}-08-31` };
  if (md >= '01-01' && md <= '01-31') return { open: true, label: 'Bursa transfer buka', until: `${y}-01-31` };
  const next = md < '01-01' ? `${y}-01-01` : md < '06-15' ? `${y}-06-15` : `${y + 1}-01-01`;
  return { open: false, label: 'Bursa transfer tutup', until: next };
}

function roundNice(v: number): number {
  if (v < 1000) return Math.round(v / 10) * 10;
  if (v < 100_000) return Math.round(v / 1000) * 1000;
  if (v < 1_000_000) return Math.round(v / 10_000) * 10_000;
  return Math.round(v / 100_000) * 100_000;
}

/** Perkiraan nilai pasar (EUR) */
export function marketValue(p: Player, date: string, factor = 1): number {
  const age = ageOn(p.birthDate, date);
  let v = 20_000 * Math.exp((p.ca - 60) / 15) * factor;
  if (age <= 21) v *= 1 + Math.max(0, p.pa - p.ca) / 100;
  else if (age >= 30) v *= Math.max(0.2, 1 - (age - 29) * 0.15);
  if (p.contract && p.contract.expires <= addDays(date, 365)) v *= 0.6;
  if (!p.contract) v *= 0.3;
  return roundNice(v);
}

/** Peran yang realistis untukmu di sebuah klub: dibandingkan dengan pemain seposisi */
export function roleAt(world: World, clubId: string, p: Player, date: string): SquadRole {
  const g = groupOf(p.mainPosition);
  const same = squadOf(world, clubId).filter((q) => !q.isYouth && !q.isUser && groupOf(q.mainPosition) === g);
  const better = same.filter((q) => q.ca > p.ca + 2).length;
  const starters = { GK: 1, DEF: 4, MID: 3, ATT: 3 }[g];
  if (better < starters) return 'Inti';
  if (better < starters + Math.ceil(starters / 2) + 1) return 'Rotasi';
  return ageOn(p.birthDate, date) <= 21 ? 'Pemain muda' : 'Pelapis';
}

const ROLE_WAGE: Record<SquadRole, number> = { Inti: 1.1, Rotasi: 1, Pelapis: 0.85, 'Pemain muda': 0.8 };

function contractYears(rng: Rng, age: number) {
  return age <= 23 ? rng.int(3, 5) : age <= 29 ? rng.int(2, 4) : rng.int(1, 2);
}

/** Akhir musim liga klub ini yang sedang berjalan (atau berikutnya) */
function loanUntil(world: World, club: Club, date: string): string {
  const s = world.seasons[club.leagueId];
  const end = s ? seasonEnd(s) : addDays(date, 280);
  return end > date ? addDays(end, 3) : addDays(date, 280);
}

export function makeOffer(
  world: World,
  career: Career,
  p: Player,
  club: Club,
  type: Offer['type'],
  role: SquadRole,
  rng: Rng,
): Offer {
  const league = world.leagues.find((l) => l.id === club.leagueId)!;
  const age = ageOn(p.birthDate, career.currentDate);
  const agent = career.agent ? AGENT_INFO[career.agent.tier].wage : 0.92;
  const base = wageFor(p.ca, league, club.reputation) * ROLE_WAGE[role] * agent * rng.float(0.9, 1.1);
  const wage = Math.max(10, Math.round(base / 10) * 10);
  if (type === 'pinjaman') {
    return {
      id: `o${career.week}-${club.id}-${type}`,
      clubId: club.id,
      type,
      date: career.currentDate,
      expires: addDays(career.currentDate, 14),
      wage: p.contract?.wagePerWeek ?? wage,
      years: 0,
      until: loanUntil(world, club, career.currentDate),
      role,
      signOn: 0,
      fee: 0,
    };
  }
  const years = contractYears(rng, age);
  return {
    id: `o${career.week}-${club.id}-${type}`,
    clubId: club.id,
    type,
    date: career.currentDate,
    expires: addDays(career.currentDate, 14),
    wage,
    years,
    role,
    signOn: Math.round(wage * (type === 'bebas' ? 6 : type === 'perpanjangan' ? 2 : 3)),
    fee: type === 'transfer' ? marketValue(p, career.currentDate, badgeValue(career)) : 0,
  };
}

function infoMessage(career: Career, id: string, from: string, title: string, body: string) {
  career.inbox.unshift({ id: `${id}-${career.week}`, date: career.currentDate, from, title, body });
}

export function startSpell(career: Career, spell: ClubSpell) {
  const open = career.history.find((h) => !h.to);
  if (open) open.to = spell.from;
  career.history.push(spell);
}

/**
 * Urusan kontrak mingguan (dipanggil setelah tanggal maju): pinjaman selesai,
 * kontrak habis, tawaran perpanjangan, tawaran klub lain, pinjaman, janji menit.
 * Mengubah `career` dan `p` (salinan) langsung.
 */
export function contractWeek(world: World, career: Career, p: Player, rng: Rng) {
  const date = career.currentDate;
  const age = ageOn(p.birthDate, date);
  const clubOf = (id: string) => world.clubs.find((c) => c.id === id)!;
  career.offers = career.offers.filter((o) => o.expires >= date);

  // Pinjaman selesai
  if (career.loan && date >= career.loan.until) {
    const parent = clubOf(career.loan.parentClubId);
    p.contract = career.loan.parentContract;
    career.loan = null;
    career.teamLabel = parent.name;
    career.joined = date;
    startSpell(career, { clubId: parent.id, team: parent.name, from: date, kind: 'Senior' });
    infoMessage(career, 'loan-end', parent.name, 'Kembali dari pinjaman', `Masa pinjamanmu selesai. Kamu kembali ke ${parent.name}.`);
  }

  // Kontrak habis: jadi pemain bebas
  if (p.contract && !career.loan && p.contract.expires <= date) {
    const club = clubOf(p.contract.clubId);
    if (p.isYouth && age < 19) {
      // kontrak akademi diperpanjang diam-diam sampai umur 19
      p.contract.expires = `${yearOf(date) + 1}-06-30`;
    } else {
      p.contract = null;
      p.isYouth = false;
      career.teamLabel = 'Tanpa klub';
      career.listed = false;
      career.wantsLoan = false;
      career.offers = career.offers.filter((o) => o.type !== 'perpanjangan');
      startSpell(career, { team: 'Tanpa klub', from: date, kind: 'Amatir' });
      infoMessage(
        career,
        'free-agent',
        club.name,
        'Kontrakmu habis',
        `Kontrakmu dengan ${club.name} sudah habis. Sekarang kamu pemain bebas: klub mana pun boleh mengontrakmu tanpa biaya transfer, kapan saja.`,
      );
    }
  }

  const club = p.contract ? clubOf(p.contract.clubId) : undefined;

  // Tawaran perpanjangan dari klub sendiri, 6 bulan sebelum kontrak habis
  if (club && p.contract && !career.loan && p.contract.expires <= addDays(date, 182)) {
    const already = career.offers.some((o) => o.type === 'perpanjangan');
    const youthJunior = p.isYouth && age < 18;
    if (!already && !youthJunior && career.renewalNoted !== p.contract.expires) {
      const role = roleAt(world, club.id, p, date);
      const strength = squadOf(world, club.id)
        .filter((q) => !q.isYouth && !q.isUser)
        .map((q) => q.ca)
        .sort((a, b) => b - a);
      const cutoff = strength[Math.min(21, strength.length - 1)] ?? 60;
      const wanted = p.ca >= cutoff - 4 || (age <= 21 && p.pa >= cutoff + 10);
      if (wanted && rng.chance(0.35)) {
        const o = makeOffer(world, career, p, club, 'perpanjangan', role, rng);
        o.expires = p.contract.expires > addDays(date, 28) ? addDays(date, 28) : p.contract.expires;
        o.wage = Math.max(o.wage, Math.round(p.contract.wagePerWeek * 1.05));
        career.offers.push(o);
        infoMessage(career, 'renewal', club.name, 'Tawaran perpanjangan kontrak', `${club.name} ingin memperpanjang kontrakmu. Lihat detailnya di panel Kontrak & transfer.`);
      } else if (!wanted) {
        career.renewalNoted = p.contract.expires;
        infoMessage(
          career,
          'no-renewal',
          club.name,
          'Kontrak tidak diperpanjang',
          `${club.name} tidak berencana memperpanjang kontrakmu yang habis ${p.contract.expires}. Cari klub baru lewat agent, atau tunggu tawaran saat bursa transfer.`,
        );
      }
    }
  }

  // Tawaran dari klub lain
  const win = transferWindow(date);
  const canMove = !career.loan && (win.open || !p.contract) && age >= 16;
  const open = career.offers.filter((o) => o.type !== 'perpanjangan').length;
  if (canMove && open < 3 && p.ca >= 30) {
    const form = recentForm(career) ?? 6.5;
    const agent = career.agent ? AGENT_INFO[career.agent.tier] : null;
    const visibility =
      Math.max(p.reputation.home, p.reputation.world * 1.5) +
      (agent?.reach ?? 0) +
      (form >= 7.3 ? 10 : form >= 7 ? 5 : form <= 6.2 ? -5 : 0);
    // pemain yang jauh lebih bagus dari rekan setimnya lebih cepat dilirik klub lain
    const outgrown = club ? clamp((p.ca - (clubStrengths(world).get(club.id)?.senior ?? p.ca) - 5) / 40, 0, 0.25) : 0;
    let chance = 0.15 + outgrown + (agent?.chance ?? 0) + (career.listed ? 0.2 : 0) + (!p.contract ? 0.25 : 0);
    if (career.injury) chance *= 0.3;
    // bursa Januari: klub jarang belanja di tengah musim
    if (date.slice(5, 7) === '01') chance *= 0.4;

    // klub tidak melepas pemain yang baru tanda tangan kontrak (sekitar 5 bulan),
    // kecuali pemainnya sendiri minta dijual
    const settled = !!career.signed && career.signed > addDays(date, -SETTLE_DAYS) && !career.listed;

    // pinjaman yang diminta
    if (career.wantsLoan && p.contract && club && rng.chance(0.5)) {
      const conf = COUNTRY_BY_ID[club.countryId].confederation;
      const loanClubs = world.clubs.filter((c) => {
        if (c.id === club.id || c.reputation > club.reputation || c.reputation < club.reputation - 35) return false;
        if (COUNTRY_BY_ID[c.countryId].confederation !== conf) return false;
        const role = roleAt(world, c.id, p, date);
        return role === 'Inti' || role === 'Rotasi';
      });
      if (loanClubs.length) {
        const pick = rng.weighted(loanClubs.map((c) => [c, 1 + c.reputation / 20] as const));
        const o = makeOffer(world, career, p, pick, 'pinjaman', roleAt(world, pick.id, p, date), rng);
        career.offers.push(o);
        infoMessage(career, 'offer', pick.name, `Tawaran pinjaman dari ${pick.name}`, `${pick.name} ingin meminjammu sampai akhir musim mereka. Lihat di panel Kontrak & transfer.`);
      }
    } else if (!settled && rng.chance(chance)) {
      const home = club ?? world.clubs.find((c) => c.countryId === p.nationalityId);
      const homeLeague = home ? world.leagues.find((l) => l.id === home.leagueId) : undefined;
      const conf = COUNTRY_BY_ID[home?.countryId ?? p.nationalityId].confederation;
      const curRep = club?.reputation ?? 0;
      const candidates: (readonly [Club, number])[] = [];
      for (const c of world.clubs) {
        if (c.id === club?.id || career.offers.some((o) => o.clubId === c.id)) continue;
        if (c.reputation > visibility + 40) continue;
        const league = world.leagues.find((l) => l.id === c.leagueId)!;
        const tier = career.agent?.tier;
        if (!tier || tier === 'lokal') {
          if (c.countryId !== (home?.countryId ?? p.nationalityId)) continue;
        } else if (tier === 'regional') {
          if (COUNTRY_BY_ID[c.countryId].confederation !== conf) continue;
          if (homeLeague && Math.abs(league.reputation - homeLeague.reputation) > 30) continue;
        }
        const role = roleAt(world, c.id, p, date);
        const ok = role === 'Inti' || role === 'Rotasi' || (role === 'Pemain muda' && p.pa >= c.reputation + 60);
        if (!ok) continue;
        const w = (1 + Math.max(0, c.reputation - curRep) / 10) * (role === 'Inti' ? 1.5 : 1);
        candidates.push([c, w]);
      }
      if (candidates.length) {
        const pick = rng.weighted(candidates);
        const type = p.contract ? 'transfer' : 'bebas';
        const o = makeOffer(world, career, p, pick, type, roleAt(world, pick.id, p, date), rng);
        career.offers.push(o);
        infoMessage(
          career,
          'offer',
          pick.name,
          `Tawaran dari ${pick.name}`,
          `${pick.name} (${COUNTRY_BY_ID[pick.countryId].name}) ingin mengontrakmu${type === 'transfer' ? ' dan sudah sepakat soal biaya transfer dengan klubmu' : ''}. Lihat detail dan bandingkan di panel Kontrak & transfer.`,
        );
      }
    }
  }

  // Manajer menyarankan pinjaman kalau pemain muda jarang dimainkan
  const since = addDays(date, -56);
  const recentLeague = career.matches.filter((m) => m.comp === 'Liga' && m.date >= since);
  if (
    club &&
    !p.isYouth &&
    !career.loan &&
    !career.wantsLoan &&
    age <= 23 &&
    recentLeague.length >= 5 &&
    recentLeague.every((m) => m.minutes === 0) &&
    (career.cooldowns.loan_suggest === undefined || career.week - career.cooldowns.loan_suggest >= 16)
  ) {
    career.cooldowns.loan_suggest = career.week;
    const ctx = { career, player: p, club } as EventCtx;
    career.inbox.unshift({ id: `w${career.week}-loan_suggest`, date, ...TRANSFER_EVENTS.loan_suggest.create(ctx) });
  }

  // Janji menit bermain dilanggar
  if (club && p.contract && !p.isYouth && (p.contract.role === 'Inti' || p.contract.role === 'Rotasi')) {
    const here = career.matches.filter((m) => m.comp === 'Liga' && m.team === club.name && m.date >= career.joined);
    const last = here.slice(0, 10);
    const ready = career.cooldowns.promise_broken === undefined || career.week - career.cooldowns.promise_broken >= 12;
    if (last.length >= 8 && ready) {
      const starts = last.filter((m) => m.status === 'Inti').length / last.length;
      const apps = last.filter((m) => m.minutes > 0).length / last.length;
      const broken = p.contract.role === 'Inti' ? starts < 0.5 : apps < 0.4;
      if (broken) {
        career.cooldowns.promise_broken = career.week;
        const ctx = { career, player: p, club } as EventCtx;
        career.inbox.unshift({ id: `w${career.week}-promise_broken`, date, ...TRANSFER_EVENTS.promise_broken.create(ctx) });
      }
    }
  }
}

/** Terima tawaran: pindah klub, pinjaman, atau perpanjangan */
export function acceptOffer(world: World, prev: Career, offerId: string): { world: World; career: Career } {
  const career: Career = structuredClone(prev);
  const offer = career.offers.find((o) => o.id === offerId);
  if (!offer) return { world, career: prev };
  const idx = world.players.findIndex((x) => x.id === career.playerId);
  const p: Player = structuredClone(world.players[idx]);
  const club = world.clubs.find((c) => c.id === offer.clubId)!;
  const date = career.currentDate;
  const net = (v: number) => Math.round(v * (1 - (career.agent?.fee ?? 0)));
  const oldClub = p.contract?.clubId;

  if (offer.type === 'pinjaman' && p.contract) {
    career.loan = { parentClubId: p.contract.clubId, parentContract: p.contract, until: offer.until! };
    p.contract = { clubId: club.id, wagePerWeek: p.contract.wagePerWeek, expires: offer.until!, role: offer.role };
    p.isYouth = false;
    startSpell(career, { clubId: club.id, team: club.name, from: date, kind: 'Pinjaman' });
    infoMessage(career, 'joined', club.name, `Dipinjamkan ke ${club.name}`, `Kamu resmi dipinjamkan ke ${club.name} sampai ${offer.until}. Gajimu tetap dibayar klub induk.`);
  } else {
    const expires = `${yearOf(date) + offer.years}-06-30`;
    const isNew = offer.type !== 'perpanjangan';
    p.contract = { clubId: club.id, wagePerWeek: offer.wage, expires, role: offer.role };
    p.isYouth = false;
    career.money += net(offer.signOn);
    if (isNew) {
      startSpell(career, { clubId: club.id, team: club.name, from: date, kind: 'Senior' });
      infoMessage(
        career,
        'joined',
        club.name,
        `Resmi bergabung dengan ${club.name}`,
        `Kamu menandatangani kontrak ${offer.years} tahun dengan ${club.name}, gaji €${offer.wage.toLocaleString('id-ID')} per minggu, janji peran: ${offer.role}.${offer.signOn ? ` Bonus tanda tangan €${net(offer.signOn).toLocaleString('id-ID')} sudah masuk (setelah potongan agent).` : ''}`,
      );
      career.joined = date;
      p.reputation.home = clamp(p.reputation.home + 2, 1, 100);
    } else {
      infoMessage(career, 'renewed', club.name, 'Kontrak diperpanjang', `Kontrak barumu dengan ${club.name} berlaku sampai ${expires}, gaji €${offer.wage.toLocaleString('id-ID')} per minggu.`);
    }
  }
  career.teamLabel = club.name;
  career.listed = false;
  career.wantsLoan = false;
  // sudah memutuskan: semua tawaran lain hangus
  career.offers = [];
  career.renewalNoted = undefined;
  if (offer.type !== 'pinjaman') career.signed = date;
  // fans klub lama kecewa kalau kamu pergi; perpanjangan menyenangkan fans dan manajer
  if (offer.type === 'perpanjangan') {
    addFans(career, club.id, 5);
    addManager(career, 4);
  } else if (oldClub) {
    addFans(career, oldClub, prev.listed ? -4 : -12);
  }
  syncClub(world, career, p, new Rng(`join:${career.characterSeed}:${date}`));
  return { world: replacePlayer(world, p), career };
}

export function rejectOffer(prev: Career, offerId: string): Career {
  return { ...prev, offers: prev.offers.filter((o) => o.id !== offerId) };
}

export type Ask = 'gaji' | 'peran';

/** Satu kali negosiasi per tawaran: minta gaji lebih tinggi atau peran lebih besar */
export function negotiate(world: World, prev: Career, offerId: string, ask: Ask): { career: Career; result: string } {
  const career: Career = structuredClone(prev);
  const o = career.offers.find((x) => x.id === offerId);
  if (!o || o.negotiated) return { career: prev, result: '' };
  o.negotiated = true;
  const rng = new Rng(`nego:${career.characterSeed}:${offerId}:${ask}`);
  const p = world.players.find((x) => x.id === career.playerId)!;
  const club = world.clubs.find((c) => c.id === o.clubId)!;
  const bonus = career.agent ? { lokal: 0.05, regional: 0.12, super: 0.2 }[career.agent.tier] : -0.05;
  // makin bagus kamu dibanding klubnya, makin kuat posisi tawarmu
  const leverage = clamp((p.ca - (club.reputation + 50)) / 60, -0.2, 0.25);
  let result: string;
  if (ask === 'gaji') {
    const ok = rng.chance(clamp(0.45 + bonus + leverage, 0.1, 0.9));
    if (ok) {
      o.wage = Math.round((o.wage * 1.2) / 10) * 10;
      o.signOn = Math.round(o.signOn * 1.2);
      result = `${club.name} setuju menaikkan gaji jadi €${o.wage.toLocaleString('id-ID')} per minggu.`;
    } else if (rng.chance(0.3)) {
      career.offers = career.offers.filter((x) => x.id !== offerId);
      result = `${club.name} tersinggung dan menarik tawarannya.`;
    } else {
      result = `${club.name} menolak menaikkan gaji. Tawaran awal masih berlaku.`;
    }
  } else {
    const next: SquadRole | null = o.role === 'Rotasi' ? 'Inti' : o.role === 'Pelapis' || o.role === 'Pemain muda' ? 'Rotasi' : null;
    if (!next) return { career: prev, result: '' };
    const ok = rng.chance(clamp(0.35 + bonus + leverage, 0.05, 0.85));
    if (ok) {
      o.role = next;
      result = `${club.name} menjanjikan peran ${next} untukmu.`;
    } else if (rng.chance(0.25)) {
      career.offers = career.offers.filter((x) => x.id !== offerId);
      result = `${club.name} tidak bisa menjanjikan itu dan menarik tawarannya.`;
    } else {
      result = `${club.name} tidak bisa menjanjikan peran lebih besar. Tawaran awal masih berlaku.`;
    }
  }
  return { career, result };
}


// ---------------------------------------------------------------------------
// Pesan dengan pilihan yang dipicu urusan kontrak

export const TRANSFER_EVENTS: Record<string, EventDef> = {
  loan_suggest: {
    id: 'loan_suggest',
    cooldown: 16,
    weight: () => 0,
    create: (c) => ({
      from: c.club ? `Manajer ${c.club.name}` : 'Manajer',
      title: 'Manajer menyarankan pinjaman',
      body: 'Manajer melihat kamu jarang dimainkan dan menyarankan kamu dipinjamkan ke klub lain supaya dapat menit bermain. Tawaran pinjaman akan dicari saat bursa transfer buka.',
      eventId: 'loan_suggest',
      choices: [
        { label: 'Setuju dipinjamkan', hint: 'Tawaran pinjaman muncul saat bursa transfer' },
        { label: 'Mau berjuang di sini', hint: 'Tetap di klub, stres naik sedikit' },
      ],
    }),
    resolve: (c, choice) => {
      if (choice === 0) {
        c.career.wantsLoan = true;
        return 'Klub akan mencarikan pinjaman saat bursa transfer buka.';
      }
      c.career.stress = clamp(c.career.stress + 3, 0, 100);
      return 'Kamu memilih bertahan dan membuktikan diri.';
    },
  },
  promise_broken: {
    id: 'promise_broken',
    cooldown: 12,
    weight: () => 0,
    create: (c) => ({
      from: 'Dirimu sendiri',
      title: 'Janji menit bermain dilanggar',
      body: `Saat tanda tangan kamu dijanjikan peran ${c.player.contract?.role ?? ''}, tapi belakangan kamu jarang dimainkan. Apa yang mau kamu lakukan?`,
      eventId: 'promise_broken',
      choices: [
        { label: 'Protes ke manajer', hint: 'Bisa berhasil, bisa bikin suasana tegang' },
        { label: 'Minta dipinjamkan', hint: 'Cari menit bermain di klub lain' },
        { label: 'Minta dijual', hint: 'Klub lain lebih mudah menawar' },
        { label: 'Diam saja', hint: 'Stres naik' },
      ],
    }),
    resolve: (c, choice) => {
      if (choice === 0) {
        if (c.rng.chance(0.5)) {
          c.career.cooldowns.promise_bonus = c.career.week;
          addManager(c.career, -4);
          return 'Manajer mengakui kesalahannya dan berjanji memberimu kesempatan beberapa minggu ke depan.';
        }
        c.career.stress = clamp(c.career.stress + 6, 0, 100);
        addManager(c.career, -12);
        return 'Manajer tidak suka diprotes. Suasana jadi tegang.';
      }
      if (choice === 1) {
        c.career.wantsLoan = true;
        return 'Klub akan mencarikan pinjaman saat bursa transfer buka.';
      }
      if (choice === 2) {
        c.career.listed = true;
        return 'Kamu masuk daftar jual. Klub lain lebih mudah mengajukan tawaran.';
      }
      c.career.stress = clamp(c.career.stress + 5, 0, 100);
      return 'Kamu memendam kekecewaanmu.';
    },
  },
};

export const isTransferEvent = (m: Message) => !!m.eventId && m.eventId in TRANSFER_EVENTS;
