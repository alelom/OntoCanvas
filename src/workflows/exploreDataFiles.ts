/**
 * Starting from data files, with no ontology to open first (#234). An empty, unsaved workspace ontology is opened, so the
 * Individuals tab and queries have something to add the data to, and the files are added to it as data: read-only, never
 * saved. Opening an ontology afterwards clears the data, as it does whenever another ontology is opened.
 *
 * The workspace is what the ontologies the data was made with can later be added to as imports (#236).
 */
import type { DataFile } from '../sparql/dataSources';

/** The name the workspace is opened under: what the status bar and the Individuals tab call it. */
export const WORKSPACE_NAME = 'Data files (no ontology)';

export const WORKSPACE_TTL = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<urn:ontocanvas:workspace> a owl:Ontology ;
    rdfs:label "Data files, no ontology" .
`;

export const WORKSPACE_NOTE =
  'Exploring data files with no ontology. When the data names the ontologies it was made with, the Individuals tab offers to open them; opening an ontology from the toolbar instead clears the data.';

export interface ExploreDataDeps {
  /** Opens an ontology from its text, as a file of that name would be. */
  openOntology(ttl: string, name: string): Promise<void>;
  showNote(text: string): void;
  /** Adds the files as data, as one selection, in the Individuals tab. */
  addDataFiles(files: DataFile[]): Promise<void>;
}

export async function exploreDataFiles(files: DataFile[], deps: ExploreDataDeps): Promise<void> {
  await deps.openOntology(WORKSPACE_TTL, WORKSPACE_NAME);
  // After the load: it replaces the load's own note about an ontology with no classes (see main.ts).
  deps.showNote(WORKSPACE_NOTE);
  await deps.addDataFiles(files);
}
