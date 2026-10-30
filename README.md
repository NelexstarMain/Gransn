# Gransn Taxi

Gra 3D w przeglądarce (Three.js). Jeździsz taksówką, wozem z ok. 1900 roku (gładkie błotniki, szprychowe koła, mosiężna chłodnica i lampy, baldachim z latarnią TAXI), po proceduralnie generowanej wyspie i zarabiasz na kursach: podjeżdżasz do machającego pasażera w żółtym kółku, zatrzymujesz się obok, a on podchodzi, siada na tylnej ławce i wieziesz go do zielonego celu. Opłata rośnie z odległością, a za szybki kurs jest napiwek. Po wyjściu z auta masz karabin, a po chodnikach spacerują przechodnie.

Na wyspie (~0,9 km, losowy obrys z półwyspami) są:
- śródmieście z kamienicami i rynek z ratuszem i fontannami,
- przedmieścia z domkami i ogródkami, lasy i wydmy przy brzegu,
- rzeka z mostami, autostrada na poziomie gruntu z mostem,
- latarnia morska, molo, parki,
- kioski, budki telefoniczne, przystanki i zaparkowane auta.

Nie ma żadnych plików z modelami ani teksturami. Wszystko powstaje z ~40 modułów i szumu.

```bash
npm install
npm run dev        # http://localhost:5173
```

Sterowanie:
- w aucie: W/S — gaz i hamulec (S po zatrzymaniu to wsteczny), A/D — skręt, Spacja — ręczny (drift), Q — klakson,
- mysz — kamera, E — wysiądź/wsiądź (wysiąść można przy prędkości poniżej ok. 10 km/h),
- pieszo: WASD (marsz jest wolny, ok. 2 m/s), Shift — bieg (męczy; po wyczerpaniu trzeba odpocząć), C lub Ctrl — kucanie, Spacja — skok, F — tryb lotu,
- karabin (tylko pieszo): LPM — strzał, PPM — celowanie, R — przeładowanie; amunicja uzupełnia się po wsiadaniu do taksówki,
- H — ukryj HUD, M — wycisz dźwięk, Esc lub P — pauza, O lub ⚙ — ustawienia (jakość, cienie, FOV, czułość…), Shift+N — nowa wyspa,
- tryb filmowy: C w aucie albo przycisk w menu (autopilot jedzie po wyspie, V zmienia kamerę, C kończy),
- telefon: lewy kciuk chodzi/jedzie, prawy obraca kamerę, przyciski po prawej (ogień, celuj, R, skok, E).

Każde wejście do gry to nowa losowa wyspa (numer w rogu ekranu). `?seed=1234` albo `#1234` odtwarza dokładnie tę wyspę, `?low` lub `?high` wymusza jakość grafiki.

## Ruch uliczny: kierowcy-boty i korki

`src/game/traffic.js`:
- **Graf dróg:** powstaje z sieci jezdni. Odcinki dzielone są w skrzyżowaniach, węzły zgrzewane, a boty jeżdżą tylko po największej spójnej części sieci.
- **Trasy:** każdy kierowca liczy trasę algorytmem **A*** do losowego celu, a po dotarciu wybiera nowy.
- **Jazda:** prawym pasem, łagodnymi łukami (krzywa Béziera) przez skrzyżowania i wolniej przed ostrymi zakrętami.
- **Korki powstają same.** Kierowca trzyma odstęp od auta przed sobą (także od gracza), a na skrzyżowaniu pierwszeństwo ma ten, kto pierwszy wjechał. Po kilkunastu sekundach czekania auto rusza powoli, co zapobiega zakleszczeniom.
- **Rysowanie:** po jednym InstancedMesh na typ auta i materiał, a kolor lakieru dokłada `instanceColor`. Koła są wspólne dla wszystkich aut (4 instancje na auto) i obracają się od przebytej drogi, a przednie skręcają.
- **Różne auta:** tourer, taksówka, limuzyna, furgon, ciężarówka z drewnianą skrzynią i roadster. W otwartych kabinach widać kierowcę.
- **Piesi mają pierwszeństwo:** auto zatrzymuje się przed pieszym na jezdni (`Pedestrians.ahead`).
- **Planowanie tras:** A* na kopcu binarnym, bez alokacji; auta pojawiają się po jednym na klatkę, więc nie ma zacięć.

Symulacja (34 auta, 3 minuty) daje 18–25 km/h średnio, od kilkunastu do ok. 1/3 aut w kolejkach (zależnie od ziarna), a najdłuższe czekanie to ok. 12 s.

## Taksówka: fizyka i zawieszenie

`src/game/vehicle.js`: prędkość jest wektorem niezależnym od kursu, więc auto potrafi się ślizgać.
- **Silnik:** trzy biegi, przyspieszenie maleje z prędkością i obrotami, zmiana biegu na chwilę ucina moc; 0–50 km/h w ok. 4 s, maksimum ok. 62 km/h; po puszczeniu gazu hamuje silnik.
- **Przyczepność:** tarcie boczne ograniczone kołem tarcia, zależne od nawierzchni (asfalt, bruk, droga gruntowa, trawa, chodnik). Ręczny odpuszcza tył: auto się kręci i trzyma tempo, a przyczepność wraca łagodnie.
- **Zawieszenie:** sprężyny tłumiące: hamowanie nurkuje, przyspieszenie przysiada, zakręt przechyla; do tego nachylenie terenu z czterech kół.
- **Kolizje:** sub-kroki, ślizg po ścianie, siła uderzenia (potrząsanie kamerą, iskry, dźwięk), odbicia od botów, potrącanie pieszych.
- **Kamera:** zza auta, odsuwa się i poszerza kąt widzenia z prędkością.

## Ludzie: silnik pieszych

- **Model** (`src/gen/people.js`, `src/game/rig.js`): ~20 części na przegubach (korpus: kurtka, płaszcz albo suknia; głowa z oczami, nosem i uszami; fryzury, melonik, cylinder, czapka, toczek; ręce, nogi, buty). Każdy człowiek ma losowe kolory, wzrost i szerokość.
- **Animacja** liczona na procesorze: chód z fazą z przebytej drogi (bieg = dłuższy krok), kołysanie miednicy, praca ramion i kolan; pozy siedząca (kierowca trzyma kierownicę, pasażer ma ręce na kolanach), machanie ręką i upadek.
- **Rysowanie** (`src/game/crowd.js`): po jednym InstancedMesh na część ciała, więc kilkaset osób to ok. 20 wywołań rysowania. Dalej niż 170 m nikt się nie rysuje.
- **Silnik NPC** (`src/game/pedestrians.js`): chodzą po chodnikach wzdłuż grafu dróg, na skrzyżowaniach tną róg albo przechodzą przez jezdnię (czekają na krawężniku, aż auta będą daleko), omijają latarnie i drzewa, uskakują przed autem, zatrzymują się i rozglądają. Po strzale lub potrąceniu przewracają się (potem znikają), a okoliczni uciekają.
- **Pasażerowie** taksówki to ci sami ludzie: czekają i machają, podchodzą do drzwi, siadają, a po kursie wysiadają i idą dalej jako przechodnie.

## Karabin

`src/gen/weapons.js`, `src/game/weapon.js`: karabin powtarzalny z zamkiem z epoki, widziany z pierwszej osoby (z rękami).
- Magazynek 5 naboi, zapas 55; po strzale cykl zamka trwa ok. 1 s (zamek się porusza), przeładowanie 2,5 s.
- Rozrzut rośnie przy ruchu i w powietrzu, maleje przy celowaniu i kucaniu; celowanie przybliża obraz i spowalnia ruch.
- Trafienie liczy promień w pieszych (walec), auta (prostopadłościan) i świat (siatka kolizji, teren). Jest smuga, błysk wylotowy, dym, kurz, odrzut kamery i modelu oraz dźwięk.

## Dźwięk

`src/game/audio.js`: dźwięk syntezowany w locie (Web Audio), bez plików: silnik zależny od obrotów, klakson, pisk opon, strzał, zamek, kroki, uderzenia. Startuje po kliknięciu „Jedź”, M wycisza.

## Wydajność

- **Generator** (`noise3` z tablicą gradientów, `Builder` na typowanych buforach, `Terrain.river` bez alokacji): świat buduje się o ok. 30% szybciej (17,3 s → ok. 11,6 s na jednym wątku), a geometria jest co do bitu ta sama (`npm run hash`).
- **Rozdzielczość** dopasowuje się do wydajności (od 60% do maksimum), a mapa cieni odświeża się co drugą klatkę.
- **HUD** odświeża minimapę i teksty ok. 8 razy na sekundę i zapisuje do DOM tylko zmiany.
- **Strumieniowanie** dodaje fragmenty świata do sceny po jednym na klatkę, bez skoków przy wysyłce do GPU.

## Efekty i światło

- **Wóz:** dym z rury wydechowej (gęstszy przy gazie), kurz na drogach gruntowych i trawie, ślady opon przy ręcznym, poślizgu i mocnym hamowaniu, tylne światła przy hamowaniu. To jeden obiekt `Points` i jedna geometria w buforze pierścieniowym.
- **Odbicia:** mapa otoczenia z niebem, tarczą słońca i sylwetką miasta na horyzoncie, liczona raz przy starcie. Szyby i lakier odbijają ją lustrzanie bez kosztu w klatce.
- **Słońce:** niższe i cieplejsze, z dłuższymi, miękkimi cieniami.
- **Pod autami:** miękki cień z jednej instancjonowanej płaszczyzny.

## Jezdnie: ciągłe wstęgi na kafelkach

Każda droga to „kapsuła”, czyli odcinek z promieniem jezdni i zaokrąglonymi końcami (`src/city/roadnet.js`). Suma kapsuł daje całą przejezdną nawierzchnię: skrzyżowania i zakręty wychodzą bez dziur. Z tej samej struktury korzystają wszystkie systemy:
- **Budynki** nie stoją bliżej niż 5,2 m od osi bocznej jezdni, więc przejazd ma co najmniej 6 m, a ściany są poza krawędzią.
- **Chodniki i trawniki** w mieście leżą na +0,15 m i są docinane do krawędzi jezdni. Krawężniki biegną wzdłuż jezdni i znikają tam, gdzie wpada inna droga. Od strony lasu i plaży powierzchnia ma obrzeże.
- **Kolizje:** jezdnia jest zawsze przejezdna, bo nic na niej nie stoi.

## Rekwizyty: jeden obiekt na kafelek

Każdy punkt siatki (kafelek ok. 5×5 m) może mieć najwyżej jeden obiekt: latarnię, kosz, ławkę, budkę, kiosk, przystanek, krzak, drzewo albo auto. Obiekt musi zmieścić się w kafelku: trzyma odstęp od jezdni, ścian i innych obiektów. Drzewa są w razie potrzeby zmniejszane, zamiast wchodzić w dom. Automatyczny test (wszystkie obiekty, kilka seedów) daje zero nakładań i zero obiektów na jezdni.

## Budynki: gramatyka kształtu i losowe kolory

`buildingInfo` w `src/city/grid.js` losuje dla każdej działki typ bryły, który ustawia wysokość słupków:
- **blok:** równa wysokość;
- **uskokowy:** piętra cofnięte od ulicy albo od podwórza;
- **z wieżą:** narożny punkt działki wyżej o 2–4 piętra;
- **ząbkowany:** naprzemienne szczyty od frontu;
- **z podcieniami:** parter od ulicy pusty, z kolumnami;
- **willa:** środek wyżej;
- **w kształcie L:** jedno skrzydło niższe.

Okna mają ramy z głębią, szprosy zależne od stylu i firanki albo zasłony. Domy mają rynny, rury spustowe, dachówkę karpiówkę i latarenki przy drzwiach, sklepy pasiaste markizy. Kolory pochodzą z losowych palet HSL (pastelowe, ziemiste, mocne, białe), z dobranym kolorem detali, ram, drzwi, okiennic i dachówki. Proporcje okien zmieniają się dla każdego budynku. Każdy budynek ma własny dach (płaski, niski albo stromy), a dachy sąsiadów stykają się w koszu bez szczelin.

## Sieć dróg: Voronoi + Parish & Müller (2001)

`src/city/roads.js` implementuje rozszerzony L-system z pracy *Procedural Modeling of Cities* (Y. Parish, P. Müller, SIGGRAPH 2001):
- Każdy odcinek drogi proponuje „idealnych następców”: przedłużenie i odgałęzienia pod ~90°.
- **Cele globalne** poprawiają tę propozycję: główne drogi skręcają w stronę większej gęstości zaludnienia (mapa z szumu), a ulice odgałęziają się tylko tam, gdzie gęstość jest wystarczająca.
- **Ograniczenia lokalne** pilnują sensowności: przecięcie z istniejącą drogą tworzy skrzyżowanie (odcinek zostaje przycięty), koniec blisko skrzyżowania zostaje do niego przyciągnięty, a koniec blisko drogi jest przedłużany do niej. Woda i brzeg odrzucają odcinek, a rzekę da się przekroczyć tylko mostem.
- Kolejka priorytetowa po czasie daje wzrost miasta od rynku i mostów na zewnątrz.

Oba algorytmy działają razem:
- **Voronoi** (z relaksacją Lloyda) daje szkielet: krawędzie komórek to główne ulice, a komórki to strefy (śródmieście, przedmieście, park, las).
- **Parish & Müller** zagęszcza ten szkielet: z ulic Voronoi, z rynku i z mostów wypuszcza boczne uliczki, które łączą się z istniejącymi drogami przez skrzyżowania.
- Główne drogi przecinają inne i jadą dalej.

## Metoda: nieregularna siatka + punkty + marching squares (jak w Townscaperze)

Technika pochodzi z gier Oskara Stålberga (*Townscaper*, *Bad North*). Opisuje ją m.in. jego wykład „Organic towns from square tiles”. Deformacja modułów to Free-Form Deformation (Sederberg & Parry, 1986).

**1. Nieregularna siatka czworokątów** (`src/city/grid.js`):
- siatka trójkątów, potem losowe łączenie par trójkątów w czworokąty,
- podział każdego wielokąta na czworokąty (wierzchołek, środek krawędzi, środek ściany),
- relaksacja „do kwadratu”: każdy czworokąt ciągnie narożniki w stronę najlepiej dopasowanego kwadratu.

Efekt: organiczna siatka bez prostych linii, a jednak złożona z samych czworokątów.

**2. Każdy punkt siatki to słupek** z liczbą pięter. O tym, czy punkt jest ulicą, budynkiem, podwórzem, parkiem czy placem, decyduje organiczny układ ulic: diagram Voronoi z relaksacją Lloyda, rzeka i mosty (`layout.js`). Liczba pięter zależy od strefy (śródmieście lub przedmieście), działki i szumu.

**3. Każdy czworokąt dzieli się na 4 ćwiartki**, po jednej na każdy z 4 otaczających go punktów. Na każdym poziomie (marching squares):
- pełna ćwiartka obok pustej daje **ścianę** (okno, drzwi, witrynę, balkon...),
- najwyższy poziom punktu daje **dach**: wysokość w każdym z 4 punktów ćwiartki liczona jest z sąsiadów (okap = 0, kalenica = pole szumu), więc dachy same układają się w kalenice, naroża i kosze,
- pusty parter pod pełnym piętrem daje **prześwit bramny** ze stropem, czyli przejście na podwórze,
- pusta ćwiartka obok zabudowy daje **chodnik** z krawężnikiem tam, gdzie zaczyna się jezdnia.

**4. Każdy moduł jest zaprojektowany w idealnej kostce** i wciśnięty w ćwiartkę (`src/gen/cage.js`) interpolacją trójliniową 8 narożników. Ćwiartki to krzywe czworokąty, a każdy narożnik stoi na terenie na innej wysokości, więc ściany wychodzą pod różnymi kątami i nic nie jest sześcianem.

**5. Drzewa generuje rekurencja (L-system)**: pień, gałęzie i kępy liści. Są cztery gatunki (dąb, brzoza, topola, sosna), a każde drzewo ma własny seed.

**6. Szum zależy od pozycji w świecie** (`src/gen/builder.js`), więc sąsiednie moduły przesuwają się identycznie i nie robią się szczeliny. Szum odpowiada za:
- pochylenie ścian proporcjonalnie do wysokości,
- nierówny tynk,
- wybrzuszony bruk,
- „zgniecione” korony drzew (korona to zaokrąglony sześcian + szum).

## Moduły (`src/gen/modules.js`)

| # | moduł | # | moduł |
|---|---|---|---|
| 1 | `wall` — gładka ściana | 12 | `pilaster` — lizena |
| 2 | `rustic` — boniowanie parteru | 13 | `roof` — dwuspadowy / mansardowy / płaski |
| 3 | `window` — okno ze szprosami | 14 | `chimney` — komin |
| 4 | `ornate` — okno z naczółkiem | 15 | `firewall` — ściana szczytowa |
| 5 | `balcony` — balkon z balustradą | 16 | `sidewalk` — płyty chodnikowe |
| 6 | `modern` — okno pasmowe (Ministerstwo) | 17 | `curb` — krawężnik z fazą |
| 7 | `door` — drzwi z portalem | 18 | `cobble` — bruk |
| 8 | `gate` — brama na podwórze (przechodnia) | 19 | `lamp` — latarnia |
| 9 | `shop` — witryna z szyldem | 20 | `telescreen` — teleekran |
| 10 | `string` — gzyms kordonowy | 21 | `poster` — plakat / hasło |
| 11 | `cornice` — gzyms wieńczący | 22 | `bridge` — przęsło kamiennego mostu |
| 23 | `quay` — nabrzeże z balustradą | 24 | `tree` — drzewo (kostka + szum) |
| 25 | `fence` — płot sztachetowy | 26 | `bench` — ławka |
| 27 | `monument` — obelisk na cokole | 28 | `eave` — okap domu |
| 29 | `billboard` — billboard Partii | | |

Reklamy taksówek używają dwóch zdjęć z `public/posters/`. Są do tego cztery proceduralne plakaty (kino, lemoniada, wyspa, latarnia). (`src/render/posters.js`): klasyczny („Patrzy na ciebie”), w czapce oficerskiej („Czuwa nad tobą”), wszechwidzące oko („Widzi wszystko”) i konstruktywistyczny profil („Prowadzi nas”). Plakaty losują wariant.

## Architektura

```
src/core/       RNG (deterministyczny), szum Perlina
src/gen/        cage.js (FFD), builder.js (szum, normalne, UV w metrach),
                modules.js (segmenty), vehicles.js (auta i koła), people.js (części ciała),
                weapons.js (karabin), assemble.js (reguły, kwartały, LOD),
                worker.js + pool.js (generowanie w Web Workerach)
src/city/       layout.js — ulice (Voronoi), strefy, rzeka, mosty; grid.js — siatka i słupki; terrain.js — wzgórza
src/render/     proceduralne tekstury PBR, atlas plakatów, teleekran, atmosfera
src/game/       gracz, pojazd, ruch, piesi, tłum, karabin, dźwięk, siatka kolizji 0,5 m, strumieniowanie, HUD
```

- **Strumieniowanie:** świat jest podzielony na fragmenty 80×80 m; te w promieniu ~170 m od gracza są składane z modułów w workerach. Dalej stoją tanie bryły LOD z teksturą fasady. Gęsta, „orwellowska” mgła ukrywa przejście.
- **Kolizje** rasteryzuje się z tych samych danych co geometrię. Przez bramy da się wejść na podwórza.
- `?test` renderuje klatki tylko na żądanie (do zrzutów ekranu w headless).

## Weryfikacja bez przeglądarki

```bash
npm run check        # reguły świata
npm run sim          # symulacja ruchu ulicznego
npm run sim-peds     # symulacja pieszych razem z autami (budynki, woda, przejścia, strzał)
npm run build-world  # cały świat w Node: wyjątki, NaN, ląd pod wodą
npm run smoke        # test dymny: auto, ruch, piesi, taksówka z pasażerem, karabin, potrącenie
node scripts/boot-test.mjs   # uruchamia prawdziwy main.js na atrapie DOM i renderera i gra scenariusz
npm run hash         # skrót geometrii świata (po optymalizacji generatora musi się nie zmienić)
npm run model -- car out.png kind=taxi    # podgląd modelu (rasteryzator programowy → PNG)
```

Podgląd modeli (`scripts/preview-model.mjs`) to mały rasteryzator w Node: z-bufor, odrzucanie tylnych ścianek jak w three.js i oświetlenie zbliżone do gry. Modele: `car` (`kind=tourer|taxi|sedan|van|truck|roadster`), `person` (`seed=`, `pose=m|f` + `walk|run|sit|wave|fall`), `carsit` (auto z ludźmi w środku), `crowd`, `rifle`.
