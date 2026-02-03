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
        page.wait_for_timeout(800)  # Allow vis-network to render and fit
        page.screenshot(path=OUTPUT_PNG, full_page=True)
        browser.close()
    print(f"Screenshot saved to {OUTPUT_PNG}")


if __name__ == "__main__":
    main()
