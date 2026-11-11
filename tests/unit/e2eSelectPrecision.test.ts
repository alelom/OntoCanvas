/**
 * The E2E selection follows only the imports that can change what runs (#198): a type-only import vanishes when the app is
 * built, so a change to the module it names cannot break an E2E test through it.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImporterGraph } from '../../scripts/e2eSelect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const root = mkdtempSync(join(tmpdir(), 'e2e-select-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function tree(files: Record<string, string>): (file: string) => string[] {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return buildImporterGraph(root);
}

describe('buildImporterGraph and type-only imports', () => {
  const importersOf = tree({
    'src/types.ts': 'export interface T { a: number }',
    'src/values.ts': 'export const v = 1; export interface V { b: string }',
    'src/onlyTypes.ts': "import type { T } from './types';\nimport type {\n  V,\n} from './values';\nexport type { T } from './types';\nexport const x: T | V | null = null;",
    'src/mixed.ts': "import { v, type V } from './values';\nexport const y: V | number = v;",
    'src/plain.ts': "import { v } from './values';\nexport const z = v;",
  });

  it('leaves out an import or re-export of types only, on one line or several', () => {
    expect(importersOf('src/types.ts')).toEqual([]);
    expect(importersOf('src/values.ts')).not.toContain('src/onlyTypes.ts');
  });

  it('keeps an import that brings a value, with types or not', () => {
    expect(importersOf('src/values.ts').sort()).toEqual(['src/mixed.ts', 'src/plain.ts']);
  });
});

describe('the real area map places every module (#198)', () => {
  it('a change to any module under src/ selects areas, never everything because no area places it', async () => {
    const { loadConfig, selectAreas } = await import('../../scripts/e2eSelect.mjs');
    const { readdirSync } = await import('node:fs');
    const config = loadConfig();
    const importersOf = buildImporterGraph();
    const walk = (dir: string): string[] =>
      readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts') ? [`${dir}/${e.name}`] : []
      );

    const unplaced = walk('src').filter((file) => selectAreas([file], config, importersOf).unplaced.includes(file));

    // A new module: list it under the area whose E2E tests exercise it, in tests/e2e/areas.json.
    expect(unplaced).toEqual([]);
  });

  it('a unit test file, or .gitignore, selects no E2E area: the unit job runs the first, and the second runs nothing', async () => {
    const { loadConfig, selectAreas } = await import('../../scripts/e2eSelect.mjs');
    const config = loadConfig();

    const selection = selectAreas(['src/parser.test.ts', 'src/main.test.ts', 'tests/unit/checksTab.test.ts', '.gitignore'], config, buildImporterGraph());

    expect(selection.all).toBe(false);
    expect(selection.areas).toEqual([]);
  });
});
