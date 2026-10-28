/**
 * Setup of the `engine` unit test group (vitest.config.ts): builds the real SPARQL engine and loads `rdf-parse`, once, before the
 * engine test files run (#192).
 *
 * Building the engine loads thousands of modules. On a warm machine that takes about a second; after a build, after the E2E suite
 * or with another run going it took tens of seconds (46 s measured on a cold run), which did not fit the 10 s limit of a
 * `beforeAll` hook, and the whole file failed with "Hook timed out". A setup file is not under that limit, so the one-off cost
 * lives here and the tests and their hooks measure only the logic. The limit stays what it is: no test is given more time.
 *
 * The group runs its files in one module context (isolate: false), so the engine this builds is the one they use.
 */
import { Store } from 'n3';
import { parseRdfToGraph } from '../src/ontology/buildGraph';
import { runQuery } from '../src/sparql/runQuery';

await runQuery([new Store()], 'ASK { ?s ?p ?o }');
await parseRdfToGraph('@prefix : <http://example.org/> . :A a <http://www.w3.org/2002/07/owl#Class> .', { contentType: 'text/turtle' });
