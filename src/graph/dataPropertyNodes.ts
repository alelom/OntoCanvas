/**
 * The data property nodes of the graph, and the edges that tie them to their class: the ones a class carries (as a
 * restriction or by rdfs:domain), placed in rows under it, and the ones that assert no domain, in a band of their own.
 * Moved out of buildNetworkData.ts (#198).
 */

import { domainAttachment, appliesToClass, describeRange, UNATTACHED_DOMAIN_NOTE, unattachedDataPropertyNodeId } from '../lib/dataPropertyDisplay';
import { computeSearchSets, getDataPropertySearchOpacity } from '../lib/searchHighlight';
import { readableTextColor } from '../lib/textContrast';
import { getMainOntologyBase } from '../ontology/readOntology';
import { session, canvasState } from '../state/appState';
import type { GraphNode } from '../types';
import { DATA_PROPERTY_FILL } from '../ui/constants';
import { getOpacityForExternalOntology, isUriFromExternalOntology, getPrefixForUri } from '../ui/externalRefs';
import { importedNoteFontSize, labelWithImportedNote, importedNoteWrapChars, importedNoteFont, importedNoteForDataProperty } from '../ui/importedNote';
import { debugLog } from '../utils/debug';
import { getDefiningOntologyFromUri } from '../workflows/propertyLists';
import { estimateNodeDimensions, wrapText } from '../graph';
import { applyOpacityToColor } from './canvasHelpers';
import { firstDataPropertyRowOffset } from './dataPropertyRows';
import { layoutUnattachedNodes, boundsOf, rowSpacingFor } from './unattachedDataPropertyLayout';

export interface DataPropertyNodesInput {
  filteredNodes: GraphNode[];
  nodePositions: Record<string, { x: number; y: number }>;
  depth: Record<string, number>;
  maxDepth: number;
  minFontSize: number;
  maxFontSize: number;
  wrapChars: number;
  dataPropertyFontSize: number;
  relationshipFontSize: number;
  importedNoteBox: (n: GraphNode, fontSize: number) => { text: string; fontSize: number } | undefined;
  searchQuery: string;
  searchSets: ReturnType<typeof computeSearchSets>;
  hoverImages: (values: string[] | undefined) => { exampleImages?: string[] };
}

export function buildDataPropertyNodes({ filteredNodes, nodePositions, depth, maxDepth, minFontSize, maxFontSize, wrapChars, dataPropertyFontSize, relationshipFontSize, importedNoteBox, searchQuery, searchSets, hoverImages }: DataPropertyNodesInput): {
  dataPropertyNodes: Array<Record<string, unknown>>;
  dataPropertyEdges: Array<Record<string, unknown>>;
} {
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

  return { dataPropertyNodes, dataPropertyEdges };
}
