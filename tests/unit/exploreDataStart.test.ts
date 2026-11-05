// @vitest-environment jsdom
/**
 * "Explore data files…" on the start screen (#234): a button that picks several data files at once, for when there is no
 * ontology to open first.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExploreDataStart, DATA_FILE_ACCEPT } from '../../src/ui/exploreDataStart';

let onFiles: ReturnType<typeof vi.fn>;
let block: HTMLElement;
const input = () => block.querySelector<HTMLInputElement>('[data-explore-data-input]')!;

beforeEach(() => {
  document.body.innerHTML = '';
  onFiles = vi.fn();
  block = createExploreDataStart(onFiles);
  document.body.append(block);
});

describe('createExploreDataStart', () => {
  it('offers a button that opens a picker of several data files, compressed ones and N-Quads included', () => {
    const button = block.querySelector<HTMLButtonElement>('[data-explore-data]')!;
    expect(button.textContent).toMatch(/Explore data files/);
    expect(input().multiple).toBe(true);
    expect(input().accept).toBe(DATA_FILE_ACCEPT);
    for (const ext of ['.nq', '.trig', '.nt', '.ttl', '.gz']) expect(DATA_FILE_ACCEPT).toContain(ext);
    const picker = vi.spyOn(input(), 'click').mockImplementation(() => {});

    button.click();

    expect(picker).toHaveBeenCalled();
  });

  it('hands over the files picked, all of them, and empties the picker so the same files can be picked again', () => {
    const files = [{ name: 'part-0001.nq.gz' }, { name: 'part-0002.nq.gz' }];
    Object.defineProperty(input(), 'files', { value: files, configurable: true });

    input().dispatchEvent(new Event('change'));

    expect(onFiles).toHaveBeenCalledWith(files);
    expect(input().value).toBe('');
  });

  it('hands over nothing when the picker is closed without a file', () => {
    Object.defineProperty(input(), 'files', { value: [], configurable: true });

    input().dispatchEvent(new Event('change'));

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('takes files dropped on the block itself, and only there (#238 review)', () => {
    const files = [{ name: 'part-0001.nq.gz' }];
    const drop = (on: EventTarget) => {
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } });
      on.dispatchEvent(event);
      return event;
    };
    const outside = document.createElement('div');
    document.body.append(outside);

    expect(drop(outside).defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
    expect(drop(block.querySelector('.explore-data-note')!).defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenCalledWith(files);
  });

  it('says that files can be dropped too, and that they are never saved', () => {
    expect(block.textContent).toMatch(/drop/i);
    expect(block.querySelector('[data-explore-data]')!.getAttribute('title')).toMatch(/never saved/i);
  });
});
