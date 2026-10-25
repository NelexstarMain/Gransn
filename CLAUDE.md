# Gransn Taxi — kontekst dla kolejnej sesji Claude Code

Ten plik Claude Code wczytuje automatycznie. Mówi, czym jest projekt, jak pracować z tym użytkownikiem i jak jest zbudowany kod.

## Projekt w skrócie

Gra 3D w przeglądarce (Three.js `0.170.0` + Vite `6`, czysty JS, moduły ES). Jeździsz taksówką, wozem z ok. 1900 roku, po proceduralnie generowanej wyspie i wozisz pasażerów. Na ulicach jeżdżą boty i tworzą korki.

Nie ma żadnych plików z modelami ani teksturami. Wszystko powstaje z ~45 modułów w kodzie, szumu i tekstur malowanych na canvasie. Jedyne zewnętrzne pliki to dwa zdjęcia w `public/posters/` (reklamy taksówek).

```bash
npm install
npm run dev            # http://localhost:5173  (?seed=N, ?low, ?high, ?local, ?test)
npm run build          # dist/
npm run check          # reguły świata (obiekty poza jezdnią, brak nakładań, ściany poza jezdnią)
npm run sim            # symulacja ruchu ulicznego bez grafiki (korki, zakleszczenia)
npm run build-world    # buduje CAŁY świat w Node: wyjątki, NaN, ląd pod wodą
```

## Jak pracować z tym użytkownikiem (WAŻNE)

- **Język:** pisze po polsku, często dyktując głosem, z literówkami („wieksze”, „zrub”). Odpowiadaj po polsku, zwięźle, bez żargonu. Gdy coś jest niejasne, interpretuj w duchu wcześniejszych próśb (patrz Historia).
- **NIE uruchamiaj testów w przeglądarce** (Playwright/Chromium). Użytkownik wprost tego zabronił i przerywa takie procesy (kod 137). Weryfikuj wyłącznie przez `npm run check`, `npm run sim`, `npm run build-world` i `npx vite build`. W raporcie uczciwie pisz, czego nie dało się sprawdzić wizualnie.
- **Robi przerwy i wraca z nową listą.** Często powtarza wcześniejszą wiadomość w całości, zanim doda nowe punkty. Najpierw upewnij się, że stare punkty są zrobione.
- **Po każdej zmianie:**
  1. Commit na gałęzi `ccr-f37277ad-qchwz7`, z opisem po polsku i trailerami z system-reminder.
  2. `git push -u origin ccr-f37277ad-qchwz7`.
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
| `gen/modules.js` | ~45 modułów: ściany, okna (`windowCore`, `glassFrame`), drzwi, witryny, gzymsy, dachy, mosty, nabrzeża, drzewa (rekurencyjne, 4 gatunki), auta (`oldcar`), kioski, budki, przystanki, fontanna, tory, latarnia morska, molo… |
| `gen/assemble.js` | składanie fragmentu: `buildQuad` (ściany, dachy `roofSpec`, ćwiartki gruntu), `buildRoad` (wstęga, zaokrąglone końce, krawężniki maskowane), rekwizyty, `buildRiver`, `buildChunkLOD`, `buildGroundTile` |
| `gen/worker.js`, `gen/pool.js` | generacja w Web Workerach. Pula przełącza się na wątek główny, gdy workery nie działają (`?local` wymusza ten tryb). |
| `game/streaming.js` | fragmenty 80×80 m: detal blisko (170 m, w `?low` 90 m), dalej LOD |
| `game/collision.js` | siatka 0,5 m z typami: GROUND −0,05, ROAD +0,06, WALK +0,15, BRIDGE, SOLID. Jezdnia wypełniana na końcu, więc jest zawsze przejezdna. |
| `game/vehicle.js` | fizyka taksówki, kolizje z botami, `moduleMesh` (siatka modułu dla obiektów ruchomych) |
| `game/traffic.js` | graf dróg, A*, boty (pas, łuki Béziera, odstęp, pierwszeństwo/blokada węzła, cierpliwość), rysowanie przez InstancedMesh |
| `game/taxi.js` | pasażerowie, kursy, opłaty, napiwki |
| `game/fx.js` | dym, kurz, ślady opon (Points + bufor pierścieniowy) |
| `game/player.js`, `game/hud.js` | chodzenie/lot, mysz/dotyk; minimapa, panel kursu, strzałka |
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
- **Wydajność:** cała wyspa ma ok. 3 mln trójkątów (detal plus LOD). Auta-boty są instancjonowane. Odbicia pochodzą z PMREM liczonego raz. Nie dodawaj postprocessingu, który kosztuje FPS.

### Ostatnie wyniki weryfikacji (seed 1984)

| narzędzie | wynik |
|---|---|
| `npm run check` | ~3400 obiektów, 0 na jezdni, 0 nakładań, 0 ścian na jezdni, najwęższa jezdnia 6 m, 364 budynki |
| `npm run sim` | 34 auta, ~18 km/h średnio, ~1/3 w korkach, najdłuższe czekanie ~12 s, 0 NaN |
| `npm run build-world` | 144 fragmenty, ok. 3,0 mln trójkątów, 0 błędów, 0 punktów lądu pod wodą |

## Znane braki i pomysły na dalej

- Koła aut się nie obracają (cała karoseria to jedna siatka modułu).
- Nie ma pieszych-botów (pasażerowie stoją), nie ma pory dnia i nocy.
- Boty nie widzą się na skrzyżowaniach bez węzła w grafie (np. przecięcia z torami).
- LOD nie ma rekwizytów (lamp, ławek), drzewa w LOD to proste ostrosłupy.
- UV dachów: rzut z góry lub z boku, więc rzędy dachówek nie zawsze idą wzdłuż połaci.
- Pasażer siada w aucie przez `car.mesh.add`. Przy wysiadaniu jest usuwany. Działa, ale wsiadanie nie ma animacji.
- `?low` włącza się automatycznie na telefonach i przy ≤4 rdzeniach lub ≤4 GB RAM.
