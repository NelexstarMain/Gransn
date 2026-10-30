// three.js bez WebGL: wszystko prawdziwe poza rendererem i PMREM (te wymagają GPU).
export * from '../node_modules/three/build/three.module.js';
import { Texture } from '../node_modules/three/build/three.module.js';
export class WebGLRenderer {
  constructor() {
    this.shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false };
    this.info = { render: { calls: 0 } };
    this.domElement = globalThis.document.createElement('canvas');
    this.frames = 0;
  }
  setPixelRatio() {} setSize() {} render() { this.frames++; }
}
export class PMREMGenerator {
  fromScene() { return { texture: new Texture() }; }
}
