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
npm run photo          # „aparat”: zdjęcia PNG świata i każdego elementu, bez przeglądarki (katalog zdjecia/)
```

## Jak pracować z tym użytkownikiem (WAŻNE)

- **Język:** pisze po polsku, często dyktując głosem, z literówkami („wieksze”, „zrub”). Odpowiadaj po polsku, zwięźle, bez żargonu. Gdy coś jest niejasne, interpretuj w duchu wcześniejszych próśb (patrz Historia).
- **NIE uruchamiaj testów w przeglądarce** (Playwright/Chromium). Użytkownik wprost tego zabronił i przerywa takie procesy (kod 137). Weryfikuj przez `npm run check`, `npm run sim`, `npm run build-world` i `npx vite build`. Wygląd sprawdzaj `npm run photo` (programowy renderer w Node, patrz niżej) i oglądaj PNG-i narzędziem Read. To przybliżenie GPU (światło, cień, tekstury, mgła, ACES), nie kopia piksel w piksel. W raporcie uczciwie pisz, czego nie dało się sprawdzić.
- **Robi przerwy i wraca z nową listą.** Często powtarza wcześniejszą wiadomość w całości, zanim doda nowe punkty. Najpierw upewnij się, że stare punkty są zrobione.
- **Po każdej zmianie:**
  1. Commit na gałęzi przydzielonej w poleceniu sesji (równoległe sesje mają różne gałęzie, np. `ccr-ecc3ed84-ivhb3i`, `ccr-82241717-wn3zfe`), z opisem po polsku i trailerami z system-reminder.
  **UWAGA: wiele sesji publikuje pod TYM SAMYM linkiem. Przed publikacją `git fetch` i scal cudze gałęzie (`git merge origin/<gałąź>`), inaczej nowa publikacja nadpisze cudze poprawki (tak wróciły błędy rzeki).**
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
8. „Latająca powierzchnia” nad rzeką: punkty siatki w korycie miały typ ulicy, więc dostawały chodnik, którego rogi rzutowano na OBA brzegi (płyta wisiała nad wodą, auto mogło po niej jechać, mogli tam stać pasażerowie). Teraz punkty w korycie to `T_WATER`, a ćwiartka chodnika jest rzutowana tylko na brzeg swojego punktu (`clampToBank(x, z, side)`, `bankSide`).
9. Brzeg rzeki = dokładnie linia w odległości `hw` od osi (`terrain.bankL/bankR`: narożnik po wewnętrznej stronie zakrętu, łuk po zewnętrznej). Po niej idą mury nabrzeża, minimapa i kolizje (koryto SOLID poza mostami). Wcześniej mur szedł po ściętym narożniku, a ziemia po łuku, więc wystawała nad wodę. Końcówki ulic przy nabrzeżu są docinane do brzegu. Autostrada przecina rzekę po moście (`highwayBridge` w `layout.js`). Wszystkie jezdnie w mieście (też autostrada i mosty) to bruk, drogi w lesie są ubite; asfalt (bez pasów) jest w kodzie, ale nieużywany.
10. Uskok przy rzece: spłaszczenie rynku podnosiło ziemię aż do brzegu (do 3 m nad nabrzeżem i mostami). Teraz w `height()` najpierw jest rynek, potem dolina rzeki, więc brzeg leży zawsze na `bankY`. Rynek chroni tylko pas `r…r+50`. Przy ujściu mur nabrzeża schodzi razem z terenem (`cageY` w `buildRiver`).
11. Niewidoczne drogi: `roads.clamp` przesuwał róg chodnika do NAJBLIŻSZEGO krawężnika, więc róg za osią ulicy lądował po drugiej stronie i płyta (+0,15) zakrywała ok. 2/3 jezdni. Teraz `sidewalkClamp` (assemble.js) + `roads.clampSide` docinają rogi zawsze na stronę punktu siatki (to samo w LOD). Poza jezdnią taksówka przyspiesza słabiej i jedzie maks. ok. 22 km/h (`vehicle.js`, `offRoad`).
13. Color grading BEZ postprocessingu: `GRADE` w `materials.js` wstrzykiwany `onBeforeCompile` przed `dithering_fragment` (mniej nasycenia, `pow` 1,28 = ciemniejsze cienie, zimne cienie / ciepłe światła, lekka krzywa S). Do tego ciemniejsze niebo, mgła, hemisfera i ekspozycja 0,92. Nowy materiał z `createMaterials` dostaje grading sam.
14. Wiszące powierzchnie po zmianach: (a) most autostrady był prostą belką między `e0`–`e1`, a jezdnia jest łamaną, więc część jezdni wisiała nad wodą bez pokładu (i kolizja BRIDGE obejmowała prostokąt nad wodą). Teraz `buildRiver` stawia przęsło pod KAŻDYM odcinkiem autostrady z `bridge`, a kolizja pomija `br.highway`. (b) tor kolejowy wisiał do 1,7 m nad terenem przez wygładzanie; teraz jest przycięty do ±0,2 m od terenu (`routes.js`).
16. Z mostu nie dało się zjechać: koryto rzeki (SOLID) i końce ulic zasypywały komórki pokładu 1–3 m od krawędzi mostu. Teraz `collision.js` wypełnia mosty (prostokąt + ulice z `bridge`) NA KOŃCU, po korycie. Test: skrypt jazdy po osi każdego mostu sprawdza `solid()` jak `Vehicle.blocked`.
12. Większe miasto, mniej ulic: `HALF` 460 → 520 (ląd ~0,44 km²), ziarna Voronoi co 66 m (było 58), w `roads.js` rzadsze odgałęzienia (Voronoi: co 40–58 m, szansa 0,4; ulice: kontynuacja przy gęstości > 0,24, boczne > 0,38 i 0,26). Gęstość ulic spadła z ~38 do ~30 km/km².

## Architektura (src/)

| plik | rola |
|---|---|
| `core/rng.js`, `core/noise.js` | deterministyczny RNG (`hash`, `Rng`), szum Perlina 3D. **W generacji nigdy nie używaj `Math.random`**: świat musi wyjść identycznie w wątku głównym i w workerach. |
| `city/terrain.js` | wyspa (`coastR(θ)`, `inland`), wzgórza, rzeka (oś + brzegi `left/right`), `height(x,z)` ze spłaszczeniem rzeki i rynku oraz dolną granicą lądu |
| `city/layout.js` | `generateCity(seed)`: mosty → ziarna Poisson + Lloyd → Voronoi (strefy + krawędzie = szkielet ulic) → trasy → drogi P&M → `RoadNet` → siatka → klasyfikacja → dekoracje → fragmenty. `HALF = 520`. |
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
| `scripts/photo.mjs`, `scripts/photo/raster.mjs` | „aparat”: te same moduły, tekstury, materiały i światło (`LIGHTS` z `render/atmosphere.js`) rysowane programowo w Node. Ujęcia miasta + plansze studyjne (`--only kamienice,elementy,przyroda,nawierzchnie,wieza`, `--fast` = mały kadr). Canvas z `@napi-rs/canvas`. |

### Kluczowe zasady i liczby (nie psuj ich)

- **Siatka:** punkt = słupek z `H` pięter. Czworokąt dzieli się na 4 ćwiartki (`[v_i, m_i, c, m_{i-1}]`). Ściana jest tam, gdzie pełna ćwiartka styka się z pustą, na danym poziomie (marching squares).
- **Poziomy:** `levelY(L)` (parter 3,8 m, piętra 3,2 m). Okap zawsze `ce = 0,5`, żeby dachy sąsiadów się stykały. Dach ma okap tam, gdzie sąsiad jest niższy, pusty albo jest innym budynkiem (inny `BID`).
- **Wysokości powierzchni:**

  | powierzchnia | wysokość względem terenu |
  |---|---|
  | podkład terenu | −0,05 (płaski) |
  | droga gruntowa | +0,05 |
    | asfalt | +0,07 |
  | chodniki i trawniki w mieście | +0,15 (`raised()`) |
  | krawężnik | +0,16 |

- **Jezdnia:** `rw` to 3,0 (uliczki P&M), 3,4 lub 4,2 (ulice Voronoi), 4,0 (główne P&M), 5,5 (autostrada), 3,5 (most). Punkt siatki jest pusty, jeśli `clearance < 5,2`, więc ściany zawsze są poza jezdnią.
- **Rekwizyty:** jeden na punkt siatki. Muszą trzymać odstęp od jezdni (`clearance`), od budynków (`bldDist`) i od siebie (`free`). Drzewo zamiast wchodzić w dom zmniejsza się.
- **Determinizm:** to samo `generateCity(seed)` liczy się w każdym workerze. Wszystko losowe idzie przez `hash`/`Rng`.
- **Wydajność:** cała wyspa ma ok. 5 mln trójkątów (detal plus LOD). Auta-boty są instancjonowane. Odbicia pochodzą z PMREM liczonego raz. Nie dodawaj postprocessingu, który kosztuje FPS.

### Ostatnie wyniki weryfikacji (seed 1984)

| narzędzie | wynik |
|---|---|
| `npm run check` | 0 obiektów na jezdni, 0 nakładań, 0 ścian na jezdni, najwęższa jezdnia 6 m, 700 budynków, 489 odcinków ulic |
| `npm run sim` | 34 auta, ~27 km/h średnio, ~6% stoi, najdłuższe czekanie ~12 s, 0 NaN |
| `npm run build-world` | 169 fragmentów, ok. 5,1 mln trójkątów (detal + LOD łącznie), 0 błędów, 0 punktów lądu pod wodą |

15. Przegląd wyglądu zdjęciami: chodniki z płyt wchodziły na jezdnię (teraz ćwiartki przy jezdni są dzielone i docinane po kawałku), rynek nie miał ratusza (jezdnie wygenerowane przez L-system są usuwane z 21 m od środka, wieża z zegarami i miedzianym hełmem to `M.townhall`, `extras` typu `townhall`), puste pola płyt zamieniają się w trawniki z drzewami (`lawn()` w `grid.js`), nowe tekstury (tynk bez łat, cegła z paletą i jasną zaprawą, trawa ze stokrotkami, drewno), nowe drzewa (topola kolumnowa, gęsta korona dębu), pasażer z twarzą, budka, kiosk, przystanek, kosz.

**Pułapka przy detalach tuż przed ścianą:** szum materiału (`wob`) liczy się w wierzchołkach. Jeden duży prostokąt ściany i detal 1 cm przed nim rozchodzą się o kilka cm i detal „tonie” w ścianie. Dużą ścianę dziel siatką ~0,8 m (`b.grid`) albo odsuń detal o ≥ 3 cm.

## Znane braki i pomysły na dalej

- Koła aut się nie obracają (cała karoseria to jedna siatka modułu).
- Nie ma pieszych-botów (pasażerowie stoją), nie ma pory dnia i nocy.
- Boty nie widzą się na skrzyżowaniach bez węzła w grafie (np. przecięcia z torami).
- LOD nie ma rekwizytów (lamp, ławek), drzewa w LOD to proste ostrosłupy.
- UV dachów: rzut z góry lub z boku, więc rzędy dachówek nie zawsze idą wzdłuż połaci.
- Pasażer siada w aucie przez `car.mesh.add`. Przy wysiadaniu jest usuwany. Działa, ale wsiadanie nie ma animacji.
- `?low` włącza się automatycznie na telefonach i przy ≤4 rdzeniach lub ≤4 GB RAM.
