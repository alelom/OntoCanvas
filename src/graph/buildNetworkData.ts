/**
 * Builds the data the graph is drawn from: the nodes and edges of classes, properties, restrictions and class
 * expressions, with the external references and the display options applied.
 * Moved out of main.ts (#175).
 */
import { getAsyncLayoutAlgorithm, DEFAULT_LAYOUT_MODE } from '../layouts';
import { placeUnsavedNodes } from '../layouts/placeUnsaved';
import { shouldShowNodeByAnnotations, getNodeStyleFromAnnotations } from '../lib/annotationNodeStyle';
import { domainAttachment, appliesToClass, describeRange, UNATTACHED_DOMAIN_NOTE, unattachedDataPropertyNodeId } from '../lib/dataPropertyDisplay';
import { definitionParents } from '../lib/definitionParents';
import { resolveExampleImages } from '../lib/exampleImages';
import { type SearchScope, scopeDimsGraph, computeSearchSets, scopeIncludesNeighbours, getNodeSearchOpacity as getSearchOpacity, getDataPropertySearchOpacity, getEdgeSearchOpacity } from '../lib/searchHighlight';
import { readableTextColor } from '../lib/textContrast';
import { getMainOntologyBase } from '../ontology/readOntology';
import { fileState, session, canvasState } from '../state/appState';
import type { GraphData, GraphEdge, GraphNode, BorderLineType } from '../types';
import { type AnnotationStyleConfig, SPACING, DATA_PROPERTY_FILL, RELATIONSHIP_LABEL_BG_RGB } from '../ui/constants';
import { getNodeOntologyUrl, getOpacityForExternalOntology, isUriFromExternalOntology, getPrefixForUri } from '../ui/externalRefs';
import { fontSettingRatios, nodeFontRatio } from '../ui/fontSizeDefaults';
import { importedNoteForNode, importedNoteFontSize, labelWithImportedNote, importedNoteWrapChars, importedNoteFont, importedNoteForDataProperty, importedNoteForRelationship } from '../ui/importedNote';
import { getRelationshipComment, getEdgeDisplayLabel } from '../ui/relationshipUtils';
import { buildSearchVocabulary } from '../ui/searchVocabulary';
import { debugLog, debugWarn, isDebugMode } from '../utils/debug';
import { getDefiningOntologyFromUri } from '../workflows/propertyLists';
import { getEdgeTypes, computeNodeDepths, getLayoutAlgorithm, estimateNodeDimensions, SELF_CONTAINED_LAYOUT_MODES, resolveOverlaps, wrapText, getDefaultColor } from '../graph';
import { runAsyncLayout } from './asyncLayout';
import { applyOpacityToColor } from './canvasHelpers';
import { firstDataPropertyRowOffset } from './dataPropertyRows';
import { isDefinedElsewhere } from './definedElsewhere';
import { outlineTargets } from './searchOutline';
import { layoutUnattachedNodes, boundsOf, rowSpacingFor } from './unattachedDataPropertyLayout';
import { DataSet } from 'vis-data/esnext';

/**
 * Get opacity value based on search category.
 * @param nodeId Node ID to check
 * @param matchingIds Set of matching node IDs
 * @param neighborIds Set of neighbor node IDs
 * @returns Opacity value: 1.0 for matching, 0.65 for neighbors, 0.08 for others (minimum 5%)
 */
export function buildNetworkData(
  filter: {
    wrapChars: number;
    minFontSize: number;
    maxFontSize: number;
    relationshipFontSize: number;
    dataPropertyFontSize?: number;
    searchQuery: string;
    searchScope: SearchScope;
    exactMatch: boolean;
    edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string }>;
    annotationStyleConfig: AnnotationStyleConfig;
    layoutMode: string;
  },
  graphData?: GraphData
): { nodes: DataSet<any>; edges: DataSet<any> } {
  // The example images a node or edge shows in its tooltip (#142), resolved against where the ontology was opened from.
  const hoverImages = (values: string[] | undefined): { exampleImages?: string[] } =>
    values?.length ? { exampleImages: resolveExampleImages(values, fileState.loadedFilePath) } : {};
  const data = graphData ?? session.rawData;
  let filteredNodes = data.nodes.filter((n) =>
    shouldShowNodeByAnnotations(n, filter.annotationStyleConfig)
  );
  let nodeIds = new Set(filteredNodes.map((n) => n.id));
  
  // Extract edgeStyleConfig from filter first
  const edgeStyleConfig = filter.edgeStyleConfig;
  
  // Debug: Check for describes edges before filtering (only if they exist or are expected)
  const describesEdgesBeforeFilter = data.edges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  // Only log if describes edges exist or if they're referenced in the edge style config
  const hasDescribesInConfig = Object.keys(edgeStyleConfig).some(type => 
    type.includes('describes') || type === 'https://w3id.org/dano#describes'
  );
  if (describesEdgesBeforeFilter.length > 0 || hasDescribesInConfig) {
    if (describesEdgesBeforeFilter.length > 0) {
      debugLog('[DEBUG] Describes edges in rawData.edges before filtering:', describesEdgesBeforeFilter);
      debugLog('[DEBUG] Available node IDs in filteredNodes:', Array.from(nodeIds));
      describesEdgesBeforeFilter.forEach((e) => {
        const fromExists = nodeIds.has(e.from);
        const toExists = nodeIds.has(e.to);
        debugLog(`[DEBUG] Describes edge: from="${e.from}" (exists: ${fromExists}), to="${e.to}" (exists: ${toExists}), type="${e.type}"`);
        if (!fromExists || !toExists) {
          debugWarn(`[DEBUG] ⚠ Describes edge will be filtered out - missing nodes`);
          if (!fromExists) debugWarn(`[DEBUG]   Missing from node: "${e.from}"`);
          if (!toExists) debugWarn(`[DEBUG]   Missing to node: "${e.to}"`);
        }
      });
    } else if (hasDescribesInConfig) {
      debugWarn('[DEBUG] ⚠ Display config references "describes" edges but none found in rawData.edges');
    }
  }
  
  // Debug: Check for edges with external property URIs before filtering
  const externalEdgesBeforeFilter = data.edges.filter((e) => 
    (e.type.startsWith('http://') || e.type.startsWith('https://')) &&
    (e.type.includes('describes') || e.type.includes('dano'))
  );
  if (externalEdgesBeforeFilter.length > 0) {
    debugLog('[DEBUG] External property edges in data.edges:', externalEdgesBeforeFilter);
    debugLog('[DEBUG] Available node IDs:', Array.from(nodeIds));
    externalEdgesBeforeFilter.forEach((e) => {
      debugLog(`[DEBUG] Edge ${e.type}: from="${e.from}" (exists: ${nodeIds.has(e.from)}), to="${e.to}" (exists: ${nodeIds.has(e.to)})`);
    });
  }
  
  let filteredEdges = data.edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
  );
  
  // Debug: Check describes edges after node filtering (only if they exist)
  const describesEdgesAfterNodeFilter = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  if (describesEdgesAfterNodeFilter.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges after node filtering: ${describesEdgesAfterNodeFilter.length}`, describesEdgesAfterNodeFilter);
  }

  const matchQuery = (filter.searchQuery || '').trim();
  // What the search finds (matchQuery) vs whether it fades the rest (searchQuery, used by every
  // opacity branch below): "Highlight matches in whole graph" only outlines, it fades nothing (#85).
  const searchQuery = scopeDimsGraph(filter.searchScope) ? matchQuery : '';
  // Search highlighting sets (matching nodes/edges + first-ring neighbours). Neighbours are only
  // populated for the "matches and their neighbours" scope, and the traversal stops at the first ring.
  // Data properties, prefixed names (foaf:member) and labels are searchable too (#81).
  const searchVocabulary = buildSearchVocabulary({
    nodes: filteredNodes,
    edgeTypes: getEdgeTypes(filteredEdges),
    objectProperties: session.objectProperties,
    dataProperties: session.dataProperties,
    externalOntologyReferences: session.externalOntologyReferences,
    mainOntologyBase: session.ttlStore ? getMainOntologyBase(session.ttlStore) : null,
  });
  // The suggestions offer exactly what is drawn — including referenced external classes such as
  // skos:Concept, which aren't among the ontology's own classes (rawData.nodes).
  canvasState.searchSuggestionSources = searchVocabulary.sources;
  const searchSets = computeSearchSets(
    filteredNodes,
    filteredEdges,
    matchQuery,
    scopeIncludesNeighbours(filter.searchScope),
    filter.exactMatch,
    { ...searchVocabulary.extras, dataProperties: searchVocabulary.dataProperties }
  );
  const { matchingNodeIds, neighborNodeIds } = searchSets;
  // What the pulsing search outline surrounds: direct matches only (#84).
  canvasState.searchOutlineTargets = outlineTargets(searchSets, matchQuery);

  // edgeStyleConfig is already defined above at the start of the function
  
  // Debug: Check describes edges before style filtering (only if they exist)
  const describesEdgesBeforeStyleFilter = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  if (describesEdgesBeforeStyleFilter.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges before style filtering: ${describesEdgesBeforeStyleFilter.length}`, describesEdgesBeforeStyleFilter);
  }
  
  // Debug: Check edge style config for describes
  const describesEdgeType = describesEdgesBeforeStyleFilter.length > 0 ? describesEdgesBeforeStyleFilter[0].type : null;
  if (describesEdgeType) {
    const describesStyle = edgeStyleConfig[describesEdgeType];
    debugLog(`[DEBUG] Edge style config for "${describesEdgeType}":`, describesStyle);
    debugLog(`[DEBUG] All edge style config keys:`, Object.keys(edgeStyleConfig));
  }
  
  // Debug: Log edges with external property URIs
  const externalEdges = filteredEdges.filter((e) => e.type.startsWith('http://') || e.type.startsWith('https://'));
  if (externalEdges.length > 0) {
    debugLog('[DEBUG] External property edges found:', externalEdges.map((e) => ({ from: e.from, to: e.to, type: e.type })));
    debugLog('[DEBUG] Edge style config keys:', Object.keys(edgeStyleConfig));
  }
  
  // Debug: Log all edges before style filtering for edge-style-test
  const edgeStyleTestEdges = filteredEdges.filter((e) => 
    e.type.includes('edge-style-test') || e.type === 'subClassOf' || e.type === 'hasProperty' || e.type === 'contains'
  );
  if (edgeStyleTestEdges.length > 0) {
    debugLog('[DEBUG] Edge-style-test edges before style filtering:', edgeStyleTestEdges.map((e) => ({ from: e.from, to: e.to, type: e.type })));
  }
  
  filteredEdges = filteredEdges.filter((e) => {
    // Try direct lookup first
    let style = edgeStyleConfig[e.type];
    
    // If not found, try to find a matching config entry by checking:
    // 1. If type is a full URI, try local name
    // 2. If type is a local name, try full URI
    // 3. Try finding any config key that matches (by local name extraction)
    if (!style) {
      const typeLocalName = e.type.includes('#') ? e.type.split('#').pop() : 
                           (e.type.includes('/') ? e.type.split('/').pop() : e.type);
      
      // Try local name if type is a full URI
      if (e.type.startsWith('http://') || e.type.startsWith('https://')) {
        if (typeLocalName && typeLocalName !== e.type) {
          style = edgeStyleConfig[typeLocalName];
        }
      }
      
      // Try full URI if type is a local name
      if (!style && !e.type.startsWith('http://') && !e.type.startsWith('https://')) {
        const matchingKey = Object.keys(edgeStyleConfig).find(key => {
          if (key.startsWith('http://') || key.startsWith('https://')) {
            const keyLocalName = key.includes('#') ? key.split('#').pop() : 
                               (key.includes('/') ? key.split('/').pop() : key);
            return keyLocalName === e.type;
          }
          return false;
        });
        if (matchingKey) {
          style = edgeStyleConfig[matchingKey];
        }
      }
      
      // As a last resort, try finding any key that has the same local name
      if (!style && typeLocalName && typeLocalName !== e.type) {
        const matchingKey = Object.keys(edgeStyleConfig).find(key => {
          const keyLocalName = key.includes('#') ? key.split('#').pop() : 
                             (key.includes('/') ? key.split('/').pop() : key);
          return keyLocalName === typeLocalName;
        });
        if (matchingKey) {
          style = edgeStyleConfig[matchingKey];
        }
      }
    }
    
    // If no style config found after all matching attempts, default to showing
    // This ensures edges are visible by default even if config entry is missing
    // CRITICAL: If style is undefined (no config entry found), default to showing
    // This handles cases where edge types exist in rawData but don't have config entries yet
    const shouldShow = style === undefined ? true : (style.show !== false);
    
    // Debug: Log edge-style-test edges that are being filtered
    if (e.type.includes('edge-style-test') || e.type === 'subClassOf' || e.type === 'hasProperty' || e.type === 'contains') {
      debugLog(`[DEBUG] Edge-style-test edge filtering: ${e.from} -> ${e.to} (${e.type})`, {
        hasStyle: !!style,
        styleShow: style?.show,
        shouldShow,
        configKeys: Object.keys(edgeStyleConfig).filter(k => k.includes('hasProperty') || k.includes('contains') || k === 'subClassOf'),
      });
    }
    
    // Debug: Specifically log describes edge filtering
    if (e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')) {
      debugLog(`[DEBUG] Describes edge style check:`, {
        type: e.type,
        style: style,
        shouldShow: shouldShow,
        showValue: style?.show,
      });
      if (!shouldShow) {
        debugWarn(`[DEBUG] ⚠ Describes edge filtered out by style config:`, style);
      }
    }
    
    if (!shouldShow && (e.type.startsWith('http://') || e.type.startsWith('https://'))) {
      debugWarn(`[DEBUG] External edge filtered out: ${e.type}, style:`, style);
    }
    
    // Debug: Log edge-style-test edges that are being filtered
    if (e.type.includes('edge-style-test') || e.type === 'subClassOf' || e.type === 'hasProperty' || e.type === 'contains') {
      if (!shouldShow) {
        debugWarn(`[DEBUG] Edge-style-test edge filtered out: ${e.from} -> ${e.to} (${e.type}), style:`, style);
      } else {
        debugLog(`[DEBUG] Edge-style-test edge kept: ${e.from} -> ${e.to} (${e.type}), style:`, style);
      }
    }
    
    return shouldShow;
  });
  
  // Debug: Log all edges after style filtering for edge-style-test
  const edgeStyleTestEdgesAfter = filteredEdges.filter((e) => 
    e.type.includes('edge-style-test') || e.type === 'subClassOf' || e.type === 'hasProperty' || e.type === 'contains'
  );
  if (edgeStyleTestEdgesAfter.length !== edgeStyleTestEdges.length) {
    debugWarn(`[DEBUG] Edge-style-test edges after style filtering: ${edgeStyleTestEdgesAfter.length} (was ${edgeStyleTestEdges.length})`, 
      edgeStyleTestEdgesAfter.map((e) => ({ from: e.from, to: e.to, type: e.type })));
  }
  
  // Debug: Check describes edges after style filtering (only if they exist)
  const describesEdgesAfterStyleFilter = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  if (describesEdgesAfterStyleFilter.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges after style filtering: ${describesEdgesAfterStyleFilter.length}`, describesEdgesAfterStyleFilter);
  }

  const layoutMode = filter.layoutMode;
  const wrapChars = filter.wrapChars ?? 12;
  const minFontSize = Math.max(8, Math.min(96, filter.minFontSize ?? 20));
  const maxFontSize = Math.max(minFontSize, Math.min(96, filter.maxFontSize ?? 70));
  const relationshipFontSize = Math.max(8, Math.min(48, filter.relationshipFontSize ?? 18));
  const dataPropertyFontSize = Math.max(8, Math.min(48, filter.dataPropertyFontSize ?? 12));
  // Classes defined by owl:equivalentClass rank below the named classes of their definition (#160), in the layout
  // and in the depth that sets font sizes.
  const definitions = session.ttlStore ? definitionParents(session.ttlStore, nodeIds) : [];
  const layoutOptions = { hierarchyTypes: canvasState.hierarchyTypes, definitions, stackLeaves: canvasState.stackLeaves };
  const definitionEdges: GraphEdge[] = canvasState.hierarchyTypes.has('subClassOf')
    ? definitions.map(({ cls, parent }) => ({ from: cls, to: parent, type: 'subClassOf' }))
    : [];
  const { depth, maxDepth } = computeNodeDepths(nodeIds, [...filteredEdges, ...definitionEdges], canvasState.hierarchyTypes);
  // Class-expression badges are sized with the display fonts (relative to their defaults); nodes by depth,
  // as they are drawn (roots follow Max, the deepest nodes Min).
  const fontSettings = { minFontSize, maxFontSize, relationshipFontSize, dataPropertyFontSize };
  const nodeCountForDefaults = session.rawData?.nodes?.length ?? 0;
  canvasState.classExpressionFontRatios = {
    ...fontSettingRatios(fontSettings, nodeCountForDefaults),
    byNode: Object.fromEntries(
      [...nodeIds].map((id) => [id, nodeFontRatio(fontSettings, depth[id] ?? 0, maxDepth, nodeCountForDefaults)]),
    ),
  };

  // The small "(defined by: …)" line above the label of imported classes and relationships (#111).
  const mainBaseForNotes = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  const importedNoteBox = (n: GraphNode, fontSize: number) => {
    const text = importedNoteForNode(n, session.externalOntologyReferences, mainBaseForNotes);
    return text ? { text, fontSize: importedNoteFontSize(fontSize) } : undefined;
  };

  let nodePositions: Record<string, { x: number; y: number }> = {};
  
  // First, preserve any existing positions from rawData (loaded from config or set by drag)
  filteredNodes.forEach((n) => {
    if (n.x != null && n.y != null) {
      nodePositions[n.id] = { x: n.x, y: n.y };
    }
  });
  
  // Use layout registry for hierarchical layouts
  // Only compute positions for nodes that don't already have positions
  // An asynchronous layout (ELK, #153) shows the default layout until its own positions arrive.
  const asyncLayout = getAsyncLayoutAlgorithm(layoutMode);
  const layoutAlgorithm = getLayoutAlgorithm(layoutMode) ?? (asyncLayout ? getLayoutAlgorithm(DEFAULT_LAYOUT_MODE) : null);
  const nodesWithoutPositions = filteredNodes.filter((n) => !(n.x != null && n.y != null));
  
  if (layoutAlgorithm && nodesWithoutPositions.length > 0) {
    // Only compute layout for nodes without positions
    const nodesToLayout = new Set(nodesWithoutPositions.map((n) => n.id));
    const nodeDimensions = new Map<string, { width: number; height: number }>();
    filteredNodes.forEach((n) => {
      const fontSize =
        maxDepth > 0
          ? Math.round(
              minFontSize +
                ((maxFontSize - minFontSize) * (maxDepth - (depth[n.id] ?? 0))) /
                  maxDepth
            )
          : maxFontSize;
      nodeDimensions.set(
        n.id,
        estimateNodeDimensions(n.label, wrapChars, fontSize, importedNoteBox(n, fontSize))
      );
    });
    
    // Compute layout for all nodes (algorithm needs full graph context)
    const computedPositions = layoutAlgorithm(
      nodeIds,
      filteredEdges,
      SPACING,
      nodeDimensions,
      layoutOptions
    );
    // The layered / relationship-aware modes produce an already-overlap-free (or
    // force-managed) layout; running resolveOverlaps would re-separate interleaved root
    // subtrees and re-inflate the width into the wide "ribbon" we are avoiding. Skip it.
    const resolvedPositions =
      SELF_CONTAINED_LAYOUT_MODES.has(layoutMode)
        ? computedPositions
        : resolveOverlaps(
            computedPositions,
            nodeIds,
            filteredEdges,
            nodeDimensions,
            { minPadding: 8 }
          );
    
    // Nodes without a position go near their placed neighbours, at the offset the layout gives them (#152).
    const fallbackSize = { width: SPACING * 0.45, height: SPACING * 0.3 };
    const sizeOf = (id: string) => nodeDimensions.get(id) ?? fallbackSize;
    const placedBefore = { ...nodePositions };
    const unsavedPositions = placeUnsavedNodes(placedBefore, resolvedPositions, filteredEdges, sizeOf);
    if (asyncLayout) {
      // Shown, not kept: the asynchronous layout's positions replace them when they arrive.
      Object.entries(unsavedPositions).forEach(([id, pos]) => {
        if (nodesToLayout.has(id)) nodePositions[id] = pos;
      });
      runAsyncLayout(asyncLayout, layoutMode, nodeIds, filteredEdges, nodeDimensions, layoutOptions, nodesToLayout, placedBefore, sizeOf, unsavedPositions);
    }
    Object.entries(asyncLayout ? {} : unsavedPositions).forEach(([id, pos]) => {
      if (nodesToLayout.has(id) && !nodePositions[id]) {
        nodePositions[id] = pos;
        // Also update data (rawData or expanded) to keep it in sync
        const node = data.nodes.find((n) => n.id === id);
        if (node) {
          node.x = pos.x;
          node.y = pos.y;
        }
      }
    });
  }

  const mainBaseForNodes = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  const nodes = filteredNodes.map((n) => {
    const pos = (n.x != null && n.y != null) ? { x: n.x, y: n.y } : nodePositions[n.id];
    const d = depth[n.id] ?? 0;
    const fontSize =
      maxDepth > 0
        ? Math.round(
            minFontSize +
              (maxFontSize - minFontSize) * (maxDepth - d) / maxDepth
          )
        : maxFontSize;
    const style = getNodeStyleFromAnnotations(n, filter.annotationStyleConfig);
    // Debug: Log node info before formatting label
    if (isDebugMode() && (n.id?.includes('BaseEntity') || n.label?.includes('Base Entity'))) {
      debugLog('[PREFIX DEBUG] Formatting label for node:', {
        id: n.id,
        label: n.label,
        isExternal: (n as GraphNode & { isExternal?: boolean }).isExternal,
        externalOntologyUrl: (n as GraphNode & { externalOntologyUrl?: string }).externalOntologyUrl,
        externalRefs: session.externalOntologyReferences.map(r => ({ url: r.url, prefix: r.prefix, usePrefix: r.usePrefix })),
      });
    }
    // The label is just the name: an imported term's defining ontology is in the note above it, and a built-in
    // term such as owl:Thing needs no prefix (#111).
    const importedNote = importedNoteForNode(n, session.externalOntologyReferences, mainBaseForNodes);
    const displayLabel = n.label;
    
    // Apply search transparency if search query is active; external nodes use configured opacity.
    // A class declared locally but defined elsewhere (rdfs:isDefinedBy → another ontology) is
    // treated like an import: dimmed with the defining ontology's opacity.
    const isExternal = (n as GraphNode & { isExternal?: boolean; externalOntologyUrl?: string }).isExternal;
    const definedElsewhere = isDefinedElsewhere(n, mainBaseForNodes);
    const isExternalLike = !!isExternal || definedElsewhere;
    const externalUrl =
      (n as GraphNode & { externalOntologyUrl?: string }).externalOntologyUrl ??
      (definedElsewhere ? getNodeOntologyUrl(n) ?? undefined : undefined);
    const baseOpacity = isExternalLike ? getOpacityForExternalOntology(externalUrl, session.externalOntologyReferences) : 1.0;
    let nodeOpacity = baseOpacity;
    let backgroundColor = style.background;
    let borderColor = style.border;
    let fontColor = readableTextColor(style.background);
    
    if (searchQuery) {
      const searchOpacity = getSearchOpacity(n.id, matchingNodeIds, neighborNodeIds);
      nodeOpacity = isExternalLike ? searchOpacity * baseOpacity : searchOpacity;
      if (nodeOpacity < 1.0) {
        backgroundColor = applyOpacityToColor(style.background, nodeOpacity);
        borderColor = applyOpacityToColor(style.border, nodeOpacity);
        fontColor = applyOpacityToColor(readableTextColor(style.background, { opacity: nodeOpacity }), nodeOpacity);
      }
    } else if (isExternalLike) {
      backgroundColor = applyOpacityToColor(style.background, baseOpacity);
      borderColor = applyOpacityToColor(style.border, baseOpacity);
      fontColor = applyOpacityToColor(readableTextColor(style.background, { opacity: baseOpacity }), baseOpacity);
    }
    
    const node: Record<string, unknown> = {
      id: n.id,
      label: importedNote ? labelWithImportedNote(wrapText(displayLabel, wrapChars), importedNote, importedNoteWrapChars(wrapChars, fontSize)) : wrapText(displayLabel, wrapChars),
      labellableRoot: n.labellableRoot,
      color: { background: backgroundColor, border: borderColor },
      font: { size: fontSize, color: fontColor, ...(importedNote && importedNoteFont(fontSize, fontColor)) },
      ...(style.shapeProperties && { shapeProperties: style.shapeProperties }),
      ...((): { title?: string } => {
        // Lead with a source note (like external "(Imported from …)"), then the rdfs:comment.
        const extUrl = (n as GraphNode & { externalOntologyUrl?: string }).externalOntologyUrl;
        const note =
          (n as GraphNode & { isExternal?: boolean }).isExternal && extUrl
            ? `(Imported from ${extUrl})`
            : definedElsewhere && externalUrl
              ? `(Defined by ${externalUrl})`
              : undefined;
        const title = note
          ? (n.comment ? `${note}\n\n${n.comment}` : note)
          : n.comment ?? undefined;
        return title ? { title } : {};
      })(),
      ...hoverImages(n.exampleImages),
    };
    
    // Apply opacity property if less than 1.0
    if (nodeOpacity < 1.0) {
      node.opacity = nodeOpacity;
    }
    
    if (pos) {
      node.x = pos.x;
      node.y = pos.y;
    }
    return node;
  });

  // Add data property nodes as small rectangles
  const dataPropertyNodes: Array<Record<string, unknown>> = [];
  const dataPropertyEdges: Array<Record<string, unknown>> = [];
  
  // Track which data properties are already displayed as restrictions, keyed by class and by
  // property name on its own (a property placed by any restriction is not floating).
  const displayedAsRestriction = new Set<string>();
  const restrictedPropertyNames = new Set<string>();
  
  // Calculate node dimensions for proper positioning
  const nodeDimensionsMap = new Map<string, { width: number; height: number }>();
  filteredNodes.forEach((n) => {
    const d = depth[n.id] ?? 0;
    const fontSize =
      maxDepth > 0
        ? Math.round(
            minFontSize +
              (maxFontSize - minFontSize) * (maxDepth - d) / maxDepth
          )
        : maxFontSize;
    // Estimate from the label as drawn (prefix included), or imported classes come out a line short (#72).
    const note = importedNoteBox(n, fontSize);
    nodeDimensionsMap.set(n.id, estimateNodeDimensions(n.label, wrapChars, fontSize, note));
  });
  
  // Group data properties by their parent class node for better layout
  const dataPropsByClass = new Map<string, Array<{ id: string; label: string; isRestriction: boolean; propertyName: string; onDataRange?: string }>>();
  
  // First, collect all data property restrictions
  filteredNodes.forEach((n) => {
    const restrictions = n.dataPropertyRestrictions;
    if (restrictions && restrictions.length > 0) {
      if (!dataPropsByClass.has(n.id)) {
        dataPropsByClass.set(n.id, []);
      }
      restrictions.forEach((restriction) => {
        const dp = session.dataProperties.find((p) => p.name === restriction.propertyName);
        const label = dp?.label ?? restriction.propertyName;
        const cardLabel =
          restriction.minCardinality != null || restriction.maxCardinality != null
            ? ` [${restriction.minCardinality ?? 0}..${restriction.maxCardinality ?? '*'}]`
            : '';
        const dataPropNodeId = `__dataproprestrict__${n.id}__${restriction.propertyName}`;
        displayedAsRestriction.add(`${n.id}__${restriction.propertyName}`);
        restrictedPropertyNames.add(restriction.propertyName);
        dataPropsByClass.get(n.id)!.push({
          id: dataPropNodeId,
          label: label + cardLabel,
          isRestriction: true,
          propertyName: restriction.propertyName,
          onDataRange: restriction.onDataRange,
        });
      });
    }
  });
  
  // Then, collect generic data properties. Properties that assert no rdfs:domain are not attached
  // to any class here; they are drawn free-standing further below, unless a restriction already
  // puts them on a class — that restriction is an assertion, so the node is not floating.
  const unattachedDataProps = session.dataProperties.filter(
    (dp) => !dp.contextOnly && domainAttachment(dp) === 'unattached' && !restrictedPropertyNames.has(dp.name)
  );
  session.dataProperties.forEach((dp) => {
    if (dp.contextOnly) return; // declared only in an import (#104): listed in the menu, never drawn
    filteredNodes.forEach((n) => {
      if (displayedAsRestriction.has(`${n.id}__${dp.name}`)) return;
      if (!appliesToClass(dp, n.id, canvasState.clusterThingDataProperties)) return;
      
      if (!dataPropsByClass.has(n.id)) {
        dataPropsByClass.set(n.id, []);
      }
      const dataPropNodeId = `__dataprop__${n.id}__${dp.name}`;
      dataPropsByClass.get(n.id)!.push({
        id: dataPropNodeId,
        label: dp.label,
        isRestriction: false,
        propertyName: dp.name,
      });
    });
  });
  
  // Position data properties for each class node
  dataPropsByClass.forEach((dataProps, classId) => {
    const classNode = filteredNodes.find((n) => n.id === classId);
    if (!classNode) return;
    
    const classPos = (classNode.x != null && classNode.y != null) 
      ? { x: classNode.x, y: classNode.y } 
      : nodePositions[classId];
    if (!classPos) return;
    
    const nodeDim = nodeDimensionsMap.get(classId) ?? { width: 100, height: 40 };
    // Round up the node width to be less conservative (ceiling approach)
    const classNodeWidth = Math.ceil(nodeDim.width);
    const classNodeHeight = nodeDim.height;
    
    // Calculate available width: node width + 50px on each side
    // Add tolerance factor (20% more) to allow properties to slightly exceed parent width
    const baseAvailableWidth = classNodeWidth + 100;
    const availableWidth = Math.ceil(baseAvailableWidth * 1.2);
    
    // Estimate width per data property node (label length + padding)
    // Each data property node width depends on font size
    const estimateDataPropWidth = (label: string): number => {
      // Use character width ratio similar to node dimensions estimation
      // Font size affects character width: ~0.62 * fontSize per character
      const charWidth = dataPropertyFontSize * 0.62;
      const textWidth = label.length * charWidth;
      // Add padding: 2 * margin (4px each) + some extra for node shape
      const padding = 8 + 30; // margin + node shape padding
      return Math.max(60, textWidth + padding);
    };
    
    // Calculate how many properties fit per row
    let currentRowWidth = 0;
    let propertiesPerRow: number[] = [];
    let currentRowCount = 0;
    
    dataProps.forEach((dataProp) => {
      const propWidth = estimateDataPropWidth(dataProp.label);
      const spacing = 15; // Horizontal spacing between properties
      
      // More tolerant check: allow fitting if within available width or if it's the first item in a row
      // Also allow if adding this property would only slightly exceed (within 10% tolerance)
      const wouldExceed = currentRowWidth + propWidth + spacing > availableWidth;
      const exceedsBy = (currentRowWidth + propWidth + spacing) - availableWidth;
      const tolerance = availableWidth * 0.1; // 10% tolerance
      const fitsWithTolerance = wouldExceed && exceedsBy <= tolerance;
      
      if ((currentRowWidth + propWidth + spacing <= availableWidth || fitsWithTolerance) || currentRowCount === 0) {
        currentRowWidth += propWidth + spacing;
        currentRowCount++;
      } else {
        // Start new row
        propertiesPerRow.push(currentRowCount);
        currentRowWidth = propWidth + spacing;
        currentRowCount = 1;
      }
    });
    if (currentRowCount > 0) {
      propertiesPerRow.push(currentRowCount);
    }
    
    // Calculate positions with horizontal fan-out and alternating vertical positions
    const horizontalSpacing = 15;
    const verticalOffset = 25; // Vertical offset for alternating rows
    // First row below the class, leaving a minimum visible edge so arrowheads stay outside it (#72).
    const baseYOffset = firstDataPropertyRowOffset(classNodeHeight, dataPropertyFontSize);
    
    let propIndex = 0;
    let currentY = classPos.y + baseYOffset;
    let rowIndex = 0;
    
    dataProps.forEach((dataProp) => {
      
      // Check if we need to start a new row
      if (propIndex > 0 && propertiesPerRow.length > 0) {
        let propsInPreviousRows = 0;
        for (let i = 0; i < rowIndex; i++) {
          propsInPreviousRows += propertiesPerRow[i];
        }
        if (propIndex >= propsInPreviousRows + propertiesPerRow[rowIndex]) {
          // Move to next row
          rowIndex++;
          currentY = classPos.y + baseYOffset + (rowIndex * (verticalOffset * 2)); // Alternate Y position
        }
      }
      
      
      // Actually, let me recalculate this more simply
      let rowStartIndex = 0;
      for (let i = 0; i < rowIndex; i++) {
        rowStartIndex += propertiesPerRow[i];
      }
      
      // Calculate total width of current row
      let rowTotalWidth = 0;
      for (let i = rowStartIndex; i < rowStartIndex + propertiesPerRow[rowIndex]; i++) {
        if (i < dataProps.length) {
          rowTotalWidth += estimateDataPropWidth(dataProps[i].label) + (i > rowStartIndex ? horizontalSpacing : 0);
        }
      }
      
      // Center the row
      const rowCenterX = classPos.x;
      const rowLeftX = rowCenterX - (rowTotalWidth / 2);
      
      // Position this property
      let xPos = rowLeftX;
      for (let i = rowStartIndex; i < propIndex; i++) {
        xPos += estimateDataPropWidth(dataProps[i].label) + horizontalSpacing;
      }
      xPos += estimateDataPropWidth(dataProp.label) / 2; // Center the property node
      
      const finalDataPropPos: { x: number; y: number } = {
        x: xPos,
        y: currentY + (rowIndex % 2 === 0 ? 0 : verticalOffset), // Alternate up/down for even/odd rows
      };
      
      const dp = session.dataProperties.find((p) => p.name === dataProp.propertyName);
      
      // An unasserted rdfs:range contributes no suffix, so it cannot be read as a declared datatype.
      const rangeDisplay = describeRange(dp, dataProp.onDataRange);
      
      // Check if data property is imported and get its opacity
      // Use isDefinedBy if present, otherwise check if URI belongs to external ontology
      const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
      const isDataPropImported = dp ? (dp.isDefinedBy ? isUriFromExternalOntology(dp.uri, dp.isDefinedBy, session.externalOntologyReferences, mainBase) : isUriFromExternalOntology(dp.uri, null, session.externalOntologyReferences, mainBase)) : false;
      // Get the defining ontology URL for opacity lookup
      const definingOntologyUrl = dp?.isDefinedBy || (dp?.uri ? getDefiningOntologyFromUri(dp.uri, session.externalOntologyReferences) : null);
      const baseDataPropOpacity = isDataPropImported ? getOpacityForExternalOntology(definingOntologyUrl, session.externalOntologyReferences) : 1.0;
      
      // Apply search transparency if search query is active
      // Data property nodes use imported opacity if applicable, otherwise inherit from class node
      let dataPropNodeOpacity = baseDataPropOpacity;
      let dataPropBackgroundColor = DATA_PROPERTY_FILL;
      let dataPropBorderColor = '#4a90a4';
      let dataPropFontColor = readableTextColor(DATA_PROPERTY_FILL);
      
      if (searchQuery) {
        // Full when this property matched (#81), otherwise the class node's opacity category; times the
        // base opacity if imported
        const searchOpacity = getDataPropertySearchOpacity(dataProp.propertyName, classId, searchSets, searchQuery);
        dataPropNodeOpacity = isDataPropImported ? searchOpacity * baseDataPropOpacity : searchOpacity;
        if (dataPropNodeOpacity < 1.0) {
          dataPropBackgroundColor = applyOpacityToColor(DATA_PROPERTY_FILL, dataPropNodeOpacity);
          dataPropBorderColor = applyOpacityToColor('#4a90a4', dataPropNodeOpacity);
          dataPropFontColor = applyOpacityToColor(readableTextColor(DATA_PROPERTY_FILL, { opacity: dataPropNodeOpacity }), dataPropNodeOpacity);
        }
      } else if (isDataPropImported) {
        // Apply imported opacity
        dataPropBackgroundColor = applyOpacityToColor(DATA_PROPERTY_FILL, baseDataPropOpacity);
        dataPropBorderColor = applyOpacityToColor('#4a90a4', baseDataPropOpacity);
        dataPropFontColor = applyOpacityToColor(readableTextColor(DATA_PROPERTY_FILL, { opacity: baseDataPropOpacity }), baseDataPropOpacity);
      }
      
      // Get prefix for data property if it's imported
      const dataPropPrefix = dp ? getPrefixForUri(dp.uri, dp.isDefinedBy, session.externalOntologyReferences, mainBase) : null;
      // The label is just the name: an imported property's defining ontology is in the note above it (#111).
      const dataPropNote = importedNoteForDataProperty(dp, session.externalOntologyReferences, mainBase);
      const dataPropDisplayLabel = dataProp.label;
      
      // A data property whose domain/range is an anonymous class expression is marked with a small
      // badge (∪ ∩ ¬ {}) overlapping its stub node (classExpressionOverlayRenderer, which owns the
      // hover/click too) — the label stays the plain property name, so nothing is added here. #59-#62
      // Format the node label as "prefix:property label (datatype)" - e.g., "dpbase:createdDate (xsd:dateTime)"
      const nodeLabel = `${dataPropDisplayLabel}${rangeDisplay.labelSuffix}`;
      
      // Build tooltip: include comment if present, and add import hint if imported
      let tooltip = dp?.comment || '';
      if (dp?.rangeExpression) {
        tooltip = tooltip ? `${tooltip}\n\nRange: ${dp.rangeExpression}` : `Range: ${dp.rangeExpression}`;
      }
      if (rangeDisplay.source !== 'asserted') {
        tooltip = tooltip ? `${tooltip}\n\n${rangeDisplay.tooltipNote}` : rangeDisplay.tooltipNote;
      }
      if (isDataPropImported && definingOntologyUrl) {
        const importHint = `(Imported from ${definingOntologyUrl})`;
        tooltip = tooltip ? `${tooltip}\n\n${importHint}` : importHint;
      }

      // Debug: Log the actual label being set for the node
      debugLog(`[DEBUG] Setting data property node label: propertyName="${dataProp.propertyName}", classId="${classId}", nodeLabel="${nodeLabel}", prefix="${dataPropPrefix}", isImported="${isDataPropImported}", tooltip="${tooltip}"`);
        
      const dataPropNode: Record<string, unknown> = {
        id: dataProp.id,
        label: dataPropNote ? labelWithImportedNote(wrapText(nodeLabel, wrapChars), dataPropNote, importedNoteWrapChars(wrapChars, dataPropertyFontSize)) : wrapText(nodeLabel, wrapChars),
        shape: 'box',
        size: 15,
        color: { background: dataPropBackgroundColor, border: dataPropBorderColor },
        font: { size: dataPropertyFontSize, color: dataPropFontColor, ...(dataPropNote && importedNoteFont(dataPropertyFontSize, dataPropFontColor)) },
        margin: 4,
        physics: false,
        x: finalDataPropPos.x,
        y: finalDataPropPos.y,
        ...(tooltip && { title: tooltip }),
        ...hoverImages(dp?.exampleImages),
      };
      
      // Apply opacity property if less than 1.0
      if (dataPropNodeOpacity < 1.0) {
        dataPropNode.opacity = dataPropNodeOpacity;
      }
      
      dataPropertyNodes.push(dataPropNode);
        
      propIndex++;
      
      // Apply search transparency if search query is active
      // Data property edges inherit opacity from their associated class node
      let dataPropEdgeColor = '#4a90a4';
      let dataPropEdgeFontColor = '#666';
      
      if (searchQuery) {
        // Same as the box it leads to (#81)
        const dataPropEdgeOpacity = getDataPropertySearchOpacity(dataProp.propertyName, classId, searchSets, searchQuery);
        if (dataPropEdgeOpacity < 1.0) {
          dataPropEdgeColor = applyOpacityToColor('#4a90a4', dataPropEdgeOpacity);
          dataPropEdgeFontColor = applyOpacityToColor('#666', dataPropEdgeOpacity);
        }
      }
      
      // Create edge - no label (label is now in the node)
      // Arrow points from class (domain) to data property node (range type)
      if (dataProp.isRestriction) {
        dataPropertyEdges.push({
          id: `${classId}->${dataProp.id}:dataproprestrict`,
          from: classId,
          to: dataProp.id,
          arrows: 'to',
          label: '', // No label on edge - label is in the node
          font: { size: relationshipFontSize, color: dataPropEdgeFontColor },
          color: { color: dataPropEdgeColor, highlight: dataPropEdgeColor },
          dashes: false, // Solid line
          width: 3, // Thicker line for restrictions
        });
      } else {
        dataPropertyEdges.push({
          id: `${classId}->${dataProp.id}:dataprop`,
          from: classId,
          to: dataProp.id,
          arrows: 'to',
          label: '', // No label on edge - label is in the node
          font: { size: relationshipFontSize, color: dataPropEdgeFontColor },
          color: { color: dataPropEdgeColor, highlight: dataPropEdgeColor },
          dashes: [5, 5], // Dashed line
          width: 1, // Thinner line for normal data properties
        });
      }
    });
  });

  // Data properties that assert no rdfs:domain belong to no class, so they get their own band below
  // the graph with no edge to anything. Drawing them on a class would state a domain the ontology
  // never asserted - which is how a domainless property used to end up hanging off skos:Concept.
  if (unattachedDataProps.length > 0) {
    const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
    const entries = unattachedDataProps.map((dp) => {
      const rangeDisplay = describeRange(dp);
      const note = importedNoteForDataProperty(dp, session.externalOntologyReferences, mainBase);
      const label = `${dp.label}${rangeDisplay.labelSuffix}`;
      const definingOntologyUrl = dp.isDefinedBy || (dp.uri ? getDefiningOntologyFromUri(dp.uri, session.externalOntologyReferences) : null);
      const isImported = isUriFromExternalOntology(dp.uri, dp.isDefinedBy ?? null, session.externalOntologyReferences, mainBase);
      const notes = [
        rangeDisplay.source === 'asserted' ? null : rangeDisplay.tooltipNote,
        UNATTACHED_DOMAIN_NOTE,
        isImported && definingOntologyUrl ? `(Imported from ${definingOntologyUrl})` : null,
      ];
      const tooltip = [dp.comment || null, ...notes].filter(Boolean).join('\n\n');
      // These nodes stand outside the class graph, so they have no class to take a search category
      // or an external-ontology fade from - both have to be resolved from the property itself.
      const importedOpacity = isImported
        ? getOpacityForExternalOntology(definingOntologyUrl, session.externalOntologyReferences)
        : 1.0;
      const opacity =
        getDataPropertySearchOpacity(dp.name, null, searchSets, searchQuery) * importedOpacity;
      return { dp, label, tooltip, opacity, note };
    });

    const classPositions = filteredNodes
      .map((n) => (n.x != null && n.y != null ? { x: n.x, y: n.y } : nodePositions[n.id]))
      .filter((p): p is { x: number; y: number } => !!p);
    // Measure the label as it is drawn - wrapped - not by its raw character count. A label wrapping
    // to three lines was being laid out as one long, one-line-tall box, which both inflated the
    // widths (forcing rows earlier than needed) and let the rows it created overlap vertically.
    const dimensions = entries.map((e) =>
      estimateNodeDimensions(e.label, wrapChars, dataPropertyFontSize, e.note ? { text: e.note, fontSize: importedNoteFontSize(dataPropertyFontSize) } : undefined)
    );
    const positions = layoutUnattachedNodes(
      dimensions.map((d) => d.width),
      boundsOf(classPositions),
      { rowSpacing: rowSpacingFor(dimensions.map((d) => d.height)) }
    );

    entries.forEach((entry, i) => {
      const pos = positions[i];
      const faded = entry.opacity < 1.0;
      dataPropertyNodes.push({
        id: unattachedDataPropertyNodeId(entry.dp.name),
        label: entry.note ? labelWithImportedNote(wrapText(entry.label, wrapChars), entry.note, importedNoteWrapChars(wrapChars, dataPropertyFontSize)) : wrapText(entry.label, wrapChars),
        shape: 'box',
        size: 15,
        color: {
          background: faded ? applyOpacityToColor(DATA_PROPERTY_FILL, entry.opacity) : DATA_PROPERTY_FILL,
          border: faded ? applyOpacityToColor('#4a90a4', entry.opacity) : '#4a90a4',
        },
        font: ((color: string) => ({
          size: dataPropertyFontSize,
          color,
          ...(entry.note && importedNoteFont(dataPropertyFontSize, color)),
        }))(
          faded
            ? applyOpacityToColor(readableTextColor(DATA_PROPERTY_FILL, { opacity: entry.opacity }), entry.opacity)
            : readableTextColor(DATA_PROPERTY_FILL)
        ),
        margin: 4,
        physics: false,
        // Dashed border marks these as unattached, matching the absence of a connecting edge.
        shapeProperties: { borderDashes: [4, 3] },
        x: pos.x,
        y: pos.y,
        ...(faded && { opacity: entry.opacity }),
        ...(entry.tooltip && { title: entry.tooltip }),
        ...hoverImages(entry.dp.exampleImages),
      });
    });
  }

  // Debug: Check describes edges before mapping to vis-network format (only if they exist)
  const describesEdgesBeforeMapping = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  if (describesEdgesBeforeMapping.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges before mapping to vis-network: ${describesEdgesBeforeMapping.length}`, describesEdgesBeforeMapping);
  }
  
  const edges = filteredEdges.map((e) => {
    const style = edgeStyleConfig[e.type] || {
      showLabel: true,
      color: getDefaultColor(),
      lineType: 'solid' as BorderLineType,
    };
    const edgeComment = getRelationshipComment(e.type, session.objectProperties);
    // Relationships defined in another ontology carry the same small note as imported classes (#111).
    const importedEdgeNote = style.showLabel ? importedNoteForRelationship(e.type, session.objectProperties, session.externalOntologyReferences, mainBaseForNotes) : null;
    const edgeLabelText = style.showLabel ? getEdgeDisplayLabel(e, session.objectProperties, session.externalOntologyReferences) : '';
    
    // Styling based on whether edge is from restriction or domain/range
    // Thick continuous line for restrictions, thin dashed line for normal object properties
    const isRestriction = e.isRestriction ?? false;
    const width = isRestriction ? 3 : 1; // Thick for restrictions, thin for normal
    const dashes = isRestriction ? false : [5, 5]; // Continuous for restrictions, dashed for normal
    
    // Apply search transparency if search query is active
    let edgeColor = style.color;
    let edgeFontColor = '#2c3e50';
    // Solid light-grey box behind the label, 50% opacity — dimmed with the edge under search.
    let labelBgAlpha = 0.5;

    if (searchQuery) {
      // An edge is full-opacity only when it matched directly or joins two matched nodes.
      // Edges merely departing from a matched node toward a non-neighbour are dimmed; edges
      // to first-ring neighbours are shown dimmed-but-visible only in the neighbours scope.
      const edgeOpacity = getEdgeSearchOpacity(
        e.from,
        e.to,
        e.type,
        searchSets,
        scopeIncludesNeighbours(filter.searchScope)
      );
      if (edgeOpacity < 1.0) {
        edgeColor = applyOpacityToColor(style.color, edgeOpacity);
        edgeFontColor = applyOpacityToColor('#2c3e50', edgeOpacity);
        labelBgAlpha = 0.5 * edgeOpacity;
      }
    }
    
    // Debug: Log describes edge mapping
    if (e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')) {
      debugLog(`[DEBUG] Mapping describes edge to vis-network:`, {
        from: e.from,
        to: e.to,
        type: e.type,
        style: style,
        edgeId: `${e.from}->${e.to}:${e.type}`,
        isRestriction: isRestriction,
      });
    }
    
    return {
      id: `${e.from}->${e.to}:${e.type}`,
      from: e.from,
      to: e.to,
      arrows: 'to',
      label: importedEdgeNote ? labelWithImportedNote(edgeLabelText, importedEdgeNote) : edgeLabelText,
      font: {
        size: relationshipFontSize,
        color: edgeFontColor,
        ...(importedEdgeNote && importedNoteFont(relationshipFontSize, edgeFontColor)),
        ...(style.showLabel && { background: `rgba(${RELATIONSHIP_LABEL_BG_RGB}, ${labelBgAlpha})` }),
      },
      color: { color: edgeColor, highlight: edgeColor },
      dashes,
      width,
      ...(edgeComment && { title: edgeComment }),
      ...hoverImages(session.objectProperties.find((p) => p.name === e.type)?.exampleImages),
    };
  });
  
  // Debug: Check describes edges after mapping (only if they exist)
  const describesEdgesAfterMapping = edges.filter((e) => 
    (e.id as string).includes('describes')
  );
  if (describesEdgesAfterMapping.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges after mapping to vis-network: ${describesEdgesAfterMapping.length}`, describesEdgesAfterMapping);
  }

  // Deduplicate edges by id (same from, to, and type)
  // CRITICAL: Also check for format variations (URI vs local name) to catch duplicates
  const edgeMap = new Map<string, Record<string, unknown>>();
  const seenEdgeKeys = new Set<string>();
  
  edges.forEach((edgeObj) => {
    const edgeId = edgeObj.id as string;
    const from = edgeObj.from as string;
    const to = edgeObj.to as string;
    // Extract type from edge ID if not present in edge object
    // Edge ID format: `${from}->${to}:${type}`
    let type = (edgeObj as { type?: string }).type as string;
    if (!type && edgeId.includes(':')) {
      const parts = edgeId.split(':');
      if (parts.length > 1) {
        type = parts.slice(1).join(':'); // Handle types that contain colons
      }
    }
    
    // Build all possible keys for this edge (accounting for URI/local name variations)
    const keys = new Set<string>();
    keys.add(edgeId); // Exact match
    keys.add(`${from}->${to}:${type}`); // Also add without the exact ID format
    
    // Extract local names for from/to
    const fromLocal = from.includes('#') ? from.split('#').pop() : from.includes('/') ? from.split('/').pop() : from;
    const toLocal = to.includes('#') ? to.split('#').pop() : to.includes('/') ? to.split('/').pop() : to;
    
    // Add variations with op.uri and op.name
    const op = session.objectProperties.find((p) => p.name === type || p.uri === type);
    if (op) {
      if (op.name && op.name !== type) {
        keys.add(`${from}->${to}:${op.name}`);
        if (fromLocal !== from) keys.add(`${fromLocal}->${to}:${op.name}`);
        if (toLocal !== to) keys.add(`${from}->${toLocal}:${op.name}`);
        if (fromLocal !== from && toLocal !== to) keys.add(`${fromLocal}->${toLocal}:${op.name}`);
      }
      if (op.uri && op.uri !== type) {
        keys.add(`${from}->${to}:${op.uri}`);
        if (fromLocal !== from) keys.add(`${fromLocal}->${to}:${op.uri}`);
        if (toLocal !== to) keys.add(`${from}->${toLocal}:${op.uri}`);
        if (fromLocal !== from && toLocal !== to) keys.add(`${fromLocal}->${toLocal}:${op.uri}`);
      }
    }
    
    // Add variations for from/to using local names
    if (fromLocal !== from) {
      keys.add(`${fromLocal}->${to}:${type}`);
      if (op) {
        if (op.name) keys.add(`${fromLocal}->${to}:${op.name}`);
        if (op.uri) keys.add(`${fromLocal}->${to}:${op.uri}`);
      }
    }
    if (toLocal !== to) {
      keys.add(`${from}->${toLocal}:${type}`);
      if (op) {
        if (op.name) keys.add(`${from}->${toLocal}:${op.name}`);
        if (op.uri) keys.add(`${from}->${toLocal}:${op.uri}`);
      }
    }
    if (fromLocal !== from && toLocal !== to) {
      keys.add(`${fromLocal}->${toLocal}:${type}`);
      if (op) {
        if (op.name) keys.add(`${fromLocal}->${toLocal}:${op.name}`);
        if (op.uri) keys.add(`${fromLocal}->${toLocal}:${op.uri}`);
      }
    }
    
    // Check if any of these keys have been seen
    let isDuplicate = false;
    for (const key of keys) {
      if (seenEdgeKeys.has(key)) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      // Mark all keys as seen and add the edge
      for (const key of keys) {
        seenEdgeKeys.add(key);
      }
      edgeMap.set(edgeId, edgeObj as Record<string, unknown>);
    } else {
      // Duplicate edge found - log it
      debugWarn('Duplicate edge detected (format variation):', edgeId, edgeObj);
    }
  });
  const uniqueEdges = Array.from(edgeMap.values());
  
  // Separate self-loops (from === to) from regular edges
  const selfLoops: Array<Record<string, unknown>> = [];
  const regularEdges: Array<Record<string, unknown>> = [];
  uniqueEdges.forEach((edgeObj) => {
    if (edgeObj.from === edgeObj.to) {
      selfLoops.push(edgeObj);
    } else {
      regularEdges.push(edgeObj);
    }
  });

  // Handle multiple self-loops on the same node - space them out using different sizes and angles
  // When multiple object properties have the same domain and range (self-loops), they overlap completely.
  // We use different selfReference.size values to create concentric loops that don't overlap.
  // The spacing scales with relationshipFontSize to prevent label overlap with larger fonts.
  const nodeToSelfLoops = new Map<string, Array<Record<string, unknown>>>();
  selfLoops.forEach((edgeObj) => {
    const nodeId = edgeObj.from as string;
    if (!nodeToSelfLoops.has(nodeId)) nodeToSelfLoops.set(nodeId, []);
    nodeToSelfLoops.get(nodeId)!.push(edgeObj);
  });
  nodeToSelfLoops.forEach((list) => {
    if (list.length >= 2) {
      // For multiple self-loops, space them out using different sizes to create concentric circles
      // Scale spacing with relationshipFontSize to accommodate larger labels
      // Base size: 2x font size (minimum 30) to ensure adequate spacing
      // Increment: 1.5x font size (minimum 20) to maintain proportional spacing
      const baseSize = Math.max(30, relationshipFontSize * 2);
      const sizeIncrement = Math.max(20, relationshipFontSize * 1.5);
      
      list.forEach((edgeObj, i) => {
        // Distribute angles evenly around the node (0 to 2π)
        const angleStep = (2 * Math.PI) / list.length;
        const angle = i * angleStep;
        
        // Use new selfReference format (replaces deprecated selfReferenceSize and selfReferenceAngle)
        edgeObj.selfReference = {
          size: baseSize + i * sizeIncrement,
          angle: angle,
        };
      });
    } else if (list.length === 1) {
      // Single self-loop - scale with font size (minimum 30)
      // Use default angle (Math.PI / 4) as suggested in the deprecation warning
      list[0].selfReference = {
        size: Math.max(30, relationshipFontSize * 2),
        angle: Math.PI / 4,
      };
    }
  });

  // Assign smooth curves to overlapping edges (same node pair) to avoid label/line overlap
  const pairToEdges = new Map<string, Array<Record<string, unknown>>>();
  regularEdges.forEach((edgeObj) => {
    const pairKey = [edgeObj.from, edgeObj.to].sort().join('|');
    if (!pairToEdges.has(pairKey)) pairToEdges.set(pairKey, []);
    pairToEdges.get(pairKey)!.push(edgeObj);
  });
  pairToEdges.forEach((list) => {
    if (list.length >= 2) {
      list.forEach((edgeObj, i) => {
        const smoothTypes = ['curvedCW', 'curvedCCW'] as const;
        const roundness = 0.15 + (i >> 1) * 0.1;
        edgeObj.smooth = {
          type: smoothTypes[i % 2],
          roundness: i % 2 === 0 ? roundness : -roundness,
        };
      });
    }
  });

  // Combine regular edges with self-loops
  const processedEdges = [...regularEdges, ...selfLoops];

  // Combine regular nodes with data property nodes
  const allNodes = [...nodes, ...dataPropertyNodes];
  // Combine processed edges (regular + self-loops) with data property edges
  const allEdges = [...processedEdges, ...dataPropertyEdges];
  
  // Debug: Final check for describes edges
  const describesEdgesFinal = allEdges.filter((e) => 
    (e.id as string).includes('describes')
  );
  // Only log final describes edges summary if they exist or were expected
  if (describesEdgesFinal.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] ===== FINAL: Describes edges in allEdges: ${describesEdgesFinal.length} =====`);
    if (describesEdgesFinal.length > 0) {
      debugLog('[DEBUG] ✓ Describes edges will be rendered:', describesEdgesFinal);
    } else if (describesEdgesBeforeFilter.length > 0) {
      // Only warn if we had describes edges that got filtered out
      debugWarn('[DEBUG] ⚠ NO describes edges in final allEdges - edge will NOT appear in graph!');
      debugLog('[DEBUG] Summary of filtering:');
      debugLog(`  - Total edges in data.edges: ${data.edges.length}`);
      debugLog(`  - Describes edges in data.edges: ${describesEdgesBeforeFilter.length}`);
      debugLog(`  - Filtered edges after node filtering: ${filteredEdges.length}`);
      debugLog(`  - Edges after style filtering: ${filteredEdges.length}`);
      debugLog(`  - Edges mapped to vis-network: ${edges.length}`);
      debugLog(`  - Unique edges (after deduplication): ${uniqueEdges.length}`);
    }
  }

  return {
    nodes: new DataSet(allNodes),
    edges: new DataSet(allEdges),
  };
}
