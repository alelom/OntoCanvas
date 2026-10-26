/**
 * The page markup: fills #app with the toolbar, the graph container, the bottom bar, the modals and their styles.
 * Moved out of main.ts (#175); it holds no state and reads nothing but the build base URL and debug mode.
 */
import { searchControlsMarkup } from './searchOptions';
import { isDebugMode } from '../utils/debug';

export function renderApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div id="controls">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <button type="button" id="openOntologyBtn" class="primary" style="width: fit-content; display: flex; align-items: center; gap: 8px;">
          <img src="${import.meta.env.BASE_URL}OntoCanvas.png" alt="OntoCanvas" style="width: 20px; height: 20px;" />
          Open ontology
        </button>
        <input type="file" id="fileInput" accept=".ttl,.turtle,.owl,.rdf,.rdfxml,.jsonld,.json" style="display: none;" />
        <button type="button" id="manageExternalRefs" title="Manage external ontology references" style="width: fit-content; margin-top: 4px;">Manage external references</button>
      </div>
      <div id="vizControls" style="display: none;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <strong>Display options:</strong>
        <div id="layoutModeHintWrap" style="position: relative; display: flex; align-items: center; gap: 6px;">
          <select id="layoutMode">
            <option value="hierarchical-dag">Hierarchical DAG</option>
            <option value="hierarchical-tiers-spring">Hierarchical tiers+spring</option>
            <option value="hierarchical-force-downward">Hierarchical force-downward</option>
            <option value="elk-layered">Layered (ELK)</option>
            <option value="force">Force-directed</option>
          </select>
          <button type="button" id="layoutModeHintToggle" title="About the layout modes" aria-label="About the layout modes" style="cursor: pointer; width: 20px; height: 20px; padding: 0; border-radius: 50%; border: 1px solid #b0b8c0; background: #f4f6f8; color: #2c7be5; font-size: 12px; font-weight: bold; line-height: 1; flex: none;">i</button>
          <div id="layoutModeHintPopup" style="position: absolute; top: 100%; left: 0; margin-top: 4px; padding: 10px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; display: none; width: 340px; max-height: 60vh; overflow-y: auto;"></div>
        </div>
        <label id="clusterThingDataPropsWrap" title="Data properties whose rdfs:domain is owl:Thing apply to every class. Checked: draw each once, under an owl:Thing node. Unchecked: draw it under every class." style="font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
          <input type="checkbox" id="clusterThingDataProps" checked />
          owl:Thing data properties once
        </label>
        <label id="stackLeavesWrap" title="In the tiered layouts, a parent's children that have no children of their own are shown as a block of several columns under it, when there are 6 or more, instead of one long row. Changing it lays the graph out again." style="font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
          <input type="checkbox" id="stackLeaves" checked />
          Stack many leaves under their parent
        </label>
        <button type="button" id="restorePositions" title="Put the nodes back where they were before the layout was changed or reset" style="display: none; align-self: flex-start; cursor: pointer; padding: 2px 8px; font-size: 12px;">↶ Restore positions</button>
        <div id="textDisplayWrap" style="position: relative; display: inline-block; margin-top: 4px;">
          <button type="button" id="textDisplayToggle" style="cursor: pointer; font-weight: bold; font-size: 12px;">Text display options</button>
        <div id="textDisplayPopup" style="position: absolute; top: 100%; left: 0; margin-top: 4px; padding: 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; display: none; min-width: 280px;">
          <div style="margin-bottom: 10px;">
            <strong style="font-size: 12px;">Nodes text wrap:</strong>
            <input type="number" id="wrapChars" min="1" max="50" value="12" style="width: 50px; margin-left: 6px;">
            <span style="font-size: 11px;">chars</span>
          </div>
          <div>
            <strong style="font-size: 12px;">Node font size (px)</strong>
            <div style="margin-top: 6px;">
              <span style="font-size: 11px;">Min (leaves)</span>
              <input type="number" id="minFontSize" min="8" max="96" value="20" style="width: 45px; margin-left: 6px;">
              <span style="font-size: 11px; margin-left: 8px;">Max (roots)</span>
              <input type="number" id="maxFontSize" min="8" max="96" value="70" style="width: 45px; margin-left: 6px;">
            </div>
          </div>
          <div style="margin-top: 10px;">
            <strong style="font-size: 12px;">Relationships font size</strong>
            <input type="number" id="relationshipFontSize" min="8" max="48" value="18" style="width: 45px; margin-left: 6px;">
            <span style="font-size: 11px;">px</span>
          </div>
          <div style="margin-top: 10px;">
            <strong style="font-size: 12px;">Data properties font size</strong>
            <input type="number" id="dataPropertyFontSize" min="8" max="48" value="12" style="width: 45px; margin-left: 6px;">
            <span style="font-size: 11px;">px</span>
          </div>
        </div>
      </div>
      </div>
      <div id="styleMenusGroup" style="display: flex; flex-direction: column; gap: 8px; padding: 8px; border: 1px solid #000; border-radius: 4px;">
        <details id="edgeStylesMenu">
          <summary style="cursor: pointer; font-weight: bold;">Object Properties</summary>
          <div id="edgeStylesContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
          <button type="button" id="addRelationshipTypeBtn" style="margin-top: 6px; font-size: 11px;">+ Add object property</button>
        </details>
        <details id="dataPropsMenu">
          <summary style="cursor: pointer; font-weight: bold;">Data Properties</summary>
          <div id="dataPropsContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
          <button type="button" id="addDataPropertyBtn" style="margin-top: 6px; font-size: 11px;">+ Add data property</button>
        </details>
        <details id="annotationPropsMenu">
          <summary style="cursor: pointer; font-weight: bold;">Annotation Properties</summary>
          <div id="annotationPropsContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
          <button type="button" id="addAnnotationPropertyBtn" style="margin-top: 6px; font-size: 11px;">+ Add annotation property</button>
        </details>
      </div>
      ${searchControlsMarkup()}
      <span id="undoRedoGroup" style="gap: 4px; align-items: center; display: inline-flex; flex-direction: column;">
        <button type="button" id="undoBtn" title="Undo (Ctrl+Z)" disabled>Undo</button>
        <button type="button" id="redoBtn" title="Redo (Ctrl+Shift+Z)" disabled>Redo</button>
      </span>
      <span id="saveGroup" style="display: none; gap: 8px; align-items: center;">
        <button id="saveChanges" class="primary">Save changes</button>
        <span id="overwriteFileWrap">
          <label style="font-size: 11px;">
            <input type="checkbox" id="overwriteFile"> Overwrite file on save
          </label>
        </span>
        ${isDebugMode() ? `
          <select id="serializerSelect" style="font-size: 11px; padding: 2px 4px;" title="Serializer type (DEV mode only)">
            <option value="custom">Custom TTL Serializer</option>
            <option value="rdflib">rdflib Serializer</option>
          </select>
        ` : ''}
      </span>
      <span id="displayConfigGroup" style="display: none; gap: 4px; align-items: center; flex-direction: column;">
        <button type="button" id="saveDisplayConfig" title="Save display config to a .display.json file (e.g. next to your ontology)">Save display config</button>
        <button type="button" id="loadDisplayConfig" title="Load display config from a .display.json file">Load display config</button>
        <button type="button" id="resetDisplayConfig" title="Reset display config and regenerate layout from scratch">Reset display config</button>
      </span>
      </div>
      <div id="errorMsg" class="error" style="display: none;"></div>
      <div id="warningMsg" class="warning" style="display: none;">
        <span id="warningMsgText"></span>
        <button id="warningMsgClose" type="button" title="Dismiss warning">×</button>
      </div>
    </div>
    <div id="networkWrapper">
      <div id="network"></div>
      <div id="viewButtons">
        <button type="button" id="openInNewTab" style="display: none;">Open in a new tab</button>
        <button type="button" id="resetView">Reset view</button>
      </div>
    </div>
    <aside id="sidePanel" aria-label="Side panel"></aside>
    <div id="info">
      <span id="versionDisplay" style="font-size: 11px; color: #666;"></span>
      <span id="ontologyInfoDisplay" class="info-seg" style="font-size: 11px; display: none;"></span>
      <span id="graphCounts" class="info-seg">Nodes: <span id="nodeCount">0</span> / Edges: <span id="edgeCount">0</span></span>
      <span id="edgeColorsLegend" style="margin-left: 24px; font-size: 11px;"></span>
      <span id="selectionInfo"></span>
      <button type="button" id="queryPanelBtn" aria-pressed="false" title="Query the open ontology with SPARQL (read-only)">SPARQL query</button>
    </div>
    <div id="renameModal" class="modal" style="display: none;">
      <div class="modal-content">
        <div class="rename-modal-header">
          <h3>Edit class properties</h3>
          <div id="renameModalHeaderIcons" class="rename-modal-header-icons">
            <span id="renameModalTipBtn" class="rename-modal-header-icon" style="display: none;" role="button" tabindex="0" title="Tip">💡</span>
            <span id="renameModalInfoBtn" class="rename-modal-header-icon" role="button" tabindex="0" title="About this modal">ℹ️</span>
          </div>
        </div>
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
          <span style="font-size: 12px;">Label:</span>
          <input type="text" id="renameInput" style="flex: 1;" />
        </label>
        <p id="renameIdentifierLabel" style="font-size: 11px; color: #666; margin-bottom: 4px;">Identifier (derived from label):</p>
        <p id="renameIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin-bottom: 8px;"></p>
        <p id="renameDuplicateError" style="display: none; color: #c00; font-size: 12px; margin: 6px 0 0 0;"></p>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="renameComment" rows="3" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        
        <div id="renameAnnotationPropsSection" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
          <strong style="font-size: 12px;">Set annotation properties</strong>
          <div id="renameAnnotationPropsList" style="margin-top: 8px;"></div>
        </div>
        <div id="renameDataPropsSection" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="font-size: 12px;">Assign data property restriction</strong>
            <span id="dataPropRestrictionInfoIcon" style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; position: relative;" title="Data Property Restriction: A data property restriction allows you to specify constraints on how a data property can be used with a specific class. You can set minimum and maximum cardinality (how many times the property can appear) for instances of this class. Note: To add a new Data Property to your ontology, go to the 'Data Properties' menu in the top bar.">ℹ️</span>
          </div>
          <div id="renameDataPropsList" style="margin-top: 6px; margin-bottom: 8px; font-size: 11px;"></div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <select id="renameDataPropSelect" style="padding: 4px 8px; font-size: 11px; min-width: 120px;">
              <option value="">-- data property --</option>
            </select>
            <span style="font-size: 11px;">Min:</span>
            <input type="number" id="renameDataPropMin" min="0" placeholder="0" style="width: 48px; padding: 4px; font-size: 11px;">
            <span style="font-size: 11px;">Max:</span>
            <input type="number" id="renameDataPropMax" min="0" placeholder="*" style="width: 48px; padding: 4px; font-size: 11px;" title="Leave empty for unbounded">
            <button type="button" id="renameDataPropAdd" style="font-size: 11px; padding: 4px 8px; display: none;" disabled>Add</button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" id="renameCancel">Cancel</button>
          <button type="button" id="renameConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="addNodeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add node</h3>
        <div id="addNodeTabs" style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid #ddd;">
          <button type="button" class="add-node-tab active" data-tab="custom" style="padding: 8px 16px; background: none; border: none; border-bottom: 2px solid #3498db; cursor: pointer; font-size: 12px; font-weight: bold;">Add custom</button>
          <button type="button" class="add-node-tab" data-tab="external" id="addNodeExternalTabBtn" style="padding: 8px 16px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 12px; color: #666; display: none;">Add from referenced ontology</button>
        </div>
        <div id="addNodeCustomTab" class="add-node-tab-content">
          <label>Label: <input type="text" id="addNodeInput" placeholder="Enter node label" /></label>
          <p id="addNodeIdentifierLabel" style="font-size: 11px; color: #666; margin: 6px 0 4px 0;">Identifier (derived from label):</p>
          <p id="addNodeIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin: 0 0 8px 0;"></p>
          <p id="addNodeDuplicateError" style="display: none; color: #c00; font-size: 12px; margin: 6px 0 0 0;"></p>
          <label style="display: block; margin-top: 10px;">
            <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
            <textarea id="addNodeComment" rows="3" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
          </label>
          
          <div id="addNodeAnnotationPropsSection" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
            <strong style="font-size: 12px;">Set annotation properties</strong>
            <div id="addNodeAnnotationPropsList" style="margin-top: 8px;"></div>
          </div>
          <div id="addNodeDataPropsSection" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 12px;">Assign data property restriction</strong>
              <span id="addNodeDataPropRestrictionInfoIcon" style="cursor: help; color: #3498db; font-size: 14px;" title="Data Property Restriction: set min/max cardinality for this class.">ⓘ</span>
            </div>
            <div id="addNodeDataPropsList" style="margin-top: 6px; margin-bottom: 8px; font-size: 11px;"></div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <select id="addNodeDataPropSelect" style="padding: 4px 8px; font-size: 11px; min-width: 120px;">
                <option value="">-- data property --</option>
              </select>
              <span style="font-size: 11px;">Min:</span>
              <input type="number" id="addNodeDataPropMin" min="0" placeholder="0" style="width: 48px; padding: 4px; font-size: 11px;">
              <span style="font-size: 11px;">Max:</span>
              <input type="number" id="addNodeDataPropMax" min="0" placeholder="*" style="width: 48px; padding: 4px; font-size: 11px;" title="Leave empty for unbounded">
              <button type="button" id="addNodeDataPropAdd" style="font-size: 11px; padding: 4px 8px; display: none;" disabled>Add</button>
            </div>
          </div>
        </div>
        <div id="addNodeExternalTabContent" class="add-node-tab-content" style="display: none;">
          <label>Search class: <input type="text" id="addNodeExternalInput" placeholder="Type to search referenced ontologies..." /></label>
          <p id="addNodeExternalDuplicateError" style="display: none; color: #c00; font-size: 12px; margin: 6px 0 0 0;"></p>
          <div id="addNodeExternalResults" style="margin-top: 12px; max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 8px; display: none;"></div>
          <div id="addNodeExternalDescription" style="margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px; font-size: 11px; color: #666; display: none;"></div>
        </div>
        <div class="modal-actions">
          <button type="button" id="addNodeCancel">Cancel</button>
          <button type="button" id="addNodeConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="addRelationshipTypeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add object property</h3>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The human-readable name. The ontology identifier (local name) is derived in camelCase and shown below.">ⓘ</span>
          <input type="text" id="addRelTypeLabel" placeholder="e.g. contains" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <p id="addRelTypeIdentifierLabel" style="font-size: 11px; color: #666; margin: 6px 0 4px 0;">Identifier (derived from label):</p>
        <p id="addRelTypeIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin: 0 0 8px 0;"></p>
        <p id="addRelTypeLabelValidation" style="font-size: 11px; margin-top: 4px; margin-bottom: 0; display: none;"></p>
        <label style="display: flex; align-items: center; margin-top: 10px; gap: 6px;">
          <input type="checkbox" id="addRelTypeHasCardinality" checked /> 
          <span>Has cardinality</span>
          <span style="cursor: help; color: #666; font-size: 14px; line-height: 1;" title="When checked, edges of this type can specify min/max cardinality (e.g. &quot;contains [0..3]&quot;).">ⓘ</span>
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="addRelTypeComment" rows="2" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Domain (rdfs:domain)</span>
          <div style="position: relative;">
            <input type="text" id="addRelTypeDomain" placeholder="Type to search or enter class..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="addRelTypeDomainResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range)</span>
          <div style="position: relative;">
            <input type="text" id="addRelTypeRange" placeholder="Type to search or enter class..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="addRelTypeRangeResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Defined by (rdfs:isDefinedBy, optional URI)</span>
          <input type="text" id="addRelTypeIsDefinedBy" placeholder="e.g. https://www.opengis.net/ont/geosparql#" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <div style="margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Subproperty of (rdfs:subPropertyOf, optional)</span>
          <div style="position: relative;">
            <input type="text" id="addRelTypeSubPropertyOf" placeholder="Type to search or enter object property..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="addRelTypeSubPropertyOfResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="addRelTypeCancel">Cancel</button>
          <button type="button" id="addRelTypeConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="editRelationshipTypeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit object property</h3>
        <p id="editRelTypeName" style="font-size: 11px; color: #666; margin-bottom: 4px;"></p>
        <p id="editRelTypeIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin-bottom: 8px;"></p>
        <p id="editRelTypeLabelValidation" style="font-size: 11px; margin-top: 4px; margin-bottom: 0; display: none;"></p>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The human-readable name of the property. Setting it automatically derives the ontology identifier (local name) in camelCase; the identifier is shown above and used in the ontology URI.">ⓘ</span>
          <input type="text" id="editRelTypeLabel" placeholder="e.g. contains" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="editRelTypeComment" rows="3" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Domain (rdfs:domain)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The class that is the subject of this property in the ontology (global domain). This is not a restriction on a specific edge. To add a restriction (e.g. cardinality or target class) for a specific relationship in the graph, select that edge in the graph and edit its properties.">ⓘ</span>
          <div style="position: relative;">
            <input type="text" id="editRelTypeDomain" placeholder="Type to search or enter class..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="editRelTypeDomainResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The class that is the object of this property in the ontology (global range). This is not a restriction on a specific edge. To add a restriction for a specific relationship in the graph, select that edge in the graph and edit its properties.">ⓘ</span>
          <div style="position: relative;">
            <input type="text" id="editRelTypeRange" placeholder="Type to search or enter class..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="editRelTypeRangeResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Defined by (rdfs:isDefinedBy)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The URI of the ontology that defines this property (e.g. an external or imported vocabulary). Setting it marks the property as imported: its label cannot be edited here, and it may be displayed with a prefix (e.g. geo:hasGeometry) in the Object Properties list.">ⓘ</span>
          <input type="text" id="editRelTypeDefinedBy" placeholder="e.g. https://www.opengis.net/ont/geosparql#" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Subproperty of (rdfs:subPropertyOf)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The parent object property in the RDFS/OWL hierarchy. This property will be inferred as a subproperty of the one you select (e.g. for specializing relationships).">ⓘ</span>
          <div style="position: relative;">
            <input type="text" id="editRelTypeSubPropertyOf" placeholder="Type to search or enter object property..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="editRelTypeSubPropertyOfResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editRelTypeCancel">Cancel</button>
          <button type="button" id="editRelTypeConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="addDataPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add data property</h3>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="addDataPropLabel" placeholder="e.g. refers to drawing ID" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <p id="addDataPropIdentifierLabel" style="font-size: 11px; color: #666; margin: 6px 0 4px 0;">Identifier (derived from label):</p>
        <p id="addDataPropIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin: 0 0 8px 0;"></p>
        <p id="addDataPropLabelValidation" style="font-size: 11px; margin-top: 4px; margin-bottom: 0; display: none;"></p>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Range (datatype)</span>
          <select id="addDataPropRange" style="display: block; margin-top: 4px; padding: 6px; width: 100%; box-sizing: border-box;"></select>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="addDataPropCancel">Cancel</button>
          <button type="button" id="addDataPropConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="editDataPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit data property</h3>
        <p id="editDataPropName" style="font-size: 11px; color: #666; margin-bottom: 4px;"></p>
        <p id="editDataPropIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin-bottom: 8px;"></p>
        <p id="editDataPropLabelValidation" style="font-size: 11px; margin-top: 4px; margin-bottom: 0; display: none;"></p>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="editDataPropLabel" placeholder="e.g. refers to drawing ID" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="editDataPropComment" rows="2" placeholder="Optional" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <div style="margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Defined by (rdfs:isDefinedBy)</span>
          <input type="text" id="editDataPropDefinedBy" placeholder="e.g. https://w3id.org/dano#" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </div>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range datatype)</span>
          <select id="editDataPropRange" style="display: block; margin-top: 4px; padding: 8px; width: 100%; box-sizing: border-box;"></select>
        </label>
        <div style="margin-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 11px; color: #666; font-weight: bold;">Domains (rdfs:domain)</span>
            <button type="button" id="editDataPropAddDomain" style="padding: 4px 8px; font-size: 11px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Add domain</button>
          </div>
          <div id="editDataPropDomainsList" style="min-height: 40px; border: 1px solid #ddd; border-radius: 4px; padding: 8px; background: #f9f9f9;"></div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editDataPropCancel">Cancel</button>
          <button type="button" id="editDataPropConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="addAnnotationPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add annotation property</h3>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="addAnnotationPropLabel" placeholder="e.g. isVisible" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range datatype)</span>
          <select id="addAnnotationPropRange" style="display: block; margin-top: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
            <option value="">No range (untyped)</option>
          </select>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="addAnnotationPropCancel">Cancel</button>
          <button type="button" id="addAnnotationPropConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="editAnnotationPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit annotation property</h3>
        <p id="editAnnotationPropName" style="font-size: 11px; color: #666; margin-bottom: 8px;"></p>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="editAnnotationPropLabel" placeholder="e.g. isVisible" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="editAnnotationPropComment" rows="2" placeholder="Optional" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range datatype)</span>
          <select id="editAnnotationPropRange" style="display: block; margin-top: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
            <option value="">No range (untyped)</option>
          </select>
        </label>
        <details id="editAnnotationPropUsages" style="margin-top: 12px;">
          <summary style="cursor: pointer; font-size: 11px; color: #555;">Where it is used</summary>
          <div class="annotation-usages-list" style="margin-top: 6px; max-height: 200px; overflow-y: auto;"></div>
        </details>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editAnnotationPropCancel">Cancel</button>
          <button type="button" id="editAnnotationPropConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="editEdgeModal" class="modal" style="display: none;">
      <div class="modal-content" style="max-width: 500px; width: 90vw;">
        <h3>Edit edge</h3>
        <label style="position: relative; display: block;">Relationship: <input type="text" id="editEdgeType" placeholder="Type to search relationships..." autocomplete="off" style="width: 100%; padding: 8px; box-sizing: border-box;"></label>
        <div id="editEdgeTypeResults" style="max-height: 200px; overflow-y: auto; overflow-x: hidden; border: 1px solid #ddd; border-radius: 4px; margin-top: 4px; display: none; background: #fff; position: absolute; z-index: 1000; width: 100%; box-sizing: border-box; left: 0; word-wrap: break-word; overflow-wrap: break-word;"></div>
        <div id="editEdgeComment" style="font-size: 11px; color: #666; margin-top: 4px; margin-bottom: 8px; line-height: 1.4; display: none;"></div>
        <label style="display: block; margin-top: 8px;">From: <select id="editEdgeFrom"></select></label>
        <label style="display: block; margin-top: 8px;">To: <select id="editEdgeTo"></select></label>
        <div id="editEdgeCardinalityWrap" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
          <strong style="font-size: 12px;">Cardinality</strong>
          <div style="display: flex; gap: 12px; margin-top: 6px; align-items: center; flex-wrap: wrap;">
            <label style="font-size: 11px;">Min: <input type="number" id="editEdgeMinCard" min="0" placeholder="0" style="width: 60px;"></label>
            <label style="font-size: 11px;">Max: <input type="number" id="editEdgeMaxCard" min="0" placeholder="*" style="width: 60px;" title="Leave empty for unbounded"></label>
          </div>
        </div>
        <label style="display: flex; align-items: center; gap: 6px; margin-top: 12px;">
          <input type="checkbox" id="editEdgeIsRestriction" />
          <span style="font-size: 12px;">OWL restriction</span>
          <span style="cursor: help; color: #666; font-size: 14px; line-height: 1;" title="OWL Restriction: An OWL restriction defines constraints on how an object property can be used with a specific class. It allows you to specify cardinality constraints (min/max) that apply to instances of that class. When checked, creates an OWL restriction (displayed as a thick continuous line). When unchecked, creates a normal object property connection (displayed as a dashed line).">ⓘ</span>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editEdgeCancel">Cancel</button>
          <button type="button" id="editEdgeConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="externalRefsModal" class="modal" style="display: none;">
      <div class="modal-content" style="min-width: 500px; max-width: 700px;">
        <h3>Manage External Ontology References</h3>
        <div style="margin-bottom: 12px; padding: 10px; background: #f0f8ff; border-radius: 4px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
            <input type="checkbox" id="displayExternalRefs" checked>
            Display external references in graph
          </label>
          <div style="margin-top: 8px; font-size: 12px;">
            <label for="externalNodeLayout">External node layout:</label>
            <select id="externalNodeLayout" style="margin-left: 6px; padding: 4px;">
              <option value="auto">Auto-layout</option>
              <option value="right">Always right</option>
              <option value="top">Always top</option>
              <option value="bottom">Always bottom</option>
              <option value="left">Always left</option>
            </select>
          </div>
        </div>
        <div id="externalRefsList" style="margin-top: 16px; margin-bottom: 16px; max-height: 400px; overflow-y: auto;">
          <!-- External references will be listed here -->
        </div>
        <div style="margin-top: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px;">
          <strong style="font-size: 12px;">Add External Ontology</strong>
          <div style="margin-top: 8px; display: flex; gap: 8px; align-items: flex-start;">
            <input type="text" id="addExternalRefUrl" placeholder="Ontology URL (e.g., http://purl.org/dc/elements/1.1/)" style="flex: 1; padding: 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px;">
            <button type="button" id="addExternalRefBtn" style="padding: 6px 12px; font-size: 12px;">Add</button>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="externalRefsCancel">Close</button>
        </div>
      </div>
    </div>
    <div id="loadingModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: none; justify-content: center; align-items: center; z-index: 20000;">
      <div style="background: white; border-radius: 8px; padding: 32px; text-align: center; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">Loading ontology...</div>
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      </div>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
}
