// Układ atlasu plakatów/szyldów (2048×2048). Wspólny dla workera (UV) i
// wątku głównego (rysowanie canvasa). Prostokąty w pikselach canvasa.
export const ATLAS_SIZE = 2048;

export const ATLAS = {
  // cztery wizerunki Wielkiego Brata (górny rząd, 512×1024 każdy)
  bb0: [0, 0, 512, 1024],
  bb1: [512, 0, 512, 1024],
  bb2: [1024, 0, 512, 1024],
  bb3: [1536, 0, 512, 1024],
  war: [0, 1024, 1024, 400],
  freedom: [1024, 1024, 1024, 400],
  ignorance: [0, 1424, 1024, 400],
  milk: [1024, 1424, 1024, 200],
  bread: [1024, 1624, 1024, 200],
  gin: [0, 1824, 1024, 200],
  tobacco: [1024, 1824, 1024, 200],
};

export const BIG_BROTHER = ['bb0', 'bb1', 'bb2', 'bb3'];

export const SLOGANS = {
  war: 'WOJNA TO POKÓJ',
  freedom: 'WOLNOŚĆ TO NIEWOLA',
  ignorance: 'IGNORANCJA TO SIŁA',
  milk: 'MLECZARNIA Nr 7',
  bread: 'PIEKARNIA',
  gin: 'DŻIN ZWYCIĘSTWO',
  tobacco: 'PAPIEROSY ZWYCIĘSTWO',
};

export const SHOP_SIGNS = ['milk', 'bread', 'gin', 'tobacco'];

// UV dla quada [lewy-dół, prawy-dół, prawy-góra, lewy-góra]
export function atlasUV(name) {
  const [x, y, w, h] = ATLAS[name] || ATLAS.bb0;
  const u0 = x / ATLAS_SIZE, u1 = (x + w) / ATLAS_SIZE;
  const v1 = 1 - y / ATLAS_SIZE, v0 = 1 - (y + h) / ATLAS_SIZE;
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}
