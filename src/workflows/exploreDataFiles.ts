/**
 * Starting from data files, with no ontology to open first (#234). An empty, unsaved workspace ontology is opened, so the
 * Individuals tab and queries have something to add the data to, and the files are added to it as data: read-only, never
 * saved. Opening an ontology afterwards clears the data, as it does whenever another ontology is opened.
 *
 * The workspace is what the ontologies the data was made with can later be added to as imports (#236).
 */
import type { DataPick } from '../sparql/dataLoader';
import { OPEN_ONTOLOGY_FIRST } from '../abox/dataOntologies';

/** The name the workspace is opened under: what the status bar and the Individuals tab call it. */
export const WORKSPACE_NAME = 'Data files (no ontology)';

/** The workspace's IRI: what tells it apart from an ontology that was opened. */
export const WORKSPACE_IRI = 'urn:ontocanvas:workspace';

export const WORKSPACE_TTL = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<${WORKSPACE_IRI}> a owl:Ontology ;
    rdfs:label "Data files, no ontology" .
`;

/**
 * The note on the workspace. When the ontologies the data names are loaded, the note on them takes its place and says the same
 * after what was loaded (#240): the two side by side read as a contradiction.
 */
export const WORKSPACE_NOTE = `Exploring data files with no ontology open. ${OPEN_ONTOLOGY_FIRST}`;

export interface ExploreDataDeps {
  /** Opens an ontology from its text, as a file of that name would be. */
  openOntology(ttl: string, name: string): Promise<void>;
  showNote(text: string): void;
  /** Adds the folders and the files as data, in the Individuals tab. */
  addData(pick: DataPick): Promise<void>;
}

/** The files, or the folders (#227), picked or dropped on the start screen. */
export async function exploreDataFiles(pick: DataPick, deps: ExploreDataDeps): Promise<void> {
  await deps.openOntology(WORKSPACE_TTL, WORKSPACE_NAME);
  // After the load: it replaces the load's own note about an ontology with no classes (see main.ts).
  deps.showNote(WORKSPACE_NOTE);
  await deps.addData(pick);
}
