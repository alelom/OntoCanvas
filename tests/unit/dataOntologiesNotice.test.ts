// @vitest-environment jsdom
/**
 * The offer to open the ontologies the data was made with (#236): it asks, never opens on its own, says what it opened and
 * what could not be read, and does not offer again what the user declined.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDataOntologiesNotice } from '../../src/ui/sidePanel/dataOntologiesNotice';
import type { DataOntology } from '../../src/abox/dataOntologies';

const DM = 'https://w3id.org/adiro/adiro_drawing_metadata/7.0.1';
const PROV = 'https://w3id.org/adiro/adiro_provenance/2.2.0';

let found: DataOntology[];
let open: ReturnType<typeof vi.fn>;
let notice: ReturnType<typeof createDataOntologiesNotice>;
const el = () => notice.element;
const button = (name: string) => el().querySelector<HTMLButtonElement>(`[data-data-ontologies-${name}]`)!;

beforeEach(() => {
  found = [
    { iri: DM, via: 'prov:used' },
    { iri: PROV, via: 'prov:used' },
  ];
  open = vi.fn(async (iris: string[]) => ({ opened: iris, failed: [] }));
  notice = createDataOntologiesNotice({ find: () => found, open: (iris) => open(iris) });
  document.body.replaceChildren(el());
  notice.render();
});

describe('createDataOntologiesNotice', () => {
  it('names the ontologies the data was made with, and asks before opening them', () => {
    expect(el().hidden).toBe(false);
    expect(el().textContent).toContain('This data names 2 ontologies it was made with: adiro_drawing_metadata 7.0.1 and adiro_provenance 2.2.0.');
    expect(el().textContent).toMatch(/read as context, never saved/);
    expect(open).not.toHaveBeenCalled();
    expect(el().querySelector('[title]')?.getAttribute('title')).toContain(DM);
  });

  it('is hidden when the data names none', () => {
    found = [];
    notice.render();

    expect(el().hidden).toBe(true);
  });

  it('opens them on Open, says it is reading meanwhile, then what it opened', async () => {
    let finish!: () => void;
    open.mockImplementation((iris: string[]) => new Promise((resolve) => (finish = () => resolve({ opened: iris, failed: [] }))));

    button('open').click();
    expect(el().textContent).toContain('Reading 2 ontologies…');
    expect(button('open').disabled).toBe(true);
    found = [];
    finish();
    await vi.waitFor(() => expect(el().textContent).toContain('Opened adiro_drawing_metadata 7.0.1 and adiro_provenance 2.2.0'));

    expect(open).toHaveBeenCalledWith([DM, PROV]);
  });

  it('says which could not be read, and why that may be', async () => {
    open.mockResolvedValue({ opened: [DM], failed: [PROV] });

    button('open').click();

    await vi.waitFor(() => expect(el().textContent).toMatch(/Could not read adiro_provenance 2\.2\.0: the address may not answer with RDF/));
  });

  it('does not offer again what the user declined, until the data names something else', () => {
    button('dismiss').click();
    expect(el().hidden).toBe(true);
    notice.render();
    expect(el().hidden).toBe(true);

    found = [...found, { iri: 'https://example.org/other', via: 'prov:used' }];
    notice.render();
    expect(el().hidden).toBe(false);
  });
});
