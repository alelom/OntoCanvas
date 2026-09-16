/**
 * Curated example ontologies shown in the "Open ontology" modal, spanning
 * different domains so users can try the editor without bringing their own file.
 */
export interface ExampleOntology {
  label: string;
  domain: string;
  url: string;
}

// Note: candidates must serve an `Access-Control-Allow-Origin` header - this is a
// browser-only static app with no server-side proxy. Several official hosts looked
// CORS-enabled via curl but still failed in a real browser (e.g. w3.org sits behind
// Cloudflare bot management, which blocks cross-origin fetch() from a page despite
// advertising `Access-Control-Allow-Origin: *`) - verified end-to-end in a real
// browser via the app itself, not just a header check, before picking these.
// GitHub's raw-content CDN (raw.githubusercontent.com / *.github.io) proved reliable.
export const EXAMPLE_ONTOLOGIES: ExampleOntology[] = [
  {
    label: 'Pizza',
    domain: 'Food (classic OWL tutorial ontology)',
    url: 'https://raw.githubusercontent.com/owlcs/pizza-ontology/refs/heads/master/pizza.owl',
  },
  {
    label: 'FOAF',
    domain: 'Social / people',
    url: 'https://raw.githubusercontent.com/SPAROntologies/foaf/refs/heads/master/docs/current/foaf.ttl',
  },
  {
    label: 'DAnO',
    domain: 'AEC / construction annotation',
    url: 'https://rub-informatik-im-bauwesen.github.io/dano/dano.ttl',
  },
  {
    label: 'University',
    domain: 'Academia / education',
    url: 'https://raw.githubusercontent.com/ontop/ontop-examples/master/university/univ-ontology.ttl',
  },
  {
    label: 'Movie Locations',
    domain: 'Entertainment / film',
    url: 'https://raw.githubusercontent.com/AlexHoorn/MovieLocationsOntology/master/ontology/CleanOntology.ttl',
  },
];
