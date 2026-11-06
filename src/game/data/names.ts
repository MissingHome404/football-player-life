// Kumpulan nama per gaya negara. Dipisah spasi supaya ringkas.
// Nama yang mengandung spasi ditulis dengan underscore (_), nanti diganti spasi.
// mono = peluang pemain hanya punya satu nama (umum di Indonesia dan Brasil).
//
// Semua nama di sini nama umum, bukan nama pemain bintang asli: nama belakang khas pemain
// timnas (mis. Mbappé, Haaland, Modrić) dan nama depan yang langsung menunjuk satu orang
// (mis. Kylian, Romelu, Heung-min) sengaja tidak dipakai. Nama asli hanya datang dari file
// nama milik pemain sendiri (lihat sim/rename.ts).

export interface NamePool {
  first: string[];
  last: string[];
  mono?: number;
}

const p = (first: string, last: string, mono = 0): NamePool => ({
  first: first.trim().split(/\s+/).map((s) => s.replace(/_/g, ' ')),
  last: last.trim().split(/\s+/).map((s) => s.replace(/_/g, ' ')),
  mono,
});

export const NAME_POOLS: Record<string, NamePool> = {
  english: p(
    `Harry Jack Oliver George Charlie James Thomas William Joe Callum Lewis Kyle Jordan Ryan
     Ben Sam Luke Mason Jacob Alfie Archie Harvey Reece Kieran Connor Liam Dan Tom Josh Ethan
     Freddie Jamie Marcus Jude Cole Declan Morgan Tyler Ollie Max Rhys Elliot Adam Owen Leo`,
    `Smith Jones Taylor Brown Williams Wilson Johnson Davies Robinson Wright Thompson Evans
     Walker White Roberts Green Hall Wood Jackson Clarke Hughes Edwards Turner Harris Cooper
     King Ward Morris Baker Bennett Shaw Mills Cole Barnes Palmer Walsh Gallagher Henderson
     Phillips Lloyd Price Marshall Ellis Fletcher Webb Hunt Holmes Grant Knight Spencer Reid
     Chapman Mason Pearson Bailey Russell Atkinson Dixon Hayes Cox Stevens Parker Lawrence`,
  ),
  australian: p(
    `Jack Riley Mitchell Jordan Lachlan Cameron Brandon Connor Nathan Harry Liam Josh Kye
     Aiden Ryan Jamie Tom Craig Ben Callum Jayden Noah Lewis Marco Tim Adam Daniel Luke`,
    `Smith Brown Wilson Taylor Anderson Thomas Walker White Martin Ryan Campbell Stewart
     Robertson Murray Kennedy Harrison Hughes Russell Lawson Price Ross Fraser Watson
     Morrison Gibson Ellis Hunter Grant Devlin O'Neill Kelly Murphy Jones King Hall Wright
     Clarke Bennett`,
  ),
  american: p(
    `Tyler Christian Weston Josh Tim Matt Chris Jordan Brandon Zack Paxton Ricardo Ethan Logan
     Dylan Austin Nathan Aaron Gianluca Malik Caleb Cade Diego Johnny Owen Luca Hunter`,
    `Carter Wright Johnson Miller Davis Brown Wilson Clark Lewis Rogers Bell Murphy Hayes
     Moore Taylor Anderson Thomas Jackson Martin Lee Thompson Harris Walker Young Allen King
     Hill Scott Green Baker Nelson Mitchell Campbell Roberts Phillips Evans Collins Stewart`,
  ),
  italian: p(
    `Alessandro Lorenzo Matteo Andrea Francesco Marco Luca Davide Federico Giorgio Nicolò
     Riccardo Simone Giacomo Ciro Leonardo Mattia Pietro Sandro Manuel Emanuele Gabriele
     Alberto Cristiano Samuele Tommaso Filippo Domenico Gianluca Stefano Daniele Michele`,
    `Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti
     De_Luca Costa Giordano Mancini Rizzo Lombardi Moretti Fontana Santoro Marini Rinaldi
     Caruso Ferrara Galli Martini Leone Longo Gentile Martinelli Vitale Lombardo Serra
     Coppola De_Santis D'Angelo Marchetti Parisi Villa Ferraro Fabbri Bianco Pellegrini`,
  ),
  spanish: p(
    `Alejandro Pablo Sergio David Daniel Javier Carlos Álvaro Marcos Iker Pedro Rodrigo Mikel
     Dani Andrés Ignacio Nico Víctor Unai Aitor Jesús Raúl Fabián Jaime Jordi Jon Pau Íñigo
     Mario Adrián Rubén Diego Hugo Manuel Joan Óscar Borja Gonzalo Martín`,
    `García Rodríguez González Fernández López Martínez Sánchez Pérez Gómez Martín Jiménez
     Ruiz Hernández Díaz Moreno Muñoz Álvarez Romero Alonso Gutiérrez Navarro Torres Domínguez
     Vázquez Ramos Gil Serrano Morales Ortega Delgado Castro Ortiz Rubio Marín Sanz Iglesias
     Castillo Cano Prieto Méndez Vidal Calvo Herrero Peña León Márquez Cabrera Flores Campos
     Vega Fuentes  Pino`,
  ),
  latam: p(
    `Julián Enzo Alexis Rodrigo Emiliano Nicolás Ángel Thiago Facundo Matías Federico Ronald
     Manuel Luis Juan Richard Santiago Agustín Franco Valentín Mauro Gonzalo Kevin Cristian
     Jefferson Mateo Sebastián Andrés Joaquín Ignacio Bruno Camilo Felipe Esteban`,
    `Martínez Álvarez Fernández González Rodríguez Romero Paredes Molina Acuña Valverde Núñez
     Araújo Giménez Olivera Díaz Sánchez Arias Ríos Suárez Gómez Pereira Silva Castro Herrera
     Duarte Benítez Ramírez Torres Vargas Rojas Medina Aguirre Ponce Correa Cabrera Ruiz Sosa
     Ortiz Morales  Cárdenas Mendoza Ibarra Escobar`,
  ),
  german: p(
    `Lukas Leon Jonas Florian Kai Joshua Thomas Manuel Niklas Antonio Robert Julian Maximilian
     David Tim Felix Jan Pascal Timo Nico Kevin Benjamin Deniz Karim Chris Robin Lennart Jannik
     Moritz Tom Fabian Erik Paul Stefan Philipp Simon Johannes Lars Sebastian Dominik`,
    `Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Koch Richter
     Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange
     Schmitt Werner Krause Meier Lehmann Schmid Schulze Maier Köhler Herrmann König Walter
     Mayer Huber Kaiser Fuchs Peters Lang Scholz Möller Weiß Jung Hahn Vogel Friedrich Keller
     Günther Frank Berger Baumann Groß Brandt Winkler Lorenz Ludwig Böhm`,
  ),
  french: p(
    `Antoine Olivier Hugo Ousmane Aurélien Théo Jules William Ibrahima Mike Bradley Michael
     Rayan Lucas Adrien Matteo Marcus Christopher Benjamin Maxence Mathys Wesley Malo
     Jean-Philippe Youssouf Nicolas Thomas Pierre Louis Julien Romain Mathieu Alexandre Kévin
     Florian Quentin Baptiste Enzo Clément`,
    `Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent
     Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Mercier Blanc Guérin Boyer
     Garnier Chevalier François Legrand Gauthier Perrin Clément Morin Henry Roussel Mathieu
     Masson Marchand Duval Denis Dumont Lemaire Noël Dufour Meunier Brun Blanchard Giraud Joly
     Rivière Brunet Gaillard Barbier Arnaud Traoré Diallo Koné  Sissoko Camara`,
  ),
  belgian: p(
    `Kevin Thibault Leandro Jérémy Amadou Arthur Charles Johan Thomas Timothy Axel Yannick Wout
     Maxim Koen Jan Toby Hans Arne Senne Mile Pieter Bram Jens Lucas Ruben Simon Robbe Jarne`,
    `Peeters Janssens Maes Jacobs Mertens Willems Claes Goossens Wouters De_Smet Dubois
     Lambert Dupont Martens Lemaire Vermeulen Hermans Wuyts Michiels Van_Damme Aerts Coppens
     Pauwels Smets Bogaerts Desmet Lauwers Leclercq Renard Simon Hendrickx Verstraete Cools
     Segers Vos Declercq Van_Acker Claessens Dumont`,
  ),
  portuguese: p(
    `Cristiano Bruno Bernardo João Rúben Diogo Rafael Gonçalo Pedro Nuno Francisco António
     Tiago Rui André Renato Matheus Otávio Ricardo Fábio Samuel Tomás Gil Hugo Miguel Duarte
     Martim Rodrigo José Luís Carlos Paulo Daniel Vasco Afonso`,
    `Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Jesus Sousa Fernandes
     Gonçalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira
     Correia Mendes Nunes Soares Vieira Monteiro Cardoso Rocha Neves Leão Neto Pires Batista
     Freitas Barbosa Coelho Matos Fonseca Antunes Tavares Reis Morais Campos Azevedo Machado
     Lourenço Guerreiro Vaz`,
  ),
  brazilian: p(
    `Vinícius Raphael Gabriel Lucas Bruno Éder Felipe Leandro Rodrigo Fernando Marcelo Diego
     Caio Vitor Renan Murilo Guilherme Eduardo Matheus Thiago Douglas   João
     Pedro Igor André  Luiz Henrique Wesley Kaio Arthur Gustavo Rafael Paulo Leonardo
     Otávio Breno Cauã Davi`,
    `Silva Santos Oliveira Souza Lima Pereira Ferreira Costa Rodrigues Almeida Nascimento
     Araújo Carvalho Gomes Martins Ribeiro Barbosa Rocha Dias Moreira Cardoso Teixeira Mendes
     Júnior Guimarães Magalhães Cunha Freitas Pinto Correia Vieira Soares Monteiro Batista
     Moura Campos Nunes Fonseca Andrade Azevedo Rezende Prado`,
    0.18,
  ),
  dutch: p(
    `Matthijs Nathan Wout Stefan Teun Ryan Bart Justin Joey Brian Kenneth Sven Jesper Thijs
     Bas Ruben Lars Daan Sem Jens Pieter Jeroen Dennis Niels Rick Tim Mark Robin Koen Wesley
     Kevin Max Luuk Bram Milan Thomas`,
    `De_Jong Van_Dijk Jansen De_Vries Van_den_Berg Bakker Visser Smit Meijer Mulder De_Boer
     Bos Vos Peters Hendriks Dekker Brouwer Dijkstra Kok Vermeer Van_Leeuwen Van_der_Meer
     Willems Hoekstra Prins Huisman Kuipers Van_Wijk Maas Schouten Jacobs Bosch Koster Postma
     Verhoeven Timmermans Groen Van_Beek Sanders De_Graaf Van_der_Linden`,
  ),
  turkish: p(
    `Arda Hakan Kerem Ferdi Orkun Merih Kaan Barış Cengiz Abdülkadir Mert Uğurcan Salih Zeki
     İsmail Kenan Yusuf Semih İrfan Can Oğuz Emre Burak Ozan Okay Altay Eren Mehmet Ahmet
     Mustafa Berkan Enes Cenk Umut`,
    `Güler Yılmaz Çakır Özcan Çelik Yıldız Kılıç Yüksek Aydın Şahin Demir Kaya Doğan Arslan
     Koç Kurt Özdemir Polat Erdoğan Tosun Özkan Aksoy Korkmaz Öztürk Aslan Yıldırım Kaplan
     Çetin Şimşek Erdem Ünal Güneş Bulut Keskin Taş Avcı Bozkurt Karaca Uçar`,
  ),
  czech: p(
    `Tomáš Patrik Adam Vladimír Lukáš Jan Ladislav David Václav Antonín Michal Jakub Ondřej
     Martin Pavel Matěj Jiří Petr Filip Robin Alex Vojtěch Daniel Josef Marek`,
    `Novák Svoboda Novotný Dvořák Černý Procházka Kučera Veselý Horák Němec Krejčí Kovář
     Zima Pokorný Marek Pospíšil Hájek Jelínek Král Beneš Fiala Sedláček Doležal Zeman
     Kolář Navrátil Čermák Urban Vaněk Blažek Kříž Kopecký Bartoš Vlček Polák Musil Šimek
     Konečný Malý Holub Štěpánek`,
  ),
  greek: p(
    `Giorgos Konstantinos Dimitris Nikos Vangelis Kostas Christos Anastasios Fotis Petros
     Manolis Tasos Sotiris Thanasis Lazaros Giannis Pantelis Odysseas Andreas Stefanos
     Michalis Panagiotis Vasilis Alexandros Ilias Kyriakos Stavros`,
    `Papadopoulos Papanikolaou Georgiou Nikolaidis Konstantinou Karagiannis Vlachos Oikonomou
     Dimitriou Makris Antoniou Christodoulou Ioannou Alexiou Papadakis Georgiadis Vasileiou
     Pappas Angelopoulos Nikolaou Athanasiou Panagiotou Economou Michailidis Theodorou
     Stavrou Kostopoulos Petridis Lambrou Spyropoulos Anagnostou Kontos Sideris`,
  ),
  cypriot: p(
    `Andreas Giorgos Konstantinos Christos Nikolas Marios Ioannis Panagiotis Michalis Kyriakos
     Charalambos Loizos Stelios Savvas Pieros Fotis Antonis Grigoris Demetris`,
    `Georgiou Charalambous Constantinou Ioannou Christodoulou Kyriakou Panayiotou Michael
     Nicolaou Demetriou Antoniou Savva Loizou Hadjigeorgiou Sotiriou Andreou Michaelides
     Christofi Georgiades Neophytou Stylianou Kyprianou Pavlou Petrou Charalambides
     Yiannakou Philippou Evangelou Zachariou Stavrinou`,
  ),
  polish: p(
    `Robert Piotr Wojciech Jakub Kamil Łukasz Krzysztof Arkadiusz Jan Mateusz Przemysław
     Bartosz Sebastian Karol Paweł Tomasz Michał Kacper Adam Maciej Dominik Marcin Szymon
     Filip Oskar Bartłomiej`,
    `    Kamiński Nowak Kowalski Wiśniewski Wójcik
     Kowalczyk Zając Mazur Krawczyk Kaczmarek Grabowski Pawłowski Michalski Król Wieczorek
     Woźniak Kozłowski Jankowski Wojciechowski Kwiatkowski Piotrowski Majewski Olszewski
     Jaworski Malinowski Dąbrowski Stępień Górski Rutkowski Sikora Baran Duda Szewczyk
     Tomaszewski`,
  ),
  danish: p(
    `Christian Kasper Rasmus Joachim Andreas Jonas Mikkel Thomas Simon Jannik Victor Morten
     Mathias Gustav Mads Oliver Frederik Magnus Emil Jesper Anders Lucas Albert Nikolaj`,
    `Eriksen Andersen Christensen   Kristensen Poulsen  Olsen 
     Jensen Nielsen Hansen Pedersen Larsen Sørensen Rasmussen Jørgensen Petersen Madsen
     Kristiansen Mortensen  Thomsen Christiansen Johansen Møller Mikkelsen Knudsen
     Frederiksen Laursen Henriksen Lund Holm Schmidt Clausen Simonsen Svendsen Andreasen
     Jakobsen`,
  ),
  norwegian: p(
    `Martin Alexander Sander Kristoffer Fredrik Leo Julian Oscar Ørjan Morten Jørgen Patrick
     Marcus Aron Håkon Andreas Ola Jens Petter Emil Henrik Sondre Eirik Magnus Sindre Tobias`,
    ` Hauge Berg Hansen Johansen Olsen Larsen Andersen Pedersen Nilsen Kristiansen Jensen
     Karlsen Johnsen Pettersen Eriksen  Halvorsen Jakobsen Andreassen Moen Solberg
     Haugen Bakken Dahl Lie Lund Strand Martinsen Ruud Eide Iversen Kristoffersen Knutsen
     Sæther Holm Mathisen`,
  ),
  swedish: p(
    `Alexander Viktor Emil Jesper Victor Isak Anthony Hugo Gustaf Robin Ludwig Mattias Jens
     Samuel Lucas Elliot Albin Oscar Filip Erik Johan Axel Oliver William Leo`,
    `Forsberg Olsen Nilsson Johansson Andersson Karlsson Larsson Eriksson Persson Svensson
     Gustafsson Pettersson Jonsson Lindqvist Bergström Holm Jakobsson Magnusson Olsson
     Lindberg Lindström Axelsson Bengtsson Jönsson Lundberg Mattsson Berglund Sandberg Hansson
     Fredriksson Lundgren Henriksson Sjöberg Wallin Engström Danielsson`,
  ),
  balkan: p(
    `Luka Ivan Mateo Josip Andrej Dušan Aleksandar Sergej Nemanja Strahinja Filip Dejan Lovro
     Martin Mario Nikola Marko Stefan Milan Veljko Mihailo Petar Ante Domagoj Bojan Goran`,
    `Kovačić Mitrović Kostić Pavlović Lukić Živković Ilić Jović Babić Petrović Nikolić
     Marković Đorđević Stojanović Jovanović Horvat Kovač Vuković Knežević Popović Kovačević
     Radić Marić Šarić Perić Jurić  Vidović Tomić Božić Lovrić Grgić Pavić Novak
     Blažević Filipović Simić Todorović Ristić`,
  ),
  gulf: p(
    `Salem Mohammed Abdullah Fahad Saud Yasser Firas Sultan Nawaf Hassan Ali Saleh Abdulrahman
     Khalid Turki Faisal Ayman Hamad Musab Ahmed Omar Majed Rakan Ziyad Bassam Akram Tarek
     Mohannad Hatem Abdulaziz Nasser Mansour Rashid Hamdan Khalfan`,
    `Al-Dawsari Al-Shahrani Al-Faraj Al-Ghannam Al-Amri Al-Malki Al-Hamdan Al-Shehri Al-Harbi
     Al-Mansoori Al-Hammadi Al-Kaabi Al-Haddad Al-Dhaheri Al-Nuaimi Al-Ghassani Ali Hassan
     Abdulsalam Al-Rawi Hatem Al-Yazidi Al-Otaibi Al-Qahtani Al-Zahrani Al-Ghamdi Al-Mutairi
     Al-Subaie Al-Anazi Al-Shamrani Al-Marri Al-Suwaidi Al-Hashmi`,
  ),
  iranian: p(
    `Mehdi Alireza Sardar Saman Ehsan Ali Milad Mohammad Hossein Morteza Ramin Majid Saeid
     Omid Shoja Amir Reza Payam Hamed Karim Arash Vahid Kaveh Siavash Farshad Masoud`,
    `Mohammadi Hosseini Karimi Rezaei Ahmadi Hashemi Rahimi Jafari Sadeghi Mousavi Ghasemi
     Asadi Kazemi Farahani Akbari Moradi Rostami Shariati Najafi Bagheri Heidari Azizi Soltani
     Ebrahimi Zamani Abbasi Rahmani Yousefi Noori Tehrani Shirazi`,
  ),
  japanese: p(
    `Wataru Daichi Takumi Hiroki Junya Yuki Shuto Takehiro Keito Koki Ao Kodai Reo Yuta Kento
     Sota Haruto Ren Yuma Kaito Shion Taichi Kazuki Yuto Riku Sho Naoki Tomoya Keisuke Shinji
     Yasuto Hiroshi Kenta Shota Daiki Ryota Yusuke Takuya Kohei Tatsuya Masato`,
    `Kubo Endo Ito Ueda Maeda Suzuki Taniguchi Nakamura Morita Tanaka Watanabe Takahashi
     Kobayashi Yamamoto Yamada Sasaki Yamaguchi Matsumoto Inoue Kimura Hayashi Shimizu
     Yamazaki Mori Ikeda Hashimoto Abe Ishikawa Ogawa Okada Goto Fujita Sato Kato Yoshida
     Nakajima Ishii Kondo Saito Murakami`,
  ),
  korean: p(
    `Min-jun Seo-jun Do-yun Ye-jun Si-woo Ha-jun Ju-won Ji-ho Ji-hoon Jun-seo Jun-woo
     Hyun-woo Gun-woo Woo-jin Seon-woo Seo-jin Hyun-jun Yeon-woo Yu-jun Jung-woo Seung-hyun
     Si-hoon Jin-woo Ji-hwan Seung-min Jae-won Dong-hyun Joon-ho Sung-min Tae-yang Min-ho
     Jae-hyun Sang-woo Kyung-ho`,
    `Son Lee Kim Hwang Park Jung Cho Paik Seol Oh Choi Kang Yoon Jang Lim Han Shin Seo Kwon
     Ahn Song Jeon Hong Yoo Ko Moon Yang Bae Baek Heo Nam Noh`,
  ),
  thai: p(
    `Sarach Kritsada Suphan Weerathep Pansa Nicholas Patiwat Peeradon Jonathan Saringkan Kawin
     Supachai Poramet Channarong Ben Seksan Apirak Phitiwat Somchai Anucha Nattapong Thanawat
     Kittipong Wichai Pattara Sakda Jakkapan Narongrit`,
    `Kongsri Sripan Wongsa Saengsuk Boonmak Chaiyaphum Kaewsuk Ruangsri Srisuk Sukprasert
     Chaiyasit Thongchai Boonsong Rattanakul Kongkaew Sangthong Phromma Somboon Charoenchai
     Intharasuk Kaewmanee Wongsawat Pongsri Suwannarat Chaimongkol Thanasan Panya`,
  ),
  uzbek: p(
    `Eldor Abbosbek Jaloliddin Otabek Oston Khojimat Abdukodir Rustamjon Jamshid Utkir
     Husniddin Khusayin Azizbek Sherzod Odiljon Umarali Dostonbek Farrukh Islom Bobur Akmal
     Sardor`,
    `Yusupov Tursunov Abdullaev Karimov Rakhimov Saidov Ergashev Nazarov Mirzaev Kholmatov
     Usmonov Rashidov Qodirov Sultanov Ismoilov Mahmudov Akhmedov Jurayev Hasanov Sobirov
     Umarov Toshmatov`,
  ),
  malay: p(
    `Arif Faisal Syafiq Hakimi Azam Matthew Shahrul Azri Haziq Nazmi Syahmi Aiman Danial Amirul
     Haqimi Irfan Shahrel Ridzuan Rahmat Aqil Harith Amir Hafiz Zulkifli Firdaus Nazrin
     Shahril Izzat Afiq Luqman`,
    `Rasid Abdul_Halim Halim Rashid Ahmad Hamid Azmi Rahman Mohamad Ismail Ibrahim Hassan
     Yusof Othman Abdullah Zainal Kamal Mahmud Saad Kassim Davies Tan Hussin Aziz Salleh Daud
     Nor Talib`,
  ),
  indonesian: p(
    `Rizky Pratama Rachmat Ricky Ramadhan Dimas Evan Rafael Sandy Kevin Nathan Bagas Bagus
     Muhammad Ahmad Irfan Stefano Rizki Rendy Febri Adam Gilang Yandi Victor Kadek Komang Made
     Sani Andi Fajar Ilham Arif Agus Budi Dedi Eko Hendra Joko Yoga Wahyu Teguh Aditya Rio
     Reza Galih Bayu Doni Hari Iqbal Fikri Rangga Rafi Dafa Fadil Haikal Farhan Naufal Rehan
     Putu Wayan Nyoman Ketut Yohanes Markus Petrus Yosua`,
    `Maulana Adi Wahyu Hidayat Kurniawan Saputra Setiawan Pratama Nugroho Santoso Wibowo
     Firmansyah Hutapea Simanjuntak Sitorus Siregar Nainggolan Lubis Tambunan Tampubolon
     Manurung Ramadhan Ardiansyah Gunawan Sulistyo Utomo Purnomo Rahardjo Sihombing Imanuel
     Tuasalamony Sudarsono Wijaya Hartono Syahputra Hamdani Susanto Prasetyo Hakim Kusuma
     Permana Saragih Pane Harahap Nasution Daulay Tanjung Rahman Hasibuan Pattinama
     Latuconsina Mahulette Rumbiak Wenda Yoku Tebai Sembiring Ginting Tarigan Purba Effendi
     Suryadi Halim Lesmana`,
    0.3,
  ),
  westafrican: p(
    `Victor Samuel Alex Joe Calvin Moses Ola Kelechi Frank Taiwo William Thomas Mohammed
     Jordan Antoine Daniel Joseph Abdul Osman Ibrahim Emmanuel Chinedu Tunde Kwame Kofi Yaw`,
    `Okoye Ajayi Adeyemi Okafor Eze Nwosu Williams Mensah Owusu Boateng Asante Ofori Simon
     Okonkwo Adebayo Balogun Ogunleye Nwachukwu Obi Chukwu Uche Afolabi Bello Ibrahim Musa
     Appiah Osei Agyeman Darko Amoah Addo Quaye Badu Yeboah Acheampong Ansah`,
  ),
  francoafrican: p(
    `Idrissa Édouard Nicolas Pape Habib Lamine Moussa Sébastien Franck Simon Wilfried Serge
     Evan Ibrahim Bryan Karl Vincent Carlos Christian Jean-Charles Mamadou Cheikh Ousmane
     Aliou Boubacar Arouna`,
    `Mané Koulibaly Gueye Sarr Mendy Ndiaye Diallo Diatta Camara Fofana Sangaré Traoré
     Coulibaly Koné Touré Cissé Diop Faye Ba Sow Kouassi Kouamé Yao N'Guessan Konan Bamba
     Ouattara Doumbia Mbarga Ngono Essomba Fotso Kamga Nana Abena`,
  ),
  maghreb: p(
    `Hakim Youssef Bilal Amine Brahim Ilias Ismaël Saïd Rayan Ramy Islam Mohamed Yacine Karim
     Mehdi Walid Nabil Omar Hamza Anis Sofiane Adel Zakaria`,
    `El_Amrani Benali Slimani Bouzid Haddad Belkacem Mansouri Cherif Hamidi Boukhari Bensaid
     Rahmani El_Idrissi Alaoui Bennani Tazi Berrada Lahlou El_Fassi Ouali Saadi Meziane Kaci
     Toumi Khelifi Amrani Bouzidi Hamdi Larbi Chaouch`,
  ),
};
