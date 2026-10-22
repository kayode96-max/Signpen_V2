/**
 * Edge-cache tag for one board. The frontend must use this helper so a
 * signature write and a public page share the same string.
 */
export function boardCacheTag(studentId: string): string {
  return `board:${studentId}`;
}
