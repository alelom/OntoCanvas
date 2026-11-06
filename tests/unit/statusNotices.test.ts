// @vitest-environment jsdom
/**
 * Notices in the bottom bar's issues area (#239): what the app wants to tell without blocking (an empty canvas, data with no
 * ontology, a borrowed display config) sits beside the ontology's issues instead of in a bar over the canvas.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearNotices, getNotices, onNoticeAlert, onNoticesChange, setNotice } from '../../src/ui/statusNotices';
import { initStatusBar, updateStatusBar } from '../../src/ui/statusBar';
import { LONG_PATH_SUMMARY } from '../../src/ui/sidePanel/imageProblem';
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

describe('levels, and the ones that pop up (#240)', () => {
  beforeEach(() => clearNotices());

  it('keeps a level and the help to act on it; a notice without a level is a note', () => {
    setNotice('a', 'Plain.');
    setNotice('b', 'Missing images.', { level: 'warning', alert: true, help: { kind: 'long-path', folder: 'run-0001' } });

    expect(getNotices()).toEqual([
      { key: 'a', message: 'Plain.' },
      { key: 'b', message: 'Missing images.', level: 'warning', alert: true, help: { kind: 'long-path', folder: 'run-0001' } },
    ]);
  });

  it('asks for a pop-up for an error and for a warning marked to pop up, once per message; not for a note or a plain warning', () => {
    const popped: string[] = [];
    onNoticeAlert((notice) => popped.push(notice.key));

    setNotice('note', 'A note.');
    setNotice('warning', 'A warning.', { level: 'warning' });
    setNotice('error', 'An error.', { level: 'error' });
    setNotice('folder', 'Missing images.', { level: 'warning', alert: true });
    setNotice('folder', 'Missing images.', { level: 'warning', alert: true });
    setNotice('folder', 'More missing images.', { level: 'warning', alert: true });

    expect(popped).toEqual(['error', 'folder', 'folder']);
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

  it('lists errors, warnings and notes apart, says the worst on the button, and folds the steps under a long-path warning', () => {
    setNotice('note', 'A note.');
    setNotice('folder', 'run-0001: 13 images its data names aren\'t in the folder.', { level: 'warning', alert: true, help: { kind: 'long-path', folder: 'run-0001' } });

    // Each kind counted on its own (#240: "warnings (3)" for 1 warning and 2 notes).
    expect(button().textContent).toBe('⚠️ warnings (1), notes (1)');
    expect([...popup().querySelectorAll('[data-status-notices-level]')].map((s) => s.getAttribute('data-status-notices-level'))).toEqual(['warning', 'note']);
    const warning = popup().querySelector('[data-status-notice="folder"]')!;
    expect(warning.querySelector('[data-individuals-image-help] summary')!.textContent).toBe(LONG_PATH_SUMMARY);
    expect(warning.textContent).toContain('X:\\run-0001');

    setNotice('error', 'Something failed.', { level: 'error' });
    expect(button().textContent).toBe('⛔ errors (1), warnings (1), notes (1)');
    expect(popup().querySelector('[data-status-notices-level]')!.getAttribute('data-status-notices-level')).toBe('error');
  });

  it('pops up a notice that pops up, and not one whose subject the user muted for this session', () => {
    sessionStorage.clear();
    const mute = { key: 'folder-images:run-0001', label: 'this folder (run-0001)' };
    setNotice('folder', 'Missing images.', { level: 'warning', alert: true, mute });
    expect(document.querySelectorAll('[data-notice-modal]')).toHaveLength(1);
    document.querySelector<HTMLButtonElement>('[data-notice-modal-mute]')!.click();
    document.querySelector<HTMLButtonElement>('[data-notice-modal-close]')!.click();

    setNotice('folder', 'More missing images.', { level: 'warning', alert: true, mute });

    expect(document.querySelectorAll('[data-notice-modal]')).toHaveLength(0);
    expect(popup().querySelector('[data-status-notice="folder"]')!.textContent).toContain('More missing images.');
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
