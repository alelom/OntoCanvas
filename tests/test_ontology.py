"""Tests for the AEC drawing ontology."""

from pathlib import Path

import pytest
from rdflib import Graph, Literal, Namespace, OWL, RDF, RDFS

# Path to ontology relative to project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ONTOLOGY_PATH = PROJECT_ROOT / "ontology" / "aec_drawing_ontology.ttl"
NS = Namespace("http://example.org/aec-drawing-ontology#")


def load_ontology() -> Graph:
    """Load and parse the ontology from Turtle format."""
    g = Graph()
    # Use file object for Windows compatibility with rdflib
    with open(ONTOLOGY_PATH, encoding="utf-8") as f:
        g.parse(f, format="turtle")
    return g


class TestOntologyLoad:
    """Tests that the ontology loads and parses correctly."""

    def test_ontology_file_exists(self) -> None:
        """Ontology file exists at expected path."""
        assert ONTOLOGY_PATH.exists(), f"Ontology not found at {ONTOLOGY_PATH}"

    def test_ontology_parses_successfully(self) -> None:
        """Ontology parses without errors."""
        g = load_ontology()
        assert len(g) > 0, "Ontology should contain triples"

    def test_ontology_has_classes(self) -> None:
        """Ontology defines OWL classes."""
        g = load_ontology()
        classes = list(g.subjects(RDF.type, OWL.Class))
        assert len(classes) > 0, "Ontology should define at least one class"


class TestLabellableRoot:
    """Tests for the labellableRoot annotation property."""

    def test_labellable_root_property_exists(self) -> None:
        """labellableRoot annotation property is defined."""
        g = load_ontology()
        labellable_prop = NS.labellableRoot
        assert (labellable_prop, RDF.type, OWL.AnnotationProperty) in g

    def test_labellable_root_true_count(self) -> None:
        """Expected number of classes have labellableRoot true."""
        g = load_ontology()
        labellable_true = [
            s for s, o in g.subject_objects(NS.labellableRoot) if o == Literal(True)
        ]
        assert len(labellable_true) == 168, f"Expected 168 labellable classes, got {len(labellable_true)}"

    def test_labellable_root_false_count(self) -> None:
        """Expected number of classes have labellableRoot false (structural/category nodes)."""
        g = load_ontology()
        labellable_false = [
            s for s, o in g.subject_objects(NS.labellableRoot) if o == Literal(False)
        ]
        assert len(labellable_false) == 7, f"Expected 7 non-labellable classes, got {len(labellable_false)}"

    def test_note_is_labellable(self) -> None:
        """Note class has labellableRoot true."""
        g = load_ontology()
        assert (NS.Note, NS.labellableRoot, Literal(True)) in g

    def test_textual_note_is_labellable(self) -> None:
        """TextualNote class has labellableRoot true."""
        g = load_ontology()
        assert (NS.TextualNote, NS.labellableRoot, Literal(True)) in g

    def test_legend_is_labellable(self) -> None:
        """Legend class has labellableRoot true."""
        g = load_ontology()
        assert (NS.Legend, NS.labellableRoot, Literal(True)) in g

    def test_facade_system_is_non_labellable(self) -> None:
        """FacadeSystem class has labellableRoot false."""
        g = load_ontology()
        assert (NS.FacadeSystem, NS.labellableRoot, Literal(False)) in g

    def test_metadata_is_non_labellable(self) -> None:
        """Metadata class has labellableRoot false."""
        g = load_ontology()
        assert (NS.Metadata, NS.labellableRoot, Literal(False)) in g

    def test_facade_cladding_is_labellable(self) -> None:
        """FacadeCladding class has labellableRoot true."""
        g = load_ontology()
        assert (NS.FacadeCladding, NS.labellableRoot, Literal(True)) in g

    def test_drawing_element_exists(self) -> None:
        """DrawingElement class is defined in ontology."""
        g = load_ontology()
        assert (NS.DrawingElement, RDF.type, OWL.Class) in g

    def test_facade_system_is_subclass_of_drawing_element(self) -> None:
        """FacadeSystem is a subclass of DrawingElement."""
        g = load_ontology()
        subclasses = list(g.objects(NS.FacadeSystem, RDFS.subClassOf))
        assert NS.DrawingElement in subclasses


class TestOntologyExport:
    """Tests for the ontology export/visualizer script."""

    def test_export_generates_html(self) -> None:
        """Export script generates visualizer HTML file."""
        from Visualizer.convert_to_html_view import load_and_export, generate_html

        nodes, edges = load_and_export()
        html = generate_html(nodes, edges)

        assert len(nodes) > 0, "Should export nodes"
        assert len(edges) > 0, "Should export edges"
        assert "vis-network" in html, "HTML should include vis-network"
        assert "labellable" in html.lower(), "HTML should include labellable filter"

    def test_export_nodes_include_labellable_root(self) -> None:
        """Exported nodes include labellableRoot attribute."""
        from Visualizer.convert_to_html_view import load_and_export

        nodes, _ = load_and_export()
        facade_cladding = next((n for n in nodes if n["id"] == "FacadeCladding"), None)
        assert facade_cladding is not None
        assert facade_cladding["labellableRoot"] is True

        note = next((n for n in nodes if n["id"] == "Note"), None)
        assert note is not None
        assert note["labellableRoot"] is True

        metadata = next((n for n in nodes if n["id"] == "Metadata"), None)
        assert metadata is not None
        assert metadata["labellableRoot"] is False
