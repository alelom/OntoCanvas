#!/usr/bin/env python3
"""
E2E test for Editor delete and undo behavior.

Reproduces: Delete "Drawing content" -> Interface should remain floating -> Undo should restore both.

Requires: dev server running (npm run dev) and ontology file at ontology/aec_drawing_ontology.ttl
Run: uv run python Editor/tests/test_editor_delete_e2e.py
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

EDITOR_URL = "http://localhost:5173/"
ONTOLOGY_PATH = Path(__file__).resolve().parent.parent.parent / "ontology" / "aec_drawing_ontology.ttl"


def run_delete_test(page, use_search: bool) -> None:
    """Run delete+undo test. use_search=True simulates user searching first."""
    if use_search:
        search_input = page.locator("input#searchQuery")
        search_input.fill("Drawing content")
        page.wait_for_timeout(200)
        neighbors_cb = page.locator("#searchIncludeNeighbors")
        if not neighbors_cb.is_checked():
            neighbors_cb.check()
        page.wait_for_timeout(200)

    select_ok = page.evaluate("() => window.__EDITOR_TEST__.selectNodeByLabel('Drawing content')")
    assert select_ok, "Failed to select Drawing content node"
    page.keyboard.press("Delete")
    page.wait_for_timeout(300)

    node_ids_after = page.evaluate("() => window.__EDITOR_TEST__.getNodeIds()")
    visible_count = page.evaluate("() => window.__EDITOR_TEST__.getVisibleNodeCount()")
    assert "DrawingContent" not in node_ids_after, "DrawingContent should be deleted"
    assert "Interface" in node_ids_after, "Interface should remain floating"
    assert visible_count == len(node_ids_after), (
        f"Display shows {visible_count} nodes but rawData has {len(node_ids_after)}"
    )

    page.evaluate("() => window.__EDITOR_TEST__.performUndo()")
    page.wait_for_timeout(300)
    node_ids_after_undo = page.evaluate("() => window.__EDITOR_TEST__.getNodeIds()")
    assert "DrawingContent" in node_ids_after_undo, "Undo should restore DrawingContent"
    assert "Interface" in node_ids_after_undo, "Undo should restore Interface"


def main() -> None:
    assert ONTOLOGY_PATH.exists(), f"Ontology not found: {ONTOLOGY_PATH}"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto(EDITOR_URL, wait_until="domcontentloaded", timeout=10000)

        # Expose test hook - it's set by the app
        test = page.evaluate("() => window.__EDITOR_TEST__")
        assert test is not None, "Editor test hook not found - ensure app is loaded"

        # Clear IndexedDB display config so we test with fresh state (no saved search/filters)
        try:
            page.evaluate("async () => { await window.__EDITOR_TEST__.clearDisplayConfig(); }")
            page.wait_for_timeout(100)
        except Exception:
            pass  # IndexedDB may not exist yet

        # Load ontology via file input
        page.locator("input#fileInput").evaluate("el => el.style.display = 'block'")
        page.locator("input#fileInput").set_input_files(str(ONTOLOGY_PATH))

        # Wait for graph to render
        page.wait_for_function(
            "document.getElementById('nodeCount')?.textContent !== '0'",
            timeout=15000,
        )
        page.wait_for_timeout(500)

        node_ids_before = page.evaluate("() => window.__EDITOR_TEST__.getNodeIds()")
        assert "DrawingContent" in node_ids_before, "DrawingContent should exist"
        assert "Interface" in node_ids_before, "Interface should exist"

        # Scenario 1: With search (user searched to find the node)
        run_delete_test(page, use_search=True)

        # Reload and test Scenario 2: Without search (user panned to find the node)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        page.locator("input#fileInput").evaluate("el => el.style.display = 'block'")
        page.locator("input#fileInput").set_input_files(str(ONTOLOGY_PATH))
        page.wait_for_function(
            "document.getElementById('nodeCount')?.textContent !== '0'",
            timeout=15000,
        )
        page.wait_for_timeout(500)

        run_delete_test(page, use_search=False)

        browser.close()
    print("E2E test passed: delete preserves children, undo restores correctly")


if __name__ == "__main__":
    main()
