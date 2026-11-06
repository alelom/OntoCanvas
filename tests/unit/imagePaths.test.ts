/**
 * Image paths in data (#228): which values are image paths, and where each one is in an opened folder or next to a data address.
 * A run writes its image paths relative to the folder above `runs/`, not to the data file.
 */
import { describe, it, expect } from 'vitest';
import { findInFolder, isImagePath, pathParts, resolveAgainstUrl } from '../../src/abox/imagePaths';

describe('isImagePath', () => {
  it('reads the extension, whatever its case, before any query', () => {
    expect(['images/a.png', 'B.JPG', 'c.jpeg', 'https://x.org/d.svg?v=2', 'e.webp', 'f.gif'].every(isImagePath)).toBe(true);
    expect(['a.ttl', 'png', 'https://x.org/image', 'a.png.txt'].some(isImagePath)).toBe(false);
  });
});

describe('pathParts', () => {
  it('reads backslashes, %20, . and ..', () => {
    expect(pathParts('.\\images\\page%201\\..\\page 2\\a.png')).toEqual(['images', 'page 2', 'a.png']);
  });
});

describe('findInFolder', () => {
  // The folder of one run, opened: its files relative to it.
  const RUN = new Set(['part-0001.nq.gz', 'images/page-1/titleblock.png', 'images/page-2/titleblock.png']);

  it("finds a path relative to the data file's own folder first", () => {
    const paths = new Set(['data/images/a.png', 'images/a.png']);
    expect(findInFolder('images/a.png', paths, 'data')).toBe('data/images/a.png');
  });

  it('then relative to the folder', () => {
    expect(findInFolder('images/page-1/titleblock.png', RUN, 'sub')).toBe('images/page-1/titleblock.png');
  });

  it('then relative to a folder above the one opened: the path goes through its name', () => {
    expect(findInFolder('runs/run-0001/images/page-2/titleblock.png', RUN, '', 'run-0001')).toBe('images/page-2/titleblock.png');
  });

  it('then relative to a folder inside the one opened, when one file only ends with it', () => {
    const above = new Set(['runs/run-0001/images/page-1/titleblock.png', 'runs/run-0002/images/page-9/titleblock.png']);
    expect(findInFolder('images/page-1/titleblock.png', above)).toBe('runs/run-0001/images/page-1/titleblock.png');
    // Two runs with the same path: no guess.
    const twice = new Set(['runs/run-0001/images/page-1/titleblock.png', 'runs/run-0002/images/page-1/titleblock.png']);
    expect(findInFolder('images/page-1/titleblock.png', twice)).toBeNull();
  });

  it('does not take an address, or a file the folder does not hold', () => {
    expect(findInFolder('https://example.org/images/page-1/titleblock.png', RUN)).toBeNull();
    expect(findInFolder('file:///C:/runs/images/page-1/titleblock.png', RUN)).toBeNull();
    expect(findInFolder('images/page-3/titleblock.png', RUN, '', 'run-0001')).toBeNull();
  });
});

describe('resolveAgainstUrl', () => {
  const PART = 'https://example.org/data/runs/run-0001/part-0001.nq.gz';

  it("resolves a path against the data file's folder", () => {
    expect(resolveAgainstUrl('images/page-1/titleblock.png', PART)).toBe('https://example.org/data/runs/run-0001/images/page-1/titleblock.png');
  });

  it('without the folders the path and the address have in common', () => {
    expect(resolveAgainstUrl('runs/run-0001/images/page-1/titleblock.png', PART)).toBe('https://example.org/data/runs/run-0001/images/page-1/titleblock.png');
  });

  it('keeps an http address, and gives nothing for another scheme', () => {
    expect(resolveAgainstUrl('https://img.example.org/a.png', PART)).toBe('https://img.example.org/a.png');
    expect(resolveAgainstUrl('file:///C:/a.png', PART)).toBeNull();
  });
});
