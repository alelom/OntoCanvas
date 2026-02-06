# AEC Drawing Ontology

OWL ontology derived from the first page of `250523_Ontology_schema_rev02.pdf` (Rev3, 06.04.23).

## Structure

| Layer | Description |
|-------|-------------|
| **Drawing Sheet** | Contains Layout(s). Also contains Metadata, Orientation. |
| **Layout** | Contained by DrawingSheet. Contains DrawingElement(s), annotations, drawing type, content. |
| **Drawing Element** | Contained by Layout. Can be a Facade system or Facade component. |
| **Facade System** | Curtain wall, Precast, Cavity wall, Rainscreen (subclass of DrawingElement) |
| **Facade Component** | Panel (cladding, insulation, membranes, boards), Linear (frame members, gaskets, sealants), Point (fixings, brackets) (subclass of DrawingElement) |
| **Structural Component** | Linear (columns, beams, cables), Panel (slab, wall, upstand) |
| **General Properties** | Material, Functional, Structural, Geometric, Section properties |

## Annotation Properties

- **labellableRoot** — Boolean. When `true`, the class can be used as a label by annotators. When `false`, non-labellable (structural/category nodes). Non-labellable: DrawingElement, FacadeSystem, FacadeComponent, LinearComponent, PointComponent, DrawingType, Metadata. Labellable: Note, TextualNote, Legend, and leaf/concrete element classes.

## Object Properties

- `contains` / `partOf` — containment (inverse)
- `subsetOf` — classification / sub-typing
- `hasProperty` — entity characterized by property
- `hasFunction` — facade component has function
- `hasMaterial` — facade component has material

### Why OWL restrictions for partOf and contains

`partOf` and `contains` are **object properties**: they relate individuals to individuals, not classes to classes. In OWL, class axioms describe constraints on instances. To express "instances of Annotation are part of some Layout" at the class level, we use an **OWL restriction**:

```turtle
:Annotation rdfs:subClassOf [ rdf:type owl:Restriction ;
                              owl:onProperty :partOf ;
                              owl:someValuesFrom :Layout
                            ] .
```

This means: every instance of Annotation has at least one `partOf` link to some instance of Layout. A direct triple `(Annotation, partOf, Layout)` would not have this meaning in OWL. The restriction is the standard, minimal way to model class-level partOf/contains relationships.

## Key Relationships (from diagram)

- **DrawingSheet** contains: Layout(s), Metadata, Orientation
- **Layout** part of DrawingSheet; contains: DrawingElement(s), Annotations, DrawingType, DrawingContent
- **DrawingElement** part of Layout; can be: FacadeSystem or FacadeComponent
- **Metadata** subset of: Titleblock, Note, Legend, RevisionTable
- **DrawingType** subset of: Section, Elevation, Plan, Perspective
- **FacadeSystem** part of SupportType; contains FacadeComponent; subclass of DrawingElement
- **FacadeComponent** has: Function, Material; branches into PanelComponent, LinearComponent, PointComponent; subclass of DrawingElement
- **StructuralComponent** part of SupportType

## Usage

Load with RDFlib, OWLReady2, or any OWL/RDF tool:

```python
from rdflib import Graph
g = Graph()
g.parse("ontology/aec_drawing_ontology.ttl", format="turtle")
```

## Visualizer

Generate and open an interactive graph visualization (similar to WebVOWL):

```bash
uv run python Visualizer/convert_to_html_view.py
```

Then open `Visualizer/visualizer.html` in a browser. The visualizer supports:

- **Labellable filter**: Show all nodes, only labellable, or only non-labellable
- **Edge type**: Filter by relationship type (e.g. subClassOf)
- **Node color by**: Color nodes by labellable status (green=labellable, red=non-labellable) or default
- **Reset / Fit**: Reset zoom or fit graph to screen

## Open Questions (from diagram)

- Q1: Definition of "Layout"?
- Q2: Section in Section?
- Q3: Do all drawing types have a GA version? Is a Plan strictly a GA?
- Q4: Criteria for distinguishing Notes vs Annotations?
- Q5: Add more conditions and constraints
