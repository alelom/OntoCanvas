/**
 * Image paths in data (#228): which values are image paths, and where each one is in an opened folder or next to a data address.
 * A run writes its image paths relative to the folder above `runs/`, not to the data file.
 */
import { describe, it, expect } from 'vitest';
import { findInFolder, indexFolder, isImagePath, pathParts, resolveAgainstUrl } from '../../src/abox/imagePaths';

describe('isImagePath', () => {
  it("reads the extension, whatever its case, before an address's query", () => {
    expect(['images/a.png', 'B.JPG', 'c.jpeg', 'https://x.org/d.svg?v=2', 'e.webp', 'f.gif'].every(isImagePath)).toBe(true);
    expect(['a.ttl', 'png', 'https://x.org/image', 'a.png.txt'].some(isImagePath)).toBe(false);
  });

  it('reads a plain path whole: a # or ? in a name is part of it (#240 review)', () => {
    expect(isImagePath('images/Issue #3/a.png')).toBe(true);
    expect(isImagePath('images/what?/a.png')).toBe(true);
  });

  it('takes a Windows path with a drive letter for a path, not an address', () => {
    expect(isImagePath('C:\\data\\run-0001\\images\\a.png')).toBe(true);
  });
});

describe('pathParts', () => {
  it('reads backslashes, %20, . and ..', () => {
    expect(pathParts('.\\images\\page%201\\..\\page 2\\a.png')).toEqual(['images', 'page 2', 'a.png']);
  });

  it("decodes every character a batch run encodes (Python's quote with / kept), and a % not followed by hex stays", () => {
    expect(pathParts('Plans%20%26%20Sections/Issue%20%233/A-101%2C%20rev%20B%2B%3B%3D%40%24%3A.pdf_p1.png')).toEqual(['Plans & Sections', 'Issue #3', 'A-101, rev B+;=@$:.pdf_p1.png']);
    expect(pathParts('100%25/50% off/a.png')).toEqual(['100%', '50% off', 'a.png']);
  });

  it('keeps a # or ? in a name, written plain or encoded: a path has no query or fragment (#240 review)', () => {
    expect(pathParts('images/Issue #3/a.png')).toEqual(['images', 'Issue #3', 'a.png']);
    expect(pathParts('Issue%20%233/a%3Fb.png')).toEqual(['Issue #3', 'a?b.png']);
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

  it('finds a crop kept under a drawing path with &, # and a comma, as a batch run writes it (percent-encoded)', () => {
    const run = new Set(['images/Plans & Sections/Issue #3/A-101, rev B.pdf_p1.png']);
    const value = 'runs/20261105T1030Z_5cd7106d/images/Plans%20%26%20Sections/Issue%20%233/A-101%2C%20rev%20B.pdf_p1.png';
    expect(findInFolder(value, run, '', '20261105T1030Z_5cd7106d')).toBe('images/Plans & Sections/Issue #3/A-101, rev B.pdf_p1.png');
  });

  it('accepts the index of a folder, made once for many values', () => {
    const index = indexFolder(['runs/run-0001/images/page-1/titleblock.png', 'runs/run-0002/images/page-9/titleblock.png']);
    expect(findInFolder('images/page-1/titleblock.png', index)).toBe('runs/run-0001/images/page-1/titleblock.png');
    expect(findInFolder('images/page-2/titleblock.png', index)).toBeNull();
  });

  it('finds a plain path with a # in a name (#240 review)', () => {
    expect(findInFolder('images/Issue #3/a.png', new Set(['images/Issue #3/a.png']))).toBe('images/Issue #3/a.png');
  });

  it('finds an absolute Windows path through the name of the folder opened, or by its ending (#240 review)', () => {
    expect(findInFolder('C:\\data\\run-0001\\images\\page-1\\titleblock.png', RUN, '', 'run-0001')).toBe('images/page-1/titleblock.png');
    expect(findInFolder('D:/elsewhere/images/page-2/titleblock.png', new Set(['images/page-2/titleblock.png']), '', 'run-0001')).toBe('images/page-2/titleblock.png');
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

  it('encodes each part of the address again: a # or ? in a name is not a fragment or a query', () => {
    expect(resolveAgainstUrl('runs/run-0001/images/Plans%20%26%20Sections/Issue%20%233/a%3Fb.png', PART)).toBe('https://example.org/data/runs/run-0001/images/Plans%20%26%20Sections/Issue%20%233/a%3Fb.png');
  });

  it('keeps an http address, and gives nothing for another scheme, or a path on a drive of a machine', () => {
    expect(resolveAgainstUrl('https://img.example.org/a.png', PART)).toBe('https://img.example.org/a.png');
    expect(resolveAgainstUrl('file:///C:/a.png', PART)).toBeNull();
    expect(resolveAgainstUrl('C:\\data\\a.png', PART)).toBeNull();
  });

  it('resolves a path starting with ../ above the data file, as written (#240 review)', () => {
    expect(resolveAgainstUrl('../images/a.png', 'https://h.org/data/run/part.ttl')).toBe('https://h.org/data/images/a.png');
    expect(resolveAgainstUrl('..\\..\\images\\Issue #3\\a.png', 'https://h.org/data/run/part.ttl')).toBe('https://h.org/images/Issue%20%233/a.png');
  });

  it('encodes a # written plain in a name', () => {
    expect(resolveAgainstUrl('images/Issue #3/a.png', PART)).toBe('https://example.org/data/runs/run-0001/images/Issue%20%233/a.png');
  });
});
