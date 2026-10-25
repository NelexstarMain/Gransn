# 1984 — Pas Startowy Jeden

Open world 3D w przeglądarce (Three.js). Około **1,6 km²** miasta (siatka 14×14 kwartałów, ~1,26 × 1,26 km): kamienice w pierzejach, podwórza-studnie z bramami przejazdowymi, chodniki z płyt, granitowe krawężniki, bruk z kocich łbów, latarnie, teleekrany, plakaty Wielkiego Brata i Ministerstwo Prawdy na środku placu.

**Całość składa się z 21 modułów i nie używa żadnego pliku graficznego ani modelu 3D.** Tekstury są generowane szumem i diagramami Voronoi.

```bash
npm install
npm run dev        # http://localhost:5173
```

Sterowanie: **WASD** chodzenie, **mysz** rozglądanie, **Shift** bieg, **Spacja** skok, **F** tryb lotu (Spacja/C góra/dół), **H** ukrycie HUD-u. Parametr `?seed=1234` generuje inne miasto.

## Metoda: deformacja klatki (cage / FFD) + szum

Technika pochodzi z gier Oskara Stålberga (*Townscaper*, *Bad North*). Opisuje ją m.in. jego wykład „Organic towns from square tiles”. U podstaw leży Free-Form Deformation (Sederberg & Parry, 1986).

1. **Moduł jest projektowany w idealnej kostce** (u, v, w ∈ [0,1]): okno, gzyms, brama, dach i tak dalej.
2. **Świat dzieli się na nieregularne komórki.** Węzły siatki ulic są losowo przesunięte, więc kwartały to dowolne czworokąty, a działki na narożnikach są trapezami. Każda komórka ma 8 narożników.
3. **Każdy wierzchołek modułu jest mapowany interpolacją trójliniową** na te 8 narożników (`src/gen/cage.js`). Kostka „dopasowuje się” do każdego kształtu. Normalne przekształcamy macierzą dopełnień algebraicznych jakobianu, więc oświetlenie zostaje poprawne.
4. **Ekstrapolacja poza kostkę** (w < 0: gzymsy, balkony, okap) na narożnikach kwartału automatycznie daje cięcie pod kątem (miter). Dachy sąsiednich krawędzi schodzą się w kosz i grzbiet bez żadnego specjalnego kodu.
5. **Szum jest funkcją pozycji w świecie** (`src/gen/builder.js`), więc wspólne wierzchołki sąsiednich modułów przesuwają się identycznie i nie powstają szczeliny:
   - *pochylenie*: kamienice lekko „pływają” proporcjonalnie do wysokości,
   - *falowanie*: nierówny tynk i cegła,
   - *wybrzuszenia*: nierówny bruk i płyty,
   - *brud i AO*: ciemniejsze dołem, plamy w skali kilku metrów.
6. **Moduły dobiera się regułami sąsiedztwa** (lekka wersja Wave Function Collapse, `src/gen/assemble.js`): brama nigdy obok drzwi, witryny w ciągu, balkony w osi, okna w pionie, ściany ogniowe tylko nad niższym sąsiadem.

W efekcie 21 assetów daje setki tysięcy unikalnych komórek: każde przęsło ma inną szerokość, wysokość kondygnacji, kąt i szum.

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
| 11 | `cornice` — gzyms wieńczący | | |

Wielki Brat ma cztery proceduralne wizerunki (`src/render/posters.js`): klasyczny („Patrzy na ciebie”), w czapce oficerskiej („Czuwa nad tobą”), wszechwidzące oko („Widzi wszystko”) i konstruktywistyczny profil („Prowadzi nas”). Plakaty losują wariant.

## Architektura

```
src/core/       RNG (deterministyczny), szum Perlina
src/gen/        cage.js (FFD), builder.js (szum, normalne, UV w metrach),
                modules.js (21 segmentów), assemble.js (reguły, kwartały, LOD),
                worker.js + pool.js (generowanie w Web Workerach)
src/city/       layout.js — ulice, kwartały, działki, bramy, latarnie
src/render/     proceduralne tekstury PBR, atlas plakatów, teleekran, atmosfera
src/game/       gracz (FPS), siatka kolizji 0,5 m, strumieniowanie, HUD
```

- **Strumieniowanie:** kwartały w promieniu ~170 m od gracza są składane z modułów w workerach. Dalej stoją tanie bryły LOD z teksturą fasady. Gęsta, „orwellowska” mgła ukrywa przejście.
- **Kolizje** rasteryzuje się z tych samych danych co geometrię. Przez bramy da się wejść na podwórza.
- `?test` renderuje klatki tylko na żądanie (do zrzutów ekranu w headless).
