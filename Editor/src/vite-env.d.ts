/// <reference types="vite/client" />

declare module 'n3' {
  export class Store {
    addQuad(subject: unknown, predicate: unknown, object: unknown, graph?: unknown): void;
    removeQuad(quad: { subject: unknown; predicate: unknown; object: unknown; graph?: unknown }): void;
    getQuads(s: unknown, p: unknown, o: unknown, g?: unknown): Array<{ subject: unknown; predicate: unknown; object: unknown; graph?: unknown }>;
    [Symbol.iterator](): Iterator<{ subject: unknown; predicate: unknown; object: unknown; graph?: unknown }>;
  }
  export class Parser {
    parse(input: string): Iterable<unknown>;
  }
  export class Writer {
    addQuad(quad: unknown): void;
    end(callback?: (err: Error | null, result: string) => void): void;
  }
  export const DataFactory: {
    namedNode(iri: string): unknown;
    literal(value: string): unknown;
    defaultGraph(): unknown;
  };
}

declare module '*.ttl?raw' {
  const content: string;
  export default content;
}
