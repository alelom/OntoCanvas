/**
 * Parse RDF content using rdflib.js
 * Converts rdflib statements to RDF/JS quads for compatibility
 */
import { parse, Store, NamedNode, Statement } from 'rdflib';
import type { Quad } from '@rdfjs/types';
import { DataFactory } from 'n3';

export interface ParseRdfToRdflibOptions {
  /** MIME type (e.g. text/turtle, application/rdf+xml, application/ld+json) */
  contentType?: string;
  /** Base IRI for resolving relative URIs */
  baseIRI?: string;
  /** URL or file path for format detection */
  path?: string;
}

/**
 * Parse RDF string to rdflib statements
 * Uses rdflib's parse function with callback-based API
 */
export async function parseRdfToRdflibStatements(
  content: string,
  options: ParseRdfToRdflibOptions = {}
): Promise<Statement[]> {
  const { contentType, baseIRI, path } = options;

  // Determine content type from options or path
  let detectedContentType = contentType;
  if (!detectedContentType && path) {
    if (path.endsWith('.ttl') || path.endsWith('.turtle')) {
      detectedContentType = 'text/turtle';
    } else if (path.endsWith('.owl') || path.endsWith('.rdf')) {
      detectedContentType = 'application/rdf+xml';
    } else if (path.endsWith('.jsonld') || path.endsWith('.json')) {
      detectedContentType = 'application/ld+json';
    }
  }

  // Default to Turtle if not specified
  if (!detectedContentType) {
    // Try to detect from content
    const trimmed = content.trim();
    if (trimmed.startsWith('@prefix') || trimmed.startsWith('@base')) {
      detectedContentType = 'text/turtle';
    } else if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rdf:')) {
      detectedContentType = 'application/rdf+xml';
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      detectedContentType = 'application/ld+json';
    } else {
      detectedContentType = 'text/turtle'; // Default fallback
    }
  }

  // Create a Store (knowledge base) for rdflib
  const kb = new Store();

  // Create document URI (required by rdflib parse function)
  // Use path if provided (must be absolute), otherwise use baseIRI, otherwise use a default absolute URI
  // Note: rdflib parse expects doc to be a string URI, not a NamedNode
  let docUri = path || baseIRI || 'http://example.org/document';
  // Ensure URI is absolute (rdflib requires absolute URIs)
  if (!docUri.startsWith('http://') && !docUri.startsWith('https://') && !docUri.startsWith('file://')) {
    docUri = `http://example.org/${docUri}`;
  }

  // Parse using rdflib's callback-based API
  // Signature: parse(content, doc, kb, contentType, callback)
  // doc must be a string URI, not a NamedNode
  return new Promise<Statement[]>((resolve, reject) => {
    parse(content, docUri, kb, detectedContentType, (err: Error | null) => {
      if (err) {
        reject(new Error(`Failed to parse RDF with rdflib: ${err.message}`));
        return;
      }

      // Extract all statements from the store
      const statements: Statement[] = [];
      for (const statement of kb.statements) {
        statements.push(statement);
      }

      resolve(statements);
    });
  });
}

/**
 * Convert rdflib Statement to RDF/JS Quad
 */
function rdflibStatementToQuad(statement: Statement): Quad {
  const subject = convertRdflibTerm(statement.subject);
  const predicate = convertRdflibTerm(statement.predicate) as ReturnType<typeof DataFactory.namedNode>;
  const object = convertRdflibTerm(statement.object);
  const graph = statement.why ? convertRdflibTerm(statement.why) : DataFactory.defaultGraph();

  return DataFactory.quad(subject, predicate, object, graph);
}

/**
 * Convert rdflib term (NamedNode, BlankNode, Literal) to RDF/JS term
 */
function convertRdflibTerm(term: Statement['subject'] | Statement['object']): ReturnType<typeof DataFactory.namedNode> | ReturnType<typeof DataFactory.blankNode> | ReturnType<typeof DataFactory.literal> {
  if (term instanceof NamedNode) {
    return DataFactory.namedNode(term.value);
  }

  // Check if it's a BlankNode
  if (term.termType === 'BlankNode' || (term as { id?: string }).id !== undefined) {
    const blankId = (term as { id?: string; value?: string }).id ?? (term as { value?: string }).value ?? '';
    return DataFactory.blankNode(blankId);
  }

  // Check if it's a Literal
  if (term.termType === 'Literal' || (term as { datatype?: unknown; language?: string }).datatype !== undefined || (term as { language?: string }).language !== undefined) {
    const lit = term as {
      value: string;
      datatype?: { value?: string; uri?: string };
      language?: string;
    };

    const value = lit.value;
    const language = lit.language;
    const datatype = lit.datatype?.value ?? lit.datatype?.uri;

    if (language) {
      return DataFactory.literal(value, language);
    } else if (datatype) {
      return DataFactory.literal(value, DataFactory.namedNode(datatype));
    } else {
      return DataFactory.literal(value);
    }
  }

  // Fallback: try to get value and treat as NamedNode
  const value = (term as { value?: string }).value;
  if (value) {
    return DataFactory.namedNode(value);
  }

  throw new Error(`Unsupported rdflib term type: ${(term as { termType?: string }).termType ?? 'unknown'}`);
}

/**
 * Convert rdflib statements to RDF/JS quads
 */
export function rdflibStatementsToQuads(statements: Statement[]): Quad[] {
  return statements.map(rdflibStatementToQuad);
}
