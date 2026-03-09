/**
 * Unit tests for ontology validation.
 */
import { describe, it, expect } from 'vitest';
import { validateOntologyStructure, formatValidationErrors, formatValidationErrorsHtml } from './ontologyValidation';
import type { GraphNode, GraphEdge } from '../types';

describe('ontologyValidation', () => {
  describe('validateOntologyStructure', () => {
    it('detects circular reference in simple cycle', () => {
      const nodes: GraphNode[] = [
        { id: 'A', label: 'Class A' },
        { id: 'B', label: 'Class B' },
        { id: 'C', label: 'Class C' },
      ];
      const edges: GraphEdge[] = [
        { from: 'A', to: 'B', type: 'subClassOf' },
        { from: 'B', to: 'C', type: 'subClassOf' },
        { from: 'C', to: 'A', type: 'subClassOf' },
      ];

      const result = validateOntologyStructure(nodes, edges);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.type === 'circular_reference')).toBe(true);
    });

    it('detects self-referential class', () => {
      const nodes: GraphNode[] = [
        { id: 'SelfRef', label: 'Self Referencing' },
      ];
      const edges: GraphEdge[] = [
        { from: 'SelfRef', to: 'SelfRef', type: 'subClassOf' },
      ];

      const result = validateOntologyStructure(nodes, edges);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.type === 'circular_reference')).toBe(true);
    });

    it('detects missing class references', () => {
      const nodes: GraphNode[] = [
        { id: 'Existing', label: 'Existing Class' },
      ];
      const edges: GraphEdge[] = [
        { from: 'Existing', to: 'Missing', type: 'subClassOf' },
      ];

      const result = validateOntologyStructure(nodes, edges);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.type === 'missing_class')).toBe(true);
    });

    it('passes validation for valid ontology', () => {
      const nodes: GraphNode[] = [
        { id: 'Parent', label: 'Parent Class' },
        { id: 'Child', label: 'Child Class' },
      ];
      const edges: GraphEdge[] = [
        { from: 'Child', to: 'Parent', type: 'subClassOf' },
      ];

      const result = validateOntologyStructure(nodes, edges);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('handles empty ontology', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      const result = validateOntologyStructure(nodes, edges);
      expect(result.isValid).toBe(true);
    });
  });

  describe('formatValidationErrors', () => {
    it('formats errors correctly', () => {
      const result = {
        isValid: false,
        errors: [
          { type: 'circular_reference' as const, message: 'Circular reference detected' },
          { type: 'missing_class' as const, message: 'Missing class: TestClass' },
        ],
        warnings: ['Unusually high number of relationships'],
      };

      const formatted = formatValidationErrors(result);
      expect(formatted).toContain('Validation errors found');
      expect(formatted).toContain('Circular reference detected');
      expect(formatted).toContain('Missing class: TestClass');
      expect(formatted).toContain('Warnings');
      expect(formatted).toContain('Unusually high number');
    });

    it('returns empty string for valid ontology', () => {
      const result = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const formatted = formatValidationErrors(result);
      expect(formatted).toBe('');
    });
  });

  describe('formatValidationErrorsHtml', () => {
    it('formats errors as HTML with proper escaping', () => {
      const result = {
        isValid: false,
        errors: [
          { type: 'circular_reference' as const, message: 'Circular reference: A → B → A' },
          { type: 'missing_class' as const, message: 'Missing class: <script>alert("xss")</script>' },
        ],
        warnings: [],
      };

      const formatted = formatValidationErrorsHtml(result);
      expect(formatted).toContain('<strong>Validation errors found:</strong>');
      expect(formatted).toContain('<ul');
      expect(formatted).toContain('<li');
      // Should escape HTML in error messages
      expect(formatted).toContain('&lt;script&gt;');
      expect(formatted).not.toContain('<script>');
    });

    it('formats warnings as HTML', () => {
      const result = {
        isValid: true,
        errors: [],
        warnings: ['Unusually high number of relationships'],
      };

      const formatted = formatValidationErrorsHtml(result);
      expect(formatted).toContain('<strong>Warnings:</strong>');
      expect(formatted).toContain('Unusually high number');
    });

    it('returns empty string for valid ontology', () => {
      const result = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const formatted = formatValidationErrorsHtml(result);
      expect(formatted).toBe('');
    });
  });
});
