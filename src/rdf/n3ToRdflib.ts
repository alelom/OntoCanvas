/**
 * Convert N3 quads to rdflib statements
 * Uses @rdfjs/types compatibility to convert between formats
 */
import { NamedNode, BlankNode, Literal, Statement } from 'rdflib';
import type { Quad } from '@rdfjs/types';

/**
 * Convert a single N3 quad to rdflib Statement
 */
export function convertN3QuadToRdflibStatement(quad: Quad): Statement {
  const subject = convertTerm(quad.subject);
  const predicate = convertTerm(quad.predicate) as NamedNode;
  const object = convertTerm(quad.object);
  
  return new Statement(subject, predicate, object);
}

/**
 * Convert an array of N3 quads to rdflib statements
 */
export function convertN3QuadsToRdflibStatements(quads: Quad[]): Statement[] {
  return quads.map(quad => convertN3QuadToRdflibStatement(quad));
}

/**
 * Convert a term (subject or object) from N3 format to rdflib format
 */
function convertTerm(term: Quad['subject'] | Quad['object']): NamedNode | BlankNode | Literal {
  switch (term.termType) {
    case 'NamedNode': {
      const uri = (term as { value: string }).value;
      return new NamedNode(uri);
    }
    
    case 'BlankNode': {
      // Get blank node ID - handle both formats
      const blankId = (term as { id?: string; value?: string }).id ?? 
                     (term as { id?: string; value?: string }).value ?? 
                     '';
      // Remove _: prefix if present
      const cleanId = blankId.startsWith('_:') ? blankId.slice(2) : blankId;
      return new BlankNode(cleanId);
    }
    
    case 'Literal': {
      const lit = term as { 
        value: string; 
        datatype?: { value: string }; 
        language?: string 
      };
      
      // rdflib Literal constructor: (value, language, datatype)
      // language defaults to '', datatype defaults to xsd:string
      
      // WORKAROUND: rdflib's Turtle serializer expects boolean literals to use "1"/"0"
      // instead of "true"/"false" (both are valid RDF lexical forms, but rdflib prefers "1"/"0")
      let normalizedValue = lit.value;
      if (lit.datatype?.value === 'http://www.w3.org/2001/XMLSchema#boolean') {
        if (lit.value === 'true') {
          normalizedValue = '1';
        } else if (lit.value === 'false') {
          normalizedValue = '0';
        }
        // "1" and "0" are already correct, no need to change them
      }
      
      if (lit.language) {
        // Language-tagged literal: (value, language)
        return new Literal(normalizedValue, lit.language);
      } else if (lit.datatype) {
        // Typed literal: (value, '', datatype) - must pass empty string for language!
        return new Literal(normalizedValue, '', new NamedNode(lit.datatype.value));
      } else {
        // Plain literal: (value) - defaults to xsd:string
        return new Literal(normalizedValue);
      }
    }
    
    default:
      throw new Error(`Unsupported term type: ${(term as { termType: string }).termType}`);
  }
}
