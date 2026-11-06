# Football Player Life

Game karier pemain sepak bola di browser: gaya Football Manager (atribut 1-20, transfer, relasi) dicampur BitLife (keputusan hidup, uang, stres).

## Status

Sudah ada:

- **Dunia game:** 26 liga divisi 1 (top 15 Eropa, top 10 Asia, Indonesia), 422 klub fiktif yang mereferensikan klub asli, skuad senior + U19, manajer, kontrak, gaji. Seed yang sama selalu menghasilkan dunia yang sama.
- **Pemain:** atribut FM 1-20, CA/PA 1-200, personality, hidden attributes, posisi, peran (Poacher, False Nine, dll) dengan highlight atribut.
- **Pembuatan karakter:** pilih negara, posisi, peran, nama; sisanya RNG dengan re-roll.
- **Save/load:** simpan otomatis di browser, ekspor/impor file `.fplsave`. Save versi lama tetap bisa dibuka.
- **Minggu demi minggu:** rencana latihan (fokus, intensitas), kegiatan di luar latihan, pelatih pribadi, uang (uang saku, gaji, pajak, biaya hidup), stres, kebugaran, cedera, dan inbox event ala BitLife (trial scout, dipanggil tim utama, pesta, keluarga, sponsor, dll).

- **Musim dan pertandingan:** jadwal kandang-tandang dan klasemen untuk 26 liga, hasil disimulasikan tiap minggu. Pemain kita dipilih pelatih (inti, cadangan, tidak masuk skuad) dan dapat rating, gol, assist, clean sheet. Pemain U19 main di liga U19, pemain tanpa klub main di tim amatir. Akhir musim: juara dicatat, pemain AI berkembang, menua, pensiun, pindah ke klub lebih kuat, dan pemain muda baru masuk.

- **Transfer dan kontrak:** bursa transfer (musim panas dan Januari), tawaran dari klub lain sesuai level dan reputasimu, bebas transfer, pinjaman, perpanjangan kontrak, negosiasi gaji atau peran, agent (lokal, regional, super) dengan komisi, minta dipinjamkan atau dijual, janji menit main yang bisa dilanggar, nilai pasar, dan riwayat klub.

- **Relasi:** manajer (menentukan menit main, bisa dipecat dan diganti), rekan setim (sahabat, mentor, rival posisi; sahabat yang pindah klub bisa mengajakmu ikut), fans per klub (bekas klub menyambut atau mencemooh), media (wawancara setelah laga, selebrasi gol), keluarga, dan pasangan (pacaran, tunangan, menikah).

- **Kehidupan dan belanja:** tempat tinggal (rumah orang tua sampai rumah mewah), sepatu, perlengkapan, aksesori, kendaraan, staf pribadi (ahli gizi, fisio), liburan, bantu orang tua, donasi, dan tabungan berbunga. Setiap barang punya efek (atribut, kebugaran, stres, media), dan turun gaya hidup bikin stres.
- **Model 3D di beranda:** pemain low-poly (Three.js) dengan jersey klub, sepatu, aksesori, kendaraan, dan suasana rumah sesuai barang yang dibeli.

- **Timnas:** pemain terbaik tiap negara dipanggil di jeda internasional (Maret, Juni, September, Oktober, November), termasuk Timnas U-20 untuk pemain muda. Laga kualifikasi mengisi klasemen per konfederasi, dan tiap 2 tahun ada turnamen: Piala Dunia (32 tim, 2030, 2034, ...) dan Euro (16 tim) atau Piala Asia (8 tim) di tahun di antaranya, lengkap dengan fase grup, babak gugur, dan adu penalti. Laga timnas yang kamu mainkan memakai match engine 2D dan bisa ditonton. Caps, gol, dan riwayat turnamen tampil di panel Timnas.
- **Match engine 2D:** laga timmu dimainkan 22 pemain yang bergerak dan memilih umpan, dribel, atau tembakan dari atribut mereka (ala FM), termasuk penjagaan, lari menembus, umpan silang, sepak pojok, tendangan bebas, dan penalti. Engine v2 memakai fisika bola 3D sederhana (tinggi bola, pantulan, gelinding): gol hanya sah kalau bola masuk di antara tiang dan di bawah mistar lalu tertahan jaring, dan kiper menangkap atau menepis bola di posisinya. Ada offside dan garis pertahanan yang naik-turun bersama, bola yang keluar lapangan jadi lemparan ke dalam, tendangan gawang, atau sepak pojok, dan gerak tiap pemain dipengaruhi kecepatan, akselerasi, stamina, antisipasi, positioning, off the ball, dan work rate. Engine v4 menambah gaya main tiap klub (Possession, Gegenpress, Counter, Direct, Wing Play, Defensive; timnas punya gaya tetap) yang mengubah cara tim mengumpan, menekan, dan menjaga garis, keunggulan kandang (tidak berlaku di turnamen), performa harian yang naik-turun, pelanggaran dengan kartu kuning dan merah (pemain yang diusir keluar dan timnya main dengan 10 orang), umpan silang ke ruang di kotak, bek tengah yang naik saat sepak pojok dan duel udara, tendangan bebas dari sayap yang diumpan ke kotak, dan bola yang dibuang bek ke luar garis gawang jadi sepak pojok. Engine v5 membuat atribut lebih terasa: acceleration menang di beberapa meter pertama tapi pace menyusul di lari panjang, kiper dengan positioning dan antisipasi tinggi hampir selalu di titik yang tepat (kiper yang salah posisi lebih mudah dibobol), winger dengan dribbling, flair, bravery, dan technique bagus lebih sering mencoba melewati lawan, gelandang dengan vision, passing, dan decisions bagus lebih sering memberi umpan terobosan ke ruang di belakang garis pertahanan, dan tim membangun serangan dari belakang lewat bek dan gelandang. Hasilnya langsung masuk klasemen dan statistikmu. Tonton di layar 2D: susunan pemain, 90 menit (sekitar 2,5 menit per babak), kecepatan 1× sampai 8×, lewati ke akhir, ringkasan rating dan statistik, dan tonton ulang dari kartu laga terakhir. Laga tim lain tetap disimulasikan cepat.

- **Prestasi:** statistik musim dicatat untuk semua pemain di dunia game, jadi tiap akhir musim liga ada Pemain Terbaik, Top Skor, dan Pemain Muda Terbaik, dan tiap 1 Desember ada Bintang Dunia dan Bintang Muda Dunia. Rekor (gol semusim, pencetak gol termuda, gol untuk klub, gol dan caps timnas) dimulai dari legenda fiktif dan bisa dipecahkan pemain AI maupun kamu. Juara liga dan turnamen timnas masuk daftar trofi.
- **Lencana:** 12 lencana (mis. Penembak Jarak Jauh, Raja Bola Mati, Pelari Kilat, Kapten) terbuka kalau syarat atribut dan pencapaian terpenuhi. Tiap lencana memberi bonus kecil di match engine dan menaikkan nilai pasar 5%. Progres tiap syarat terlihat di panel Prestasi.

- **Pensiun:** pensiun kapan saja lewat panel Kontrak & transfer, atau dipaksa cedera parah di usia 32+ dan otomatis di usia 41. Mulai umur 31 fisik pelan-pelan menurun. Setelah pensiun ada ringkasan karier, skor legacy dengan rinciannya (penampilan, gol, rating, trofi, penghargaan, timnas, rekor, lencana, puncak CA, reputasi), dan peringkat di **Hall of Fame** yang menyimpan semua karier yang sudah pensiun di browser ini.
- **Ekspor ke Football Manager:** unduh statistik karier sebagai CSV (Excel): riwayat per musim, total, klub, trofi, penghargaan, rekor, atribut akhir dengan skala 1-20 dan urutan seperti layar FM, personality, dan hidden attributes.

Belum ada: karier setelah pensiun (pundit, pelatih, anak), impor nama asli.

## Menjalankan di komputer sendiri

Butuh [Node.js](https://nodejs.org) versi 20 ke atas.

```bash
npm install
npm run dev      # buka http://localhost:5173
npm test         # jalankan tes
npm run stats    # ringkasan keseimbangan dunia (kekuatan liga, gaji, potensi)
npx tsx scripts/career.ts 4 12   # simulasi karier 4 tahun untuk 12 karakter
npx tsx scripts/seasons.ts 5     # cek dunia 5 musim: kekuatan liga, umur, statistik pemain
npx tsx scripts/transfers.ts     # simulasi karier dengan agent dan tawaran klub, cetak riwayat klub
npx tsx scripts/engine.ts 600    # kalibrasi match engine: gol, tembakan, kartu, sepak pojok, gol bola mati, pencetak gol per posisi, gaya main
```

## Struktur kode

```
src/game/data/      data statis: atribut, negara, liga + klub, kumpulan nama
src/game/gen/       generator: nama, pemain, personality, dunia, karakter
src/game/sim/       simulasi mingguan: latihan, uang, stres, event inbox, musim liga, pertandingan, match engine, transfer, relasi, kehidupan, timnas, penghargaan, lencana
src/game/save/      format file save, simpan di browser (IndexedDB)
src/game/rng.ts     angka acak ber-seed
src/game/worker.ts  generate dunia di Web Worker
src/ui/             tampilan (React)
```

Dokumen desain dan skema data ada di Claude Docs proyek.
