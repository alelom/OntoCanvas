/**
 * What OntoCanvas opens at start-up: the ontology named by the URL parameter (?onto=…) if any, otherwise
 * the "Open ontology" dialog. Checking the URL is asynchronous, so an ontology can arrive while it is
 * pending (a file dropped in, or an E2E test loading straight away); the dialog must not then open on top
 * of it. Kept out of main.ts.
 */
export interface StartupOpenDeps {
  /** Load the ontology named by the URL parameter; true if one was loaded. */
  loadFromUrlParameter: () => Promise<boolean>;
  /** Whether an ontology is loaded now. */
  hasOntology: () => boolean;
  showOpenOntologyModal: () => void;
}

export async function openOnStartup(deps: StartupOpenDeps): Promise<void> {
  const loadedFromParam = await deps.loadFromUrlParameter();
  if (loadedFromParam || deps.hasOntology()) return;
  deps.showOpenOntologyModal();
}
