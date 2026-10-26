# Gransn Taxi — kontekst dla kolejnej sesji Claude Code

Ten plik Claude Code wczytuje automatycznie. Mówi, czym jest projekt, jak pracować z tym użytkownikiem i jak jest zbudowany kod.

## Projekt w skrócie

Gra 3D w przeglądarce (Three.js `0.170.0` + Vite `6`, czysty JS, moduły ES). Jeździsz taksówką, wozem z ok. 1900 roku, po proceduralnie generowanej wyspie i wozisz pasażerów. Na ulicach jeżdżą boty (6 typów aut) i tworzą korki, po chodnikach chodzą przechodnie, a po wyjściu z auta gracz ma karabin.

Nie ma żadnych plików z modelami, teksturami ani dźwiękami. Wszystko powstaje z modułów w kodzie, szumu, tekstur malowanych na canvasie i dźwięku syntezowanego w Web Audio. Jedyne zewnętrzne pliki to dwa zdjęcia w `public/posters/` (reklamy taksówek).

```bash
npm install
npm run dev            # http://localhost:5173  (?seed=N, ?low, ?high, ?local, ?test)
npm run build          # dist/
npm run check          # reguły świata (obiekty poza jezdnią, brak nakładań, ściany poza jezdnią)
npm run sim            # symulacja ruchu ulicznego bez grafiki (korki, zakleszczenia)
npm run build-world    # buduje CAŁY świat w Node: wyjątki, NaN, ląd pod wodą
npm run sim-peds       # symulacja pieszych z autami: budynki, woda, przejścia, strzał
npm run smoke          # test dymny gry w Node (auto, ruch, piesi, taksówka, karabin, potrącenie)
node scripts/boot-test.mjs   # prawdziwy main.js na atrapie DOM i renderera, gra cały scenariusz
npm run hash           # skrót geometrii świata (po optymalizacji generatora MUSI być ten sam)
npm run model -- car out.png kind=taxi   # podgląd modelu: rasteryzator programowy → PNG (Read pokaże obraz)
```

## Jak pracować z tym użytkownikiem (WAŻNE)

- **Język:** pisze po polsku, często dyktując głosem, z literówkami („wieksze”, „zrub”). Odpowiadaj po polsku, zwięźle, bez żargonu. Gdy coś jest niejasne, interpretuj w duchu wcześniejszych próśb (patrz Historia).
- **NIE uruchamiaj testów w przeglądarce** (Playwright/Chromium). Użytkownik wprost tego zabronił i przerywa takie procesy (kod 137). Weryfikuj przez `npm run check`, `sim`, `sim-peds`, `build-world`, `smoke`, `node scripts/boot-test.mjs` i `npx vite build`. Wygląd modeli możesz obejrzeć bez przeglądarki: `npm run model` zapisuje PNG z rasteryzatora programowego (to czysty Node, nie przeglądarka). W raporcie uczciwie pisz, czego nie dało się sprawdzić wizualnie w prawdziwym WebGL (światło, cienie, FPS).
- **Robi przerwy i wraca z nową listą.** Często powtarza wcześniejszą wiadomość w całości, zanim doda nowe punkty. Najpierw upewnij się, że stare punkty są zrobione.
- **Po każdej zmianie:**
  1. Commit na gałęzi wskazanej przez sesję (w ostatniej sesji `ccr-a540e01c-2z335y`, wcześniej `ccr-f37277ad-qchwz7`), z opisem po polsku i trailerami z system-reminder.
  2. `git push -u origin <ta gałąź>`.
  3. Ponowna publikacja gry pod tym samym linkiem (procedura niżej). Użytkownik gra **wyłącznie przez link** i nie uruchamia `npm`.
- **Zdjęcia w `public/posters/brat1.jpg` i `brat2.jpg`** to twarz samego użytkownika. Potwierdził to i chce ich używać (reklamy „TAXI GRANSN”, pomniki w parkach, billboard na rynku). Nie usuwaj ich i nie podmieniaj.

### Publikacja gry (Artifact, stały link)

Link: **https://claude.ai/artifact/HxoKA8Ks127NYUXeZzZpk5** (prywatny, właściciel: użytkownik).

1. `npx vite build` (w `vite.config.js` jest `base: './'`, więc ścieżki są względne).
2. Skopiuj `dist/assets/*` i `dist/posters/*` do katalogu roboczego artefaktu, np. `<scratchpad>/site/`.
3. Z `dist/index.html` zrób `site/index.html` bez `<!doctype>`, `<html>`, `<head>`, `<body>` i bez metatagów charset/viewport, bo Artifact dokłada własny szkielet. Do reguły `html, body` dodaj `color-scheme: dark`.
4. Opublikuj narzędziem `Artifact` z tym samym `file_path` co poprzednio albo z `url` powyżej. W `files` podaj nowe `assets/index-*.js` i `assets/worker-*.js`, a stare nazwy ustaw na `null`. Posters wystarczy wysłać raz.

Wcześniej skill `artifact-design` wymagał wczytania przed publikacją. W nowej sesji może być potrzebny ponownie.

## Historia (dlaczego jest tak, jak jest)

1. Start: „1984” w 3D. Moduły w kostce deformowane cage/FFD (jak Townscaper), kamienice.
2. Użytkownik zażądał metody Townscapera wprost: każdy domek to **punkt** nieregularnej siatki, a każda część pasuje do 4 punktów dookoła.
3. Organiczny układ, wyspa o losowym kształcie, rzeka, mosty. Diagram Voronoi **połączony** z L-systemem Parish & Müller (2001), bo użytkownik chciał oba.
4. Motyw 1984 **usunięty**: to ma być „po prostu to uniwersum”. Główna mechanika to **taksówkarz**, auto z ok. 1900 roku.
5. Jezdnie mają być ciągłe, przejezdne, szerokie co najmniej 5–6 m, bez kolizji. Każdy obiekt (kosz, budka…) ma swój kafelek ~5×5 m i nic się nie nakłada. Autostrada na ziemi, nie na estakadzie. Miasto mniejsze.
6. Boty-kierowcy z trasami (A*) i korkami. Dym, ślady opon, odbicia w szybach, ładniejsze światło **bez spadku FPS**.
7. Ostatnio: miasto było częściowo pod wodą (morze przykrywało ląd). Naprawione w `terrain.js` (dolna granica lądu) i w `grid.js` (plaża sprawdzana przed rzeką). Podkład terenu leży teraz 5 cm niżej i jest płaski.

## Architektura (src/)

| plik | rola |
|---|---|
| `core/rng.js`, `core/noise.js` | deterministyczny RNG (`hash`, `Rng`), szum Perlina 3D. **W generacji nigdy nie używaj `Math.random`**: świat musi wyjść identycznie w wątku głównym i w workerach. |
| `city/terrain.js` | wyspa (`coastR(θ)`, `inland`), wzgórza, rzeka (oś + brzegi `left/right`), `height(x,z)` ze spłaszczeniem rzeki i rynku oraz dolną granicą lądu |
| `city/layout.js` | `generateCity(seed)`: mosty → ziarna Poisson + Lloyd → Voronoi (strefy + krawędzie = szkielet ulic) → trasy → drogi P&M → `RoadNet` → siatka → klasyfikacja → dekoracje → fragmenty. `HALF = 460`. |
| `city/roads.js` | L-system Parish & Müller: cele globalne (gęstość) i ograniczenia lokalne (przecięcie, przyciągnięcie, przedłużenie, woda). Wejście: mosty i krawędzie Voronoi/autostrady jako gotowe odcinki. |
| `city/roadnet.js` | `RoadNet`: drogi jako **kapsuły** (odcinek + `rw`). `clearance`, `nearest`, `clamp` (docinanie chodników), `capsulePoly` (kolizje) |
| `city/routes.js` | kolej (z dworcem) i autostrada (krzywe Catmull-Rom) |
| `city/grid.js` | nieregularna siatka czworokątów (Stålberg), `buildingInfo` (gramatyka brył + palety HSL), `classifyGrid`, `raised`, `wallPlan`, `decorate` (1 obiekt na punkt), `makeChunks` |
| `gen/cage.js` | trójliniowa deformacja kostki (FFD) + poprawne normalne |
| `gen/builder.js` | budowa geometrii: szum zależny od pozycji w świecie, pochylenie, AO, UV w metrach. `MATDEF` (stała `W`: **jeden szum dla wszystkich materiałów budynków**, inaczej plakaty i ramy „chowają się” w ścianie) |
| `gen/modules.js` | ~45 modułów: ściany, okna (`windowCore`, `glassFrame`), drzwi, witryny, gzymsy, dachy, mosty, nabrzeża, drzewa (rekurencyjne, 4 gatunki), kioski, budki, przystanki, fontanna, tory, latarnia morska, molo… Auta (`oldcar`, `carwheel`) dokleja `Object.assign(M, vehicleModules)` z `vehicles.js` |
| `gen/vehicles.js` | 6 typów aut (`CAR_KINDS`): tourer, taxi, sedan, van, truck, roadster. Gładkie „skóry” (`skin`, `ringX`, `lofted`, `rbox`) z superelips i policzonymi normalnymi, koło (`wheel`), błotniki, maska, chłodnica, lampy, kotwice kierowcy i pasażera (`carAnchors`). Parametr `q` = poziom detalu |
| `gen/people.js` | części ciała (`PEOPLE_PARTS`) z przegubem w początku układu: korpus (kurtka/płaszcz/suknia), głowa, fryzury, nakrycia głowy, ręce, nogi, buty. Materiał `cloth`, kolor z instanceColor |
| `gen/weapons.js` | karabin z zamkiem (`rifle`, `bolt`) i ręce w widoku z pierwszej osoby (`arms`) |
| `gen/assemble.js` | składanie fragmentu: `buildQuad` (ściany, dachy `roofSpec`, ćwiartki gruntu), `buildRoad` (wstęga, zaokrąglone końce, krawężniki maskowane), rekwizyty, `buildRiver`, `buildChunkLOD`, `buildGroundTile` |
| `gen/worker.js`, `gen/pool.js` | generacja w Web Workerach. Pula przełącza się na wątek główny, gdy workery nie działają (`?local` wymusza ten tryb). |
| `game/streaming.js` | fragmenty 80×80 m: detal blisko (170 m, w `?low` 90 m), dalej LOD |
| `game/collision.js` | siatka 0,5 m z typami: GROUND −0,05, ROAD +0,06, WALK +0,15, BRIDGE, SOLID. Jezdnia wypełniana na końcu, więc jest zawsze przejezdna. |
| `game/carkit.js` | siatki aut dla gry (`CarKit`: karoseria per typ i poziom detalu, koło wspólne), `modelParts` |
| `game/vehicle.js` | taksówka: wektor prędkości (drift), biegi, zawieszenie na sprężynach, koła, tylne światła, kolizje (ściany, boty, piesi), kamera zza auta |
| `game/traffic.js` | graf dróg, A* na kopcu, boty (pas, łuki Béziera, odstęp, pierwszeństwo, piesi), InstancedMesh per typ i materiał, koła instancjonowane, `raycast`/`shot` dla broni |
| `game/rig.js` | geometria części ciała, losowy wygląd (`makeStyle`), poza (`pose`: chód, siedzenie, machanie, upadek), `identityParts` |
| `game/crowd.js` | rysowanie wszystkich ludzi (piesi, kierowcy, pasażerowie): InstancedMesh na część ciała |
| `game/pedestrians.js` | silnik NPC: chodniki wzdłuż grafu, przejścia, unik, panika, upadek, `ahead`, `raycast`, `carHit`, `adopt` |
| `game/taxi.js` | pasażerowie jako ludzie z tłumu (czekają, machają, idą do drzwi, siadają, wysiadają), kursy, opłaty, napiwki |
| `game/weapon.js` | karabin: model w widoku z pierwszej osoby, strzał, rozrzut, zamek, przeładowanie, celowanie, trafienia, smugi |
| `game/audio.js` | dźwięk syntezowany (silnik, klakson, strzał, kroki, uderzenia, pisk opon) |
| `game/fx.js` | dym, kurz, ślady opon (Points + bufor pierścieniowy) |
| `game/player.js`, `game/hud.js` | chodzenie (wolne, wytrzymałość, kucanie, bezwładność), lot, mysz/dotyk; minimapa, panel kursu, strzałka, amunicja, celownik |
| `render/*` | tekstury proceduralne, materiały PBR, atlas plakatów, atmosfera (słońce, niebo, mapa otoczenia z sylwetką miasta) |
| `main.js` | start (ładowanie w tle, wejście zawsze możliwe), pętla gry |

### Kluczowe zasady i liczby (nie psuj ich)

- **Siatka:** punkt = słupek z `H` pięter. Czworokąt dzieli się na 4 ćwiartki (`[v_i, m_i, c, m_{i-1}]`). Ściana jest tam, gdzie pełna ćwiartka styka się z pustą, na danym poziomie (marching squares).
- **Poziomy:** `levelY(L)` (parter 3,8 m, piętra 3,2 m). Okap zawsze `ce = 0,5`, żeby dachy sąsiadów się stykały. Dach ma okap tam, gdzie sąsiad jest niższy, pusty albo jest innym budynkiem (inny `BID`).
- **Wysokości powierzchni:**

  | powierzchnia | wysokość względem terenu |
  |---|---|
  | podkład terenu | −0,05 (płaski) |
  | droga gruntowa | +0,05 |
  | bruk | +0,06 |
  | asfalt | +0,07 |
  | chodniki i trawniki w mieście | +0,15 (`raised()`) |
  | krawężnik | +0,16 |

- **Jezdnia:** `rw` to 3,0 (uliczki P&M), 3,4 lub 4,2 (ulice Voronoi), 4,0 (główne P&M), 5,5 (autostrada), 3,5 (most). Punkt siatki jest pusty, jeśli `clearance < 5,2`, więc ściany zawsze są poza jezdnią.
- **Rekwizyty:** jeden na punkt siatki. Muszą trzymać odstęp od jezdni (`clearance`), od budynków (`bldDist`) i od siebie (`free`). Drzewo zamiast wchodzić w dom zmniejsza się.
- **Determinizm:** to samo `generateCity(seed)` liczy się w każdym workerze. Wszystko losowe idzie przez `hash`/`Rng`.
- **Wydajność:** cała wyspa ma ok. 3 mln trójkątów (detal plus LOD). Auta-boty i ludzie są instancjonowani. Odbicia pochodzą z PMREM liczonego raz. Nie dodawaj postprocessingu, który kosztuje FPS. Mapa cieni odświeża się co drugą klatkę, rozdzielczość dopasowuje się do FPS (60% … maks.), HUD odświeża się ok. 8 Hz, nowe fragmenty świata trafiają do sceny po jednym na klatkę (`Streamer.defer/tick`).
- **Optymalizacja generatora musi zachować geometrię co do bitu:** przed zmianą w `noise.js`, `builder.js`, `terrain.js` zapisz `npm run hash` (aktualnie seed 1984 = `453a85e0`, seed 7 z 30 fragmentami = `442b2071`; skrót zmienia się tylko, gdy celowo zmieniasz wygląd świata, np. zaparkowane auta), po zmianie generatora skrót ma się zgadzać.
- **Układ współrzędnych modeli ruchomych:** x = przód, y = góra, z = prawa strona (kierowca siedzi po lewej, z < 0). Kurs `heading` to kąt kierunku jazdy w płaszczyźnie (x, z): przód = (cos, sin), prawa = (−sin, cos); `mesh.rotation.y = −heading`.
- **Auta w świecie i w grze to ten sam moduł** (`oldcar`). Lakier to materiał `body` (kolor z wierzchołków albo z `instanceColor`), tylne światła `tail`, ludzie `cloth`. Zaparkowane auta mają stałą stopkę 3,6 × 1,7 m (klatka ściska moduł do ≤5%), więc typy parkowane (`PARKED_KINDS`) mają nominalną długość 3,6–3,85 m.
- **Piesi nie używają `Math.random`** w symulacji (Rng z ziarnem); efekty cząsteczkowe mogą.

### Ostatnie wyniki weryfikacji (seed 1984)

| narzędzie | wynik |
|---|---|
| `npm run check` | ~3400 obiektów, 0 na jezdni, 0 nakładań, 0 ścian na jezdni, najwęższa jezdnia 6 m, 364 budynki |
| `npm run sim` | 34 auta, 18–25 km/h średnio (zależnie od ziarna), 7–34% w korkach, najdłuższe czekanie ~12 s, 0 NaN |
| `npm run build-world` | 144 fragmenty, ok. 3,0 mln trójkątów, 0 błędów, 0 punktów lądu pod wodą; ~11,6 s na jednym wątku (wcześniej 17,3 s) |
| `npm run sim-peds` | 60 pieszych, 0 w budynkach, 0 w wodzie, 0 NaN, ~2% czasu na jezdni poza przejściami, 0,3 ms na krok |
| `npm run smoke` | 0 wyjątków i 0 NaN: jazda, kurs z pasażerem, wysiadanie, strzały (8/8 trafień przy wolnej linii), potrącenie |
| `node scripts/boot-test.mjs` | prawdziwy `main.js` rusza i przechodzi scenariusz bez błędów |

Fizyka taksówki (płaska płyta): 0–50 km/h w ~4,1 s, maksimum ~62 km/h, hamowanie z 61 km/h na ~16 m.

## Znane braki i pomysły na dalej

- Nie ma pory dnia i nocy (światła aut i latarnie są gotowe na noc: materiał `light`).
- Piesi nie siadają na ławkach, nie rozmawiają ze sobą i nie mijają się (brak kolizji piesi–piesi); kierowcy botów nie reagują na strzały poza zatrzymaniem na chwilę.
- Boty nie mają świateł hamowania (instancje), a nie widzą się na skrzyżowaniach bez węzła w grafie (np. przecięcia z torami).
- Karabin nie zostawia śladów po kulach, a hit-scan zakłada budynki do 18 m wysokości.
- Wygląd aut, ludzi i karabinu sprawdzono tylko rasteryzatorem programowym (`npm run model`), nie w prawdziwym WebGL: światło, cienie i FPS na urządzeniu użytkownika nie były widziane.
- LOD nie ma rekwizytów (lamp, ławek), drzewa w LOD to proste ostrosłupy.
- UV dachów: rzut z góry lub z boku, więc rzędy dachówek nie zawsze idą wzdłuż połaci.
- Pasażer siada w aucie przez `car.mesh.add`. Przy wysiadaniu jest usuwany. Działa, ale wsiadanie nie ma animacji.
- `?low` włącza się automatycznie na telefonach i przy ≤4 rdzeniach lub ≤4 GB RAM.
