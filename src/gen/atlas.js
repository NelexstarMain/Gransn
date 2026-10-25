// Układ atlasu plakatów/szyldów (2048×2048). Wspólny dla workera (UV) i
// wątku głównego (rysowanie canvasa). Prostokąty w pikselach canvasa.
export const ATLAS_SIZE = 2048;

export const ATLAS = {
  // plakaty (512×1024)
  bb0: [0, 0, 512, 1024],
  bb1: [512, 0, 512, 1024],
  bb2: [1024, 0, 512, 1024],
  bb3: [1536, 0, 512, 1024],
  bb4: [0, 1024, 512, 1024], // zdjęcie 1
  bb5: [512, 1024, 512, 1024], // zdjęcie 2
  war: [1024, 1024, 1024, 256],
  freedom: [1024, 1280, 1024, 256],
  ignorance: [1024, 1536, 1024, 256],
  milk: [1024, 1792, 512, 128],
  bread: [1536, 1792, 512, 128],
  gin: [1024, 1920, 512, 128],
  tobacco: [1536, 1920, 512, 128],
};

// plakaty i reklamy (zdjęcia = reklama taksówek, losowane najczęściej)
export const POSTERS = ['bb4', 'bb5', 'bb4', 'bb5', 'bb0', 'bb1', 'bb2', 'bb3'];
export const PHOTOS = { bb4: { src: 'posters/brat1.jpg', top: 'TAXI GRANSN', text: 'ZADZWOŃ: 919' }, bb5: { src: 'posters/brat2.jpg', top: 'TAXI GRANSN', text: 'JEDZIEMY!' } };

export const SLOGANS = {
  war: 'TAXI GRANSN · 919',
  freedom: 'KINO ODEON',
  ignorance: 'KAWIARNIA PORT',
  milk: 'MLECZARNIA',
  bread: 'PIEKARNIA',
  gin: 'PRASA',
  tobacco: 'APTEKA',
};

export const SHOP_SIGNS = ['milk', 'bread', 'gin', 'tobacco'];

export function atlasAspect(name) {
  const r = ATLAS[name] || ATLAS.bb0;
  return r[2] / r[3];
}

// UV dla quada [lewy-dół, prawy-dół, prawy-góra, lewy-góra]
export function atlasUV(name) {
  const [x, y, w, h] = ATLAS[name] || ATLAS.bb0;
  const u0 = x / ATLAS_SIZE, u1 = (x + w) / ATLAS_SIZE;
  const v1 = 1 - y / ATLAS_SIZE, v0 = 1 - (y + h) / ATLAS_SIZE;
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}
