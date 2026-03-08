/**
 * Unit tests for edge ID parsing (format "from->to:type" when type can be a full URI).
 */
import { describe, it, expect } from 'vitest';
import { parseEdgeId } from './edgeId';

describe('parseEdgeId', () => {
  it('parses edge id with short type (subClassOf)', () => {
    const id = 'http://example.org/ta#Task->http://example.org/ta#Assignment:subClassOf';
    const r = parseEdgeId(id);
    expect(r).not.toBeNull();
    expect(r!.from).toBe('http://example.org/ta#Task');
    expect(r!.to).toBe('http://example.org/ta#Assignment');
    expect(r!.type).toBe('subClassOf');
  });

  it('parses edge id when type is a full URI (object property)', () => {
    const id = 'http://example.org/task-assignment#Task->http://example.org/project-mgmt#Person:http://example.org/task-assignment#assignedTo';
    const r = parseEdgeId(id);
    expect(r).not.toBeNull();
    expect(r!.from).toBe('http://example.org/task-assignment#Task');
    expect(r!.to).toBe('http://example.org/project-mgmt#Person');
    expect(r!.type).toBe('http://example.org/task-assignment#assignedTo');
  });

  it('returns null when no arrow', () => {
    expect(parseEdgeId('foo:bar')).toBeNull();
  });

  it('returns null when no colon after arrow', () => {
    expect(parseEdgeId('a->b')).toBeNull();
  });
});
