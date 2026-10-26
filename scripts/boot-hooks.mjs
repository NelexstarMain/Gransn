// Hak ładowania modułów dla boot-test: import 'three' → atrapa z fałszywym rendererem (bez GPU).
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('./boot-three-stub.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
