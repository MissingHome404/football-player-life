# Football Player Life

Game karier pemain sepak bola di browser: gaya Football Manager (atribut 1-20, transfer, relasi) dicampur BitLife (keputusan hidup, uang, stres).

## Status

**Tahap 2: dunia game.** Sudah ada:

- 26 liga divisi 1 (top 15 Eropa, top 10 Asia, Indonesia) dengan 422 klub fiktif yang mereferensikan klub asli
- Generator nama per negara (44 negara asal pemain)
- Generator pemain: atribut FM 1-20, CA/PA 1-200, personality, hidden attributes, posisi, kaki, tinggi badan
- Skuad 25 pemain senior + 12 pemain U19 per klub, manajer, kontrak, gaji
- Seed: seed yang sama selalu menghasilkan dunia yang sama
- Halaman untuk menjelajah liga, klub, dan profil pemain (dengan "Mode developer" untuk melihat angka tersembunyi)

Belum ada: pembuatan karakter, save/load, kalender mingguan, match engine.

## Menjalankan di komputer sendiri

Butuh [Node.js](https://nodejs.org) versi 20 ke atas.

```bash
npm install
npm run dev      # buka http://localhost:5173
npm test         # jalankan tes
npm run stats    # ringkasan keseimbangan dunia (kekuatan liga, gaji, potensi)
```

## Struktur kode

```
src/game/data/      data statis: atribut, negara, liga + klub, kumpulan nama
src/game/gen/       generator: nama, pemain, personality, dunia
src/game/rng.ts     angka acak ber-seed
src/game/worker.ts  generate dunia di Web Worker
src/ui/             tampilan (React)
```

Dokumen desain dan skema data ada di Claude Docs proyek.
