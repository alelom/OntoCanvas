/**
 * The image addresses that must not be opened as a page (#240 review). An SVG from an opened folder is shown from a `blob:`
 * address, which has the app's origin: in an `<img>` its scripts don't run, but opened in a tab of its own they would run as the
 * app, and could read what it keeps. Such an image is shown, and not linked. An `http(s)` SVG opens in its own origin.
 */
const notOpenable = new Set<string>();

export const isOpenableUrl = (url: string): boolean => !notOpenable.has(url);

export function markNotOpenable(url: string): void {
  notOpenable.add(url);
}

/** Forgets an address once it is revoked. */
export function forgetUrl(url: string): void {
  notOpenable.delete(url);
}
