// Kumpulan nama per gaya negara. Dipisah spasi supaya ringkas.
// Nama yang mengandung spasi ditulis dengan underscore (_), nanti diganti spasi.
// mono = peluang pemain hanya punya satu nama (umum di Indonesia dan Brasil).

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
     Freddie Jamie Marcus Jude Cole Declan Trent Bukayo Morgan Tyler Ollie Max Rhys Elliot`,
    `Smith Jones Taylor Brown Williams Wilson Johnson Davies Robinson Wright Thompson Evans
     Walker White Roberts Green Hall Wood Jackson Clarke Hughes Edwards Turner Harris Cooper
     King Ward Morris Baker Bennett Shaw Mills Cole Barnes Palmer Kane Rice Foden Stones
     Walsh Gallagher Henderson Maguire Pickford Phillips Watkins Bowen Saka Mount Grealish`,
  ),
  australian: p(
    `Jack Riley Mitchell Jordan Lachlan Cameron Brandon Connor Nathan Harry Liam Josh Kye
     Aiden Ryan Jamie Tom Craig Mathew Ben Callum Jayden Noah Lewis Marco Tim Adam Daniel Luke`,
    `Smith Brown Wilson Taylor Anderson Thomas Walker White Martin Ryan Mooy Irvine Leckie
     Souttar Rowles Behich Duke Goodwin Boyle Metcalfe Hrustic Atkinson Burgess Grant Kuol
     McGree Baccus Devlin O'Neill Kelly Murphy Jones King Hall Wright Clarke Bennett`,
  ),
  american: p(
    `Tyler Christian Weston Gio Brenden Josh Tim Matt Chris Jordan Brandon Zack Kellyn Paxton
     Ricardo Sergiño Gianluca Haji Malik Caleb Cade Diego Antonee Miles Johnny Owen Luca`,
    `Adams McKennie Pulisic Reyna Aaronson Sargent Weah Turner Richards Ream Robinson Carter
     Wright Musah Tillman Pepi Busio Dest Scally Johnson Miller Davis Brown Wilson Clark Lewis`,
  ),
  italian: p(
    `Alessandro Lorenzo Matteo Andrea Francesco Marco Luca Davide Federico Giorgio Nicolò
     Riccardo Simone Giacomo Gianluigi Ciro Leonardo Mattia Pietro Raoul Sandro Manuel Moise
     Destiny Cristiano Samuele Tommaso Filippo Domenico Gianluca Stefano Daniele Michele`,
    `Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti
     De_Luca Costa Giordano Mancini Rizzo Lombardi Moretti Barella Bastoni Chiesa Donnarumma
     Scamacca Frattesi Pellegrini Locatelli Tonali Dimarco Retegui Calafiori Buongiorno
     Raspadori Udogie Ricci Fagioli Orsolini Zaccagni Politano Di_Lorenzo Mancini Cambiaso`,
  ),
  spanish: p(
    `Alejandro Pablo Sergio David Daniel Javier Carlos Álvaro Marcos Iker Pedro Rodrigo Mikel
     Dani Fermín Ferran Nico Lamine Unai Aitor Jesús Raúl Fabián Gavi Jordi Jon Pau Íñigo
     Mario Adrián Rubén Diego Hugo Manuel Joan Óscar Borja Gonzalo Martín`,
    `García Rodríguez González Fernández López Martínez Sánchez Pérez Gómez Martín Jiménez
     Ruiz Hernández Díaz Moreno Muñoz Álvarez Romero Alonso Gutiérrez Navarro Torres Domínguez
     Vázquez Ramos Gil Serrano Morales Ortega Delgado Castro Ortiz Rubio Marín Sanz Iglesias
     Olmo Merino Zubimendi Oyarzabal Carvajal Morata Cucurella Laporte Simón Baena Pino`,
  ),
  latam: p(
    `Lionel Julián Lautaro Enzo Alexis Rodrigo Emiliano Nicolás Ángel Thiago Facundo Matías
     Federico Darwin Ronald Manuel Giorgian Luis James Juan Jhon Davinson Yerry Richard
     Santiago Agustín Franco Valentín Mauro Gonzalo Kevin Cristian Jefferson Mateo`,
    `Martínez Álvarez Fernández González Rodríguez Mac_Allister De_Paul Romero Paredes Otamendi
     Molina Acuña Lo_Celso Garnacho Valverde Núñez Araújo Bentancur Ugarte Giménez Olivera
     Díaz Muriel Sánchez Mina Cuadrado Arias Borré Lerma Ríos Suárez Cavani Pellistri
     Gómez Pereira Silva Castro Herrera Duarte Benítez`,
  ),
  german: p(
    `Lukas Leon Jonas Florian Kai Leroy Joshua Thomas Manuel Niklas Leon Jamal Antonio Robert
     Marc-André Julian Maximilian David Tim Felix Jan Pascal Timo Nico Kevin Benjamin Aleksandar
     Deniz Karim Florian Chris Waldemar Robin Lennart Jannik Moritz Tom Fabian Erik Paul`,
    `Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Koch Richter
     Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Kimmich
     Goretzka Havertz Sané Musiala Wirtz Rüdiger Tah Raum Gnabry Füllkrug Undav Schlotterbeck
     Baumann Mittelstädt Andrich Groß Stiller Beier Nmecha Brandt Pavlović Adeyemi Kleindienst`,
  ),
  french: p(
    `Kylian Antoine Olivier Hugo Ousmane Aurélien Eduardo Théo Jules William Ibrahima Dayot
     Mike Randal Bradley Désiré Warren Michael Rayan Lucas Adrien Matteo Marcus Christopher
     Benjamin Maxence Mathys Manu Wesley Malo Jean-Philippe Youssouf Nicolas Thomas Pierre Louis`,
    `Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent
     Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Mbappé Griezmann Giroud
     Dembélé Tchouaméni Camavinga Hernandez Koundé Saliba Upamecano Konaté Maignan Kolo_Muani
     Rabiot Kanté Thuram Olise Cherki Barcola Doué Zaïre-Emery Digne Pavard Clauss Lacazette`,
  ),
  belgian: p(
    `Kevin Romelu Thibaut Youri Leandro Jérémy Amadou Arthur Lois Charles Johan Thomas Timothy
     Axel Yannick Zeno Wout Maxim Koen Dries Jan Toby Michy Hans Arne Ameen Senne Aster Mile`,
    `De_Bruyne Lukaku Courtois Tielemans Trossard Doku Onana Theate Openda De_Ketelaere Bakayoko
     Castagne Witsel Carrasco Debast Faes Vranckx De_Cuyper Vertonghen Alderweireld Mertens
     Peeters Janssens Maes Jacobs Mertens Willems Claes Goossens Wouters De_Smet Dubois Lambert
     Dupont Martens Lemaire Vermeulen Hermans`,
  ),
  portuguese: p(
    `Cristiano Bruno Bernardo João Rúben Diogo Rafael Gonçalo Pedro Nuno Vitinha Francisco
     António Tiago Rui André Renato Matheus Otávio Ricardo Fábio Samuel Tomás Geovany Gil Hugo
     Miguel Duarte Martim Rodrigo José Luís Carlos Paulo`,
    `Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Jesus Sousa Fernandes
     Gonçalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira
     Correia Mendes Nunes Soares Vieira Monteiro Cardoso Rocha Neves Leão Inácio Dalot Cancelo
     Palhinha Neto Semedo Conceição Quenda Trincão`,
  ),
  brazilian: p(
    `Vinícius Rodrygo Raphael Gabriel Lucas Bruno Éder Marquinhos Casemiro Alisson Ederson
     Richarlison Endrick Savinho Neymar Matheus Thiago Douglas Danilo Wendell João Pedro Igor
     André Gerson Estêvão Luiz Henrique Wesley Kaio Arthur Fabrício Gustavo Rafael Paulo`,
    `Silva Santos Oliveira Souza Lima Pereira Ferreira Costa Rodrigues Almeida Nascimento
     Araújo Carvalho Gomes Martins Ribeiro Barbosa Rocha Dias Moreira Cardoso Teixeira Mendes
     Júnior Paquetá Guimarães Martinelli Magalhães Militão Marçal Arana Cunha Paixão Fabinho`,
    0.18,
  ),
  dutch: p(
    `Virgil Frenkie Memphis Cody Xavi Matthijs Denzel Nathan Jurriën Tijjani Jeremie Donyell
     Wout Stefan Teun Ryan Micky Bart Justin Daley Lutsharel Joey Brian Quinten Kenneth Sven
     Jesper Thijs Bas Ruben Lars Daan Sem Jens`,
    `De_Jong Van_Dijk De_Ligt Gakpo Simons Dumfries Aké Timber Reijnders Frimpong Malen
     Weghorst De_Vrij Koopmeiners Van_de_Ven Verbruggen Bergwijn Blind Geertruida Zirkzee
     Jansen De_Vries Van_den_Berg Bakker Visser Smit Meijer Mulder De_Boer Bos Vos Peters
     Hendriks Dekker Brouwer Dijkstra Kok Vermeer Veerman Wijndal`,
  ),
  turkish: p(
    `Arda Hakan Kerem Ferdi Orkun Merih Kaan Barış Cengiz Abdülkadir Mert Uğurcan Salih Zeki
     İsmail Kenan Yusuf Semih İrfan Can Oğuz Emre Burak Ozan Okay Altay Eren Mehmet Ahmet
     Mustafa Berkan Enes Cenk Umut`,
    `Güler Çalhanoğlu Aktürkoğlu Kadıoğlu Kökçü Demiral Ayhan Yılmaz Ünder Ömür Müldür Çakır
     Özcan Çelik Kahveci Yıldız Akaydın Kılıç Bardakcı Kabak Yüksek Aydın Şahin Demir Kaya
     Doğan Arslan Koç Kurt Özdemir Polat Erdoğan Tosun Özkan Aksoy Korkmaz`,
  ),
  czech: p(
    `Tomáš Patrik Adam Vladimír Lukáš Jan Ladislav David Václav Antonín Michal Jakub Ondřej
     Martin Pavel Matěj Jiří Petr Filip Mojmír Robin Alex Vojtěch Tomáš Daniel`,
    `Novák Svoboda Novotný Dvořák Černý Procházka Kučera Veselý Horák Němec Schick Souček
     Coufal Krejčí Barák Hložek Kovář Provod Jurásek Holeš Zima Chorý Kuchta Sadílek Staněk
     Lingr Doudera Hranáč Vitík Šulc Pokorný Marek Pospíšil Hájek Jelínek Král`,
  ),
  greek: p(
    `Giorgos Konstantinos Dimitris Nikos Vangelis Kostas Christos Anastasios Fotis Petros
     Manolis Tasos Sotiris Thanasis Lazaros Giannis Pantelis Odysseas Christos Andreas
     Stefanos Michalis Panagiotis Vasilis Alexandros Ilias Kyriakos Stavros`,
    `Papadopoulos Pavlidis Bakasetas Mantalos Masouras Tzolis Mavropanos Tsimikas Vlachodimos
     Retsos Siopis Kourbelis Douvikas Karetsas Pelkas Ioannidis Giakoumakis Koulierakis
     Hatzidiakos Bakoulas Papanikolaou Georgiou Nikolaidis Konstantinou Karagiannis Vlachos
     Oikonomou Dimitriou Makris Antoniou Christodoulou Ioannou Alexiou`,
  ),
  cypriot: p(
    `Andreas Giorgos Konstantinos Christos Nikolas Marios Ioannis Panagiotis Michalis Kyriakos
     Charalambos Loizos Stelios Savvas Pieros Fotis Antonis Grigoris Demetris`,
    `Georgiou Charalambous Constantinou Ioannou Christodoulou Kyriakou Panayiotou Michael
     Nicolaou Demetriou Antoniou Savva Loizou Hadjigeorgiou Pittas Kastanos Sotiriou
     Laifis Kousoulos Panagi Artymatas Andreou Efrem Tzionis Kakoullis Papoulis Psaltis`,
  ),
  polish: p(
    `Robert Piotr Wojciech Jakub Kamil Łukasz Krzysztof Arkadiusz Jan Mateusz Przemysław
     Bartosz Nicola Sebastian Karol Paweł Tomasz Michał Kacper Adam Maciej Dominik Marcin
     Szymon Filip Oskar Bartłomiej`,
    `Lewandowski Zieliński Szczęsny Kiwior Bednarek Frankowski Świderski Piątek Milik Moder
     Skóraś Zalewski Szymański Urbański Dawidowicz Cash Kamiński Grosicki Romanczuk Nowak
     Kowalski Wiśniewski Wójcik Kowalczyk Kamiński Zając Mazur Krawczyk Kaczmarek Grabowski
     Pawłowski Michalski Król Wieczorek`,
  ),
  danish: p(
    `Christian Kasper Pierre-Emile Rasmus Joachim Andreas Jonas Mikkel Thomas Simon Jannik
     Victor Morten Mathias Gustav Mads Oliver Frederik Magnus Emil Jesper Anders Lucas Albert`,
    `Eriksen Schmeichel Højbjerg Højlund Andersen Christensen Maehle Damsgaard Delaney Kjær
     Vestergaard Kristensen Hjulmand Lindstrøm Wind Poulsen Skov Olsen Bah Nørgaard Isaksen
     Jensen Nielsen Hansen Pedersen Larsen Sørensen Rasmussen Jørgensen Petersen Madsen
     Kristiansen Mortensen Dreyer Bisseck Hermansen`,
  ),
  norwegian: p(
    `Erling Martin Alexander Sander Kristoffer Fredrik Leo Julian Oscar Ørjan Morten Antonio
     Jørgen Patrick Marcus Aron Håkon Andreas Ola Jens Petter Emil Henrik Sondre Eirik Fredrik`,
    `Haaland Ødegaard Sørloth Berge Ajer Nusa Østigård Ryerson Strand_Larsen Bobb Thorsby
     Hauge Wolfe Elyounoussi Nyland Aursnes Thorstvedt Berg Hansen Johansen Olsen Larsen
     Andersen Pedersen Nilsen Kristiansen Jensen Karlsen Johnsen Pettersen Eriksen Solbakken`,
  ),
  swedish: p(
    `Alexander Viktor Dejan Emil Jesper Victor Isak Anthony Hugo Gustaf Robin Ludwig Mattias
     Jens Samuel Lucas Yasin Elliot Albin Oscar Filip`,
    `Isak Gyökeres Kulusevski Forsberg Lindelöf Karlström Elanga Ekdal Augustinsson Olsen
     Svanberg Nilsson Johansson Andersson Karlsson Larsson Eriksson Persson Svensson Gustafsson
     Pettersson Jonsson Lindqvist Bergström Holm`,
  ),
  balkan: p(
    `Luka Ivan Mateo Josip Joško Marcelo Andrej Dušan Aleksandar Sergej Nemanja Strahinja
     Filip Dejan Lovro Martin Mario Nikola Marko Stefan Milan Veljko Mihailo Petar Ante Domagoj`,
    `Modrić Kovačić Perišić Gvardiol Brozović Kramarić Pašalić Šutalo Livaković Majer Budimir
     Vlahović Mitrović Milinković-Savić Tadić Kostić Pavlović Gudelj Lukić Živković Ilić
     Jović Babić Petrović Nikolić Marković Đorđević Stojanović Jovanović Horvat Kovač Vuković`,
  ),
  gulf: p(
    `Salem Mohammed Abdullah Fahad Saud Yasser Firas Sultan Nawaf Hassan Ali Saleh Abdulrahman
     Khalid Turki Faisal Ayman Hamad Musab Ahmed Omar Majed Rakan Ziyad Bassam Akram Almoez
     Boualem Tarek Mohannad Hatem Abdulaziz Nasser Mansour Rashid Hamdan Khalfan`,
    `Al-Dawsari Al-Shahrani Al-Faraj Al-Buraikan Al-Ghannam Al-Bulaihi Al-Owais Al-Amri
     Kanno Tambakti Al-Malki Al-Najei Al-Hamdan Al-Aqidi Al-Shehri Al-Muwallad Al-Harbi
     Al-Mansoori Al-Hammadi Al-Kaabi Al-Haddad Al-Dhaheri Al-Nuaimi Al-Ghassani
     Afif Ali Hassan Al-Haydos Khoukhi Abdulsalam Al-Rawi Boudiaf Hatem Madibo Al-Yazidi`,
  ),
  iranian: p(
    `Mehdi Alireza Sardar Saman Ehsan Ali Milad Mohammad Hossein Morteza Ramin Majid Saeid
     Omid Shoja Amir Reza Payam Hamed Karim Arash Vahid Kaveh Siavash Farshad Masoud`,
    `Taremi Jahanbakhsh Azmoun Ghoddos Hajsafi Gholizadeh Mohammadi Kanaanizadegan Pouraliganji
     Beiranvand Ezatolahi Rezaeian Khalilzadeh Nourollahi Hosseini Karimi Moharrami Ansarifard
     Rezaei Ahmadi Hashemi Rahimi Jafari Sadeghi Mousavi Ghasemi Asadi Kazemi Farahani`,
  ),
  japanese: p(
    `Takefusa Kaoru Wataru Daichi Takumi Ritsu Hiroki Junya Ayase Kyogo Daizen Ko Yuki Shuto
     Takehiro Zion Keito Koki Ao Kodai Hidemasa Reo Yuta Kento Sota Haruto Ren Yuma Kaito Shion
     Taichi Kazuki Yuto Riku Sho Naoki Tomoya Keisuke Shinji Yasuto`,
    `Kubo Mitoma Endo Kamada Minamino Doan Ito Ueda Furuhashi Maeda Machida Tomiyasu Suzuki
     Itakura Taniguchi Sugawara Nakamura Morita Hatate Hashioka Tanaka Watanabe Takahashi
     Kobayashi Yamamoto Yamada Sasaki Yamaguchi Matsumoto Inoue Kimura Hayashi Shimizu
     Yamazaki Mori Ikeda Hashimoto Abe Ishikawa Ogawa Okada Goto Fujita Sato`,
  ),
  korean: p(
    `Heung-min Kang-in Min-jae Hee-chan Ui-jo Woo-young Gue-sung In-beom Jae-sung Seung-ho
     Young-woo Yu-min Hyeon-gyu Jun-ho Tae-hwan Seol Jin-su Chang-hoon Dong-gyeong Ji-sung
     Min-kyu Sang-ho Jun-young Ji-soo Hyun-woo Do-hoon Seung-woo Tae-seok Sung-yong`,
    `Son Lee Kim Hwang Park Jung Cho Paik Seol Oh Choi Kang Yoon Jang Lim Han Shin Seo Kwon
     Hwang Ahn Song Jeon Hong Yoo Ko Moon Yang Bae Baek Heo Nam Noh`,
  ),
  thai: p(
    `Chanathip Supachok Teerasil Theerathon Ekanit Suphanat Bordin Sarach Kritsada Suphan
     Weerathep Pansa Nicholas Patiwat Peeradon Jonathan Saringkan Elias Kawin Supachai
     Poramet Channarong Thitathorn Ben Seksan Apirak Phitiwat`,
    `Songkrasin Jaided Dangda Bunmathan Panya Mueanta Phala Yooyen Kerdkaew Thongsong
     Pomphan Hemviboon Promsrikaew Chamratsamee Promrat Dolah Hamilton Sukjitthammakul
     Chunuonsee Kongsri Sripan Wongsa Saengsuk Boonmak Chaiyaphum Kaewsuk Ruangsri`,
  ),
  uzbek: p(
    `Eldor Abbosbek Jaloliddin Otabek Oston Khojimat Abdukodir Rustamjon Jamshid Utkir Husniddin
     Khusayin Azizbek Sherzod Odiljon Umarali Dostonbek Farrukh Islom Bobur Akmal Sardor`,
    `Shomurodov Fayzullaev Masharipov Shukurov Urunov Erkinov Khusanov Ashurmatov Iskanderov
     Yusupov Aliqulov Norchaev Turgunboev Nasrullaev Hamrobekov Rakhmonaliev Tursunov
     Abdullaev Karimov Rakhimov Saidov Ergashev Nazarov Mirzaev Kholmatov`,
  ),
  malay: p(
    `Safawi Arif Faisal Akhyar Syafiq Hakimi Azam Quentin Dion Stuart La'Vere Matthew
     Shahrul Azri Haziq Nazmi Fergus Endrick Corbin Dominic Paulo Syahmi Aiman Danial Amirul
     Haqimi Irfan Shahrel Ridzuan Rahmat Aqil Harith`,
    `Rasid Abdul_Halim Halim Rashid Ahmad Hamid Azmi Rahman Mohamad Ismail Ibrahim Hassan
     Yusof Othman Abdullah Zainal Kamal Mahmud Saad Kassim Wilkin Corbin-Ong Davies Tan
     Hussin Aziz Salleh Daud Nor Talib`,
  ),
  indonesian: p(
    `Rizky Asnawi Witan Egy Marselino Pratama Rachmat Fachruddin Ricky Ramadhan Hokky Dimas
     Arkhan Ernando Nadeo Yakob Saddil Evan Rafael Ivar Sandy Jordi Justin Elkan Kevin Jay
     Ragnar Thom Mees Calvin Nathan Dony Bagas Bagus Beckham Ferdinand Muhammad Ahmad Andik
     Irfan Stefano Rizki Rendy Febri Adam Syahrian Hansamu Ilija Arhan Ridho Zulfiandi
     Gilang Yandi Victor Kadek Komang Made Sani Andi Fajar Ilham Yabes Arif`,
    `Ridho Arhan Pangestu Sayuri Maulana Adi Wahyu Hidayat Kurniawan Saputra Setiawan Pratama
     Nugroho Santoso Wibowo Firmansyah Hutapea Simanjuntak Sitorus Siregar Nainggolan Lubis
     Tambunan Tampubolon Manurung Lilipaly Hubner Idzes Struick Verdonk Oratmangoen Walsh
     Romeny Hilgers Ferrari Ramadhan Ardiansyah Gunawan Sulistyo Utomo Purnomo Rahardjo
     Sihombing Rumakiek Imanuel Wanggai Asmara Laturiuw Tuasalamony Matulapelwa Mauri
     Sudarsono Wijaya Hartono Syahputra Hamdani Kambuaya`,
    0.3,
  ),
  westafrican: p(
    `Victor Ademola Samuel Alex Wilfred Joe Calvin Moses Ola Kelechi Frank Taiwo William
     Thomas Mohammed Jordan Inaki Kamaldeen Antoine Daniel Joseph Abdul Kudus Osman Ibrahim`,
    `Osimhen Lookman Chukwueze Iwobi Ndidi Aribo Simon Onyekuru Aina Iheanacho Onyeka Awoniyi
     Troost-Ekong Bassey Okoye Ajayi Adeyemi Okafor Eze Nwosu Partey Kudus Williams Ayew
     Semenyo Sulemana Salisu Djiku Lamptey Fatawu Mensah Owusu Boateng Asante Ofori`,
  ),
  francoafrican: p(
    `Sadio Kalidou Idrissa Ismaïla Édouard Nicolas Pape Iliman Habib Krépin Lamine Moussa
     Sébastien Franck Seko Simon Wilfried Serge Amad Evan Ibrahim Odilon André-Frank Bryan
     Karl Vincent Carlos Christian Jean-Charles Nouhou`,
    `Mané Koulibaly Gueye Sarr Mendy Jackson Ndiaye Diallo Diatta Camara Diédhiou Pépé
     Haller Kessié Fofana Adingra Zaha Bailly Singo Diallo Sangaré Kossounou Aurier Seri
     Anguissa Onana Aboubakar Choupo-Moting Mbeumo Toko_Ekambi Castelletto Ngamaleu Tolo`,
  ),
  maghreb: p(
    `Achraf Hakim Youssef Sofyan Azzedine Nayef Bilal Noussair Amine Brahim Ilias Abde
     Riyad Ismaël Saïd Rayan Houssem Ramy Aïssa Baghdad Islam Amine Mohamed Yacine`,
    `Hakimi Ziyech En-Nesyri Amrabat Ounahi Aguerd Bounou El_Khannouss Mazraoui Harit Diaz
     Saibari Ezzalzouli Akhomach Mahrez Bennacer Benrahma Aouar Atal Mandi Bounedjah Slimani
     Belaïli Zerrouki Chaïbi Gouiri Amoura Benzia Feghouli Benali`,
  ),
};
