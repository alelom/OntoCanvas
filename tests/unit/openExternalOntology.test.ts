/**
 * "Open external ontology" opens its tab on the click itself (#103 review). The folder picker, the folder
 * scan and the IndexedDB write all take time and the picker uses up the click's user activation, so a tab
 * opened after them can be blocked as a popup. The tab is opened first and sent where it should go.
 */
import { describe, it, expect } from 'vitest';
import { openExternalOntologyTab } from '../../src/lib/openExternalOntology';

/** Fakes that log, in order, what happens. */
function setup(opts: { fromDisk: boolean; local?: string | null; throws?: boolean; blocked?: boolean }) {
  const log: string[] = [];
  const tab = {
    location: {
      set href(url: string) {
        log.push(`navigate ${url}`);
      },
    },
  };
  const run = () =>
    openExternalOntologyTab({
      fromDisk: opts.fromDisk,
      open: (url) => {
        log.push(`open ${url}`);
        return opts.blocked ? null : tab;
      },
      findLocalUrl: async () => {
        log.push('find');
        await Promise.resolve();
        if (opts.throws) throw new Error('picker failed');
        return opts.local ?? null;
      },
      byUrl: () => 'https://app/?onto=http%3A%2F%2Fexample.org%2Fbase.html',
    });
  return { log, run };
}

describe('openExternalOntologyTab', () => {
  it('opens the tab before looking for the local file, then sends it to the file', async () => {
    const { log, run } = setup({ fromDisk: true, local: 'https://app/?localFile=abc' });
    await run();
    expect(log).toEqual(['open about:blank', 'find', 'navigate https://app/?localFile=abc']);
  });

  it('sends the tab to the ontology URL when the file is not found or the picker is cancelled', async () => {
    const { log, run } = setup({ fromDisk: true, local: null });
    await run();
    expect(log).toEqual(['open about:blank', 'find', 'navigate https://app/?onto=http%3A%2F%2Fexample.org%2Fbase.html']);
  });

  it('still ends on the ontology URL when the lookup fails', async () => {
    const { log, run } = setup({ fromDisk: true, throws: true });
    await run();
    expect(log.at(-1)).toBe('navigate https://app/?onto=http%3A%2F%2Fexample.org%2Fbase.html');
  });

  it('opens the final URL directly when the early tab was blocked', async () => {
    const { log, run } = setup({ fromDisk: true, local: 'https://app/?localFile=abc', blocked: true });
    await run();
    expect(log).toEqual(['open about:blank', 'find', 'open https://app/?localFile=abc']);
  });

  it('opens the ontology URL at once when the ontology was not opened from disk', async () => {
    const { log, run } = setup({ fromDisk: false });
    await run();
    expect(log).toEqual(['open https://app/?onto=http%3A%2F%2Fexample.org%2Fbase.html']);
  });
});
