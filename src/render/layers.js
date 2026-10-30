// ─────────────────────────────────────────────────────────────────────────────
//  KOLEJNOŚĆ WARSTW NAWIERZCHNI (od dołu do góry)
//  Każda nawierzchnia ma jedną warstwę. Z niej biorą się trzy rzeczy naraz:
//   • wysokość nad terenem (y) — geometria w assemble.js i modułach,
//   • kolejność rysowania (renderOrder) — niższe warstwy rysują się pierwsze,
//   • przesunięcie głębi (polygonOffset) — wyższa warstwa zawsze wygrywa test głębi,
//     więc dwie nawierzchnie leżące centymetry od siebie nigdy nie migają ani nie
//     „przechodzą przez siebie”, także z daleka (bufor głębi ma tam rozdzielczość
//     kilku centymetrów).
//  Nowa nawierzchnia = jeden wpis tutaj i materiał o tej samej nazwie w materials.js.
// ─────────────────────────────────────────────────────────────────────────────
export const SURFACE = {
  grass:   { layer: 0, y: -0.05 }, // podkład terenu (trawa)
  sand:    { layer: 0, y: -0.05 }, // podkład terenu (plaża)
  lodwalk: { layer: 1, y: 0.1 },   // chodniki w LOD (pod wszystkimi jezdniami)
  gravel:  { layer: 2, y: 0.05 },  // droga gruntowa
  cobble:  { layer: 3, y: 0.06 },  // bruk jezdni
  asphalt: { layer: 4, y: 0.07 },  // asfalt
  slab:    { layer: 5, y: 0.15 },  // chodnik z płyt
  lawn:    { layer: 5, y: 0.15 },  // trawnik w mieście
  cobblep: { layer: 5, y: 0.15 },  // bruk placu i podwórza
  sett:    { layer: 6, y: 0.152 }, // pas małej kostki przy krawężniku
  curb:    { layer: 7, y: 0.16 },  // krawężnik
};

// wysokości nad terenem dla geometrii (jedno źródło prawdy)
export const SURF_Y = {
  base: SURFACE.grass.y, dirt: SURFACE.gravel.y, cobble: SURFACE.cobble.y, asphalt: SURFACE.asphalt.y,
  paved: SURFACE.slab.y, curb: SURFACE.curb.y,
};

export const isSurface = (name) => Object.prototype.hasOwnProperty.call(SURFACE, name);
export const surfaceOrder = (name) => (isSurface(name) ? SURFACE[name].layer - 10 : 0);

// parametry przesunięcia głębi materiału warstwy (units rośnie z warstwą; 0 = podkład)
export function depthOffset(name) {
  const l = SURFACE[name]?.layer ?? 0;
  return l ? { polygonOffset: true, polygonOffsetFactor: -l, polygonOffsetUnits: -2 * l } : null;
}
