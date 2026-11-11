/**
 * The E2E selection follows only the imports that can change what runs (#198): a type-only import vanishes when the app is
 * built, so a change to the module it names cannot break an E2E test through it.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildImporterGraph } from '../../scripts/e2eSelect.mjs';

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
