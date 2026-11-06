// @vitest-environment jsdom
/**
 * The loading screen over an initial load (#239): shown while the data and the ontologies it names are read, so the classes
 * are drawn once, named, behind it; hidden after, however the work ends.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { underLoadingScreen } from '../../src/ui/modals';

const modal = () => document.getElementById('loadingModal')!;

beforeEach(() => {
  document.body.innerHTML = '<div id="loadingModal" style="display: none"></div>';
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
