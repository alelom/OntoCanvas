#!/usr/bin/env python3
"""Capture a screenshot of the Editor (requires dev server running)."""

from pathlib import Path

from playwright.sync_api import sync_playwright

EDITOR_URL = "http://localhost:5173/"
OUTPUT_PNG = Path(__file__).resolve().parent / "editor_screenshot.png"
ONTOLOGY_PATH = Path(__file__).resolve().parent.parent / "ontology" / "aec_drawing_ontology.ttl"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto(EDITOR_URL, wait_until="networkidle")
        # Select TTL file via picker to load the ontology
        with page.expect_file_chooser() as fc_info:
            page.get_by_role("button", name="Select TTL file...").click()
        fc_info.value.set_files(str(ONTOLOGY_PATH))
        # Wait for graph to render (node count > 0)
        page.wait_for_function(
            "document.getElementById('nodeCount')?.textContent !== '0'",
            timeout=15000,
        )
        page.wait_for_timeout(500)  # Allow initial fit() to complete
        # Click Reset view to ensure full graph is visible
        page.get_by_role("button", name="Reset view").click()
        page.wait_for_timeout(500)
        page.screenshot(path=OUTPUT_PNG, full_page=True)
        browser.close()
    print(f"Screenshot saved to {OUTPUT_PNG}")


if __name__ == "__main__":
    main()
