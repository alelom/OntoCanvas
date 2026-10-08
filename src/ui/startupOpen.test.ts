import { describe, it, expect, vi } from 'vitest';
import { openOnStartup } from './startupOpen';

describe('openOnStartup: the "Open ontology" dialog at start-up', () => {
  it('shows the dialog when nothing was loaded', async () => {
    const show = vi.fn();
    await openOnStartup({ loadFromUrlParameter: async () => false, hasOntology: () => false, showOpenOntologyModal: show });
    expect(show).toHaveBeenCalledOnce();
  });

  it('does not show it when the URL parameter loaded an ontology', async () => {
    const show = vi.fn();
    await openOnStartup({ loadFromUrlParameter: async () => true, hasOntology: () => true, showOpenOntologyModal: show });
    expect(show).not.toHaveBeenCalled();
  });

  it('does not cover an ontology loaded while start-up was still checking the URL', async () => {
    // e.g. a file dropped in, or an E2E test loading straight away: the dialog used to open on top of it.
    let loaded = false;
    const show = vi.fn();
    await openOnStartup({
      loadFromUrlParameter: async () => {
        loaded = true; // an ontology arrives while the check is pending
        return false;
      },
      hasOntology: () => loaded,
      showOpenOntologyModal: show,
    });
    expect(show).not.toHaveBeenCalled();
  });
});
