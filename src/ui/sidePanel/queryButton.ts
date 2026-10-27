/**
 * The way into the query panel: a button in the graph's own toolbar, right after "Add Edge" (#171).
 *
 * vis-network renders that toolbar (`.vis-manipulation`) and empties it whenever its mode changes (a node is selected,
 * Add Node is pressed), so the button is put back after each rebuild, which a MutationObserver on the stable wrapper
 * sees. The toolbar only exists with editing on: in an embedded view there is none, and so no button.
 */

export interface QueryButtonMount {
  /** Show whether the panel is open; kept across rebuilds of the toolbar. */
  setPressed(pressed: boolean): void;
  destroy(): void;
}

export function mountQueryButton(wrapper: HTMLElement, onClick: () => void): QueryButtonMount {
  let pressed = false;

  const create = (): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'queryPanelBtn';
    button.className = 'vis-button vis-query';
    button.title = 'Query the open ontology with SPARQL (read-only)';
    button.setAttribute('aria-pressed', String(pressed));
    button.innerHTML = '<div class="vis-label">SPARQL query</div>';
    button.addEventListener('click', onClick);
    return button;
  };

  const place = (): void => {
    for (const bar of wrapper.querySelectorAll('.vis-manipulation')) {
      const addEdge = bar.querySelector(':scope > .vis-connect');
      if (!addEdge || bar.querySelector('#queryPanelBtn')) continue;
      const separator = document.createElement('div');
      separator.className = 'vis-separator-line';
      addEdge.after(separator, create());
    }
  };

  const observer = new MutationObserver(place);
  observer.observe(wrapper, { childList: true, subtree: true });
  place();

  return {
    setPressed(next) {
      pressed = next;
      wrapper.querySelector('#queryPanelBtn')?.setAttribute('aria-pressed', String(next));
    },
    destroy: () => observer.disconnect(),
  };
}
