/**
 * The app's mutable state (moved out of main.ts, #175). Pins what each field started as when it was a top-level
 * `let` in main.ts, and that none of the 61 was lost in the move.
 */
import { describe, it, expect } from 'vitest';
import { session, fileState, canvasState, editState, initFlags } from '../../src/state/appState';

describe('app state', () => {
  it('holds the 61 fields that main.ts used to declare, the 2 the query panel added and the 3 individuals added (#209), in five groups', () => {
    const sizes = [session, fileState, canvasState, editState, initFlags].map((g) => Object.keys(g).length);
    expect(sizes).toEqual([16, 9, 19, 16, 6]);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(66);
  });

  it('starts with no ontology loaded', () => {
    expect(session.ttlStore).toBeNull();
    expect(session.rawData).toEqual({ nodes: [], edges: [] });
    expect(session.objectProperties).toEqual([]);
    expect(session.dataProperties).toEqual([]);
    expect(session.annotationProperties).toEqual([]);
    expect(session.externalOntologyReferences).toEqual([]);
    expect(session.currentGraphDataForBuild).toBeNull();
    expect(session.importedDeclarations).toBeNull();
    expect(session.importsBeingRead).toBe(false);
    expect(session.knownExternalClassUris.size).toBe(0);
    expect(session.importNewerVersions.size).toBe(0);
  });

  it('starts with no file, no unsaved changes and the custom serializer', () => {
    expect(fileState).toMatchObject({
      loadedFileName: null,
      loadedFilePath: null,
      fileHandle: null,
      originalTtlString: null,
      originalFileCache: null,
      isTtlFile: false,
      hasUnsavedChanges: false,
      skipSlowOperationsForTests: false,
      currentSerializerType: 'custom',
    });
  });

  it('starts with the display options on and the positions unarranged', () => {
    expect(canvasState).toMatchObject({
      network: null,
      positionsArranged: false,
      arrangedBeforeLayout: false,
      displayExternalReferences: true,
      clusterThingDataProperties: true,
      stackLeaves: true,
      externalNodeLayout: 'auto',
      lastLayoutMode: null,
      asyncLayoutRun: 0,
    });
    expect(canvasState.hierarchyTypes.size).toBeGreaterThan(0);
    expect(canvasState.classExpressionFontRatios).toEqual({ node: 1, relationship: 1, dataProperty: 1 });
  });

  it('starts with nothing to undo and no modal in progress', () => {
    expect(editState.undoStack).toEqual([]);
    expect(editState.redoStack).toEqual([]);
    expect(editState.addNodeMode).toBe(false);
    expect(editState.addNodeModalShowing).toBe(false);
    expect(editState.pendingAddEdgeData).toBeNull();
    expect(editState.selectedEdgeType).toBeNull();
  });

  it('starts with no handler set up', () => {
    expect(Object.values(initFlags).every((v) => v === false)).toBe(true);
  });

  it('keeps every group a separate object, so one concern cannot overwrite another', () => {
    const groups = [session, fileState, canvasState, editState, initFlags];
    expect(new Set(groups).size).toBe(5);
    session.rawData = { nodes: [], edges: [] };
    expect(canvasState).not.toHaveProperty('rawData');
  });
});
