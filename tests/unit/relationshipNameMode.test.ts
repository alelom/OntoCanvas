// @vitest-environment jsdom
/**
 * The bottom bar's choice of what a relationship name selects (#214): its definition between classes (as before) or its instances
 * between individuals. Remembered in the browser; shown only when there are individuals.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getRelationshipNameMode, mountRelationshipNameMode, setRelationshipNameMode } from '../../src/ui/relationshipNameMode';

beforeEach(() => {
  document.body.innerHTML = '<span id="relationshipNameMode"></span>';
  localStorage.clear();
  setRelationshipNameMode('definition');
  localStorage.clear();
});

describe('the choice', () => {
  it('is the definitions by default', () => {
    expect(getRelationshipNameMode()).toBe('definition');
  });

  it('is remembered', () => {
    setRelationshipNameMode('instances');

    expect(localStorage.getItem('ontocanvas.relationshipNameMode')).toBe('instances');
    expect(getRelationshipNameMode()).toBe('instances');
  });

  it('ignores what it does not know in storage', () => {
    localStorage.setItem('ontocanvas.relationshipNameMode', 'other');

    expect(getRelationshipNameMode()).toBe('definition');
  });
});

describe('the radio buttons in the bottom bar', () => {
  it('show the choice, set it, and are hidden until there are individuals', () => {
    const control = mountRelationshipNameMode()!;
    const radio = (value: string) => document.querySelector<HTMLInputElement>(`input[name="relationshipNameMode"][value="${value}"]`)!;
    expect(control.element.hidden).toBe(true);
    expect(radio('definition').checked).toBe(true);

    control.setVisible(true);
    radio('instances').click();

    expect(control.element.hidden).toBe(false);
    expect(getRelationshipNameMode()).toBe('instances');
    expect(control.element.textContent).toContain('Relationship names select');
  });

  it('is nothing without its place in the page', () => {
    document.body.innerHTML = '';

    expect(mountRelationshipNameMode()).toBeNull();
  });
});
