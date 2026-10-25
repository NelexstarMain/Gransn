# Gransn Taxi

Gra 3D w przeglądarce (Three.js). Jeździsz taksówką po proceduralnie generowanej wyspie i zarabiasz na kursach: podjeżdżasz do pasażera w żółtym kółku, zatrzymujesz się obok i wieziesz go do zielonego celu. Opłata rośnie z odległością, a za szybki kurs jest napiwek.

Na wyspie (~1,3 km, losowy obrys z półwyspami) są:
- śródmieście z kamienicami i rynek z ratuszem i fontannami,
- przedmieścia z domkami i ogródkami, lasy i wydmy przy brzegu,
- rzeka z mostami, kolej z dworcem i pociągiem, autostrada na estakadzie,
- latarnia morska, molo, parki,
- kioski, budki telefoniczne, przystanki i zaparkowane auta.

Nie ma żadnych plików z modelami ani teksturami. Wszystko powstaje z ~40 modułów i szumu.

```bash
npm install
npm run dev        # http://localhost:5173
```

Sterowanie:
- W/S — gaz i hamulec, A/D — skręt, Spacja — ręczny,
- mysz — kamera, E — wysiądź/wsiądź,
- pieszo: WASD, Shift bieg, F tryb lotu,
- telefon: lewy kciuk jedzie, prawy obraca kamerę.

Parametry adresu: `?seed=1234` generuje inną wyspę, `?low` lub `?high` wymusza jakość grafiki.

## Sieć dróg: Parish & Müller (2001)

`src/city/roads.js` implementuje rozszerzony L-system z pracy *Procedural Modeling of Cities* (Y. Parish, P. Müller, SIGGRAPH 2001):
- Każdy odcinek drogi proponuje „idealnych następców”: przedłużenie i odgałęzienia pod ~90°.
- **Cele globalne** poprawiają tę propozycję: główne drogi skręcają w stronę większej gęstości zaludnienia (mapa z szumu), a ulice odgałęziają się tylko tam, gdzie gęstość jest wystarczająca.
- **Ograniczenia lokalne** pilnują sensowności: przecięcie z istniejącą drogą tworzy skrzyżowanie (odcinek zostaje przycięty), koniec blisko skrzyżowania zostaje do niego przyciągnięty, a koniec blisko drogi jest przedłużany do niej. Woda i brzeg odrzucają odcinek, a rzekę da się przekroczyć tylko mostem.
- Kolejka priorytetowa po czasie daje wzrost miasta od rynku i mostów na zewnątrz.

Strefy (śródmieście, przedmieście, park, las) wyznacza diagram Voronoi z relaksacją Lloyda.

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
                modules.js (21 segmentów), assemble.js (reguły, kwartały, LOD),
                worker.js + pool.js (generowanie w Web Workerach)
src/city/       layout.js — ulice (Voronoi), strefy, rzeka, mosty; grid.js — siatka i słupki; terrain.js — wzgórza
src/render/     proceduralne tekstury PBR, atlas plakatów, teleekran, atmosfera
src/game/       gracz (FPS), siatka kolizji 0,5 m, strumieniowanie, HUD
```

- **Strumieniowanie:** świat jest podzielony na fragmenty 80×80 m; te w promieniu ~170 m od gracza są składane z modułów w workerach. Dalej stoją tanie bryły LOD z teksturą fasady. Gęsta, „orwellowska” mgła ukrywa przejście.
- **Kolizje** rasteryzuje się z tych samych danych co geometrię. Przez bramy da się wejść na podwórza.
- `?test` renderuje klatki tylko na żądanie (do zrzutów ekranu w headless).
