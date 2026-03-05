import { detectOntologyIssues, groupIssuesByType, getIssueTypeLabel, type OntologyIssue } from './ontologyIssues';
import { Store } from 'n3';

let statusBarElement: HTMLElement | null = null;
let issuesButton: HTMLElement | null = null;
let issuesPopup: HTMLElement | null = null;
let currentStore: Store | null = null;

/**
 * Initialize the status bar component.
 */
export function initStatusBar(): void {
  const app = document.getElementById('app');
  if (!app) return;
  
  // Find or create the status bar element
  statusBarElement = document.getElementById('info');
  if (!statusBarElement) {
    // Create it if it doesn't exist
    statusBarElement = document.createElement('div');
    statusBarElement.id = 'info';
    app.appendChild(statusBarElement);
  }
  
  // Create issues button and popup
  createIssuesUI();
  
  // Update issues when clicking outside the popup
  document.addEventListener('click', (e) => {
    if (issuesPopup && !issuesPopup.contains(e.target as Node) && 
        issuesButton && !issuesButton.contains(e.target as Node)) {
      hideIssuesPopup();
    }
  });
}

/**
 * Create the issues warning button and popup menu.
 */
function createIssuesUI(): void {
  if (!statusBarElement) return;
  
  // Create issues button
  issuesButton = document.createElement('span');
  issuesButton.id = 'ontologyIssuesBtn';
  issuesButton.style.cssText = 'margin-left: 24px; cursor: pointer; color: #f39c12; font-size: 11px; display: none;';
  issuesButton.innerHTML = '⚠️ <u>issues</u>';
  issuesButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleIssuesPopup();
  });
  statusBarElement.appendChild(issuesButton);
  
  // Create issues popup
  issuesPopup = document.createElement('div');
  issuesPopup.id = 'ontologyIssuesPopup';
  issuesPopup.style.cssText = `
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    display: none;
    min-width: 400px;
    max-width: 600px;
    max-height: 400px;
    overflow-y: auto;
    padding: 12px;
  `;
  document.body.appendChild(issuesPopup);
}

/**
 * Update the status bar with current store and refresh issues.
 */
export function updateStatusBar(store: Store | null): void {
  currentStore = store;
  refreshIssues();
}

/**
 * Refresh the issues display.
 */
function refreshIssues(): void {
  if (!currentStore || !issuesButton || !issuesPopup) return;
  
  const issues = detectOntologyIssues(currentStore);
  
  if (issues.length === 0) {
    issuesButton.style.display = 'none';
    hideIssuesPopup();
    return;
  }
  
  // Show issues button
  issuesButton.style.display = '';
  issuesButton.innerHTML = `⚠️ <u>issues (${issues.length})</u>`;
  
  // Update popup content
  renderIssuesPopup(issues);
}

/**
 * Render the issues popup content.
 */
function renderIssuesPopup(issues: OntologyIssue[]): void {
  if (!issuesPopup) return;
  
  const grouped = groupIssuesByType(issues);
  const typeKeys = Object.keys(grouped).sort();
  
  let html = '<div style="font-weight: bold; margin-bottom: 12px; font-size: 13px;">Ontology Issues</div>';
  
  for (const typeKey of typeKeys) {
    const typeIssues = grouped[typeKey];
    const typeLabel = getIssueTypeLabel(typeKey);
    
    html += `<div style="margin-bottom: 16px;">`;
    html += `<div style="font-weight: bold; font-size: 12px; margin-bottom: 8px; color: #333;">${typeLabel}</div>`;
    
    for (const issue of typeIssues) {
      html += `<div style="padding: 6px 8px; margin-bottom: 4px; background: #fff3cd; border-left: 3px solid #f39c12; border-radius: 2px; font-size: 11px;">`;
      html += `<div style="font-weight: 500; color: #856404;">${issue.elementType}: ${issue.elementName}</div>`;
      html += `<div style="color: #666; margin-top: 2px;">${issue.message}</div>`;
      html += `</div>`;
    }
    
    html += `</div>`;
  }
  
  issuesPopup.innerHTML = html;
}

/**
 * Toggle the issues popup visibility.
 */
function toggleIssuesPopup(): void {
  if (!issuesPopup) return;
  
  if (issuesPopup.style.display === 'none' || !issuesPopup.style.display) {
    showIssuesPopup();
  } else {
    hideIssuesPopup();
  }
}

/**
 * Show the issues popup.
 */
function showIssuesPopup(): void {
  if (!issuesPopup) return;
  issuesPopup.style.display = 'block';
  
  // Refresh issues when showing
  if (currentStore) {
    refreshIssues();
  }
}

/**
 * Hide the issues popup.
 */
function hideIssuesPopup(): void {
  if (!issuesPopup) return;
  issuesPopup.style.display = 'none';
}

/**
 * Update node and edge counts in the status bar.
 */
export function updateNodeEdgeCounts(nodeCount: number, edgeCount: number): void {
  const nodeCountEl = document.getElementById('nodeCount');
  const edgeCountEl = document.getElementById('edgeCount');
  
  if (nodeCountEl) nodeCountEl.textContent = String(nodeCount);
  if (edgeCountEl) edgeCountEl.textContent = String(edgeCount);
}

/**
 * Check if a string is a valid URL.
 */
function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Update file path display in the status bar.
 */
export function updateFilePathDisplay(filePath: string | null): void {
  const el = document.getElementById('filePathDisplay');
  if (!el) return;
  
  if (filePath) {
    const isUrl = isValidUrl(filePath);
    if (isUrl) {
      // Make it a clickable link
      el.innerHTML = `| File: <a href="${filePath}" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${filePath}</a>`;
      el.title = `Click to open: ${filePath}`;
    } else {
      // Regular text for non-URL paths
      el.textContent = `| File: ${filePath}`;
      el.title = filePath;
    }
    el.style.display = '';
  } else {
    el.textContent = '';
    el.title = '';
    el.style.display = 'none';
  }
}

/**
 * Update edge colors legend in the status bar.
 */
export function updateEdgeColorsLegend(legend: string): void {
  const el = document.getElementById('edgeColorsLegend');
  if (!el) return;
  el.innerHTML = legend;
}

/**
 * Update selection info in the status bar.
 */
export function updateSelectionInfo(info: string): void {
  const el = document.getElementById('selectionInfo');
  if (!el) return;
  el.textContent = info;
}
