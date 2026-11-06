import { detectOntologyIssues, groupIssuesByType, getIssueTypeLabel, type OntologyIssue } from './ontologyIssues';
import { Store } from 'n3';
import { fileDisplayName, type OntologyInfo } from './ontologyInfo';
import { versionLabel, type OntologyVersion } from '../lib/ontologyVersion';
import type { AvailableVersions, VersionEntry } from '../lib/ontologyVersions';
import { hideVersionList, toggleVersionList } from './versionList';
import { getNotices, onNoticesChange, type Notice } from './statusNotices';

let statusBarElement: HTMLElement | null = null;
let issuesButton: HTMLElement | null = null;
let issuesPopup: HTMLElement | null = null;
let currentStore: Store | null = null;
let currentOntologyLocation: string | null = null;
let currentOntologyInfo: OntologyInfo | null = null;
let currentOntologyVersion: OntologyVersion | null = null;
let availableVersions: AvailableVersions | null = null;
let onVersionChosen: (entry: VersionEntry) => void = () => {};
let currentFilePath: string | null = null;
/** The ontology's issues found last: drawn again with the notices when those change (#239). */
let lastIssues: OntologyIssue[] = [];

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
  onNoticesChange(renderIssuesArea);
  
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
export function updateStatusBar(store: Store | null, ontologyLocation: string | null = null): void {
  currentStore = store;
  currentOntologyLocation = ontologyLocation;
  refreshIssues();
}

/**
 * Refresh the issues display.
 */
async function refreshIssues(): Promise<void> {
  if (!issuesButton || !issuesPopup) return;
  lastIssues = currentStore ? await detectOntologyIssues(currentStore, currentOntologyLocation) : [];
  renderIssuesArea();
}

/**
 * Draws the issues area from the ontology's issues found last and the app's notices (#239): the notices change at once, and the
 * issues are looked for again only when the ontology changes (finding them may fetch example images).
 */
function renderIssuesArea(): void {
  if (!issuesButton || !issuesPopup) return;
  // What says something of the ontology without anything being wrong (an annotation property never used) is a note (#239).
  const problems = lastIssues.filter((issue) => !INFORMATIONAL_ISSUES.includes(issue.type));
  const notices = [
    ...getNotices(),
    ...lastIssues.filter((issue) => INFORMATIONAL_ISSUES.includes(issue.type)).map((issue) => ({ key: `issue:${issue.type}:${issue.elementName}`, message: issue.message + '.' })),
  ];
  const total = problems.length + notices.length;
  if (total === 0) {
    issuesButton.style.display = 'none';
    hideIssuesPopup();
    return;
  }
  issuesButton.style.display = '';
  issuesButton.innerHTML = problems.length ? `⚠️ <u>issues (${total})</u>` : `ℹ️ <u>notes (${total})</u>`;
  issuesButton.title = 'Notes and issues of the open ontology and its data';
  renderIssuesPopup(problems, notices);
}

/** The kinds of issue that say something of the ontology without anything being wrong: shown as notes (#239). */
const INFORMATIONAL_ISSUES: OntologyIssue['type'][] = ['unused_annotation_property'];

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render the issues popup content: the app's notes first, then the ontology's issues by type.
 */
function renderIssuesPopup(issues: OntologyIssue[], notices: Notice[]): void {
  if (!issuesPopup) return;

  const grouped = groupIssuesByType(issues);
  const typeKeys = Object.keys(grouped).sort();

  let html = '';
  if (notices.length) {
    html += '<div style="font-weight: bold; margin-bottom: 8px; font-size: 13px;">Notes</div><div style="margin-bottom: 16px;">';
    for (const notice of notices) {
      html += `<div data-status-notice="${escapeHtml(notice.key)}" style="padding: 6px 8px; margin-bottom: 4px; background: #eaf2fb; border-left: 3px solid #1a5fb4; border-radius: 2px; font-size: 11px; color: #333;">${escapeHtml(notice.message)}</div>`;
    }
    html += '</div>';
  }
  if (!issues.length) {
    issuesPopup.innerHTML = html;
    return;
  }
  html += '<div style="font-weight: bold; margin-bottom: 12px; font-size: 13px;">Ontology Issues</div>';
  
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
    void refreshIssues();
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
 * Show the name and prefix of the open ontology in the status bar (#113), or nothing when there is none.
 */
export function updateOntologyInfoDisplay(info: OntologyInfo | null): void {
  currentOntologyInfo = info;
  renderOntologyPart();
}

/** Show the version the open ontology declares after its name (#130), or nothing when it declares none. */
export function updateOntologyVersionDisplay(version: OntologyVersion | null): void {
  currentOntologyVersion = version;
  renderOntologyPart();
}

/**
 * The other versions of the open ontology, once found in the background (#132): a button after the version
 * opens their list (#133), and says when one is newer. Null hides it.
 */
export function updateAvailableVersions(available: AvailableVersions | null, onChoose: (entry: VersionEntry) => void): void {
  availableVersions = available;
  onVersionChosen = onChoose;
  hideVersionList();
  renderOntologyPart();
}

/** The button opening the list of versions (#133), when more than the open one is known. */
function createVersionsButton(available: AvailableVersions): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'ontologyVersionsBtn';
  button.textContent = 'versions ▾';
  button.title = 'Click to list the versions of this ontology, and open one.';
  button.style.cssText = 'margin-left: 4px; padding: 0 4px; font-size: 11px; border: none; background: none; cursor: pointer; color: #3498db;';
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVersionList(button, available, (entry) => onVersionChosen(entry));
  });
  return button;
}

/** A link opening `href` in a new tab. */
function createLink(href: string, text: string, title: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href; // The browser encodes it safely
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text; // textContent escapes HTML
  link.title = title;
  link.style.color = '#3498db';
  link.style.textDecoration = 'none';
  link.addEventListener('mouseenter', () => {
    link.style.textDecoration = 'underline';
  });
  link.addEventListener('mouseleave', () => {
    link.style.textDecoration = 'none';
  });
  return link;
}

/**
 * The ontology part of the status bar (#113): "Ontology: " and the ontology's name, linking to the file or URL it was opened
 * from when that is a URL, then its version ("v2.1.0", #130) and "(prefix: <i>foaf</i>)" when the file declares a prefix for it. With no
 * ontology declared, the file's own name stands in; with neither, the part is hidden.
 */
function renderOntologyPart(): void {
  const el = document.getElementById('ontologyInfoDisplay');
  if (!el) return;
  el.textContent = '';
  el.title = '';
  const name = currentOntologyInfo?.name ?? (currentFilePath ? fileDisplayName(currentFilePath) : '');
  if (!name) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.appendChild(document.createTextNode('Ontology: '));
  const where = [
    currentOntologyInfo ? `Ontology: ${currentOntologyInfo.iri}` : null,
    currentFilePath ? `File: ${currentFilePath}` : null,
  ].filter(Boolean).join('\n');
  if (currentFilePath && isValidUrl(currentFilePath)) {
    el.appendChild(createLink(currentFilePath, name, `Click to open: ${currentFilePath}`));
  } else {
    el.appendChild(document.createTextNode(name));
  }
  el.title = where;
  const version = versionLabel(currentOntologyVersion);
  if (version) {
    el.appendChild(document.createTextNode(' '));
    const span = document.createElement('span');
    span.id = 'ontologyVersion';
    span.textContent = /^\d/.test(version) ? `v${version}` : version;
    span.title = currentOntologyVersion?.versionIri ? `owl:versionIRI: ${currentOntologyVersion.versionIri}` : 'owl:versionInfo';
    el.appendChild(span);
    if (availableVersions?.latest) {
      const latest = document.createElement('span');
      latest.id = 'ontologyLatest';
      latest.textContent = ' (latest)';
      latest.title = availableVersions.latest === 'certain'
        ? 'The latest release: the ontology IRI names this version.'
        : 'No newer version is known: none of the versions found is newer, but a release they do not name may exist.';
      el.appendChild(latest);
    }
    if (availableVersions?.newer) {
      const newer = document.createElement('span');
      newer.id = 'ontologyNewer';
      newer.textContent = ` (${availableVersions.newer.version} available)`;
      newer.title = `A newer version, ${availableVersions.newer.version}, exists: open it from "versions ▾".`;
      newer.style.color = '#f39c12'; // the bar's warning colour, as for "issues"
      el.appendChild(newer);
    }
  }
  if (availableVersions && availableVersions.entries.length > 1) el.appendChild(createVersionsButton(availableVersions));
  if (currentOntologyInfo?.prefix) {
    el.appendChild(document.createTextNode(' (prefix: '));
    const prefix = document.createElement('i');
    prefix.textContent = currentOntologyInfo.prefix;
    el.appendChild(prefix);
    el.appendChild(document.createTextNode(')'));
  }
}

/**
 * Set the file or URL the ontology was opened from: the ontology's name in the status bar links to it
 * (#113).
 */
export function updateFilePathDisplay(filePath: string | null): void {
  currentFilePath = filePath;
  renderOntologyPart();
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

/**
 * Show a single selected term as " | Selected: <name><suffix>", with the name rendered as a link
 * opening `href` in a new tab when one is given.
 */
export function updateSelectedTerm(name: string, href: string | null, suffix = ''): void {
  const el = document.getElementById('selectionInfo');
  if (!el) return;
  el.textContent = ' | Selected: ';
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = name;
    link.title = `Open ${href}`;
    link.style.color = '#3498db';
    link.style.textDecoration = 'none';
    link.addEventListener('mouseenter', () => {
      link.style.textDecoration = 'underline';
    });
    link.addEventListener('mouseleave', () => {
      link.style.textDecoration = 'none';
    });
    el.appendChild(link);
  } else {
    el.appendChild(document.createTextNode(name));
  }
  if (suffix) el.appendChild(document.createTextNode(suffix));
}
