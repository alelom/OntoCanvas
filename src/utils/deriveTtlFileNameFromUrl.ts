/**
 * Derives a suggested TTL filename from an ontology URL for download links.
 * e.g. https://pi.pauwel.be/voc/buildingelement/ontology.ttl -> ontology.ttl
 *      https://pi.pauwel.be/voc/buildingelement -> buildingelement.ttl
 */
export function deriveTtlFileNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.replace(/\/$/, '');
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? 'ontology';
    const base = last.includes('.') ? last.replace(/\.[^.]+$/, '') : last;
    const safe = /^[\w.-]+$/.test(base) ? base : 'ontology';
    return `${safe}.ttl`;
  } catch {
    return 'ontology.ttl';
  }
}
