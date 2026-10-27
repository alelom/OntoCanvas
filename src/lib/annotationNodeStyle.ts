/**
 * Whether a node is shown, and how it is styled, from the annotation properties it carries.
 * Moved out of main.ts (#175).
 */
import type { GraphNode } from '../types';
import type { AnnotationStyleConfig } from '../ui/constants';
import { borderLineTypeToVis } from '../ui/edgeStyleUtils';
import { annotationPriorityOrder } from '../workflows/propertyLists';
import { resolveNodeAnnotationStyle } from './annotationStyle';

export function shouldShowNodeByAnnotations(
  node: GraphNode,
  config: AnnotationStyleConfig
): boolean {
  return resolveNodeAnnotationStyle(node.annotations, config, annotationPriorityOrder()).show;
}

export function getNodeStyleFromAnnotations(
  node: GraphNode,
  config: AnnotationStyleConfig
): { background: string; border: string; shapeProperties?: { borderDashes: false | true | number[] } } {
  const resolved = resolveNodeAnnotationStyle(node.annotations, config, annotationPriorityOrder());
  const dashes = borderLineTypeToVis(resolved.borderLineType);
  return {
    background: resolved.background,
    border: resolved.border,
    shapeProperties: dashes !== false ? { borderDashes: dashes } : undefined,
  };
}
