#!/usr/bin/env python3
"""
Extract user prompts from Cursor's chat history (state.vscdb).
Scans all workspaces. Uses built-in sqlite3 and json - no extra deps.

Usage:
  python scripts/extract_cursor_chat.py                    # all prompts, this project
  python scripts/extract_cursor_chat.py --all               # all workspaces
  python scripts/extract_cursor_chat.py --limit 100        # first 100
  python scripts/extract_cursor_chat.py --project kg      # filter by project name
  python scripts/extract_cursor_chat.py --backup           # use state.vscdb.backup

Note: AI response summaries are NOT stored in Cursor's database. Only user prompts
and generation metadata are persisted. The "summary of performed actions" cannot
be recovered from local storage.
"""
import json
import sqlite3
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

CURSOR_STORAGE = Path.home() / "AppData" / "Roaming" / "Cursor" / "User" / "workspaceStorage"
KG_WORKSPACE_ID = "a54d103bb557b782020ef324e480e799"


@dataclass
class PromptEntry:
    text: str
    folder: str
    unix_ms: Optional[int]
    source: str  # "prompt" or "generation"


def extract_from_workspace(ws_dir: Path, use_backup: bool = False) -> list[PromptEntry]:
    db = ws_dir / ("state.vscdb.backup" if use_backup else "state.vscdb")
    if not db.exists():
        return []

    try:
        ws = json.loads((ws_dir / "workspace.json").read_text(encoding="utf-8"))
        folder = ws.get("folder", "?")
    except Exception:
        folder = "?"

    entries: list[PromptEntry] = []
    conn = sqlite3.connect(str(db))
    cur = conn.cursor()

    # aiService.prompts - Chat prompts
    try:
        cur.execute("SELECT value FROM ItemTable WHERE key = 'aiService.prompts'")
        row = cur.fetchone()
        if row and row[0]:
            data = json.loads(row[0])
            for i, item in enumerate(data):
                if isinstance(item, dict) and "text" in item and isinstance(item["text"], str):
                    t = item["text"].strip()
                    if t:
                        entries.append(PromptEntry(t, folder, None, "prompt"))
    except Exception:
        pass

    # aiService.generations - Composer prompts (more history)
    try:
        cur.execute("SELECT value FROM ItemTable WHERE key = 'aiService.generations'")
        row = cur.fetchone()
        if row and row[0]:
            data = json.loads(row[0])
            for item in data:
                if isinstance(item, dict) and "textDescription" in item:
                    t = item["textDescription"].strip()
                    if t:
                        entries.append(
                            PromptEntry(
                                t,
                                folder,
                                item.get("unixMs"),
                                "generation",
                            )
                        )
    except Exception:
        pass

    conn.close()
    return entries


def main():
    args = sys.argv[1:]
    use_backup = "--backup" in args
    all_workspaces = "--all" in args
    limit: Optional[int] = None
    project_filter: Optional[str] = None

    i = 0
    while i < len(args):
        a = args[i]
        if a.startswith("--limit="):
            limit = int(a.split("=", 1)[1])
        elif a == "--limit":
            if i + 1 < len(args):
                limit = int(args[i + 1])
                i += 1  # skip value
        elif a.startswith("--project="):
            project_filter = a.split("=", 1)[1].lower()
        elif a == "--project":
            if i + 1 < len(args):
                project_filter = args[i + 1].lower()
                i += 1  # skip value
        i += 1

    all_entries: list[PromptEntry] = []

    if all_workspaces:
        for ws_dir in CURSOR_STORAGE.iterdir():
            if ws_dir.is_dir():
                all_entries.extend(extract_from_workspace(ws_dir, use_backup))
    else:
        # Just kg-data-processor workspace
        ws_dir = CURSOR_STORAGE / KG_WORKSPACE_ID
        if ws_dir.exists():
            all_entries = extract_from_workspace(ws_dir, use_backup)
        else:
            print("kg-data-processor workspace not found", file=sys.stderr)
            sys.exit(1)

    # Filter by project
    if project_filter:
        all_entries = [e for e in all_entries if project_filter in e.folder.lower()]

    # Sort: entries with timestamp first (by time desc), then rest
    with_ts = [(e, e.unix_ms or 0) for e in all_entries if e.unix_ms]
    without_ts = [e for e in all_entries if not e.unix_ms]
    with_ts.sort(key=lambda x: -x[1])  # newest first
    sorted_entries = [e for e, _ in with_ts] + without_ts

    # Dedupe by text (keep first occurrence)
    seen: set[str] = set()
    unique: list[PromptEntry] = []
    for e in sorted_entries:
        if e.text and len(e.text) > 3 and e.text not in seen:
            seen.add(e.text)
            unique.append(e)

    if limit:
        unique = unique[:limit]

    out_path = Path(__file__).parent.parent / "cursor_prompts_recovered.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(
            "# Cursor prompts recovered from state.vscdb\n"
            "# Note: AI response summaries are NOT stored by Cursor and cannot be recovered.\n\n"
        )
        for i, e in enumerate(unique, 1):
            short_folder = e.folder.split("/")[-1].split("%2F")[-1] if "/" in e.folder else e.folder
            f.write(f"--- Prompt {i} [{short_folder}] ---\n")
            f.write(e.text)
            f.write("\n\n")

    print(f"Extracted {len(unique)} prompts to: {out_path}")
    if not all_workspaces and len(unique) < 100:
        print("Tip: Use --all to scan all workspaces for more prompts.")


if __name__ == "__main__":
    main()
