# Football Player Life

Game karier pemain sepak bola di browser: gaya Football Manager (atribut 1-20, transfer, relasi) dicampur BitLife (keputusan hidup, uang, stres).

## Status

Sudah ada:

- **Dunia game:** 26 liga divisi 1 (top 15 Eropa, top 10 Asia, Indonesia), 422 klub fiktif yang mereferensikan klub asli, skuad senior + U19, manajer, kontrak, gaji. Seed yang sama selalu menghasilkan dunia yang sama.
- **Pemain:** atribut FM 1-20, CA/PA 1-200, personality, hidden attributes, posisi, peran (Poacher, False Nine, dll) dengan highlight atribut.
- **Pembuatan karakter:** pilih negara, posisi, peran, nama; sisanya RNG dengan re-roll.
- **Save/load:** simpan otomatis di browser, ekspor/impor file `.fplsave`. Save versi lama tetap bisa dibuka.
- **Minggu demi minggu:** rencana latihan (fokus, intensitas), kegiatan di luar latihan, pelatih pribadi, uang (uang saku, gaji, pajak, biaya hidup), stres, kebugaran, cedera, dan inbox event ala BitLife (trial scout, dipanggil tim utama, pesta, keluarga, sponsor, dll).

Belum ada: transfer dan negosiasi kontrak, simulasi liga, match engine 2D.

## Menjalankan di komputer sendiri

Butuh [Node.js](https://nodejs.org) versi 20 ke atas.

```bash
npm install
npm run dev      # buka http://localhost:5173
npm test         # jalankan tes
npm run stats    # ringkasan keseimbangan dunia (kekuatan liga, gaji, potensi)
npx tsx scripts/career.ts 4 12   # simulasi karier 4 tahun untuk 12 karakter
```

## Struktur kode

```
src/game/data/      data statis: atribut, negara, liga + klub, kumpulan nama
src/game/gen/       generator: nama, pemain, personality, dunia, karakter
src/game/sim/       simulasi mingguan: latihan, uang, stres, event inbox
src/game/save/      format file save, simpan di browser (IndexedDB)
src/game/rng.ts     angka acak ber-seed
src/game/worker.ts  generate dunia di Web Worker
src/ui/             tampilan (React)
```

Dokumen desain dan skema data ada di Claude Docs proyek.
