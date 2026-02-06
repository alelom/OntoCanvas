#!/usr/bin/env python3
"""Scan all Cursor workspaces for prompts and generations."""
import json
import sqlite3
from pathlib import Path

STORAGE = Path.home() / "AppData" / "Roaming" / "Cursor" / "User" / "workspaceStorage"

def main():
    all_prompts = []
    all_generations = []
    
    for ws_dir in STORAGE.iterdir():
        if not ws_dir.is_dir():
            continue
        db = ws_dir / "state.vscdb"
        if not db.exists():
            continue
        try:
            ws = json.loads((ws_dir / "workspace.json").read_text())
            folder = ws.get("folder", "?")
        except:
            folder = "?"
        
        conn = sqlite3.connect(str(db))
        cur = conn.cursor()
        
        # prompts
        try:
            cur.execute("SELECT value FROM ItemTable WHERE key = 'aiService.prompts'")
            r = cur.fetchone()
            if r and r[0]:
                data = json.loads(r[0])
                for item in data:
                    if isinstance(item, dict) and "text" in item:
                        all_prompts.append((folder, item["text"], "prompt"))
        except: pass
        
        # generations
        try:
            cur.execute("SELECT value FROM ItemTable WHERE key = 'aiService.generations'")
            r = cur.fetchone()
            if r and r[0]:
                data = json.loads(r[0])
                for item in data:
                    if isinstance(item, dict) and "textDescription" in item:
                        all_generations.append((folder, item["textDescription"], item.get("unixMs")))
        except: pass
        
        conn.close()
    
    print(f"Total prompts: {len(all_prompts)}")
    print(f"Total generations: {len(all_generations)}")
    for f, t, ts in all_generations[:5]:
        print(f"  [{f}] {t[:80]}...")
    
    # Save
    out = Path(__file__).parent.parent / "all_cursor_prompts.txt"
    with open(out, "w", encoding="utf-8") as f:
        for i, (folder, text, _) in enumerate(all_prompts, 1):
            f.write(f"--- Prompt {i} ({folder}) ---\n{text}\n\n")
        for i, (folder, text, ts) in enumerate(all_generations, len(all_prompts)+1):
            f.write(f"--- Generation {i} ({folder}) ---\n{text}\n\n")
    print(f"Saved to {out}")

if __name__ == "__main__":
    main()
