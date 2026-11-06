// @vitest-environment jsdom
/**
 * Notices in the bottom bar's issues area (#239): what the app wants to tell without blocking (an empty canvas, data with no
 * ontology, a borrowed display config) sits beside the ontology's issues instead of in a bar over the canvas.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearNotices, getNotices, onNoticesChange, setNotice } from '../../src/ui/statusNotices';
import { initStatusBar, updateStatusBar } from '../../src/ui/statusBar';
import { Parser, Store } from 'n3';

describe('the notices', () => {
  beforeEach(() => clearNotices());

  it('keeps one message per key, in the order they were first set, and drops one set to null', () => {
    setNotice('a', 'First');
    setNotice('b', 'Second');
    setNotice('a', 'First, again');

    expect(getNotices()).toEqual([
      { key: 'a', message: 'First, again' },
      { key: 'b', message: 'Second' },
    ]);
    setNotice('a', null);
    expect(getNotices()).toEqual([{ key: 'b', message: 'Second' }]);
  });

  it('tells the listeners of a change, and not of a message set to what it already is', () => {
    const changed = vi.fn();
    onNoticesChange(changed);

    setNotice('a', 'Text');
    setNotice('a', 'Text');
    setNotice('missing', null);
    clearNotices();

    expect(changed).toHaveBeenCalledTimes(2);
  });
});

describe('the notices in the bottom bar', () => {
  const button = () => document.getElementById('ontologyIssuesBtn')!;
  const popup = () => document.getElementById('ontologyIssuesPopup')!;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"><div id="info"></div></div>';
    clearNotices();
    initStatusBar();
  });

  it('shows "notes (n)" with the messages in the popup, at once, with no ontology issue', () => {
    setNotice('no-classes', 'The current file defines no classes, so the canvas is empty.');

    expect(button().style.display).toBe('');
    expect(button().textContent).toContain('notes (1)');
    expect(popup().textContent).toContain('Notes');
    expect(popup().textContent).toContain('The current file defines no classes, so the canvas is empty.');
  });

  it('hides it again when the notices are cleared', () => {
    setNotice('no-classes', 'Empty.');
    clearNotices();

    expect(button().style.display).toBe('none');
  });
});

describe('an unused annotation property, a note and not an issue (#239)', () => {
  const button = () => document.getElementById('ontologyIssuesBtn')!;
  const popup = () => document.getElementById('ontologyIssuesPopup')!;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"><div id="info"></div></div>';
    clearNotices();
    initStatusBar();
  });

  it('is listed under Notes and counted as a note: it says something of the ontology, not that something is wrong', async () => {
    const store = new Store(new Parser().parse('@prefix owl: <http://www.w3.org/2002/07/owl#> . <http://example.org/o#depiction> a owl:AnnotationProperty .'));

    updateStatusBar(store, null);

    await vi.waitFor(() => expect(button().style.display).toBe(''));
    expect(button().textContent).toContain('notes (1)');
    expect(popup().textContent).toContain('Notes');
    expect(popup().textContent).toMatch(/Annotation property "depiction" is defined but never used/);
    expect(popup().textContent).not.toContain('Ontology Issues');
  });
});
