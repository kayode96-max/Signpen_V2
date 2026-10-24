import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

/**
 * TODO: `boardUrl` lands in https://github.com/kayode96-max/Signpen_V2/pull/17.
 * This stays skipped until `src/lib/public/student-public.ts` exports it.
 * Then it checks that every board-link builder calls `boardUrl`, and that a
 * mixed-case id is lowercased in the URL.
 */

const root = path.resolve(import.meta.dirname, '../../..');
const helperPath = path.join(root, 'src/lib/public/student-public.ts');
const helperSource = existsSync(helperPath) ? readFileSync(helperPath, 'utf8') : '';
const hasBoardUrl = /export function boardUrl\b/.test(helperSource);

const RAW_BOARD_LINK = /\$\{[^}]*origin[^}]*\}\/\$\{(?:studentId|boardId)\}/;

function sourceFiles(dir, found = []) {
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

test(
  'board link builders go through boardUrl and lowercase a mixed-case id',
  {
    skip: hasBoardUrl
      ? false
      : 'TODO: boardUrl is not on this branch. It lands in https://github.com/kayode96-max/Signpen_V2/pull/17',
  },
  async () => {
    const builders = sourceFiles(path.join(root, 'src'))
      .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
      .filter((entry) => entry.text.includes('boardUrl(') || RAW_BOARD_LINK.test(entry.text));

    assert.ok(builders.length > 0, 'expected at least one board-link builder');
    for (const builder of builders) {
      assert.match(builder.text, /boardUrl\(/, `${builder.file} must call boardUrl`);
      assert.doesNotMatch(
        builder.text,
        RAW_BOARD_LINK,
        `${builder.file} must not interpolate a board id onto origin directly`,
      );
    }

    const mod = await import(pathToFileURL(helperPath).href);
    const mixed = 'QA-UNKNOWN-2026';
    const url = mod.boardUrl(`  ${mixed}  `, 'https://signpen.xyz/');
    assert.equal(url, 'https://signpen.xyz/qa-unknown-2026');
    assert.equal(url, url.toLowerCase());
  },
);
