/**
 * "Open external ontology" opens its tab on the click itself, then sends it where it should go (#103).
 * Looking for the file in the folder takes time (the folder picker, reading files, an IndexedDB write), and
 * the picker uses up the click's user activation, so a tab opened afterwards can be blocked as a popup.
 */

export interface OpenExternalOptions {
  /** Whether the open ontology came from a file on disk, so its folder is worth looking in. */
  fromDisk: boolean;
  /** window.open: returns the new tab, or null when the browser blocked it. */
  open: (url: string) => { location: { href: string } } | null;
  /** The URL that opens the imported ontology's local file, or null when there is none to open. */
  findLocalUrl: () => Promise<string | null>;
  /** The URL that opens the imported ontology by its address. */
  byUrl: () => string;
}

/** Open the imported ontology in a new tab: its local file when found in the open ontology's folder,
 * otherwise by URL. Must be called straight from the click, before any await. */
export async function openExternalOntologyTab(opts: OpenExternalOptions): Promise<void> {
  if (!opts.fromDisk) {
    opts.open(opts.byUrl());
    return;
  }
  const tab = opts.open('about:blank');
  let target: string | null = null;
  try {
    target = await opts.findLocalUrl();
  } catch {
    // Not found, or the folder couldn't be read: open by URL.
  }
  const url = target ?? opts.byUrl();
  if (tab) tab.location.href = url;
  else opts.open(url); // The early tab was blocked: try once more.
}
