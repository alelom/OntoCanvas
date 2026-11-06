// @vitest-environment jsdom
/**
 * The loading screen over an initial load (#239): shown while the data and the ontologies it names are read, so the classes
 * are drawn once, named, behind it; hidden after, however the work ends.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setLoadingText, showLoadingModal, underLoadingScreen } from '../../src/ui/modals';

const modal = () => document.getElementById('loadingModal')!;
const text = () => document.getElementById('loadingModalText')!.textContent;

beforeEach(() => {
  document.body.innerHTML = '<div id="loadingModal" style="display: none"><div id="loadingModalText"></div></div>';
});

describe('the text of the loading screen (#239)', () => {
  it('says the ontology is being opened, by default', () => {
    showLoadingModal();

    expect(text()).toBe('Opening the ontology…');
  });

  it('says what is being done, step by step, as the steps go', async () => {
    const seen: string[] = [];

    await underLoadingScreen(async () => {
      seen.push(text()!);
      setLoadingText('Adding 2 of 3: part-0002.nq.gz… 12,000 triples');
      seen.push(text()!);
    }, 'Adding the data…');

    expect(seen).toEqual(['Adding the data…', 'Adding 2 of 3: part-0002.nq.gz… 12,000 triples']);
  });
});

describe('underLoadingScreen', () => {
  it('shows the loading screen while the work runs, and hides it after', async () => {
    let during = '';

    await underLoadingScreen(async () => {
      during = modal().style.display;
    });

    expect(during).toBe('flex');
    expect(modal().style.display).toBe('none');
  });

  it('hides it when the work fails too', async () => {
    await expect(
      underLoadingScreen(async () => {
        throw new Error('broken');
      })
    ).rejects.toThrow('broken');

    expect(modal().style.display).toBe('none');
  });
});
