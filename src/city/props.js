// ─────────────────────────────────────────────────────────────────────────────
//  REJESTR REKWIZYTÓW — jedno źródło prawdy dla układu, modeli i kolizji.
//
//  size   [W, H, D]  komórka modułu w metrach (x wzdłuż lica, y w górę, z w głąb;
//                    z = 0 to strona zwrócona do jezdni, jeśli rekwizyt się orientuje)
//  r      promień odcisku przy ziemi (m): dwa rekwizyty nie mogą się nakładać
//  solid  [pół-x, pół-z] pudełko kolizji gracza i aut; null = da się przejść
//  tall   wyższy niż ~2,7 m: nie stoi pod koroną drzewa i trzyma odstęp od ścian
//         (markizy sięgają 1,3 m, balkony 1 m)
//  prio   kolejność stawiania: mniejsza liczba = pierwsza zajmuje miejsce
//           0 punkty orientacyjne · 1 budowle i stragany · 2 wysokie słupy ·
//           3 drzewa · 4 meble i sprzęty · 5 drobiazgi · 6 rośliny
//  orient 'road' (przodem do ulicy) | 'random' | 'along' (wzdłuż ulicy)
//  max    górny limit sztuk na całą wyspę
// ─────────────────────────────────────────────────────────────────────────────
export const PRIO = { landmark: 0, structure: 1, tall: 2, tree: 3, furniture: 4, small: 5, plant: 6 };

const P = (size, r, prio, o = {}) => ({ size, r, prio, solid: null, tall: false, orient: 'road', max: null, ...o });

export const PROPS = {
  // ── dotychczasowe ──────────────────────────────────────────────────────────
  lamp:      P([1, 6, 1], 0.35, PRIO.tall, { solid: [0.2, 0.2], tall: true, module: 'lamp' }),
  bench:     P([1.8, 1, 0.6], 1.0, PRIO.furniture, { solid: [0.9, 0.3], module: 'bench' }),
  bin:       P([0.7, 1, 0.7], 0.4, PRIO.small, { solid: [0.3, 0.3] }),
  booth:     P([1, 2.5, 1], 0.7, PRIO.structure, { solid: [0.5, 0.5] }),
  kiosk:     P([2.4, 3.2, 2], 1.6, PRIO.structure, { solid: [1.2, 1.0], tall: true }),
  busstop:   P([3.2, 3.1, 1.4], 1.35, PRIO.structure, { solid: [1.6, 0.7], tall: true }),
  bush:      P([2.2, 1.7, 2.2], 1.1, PRIO.plant, { orient: 'random' }),
  car:       P([3.6, 2.2, 1.7], 1.9, PRIO.furniture, { solid: [1.8, 0.85], module: 'oldcar', orient: 'random' }),
  column:    P([1, 1, 1], 0.4, PRIO.landmark, { solid: [0.35, 0.35] }),
  // ── ulica ──────────────────────────────────────────────────────────────────
  hydrant:   P([0.5, 1, 0.5], 0.3, PRIO.small, { solid: [0.2, 0.2] }),
  postbox:   P([0.6, 1.5, 0.6], 0.35, PRIO.small, { solid: [0.25, 0.25] }),
  bollard:   P([0.3, 0.8, 0.3], 0.2, PRIO.small, { solid: [0.12, 0.12] }),
  adcolumn:  P([1.7, 3.6, 1.7], 0.95, PRIO.structure, { solid: [0.85, 0.85], tall: true, orient: 'random' }),
  streetclock: P([0.8, 4.4, 0.8], 0.4, PRIO.tall, { solid: [0.2, 0.2], tall: true }),
  signpost:  P([1.1, 3.1, 1.1], 0.4, PRIO.tall, { solid: [0.15, 0.15], tall: true, orient: 'random' }),
  pump:      P([0.7, 1.6, 0.7], 0.45, PRIO.furniture, { solid: [0.3, 0.3] }),
  planter:   P([1.1, 1.1, 1.1], 0.7, PRIO.furniture, { solid: [0.5, 0.5], orient: 'random' }),
  sandwich:  P([0.8, 1, 0.65], 0.45, PRIO.small, { solid: [0.35, 0.28] }),
  trough:    P([2.1, 0.9, 0.8], 1.2, PRIO.furniture, { solid: [1.0, 0.35], orient: 'along' }),
  lampdouble: P([1.5, 6, 0.6], 0.5, PRIO.tall, { solid: [0.2, 0.2], tall: true, orient: 'along' }),
  cafeset:   P([2.6, 2.7, 2.6], 1.5, PRIO.structure, { tall: true, orient: 'random', solid: [0.5, 0.5] }),
  bicycle:   P([1.8, 1.1, 0.5], 0.9, PRIO.small, { orient: 'along' }),
  // ── handel i transport ─────────────────────────────────────────────────────
  stall:     P([2.8, 2.9, 2.0], 1.7, PRIO.structure, { solid: [1.3, 0.9], tall: true }),
  fruitstall: P([2.4, 2.5, 1.6], 1.5, PRIO.structure, { solid: [1.1, 0.7], tall: true }),
  flowerstand: P([1.7, 2.1, 1.0], 1.0, PRIO.structure, { solid: [0.8, 0.45], tall: true }),
  handcart:  P([1.9, 1.1, 0.9], 1.0, PRIO.furniture, { solid: [0.8, 0.4], orient: 'along' }),
  crates:    P([1.3, 1.2, 1.0], 0.8, PRIO.furniture, { solid: [0.6, 0.45] }),
  barrels:   P([1.4, 1.1, 1.2], 0.8, PRIO.furniture, { solid: [0.65, 0.55] }),
  wagon:     P([4.3, 1.9, 1.9], 2.3, PRIO.structure, { solid: [2.0, 0.8], orient: 'along', max: 24 }),
  firewood:  P([1.7, 1.3, 1.0], 0.95, PRIO.furniture, { solid: [0.8, 0.45], orient: 'along' }),
  // ── park i plac ────────────────────────────────────────────────────────────
  statue:    P([1.7, 4.6, 1.7], 1.0, PRIO.landmark, { solid: [0.8, 0.8], tall: true, max: 8 }),
  gazebo:    P([5.2, 4.6, 5.2], 2.9, PRIO.landmark, { solid: [2.5, 2.5], tall: true, orient: 'random', max: 5 }),
  well:      P([1.7, 2.7, 1.7], 0.95, PRIO.landmark, { solid: [0.75, 0.75], tall: true, orient: 'random', max: 12 }),
  pergola:   P([4.2, 2.9, 2.4], 2.3, PRIO.structure, { tall: true, orient: 'random', max: 12 }),
  flowerbed: P([3.2, 0.7, 3.2], 1.7, PRIO.furniture, { orient: 'random', solid: [1.4, 1.4] }),
  sundial:   P([1.0, 1.3, 1.0], 0.55, PRIO.small, { solid: [0.4, 0.4], orient: 'random', max: 8 }),
  swing:     P([3.1, 2.5, 1.9], 1.9, PRIO.structure, { tall: false, orient: 'random', max: 8 }),
  sandbox:   P([2.3, 0.4, 2.3], 1.3, PRIO.furniture, { orient: 'random', max: 10 }),
  hedge:     P([3.0, 1.2, 1.0], 1.4, PRIO.plant, { solid: [1.4, 0.45], orient: 'along' }),
  // ── ogród i podwórze ───────────────────────────────────────────────────────
  shed:      P([3.0, 2.7, 2.4], 1.8, PRIO.structure, { solid: [1.4, 1.1], tall: true, orient: 'random' }),
  beehive:   P([1.6, 1.2, 0.9], 0.9, PRIO.small, { solid: [0.7, 0.4], orient: 'random' }),
  haystack:  P([2.7, 2.9, 2.7], 1.4, PRIO.structure, { solid: [1.2, 1.2], tall: true, orient: 'random' }),
  clothesline: P([3.6, 2.3, 0.7], 1.8, PRIO.furniture, { orient: 'along', solid: null }),
  coop:      P([1.9, 1.5, 1.3], 1.0, PRIO.furniture, { solid: [0.9, 0.6], orient: 'random' }),
  // ── dzika przyroda i wybrzeże ──────────────────────────────────────────────
  rock:      P([1.8, 1.1, 1.5], 0.85, PRIO.furniture, { solid: [0.8, 0.65], orient: 'random' }),
  stump:     P([0.9, 0.7, 0.9], 0.45, PRIO.small, { solid: [0.3, 0.3], orient: 'random' }),
  shrine:    P([1.4, 3.1, 1.2], 0.7, PRIO.structure, { solid: [0.3, 0.3], tall: true, max: 14 }),
  roadcross: P([1.1, 2.9, 0.9], 0.5, PRIO.structure, { solid: [0.3, 0.3], tall: true, max: 14 }),
  milestone: P([0.55, 1.0, 0.45], 0.3, PRIO.small, { solid: [0.22, 0.2], max: 30 }),
  windmill:  P([7.4, 11.5, 7.4], 3.6, PRIO.landmark, { solid: [2.4, 2.4], tall: true, orient: 'random', max: 3 }),
  rowboat:   P([3.5, 1.0, 1.5], 1.8, PRIO.furniture, { solid: [1.6, 0.7], orient: 'along', max: 20 }),
  deckchair: P([2.6, 2.4, 2.6], 1.5, PRIO.furniture, { orient: 'random', solid: [0.3, 0.3] }),
  telegraph: P([1.8, 7.5, 0.8], 0.4, PRIO.tall, { solid: [0.15, 0.15], tall: true, orient: 'along' }),
};

// Nowe rodzaje (bez dotychczasowych): do liczenia i do zdjęć studyjnych
export const NEW_KINDS = Object.keys(PROPS).filter((k) => !['lamp', 'bench', 'bin', 'booth', 'kiosk', 'busstop', 'bush', 'car', 'column'].includes(k));

// moduł (funkcja z modules.js) dla rodzaju
export const moduleOf = (kind) => PROPS[kind].module || kind;

// ── co gdzie stoi: tabele wag na strefę (suma < 1; reszta = pusto) ───────────
//  walk  chodnik przy budynkach · plaza rynek · park park · wild las i wydmy ·
//  beach plaża · court podwórze · garden ogród · lawn trawnik przy ulicy · edge
//  pobocze za miastem (słupy telegraficzne, kamienie milowe, krzyże)
export const ZONES = {
  walk: [['lamp', 0.16], ['bin', 0.05], ['bench', 0.04], ['booth', 0.02], ['kiosk', 0.02], ['busstop', 0.02], ['bush', 0.03], ['tree', 0.06],
    ['hydrant', 0.022], ['postbox', 0.016], ['bollard', 0.02], ['adcolumn', 0.009], ['streetclock', 0.008], ['signpost', 0.01], ['pump', 0.008], ['planter', 0.02],
    ['sandwich', 0.016], ['trough', 0.006], ['cafeset', 0.014], ['bicycle', 0.01], ['stall', 0.008], ['fruitstall', 0.006], ['flowerstand', 0.007],
    ['handcart', 0.008], ['crates', 0.01], ['barrels', 0.01], ['wagon', 0.004], ['firewood', 0.005], ['lampdouble', 0.01]],
  plaza: [['lamp', 0.05], ['lampdouble', 0.04], ['bench', 0.06], ['tree', 0.06], ['stall', 0.05], ['fruitstall', 0.03], ['flowerstand', 0.035], ['cafeset', 0.05],
    ['adcolumn', 0.02], ['planter', 0.035], ['crates', 0.015], ['handcart', 0.015], ['barrels', 0.01], ['statue', 0.006], ['well', 0.004], ['streetclock', 0.01], ['sundial', 0.004]],
  park: [['tree', 0.32], ['bench', 0.08], ['bush', 0.1], ['lamp', 0.03], ['flowerbed', 0.05], ['gazebo', 0.006], ['pergola', 0.008], ['sundial', 0.004], ['swing', 0.005],
    ['sandbox', 0.005], ['hedge', 0.04], ['statue', 0.005], ['well', 0.003], ['planter', 0.01], ['stump', 0.01], ['rock', 0.015], ['lampdouble', 0.01], ['signpost', 0.004]],
  wild: [['tree', 0.45], ['bush', 0.15], ['rock', 0.02], ['stump', 0.01], ['haystack', 0.008], ['shrine', 0.004], ['roadcross', 0.004], ['windmill', 0.003]],
  beach: [['tree', 0.04], ['bench', 0.02], ['deckchair', 0.05], ['rowboat', 0.03], ['rock', 0.02]],
  court: [['tree', 0.1], ['bush', 0.07], ['bench', 0.03], ['car', 0.02], ['barrels', 0.04], ['crates', 0.04], ['firewood', 0.04], ['clothesline', 0.03],
    ['handcart', 0.02], ['wagon', 0.008], ['pump', 0.012], ['well', 0.008], ['shed', 0.02], ['coop', 0.012], ['planter', 0.02], ['hydrant', 0.01]],
  garden: [['tree', 0.34], ['bush', 0.2], ['car', 0.03], ['shed', 0.05], ['beehive', 0.04], ['haystack', 0.02], ['clothesline', 0.03], ['coop', 0.03],
    ['firewood', 0.03], ['flowerbed', 0.05], ['well', 0.01], ['handcart', 0.02], ['stump', 0.01]],
  lawn: [['tree', 0.12], ['bush', 0.07], ['bench', 0.02], ['lamp', 0.02], ['flowerbed', 0.04], ['planter', 0.02], ['statue', 0.004], ['sundial', 0.004], ['hedge', 0.03]],
  edge: [['telegraph', 0.12], ['milestone', 0.03], ['roadcross', 0.01], ['shrine', 0.008], ['rock', 0.03], ['haystack', 0.01]],
};

// wybór rodzaju z tabeli strefy dla liczby hv ∈ [0, 1)
export function pickKind(zone, hv) {
  let acc = 0;
  for (const [kind, w] of ZONES[zone]) { acc += w; if (hv < acc) return kind; }
  return null;
}
