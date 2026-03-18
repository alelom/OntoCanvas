/**
 * Serialize N3 Store to Turtle using rdflib
 */
import { serialize, Store as RdflibStore } from 'rdflib';
import type { Store } from 'n3';
import { convertN3QuadsToRdflibStatements } from './n3ToRdflib';
import { applyFormattingStyleStep, type PostProcessingContext } from './postProcessing';
import { addSectionDividers, addOwlImports, addAttribution } from '../turtlePostProcess';

export interface SerializeStoreOptions {
  /** Prefix map for @prefix declarations */
  prefixes?: Record<string, string>;
  /** Base IRI for resolving relative URIs */
  baseIRI?: string;
  /** External ontology references for prefix handling */
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>;
  /** Original TTL string to preserve format (colon vs base notation) */
  originalTtlString?: string;
}

/**
 * Serialize N3 Store to Turtle using rdflib
 */
export async function serializeStoreWithRdflib(
  store: Store,
  options: SerializeStoreOptions = {}
): Promise<string> {
  try {
    // Convert N3 Store quads to rdflib statements
    const quads = Array.from(store);
    const statements = convertN3QuadsToRdflibStatements(quads);

    // Create rdflib Store (knowledge base) and add statements
    const kb = new RdflibStore();
    for (const statement of statements) {
      kb.add(statement);
    }

    // Determine base IRI as string (rdflib serialize expects string, not NamedNode)
    let baseUri: string | null = null;
    if (options.baseIRI) {
      baseUri = options.baseIRI;
    } else if (options.originalTtlString) {
      // Extract base IRI from original file if provided
      const prefixMatch = options.originalTtlString.match(/@prefix\s+:\s*<([^>]+)>/);
      const baseMatch = options.originalTtlString.match(/@base\s+<([^>]+)>/);
      if (prefixMatch) {
        baseUri = prefixMatch[1];
      } else if (baseMatch) {
        baseUri = baseMatch[1];
      }
    }

    // Build prefix map - start with standard prefixes
    const prefixes: Record<string, string> = {
      'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
      'owl': 'http://www.w3.org/2002/07/owl#',
      'xsd': 'http://www.w3.org/2001/XMLSchema#',
    };
    
    // Add empty prefix only when we know the correct base. Omitting it when unknown
    // avoids forcing a wrong default and breaking round-trips for other ontologies.
    if (baseUri) {
      prefixes[''] = baseUri;
    }

    // Add prefixes for external ontologies that use prefix
    if (options.externalRefs) {
      for (const ref of options.externalRefs) {
        if (ref.usePrefix && ref.prefix) {
          prefixes[ref.prefix] = ref.url;
        }
      }
    }

    // Merge options.prefixes (add/override); allows callers to add custom prefixes or override built-ins
    if (options.prefixes && Object.keys(options.prefixes).length > 0) {
      for (const [prefix, namespace] of Object.entries(options.prefixes)) {
        prefixes[prefix] = namespace;
      }
    }

    // Serialize using rdflib's callback-based API
    // NOTE: Passing base to rdflib serialize can cause it to create relative URIs, which breaks serialization
    // We pass null for base and handle prefixes manually instead
    // This ensures all URIs remain absolute
    return new Promise<string>((resolve, reject) => {
      serialize(null, kb, null, 'text/turtle', (err: Error | null, result?: string) => {
        if (err) {
          reject(new Error(`Failed to serialize with rdflib: ${err.message}`));
          return;
        }
        if (result === undefined) {
          reject(new Error('Serialization returned undefined'));
          return;
        }

        // Add prefix declarations at the start
        const prefixLines: string[] = [];
        for (const [prefix, namespace] of Object.entries(prefixes)) {
          if (prefix === '') {
            prefixLines.push(`@prefix : <${namespace}> .`);
          } else {
            prefixLines.push(`@prefix ${prefix}: <${namespace}> .`);
          }
        }

        let finalResult = prefixLines.length > 0 
          ? prefixLines.join('\n') + '\n\n' + result
          : result;

        // Apply post-processing steps
        const postProcessingContext: PostProcessingContext = {
          externalRefs: options.externalRefs,
          originalTtlString: options.originalTtlString,
          mainOntologyBase: baseUri || undefined,
        };
        
        // Apply formatting (section dividers temporarily disabled to debug parsing errors)
        finalResult = applyFormattingStyleStep(finalResult, postProcessingContext);
        
        // Add owl:imports if externalRefs are provided (using robust function from turtlePostProcess)
        if (options.externalRefs && options.externalRefs.length > 0) {
          finalResult = addOwlImports(finalResult, options.externalRefs);
        }
        
        // Add attribution comment and remove attribution from rdfs:comment
        finalResult = addAttribution(finalResult);
        
        // TODO: Re-enable section dividers once we fix the parsing issues
        // finalResult = addSectionDividers(finalResult);
        
        resolve(finalResult);
      });
    });
  } catch (error) {
    throw new Error(`Failed to serialize store with rdflib: ${error instanceof Error ? error.message : String(error)}`);
  }
}

