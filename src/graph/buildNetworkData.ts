/**
 * Builds the data the graph is drawn from: the nodes and edges of classes, properties, restrictions and class
 * expressions, with the external references and the display options applied.
 * Moved out of main.ts (#175).
 */
import { getAsyncLayoutAlgorithm, DEFAULT_LAYOUT_MODE } from '../layouts';
import { placeUnsavedNodes } from '../layouts/placeUnsaved';
import { shouldShowNodeByAnnotations, getNodeStyleFromAnnotations } from '../lib/annotationNodeStyle';
import { definitionParents } from '../lib/definitionParents';
import { resolveExampleImages } from '../lib/exampleImages';
import { type SearchScope, scopeDimsGraph, computeSearchSets, scopeIncludesNeighbours, getNodeSearchOpacity as getSearchOpacity, getEdgeSearchOpacity } from '../lib/searchHighlight';
import { readableTextColor } from '../lib/textContrast';
import { getMainOntologyBase } from '../ontology/ontologyBase';
import { fileState, session, canvasState } from '../state/appState';
import type { GraphData, GraphEdge, GraphNode, BorderLineType } from '../types';
import { type AnnotationStyleConfig, SPACING, RELATIONSHIP_LABEL_BG_RGB } from '../ui/constants';
import { getNodeOntologyUrl, getOpacityForExternalOntology } from '../ui/externalRefs';
import { fontSettingRatios, nodeFontRatio } from '../ui/fontSizeDefaults';
import { importedNoteForNode, importedNoteFontSize, labelWithImportedNote, importedNoteWrapChars, importedNoteFont, importedNoteForRelationship } from '../ui/importedNote';
import { getRelationshipComment, getEdgeDisplayLabel } from '../ui/relationshipUtils';
import { buildSearchVocabulary } from '../ui/searchVocabulary';
import { debugLog, debugWarn, isDebugMode } from '../utils/debug';
import { getEdgeTypes, computeNodeDepths, getLayoutAlgorithm, estimateNodeDimensions, SELF_CONTAINED_LAYOUT_MODES, resolveOverlaps, wrapText, getDefaultColor } from '../graph';
import { runAsyncLayout } from './asyncLayout';
import { applyOpacityToColor } from './canvasHelpers';
import { isDefinedElsewhere } from './definedElsewhere';
import { outlineTargets } from './searchOutline';
import { DataSet } from 'vis-data/esnext';

import { buildDataPropertyNodes } from './dataPropertyNodes';
import { dedupeEdges, spaceEdges } from './edgeFinishing';
import { individualSearchFilter } from '../abox/individualSearch';


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
  // Individuals are added after this, so what they keep of the search is worked out here, from the class graph's sets (#209).
  canvasState.individualSearch = searchQuery
    ? individualSearchFilter(searchSets, filteredEdges, session.objectProperties, { query: matchQuery, exactMatch: filter.exactMatch })
    : null;
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

  const { dataPropertyNodes, dataPropertyEdges } = buildDataPropertyNodes({
    filteredNodes, nodePositions, depth, maxDepth, minFontSize, maxFontSize, wrapChars, dataPropertyFontSize, relationshipFontSize, importedNoteBox, searchQuery, searchSets, hoverImages,
  });


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
      type: e.type,
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

  const uniqueEdges = dedupeEdges(edges, session.objectProperties);
  const { regularEdges, selfLoops } = spaceEdges(uniqueEdges, relationshipFontSize);

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
