/**
 * Whether the declarations of the loaded ontology's imports have been read, or given up on (#104). They are
 * read in the background after a load, so a test (or anything else) that needs them waits for this.
 */
let settled = true;

/** An ontology was loaded: its imports are being read. */
export function beginImportsSettle(): void {
  settled = false;
}

/** The imports are read (or can't be): nothing more will change the property lists. */
export function importsSettled(): void {
  settled = true;
}

export function areImportsSettled(): boolean {
  return settled;
}
