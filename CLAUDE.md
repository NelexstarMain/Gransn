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
npm run photo          # „aparat”: zdjęcia PNG świata i każdego elementu, bez przeglądarki (katalog zdjecia/)
node scripts/seeds.mjs 1 60 [--build]   # sprawdza wiele ziaren naraz (jezdnie, ściany, ląd pod wodą, NaN)
node scripts/audit-roads.mjs 1 40 [--where]  # audyt sieci ulic: przecięcia, wyspy, ślepe uliczki, mosty
node scripts/sim-film.mjs 1984  # symulacja trybu filmowego (autopilot 150 s, boty, utknięcia)
node scripts/map.mjs 1984 [--props] [--plan]  # plan miasta z góry (PNG): drogi, budynki, rzeka, mosty; --plan = obrys jądra, plant, rynek i ziarna Voronoi
node scripts/plans.mjs 1 40 [--table]   # raport planów miasteczek: typ, rzeka, wyspa, rynek, plant, dzielnice, kościół; wyłapuje dziwne przypadki
npm run design         # projekt budynków i fasad: determinizm, najlepsza z N, fragmenty w panelach, różnorodność
```

## Jak pracować z tym użytkownikiem (WAŻNE)

- **Język:** pisze po polsku, często dyktując głosem, z literówkami („wieksze”, „zrub”). Odpowiadaj po polsku, zwięźle, bez żargonu. Gdy coś jest niejasne, interpretuj w duchu wcześniejszych próśb (patrz Historia).
- **NIE uruchamiaj testów w przeglądarce** (Playwright/Chromium). Użytkownik wprost tego zabronił i przerywa takie procesy (kod 137). Weryfikuj przez `npm run check`, `sim`, `sim-peds`, `build-world`, `design`, `smoke`, `node scripts/boot-test.mjs` i `npx vite build`. Wygląd sprawdzaj `npm run photo` (świat i rekwizyty) oraz `npm run model` (auta, ludzie, karabin): to programowe rastery w Node, nie przeglądarka; oglądaj PNG-i narzędziem Read. To przybliżenie GPU (światło, cień, tekstury, mgła, ACES), nie kopia piksel w piksel. W raporcie uczciwie pisz, czego nie dało się sprawdzić w prawdziwym WebGL (światło, cienie, FPS).
- **Robi przerwy i wraca z nową listą.** Często powtarza wcześniejszą wiadomość w całości, zanim doda nowe punkty. Najpierw upewnij się, że stare punkty są zrobione.
- **Po każdej zmianie:**
  1. Commit na gałęzi przydzielonej w poleceniu sesji (równoległe sesje mają różne gałęzie, np. `ccr-ecc3ed84-ivhb3i`, `ccr-82241717-wn3zfe`, `ccr-a540e01c-2z335y`), z opisem po polsku i trailerami z system-reminder.
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
17. Ustawienia gracza (`game/settings.js`, przycisk ⚙ pod minimapą, klawisz O, przycisk w menu startowym): jakość (Niska/Średnia/Wysoka/Ultra = rozdzielczość + cienie + zasięg detali), cienie (wył./1024/2048/4096), FOV, czułość, ciemność kolorów (`GRADE_UNIFORM` w `materials.js`, 0 = bez gradingu), jasność, mgła. Zapis w localStorage (`gransn.settings.v2`). Domyślnie „Wysoka” (res 1,5, cienie 2048, detale 170 m) także na telefonie; `?low` wpływa już tylko na liczbę botów. Otwarcie panelu wstrzymuje grę, zamknięcie wznawia.
12. Większe miasto, mniej ulic: `HALF` 460 → 520 (ląd ~0,44 km²), ziarna Voronoi co 66 m (było 58), w `roads.js` rzadsze odgałęzienia (Voronoi: co 40–58 m, szansa 0,4; ulice: kontynuacja przy gęstości > 0,24, boczne > 0,38 i 0,26). Gęstość ulic spadła z ~38 do ~30 km/km².
18. Budynki: generowanie zastąpiło „losowy fragment co ~2,5 m”. Użytkownik chciał metody jak najlepszej (prace: Wonka 2003 i Müller 2006 — gramatyki podziałów; Talton 2011 i Ritchie 2015 — sterowanie przez próbkowanie i ocenę; Bao 2013 — warianty fasady z relacji). Efekt: **najlepsza z N prób etapami** (bryła → styl → program fasady) i **fasada z fragmentów w metrach**, nie z jednakowych komórek (`fragments.js`, `facade.js`). Użytkownik zaznaczył, że budynek nie ma być siatką komórek, tylko zbiorem fragmentów różnej wielkości.
19. **Wzorce ze zdjęć starego miasta** (użytkownik wrzucił 13 zdjęć wrocławskich ulic i napisał „czegoś w nich brakuje, zrób, co chcesz”). Dodane: (a) bruk to kostka granitowa układana w **wachlarze** (`T.cobble`, polarne pierścienie wokół środków Woronoja), krawężnik z piaskowca (`T.curb`) i pas drobnej kostki za nim (`T.sett`, materiał `sett`, warstwa 6 w `layers.js`, `sett` w `curbAt`); (b) fasady: fryz roślinny nad oknami i pas podokienny z reliefem (`T.frieze`, fragment `frieze`), boniowany parter (`rust`), wysokie łukowe okna parteru (`archG`), konsolki pod parapetem (`cons`), pasy ciemnego klinkieru (`stripe`) i konsole pod okapem (`eave` z `brackets`), kapitele i bazy portali; (c) pachołki wzdłuż krawężników (`bollard`, `decorate`), (d) jesienne drzewa (`AUTUMN`, `leafColor` w `assemble.js`) i opadłe liście w trawie i płytach, (e) ogrodzenia ogrodów (`city.fences`, `city.posts`, moduły `fence`, `fencepost`): ceglany cokół, kuta kratka, słupki z kamienną głowicą, co 7. odcinek to bramka; kolizja jako wąski pas SOLID. **Celowo niezrobione:** tramwaje (tory, sieć trakcyjna), tryb nocny (oświetlone okna, latarnie), bo użytkownik wcześniej odrzucił tory; zaproponować jako następny krok.
20. **Różnorodne plany miasteczek** (użytkownik: „ulepsz generowanie miasta, patrz na plany małych miast z tych czasów, ulepszaj algorytm, bardziej zróżnicowane”). Wszystkie wyspy wyglądały tak samo (rynek w (0,0), rzeka poziomo, jednakowe komórki). Teraz `city/town.js` wybiera z ziarna **typ planu** wg typologii małych miast (Eysymontt 2016, Adamska; plan lokacyjny: prostokątny rynek, ulice z naroży; Watabou: spirala ziaren, mur z bramami, dzielnice): **lokacja** (szachownica wyrównana do rzeki, prostokątny rynek 60–105 m), **owalnica** (spirala ziaren, nieregularny rynek), **ulicówka** (rynek-ulica 30×130–150 m, rzędy ziaren po obu stronach), **promienisty** (pierścienie i promienie, rynek-wielokąt). Do tego: rzeka pod dowolnym kątem i w trzech odmianach (przez miasto / obok / w zakolu), cztery sylwety wyspy (blob, owal, zatoka z portem, trójkątna), rynek poza (0,0), pierścień **plant** w miejscu murów, bramy i drogi z bram, ulica do mostu, rozbudowa XIX w. (kratka wyrównana do drogi z bramy), przedmieścia wstęgowe, **wille** na wzgórzu, **okolica fabryczna** (ceglane hale + komin `factorychimney`), **kościół** (`M.church`) z dziedzińcem, **cmentarz** (nagrobki `gravestone`), ratusz pośrodku / z boku / fontanna zamiast ratusza. Voronoi + L-system ZOSTAJĄ: plan daje tylko ziarna (kratka to Voronoi z jitterem i falowaniem), a rynek i planty są WYCINANE z sieci (`applyPlan`: krawędzie w ich wnętrzu znikają, dochodzą ulice wokół). Wcześniejsza próba planarnego grafu (`plan.js`) była wycofana na prośbę użytkownika, a tu ten sam efekt wychodzi z Voronoi. Stare źródła z wyszukiwarki: pełnych tekstów nie otwarto (hosty `apcz.umk.pl`, `yadda.icm.edu.pl` poza dozwolonymi domenami sesji).
21. **Zniszczenia, bruk w shaderze i scalony świat (gałąź `ccr-12898db5-923xs4`, scalona z `ccr-bc3225f3-bafn2x`).** Użytkownik chciał unikalnych zacieków i zniszczeń dopasowanych do układu budynku, bruku z osobnymi kostkami „wsadzonymi między brzegi” oraz renderowania tylko tego, co widać. (a) `render/wear.js`: shader fasad (zacieki spod parapetów i gzymsów, wilgoć od ziemi, 5 rodzajów odpadania tynku z głębią przez paralaksę, „gorące miejsca”, pęknięcia z narożników okien); pola zniszczeń to funkcja pozycji 3D (wolumen 64³), więc przechodzą przez narożniki; **20 rodzajów zniszczeń** (`GLSL_PROFILE`, `wearOf` w assemble.js: część budynków czysta, część ruiny); atrybut wierzchołka `wear` (4 B) niesie rolę piętra, stopień, ziarno i okno (`Builder.setWear`, `Builder.win(hw, cx)` w `windowCore` i `panel`). (b) Bruk jezdni (materiał `cobble`) liczy shader: rzędy wzdłuż jezdni, całkowita liczba rzędów między krawężnikami, każda kostka inna (UV w „kostkach”, `COBBLE_H` = 15 cm). **Wachlarz ze zdjęć (`T.cobble`) zostaje na placach i podwórzach (`cobblep`) oraz w LOD jezdni (`cobblelod`).** Płyty chodnikowe (`slab`) też w shaderze, wzdłuż najbliższej jezdni. (c) `game/worldmesh.js` + `streaming.js`: jeden `BatchedMesh` na materiał, przycinanie do kadru (też w cieniu), detal↔LOD flagą widoczności. Przed grą budowane są: teren, rzeka, LOD całej wyspy i pełny detal w promieniu `PRELOAD_R` = 260 m; reszta detalu doładowuje się w jeździe i jest zwalniana (pełny detal całej wyspy to ~320 MB). Przycisk startu pojawia się po scaleniu i `compileAsync`. (d) Dojazdy do mostów są spłaszczone do poziomu pokładu (`terrain.bridgeZones`): wcześniej teren przy moście był do 0,9 m wyżej niż jezdnia. (e) Obrzeża chodników sięgają 0,7 m pod teren, żeby nawierzchnia nie „wisiała”.
   **Nie zweryfikowane w prawdziwym WebGL:** FPS, pamięć GPU, cienie na scalonych siatkach. Shadery sprawdzono składaniem pełnego programu three.js na atrapie GL + `glslangValidator` oraz podglądem w headless-GL (`gl` + xvfb; skrypty były w katalogu tymczasowym).

## Architektura (src/)

| plik | rola |
|---|---|
| `core/rng.js`, `core/noise.js` | deterministyczny RNG (`hash`, `Rng`), szum Perlina 3D. **W generacji nigdy nie używaj `Math.random`**: świat musi wyjść identycznie w wątku głównym i w workerach. |
| `city/terrain.js` | wyspa (`coastR(θ)`; sylwety blob/oval/bay/lobes), wzgórza, rzeka (`riverMode`: through/edge/bend, dowolny kierunek, do 14 prób aż przetnie wyspę ≥ 340 m lądu; oś + brzegi `left/right`), `center` (środek rynku), `height(x,z)` ze spłaszczeniem rzeki i rynku oraz dolną granicą lądu |
| `city/town.js` | PLAN MIASTECZKA: `makeTownPlan` (typ, obrys jądra, rynek-wielokąt, planty, bramy, ulice główne, ziarna z rodzajem dzielnicy, przedmieścia, wille, fabryki, cmentarz, ratusz), `applyPlan` (wycinanie rynku i plant z krawędzi Voronoi + drogi planu), `KINDS` (rodzaje dzielnic: strefa, głębokość zabudowy, nazwa w HUD), `KIND_ID`. Ziarna kratki mają `lat`: ich krawędzie i alejki zostają proste (`planned`). |
| `city/layout.js` | `generateCity(seed)`: teren (rzeka, wyspa, środek) → mosty (po długości łuku rzeki) → `makeTownPlan` → ziarna (plan + pary przy mostach) + Lloyd → Voronoi → `applyPlan` → drogi P&M (`growRoads` z gęstością i zakazem wzrostu z planu) → `RoadNet` → siatka → klasyfikacja → kościół i kominy (`extras`) → dekoracje → fragmenty. Rynek to blok pierwszy (`blocks[0]`, wielokąt z planu). `HALF = 520`. |
| `city/roads.js` | L-system Parish & Müller: cele globalne (gęstość z `plan.density`) i ograniczenia lokalne (przecięcie, przyciągnięcie, przedłużenie, woda, `plan.noGrow` = rynek i planty). Wejście: mosty, krawędzie Voronoi, drogi planu i autostrada jako gotowe odcinki (flagi `main`, `planned`). |
| `city/netfix.js` | WYKOŃCZENIE sieci ulic po L-systemie (`finalizeNetwork`): planaryzacja (podział w przecięciach i T-kontaktach, zgrzewanie końców), usuwanie zbyt bliskich równoległych uliczek, zwijanie odcinków < 6 m, ostre kąty, łączenie/usuwanie odciętych wysp, przedłużanie lub usuwanie ślepych uliczek. Mosty i autostrada są nieruchome. |
| `city/audit.js` | `auditStreets`: liczy błędy sieci (przecięcia bez węzła, szczeliny, ślepe uliczki, wyspy, ostre kąty, bliskie równoległe) i daje `score`; `growRoads` liczy 3 warianty L-systemu i bierze najlepszy |
| `city/organic.js` | ORGANICZNE ulice: łańcuchy między skrzyżowaniami → gładkie krzywe (Chaikin + Catmull-Rom, odcinki ~9 m), przyjmowane tylko bez przecięć, bez zbliżania się do innych ulic i rzeki. Rynek (plac + 40 m), mosty, autostrada, ulice główne i planowe (`main`, `planned`) zostają, jak je ułożył plan. |
| `city/roadnet.js` | `RoadNet`: drogi jako **kapsuły** (odcinek + `rw`). `clearance`, `nearest`, `clamp` (docinanie chodników), `capsulePoly` (kolizje) |
| `city/routes.js` | autostrada (krzywa Catmull-Rom) jako obwodnica: `bestRoute` karze łuki bliżej niż 310 m od rynku; **kolei nie ma** (`routes.rail` to pusta trasa, użytkownik jej nie chciał) |
| `city/tidy.js` | porządkowanie sieci ulic po L-systemie: łączy współliniowe odcinki, usuwa krótkie ślepe uliczki |
| `city/bridges.js` | MOSTY z segmentów 5 m (`SEG`): `makeBridge`, `bridgeSegments`, `onBridge`. Most jest prosty, prostopadły do rzeki, segmenty stykają się krawędź w krawędź. Miejski 2 segmenty szerokości, autostrada 3, kolejowy 1 (`br.rail`). Moduł `bridgeseg`. |
| `city/props.js` | REJESTR REKWIZYTÓW (rozmiar, odcisk `r`, kolizja `solid`, priorytet, orientacja, limit) i tabele stref `ZONES`. Dodajesz rekwizyt: wpis tu + moduł w `gen/propmods.js` + (opcjonalnie) wariant w `VARIANT` w `assemble.js` |
| `render/layers.js` | KOLEJNOŚĆ WARSTW nawierzchni (wysokość, renderOrder, polygonOffset z jednej tabeli `SURFACE`; od dołu m.in. bruk → pas drobnej kostki `sett` (6) → krawężnik `curb` (7)) |
| `city/grid.js` | nieregularna siatka czworokątów (Stålberg), `buildingInfo(seed, bid, zone, k, ctx)` (jedna próba z gramatyki brył + palety HSL; `ctx` = rodzaj dzielnicy i odległość od rynku: Stare Miasto niższe, pierzeje rynku wyższe z podcieniami, wille w ogrodach, hale fabryczne z cegły), `classifyGrid` (działki, wybór projektu → `grid.design`), `designOf`, `raised`, `wallPlan` (tylko Ministerstwo i styl modernistyczny), `decorate` (1 obiekt na punkt, potem pachołki `bollard` wzdłuż krawężników i ogrodzenia ogrodów `city.fences`/`city.posts`), `makeChunks` |
| `city/design.js` | **najlepsza z N prób etapami**: `lotStats` (wymiary działki), `chooseDesign` (5 prób bryły, potem 4 próby stylu); ocena: smukłość względem działki, ciągłość wysokości z sąsiadami, kontrast dachu/ściany/opaski, odległość odcieni od sąsiadów |
| `city/facades.js` | `buildFacades`/`facadesOf(city)`: odcinki ścian (środek krawędzi → środek czworokąta) łączone w fasady; narożniki wypukłe/wklęsłe, styk kamienic (`party`), klucz kolumny `segKey` (ten sam na każdym piętrze) |
| `gen/cage.js` | trójliniowa deformacja kostki (FFD) + poprawne normalne |
| `gen/builder.js` | budowa geometrii: szum zależny od pozycji w świecie, pochylenie, AO, UV w metrach. `MATDEF` (stała `W`: **jeden szum dla wszystkich materiałów budynków**, inaczej plakaty i ramy „chowają się” w ścianie) |
| `gen/propmods.js` | ~46 nowych modułów rekwizytów (hydrant, słup ogłoszeniowy, stragany, altana, wiatrak, łódź, nagrobek…), dopinane do `M` przez `installProps` |
| `gen/modules.js` | ~45 modułów: ściany, okna (`windowParts`, `surround`, `glassFrame`), drzwi (`doorParts`), balkony (`balconyParts`), witryny, gzymsy, dachy, mosty, nabrzeża, drzewa (rekurencyjne, 4 gatunki), kioski, budki, przystanki, fontanna, tory, latarnia morska, molo, kościół (`church`: nawa z lancetowymi oknami i przyporami, wieża z iglicą, prezbiterium), komin fabryczny (`factorychimney`), ogrodzenie ogrodu (`fence`: ceglany cokół, kuta kratka z grotami; `fencepost`: ceglany słupek z kamienną głowicą i kulą), pas drobnej kostki (`sett`)… Okap (`eave`) ma konsole (`p.brackets`). Auta (`oldcar`, `carwheel`) dokleja `Object.assign(M, vehicleModules)` z `vehicles.js` |
| `gen/vehicles.js` | 6 typów aut (`CAR_KINDS`): tourer, taxi, sedan, van, truck, roadster. Gładkie „skóry” (`skin`, `ringX`, `lofted`, `rbox`) z superelips i policzonymi normalnymi, koło (`wheel`), błotniki, maska, chłodnica, lampy, kotwice kierowcy i pasażera (`carAnchors`). Parametr `q` = poziom detalu |
| `gen/people.js` | części ciała (`PEOPLE_PARTS`) z przegubem w początku układu: korpus (kurtka/płaszcz/suknia), głowa, fryzury, nakrycia głowy, ręce, nogi, buty. Materiał `cloth`, kolor z instanceColor |
| `gen/weapons.js` | karabin z zamkiem (`rifle`, `bolt`) i ręce w widoku z pierwszej osoby (`arms`) |
| `gen/fragments.js` | fragmenty fasady w metrach i moduły `panel` oraz `dormer`: okno (opaski `plain/lintel/band/ped/segm/cornice`, łuk, okiennice, kwiaty, kraty, konsolki pod parapetem `cons`), drzwi (prostokątne i z łukiem), balkon (kuta/tralki/pełny), francuski balkon, wykusz, boniowanie narożne, lizena, fryz z reliefem `frieze` (tekstura `T.frieze`: góra tynkowy wzór roślinny, dół ceglany pas krzyżykowy), boniowanie parteru `rust`, pasy ciemnego klinkieru `stripe`. `panel` rysuje ścianę z dowolną liczbą otworów (`wallHoles`) |
| `gen/facade.js` | `programOf` (program budynku: wymiary okien, opaski, balkony, wykusz, wejście, sklepy; najlepsza z 6 prób) i `panelPlan` (lista fragmentów jednego panelu wg klasy piętra: parter / piano nobile / środkowe / attyka). Ozdoby wybiera styl (`ST`: tokeny `frieze, sillb, cons, rust, archG, stripe`; dom z klinkieru dostaje je przez `tokens()`), a `scoreProgram` je liczy przy wyborze najlepszej próby. Ściany podwórzowe (`simple`) są bez ozdób. |
| `gen/assemble.js` | składanie fragmentu: `buildQuad` (ściany, dachy `roofSpec`, lukarny `roofDormers`, ćwiartki gruntu), `buildRoad` (wstęga, zaokrąglone końce, krawężniki maskowane), rekwizyty, `buildRiver`, `buildChunkLOD`, `buildGroundTile` |
| `gen/worker.js`, `gen/pool.js` | generacja w Web Workerach. Pula przełącza się na wątek główny, gdy workery nie działają (`?local` wymusza ten tryb). |
| `game/streaming.js` | fragmenty 80×80 m: detal blisko (170 m, w `?low` 90 m), dalej LOD |
| `game/collision.js` | siatka 0,5 m z typami: GROUND −0,05, ROAD +0,06, WALK +0,15, BRIDGE, SOLID. Jezdnia wypełniana na końcu, więc jest zawsze przejezdna. Ogrodzenia to wąskie pasy SOLID (±0,18 m), słupki to tarcze r 0,25 m. |
| `game/carkit.js` | siatki aut dla gry (`CarKit`: karoseria per typ i poziom detalu, koło wspólne), `modelParts` |
| `game/vehicle.js` | taksówka: wektor prędkości (drift), biegi, zawieszenie na sprężynach, koła, tylne światła, kolizje (ściany, boty, piesi), kamera zza auta |
| `game/traffic.js` | graf dróg, A* na kopcu, boty (pas, łuki Béziera, odstęp, pierwszeństwo, piesi), InstancedMesh per typ i materiał, koła instancjonowane, `raycast`/`shot` dla broni |
| `game/rig.js` | geometria części ciała, losowy wygląd (`makeStyle`), poza (`pose`: chód, siedzenie, machanie, upadek), `identityParts` |
| `game/crowd.js` | rysowanie wszystkich ludzi (piesi, kierowcy, pasażerowie): InstancedMesh na część ciała |
| `game/pedestrians.js` | silnik NPC: chodniki wzdłuż grafu, przejścia, unik, panika, upadek, `ahead`, `raycast`, `carHit`, `adopt` |
| `game/taxi.js` | pasażerowie jako ludzie z tłumu (czekają, machają, idą do drzwi, siadają, wysiadają), kursy, opłaty, napiwki |
| `game/weapon.js` | karabin: model w widoku z pierwszej osoby, strzał, rozrzut, zamek, przeładowanie, celowanie, trafienia, smugi |
| `game/audio.js` | dźwięk syntezowany (silnik, klakson, strzał, kroki, uderzenia, pisk opon) |
| `game/film.js` | TRYB FILMOWY (klawisz C, przycisk w menu): autopilot jedzie okrążenie wyspy (A* po grafie botów, pure pursuit, ~2–2,5 min), kamera przymocowana do auta (maska / zderzak / zza auta, V przełącza), FOV 100, jakość Ultra, bez HUD-u. `Vehicle.auto` = sterowanie autopilota. Nagrywa się zewnętrznie (OBS, Win+G). |
| `game/fx.js` | dym, kurz, ślady opon (Points + bufor pierścieniowy) |
| `game/player.js`, `game/hud.js` | chodzenie (wolne, wytrzymałość, kucanie, bezwładność), lot, mysz/dotyk; minimapa, panel kursu, strzałka, amunicja, celownik; nazwa okolicy z `KINDS` (Rynek, Stare Miasto, Planty, Śródmieście, Dzielnica willowa, Okolica fabryczna, Cmentarz…) |
| `render/*` | tekstury proceduralne (bruk w wachlarze `T.cobble`, piaskowiec `T.curb`, drobna kostka `T.sett`, fryz `T.frieze`, opadłe liście w `T.grass` i `T.slab`), materiały PBR, atlas plakatów, atmosfera (słońce, niebo, mapa otoczenia z sylwetką miasta) |
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
  | bruk | +0,06 |
  | asfalt | +0,07 |
  | chodniki i trawniki w mieście | +0,15 (`raised()`) |
  | krawężnik | +0,16 |

- **Plan miasteczka:** rynek i planty NIE są komórkami Voronoi, tylko wielokątami z `town.js` wyciętymi z sieci (`applyPlan`), a rodzaj dzielnicy punktu siatki to `plan.overrideKind` (rynek, planty), inaczej rodzaj najbliższego ziarna. Rzeka płynie w dowolnym kierunku: mosty liczy się po długości łuku (`riverSiteAt`), nigdy po osi x. Nowe rodzaje dzielnic dopisuj do `KINDS` (strefa, głębokość zabudowy `court`, nazwa); wysokości i style w `buildingInfo(…, ctx)`.
- **Jezdnia:** `rw` to 3,0 (uliczki P&M), 3,0–4,0 zależnie od dzielnicy (ulice Voronoi: Stare Miasto 3,0/3,4, śródmieście do 4,0, wille 3,6), 4,2 (ulice główne z bram, do mostu), 3,6 (wokół rynku i plant), 4,0 (główne P&M), 5,5 (autostrada), 3,5 (most). Punkt siatki jest pusty, jeśli `clearance < 5,2`, więc ściany zawsze są poza jezdnią.
- **Fasada z fragmentów:** okno ma stałą szerokość w metrach w całym budynku (`prog.w`), a nie ułamek odcinka; kolumny okien i balkonów leżą jedna nad drugą (klucz `segKey` bez piętra). Piętra mają klasy: `g` parter, `n` piano nobile (L=1 w kamienicy), `m` środkowe, `t` ostatnie przy ≥4 piętrach. Wejście stoi blisko środka fasady od ulicy i ma bogatszą oś nad sobą; balkony i wykusz są nad nim lub na innej kolumnie od ulicy.
- **Projekt budynku liczy się raz:** `classifyGrid` wybiera `grid.design` (bryła + styl) i `programOf` wybiera program fasady. Wszędzie bierz `designOf(city, bid, zone)`, nie `buildingInfo` — inaczej ćwiartki jednego budynku dostaną różne style. Próba `k` używa `hash(seed, bid, 717, k)`, więc wynik jest deterministyczny.
- **Rekwizyty:** jeden na punkt siatki. Muszą trzymać odstęp od jezdni (`clearance`), od budynków (`bldDist`) i od siebie (`free`). Drzewo zamiast wchodzić w dom zmniejsza się.
- **Determinizm:** to samo `generateCity(seed)` liczy się w każdym workerze. Wszystko losowe idzie przez `hash`/`Rng`.
- **Wydajność:** cała wyspa ma 5–6,5 mln trójkątów zależnie od planu (detal plus LOD). Auta-boty i ludzie są instancjonowani. Odbicia pochodzą z PMREM liczonego raz. Nie dodawaj postprocessingu, który kosztuje FPS. Mapa cieni odświeża się co drugą klatkę, rozdzielczość dopasowuje się do FPS (mnożnik `Settings.autoScale` 0,6…1 razy rozdzielczość z menu; wyłącza go pole „Automatyczna rozdzielczość”, a w trybie filmowym i przy otwartych ustawieniach stoi w miejscu), HUD odświeża się ok. 8 Hz, nowe fragmenty świata trafiają do sceny po jednym na klatkę (`Streamer.defer/tick`).
- **Optymalizacja generatora musi zachować geometrię co do bitu:** przed zmianą w `noise.js`, `builder.js`, `terrain.js` zapisz `npm run hash` (aktualnie seed 1984 = `7b683ac5`, po różnorodnych planach miasteczek; wcześniej `17c04c6f` po wzorcach ze zdjęć starego miasta, `ebc1249f` po fasadach z fragmentów i `4086ba8`; skrót zmienia się tylko, gdy celowo zmieniasz wygląd świata, np. zaparkowane auta), po zmianie generatora skrót ma się zgadzać.
- **Układ współrzędnych modeli ruchomych:** x = przód, y = góra, z = prawa strona (kierowca siedzi po lewej, z < 0). Kurs `heading` to kąt kierunku jazdy w płaszczyźnie (x, z): przód = (cos, sin), prawa = (−sin, cos); `mesh.rotation.y = −heading`.
- **Auta w świecie i w grze to ten sam moduł** (`oldcar`). Lakier to materiał `body` (kolor z wierzchołków albo z `instanceColor`), tylne światła `tail`, ludzie `cloth`. Zaparkowane auta mają stałą stopkę 3,6 × 1,7 m (klatka ściska moduł do ≤5%), więc typy parkowane (`PARKED_KINDS`) mają nominalną długość 3,6–3,85 m.
- **Piesi nie używają `Math.random`** w symulacji (Rng z ziarnem); efekty cząsteczkowe mogą.

### Ostatnie wyniki weryfikacji (seed 1984)

| narzędzie | wynik |
|---|---|
| `npm run check` | 2608 obiektów, 0 na jezdni, 0 nakładań, 0 ścian na jezdni, najwęższa jezdnia 6 m, 641 budynków, 714 odcinków ulic; 766 ogrodzeń i 1001 słupków: 0 na jezdni, w rzece, na moście i w rekwizytach |
| `npm run sim` | 34 auta, ~24 km/h średnio, ~21% stoi (korki to cecha gry; zależą od planu: ziarna 1–7 dają 11–25% stojących), najdłuższe czekanie ~12 s, 0 NaN; `node scripts/sim-traffic.mjs <ziarno>` |
| `npm run build-world` | 169 fragmentów, ok. 5,07 mln trójkątów (detal + LOD łącznie; zależy od planu: mniej budynków i niższa Starówka niż przy starym układzie, 6,42 mln), 0 błędów, 0 punktów lądu pod wodą; ~20 s |
| `npm run design` | determinizm OK; najlepsza z N: zbliżone kolory sąsiadów 34% → 21% (paleta dzielnicowa trzyma sąsiadów blisko), ten sam styl 31% → 26%; 16 224 paneli, 0 fragmentów poza panelem i 0 nakładających się otworów; 349 kombinacji na 641 budynków |
| `npm run sim-peds` | 60 pieszych, 0 w budynkach, 0 w wodzie, 0 NaN, ~15% pozycji na jezdni (przejścia i narożniki), 0,25 ms na krok |
| `npm run smoke` | 0 wyjątków i 0 NaN: jazda, kurs z pasażerem, wysiadanie, strzały (8/8 trafień przy wolnej linii; strzelec sam przenosi się do pieszego, bo układ miasta bywa różny), potrącenie |
| `node scripts/boot-test.mjs` | prawdziwy `main.js` (z ustawieniami i trybem filmowym) rusza i przechodzi scenariusz bez błędów (1269 klatek, 13 fragmentów, 1,42 mln trójkątów w scenie) |
| `node scripts/seeds.mjs 1 60` | 60 ziaren: 0 na jezdni, 0 ścian na jezdni, 0 lądu pod wodą, zawsze most i kościół (ratusz, chyba że rynek ma fontannę); typy: 18 lokacja, 23 owalnica, 10 ulicówka, 9 promienisty; ratusz pośrodku 37, z boku 9, fontanna 14; z `--build` ziarna 2–11 też bez NaN |
| `node scripts/plans.mjs 1 40` | rozkład typów, rzek i wysp; rynek ≥ 28 m od osi rzeki, obrys jądra na lądzie |
| `node scripts/audit-roads.mjs 1 16` | średnio 0 przecięć bez węzła, 0 wysp, ~5 ślepych uliczek na mapę, wynik ok. 72 |
| `node scripts/sim-film.mjs 1984` | autopilot: 1589 z 1592 m trasy w 165 s, 0 s poza jezdnią, 0 NaN (ziarna 3, 11 i 31337: 1400–1535 m w 135–172 s, 0 NaN) |

Fizyka taksówki (płaska płyta): 0–50 km/h w ~4,1 s, maksimum ~62 km/h, hamowanie z 61 km/h na ~16 m.

**Kontrakt `Vehicle` ↔ tryb filmowy.** `Vehicle(scene|null, grid, M, kit, kind)`: przy `scene = null` jest sama fizyka (skrypty `sim-film`, `sim-peds`). `car.auto = {steer, v}` zastępuje klawisze autopilotem; `car.steerMax()` = maks. skręt kół przy bieżącej prędkości, `car.wb` = rozstaw osi, `car.obstacles(x, z)` = boty w pobliżu (podpina je `main.js`). Zmieniając fizykę, odpal `node scripts/sim-film.mjs` na kilku ziarnach, bo autopilot jest czuły na zakręcanie i hamowanie.


15. Przegląd wyglądu zdjęciami: chodniki z płyt wchodziły na jezdnię (teraz ćwiartki przy jezdni są dzielone i docinane po kawałku), rynek nie miał ratusza (jezdnie wygenerowane przez L-system są usuwane z 21 m od środka, wieża z zegarami i miedzianym hełmem to `M.townhall`, `extras` typu `townhall`), puste pola płyt zamieniają się w trawniki z drzewami (`lawn()` w `grid.js`), nowe tekstury (tynk bez łat, cegła z paletą i jasną zaprawą, trawa ze stokrotkami, drewno), nowe drzewa (topola kolumnowa, gęsta korona dębu), pasażer z twarzą, budka, kiosk, przystanek, kosz.

13. **Mosty z segmentów 5 m** (`city/bridges.js`): miejskie, autostrada i kolejowy. Trasy (autostrada, tory) są prostowane na przecięciu rzeki (`straightenCrossing`). Segment `solid` na końcach (oparcie), reszta z łukiem. Zdjęcia: `--seed 4 --cam … --look …`.
14. **Układ dróg:** krawędzie Voronoi są proste (wyginanie usunięte, bo wyglądało brzydko), odgałęzienia L-systemu dokładnie prostopadłe, `tidyStreets` łączy odcinki i usuwa ślepe uliczki < 30 m.
15. **Warstwy nawierzchni** (`render/layers.js`): każda nawierzchnia ma warstwę; wyższa wygrywa test głębi (polygonOffset) i rysuje się później (renderOrder). Nowa nawierzchnia = wpis w `SURFACE` + materiał o tej samej nazwie.
16. **Rekwizyty:** `decorate` ustawia kandydatów wg priorytetu (punkty orientacyjne → budowle → wysokie słupy → drzewa → meble → drobiazgi → rośliny) i sprawdza prawdziwy odcisk (jezdnia, ściany z zapasem dla wysokich, rzeka, mosty, tory, autostrada, korony drzew). `check-world` liczy odciski z rejestru. 53 rodzaje, ~44 nowe.
9. **Nowa mapa przy każdym wejściu:** `main.js` losuje ziarno (`crypto.getRandomValues`), numer wyspy jest w rogu ekranu i na ekranie startowym razem z przyciskiem „Nowa wyspa” (też Shift+N). `?seed=N` albo `#N` w linku odtwarza tę samą wyspę. Losowanie jest tylko w `main.js`, generator nadal jest deterministyczny. Przed oddaniem zmian w generatorze odpal `node scripts/seeds.mjs 1 60 --build`, bo 1984 to jedno ziarno z wielu.
10. Naturalniejsze miasto: ulice z krawędzi Voronoi są łagodnie wyginane (`bendEdge`), kolory ścian z palety historycznych barw zależnej od dzielnicy (szum), wysokość kamienic maleje od rynku, wieże rzadsze, mocniejsze wzgórza na obrzeżach, drzewa przy ulicach. Punkt siatki, którego ćwiartka (nie tylko narożnik) sięga jezdni, przestaje być budynkiem.
11. Gałąź `ccr-ecc3ed84-ivhb3i` (inna sesja: ustawienia `settings.js`, większe miasto, asfalt bez pasów, most autostrady jako `city.bridges[].highway`) jest scalona z tą gałęzią. Przed publikacją gry zawsze zrób `Artifact read` i sprawdź, czy ktoś inny nie wrzucił nowszej wersji. Ruch uliczny po scaleniu jest o kilka km/h wolniejszy niż na tamtej gałęzi (ulice kręte).
12. Dachy: gzymsy (`cornice`, `string`) i okapy domów (`eave`) mają denka na końcach i element narożny w wypukłym rogu (parametry `endKind`, `cornerOwner` z `wallSegment`), wcześniej narożniki były dziurami. Mosty: poręcz nabrzeża to osobny moduł `quayrail` stawiany tylko tam, gdzie nie ma jezdni, mostu, torów ani autostrady; autostrada nad rzeką to most (`riverRun` w `routes.js`, `st.bridge` ustawiane w `layout.js`).

**Pułapka przy detalach tuż przed ścianą:** szum materiału (`wob`) liczy się w wierzchołkach. Jeden duży prostokąt ściany i detal 1 cm przed nim rozchodzą się o kilka cm i detal „tonie” w ścianie. Dużą ścianę dziel siatką ~0,8 m (`b.grid`) albo odsuń detal o ≥ 3 cm.

## Znane braki i pomysły na dalej

- Nie ma pory dnia i nocy (światła aut i latarnie są gotowe na noc: materiał `light`). Brak oświetlonych okien i podświetlonych fasad, które były na zdjęciach wzorcowych.
- Plan miasteczka: nie ma bram miejskich (wieży z łukiem nad drogą), typu „dwa jądra” (Stare i Nowe Miasto z dwoma rynkami), pól uprawnych za miastem (poza przedmieściami jest las i wydmy), wąskich działek Starego Miasta (budynki dalej z 1–2 punktów siatki) ani młyna na rzece. Fabryka to ceglane hale z kominem. Układ widziano tylko na planach z góry i zdjęciach z programowego aparatu, nie w prawdziwym WebGL.
- Nie ma tramwajów (tory, sieć trakcyjna, wagon): na zdjęciach wzorcowych były, ale użytkownik odrzucił tory (`routes.rail` jest pusta), więc tylko zaproponować.
- Ogrodzenia stoją tylko na krawędziach `T_GARDEN` od strony ulicy i podwórza; pachołki tylko przy bruku w mieście (`st.mat === 'cobble'`). Chodniki nadal są z płyt: asfaltowych jak na zdjęciach nie ma.
- Piesi nie siadają na ławkach, nie rozmawiają ze sobą i nie mijają się (brak kolizji piesi–piesi); kierowcy botów nie reagują na strzały poza zatrzymaniem na chwilę.
- Boty nie mają świateł hamowania (instancje), a nie widzą się na skrzyżowaniach bez węzła w grafie (np. przecięcia z torami).
- Karabin nie zostawia śladów po kulach, a hit-scan zakłada budynki do 18 m wysokości.
- Wygląd aut, ludzi i karabinu sprawdzono tylko rasteryzatorem programowym (`npm run model`), nie w prawdziwym WebGL: światło, cienie i FPS na urządzeniu użytkownika nie były widziane.
- LOD nie ma rekwizytów (lamp, ławek), drzewa w LOD to proste ostrosłupy.
- Dachy to wciąż ostrosłupy z lukarnami (bez kalenic i dachów dwuspadowych); lukarny stoją w osi odcinka ściany.
- Fasady: nie ma okien parami ani balkonów ciągłych na dwa przęsła. Szwy między panelami mają mikroszczeliny (T-złącza przy szumie `wob`), jak wcześniej.
- Większość „budynków” to 1–2 punkty siatki (409 z 835): wąskie kamienice w szeregu. Samotne słupki dostają niski dach, ale same działki nie są łączone.
- UV dachów: rzut z góry lub z boku, więc rzędy dachówek nie zawsze idą wzdłuż połaci.
- Pasażer siada w aucie przez `car.mesh.add`. Przy wysiadaniu jest usuwany. Działa, ale wsiadanie nie ma animacji.
- `?low` włącza się automatycznie na telefonach i przy ≤4 rdzeniach lub ≤4 GB RAM.

9. **Voronoi + L-system zostają i są dopracowane** (`netfix.js`, `audit.js`: planaryzacja, spójność, 3 warianty z wyborem po audycie, usuwanie cienkich komórek Voronoi, uliczka nie biegnie równolegle tuż obok drogi, most miejski nigdy w miejscu mostu autostrady, autostrada zawsze ciągła). Audyt: 0 przecięć bez węzła, 0 wysp, ~2 ślepe uliczki na mapę (przy rzece/plaży to norma). Próba zastąpienia ich planarnym grafem pierścieni (`plan.js`) została wycofana na prośbę użytkownika („ja chcę Voronoi i L-system”). Nie wracaj do regularnej siatki bez wyraźnej prośby. Tory usunięte na prośbę. Prześwity bramne (`ARCH`) bez podparcia (brak sąsiada z pełnym parterem) zamieniają się w zwykły budynek: to był „latający dom”.
10. **Most = kafelek `bridgeseg` 5 m.** Balustrada jest ciągła (bez pilastrów na styku, tralki o podziałce zgranej z segmentem), słupy tylko na samych końcach; jezdnia mostu to ta sama wstęga co ulica (`buildRoad`), pod nią kamienny pokład. Most ma `cols=3` (15 m: jezdnia 8,4 m + chodniki 3,3 m).
11. **Budżet dodatków.** `BUDGET` w `city/props.js` ogranicza liczbę sztuk każdego nowego rodzaju; razem ok. 95–100 nowych rzeczy na wyspę (lampy, ławki, kosze, budki, drzewa, krzewy i auta nie są liczone). Nie podnoś limitów bez prośby: użytkownik chciał „50–100 na mapę, bez chaosu”.

12. **Tryb filmowy** (`game/film.js`): użytkownik chciał filmik z przejazdu po całej wyspie z kamerą na aucie i szerokim kątem. Renderer w Node jest za wolny na film (35 s na klatkę 640×360), więc zrobiony jest tryb w grze, który użytkownik nagrywa sam. Trasa i autopilot sprawdzane skryptem `sim-film.mjs`. Zakleszczenie z botem: po 2,5 s bot obok znika, po 5 s auto przeskakuje 14 m po trasie.
13. **Ulice nie wchodzą w koryto rzeki** (`keepOffRiver` w `netfix.js`): krawędzie Voronoi biegnące po linii brzegu miały jezdnię do połowy w wodzie (13–33 na mapę), co blokowało auto jako SOLID. Teraz węzły odsuwają się od brzegu na szerokość jezdni + 1,2 m.

14. **Sesja `ccr-a540e01c-2z335y`** (optymalizacja, auta, chodzenie, karabin, piesi), scalona z gałęzią `ccr-82241717-wn3zfe`: generator ~35% szybszy bez zmiany geometrii (szum z tablicą gradientów, bufory typowane w `Builder`, `riverDist`), 6 typów aut z gładkimi skórami (`gen/vehicles.js`) i obracającymi się kołami, fizyka z poślizgiem i zawieszeniem, chodzenie 2,0 m/s (bieg 4,3, kucanie 1,05, celowanie 1,35; wytrzymałość), karabin po wyjściu z auta (E; X = strzał i Z = celowanie bez Pointer Lock), silnik pieszych (`pedestrians.js`) i szybki rysunek ludzi (`crowd.js`, `rig.js`), dźwięk syntezowany. Po scaleniu: `main.js` łączy oba światy (ustawienia, tryb filmowy, losowa wyspa przy wejściu, przycisk „Nowa wyspa”). Klawisz C = film w aucie, a pieszo = kucanie.
