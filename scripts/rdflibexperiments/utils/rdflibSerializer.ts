/**
 * Wrapper for rdflib serialization with format options
 */
import { serialize, NamedNode, Store } from 'rdflib';
import { Statement } from 'rdflib';

export type SerializationFormat = 'text/turtle' | 'application/rdf+xml' | 'application/ld+json';

export interface SerializationOptions {
  prefixes?: Record<string, string>;
  baseIRI?: string;
}

/**
 * Serialize rdflib statements to Turtle, RDF/XML, or JSON-LD
 */
export async function serializeWithRdflib(
  statements: Statement[],
  format: SerializationFormat,
  options?: SerializationOptions
): Promise<string> {
  try {
    // rdflib's serialize function needs a Store (kb), not just statements
    // Create a Store and add all statements
    const kb = new Store();
    for (const statement of statements) {
      kb.add(statement);
    }
    
    // rdflib's serialize function signature: serialize(target, kb, base, contentType, callback, options)
    // target can be null (serialize entire kb), kb is the store, base is NamedNode or null
    let base: NamedNode | null = null;
    if (options?.baseIRI) {
      base = new NamedNode(options.baseIRI);
    }
    
    // Serialize - use callback-based API
    return new Promise<string>((resolve, reject) => {
      serialize(null, kb, base, format, (err: Error | null, result?: string) => {
        if (err) {
          reject(err);
          return;
        }
        if (result === undefined) {
          reject(new Error('Serialization returned undefined'));
          return;
        }
        resolve(result);
      });
    }).then((result) => {
      // Handle prefixes if provided (rdflib may not support prefix options directly)
      // We'll need to post-process if needed
      if (options?.prefixes && format === 'text/turtle') {
        // Add prefix declarations at the start
        const prefixLines: string[] = [];
        for (const [prefix, namespace] of Object.entries(options.prefixes)) {
          if (prefix === '') {
            prefixLines.push(`@prefix : <${namespace}> .`);
          } else {
            prefixLines.push(`@prefix ${prefix}: <${namespace}> .`);
          }
        }
        
        if (prefixLines.length > 0) {
          return prefixLines.join('\n') + '\n\n' + result;
        }
      }
      
      return result;
    });
  } catch (error) {
    throw new Error(`Failed to serialize with rdflib: ${error instanceof Error ? error.message : String(error)}`);
  }
}
