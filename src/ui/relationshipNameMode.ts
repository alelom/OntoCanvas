/**
 * What a relationship's name selects (#214), chosen in the bottom bar when there are individuals: its definition, the edge
 * between classes (as before: the search finds it), or its instances, the edges between individuals (drawn and selected). The
 * name is the one in the bottom bar's list of edges and in the search's suggestions. Remembered in the browser; the default is
 * the definitions.
 */

export type RelationshipNameMode = 'definition' | 'instances';

const STORAGE_KEY = 'ontocanvas.relationshipNameMode';
const MODES: RelationshipNameMode[] = ['definition', 'instances'];

/** The choice when the browser keeps nothing (a private window, blocked storage). */
let fallback: RelationshipNameMode = 'definition';

export function getRelationshipNameMode(): RelationshipNameMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return MODES.includes(stored as RelationshipNameMode) ? (stored as RelationshipNameMode) : 'definition';
  } catch {
    // Storage blocked: the choice lasts the session.
  }
  return fallback;
}

export function setRelationshipNameMode(mode: RelationshipNameMode): void {
  fallback = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts the session.
  }
}

const OPTIONS: Record<RelationshipNameMode, { label: string; title: string }> = {
  definition: {
    label: 'definitions',
    title: 'A relationship name finds the relationship as the ontology defines it, between classes',
  },
  instances: {
    label: 'instances',
    title: 'A relationship name draws the individuals linked by it, and selects those links',
  },
};

export interface RelationshipNameModeControl {
  element: HTMLElement;
  /** Shown only when there are individuals: without them a name has no instances. */
  setVisible(visible: boolean): void;
}

/** Fills the bottom bar's place for the choice (#relationshipNameMode); null when the page has none (embedded). */
export function mountRelationshipNameMode(): RelationshipNameModeControl | null {
  const element = document.getElementById('relationshipNameMode');
  if (!element) return null;
  element.hidden = true;
  element.setAttribute('role', 'radiogroup');
  element.setAttribute('aria-label', 'What a relationship name selects');
  const current = getRelationshipNameMode();
  element.replaceChildren(
    'Relationship names select: ',
    ...MODES.map((mode) => {
      const label = document.createElement('label');
      label.title = OPTIONS[mode].title;
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'relationshipNameMode';
      radio.value = mode;
      radio.checked = mode === current;
      radio.addEventListener('change', () => {
        if (radio.checked) setRelationshipNameMode(mode);
      });
      label.append(radio, ` ${OPTIONS[mode].label}`);
      return label;
    })
  );
  return {
    element,
    setVisible: (visible) => void (element.hidden = !visible),
  };
}
