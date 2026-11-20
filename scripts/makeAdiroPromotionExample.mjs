/**
 * Writes examples/datasets/adiro-promotion/assertions.nq (#253): made-up field assertions, in the ADIRO provenance vocabulary,
 * of a title block and a drawing revision, in the states that matter to promotion: accepted, superseded by a later accepted one,
 * pending, rejected, and of a field kind that maps to no property.
 *
 *   node scripts/makeAdiroPromotionExample.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'datasets', 'adiro-promotion');
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const XSD_DECIMAL = 'http://www.w3.org/2001/XMLSchema#decimal';
const APROV = 'https://w3id.org/adiro/adiro_provenance#';
const ADM = 'https://w3id.org/adiro/adiro_drawing_metadata#';
const GRAPH = '<urn:example:promotion:run-1>';
const node = (local) => `<urn:example:promotion/${local}>`;
const q = (s, p, o) => `${s} <${p}> ${o} ${GRAPH} .`;
const text = (value) => JSON.stringify(value);

const lines = [
  q(node('titleblock1'), RDF_TYPE, `<${ADM}Titleblock>`),
  q(node('revision1'), RDF_TYPE, `<${ADM}DrawingRevision>`),
  q(node('org-acme-ltd'), RDF_TYPE, `<${APROV}Organisation>`),
  q(node('org-acme-ltd'), LABEL, text('Acme Ltd')),
  q(node('org-acme-limited'), RDF_TYPE, `<${APROV}Organisation>`),
  q(node('org-acme-limited'), LABEL, text('ACME Limited')),
];

/** One assertion: its subject, the kind of field, its value (a literal, or an entity as `<…>`), acceptance, confidence, what it replaces. */
function assertion(id, { about, kind, value, acceptance, confidence, supersedes, label }) {
  const a = node(id);
  lines.push(
    q(a, RDF_TYPE, `<${APROV}FieldAssertion>`),
    q(a, LABEL, text(label)),
    q(a, `${APROV}assertedAbout`, node(about)),
    q(a, `${APROV}assertsFieldKind`, `<${ADM}${kind}>`),
    value.startsWith('<') ? q(a, `${APROV}hasValueEntity`, value) : q(a, `${APROV}hasLiteralValue`, text(value)),
    q(a, `${APROV}hasConfidence`, `"${confidence}"^^<${XSD_DECIMAL}>`)
  );
  if (acceptance) lines.push(q(a, `${APROV}hasAcceptance`, `<${APROV}${acceptance}>`));
  if (supersedes) lines.push(q(a, `${APROV}supersedes`, node(supersedes)));
}

// The client: a model's reading, accepted, then a person's correction, accepted, which replaces it.
assertion('a1', { label: 'Client read by a model', about: 'titleblock1', kind: 'ClientField', value: node('org-acme-ltd'), acceptance: 'Accepted', confidence: '0.62' });
assertion('a2', { label: 'Client corrected by a person', about: 'titleblock1', kind: 'ClientField', value: node('org-acme-limited'), acceptance: 'Accepted', confidence: '1.00', supersedes: 'a1' });
// The title: accepted; a rival reading of it, rejected.
assertion('a3', { label: 'Drawing title', about: 'revision1', kind: 'DrawingTitleField', value: 'Ground Floor Plan', acceptance: 'Accepted', confidence: '0.93' });
assertion('a4', { label: 'Drawing title, misread', about: 'revision1', kind: 'DrawingTitleField', value: 'Ground Floor Pian', acceptance: 'Rejected', confidence: '0.41' });
// The drawing number: not decided yet.
assertion('a5', { label: 'Drawing number', about: 'revision1', kind: 'DrawingNumberField', value: 'A-101', acceptance: 'Pending', confidence: '0.88' });
// A caption that matched no field kind: accepted, but its kind maps to no property, so it is never promoted. No acceptance recorded for a sixth reading: as good as pending.
assertion('a6', { label: 'Unrecognised caption', about: 'titleblock1', kind: 'UnidentifiedField', value: 'Rev: B', acceptance: 'Accepted', confidence: '0.55' });
assertion('a7', { label: 'Drawing title, a later reading', about: 'revision1', kind: 'DrawingTitleField', value: 'Ground Floor Plan, Rev B', confidence: '0.74' });

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'assertions.nq'), lines.join('\n') + '\n');
