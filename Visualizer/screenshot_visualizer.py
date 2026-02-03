#!/usr/bin/env python3
"""Capture a screenshot of the visualizer HTML."""

from pathlib import Path

from playwright.sync_api import sync_playwright

VISUALIZER_HTML = Path(__file__).resolve().parent / "visualizer.html"
OUTPUT_PNG = Path(__file__).resolve().parent / "visualizer_screenshot.png"


def main() -> None:
    url = VISUALIZER_HTML.as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto(url, wait_until="networkidle")
        # Wait for graph to render (node count > 0)
        page.wait_for_function(
            "document.getElementById('nodeCount')?.textContent !== '0'",
            timeout=10000,
        )
        page.wait_for_timeout(500)  # Allow fit() to complete
        page.screenshot(path=OUTPUT_PNG, full_page=True)
        browser.close()
    print(f"Screenshot saved to {OUTPUT_PNG}")


if __name__ == "__main__":
    main()
