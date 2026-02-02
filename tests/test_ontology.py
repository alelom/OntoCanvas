"""Tests for the AEC drawing ontology."""

from pathlib import Path

import pytest
from rdflib import Graph, Literal, Namespace, OWL, RDF, RDFS

# Path to ontology relative to project root
ONTOLOGY_PATH = Path(__file__).resolve().parent.parent / "ontology" / "aec_drawing_ontology.ttl"
NS = Namespace("http://example.org/aec-drawing-ontology#")


def load_ontology() -> Graph:
    """Load and parse the ontology from Turtle format."""
    g = Graph()
    g.parse(ONTOLOGY_PATH, format="turtle")
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
        assert len(labellable_true) == 172, f"Expected 172 labellable classes, got {len(labellable_true)}"

    def test_labellable_root_false_count(self) -> None:
        """Expected number of classes have labellableRoot false (Note, TextualNote, Legend)."""
        g = load_ontology()
        labellable_false = [
            s for s, o in g.subject_objects(NS.labellableRoot) if o == Literal(False)
        ]
        assert len(labellable_false) == 3, f"Expected 3 non-labellable classes, got {len(labellable_false)}"

    def test_note_is_non_labellable(self) -> None:
        """Note class has labellableRoot false."""
        g = load_ontology()
        assert (NS.Note, NS.labellableRoot, Literal(False)) in g

    def test_textual_note_is_non_labellable(self) -> None:
        """TextualNote class has labellableRoot false."""
        g = load_ontology()
        assert (NS.TextualNote, NS.labellableRoot, Literal(False)) in g

    def test_legend_is_non_labellable(self) -> None:
        """Legend class has labellableRoot false."""
        g = load_ontology()
        assert (NS.Legend, NS.labellableRoot, Literal(False)) in g

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
