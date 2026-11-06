// @vitest-environment jsdom
/**
 * The loading screen over an initial load (#239): shown while the data and the ontologies it names are read, so the classes
 * are drawn once, named, behind it; hidden after, however the work ends.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setLoadingCancel, setLoadingText, showLoadingModal, underLoadingScreen, withinMs } from '../../src/ui/modals';
import { vi } from 'vitest';

const modal = () => document.getElementById('loadingModal')!;
const text = () => document.getElementById('loadingModalText')!.textContent;

beforeEach(() => {
  document.body.innerHTML = '<div id="loadingModal" style="display: none"><div id="loadingModalText"></div><button id="loadingModalCancel" hidden>Cancel</button></div>';
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

describe('Cancel on the loading screen (#239 fourth review)', () => {
  const cancel = () => document.getElementById('loadingModalCancel') as HTMLButtonElement;

  it('is shown while a step can be cancelled, and calls it', () => {
    const onCancel = vi.fn();
    showLoadingModal();
    expect(cancel().hidden).toBe(true);

    setLoadingCancel(onCancel);
    expect(cancel().hidden).toBe(false);
    cancel().click();
    expect(onCancel).toHaveBeenCalledTimes(1);

    setLoadingCancel(null);
    expect(cancel().hidden).toBe(true);
  });

  it('is hidden again when the loading screen is shown for another step', () => {
    setLoadingCancel(() => {});
    showLoadingModal();

    expect(cancel().hidden).toBe(true);
  });
});

describe('withinMs (#239 fourth review)', () => {
  it('settles when the work does, or after the time, whichever comes first', async () => {
    vi.useFakeTimers();
    let done = false;
    const never = new Promise<void>(() => {});
    const waited = withinMs(never, 3000).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waited;
    expect(done).toBe(true);
    vi.useRealTimers();

    await expect(withinMs(Promise.resolve(), 3000)).resolves.toBeUndefined();
  });
});
