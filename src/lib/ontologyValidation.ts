/**
 * Ontology validation utilities to detect issues before loading.
 * Validates for circular references, malformed hierarchies, and other structural problems.
 */

import type { GraphEdge, GraphNode } from '../types';

export interface ValidationError {
  type: 'circular_reference' | 'malformed_hierarchy' | 'missing_class' | 'other';
  message: string;
  details?: {
    nodes?: string[];
    edges?: Array<{ from: string; to: string }>;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Detect circular references in class hierarchies.
 * Returns cycles found in the hierarchy (subClassOf edges only).
 * Note: contains edges are excluded as they represent part-whole relationships
 * that can be bidirectional and don't form true hierarchy cycles.
 */
function detectCircularReferences(
  nodes: GraphNode[],
  edges: GraphEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Build adjacency list for hierarchy edges only
  // Only subClassOf represents a true hierarchy relationship
  // contains is a part-whole relationship and can be bidirectional, so it shouldn't be used for cycle detection
  const hierarchyEdges = edges.filter(
    (e) => e.type === 'subClassOf' && 
           nodes.some(n => n.id === e.from) && 
           nodes.some(n => n.id === e.to)
  );
  
  const parents: Record<string, string[]> = {};
  const nodeIds = new Set(nodes.map(n => n.id));
  
  // For subClassOf edges: from is the child, to is the parent
  // Build a parents list: each child (from) should have its parent (to) in its parents list
  hierarchyEdges.forEach((e) => {
    if (!parents[e.from]) {
      parents[e.from] = [];
    }
    if (nodeIds.has(e.to)) {
      parents[e.from].push(e.to);
    }
  });
  
  // DFS to detect cycles by following parents (up the hierarchy)
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const seenCycles = new Set<string>();
  
  const dfs = (nodeId: string, path: string[]): void => {
    if (recStack.has(nodeId)) {
      // Found a cycle - extract the cycle from the path
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart).concat(nodeId);
      // Create a canonical representation to avoid duplicates
      const cycleKey = cycle.slice(0, -1).sort().join('->');
      if (!seenCycles.has(cycleKey)) {
        seenCycles.add(cycleKey);
        const cycleEdges: Array<{ from: string; to: string }> = [];
        for (let i = 0; i < cycle.length - 1; i++) {
          cycleEdges.push({ from: cycle[i], to: cycle[i + 1] });
        }
        
        errors.push({
          type: 'circular_reference',
          message: `Circular reference detected in class hierarchy: ${cycle.slice(0, -1).join(' → ')} → ${cycle[0]}`,
          details: {
            nodes: cycle.slice(0, -1),
            edges: cycleEdges,
          },
        });
      }
      return;
    }
    
    if (visited.has(nodeId)) {
      return;
    }
    
    visited.add(nodeId);
    recStack.add(nodeId);
    
    // Follow parents (up the hierarchy) to detect cycles
    const parentIds = parents[nodeId] || [];
    for (const parentId of parentIds) {
      if (nodeIds.has(parentId)) {
        dfs(parentId, [...path, nodeId]);
      }
    }
    
    recStack.delete(nodeId);
  };
  
  // Check all nodes for cycles
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }
  
  return errors;
}

/**
 * Check for missing class references (edges pointing to non-existent classes).
 */
function detectMissingClasses(
  nodes: GraphNode[],
  edges: GraphEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));
  
  const hierarchyEdges = edges.filter(
    (e) => e.type === 'subClassOf' || e.type === 'contains'
  );
  
  const missingTargets = new Set<string>();
  
  for (const edge of hierarchyEdges) {
    // Check if the target (parent/superclass) exists
    if (!nodeIds.has(edge.to)) {
      missingTargets.add(edge.to);
    }
    // Also check if the source exists (should always exist, but validate anyway)
    if (!nodeIds.has(edge.from)) {
      missingTargets.add(edge.from);
    }
  }
  
  if (missingTargets.size > 0) {
    const missingList = Array.from(missingTargets).slice(0, 5);
    errors.push({
      type: 'missing_class',
      message: `Missing class references: ${missingList.join(', ')}${missingTargets.size > 5 ? ` (and ${missingTargets.size - 5} more)` : ''}`,
      details: {
        nodes: Array.from(missingTargets),
      },
    });
  }
  
  return errors;
}

/**
 * Validate ontology structure before loading.
 * Checks for circular references, missing classes, and other structural issues.
 */
export function validateOntologyStructure(
  nodes: GraphNode[],
  edges: GraphEdge[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  
  // Check for circular references
  const circularRefErrors = detectCircularReferences(nodes, edges);
  errors.push(...circularRefErrors);
  
  // Check for missing classes
  const missingClassErrors = detectMissingClasses(nodes, edges);
  errors.push(...missingClassErrors);
  
  // Check for very deep hierarchies (potential issue)
  const hierarchyEdges = edges.filter(
    (e) => (e.type === 'subClassOf' || e.type === 'contains') &&
           nodes.some(n => n.id === e.from) &&
           nodes.some(n => n.id === e.to)
  );
  
  if (hierarchyEdges.length > nodes.length * 2) {
    warnings.push('Unusually high number of hierarchy relationships detected. This may indicate structural issues.');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format validation errors for display to users as plain text.
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.isValid && result.warnings.length === 0) {
    return '';
  }
  
  const parts: string[] = [];
  
  if (result.errors.length > 0) {
    parts.push('Validation errors found:');
    for (const error of result.errors) {
      parts.push(`  • ${error.message}`);
    }
  }
  
  if (result.warnings.length > 0) {
    parts.push('\nWarnings:');
    for (const warning of result.warnings) {
      parts.push(`  • ${warning}`);
    }
  }
  
  return parts.join('\n');
}

/**
 * Escape HTML special characters to prevent XSS attacks.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Format validation errors for display to users as HTML.
 * Escapes HTML to prevent XSS attacks.
 */
export function formatValidationErrorsHtml(result: ValidationResult): string {
  if (result.isValid && result.warnings.length === 0) {
    return '';
  }
  
  const parts: string[] = [];
  
  if (result.errors.length > 0) {
    parts.push('<strong>Validation errors found:</strong>');
    parts.push('<ul style="margin: 8px 0; padding-left: 20px;">');
    for (const error of result.errors) {
      parts.push(`<li style="margin: 4px 0;">${escapeHtml(error.message)}</li>`);
    }
    parts.push('</ul>');
  }
  
  if (result.warnings.length > 0) {
    parts.push('<strong>Warnings:</strong>');
    parts.push('<ul style="margin: 8px 0; padding-left: 20px;">');
    for (const warning of result.warnings) {
      parts.push(`<li style="margin: 4px 0;">${escapeHtml(warning)}</li>`);
    }
    parts.push('</ul>');
  }
  
  return parts.join('');
}
