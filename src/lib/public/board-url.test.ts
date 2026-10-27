import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TODO: `boardUrl` lands in https://github.com/kayode96-max/Signpen_V2/pull/17.
 * This stays skipped until `src/lib/public/student-public.ts` exports it.
 * Then it checks that every board-link builder calls `boardUrl`, and that a
 * mixed-case id is lowercased in the URL.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const helperPath = path.join(root, 'src/lib/public/student-public.ts');
const helperSource = existsSync(helperPath) ? readFileSync(helperPath, 'utf8') : '';
const hasBoardUrl = /export function boardUrl\b/.test(helperSource);

const RAW_BOARD_LINK = /\$\{[^}]*origin[^}]*\}\/\$\{(?:studentId|boardId)\}/;

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, found);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) found.push(full);
  }
  return found;
}

describe('boardUrl', () => {
  const run = hasBoardUrl ? it : it.skip;

  run('board link builders go through boardUrl and lowercase a mixed-case id', async () => {
    const builders = sourceFiles(path.join(root, 'src'))
      .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
      .filter((entry) => entry.text.includes('boardUrl(') || RAW_BOARD_LINK.test(entry.text));

    expect(builders.length).toBeGreaterThan(0);
    for (const builder of builders) {
      expect(builder.text, `${builder.file} must call boardUrl`).toMatch(/boardUrl\(/);
      expect(builder.text, `${builder.file} must not interpolate a board id onto origin directly`).not.toMatch(
        RAW_BOARD_LINK,
      );
    }

    const mod = (await import(pathToFileURL(helperPath).href)) as {
      boardUrl: (id: string, origin: string) => string;
    };
    const mixed = 'QA-UNKNOWN-2026';
    const url = mod.boardUrl(`  ${mixed}  `, 'https://signpen.xyz/');
    expect(url).toBe('https://signpen.xyz/qa-unknown-2026');
    expect(url).toBe(url.toLowerCase());
  });
});
