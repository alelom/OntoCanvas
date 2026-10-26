/**
 * Runs once, in the main process, before any unit-test worker starts (#175).
 *
 * The SPARQL tests load the query engine and `rdf-parse`, thousands of small files. From a cold disk cache (after a
 * build or an E2E run) reading them took over 30 s here, which a test or hook timeout cannot absorb, so those files
 * failed now and then and passed on a re-run. Reading them here puts them in the operating system's file cache,
 * where the workers' imports are then quick, and no timeout has to grow. With a warm cache this costs about a second.
 */
export default async function warmHeavyImports(): Promise<void> {
  await Promise.all([import('@comunica/query-sparql-rdfjs-lite'), import('rdf-parse')]);
}
