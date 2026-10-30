/**
 * The way into the side panel: buttons in the graph's own toolbar, after "Add Edge" and the Edit button that a selection
 * brings (#171, #211): SPARQL query, then Individuals.
 *
 * vis-network renders that toolbar (`.vis-manipulation`) and empties it whenever its mode changes (a node is selected,
 * Add Node is pressed), so the buttons are put back after each rebuild, which a MutationObserver on the stable wrapper
 * sees. The toolbar only exists with editing on: in an embedded view there is none, and so no buttons.
 */

export interface PanelButtonSpec {
  id: string;
  label: string;
  title: string;
  onClick: () => void;
}

export interface PanelButtons {
  /** Show whether the panel is open on this button's tab; kept across rebuilds of the toolbar. */
  setPressed(id: string, pressed: boolean): void;
  setLabel(id: string, label: string): void;
  setTitle(id: string, title: string): void;
  destroy(): void;
}

interface ButtonState {
  spec: PanelButtonSpec;
  pressed: boolean;
  label: string;
  title: string;
}

export interface PanelButtonsOptions {
  /** True while the selection is only of things that cannot be edited (individuals, #209): the toolbar's Edit button is taken away. */
  hideEdit?: () => boolean;
}

export function mountPanelButtons(wrapper: HTMLElement, specs: PanelButtonSpec[], options: PanelButtonsOptions = {}): PanelButtons {
  const states = new Map<string, ButtonState>(specs.map((spec) => [spec.id, { spec, pressed: false, label: spec.label, title: spec.title }]));

  const draw = (state: ButtonState, button: HTMLElement): void => {
    button.title = state.title;
    button.setAttribute('aria-pressed', String(state.pressed));
    const label = button.querySelector('.vis-label');
    if (label) label.textContent = state.label;
  };

  const create = (state: ButtonState): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = state.spec.id;
    button.className = 'vis-button vis-query';
    const label = document.createElement('div');
    label.className = 'vis-label';
    button.append(label);
    draw(state, button);
    button.addEventListener('click', state.spec.onClick);
    return button;
  };

  const place = (): void => {
    for (const bar of wrapper.querySelectorAll('.vis-manipulation')) {
      const addEdge = bar.querySelector(':scope > .vis-connect');
      if (!addEdge) continue;
      if (options.hideEdit?.()) {
        for (const edit of bar.querySelectorAll(':scope > .vis-edit')) {
          if (edit.previousElementSibling?.classList.contains('vis-separator-line')) edit.previousElementSibling.remove();
          edit.remove();
        }
      }
      if (specs.some((spec) => bar.querySelector(`#${spec.id}`))) continue;
      // After the Edit button vis-network adds for a selection, so that one stays next to Add Edge.
      const anchor = [...bar.querySelectorAll(':scope > .vis-edit')].pop() ?? addEdge;
      const separator = document.createElement('div');
      separator.className = 'vis-separator-line';
      anchor.after(separator, ...specs.map((spec) => create(states.get(spec.id)!)));
    }
  };

  const observer = new MutationObserver(place);
  observer.observe(wrapper, { childList: true, subtree: true });
  place();

  const update = (id: string, change: (state: ButtonState) => void): void => {
    const state = states.get(id);
    if (!state) return;
    change(state);
    for (const button of wrapper.querySelectorAll<HTMLElement>(`#${id}`)) draw(state, button);
  };

  return {
    setPressed: (id, pressed) => update(id, (state) => void (state.pressed = pressed)),
    setLabel: (id, label) => update(id, (state) => void (state.label = label)),
    setTitle: (id, title) => update(id, (state) => void (state.title = title)),
    destroy: () => observer.disconnect(),
  };
}
