/**
 * Resolve extensionless relative imports to `.ts` so `node --test` can load
 * the repo's TypeScript tests with --experimental-strip-types.
 */
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const hasExtension = specifier.split('/').pop()?.includes('.');
  if (isRelative && !hasExtension) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
