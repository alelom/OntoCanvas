// @vitest-environment jsdom
/**
 * Mounting the side panel on the page (#171): the toolbar button toggles the query tab, and in an embedded
 * (read-only) view there is no panel at all.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from 'n3';
import { initSidePanel } from '../../src/ui/sidePanel/initSidePanel';

const deps = (embedded = false) => ({ getStore: () => new Store(), getPrefixes: () => ({}), embedded });
const panel = () => document.getElementById('sidePanel') as HTMLElement;
const button = () => document.getElementById('queryPanelBtn') as HTMLButtonElement;

beforeEach(() => {
  document.body.innerHTML = '<button id="queryPanelBtn" aria-pressed="false">Query</button><aside id="sidePanel"></aside>';
});

describe('initSidePanel', () => {
  it('opens the query tab from the toolbar button and closes it with a second click', () => {
    initSidePanel(deps());

    button().click();
    expect(panel().hidden).toBe(false);
    expect(panel().querySelector('[data-query-editor]')).not.toBeNull();
    expect(button().getAttribute('aria-pressed')).toBe('true');

    button().click();
    expect(panel().hidden).toBe(true);
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('draws nothing until the button is first pressed', () => {
    initSidePanel(deps());
    expect(panel().hidden).toBe(true);
    expect(panel().querySelector('[data-query-editor]')).toBeNull();
  });

  it('closes with the panel\'s own close button and releases the toolbar button', () => {
    initSidePanel(deps());
    button().click();

    panel().querySelector<HTMLButtonElement>('[data-side-panel-close]')!.click();

    expect(panel().hidden).toBe(true);
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('shows no panel and no button when the app is embedded', () => {
    initSidePanel(deps(true));

    expect(button().hidden).toBe(true);
    button().click();
    expect(panel().hidden).toBe(true);
    expect(panel().querySelector('[data-query-editor]')).toBeNull();
  });

  it('does nothing when the page has no panel markup', () => {
    document.body.innerHTML = '';
    expect(() => initSidePanel(deps()).refresh()).not.toThrow();
  });
});
