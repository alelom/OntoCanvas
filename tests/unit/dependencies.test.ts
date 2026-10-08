/**
 * Test to verify that all required dependencies are installed.
 * This helps catch issues where dependencies are missing from node_modules.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

/**
 * Check if a package exists in node_modules.
 */
function packageExists(packageName: string): boolean {
  const packagePath = join(PROJECT_ROOT, 'node_modules', packageName);
  return existsSync(packagePath);
}

/**
 * Check if a package has its main entry point.
 */
function packageHasMainEntry(packageName: string): boolean {
  const packagePath = join(PROJECT_ROOT, 'node_modules', packageName);
  if (!existsSync(packagePath)) return false;
  
  const packageJsonPath = join(packagePath, 'package.json');
  if (!existsSync(packageJsonPath)) return false;
  
  try {
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    // Check if main entry exists (if specified)
    if (packageJson.main) {
      const mainPath = join(packagePath, packageJson.main);
      return existsSync(mainPath);
    }
    // If no main specified, check for index.js
    const indexPath = join(packagePath, 'index.js');
    return existsSync(indexPath);
  } catch {
    return false;
  }
}

describe('Dependencies', () => {
  const requiredDependencies = [
    'n3',
    'rdf-parse',
    'readable-stream',
    'vis-data',
    'vis-network',
  ];

  for (const dep of requiredDependencies) {
    it(`should have ${dep} installed`, () => {
      expect(packageExists(dep)).toBe(true);
    });

    it(`should have ${dep} with valid main entry`, () => {
      expect(packageHasMainEntry(dep)).toBe(true);
    });
  }

  it('should have node_modules directory', () => {
    const nodeModulesPath = join(PROJECT_ROOT, 'node_modules');
    expect(existsSync(nodeModulesPath)).toBe(true);
  });

  // Resolving each package checks it can be imported without loading it: importing rdf-parse and
  // vis-network cold took over 10 s under a full parallel run (#83). The parser, graph and rendering
  // tests import them for real.
  for (const dep of ['n3', 'rdf-parse', 'vis-data', 'vis-network']) {
    it(`should resolve ${dep} for import`, () => {
      expect(() => createRequire(import.meta.url).resolve(dep)).not.toThrow();
    });
  }
});
