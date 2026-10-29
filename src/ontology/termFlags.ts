/**
 * What any declared term can carry: example images (#142) and deprecation (#137). Moved out of readOntology.ts (#198).
 */
import { OWL } from './vocab';
import { DataFactory, type Quad as N3Quad, Store } from 'n3';
import { exampleImagesOf } from '../lib/exampleImages';

/** `{ exampleImages }` when the term has example images (#142), else nothing. */
export function withExampleImages(store: Store, subjectUri: string): { exampleImages?: string[] } {
  const exampleImages = exampleImagesOf(store, subjectUri);
  return exampleImages.length > 0 ? { exampleImages } : {};
}

/** Whether `subject` is declared `owl:deprecated true` (#137): kept for data written against earlier releases. */
export function isDeprecated(store: Store, subject: N3Quad['subject']): boolean {
  return store.getObjects(subject, DataFactory.namedNode(OWL + 'deprecated'), null).some((o) => o.termType === 'Literal' && (o.value === 'true' || o.value === '1'));
}
