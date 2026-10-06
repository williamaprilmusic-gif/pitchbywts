// Module resolve hook: redirects '@neondatabase/serverless' to the in-memory stand-in (tests only).
export async function resolve(specifier, context, next) {
  if (specifier === '@neondatabase/serverless') return { url: new URL('./fakeNeon.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
